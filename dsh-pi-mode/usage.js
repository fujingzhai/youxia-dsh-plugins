import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import manifest from './package.json' with { type: 'json' }
import { currentSettings } from './settings.js'
import { chinaDay, modeBits, usageUrl, weekStart } from './usage-format.js'

export const name = 'pi-mode-usage'
const route = '/dsh-pi-mode/settings'
const codeModeBit = 8

function weeklyCode(file) {
  let seed
  return day => {
    if (!seed) {
      try { writeFileSync(file, randomBytes(32), { flag: 'wx', mode: 0o600 }) }
      catch (error) { if (error.code !== 'EEXIST') throw error }
      const stored = readFileSync(file)
      if (stored.length !== 32) throw new Error('DSH-Pi usage seed is unreadable')
      seed = stored
    }
    return createHmac('sha256', seed).update('dsh-pi-mode/' + weekStart(day)).digest('hex').slice(0, 32)
  }
}

export function createReporter({ enabled, code, now = Date.now, post = fetch }) {
  let day, flags = 0, sent = 0, retryAt = 0, inFlight

  function flush() {
    if (!enabled() || inFlight || sent === flags || now() < retryAt) return
    const controller = new AbortController()
    const activeDay = day, snapshot = flags
    inFlight = controller
    void Promise.resolve().then(async () => {
      if (!enabled() || controller.signal.aborted || chinaDay(now()) !== activeDay) return
      const payload = {
        day: activeDay, version: manifest.version, weekCode: code(activeDay),
        modes: Object.keys(modeBits).filter(mode => snapshot & modeBits[mode]),
        codeMode: Boolean(snapshot & codeModeBit),
      }
      const response = await post(usageUrl, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload), credentials: 'omit', redirect: 'error',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
      })
      if (!response.ok) throw new Error('Usage upload failed')
      if (inFlight === controller && day === activeDay) sent |= snapshot
    }).catch(() => {
      if (inFlight === controller) retryAt = now() + 60_000
    }).finally(() => {
      if (inFlight !== controller) return
      inFlight = undefined
      if (chinaDay(now()) === day) flush()
    })
  }

  function clear() {
    inFlight?.abort()
    inFlight = undefined
    flags = sent = retryAt = 0
  }

  return {
    clear,
    record(mode, codeMode = false) {
      if (!enabled() || !Object.hasOwn(modeBits, mode)) return
      const today = chinaDay(now())
      if (day !== today) {
        clear()
        day = today
      }
      flags |= modeBits[mode]
      if (mode === 'pi-plus' && codeMode) flags |= codeModeBit
      flush()
    },
  }
}

function reply(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(data))
}

async function settingChange(req) {
  if (req.headers['content-type'] !== 'application/json' || req.headers['x-dsh-pi-settings'] !== '1') return undefined
  let text = '', size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > 256) return undefined
      text += chunk.toString('utf8')
    }
    const change = JSON.parse(text)
    if (!change || typeof change !== 'object' || Object.keys(change).length !== 1) return undefined
    if (typeof change.shareUsage === 'boolean' || typeof change.progressReminder === 'boolean' || change.usageNoticeSeen === true) return change
  } catch { /* Invalid request. */ }
  return undefined
}

function settingsRoute(ctx, globalOff) {
  return async (req, res, peer) => {
    // 0.2.3 already admitted the request. Older hosts require the same owner check here.
    const admitted = peer === undefined ? ctx.connection.admit(req)?.peer : peer
    if (admitted?.principal?.kind !== 'owner') return reply(res, 403, { error: 'forbidden' })
    if (!currentSettings()) return reply(res, 503, { error: 'unavailable' })
    if (req.method === 'PATCH') {
      const change = await settingChange(req)
      if (!change) return reply(res, 400, { error: 'invalid' })
      const { edit } = currentSettings() ?? {}
      if (!edit) return reply(res, 503, { error: 'unavailable' })
      try { await edit(change) }
      catch { return reply(res, 409, { error: 'save_failed' }) }
    } else if (req.method !== 'GET') return reply(res, 405, { error: 'method' })
    const settings = currentSettings()
    if (!settings) return reply(res, 503, { error: 'unavailable' })
    return reply(res, 200, {
      shareUsage: settings.shareUsage && !globalOff,
      showNotice: settings.shareUsage && !globalOff && !settings.usageNoticeSeen && Boolean(settings.edit),
      progressReminder: settings.progressReminder, editable: Boolean(settings.edit), globalOff,
    })
  }
}

export function apply(ctx, config) {
  const mode = config?.mode
  if (Object.hasOwn(modeBits, mode)) {
    ctx.on('agent/pre-step', async ({ step, signal }, next) => {
      const decision = await next()
      if (step === 1 && decision.kind === 'enter' && !signal.aborted) ctx.get('piModeUsage')?.record(mode)
      return decision
    })
    return
  }
  const profile = ctx.get('profileContext')
  if (!profile?.dir) return
  const globalOff = () => Boolean(profile.telemetryDisabledEnv || process.env.DSH_TELEMETRY_DISABLED)
  const reporter = createReporter({
    enabled: () => !globalOff() && Boolean(currentSettings()?.shareUsage && currentSettings()?.usageNoticeSeen),
    code: weeklyCode(join(profile.dir, 'dsh-pi-usage.key')),
  })
  ctx.provide('piModeUsage', reporter)
  ctx.on('pi-mode/settings-change', () => {
    if (currentSettings()?.shareUsage === false) reporter.clear()
  })
  ctx.effect(() => reporter.clear)
  ctx.inject(['webServer', 'connection'], scoped => {
    scoped.effect(() => scoped.webServer.register({ kind: 'exact', path: route, handler: settingsRoute(scoped, globalOff()) }))
  })
}
