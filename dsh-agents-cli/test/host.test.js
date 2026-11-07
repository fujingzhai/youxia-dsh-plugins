import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { Readable } from 'node:stream'

import {
  BUILTINS,
  LIMITS,
  ROUTES,
  buildShellLaunch,
  buildTerminalEnv,
  clampDimensions,
  cleanAgent,
  commandKeystrokes,
  agentKeystrokes,
  createCompletionFilter,
  createAgentsCliController,
  createAvailabilityDetector,
  detectionTarget,
  detectionScript,
  createRoutes,
  defaultSettings,
  parseSettings,
  readSettings,
  resolveWorkingDirectory,
  setSettingsFile,
  writeSettings,
} from '../lib/index.js'

const tempRoot = process.env.CI ? join(homedir(), '.dsh-agents-cli-tests') : join(homedir(), 'AI-Space', '.tmp')
mkdirSync(tempRoot, { recursive: true })
function tempDirectory() { return mkdtempSync(join(tempRoot, 'agents-cli-test-')) }
function trashDirectory(dir) {
  const trash = join(homedir(), '.Trash')
  mkdirSync(trash, { recursive: true })
  const target = resolve(dir)
  assert.equal(dirname(target), resolve(tempRoot))
  assert.equal(basename(target).startsWith('agents-cli-test-'), true)
  const destination = resolve(trash, `${basename(target)}-${Date.now()}`)
  assert.equal(dirname(destination), resolve(trash))
  renameSync(target, destination)
}

function fakeHandle() {
  const output = new Readable({ read() {} })
  let settle
  const done = new Promise((resolve) => { settle = resolve })
  return {
    output,
    done,
    writes: [],
    resizes: [],
    terminated: false,
    write(data) { this.writes.push(data); return Promise.resolve() },
    resize(cols, rows) { this.resizes.push([cols, rows]); return Promise.resolve() },
    terminate() {
      this.terminated = true
      output.push(null)
      settle({ exitCode: 0 })
      return Promise.resolve()
    },
    emit(text) { output.push(Buffer.from(text)) },
  }
}

function fakeSubprocess() {
  const handles = []
  return {
    handles,
    terminalEnvironment() {
      return Promise.resolve({ defaultShell: '/bin/zsh', platform: 'darwin' })
    },
    resolveExecutable(path) { return Promise.resolve(path) },
    spawnTerminal(spec) {
      const handle = fakeHandle()
      handle.spec = spec
      handles.push(handle)
      return Promise.resolve(handle)
    },
  }
}

function request(method, url, body, header = '1') {
  const raw = body === undefined ? '' : JSON.stringify(body)
  return {
    method,
    url,
    headers: header ? { 'x-dsh-agents-cli': header } : {},
    async *[Symbol.asyncIterator]() {
      if (raw) yield Buffer.from(raw)
    },
    listeners: {},
    on(event, fn) { this.listeners[event] = fn },
  }
}

function response() {
  return {
    status: 0,
    headers: {},
    body: '',
    chunks: [],
    headersSent: false,
    writeHead(status, headers) { this.status = status; this.headers = headers; this.headersSent = true },
    end(body) { this.body = body ?? '' },
    write(chunk) { this.chunks.push(String(chunk)) },
    flushHeaders() {},
  }
}

async function call(controller, path, method, body, header) {
  const route = createRoutes(controller).find((item) => item.path === path && item.method === method)
  const req = request(method, path, body, header)
  const res = response()
  await route.handler(req, res)
  return { req, res, json: res.body ? JSON.parse(res.body) : null }
}

test('defaults are Claude, Codex, Antigravity and Pi, with no personal directory', () => {
  const settings = defaultSettings()
  assert.deepEqual(settings.agents.map((item) => item.id), ['claude', 'codex', 'agy', 'pi'])
  assert.deepEqual(settings.agents.map((item) => item.name), ['Claude', 'Codex', 'Antigravity', 'Pi'])
  assert.deepEqual(settings.agents.map((item) => item.color), ['#e88b3a', '#4285f4', '#20a56b', '#df5252'])
  assert.equal(settings.agents[3].command, 'pi')
  assert.equal(settings.cwd, '')
  assert.equal(settings.activeId, 'claude')
})

test('settings reject a blank command, a duplicate id and an empty list', () => {
  assert.throws(() => cleanAgent({ id: 'ok', name: 'ok', command: '  ' }), /指令/)
  assert.throws(() => cleanAgent({ id: 'bad id', name: 'ok', command: 'agy' }), /ID/)
  assert.throws(() => parseSettings({ version: 1, agents: [] }), /至少保留一个/)
  const first = cleanAgent({ id: 'agy', name: 'Antigravity', command: 'agy --help' }, 0)
  assert.equal(first.color, BUILTINS[2].color)
  assert.throws(() => parseSettings({
    version: 1,
    agents: [first, { ...first }],
  }), /重复/)
})

test('corrupt settings fall back, and a valid file round-trips', () => {
  const dir = tempDirectory()
  const file = join(dir, 'settings.json')
  setSettingsFile(file)
  try {
    assert.equal(readSettings(file).agents.length, 4)
    const saved = writeSettings({
      version: 1,
      agents: [...BUILTINS, { id: 'gemini', name: 'gemini', command: 'gemini', color: '#112233' }],
      activeId: 'agy',
      defaultId: 'codex',
      cwd: '~/work',
    }, file)
    assert.equal(saved.activeId, 'agy')
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).agents[4].id, 'gemini')
    assert.equal(readSettings(file).defaultId, 'codex')
  } finally {
    setSettingsFile(null)
    trashDirectory(dir)
  }
})

test('a login shell is started, and the command is typed once', () => {
  const zsh = buildShellLaunch('/bin/zsh', 'darwin')
  assert.deepEqual(zsh.argv, ['/bin/zsh', '-il'])
  assert.equal(commandKeystrokes('agy'), 'agy\r')
  assert.equal(commandKeystrokes('  '), '')
  const win = buildShellLaunch('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32')
  assert.equal(win.argv.at(-1), '-NoLogo')
  assert.deepEqual(buildShellLaunch('/bin/bash', 'linux').argv, ['/bin/bash', '-il'])
})

test('terminal env keeps PATH and drops desktop-only variables', () => {
  const env = buildTerminalEnv('/bin/zsh', {
    PATH: '/usr/bin',
    ELECTRON_RUN_AS_NODE: '1',
    DSH_DESKTOP_NODE_EXECUTABLE: '/tmp/node',
    TERM: 'dumb',
  }, 'win32')
  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.ELECTRON_RUN_AS_NODE, undefined)
  assert.equal(env.DSH_DESKTOP_NODE_EXECUTABLE, undefined)
  assert.equal(env.TERM, 'xterm-256color')
  assert.deepEqual(clampDimensions(1, 9000), { cols: 2, rows: LIMITS.maxRows })
})

test('opening a terminal types the command and reattach does not type it again', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  const first = await controller.openTerminal({ id: 'agy', command: 'agy', title: 'agy', cwd: '', cols: 80, rows: 24 })
  assert.equal(subprocess.handles.length, 1)
  assert.deepEqual(subprocess.handles[0].spec.argv.slice(0, 2), [subprocess.handles[0].spec.argv[0], '-il'])
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(subprocess.handles[0].writes, [agentKeystrokes('agy', 'zsh', first.completionToken)])
  const again = await controller.openTerminal({ id: 'agy', command: 'agy', cols: 100, rows: 40 })
  assert.equal(again, first)
  assert.equal(subprocess.handles.length, 1)
  assert.deepEqual(subprocess.handles[0].resizes.at(-1), [100, 40])
})

test('restart replaces the process and types the command again', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  await controller.openTerminal({ id: 'claude', command: 'claude', cols: 80, rows: 24 })
  await controller.openTerminal({ id: 'claude', command: 'claude', cols: 80, rows: 24, restart: true })
  assert.equal(subprocess.handles[0].terminated, true)
  assert.equal(subprocess.handles.length, 2)
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.match(subprocess.handles[1].writes[0], /^eval 'claude'; printf /)
})

test('output reaches a follower, and close ends the process', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  const term = await controller.openTerminal({ id: 'codex', command: 'codex', cols: 80, rows: 24 })
  const res = response()
  const detach = await term.attachSse(res)
  subprocess.handles[0].emit('hello')
  await new Promise((resolve) => setTimeout(resolve, 30))
  assert.match(res.chunks.join(''), /hello/)
  detach()
  assert.equal(await controller.closeTerminal('codex'), true)
  assert.equal(subprocess.handles[0].terminated, true)
  assert.equal(controller.getTerminal('codex'), undefined)
})

test('routes require the plugin header and persist a new entry', async () => {
  const dir = tempDirectory()
  setSettingsFile(join(dir, 'settings.json'))
  const controller = createAgentsCliController(fakeSubprocess())
  try {
    const denied = await call(controller, ROUTES.state, 'POST', {}, '')
    assert.equal(denied.res.status, 403)
    const state = await call(controller, ROUTES.state, 'POST')
    assert.equal(state.json.settings.agents.length, 4)
    const saved = await call(controller, ROUTES.settings, 'POST', {
      settings: {
        agents: [...state.json.settings.agents, { id: 'gemini', name: 'gemini', command: 'gemini' }],
        activeId: 'gemini',
      },
    })
    assert.equal(saved.json.ok, true)
    assert.equal(saved.json.settings.agents.at(-1).command, 'gemini')
    const missing = await call(controller, ROUTES.open, 'POST', { id: 'nope' })
    assert.equal(missing.res.status, 404)
  } finally {
    setSettingsFile(null)
    trashDirectory(dir)
  }
})

test('concurrent opens share one process, and refresh does not rerun commands', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  try {
    const options = { id: 'codex', command: 'codex', cols: 80, rows: 24 }
    const results = await Promise.all(Array.from({ length: 16 }, () => controller.openTerminal(options)))
    assert(results.every((term) => term === results[0]))
    await results[0].operations
    assert.equal(subprocess.handles.length, 1)
    assert.equal(subprocess.handles[0].writes.length, 1)
    assert.match(subprocess.handles[0].writes[0], /^eval 'codex'; printf /)
    const detach = await results[0].attachSse(response())
    detach()
    await controller.openTerminal(options)
    assert.equal(subprocess.handles[0].terminated, false)
    assert.equal(subprocess.handles[0].writes.length, 1)
    assert.match(subprocess.handles[0].writes[0], /^eval 'codex'; printf /)
  } finally { await controller.dispose() }
})

test('deferred commands start once after the follower attaches', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  try {
    const term = await controller.openTerminal({ id: 'codex', command: 'codex', deferCommand: true })
    assert.deepEqual(subprocess.handles[0].writes, [])
    const detach = await term.attachSse(response())
    term.startCommand()
    term.startCommand()
    await term.operations
    assert.equal(subprocess.handles[0].writes.length, 1)
    assert.match(subprocess.handles[0].writes[0], /^eval 'codex'; printf /)
    detach()
  } finally { await controller.dispose() }
})

test('snapshot subscription is atomic with queued output and drops slow followers', async () => {
  const controller = createAgentsCliController(fakeSubprocess())
  try {
    const term = await controller.openTerminal({ id: 'agy', command: '' })
    const res = response()
    const attach = term.attachSse(res)
    await term.pushOutput('after snapshot')
    const detach = await attach
    const frames = res.chunks.map((chunk) => JSON.parse(chunk.slice(6)))
    assert.deepEqual(frames.map((frame) => frame.type), ['snapshot', 'output'])
    assert.equal(frames[1].sequence, frames[0].sequence + 1)
    res.writableLength = LIMITS.maxBufferedBytes + 1
    res.destroy = () => { res.destroyed = true }
    await term.pushOutput('bounded')
    assert.equal(term.followers.size, 0)
    assert.equal(res.destroyed, true)
    detach()
  } finally { await controller.dispose() }
})

test('disposal also closes terminals still spawning', async () => {
  const subprocess = fakeSubprocess()
  const spawn = subprocess.spawnTerminal.bind(subprocess)
  let entered, release
  const enteredPromise = new Promise((resolve) => { entered = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  subprocess.spawnTerminal = async (spec) => { entered(); await gate; return spawn(spec) }
  const controller = createAgentsCliController(subprocess)
  const opening = controller.openTerminal({ id: 'claude', command: '' })
  await enteredPromise
  const disposing = controller.dispose()
  release()
  await opening
  await disposing
  assert.equal(subprocess.handles[0].terminated, true)
  assert.equal(controller.getTerminal('claude'), undefined)
  await assert.rejects(controller.openTerminal({ id: 'claude' }), /关闭/)
})

test('real HTTP SSE survives completed POST bodies, disconnects and reattaches', async () => {
  const dir = tempDirectory()
  setSettingsFile(join(dir, 'settings.json'))
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  const routes = createRoutes(controller)
  const server = createServer((req, res) => {
    const route = routes.find((item) => item.path === req.url)
    Promise.resolve(route.handler(req, res)).catch((error) => res.destroy(error))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  const post = (path, body, signal) => fetch(base + path, { method: 'POST', headers: { 'x-dsh-agents-cli': '1', 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
  const life = new AbortController()
  try {
    await (await post(ROUTES.open, { id: 'codex' })).json()
    const stream = await post(ROUTES.stream, { id: 'codex' }, life.signal)
    const reader = stream.body.getReader()
    assert.match(new TextDecoder().decode((await reader.read()).value), /snapshot/)
    subprocess.handles[0].emit('live-after-request-end')
    assert.match(new TextDecoder().decode((await reader.read()).value), /live-after-request-end/)
    assert.equal(controller.getTerminal('codex').followers.size, 1)
    await reader.cancel()
    await (await post(ROUTES.open, { id: 'codex' })).json()
    assert.equal(subprocess.handles.length, 1)
    assert.equal(subprocess.handles[0].terminated, false)
    const again = await post(ROUTES.stream, { id: 'codex' }, life.signal)
    const againReader = again.body.getReader()
    assert.match(new TextDecoder().decode((await againReader.read()).value), /live-after-request-end/)
    await againReader.cancel()
  } finally {
    life.abort()
    await controller.dispose()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    setSettingsFile(null)
    trashDirectory(dir)
  }
})

test('blank directory inherits DSH default; explicit invalid paths fail', () => {
  const dir = tempDirectory()
  try {
    assert.equal(resolveWorkingDirectory('', dir), dir)
    assert.equal(resolveWorkingDirectory('.', dir), dir)
    assert.equal(resolveWorkingDirectory('', '/this/path/does/not/exist'), homedir())
    assert.throws(() => resolveWorkingDirectory('missing', dir), /工作目录不存在/)
  } finally { trashDirectory(dir) }
})

test('built-in and custom colors are editable and validated', () => {
  for (const agent of [...BUILTINS, { id: 'custom', name: 'Custom', command: 'test' }]) {
    assert.equal(cleanAgent({ ...agent, color: '#ABCDEF' }).color, '#abcdef')
    assert.throws(() => cleanAgent({ ...agent, color: 'red;display:none' }), /颜色/)
  }
})

test('migration keeps a manually added Pi id, custom order and active selection', () => {
  const legacy = { version: 1, agents: [
    { id: 'agy', name: 'agy', command: 'agy', color: '#4285f4' },
    { id: 'claude', name: 'claude', command: 'claude', color: '#d97757' },
    { id: 'codex', name: 'codex', command: 'codex', color: '#10a37f' },
    { id: 'my-pi', name: 'pi', command: 'pi', color: '#06b6d4' },
  ], activeId: 'my-pi', cwd: '' }
  const migrated = parseSettings(legacy)
  assert.equal(migrated.version, 4)
  assert.equal(migrated.agents.length, 4)
  assert.deepEqual(migrated.agents.map((a) => a.id), ['agy', 'claude', 'codex', 'my-pi'])
  assert.equal(migrated.activeId, 'my-pi')
  assert.equal(migrated.agents[3].name, 'Pi')
  assert.equal(migrated.agents[3].color, '#df5252')
  const custom = parseSettings({ version: 1, agents: [{ id: 'claude', name: 'Mine', command: 'claude', color: '#123456' }] })
  assert.equal(custom.agents[0].color, '#123456')
  assert.equal(custom.agents[0].name, 'Mine')
  assert.equal(custom.agents[1].id, 'pi')
  assert.equal(parseSettings({ ...migrated, agents: migrated.agents.slice(0, 1) }).agents.length, 1)
})

test('completion markers are split-safe and cannot be confused with ordinary terminal output', () => {
  let exits = 0
  const filter = createCompletionFilter('private', () => exits++)
  const marker = '\x1b]777;dsh-agents-private;exit;0\x07'
  let visible = ''
  for (const char of 'before' + marker + 'after') visible += filter.push(char)
  assert.equal(visible, 'beforeafter')
  assert.equal(exits, 1)
  assert.equal(filter.push('\x1b]777;dsh-agents-other;exit;0\x07'), '\x1b]777;dsh-agents-other;exit;0\x07')
  assert.match(agentKeystrokes("echo 'hello'; echo done", 'bash', 'private'), /^eval /)
  assert.match(agentKeystrokes('pi', 'powershell', 'private'), /Console.*Write/)
  assert.match(agentKeystrokes('pi', 'cmd', 'private'), /^call pi & echo/)
  assert.deepEqual(buildShellLaunch('C:\\Program Files\\Git\\bin\\bash.exe', 'win32').argv, ['C:\\Program Files\\Git\\bin\\bash.exe', '-il'])
})

test('Antigravity migration preserves customized labels, commands, colors and ids', () => {
  const raw = { ...defaultSettings(), version: 2 }
  raw.agents[2] = { ...raw.agents[2], name: 'Agy' }
  assert.equal(parseSettings(raw).agents[2].name, 'Antigravity')
  raw.version = 3
  assert.equal(parseSettings(raw).agents[2].name, 'Agy')
  raw.version = 2
  raw.agents[2] = { ...raw.agents[2], name: 'My agent', command: 'agy --flag', color: '#123456' }
  assert.deepEqual(parseSettings(raw).agents[2], { ...raw.agents[2], enabled: true, builtinId: 'agy' })
  assert.throws(() => parseSettings({ version: 1, agents: [null] }), /无效/)
})

async function shellRun(file, args, input, cwd) {
  const child = spawn(file, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, DSH_AGENTS_ESC: '\x1b', DSH_AGENTS_BEL: '\x07' } })
  let stdout = '', stderr = ''
  child.stdout.on('data', (chunk) => { stdout += chunk })
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const timer = setTimeout(() => child.kill(), 15000)
  try {
    const result = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => resolve(code)) })
    child.stdin.end(input)
    const code = await result
    assert.equal(code, 0, stderr)
    return stdout
  } finally { clearTimeout(timer) }
}

test('POSIX shell preserves functions, aliases, quotes and completion on failure', { skip: process.platform === 'win32' }, async () => {
  const prefix = "shopt -s expand_aliases\nalias demo='printf alias-ok'\nwrapped() { printf function-ok; }\n"
  const command = "demo; wrapped; printf '%s' \"quoted's\"; false"
  const output = await shellRun('/bin/bash', ['--noprofile', '--norc'], prefix + agentKeystrokes(command, 'bash', 'probe').replace(/\r$/, '\n'))
  assert.match(output, /alias-okfunction-okquoted's/)
  assert.match(output, /\x1b\]777;dsh-agents-probe;exit;0\x07/)
})

test('Windows cmd invokes npm-style .cmd shims and reports completion', { skip: process.platform !== 'win32' }, async () => {
  const dir = tempDirectory()
  try {
    writeFileSync(join(dir, 'sample.cmd'), '@echo off\r\necho npm-shim-ok\r\nexit /b 7\r\n')
    const command = agentKeystrokes('.\\sample.cmd', 'cmd', 'win-probe')
    const output = await shellRun(process.env.ComSpec || 'cmd.exe', ['/d', '/q'], command + 'exit /b 0\r\n', dir)
    assert.match(output, /npm-shim-ok/)
    assert.match(output, /\x1b\]777;dsh-agents-win-probe;exit;0\x07/)
  } finally { trashDirectory(dir) }
})

test('Windows PowerShell runs aliases/functions and emits completion markers', { skip: process.platform !== 'win32' }, async () => {
  const command = agentKeystrokes('sample', 'powershell', 'pwsh-probe')
  const output = await shellRun('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], 'function sample { Write-Output "powershell-ok" }\n' + command.replace(/\r$/, '\n'))
  assert.match(output, /powershell-ok/)
  assert.match(output, /\x1b\]777;dsh-agents-pwsh-probe;exit;0\x07/)
})

test('CLI detector is non-executing, shared, cached and refreshes command edits', async () => {
  const subprocess = fakeSubprocess()
  let runs = 0
  const detect = createAvailabilityDetector(subprocess, { run: async (_shell, args) => {
    runs++
    const script = args.at(-1)
    assert.doesNotMatch(script, /eval|--version/)
    const prefix = script.match(/DSH_AGENTS_[a-f0-9]+/)[0]
    return { stdout: `${prefix}:0:yes\n${prefix}:1:no\n` }
  } })
  const agents = defaultSettings().agents
  const [a, b] = await Promise.all([detect(agents), detect(agents)])
  assert.equal(runs, 1)
  assert.equal(a, b)
  assert.equal(a.claude.installed, true)
  assert.equal(a.codex.installed, false)
  await detect(agents)
  assert.equal(runs, 1)
  await detect(agents.map((agent, index) => index === 0 ? { ...agent, command: 'new-command' } : agent))
  assert.equal(runs, 2)
  assert.equal(detectionTarget('echo; touch unsafe'), null)
  assert.equal(detectionTarget('"C:\\Program Files\\agent.exe" --flag'), 'C:\\Program Files\\agent.exe')
  assert.match(detectionScript([{ command: 'codex' }], 'cmd', 'probe'), /where "codex"/)
  assert.match(detectionScript([{ command: 'codex' }], 'powershell', 'probe'), /Get-Command/)
})

test('detector finds aliases/functions without executing them', { skip: process.platform === 'win32' }, async () => {
  const probe = detectionScript([{ command: 'aliascli' }, { command: 'functioncli' }, { command: 'missing_cli_xyz' }], 'bash', 'alias-probe')
  const output = await shellRun('/bin/bash', ['--noprofile', '--norc'], "shopt -s expand_aliases\nalias aliascli='exit 99'\nfunctioncli() { exit 99; }\n" + probe + '\n')
  assert.match(output, /DSH_AGENTS_alias-probe:0:yes/)
  assert.match(output, /DSH_AGENTS_alias-probe:1:yes/)
  assert.match(output, /DSH_AGENTS_alias-probe:2:no/)
})

test('disabled entries persist and close only their own terminal, then restore individually', async () => {
  const dir = tempDirectory()
  setSettingsFile(join(dir, 'settings.json'))
  const subprocess = fakeSubprocess(), controller = createAgentsCliController(subprocess)
  try {
    await controller.openTerminal({ id: 'codex', command: 'codex' })
    await controller.openTerminal({ id: 'pi', command: 'pi' })
    const settings = readSettings()
    const disabled = settings.agents.map((agent) => agent.id === 'codex' ? { ...agent, enabled: false } : agent)
    await call(controller, ROUTES.settings, 'POST', { settings: { agents: disabled } })
    assert.equal(readSettings().agents.length, 4)
    assert.equal(readSettings().agents.find((agent) => agent.id === 'codex').enabled, false)
    assert.equal(controller.getTerminal('codex'), undefined)
    assert(controller.getTerminal('pi'))
    assert.equal((await call(controller, ROUTES.open, 'POST', { id: 'codex' })).res.status, 409)
    await call(controller, ROUTES.settings, 'POST', { settings: { agents: disabled.map((agent) => ({ ...agent, enabled: true })) } })
    assert.equal(readSettings().agents.find((agent) => agent.id === 'codex').enabled, true)
  } finally { await controller.dispose(); setSettingsFile(null); trashDirectory(dir) }
})

test('CLI completion greys the entry while preserving shell; only explicit selection restarts', async () => {
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess)
  try {
    const options = { id: 'pi', command: 'pi' }
    const first = await controller.openTerminal(options)
    await first.pushOutput(`\x1b]777;dsh-agents-${first.completionToken};exit;0\x07`)
    assert.equal(first.info.agentState, 'exited')
    assert.equal(first.info.completionToken, undefined)
    assert.equal(first.info.state, 'running')
    assert.equal(await controller.openTerminal(options), first)
    assert.equal(subprocess.handles.length, 1)
    const again = await controller.openTerminal({ ...options, resume: true })
    assert.notEqual(again, first)
    assert.equal(subprocess.handles[0].terminated, true)
    assert.equal(subprocess.handles.length, 2)
    assert.equal(await controller.openTerminal({ ...options, resume: true }), again)
    assert.equal(subprocess.handles.length, 2)
  } finally { await controller.dispose() }
})

test('routes inherit the official default directory and reject invalid overrides', async () => {
  const dir = tempDirectory()
  setSettingsFile(join(dir, 'settings.json'))
  const subprocess = fakeSubprocess()
  const controller = createAgentsCliController(subprocess, { defaultDirectory: dir })
  try {
    assert.equal((await call(controller, ROUTES.state, 'POST')).json.defaultCwd, dir)
    await call(controller, ROUTES.open, 'POST', { id: 'pi' })
    assert.equal(subprocess.handles[0].spec.cwd, dir)
    const invalid = await call(controller, ROUTES.settings, 'POST', { settings: { cwd: join(dir, 'missing') } })
    assert.equal(invalid.res.status, 400)
    assert.equal(readSettings().cwd, '')
  } finally { await controller.dispose(); setSettingsFile(null); trashDirectory(dir) }
})
