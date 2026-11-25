import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { createReporter } from '../usage.js'
import { chinaDay, usageUrl, weekStart } from '../usage-format.js'
import worker, { maintain } from '../usage-worker/index.js'

test('统计只发送约定字段，合并多个模式，关闭时取消待发', async () => {
  let time = Date.parse('2026-11-29T15:59:00Z'), enabled = false
  const requests = []
  const reporter = createReporter({
    enabled: () => enabled,
    code: day => weekStart(day), now: () => time,
    post(url, options) {
      assert.equal(url, usageUrl)
      const body = JSON.parse(options.body)
      requests.push({ body, signal: options.signal })
      return new Promise(resolve => { requests.at(-1).resolve = resolve })
    },
  })
  reporter.record('pi')
  await setImmediate()
  assert.equal(requests.length, 0)
  enabled = true
  reporter.record('pi')
  await setImmediate()
  assert.deepEqual(Object.keys(requests[0].body).sort(), ['codeMode', 'day', 'modes', 'version', 'weekCode'])
  assert.deepEqual(requests[0].body.modes, ['pi'])
  reporter.record('pi-plus', true)
  reporter.record('pi-im')
  requests[0].resolve({ ok: true })
  await setImmediate()
  assert.deepEqual(requests[1].body.modes, ['pi', 'pi-plus', 'pi-im'])
  assert.equal(requests[1].body.codeMode, true)
  enabled = false
  reporter.clear()
  assert.equal(requests[1].signal.aborted, true)
  requests[1].resolve({ ok: true })
  time += 60_000
  enabled = true
  reporter.record('pi-im')
  await setImmediate()
  assert.deepEqual(requests[2].body.modes, ['pi-im'])
  assert.equal(requests[2].body.codeMode, false)
  assert.equal(requests[2].body.weekCode, '2026-11-30')
  requests[2].resolve({ ok: true })
  await setImmediate()
  reporter.record('pi-im')
  await setImmediate()
  assert.equal(requests.length, 3)
})

test('接收端拒收额外字段，重复与升级按安装去重，过期明细归档', async () => {
  const sql = new DatabaseSync(':memory:')
  try {
    sql.exec(readFileSync(new URL('../usage-worker/schema.sql', import.meta.url), 'utf8'))
    const DB = {
      prepare(query) {
        const statement = sql.prepare(query)
        return { bind: (...args) => ({ run: () => statement.run(...args) }) }
      },
      async batch(statements) { for (const statement of statements) statement.run() },
    }
    const day = chinaDay(Date.now())
    const payload = { day, version: '0.5.5', weekCode: 'a'.repeat(32), modes: ['pi'], codeMode: false }
    const accept = data => worker.fetch(new Request(usageUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), { DB })
    assert.equal((await accept({ ...payload, session: 'must not be stored' })).status, 400)
    assert.equal((await accept({ ...payload, codeMode: true })).status, 400)
    assert.equal((await accept({ ...payload, weekCode: 'a'.repeat(400) })).status, 400)
    assert.equal((await accept(payload)).status, 204)
    assert.equal((await accept({ ...payload, modes: ['pi-plus'], codeMode: true })).status, 204)
    assert.equal((await accept(payload)).status, 204)
    assert.equal((await accept({ ...payload, version: '0.5.6', modes: ['pi-im'] })).status, 204)
    const stats = () => sql.prepare("SELECT active, pi, pi_plus, pi_im, code_mode FROM usage_stats WHERE period = 'week' AND version = ''").get()
    const expected = { active: 1, pi: 1, pi_plus: 1, pi_im: 1, code_mode: 1 }
    assert.deepEqual({ ...stats() }, expected)
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM usage_day').get().n, 2)
    await maintain(DB, chinaDay(Date.now() + 15 * 86_400_000))
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM usage_day').get().n, 0)
    assert.deepEqual({ ...stats() }, expected)
  } finally { sql.close() }
})
