import { chinaDay, modeBits, weekStart } from '../usage-format.js'

const fields = ['day', 'version', 'weekCode', 'modes', 'codeMode']
const maxBytes = 384
const response = status => new Response(null, { status, headers: { 'cache-control': 'no-store' } })

async function readPayload(request) {
  const reader = request.body?.getReader()
  if (!reader) return undefined
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return JSON.parse(text + decoder.decode())
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        return undefined
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return undefined
  } finally {
    reader.releaseLock()
  }
}

function validate(payload, today) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0
  if (Object.keys(payload).length !== fields.length || !fields.every(key => Object.hasOwn(payload, key))) return 0
  const { day, version, weekCode, modes, codeMode } = payload
  if (day !== today || typeof version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)) return 0
  if (typeof weekCode !== 'string' || !/^[0-9a-f]{32}$/.test(weekCode) || typeof codeMode !== 'boolean') return 0
  if (!Array.isArray(modes) || modes.length < 1 || modes.length > 3 || new Set(modes).size !== modes.length) return 0
  if (!modes.every(mode => typeof mode === 'string' && Object.hasOwn(modeBits, mode))) return 0
  if (codeMode && !modes.includes('pi-plus')) return 0
  return modes.reduce((bits, mode) => bits | modeBits[mode], 0)
}

const upsert = `INSERT INTO usage_day (day, week, week_code, version, modes, code_mode)
VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (day, week_code, version) DO UPDATE
SET modes = usage_day.modes | excluded.modes, code_mode = MAX(usage_day.code_mode, excluded.code_mode)
WHERE (usage_day.modes & excluded.modes) != excluded.modes OR usage_day.code_mode < excluded.code_mode`

export async function maintain(db, today) {
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO usage_archive SELECT * FROM usage_live
      WHERE (period = 'day' AND starts < ?) OR (period = 'week' AND starts < ?)`)
      .bind(today, weekStart(today)),
    db.prepare("DELETE FROM usage_day WHERE day <= date(?, '-14 days')").bind(today),
  ])
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    if (path === '/health' && request.method === 'GET') return response(204)
    if (path !== '/v1/usage') return response(404)
    if (request.method !== 'POST') return response(405)
    if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return response(415)
    const ip = request.headers.get('cf-connecting-ip')
    if (ip && !(await env.INGEST_LIMIT.limit({ key: ip })).success) return response(429)
    const today = chinaDay(Date.now())
    const payload = await readPayload(request)
    const modes = validate(payload, today)
    if (!modes) return response(400)
    await env.DB.prepare(upsert).bind(today, weekStart(today), payload.weekCode, payload.version, modes, Number(payload.codeMode)).run()
    return response(204)
  },
  async scheduled(_event, env) {
    await maintain(env.DB, chinaDay(Date.now()))
  },
}
