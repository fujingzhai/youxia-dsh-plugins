import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { setImmediate } from 'node:timers/promises'
import vm from 'node:vm'
import { apply as applySettings, currentSettings } from '../settings.js'
import { createReporter, rejectRequest, settingsRoute } from '../usage.js'
import { chinaDay, usageUrl, weekStart } from '../usage-format.js'
import worker, { maintain } from '../usage-worker/index.js'

const SETTINGS_KEY = Symbol.for('dsh-pi-mode.settings')

function loadClientModule() {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  let loaded
  const sandbox = {
    window: {
      __ModuleLoader__: {
        load(registration) { loaded = registration },
      },
    },
    fetch: () => Promise.reject(new Error('unexpected global fetch')),
  }
  vm.runInNewContext(source, sandbox, { filename: 'client.js' })
  assert.equal(loaded?.id, 'dsh-pi-mode')
  const React = { createElement() { return null } }
  return loaded.factory(name => {
    if (name === 'react') return React
    throw new Error('Unexpected require: ' + name)
  })
}

function mockReq(method, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

function mockRes() {
  let status, headers, body = ''
  return {
    writeHead(code, hdrs) { status = code; headers = hdrs },
    end(text = '') { body += text },
    get status() { return status },
    get headers() { return headers },
    json() { return JSON.parse(body) },
  }
}

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
    const payload = { day, version: '0.5.6', weekCode: 'a'.repeat(32), modes: ['pi'], codeMode: false }
    const accept = data => worker.fetch(new Request(usageUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), { DB })
    assert.equal((await accept({ ...payload, session: 'must not be stored' })).status, 400)
    assert.equal((await accept({ ...payload, codeMode: true })).status, 400)
    assert.equal((await accept({ ...payload, weekCode: 'a'.repeat(400) })).status, 400)
    assert.equal((await accept(payload)).status, 204)
    assert.equal((await accept({ ...payload, modes: ['pi-plus'], codeMode: true })).status, 204)
    assert.equal((await accept(payload)).status, 204)
    assert.equal((await accept({ ...payload, version: '0.5.7', modes: ['pi-im'] })).status, 204)
    const stats = () => sql.prepare("SELECT active, pi, pi_plus, pi_im, code_mode FROM usage_stats WHERE period = 'week' AND version = ''").get()
    const expected = { active: 1, pi: 1, pi_plus: 1, pi_im: 1, code_mode: 1 }
    assert.deepEqual({ ...stats() }, expected)
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM usage_day').get().n, 2)
    await maintain(DB, chinaDay(Date.now() + 15 * 86_400_000))
    assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM usage_day').get().n, 0)
    assert.deepEqual({ ...stats() }, expected)
  } finally { sql.close() }
})

test('设置接口兼容 0.2.2 与 0.2.3 认证，不暴露静默提醒开关并串行化写入', async () => {
  const req = mockReq('GET')
  assert.equal(rejectRequest(undefined, req, { principal: { kind: 'owner' } }), undefined)
  assert.equal(rejectRequest(undefined, req, { principal: { kind: 'guest' } }), 403)
  assert.equal(rejectRequest({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }, req), undefined)
  assert.equal(rejectRequest({ admit: () => ({ rejection: 401 }) }, req), 401)
  assert.equal(rejectRequest({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) }, req), 403)
  assert.equal(rejectRequest({ requestRejection: () => 403 }, req), 403)
  assert.equal(rejectRequest({ requestRejection: () => undefined }, req), undefined)
  assert.equal(rejectRequest({}, req), 503)

  const previous = globalThis[SETTINGS_KEY]
  let currentConfig = { deny: [], imDeny: [], progressReminder: true }
  let activeEntry = { options: { id: 'pi-mode-settings', name: 'dsh-pi-mode/settings.js' } }
  let disposer = () => {}
  let editCalls = 0
  let releaseFirstEdit

  const editor = {
    entries: () => [activeEntry],
    async edit(entry, updater) {
      assert.equal(entry, activeEntry, '并发写入须在上一轮重载后重新取最新 entry')
      editCalls++
      const next = updater({ ...currentConfig })
      if (editCalls === 1) await new Promise(resolve => { releaseFirstEdit = resolve })
      currentConfig = next
      // 模拟 configEditor 重载插件条目并替换 entry 引用。
      disposer()
      activeEntry = { options: { id: 'pi-mode-settings', name: 'dsh-pi-mode/settings.js' } }
      mount(currentConfig)
    },
  }

  function mount(config) {
    applySettings({
      get: name => name === 'configEditor' ? editor : undefined,
      effect: fn => { disposer = fn() },
      emit() {},
    }, config)
  }

  try {
    mount(currentConfig)
    assert.equal(currentSettings().usageNoticeSeen, false)
    let globalOff = false
    const handler = settingsRoute({ get: () => undefined }, () => globalOff)
    const owner = { principal: { kind: 'owner' } }
    const patchHeaders = { 'content-type': 'application/json; charset=utf-8', 'x-dsh-pi-settings': '1' }

    const initial = mockRes()
    await handler(mockReq('GET'), initial, owner)
    assert.equal(initial.status, 200)
    assert.deepEqual(initial.json(), { shareUsage: true, showNotice: true, editable: true, globalOff: false })
    assert.equal('progressReminder' in initial.json(), false)

    // 不再通过插件页接口修改 progressReminder，也不允许把 usageNoticeSeen 重置为 false。
    for (const invalidBody of [{ progressReminder: false }, { usageNoticeSeen: false }, { shareUsage: true, extra: 1 }]) {
      const res = mockRes()
      await handler(mockReq('PATCH', invalidBody, patchHeaders), res, owner)
      assert.equal(res.status, 400)
    }

    // 两个并发 PATCH（如自动标记已看 + 用户点关闭统计）应串行完成，不因旧 entry 报 409。
    const ackRes = mockRes()
    const offRes = mockRes()
    const first = handler(mockReq('PATCH', { usageNoticeSeen: true }, patchHeaders), ackRes, owner)
    const second = handler(mockReq('PATCH', { shareUsage: false }, patchHeaders), offRes, owner)
    await setImmediate()
    releaseFirstEdit()
    await Promise.all([first, second])
    assert.equal(ackRes.status, 200)
    assert.equal(offRes.status, 200)
    assert.deepEqual(offRes.json(), { shareUsage: false, showNotice: false, editable: true, globalOff: false })
    assert.equal(currentConfig.shareUsage, false)
    assert.equal(currentConfig.usageNoticeSeen, true)

    // 已经标记看过后，重复的 usageNoticeSeen 确认不再重复写盘。
    const callsBefore = editCalls
    const dupRes = mockRes()
    await handler(mockReq('PATCH', { usageNoticeSeen: true }, patchHeaders), dupRes, owner)
    assert.equal(dupRes.status, 200)
    assert.equal(editCalls, callsBefore)

    // 显式写 shareUsage: false（例如从 0.5.5 升级而来）也视为已看过提示。
    disposer()
    mount({ deny: [], imDeny: [], progressReminder: true, shareUsage: false })
    assert.equal(currentSettings().usageNoticeSeen, true)

    // DSH_TELEMETRY_DISABLED 生效时动态反映到接口。
    globalOff = true
    const offByEnv = mockRes()
    await handler(mockReq('GET'), offByEnv, owner)
    assert.deepEqual(offByEnv.json(), { shareUsage: false, showNotice: false, editable: true, globalOff: true })
  } finally {
    disposer()
    if (previous === undefined) delete globalThis[SETTINGS_KEY]
    else globalThis[SETTINGS_KEY] = previous
  }
})

test('客户端文案明确插件归属与隐私边界，开关乐观更新不抖动，提示框仅出现一次', async () => {
  const client = loadClientModule()
  assert.match(client.text.zh.share, /Pi 模式插件/)
  assert.match(client.text.zh.defaultOn, /DSH-Pi/)
  assert.match(client.text.zh.details, /不收集.*隐私/)
  assert.match(client.text.en.share, /Pi Mode plugin/)
  assert.match(client.text.en.details, /No conversations.*personal data/)
  assert.equal('reminder' in client.text.zh, false)
  assert.equal('reminderHelp' in client.text.zh, false)

  // 1) 悬浮提示只弹出一次：后台落盘 usageNoticeSeen 后卡片仍停留，点知道了即时关闭且不再重弹。
  const calls = []
  let serverState = { shareUsage: true, showNotice: true, editable: true, globalOff: false }
  const ctrl = client.createController({
    async fetchImpl(url, options = {}) {
      assert.equal(url, '/dsh-pi-mode/settings')
      const body = options.body ? JSON.parse(options.body) : undefined
      calls.push({ method: options.method ?? 'GET', body })
      if (body?.usageNoticeSeen) serverState = { ...serverState, showNotice: false }
      if (typeof body?.shareUsage === 'boolean') serverState = { ...serverState, shareUsage: body.shareUsage, showNotice: false }
      return { ok: true, json: async () => ({ ...serverState }) }
    },
  })
  await ctrl.load()
  assert.equal(ctrl.openNoticeOnce(), true)
  assert.equal(ctrl.getSnapshot().noticeOpen, true)
  assert.equal(ctrl.openNoticeOnce(), false, '同一会话内不得重复打开')
  ctrl.ackNoticeInBackground()
  await setImmediate()
  assert.equal(ctrl.getSnapshot().data.showNotice, false)
  assert.equal(ctrl.getSnapshot().noticeOpen, true, '后台落盘后卡片仍应留在屏幕上供用户决定')
  const countBeforeDismiss = calls.length
  assert.equal(await ctrl.dismissNotice(), true)
  assert.equal(ctrl.getSnapshot().noticeOpen, false)
  assert.equal(calls.length, countBeforeDismiss, '已落盘后点知道了无需再次发请求')
  assert.equal(ctrl.openNoticeOnce(), false)

  // 2) 连续快速点击开关：立即乐观切换、不丢点击、合并中间态、失败时回滚。
  const pending = []
  let shouldFail = false
  const ctrl2 = client.createController({
    fetchImpl(_url, options = {}) {
      const body = options.body ? JSON.parse(options.body) : undefined
      return new Promise(resolve => pending.push({ method: options.method ?? 'GET', body, resolve }))
    },
  })
  const loadPromise = ctrl2.load()
  pending.shift().resolve({ ok: true, json: async () => ({ shareUsage: true, showNotice: false, editable: true, globalOff: false }) })
  await loadPromise

  ctrl2.toggleShareUsage(false)
  assert.equal(ctrl2.getSnapshot().optimistic, false)
  ctrl2.toggleShareUsage(true)
  assert.equal(ctrl2.getSnapshot().optimistic, true)
  assert.equal(pending.length, 1, '前一次写入未完成时串行排队，不并发冲突')
  assert.deepEqual(pending[0].body, { shareUsage: false })
  pending.shift().resolve({ ok: true, json: async () => ({ shareUsage: false, showNotice: false, editable: true, globalOff: false }) })
  await setImmediate()
  // 中间回包不会把乐观值抖回 false，随即发出最终意图 true。
  assert.equal(ctrl2.getSnapshot().optimistic, true)
  assert.equal(pending.length, 1)
  assert.deepEqual(pending[0].body, { shareUsage: true })
  pending.shift().resolve({ ok: true, json: async () => ({ shareUsage: true, showNotice: false, editable: true, globalOff: false }) })
  await setImmediate()
  assert.equal(ctrl2.getSnapshot().data.shareUsage, true)
  assert.equal(ctrl2.getSnapshot().optimistic, null)

  // OFF -> ON -> OFF 最终值与首包一致时跳过冗余的第二次写入。
  ctrl2.toggleShareUsage(false)
  ctrl2.toggleShareUsage(true)
  ctrl2.toggleShareUsage(false)
  pending.shift().resolve({ ok: true, json: async () => ({ shareUsage: false, showNotice: false, editable: true, globalOff: false }) })
  await setImmediate()
  assert.equal(pending.length, 0)
  assert.equal(ctrl2.getSnapshot().data.shareUsage, false)
  assert.equal(ctrl2.getSnapshot().optimistic, null)

  // 写入失败时回滚到服务端真实值并提示错误。
  shouldFail = true
  ctrl2.toggleShareUsage(true)
  assert.equal(ctrl2.getSnapshot().optimistic, true)
  pending.shift().resolve({ ok: !shouldFail, json: async () => ({}) })
  await setImmediate()
  assert.equal(ctrl2.getSnapshot().optimistic, null)
  assert.equal(ctrl2.getSnapshot().data.shareUsage, false)
  assert.equal(ctrl2.getSnapshot().settingsError, 'save')

  // 3) 提示框点「关闭统计」失败时保持可见并报错，重试成功后关闭。
  let failTurnOff = true
  const ctrl3 = client.createController({
    async fetchImpl(_url, options = {}) {
      if (!options.body) return { ok: true, json: async () => ({ shareUsage: true, showNotice: true, editable: true, globalOff: false }) }
      if (failTurnOff) return { ok: false, json: async () => ({ error: 'save_failed' }) }
      return { ok: true, json: async () => ({ shareUsage: false, showNotice: false, editable: true, globalOff: false }) }
    },
  })
  await ctrl3.load()
  assert.equal(ctrl3.openNoticeOnce(), true)
  assert.equal(await ctrl3.turnOffFromNotice(), false)
  assert.equal(ctrl3.getSnapshot().noticeOpen, true)
  assert.equal(ctrl3.getSnapshot().noticeError, true)
  failTurnOff = false
  assert.equal(await ctrl3.turnOffFromNotice(), true)
  assert.equal(ctrl3.getSnapshot().noticeOpen, false)
  assert.equal(ctrl3.getSnapshot().data.shareUsage, false)
})
