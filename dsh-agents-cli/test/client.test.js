import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
function harness() {
  const requests = [], terminals = [], frames = new Map(), tags = new Map()
  let frameId = 0, plugin, dark = false
  class Node {
    constructor() { this.children = []; this.dataset = {}; this.clientWidth = 900; this.clientHeight = 600; this.parentNode = null }
    appendChild(node) { node.remove(); this.children.push(node); node.parentNode = this; if (node.id) tags.set(node.id, node); return node }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((node) => node !== this); this.parentNode = null; if (this.id) tags.delete(this.id) }
    hasAttribute(name) { return name === 'data-ds-dark-theme' && dark }
  }
  class Terminal {
    constructor(options) { this.options = options; this.cols = 80; this.rows = 24; this.writes = []; terminals.push(this) }
    loadAddon() {}
    open(node) { this.node = node }
    onData(fn) { this.send = fn; return { dispose() {} } }
    resize(cols, rows) { this.cols = cols; this.rows = rows }
    focus() {}
    reset() { this.writes = [] }
    write(data, done) { this.writes.push(data); done?.() }
    dispose() { this.disposed = true }
  }
  const sandbox = {
    window: { __ModuleLoader__: { load(module) { plugin = module.factory(() => ({ createElement() {} })) } } },
    __dshAgentsXterm: { Terminal, FitAddon: class { proposeDimensions() { return { cols: 100, rows: 30 } } }, css: '' },
    document: { head: new Node(), body: new Node(), documentElement: { getAttribute() { return 'zh' } }, createElement() { return new Node() }, getElementById(id) { return tags.get(id) || null } },
    navigator: { language: 'zh' },
    getComputedStyle() { return { backgroundColor: dark ? 'rgb(25, 26, 32)' : 'rgb(255, 255, 255)', color: dark ? 'rgb(232, 234, 237)' : 'rgb(32, 33, 36)', getPropertyValue() { return '' } } },
    AbortController, TextDecoder, setTimeout, clearTimeout,
    requestAnimationFrame(fn) { const id = ++frameId; frames.set(id, fn); return id }, cancelAnimationFrame(id) { frames.delete(id) },
    fetch: async (path, init) => { requests.push({ path, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ ok: true }) } },
  }
  vm.createContext(sandbox)
  vm.runInContext(source.replace("    return { inject: ['slots', 'theme'], apply }", "    globalThis.api = { Session, sessions, readFrames, publish, select, snapshot, pendingStarts, updateAgent, availableAgents, adopt }; return { inject: ['slots', 'theme'], apply }"), sandbox)
  return {
    ...sandbox.api, sandbox, requests, terminals, Node, plugin,
    dark(value) { dark = value },
    frame() { const current = [...frames.values()]; frames.clear(); for (const fn of current) fn() },
  }
}
const tick = () => new Promise((resolve) => setImmediate(resolve))

test('panel detachment parks the same renderer without closing its process or stream', () => {
  const env = harness()
  const session = new env.Session('codex')
  const host = new env.Node()
  const connection = new AbortController()
  session.connection = connection
  session.mount(host)
  session.setActive(true)
  session.detach(host)
  assert.equal(connection.signal.aborted, false)
  assert.equal(session.term.disposed, undefined)
  assert.equal(session.node.parentNode.hidden, true)
  session.mount(host)
  assert.equal(session.node.parentNode, host)
  assert.equal(env.terminals.length, 1)
  assert.equal(env.requests.length, 0)
  session.dispose()
  assert.equal(connection.signal.aborted, true)
  assert.equal(session.term.disposed, true)
})

test('refresh and reconnect never send a restart flag', async () => {
  const env = harness()
  env.sandbox.fetch = async (path, init) => {
    env.requests.push({ path, body: JSON.parse(init.body) })
    if (path.endsWith('/open')) return { ok: true, json: async () => ({ ok: true }) }
    return { ok: true, body: { getReader() { return { async read() { return { done: true } }, async cancel() {}, releaseLock() {} } } } }
  }
  const session = new env.Session('codex')
  session.connect()
  await tick()
  session.connect()
  await tick()
  const opens = env.requests.filter((request) => request.path.endsWith('/open'))
  assert.equal(opens.length, 2)
  assert(opens.every((request) => !('restart' in request.body) && !('resume' in request.body)))
  session.dispose()
  const fresh = new env.Session('pi')
  env.pendingStarts.add('pi')
  fresh.mount(new env.Node())
  await tick()
  assert.equal(env.requests.filter((request) => request.path.endsWith('/open')).at(-1).body.resume, true)
  fresh.dispose()
})

test('theme changes update opaque OSC colors and font size without replacing the terminal', () => {
  const env = harness()
  const session = new env.Session('codex')
  assert.equal(session.term.options.theme.background, 'rgb(255, 255, 255)')
  env.dark(true)
  env.publish({ theme: { active: { colorScheme: 'dark' }, fontSizes: { terminal: 16 } } })
  session.updateTheme()
  assert.equal(session.term.options.theme.background, 'rgb(25, 26, 32)')
  assert.equal(session.term.options.fontSize, 16)
  assert.equal(env.terminals.length, 1)
  session.dispose()
})

test('input writes are serialized, batched and split within the UTF-8 limit', async () => {
  const env = harness()
  let release
  let first = true
  env.sandbox.fetch = async (path, init) => {
    env.requests.push({ path, body: JSON.parse(init.body) })
    if (first) { first = false; await new Promise((resolve) => { release = resolve }) }
    return { ok: true, json: async () => ({ ok: true }) }
  }
  const session = new env.Session('codex')
  session.writable = true
  session.input = 'a'
  const flushing = session.flushInput()
  session.send('b'); session.send('c'); session.send('😀'.repeat(12000))
  assert.equal(env.requests.length, 1)
  release()
  await flushing
  const writes = env.requests.map((request) => request.body.data)
  assert.equal(writes.join(''), 'abc' + '😀'.repeat(12000))
  assert(writes.every((data) => Buffer.byteLength(data, 'utf8') <= 64 * 1024))
  assert(writes.length < 5)
  session.dispose()
})

test('resize callbacks coalesce and unchanged dimensions do not hit the network', async () => {
  const env = harness()
  const session = new env.Session('codex')
  session.writable = true
  session.setActive(true)
  for (let i = 0; i < 20; i++) session.fit()
  env.frame()
  await tick()
  assert.equal(env.requests.length, 1)
  session.fit(); env.frame(); await tick()
  assert.equal(env.requests.length, 1)
  session.setActive(false)
  session.fit(); env.frame(); await tick()
  assert.equal(env.requests.length, 1)
  session.dispose()
})

test('exited CLI updates the tab dot and selecting the active tab requests resume once', async () => {
  const env = harness()
  const session = new env.Session('pi')
  env.sessions.set('pi', session)
  env.publish({ active: 'pi' })
  await session.apply({ type: 'state', writable: true, info: { state: 'running', agentState: 'exited' } }, new AbortController().signal)
  assert.equal(env.snapshot().statuses.pi, 'exited')
  let resumes = 0
  session.connect = (resume) => { assert.equal(resume, true); resumes++; session.setStatus('loading') }
  env.select('pi')
  assert.equal(resumes, 1)
  env.select('pi')
  assert.equal(resumes, 1)
  session.setStatus('running')
  env.select('pi')
  assert.equal(resumes, 1)
  session.dispose()
})

test('SSE parsing preserves partial frames and ignores heartbeats', () => {
  const env = harness()
  const first = env.readFrames(': ping\n\ndata: {"type":"output","data":"你好"}\n\ndata: {"type":')
  assert.equal(first.frames.length, 1)
  assert.equal(first.frames[0].data, '你好')
  assert.equal(env.readFrames(first.rest + '"state"}\n\n').frames[0].type, 'state')
})

test('built-in editing preserves ids and running renderers while composing rapid updates', async () => {
  const env = harness()
  let settings = { version: 3, activeId: 'agy', agents: [{ id: 'agy', name: 'Antigravity', command: 'agy', color: '#20a56b' }] }
  env.publish({ settings, active: 'agy' })
  const session = new env.Session('agy')
  env.sessions.set('agy', session)
  env.sandbox.fetch = async (_path, init) => {
    settings = { ...settings, ...JSON.parse(init.body).settings }
    return { ok: true, json: async () => ({ ok: true, settings }) }
  }
  await Promise.all([env.updateAgent('agy', { name: 'Custom agent', command: 'other --flag' }), env.updateAgent('agy', { color: '#abcdef' })])
  assert.equal(env.snapshot().settings.agents[0].id, 'agy')
  assert.equal(env.snapshot().settings.agents[0].name, 'Custom agent')
  assert.equal(env.snapshot().settings.agents[0].command, 'other --flag')
  assert.equal(env.snapshot().settings.agents[0].color, '#abcdef')
  assert.equal(env.sessions.get('agy'), session)
  assert.equal(session.term.disposed, undefined)
  session.dispose()
})

test('plugin registration does not detect or launch before opening its panel', () => {
  const env = harness(), effects = []
  env.plugin.apply({ theme: { getTheme: () => ({ active: { colorScheme: 'light' } }) }, on() {}, slots: { inject(_name, fn) { fn() }, register() {} }, effect(fn) { effects.push(fn()) } })
  assert.equal(env.requests.length, 0)
  assert.equal(env.terminals.length, 0)
  effects.reverse().forEach((dispose) => dispose?.())
})

test('first panel entry selects first usable agent instead of the previous DSH run selection', () => {
  const env = harness()
  const settings = { agents: [{ id: 'claude' }, { id: 'codex' }, { id: 'pi' }], activeId: 'pi', defaultId: 'pi' }
  env.publish({ availability: { claude: { installed: false }, codex: { installed: true }, pi: { installed: true } } })
  env.adopt(settings)
  assert.equal(env.snapshot().active, 'codex')
  env.publish({ active: 'pi' })
  env.adopt(settings)
  assert.equal(env.snapshot().active, 'pi')
})

test('inventory hides missing/disabled CLIs, retains live sessions and reveals new installs', () => {
  const env = harness()
  const settings = { agents: [{ id: 'claude', enabled: true }, { id: 'codex', enabled: true }, { id: 'agy', enabled: false }, { id: 'pi', enabled: true }], activeId: 'claude' }
  env.publish({ availability: { claude: { installed: false }, codex: { installed: true }, agy: { installed: true }, pi: { installed: false } } })
  env.adopt(settings)
  assert.equal(env.snapshot().active, 'codex')
  assert.equal(env.availableAgents().map((agent) => agent.id).join(','), 'codex')
  env.publish({ statuses: { pi: 'running' } })
  assert.equal(env.availableAgents().map((agent) => agent.id).join(','), 'codex,pi')
  env.publish({ availability: { claude: { installed: true }, codex: { installed: true }, pi: { installed: true } } })
  env.adopt(settings)
  assert.equal(env.availableAgents().map((agent) => agent.id).join(','), 'claude,codex,pi')
})

test('toolbar stays centered and exposes only settings; themes are read-only', () => {
  assert.match(source, /grid-template-columns:minmax\(max\(112px/)
  assert.doesNotMatch(source, /ac-title|ac-foot|allBackground|generation|restart: true/)
  assert.match(source, /kind: 'gear'/)
  assert.doesNotMatch(source, /ThemeButton|setTheme\(|kind: 'refresh'|ac-theme/)
  assert.match(source, /type: 'color'/)
  assert.match(source, /padding:8px 8px 20px/)
  assert.match(source, /this.term.open\(this.body\)/)
  assert.match(source, /ac-term-body\{width:100%;height:100%/)
  assert.match(source, /maxLength: 256, value: editing.command/)
  assert.match(source, /maxLength: 24, value: editing.name/)
  assert.match(source, /DSH 默认目录/)
  assert.match(source, /\[-1, text\.up, '↑'\], \[1, text\.down, '↓'\]/)
})
