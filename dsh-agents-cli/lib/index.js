/**
 * dsh-agents-cli — Host half.
 *
 * Manages persistent local CLI agent terminals (Claude, Codex, Agy, Pi by default,
 * plus user-added commands) by reusing DSH's official `subprocess.spawnTerminal`
 * PTY provider and `@xterm/headless` screen serializer.
 */

import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'

/** Stable cordis plugin name. */
export const name = 'agents-cli'

/** Host services required by this plugin. */
export const inject = ['webServer', 'subprocess', 'workingDirectory']

/** Sidebar and main panel key. */
export const PANEL_ID = 'agents-cli'

/** Header checked on JSON routes to block cross-site form posts. */
export const GUARD_HEADER = 'x-dsh-agents-cli'

/** Built-in CLI agent entries. */
export const BUILTINS = Object.freeze([
  Object.freeze({ id: 'claude', name: 'Claude', command: 'claude', color: '#e88b3a' }),
  Object.freeze({ id: 'codex', name: 'Codex', command: 'codex', color: '#4285f4' }),
  Object.freeze({ id: 'agy', name: 'Antigravity', command: 'agy', color: '#20a56b' }),
  Object.freeze({ id: 'pi', name: 'Pi', command: 'pi', color: '#df5252' }),
])

/** Color palette for user-added CLI entries. */
const CUSTOM_COLORS = ['#8b5cf6', '#ec4899', '#eab308', '#06b6d4', '#f97316', '#14b8a6', '#6366f1']

/** Route family shared with the browser half. */
export const ROUTES = Object.freeze({
  state: '/api/dsh-agents-cli/state',
  settings: '/api/dsh-agents-cli/settings',
  open: '/api/dsh-agents-cli/open',
  stream: '/api/dsh-agents-cli/stream',
  input: '/api/dsh-agents-cli/input',
  close: '/api/dsh-agents-cli/close',
})

/** Terminal limits matching the official terminal controller. */
export const LIMITS = Object.freeze({
  maxCols: 500,
  maxRows: 200,
  scrollback: 1000,
  maxInputBytes: 64 * 1024,
  maxBufferedBytes: 2 * 1024 * 1024,
  disposeGraceMs: 1000,
})

/** Expand a leading `~` prefix against the OS home directory. */
export function expandHome(input) {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim()
  if (trimmed === '~') return homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return join(homedir(), trimmed.slice(2))
  return trimmed
}

/** Resolve the single DSH home root (`$DSH_HOME` or `~/.dsh`). */
export function dshHome(env = process.env) {
  const fromEnv = env.DSH_HOME
  const override = fromEnv !== undefined && fromEnv.trim().length > 0 ? expandHome(fromEnv) : undefined
  return resolve(override ?? join(homedir(), '.dsh'))
}

let settingsFilePath = null

/** Path to `<dsh home>/dsh-agents-cli/settings.json`. */
export function SETTINGS_FILE() {
  return settingsFilePath === null ? join(dshHome(), 'dsh-agents-cli', 'settings.json') : settingsFilePath
}

/** Override settings file path for isolated tests. */
export function setSettingsFile(path) {
  settingsFilePath = path
}

/** Check whether a path is an existing directory on disk. */
function isDirectory(path) {
  try {
    return typeof path === 'string' && path !== '' && statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** Explicit cwd wins; a blank value inherits DSH's deployment default, not a personal folder. */
export function resolveWorkingDirectory(customCwd = '', defaultDirectory = process.cwd()) {
  const base = typeof defaultDirectory === 'string' && defaultDirectory.trim() ? resolve(expandHome(defaultDirectory)) : process.cwd()
  if (typeof customCwd === 'string' && customCwd.trim() !== '') {
    const selected = resolve(base, expandHome(customCwd))
    if (!isDirectory(selected)) throw new Error(`工作目录不存在或不是文件夹：${selected}`)
    return selected
  }
  if (isDirectory(base)) return base
  return isDirectory(homedir()) ? homedir() : process.cwd()
}

/** Validate and normalize one CLI agent entry. */
export function cleanAgent(value, index = 0) {
  if (value === null || typeof value !== 'object') throw new Error('无效的入口配置')
  const rawCommand = typeof value.command === 'string' ? value.command.trim() : ''
  if (!rawCommand || rawCommand.length > 256 || /[\r\n\0]/.test(rawCommand)) {
    throw new Error('终端指令须为 1–256 个单行字符')
  }
  const fallbackName = rawCommand.split(/\s+/)[0].slice(0, 24)
  const rawName = typeof value.name === 'string' && value.name.trim() !== '' ? value.name.trim() : fallbackName
  if (!rawName || rawName.length > 24) throw new Error('入口名称须为 1–24 个字符')
  const rawId = typeof value.id === 'string' && value.id.trim() !== '' ? value.id.trim() : ''
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(rawId)) throw new Error('入口 ID 无效')
  const builtin = BUILTINS.find((item) => item.id === rawId)
  if (value.color !== undefined && (typeof value.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value.color))) throw new Error('颜色须为 #RRGGBB 格式')
  const color = value.color?.toLowerCase() ?? builtin?.color ?? CUSTOM_COLORS[index % CUSTOM_COLORS.length]
  const builtinId = builtin?.id ?? (BUILTINS.some((item) => item.id === value.builtinId) ? value.builtinId : undefined)
  return { id: rawId, name: rawName, command: rawCommand, color, enabled: value.enabled !== false, ...(builtinId ? { builtinId } : {}) }
}

/** Return fresh default settings. */
export function defaultSettings() {
  return {
    version: 4,
    agents: BUILTINS.map((item) => ({ ...item, enabled: true, builtinId: item.id })),
    activeId: 'claude',
    defaultId: null,
    cwd: '',
  }
}

/** Upgrade old defaults without overwriting custom labels/colors/order or duplicating a manually added Pi. */
export function migrateSettings(raw) {
  const legacyColors = { claude: '#d97757', codex: '#10a37f', agy: '#4285f4' }
  let agents = raw.agents.map((agent) => {
    const builtin = BUILTINS.find((item) => item.id === agent.id)
      ?? (agent.command?.trim() === 'pi' && String(agent.name).toLowerCase() === 'pi' ? BUILTINS[3] : null)
    if (!builtin) return agent
    return {
      ...agent,
      name: agent.name === builtin.command ? builtin.name : agent.name,
      color: agent.color === legacyColors[agent.id] || (builtin.id === 'pi' && agent.color === '#06b6d4') ? builtin.color : agent.color,
    }
  })
  const hasPi = agents.some((agent) => agent.id === 'pi' || agent.command?.trim() === 'pi')
  if (!hasPi && agents.length < 24) agents = [...agents, { ...BUILTINS[3] }]
  return { ...raw, version: 2, agents }
}

/** Version 3 changes only the old default label, never a deliberately customized name/command. */
function migrateAntigravity(settings) {
  return {
    ...settings, version: 3,
    agents: settings.agents.map((agent) => agent?.id === 'agy' && agent.command === 'agy' && ['agy', 'Agy'].includes(agent.name)
      ? { ...agent, name: 'Antigravity' } : agent),
  }
}

/** Validate and normalize a settings object or JSON string. */
export function parseSettings(input) {
  if (input === null || input === undefined || input === '') return defaultSettings()
  let raw = typeof input === 'string' ? JSON.parse(input) : input
  if (raw === null || typeof raw !== 'object' || ![1, 2, 3, 4].includes(raw.version) || !Array.isArray(raw.agents)) {
    throw new Error('不支持的配置格式')
  }
  if (raw.agents.some((agent) => !agent || typeof agent !== 'object')) throw new Error('无效的入口配置')
  if (raw.agents.length > 0 && raw.version === 1) raw = migrateSettings(raw)
  if (raw.version < 3) raw = migrateAntigravity(raw)
  if (raw.version < 4 && raw.agents.length) {
    const agents = raw.agents.map((agent) => !agent.builtinId && agent.command === 'pi' && agent.name?.toLowerCase() === 'pi' ? { ...agent, builtinId: 'pi' } : agent)
    for (const builtin of BUILTINS) if (!agents.some((agent) => agent.id === builtin.id || agent.builtinId === builtin.id) && agents.length < 24) agents.push({ ...builtin, enabled: false, builtinId: builtin.id })
    raw = { ...raw, agents }
  }
  if (raw.agents.length === 0) throw new Error('至少保留一个 Agent 入口')
  if (raw.agents.length > 24) throw new Error('最多支持 24 个 Agent 入口')
  const ids = new Set()
  const agents = raw.agents.map((item, idx) => {
    const cleaned = cleanAgent(item, idx)
    if (ids.has(cleaned.id)) throw new Error(`入口 ID 重复：${cleaned.id}`)
    ids.add(cleaned.id)
    return cleaned
  })
  const activeId = typeof raw.activeId === 'string' && ids.has(raw.activeId) ? raw.activeId : agents[0].id
  const defaultId = typeof raw.defaultId === 'string' && ids.has(raw.defaultId) ? raw.defaultId : null
  const cwd = typeof raw.cwd === 'string' && !/[\r\n\0]/.test(raw.cwd) ? raw.cwd.trim().slice(0, 512) : ''
  return { version: 4, agents, activeId, defaultId, cwd }
}

/** Read persisted settings from disk, falling back to defaults when absent or corrupt. */
export function readSettings(file = SETTINGS_FILE()) {
  try {
    if (!existsSync(file)) return defaultSettings()
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const settings = parseSettings(raw)
    if (raw.version < 4) {
      try { writeSettings(settings, file) } catch { /* Read-only storage must not discard valid preferences. */ }
    }
    return settings
  } catch {
    return defaultSettings()
  }
}

/** Atomically write validated settings to disk. */
export function writeSettings(settings, file = SETTINGS_FILE()) {
  const normalized = parseSettings(settings)
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temp = `${file}.tmp`
  writeFileSync(temp, `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o600 })
  renameSync(temp, file)
  return normalized
}

/** Extract the executable base name without `.exe`. */
function shellKind(shellPath) {
  const base = String(shellPath).slice(Math.max(String(shellPath).lastIndexOf('/'), String(shellPath).lastIndexOf('\\')) + 1)
  return base.toLowerCase().replace(/\.exe$/u, '')
}

/**
 * Argv for an interactive login shell. The CLI command is typed into that
 * shell afterwards, so functions and aliases from the user's rc files run
 * the same way they do in a normal terminal. A `-c` script would skip that.
 */
export function buildShellLaunch(shellPath, platform = process.platform) {
  const kind = shellKind(shellPath)
  if (kind === 'cmd' || kind === 'pwsh' || kind === 'powershell') {
    if (kind === 'cmd') return { path: shellPath, name: kind, argv: [shellPath, '/d', '/q'] }
    return { path: shellPath, name: kind, argv: [shellPath, '-NoLogo'] }
  }
  if (kind === 'fish') return { path: shellPath, name: kind, argv: [shellPath, '-il'] }
  if (kind === 'zsh' || kind === 'bash') return { path: shellPath, name: kind, argv: [shellPath, '-il'] }
  return { path: shellPath, name: kind || 'sh', argv: [shellPath, '-i'] }
}

/** Bytes typed once into a fresh shell so the configured command starts. */
export function commandKeystrokes(command) {
  const trimmed = String(command ?? '').trim()
  if (trimmed === '') return ''
  return `${trimmed}\r`
}

const execFileAsync = promisify(execFile)
let loginPathProbe

/** Run in the user's shell, emitting a private completion marker even when the CLI returns to a live shell. */
export function agentKeystrokes(command, shell, token) {
  if (!command?.trim()) return ''
  const marker = `\\033]777;dsh-agents-${token};exit;0\\007`
  if (shell === 'cmd') return `call ${command} & echo %DSH_AGENTS_ESC%]777;dsh-agents-${token};exit;0%DSH_AGENTS_BEL%\r`
  if (shell === 'pwsh' || shell === 'powershell') return `${command}; [Console]::Write("$([char]27)]777;dsh-agents-${token};exit;0$([char]7)")\r`
  const escaped = shell === 'fish' ? command.replaceAll('\\', '\\\\').replaceAll("'", "\\'") : command.replaceAll("'", "'\\''")
  return `eval '${escaped}'; printf '${marker}'\r`
}

/** Strip only our private OSC marker, retaining incomplete markers across PTY chunks. */
export function createCompletionFilter(token, completed) {
  const prefix = `\x1b]777;dsh-agents-${token};exit;`
  let pending = ''
  return {
    push(text, final = false) {
      pending += text
      let output = ''
      while (pending) {
        const index = pending.indexOf(prefix)
        if (index >= 0) {
          output += pending.slice(0, index)
          pending = pending.slice(index)
          const end = pending.indexOf('\x07', prefix.length)
          if (end === -1) {
            if (pending.length > prefix.length + 16 || final) { output += pending; pending = '' }
            break
          }
          completed()
          pending = pending.slice(end + 1)
        } else {
          let held = 0
          if (!final) for (let size = Math.min(prefix.length - 1, pending.length); size > 0; size--) {
            if (prefix.startsWith(pending.slice(-size))) { held = size; break }
          }
          output += pending.slice(0, pending.length - held)
          pending = held ? pending.slice(-held) : ''
          break
        }
      }
      return output
    },
  }
}

/** Probe once without blocking the Host event loop (GUI launches may lack the user's PATH). */
export function resolveLoginPath(shellPath) {
  if (process.platform === 'win32') return Promise.resolve(undefined)
  loginPathProbe ??= execFileAsync(shellPath || process.env.SHELL || '/bin/zsh', ['-lc', 'printf %s "$PATH"'], {
    encoding: 'utf8', timeout: 4000, maxBuffer: 64 * 1024, windowsHide: true,
  }).then(({ stdout }) => stdout.trim() || undefined, () => undefined)
  return loginPathProbe
}

/** Build the environment dictionary passed to `subprocess.spawnTerminal`. */
export function buildTerminalEnv(shellPath, baseEnv = process.env, platform = process.platform, loginPath) {
  const env = {}
  for (const [key, value] of Object.entries(baseEnv)) {
    if (typeof value !== 'string') continue
    if (key === 'ELECTRON_RUN_AS_NODE' || key.startsWith('DSH_DESKTOP_')) continue
    env[key] = value
  }
  const login = platform === 'win32' ? undefined : loginPath
  if (login) {
    const current = env.PATH || ''
    const merged = new Set([...login.split(delimiter), ...current.split(delimiter)].filter(Boolean))
    env.PATH = [...merged].join(delimiter)
  }
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  return env
}

/** Try loading the official `@xterm/headless` + `@xterm/addon-serialize` from the Host runtime. */
function loadHeadlessAddons() {
  const candidates = [process.argv[1], import.meta.url].filter(Boolean)
  for (const anchorPath of candidates) {
    try {
      const req = createRequire(anchorPath)
      const pkgPath = req.resolve('@deepseek-ai/dsh-api-terminal-controller/package.json')
      const ctrlReq = createRequire(pkgPath)
      const { Terminal } = ctrlReq('@xterm/headless')
      const { SerializeAddon } = ctrlReq('@xterm/addon-serialize')
      if (typeof Terminal === 'function' && typeof SerializeAddon === 'function') {
        return { Terminal, SerializeAddon }
      }
    } catch {
      // Fallback to bounded ring buffer in bare Node test runs.
    }
  }
  return null
}

const headlessAddons = loadHeadlessAddons()

/** Create a screen buffer that mirrors official BrowserTerminal serialization. */
export function createScreenBuffer(cols, rows, scrollback = LIMITS.scrollback) {
  if (headlessAddons !== null) {
    const screen = new headlessAddons.Terminal({ cols, rows, scrollback, allowProposedApi: true })
    const serializer = new headlessAddons.SerializeAddon()
    screen.loadAddon(serializer)
    return {
      write(data) {
        return new Promise((resolve) => screen.write(data, resolve))
      },
      resize(nextCols, nextRows) {
        screen.resize(nextCols, nextRows)
      },
      serialize() {
        return serializer.serialize()
      },
      dispose() {
        screen.dispose()
      },
    }
  }
  let buffer = ''
  const maxChars = 256 * 1024
  return {
    async write(data) {
      buffer += data
      if (buffer.length > maxChars) buffer = buffer.slice(buffer.length - maxChars)
    },
    resize() {},
    serialize() {
      return buffer
    },
    dispose() {
      buffer = ''
    },
  }
}

/** Clamp terminal dimensions to valid bounds. */
export function clampDimensions(cols, rows) {
  const c = Number.isSafeInteger(cols) ? Math.min(Math.max(cols, 2), LIMITS.maxCols) : 100
  const r = Number.isSafeInteger(rows) ? Math.min(Math.max(rows, 1), LIMITS.maxRows) : 30
  return { cols: c, rows: r }
}

/** Resolve the user's preferred shell executable via the official subprocess service. */
async function resolveUserShell(subprocess) {
  try {
    if (typeof subprocess?.terminalEnvironment === 'function') {
      const env = await subprocess.terminalEnvironment()
      const candidate = env?.defaultShell || process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh')
      if (typeof subprocess?.resolveExecutable === 'function') {
        try {
          return await subprocess.resolveExecutable(candidate)
        } catch {
          return candidate
        }
      }
      return candidate
    }
  } catch {
    // Fallback below.
  }
  return process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh')
}

/** One persistent CLI terminal process and its SSE followers. */
export class ManagedTerminal {
  constructor(id, handle, info, scrollback = LIMITS.scrollback) {
    this.id = id
    this.handle = handle
    this.info = info
    this.screen = createScreenBuffer(info.cols, info.rows, scrollback)
    this.followers = new Set()
    this.sequence = 0
    this.operations = Promise.resolve()
    this.exited = false
    this.completionToken = info.completionToken
    delete info.completionToken
    this.closing = null
    this.completion = this.completionToken ? createCompletionFilter(this.completionToken, () => {
      this.info = { ...this.info, agentState: 'exited' }
      this.broadcastState()
    }) : null
    this.drained = this.consume()
  }

  enqueue(op) {
    const next = this.operations.then(op)
    this.operations = next.catch(() => {})
    return next
  }

  broadcast(frame) {
    const payload = `data: ${JSON.stringify(frame)}\n\n`
    for (const res of [...this.followers]) {
      try {
        if (res.destroyed || (res.writableLength ?? 0) > LIMITS.maxBufferedBytes) {
          this.followers.delete(res)
          res.destroy?.()
          continue
        }
        res.write(payload)
      } catch {
        this.followers.delete(res)
      }
    }
  }

  broadcastState() {
    const writable = !this.exited && this.closing === null && this.info.state === 'running'
    this.broadcast({ type: 'state', info: this.info, writable })
  }

  async attachSse(res) {
    let attached = false
    const detach = () => {
      attached = false
      this.followers.delete(res)
    }
    res.once?.('close', detach)
    await this.enqueue(() => {
      const writable = !this.exited && this.closing === null && this.info.state === 'running'
      if (res.destroyed || res.writableEnded || this.closing !== null) return
      const snapshot = {
        type: 'snapshot',
        sequence: this.sequence,
        screen: this.screen.serialize(),
        info: this.info,
        writable,
        environment: {
          cwd: this.info.cwd,
          maxCols: LIMITS.maxCols,
          maxRows: LIMITS.maxRows,
          scrollback: LIMITS.scrollback,
          maxInputBytes: LIMITS.maxInputBytes,
          maxBufferedBytes: LIMITS.maxBufferedBytes,
        },
      }
      // Snapshot and subscription share the output queue: no missing or duplicated frames.
      this.followers.add(res)
      attached = true
      try {
        res.write(`data: ${JSON.stringify(snapshot)}\n\n`)
      } catch (error) {
        detach()
        throw error
      }
    })
    if (!attached) res.off?.('close', detach)
    return () => {
      detach()
      res.off?.('close', detach)
    }
  }

  async write(data) {
    if (typeof data !== 'string' || data.length === 0) return
    if (Buffer.byteLength(data, 'utf8') > LIMITS.maxInputBytes) {
      throw new Error('输入超出单次长度上限')
    }
    await this.enqueue(async () => {
      if (this.exited || this.closing !== null || this.info.state !== 'running') {
        throw new Error('终端未在运行状态')
      }
      await this.handle.write(data)
    })
  }

  async resize(cols, rows) {
    const dims = clampDimensions(cols, rows)
    await this.enqueue(async () => {
      if (this.exited || this.closing !== null || this.info.state !== 'running') return
      if (this.info.cols === dims.cols && this.info.rows === dims.rows) return
      await this.handle.resize(dims.cols, dims.rows)
      this.screen.resize(dims.cols, dims.rows)
      this.info = { ...this.info, cols: dims.cols, rows: dims.rows }
      this.broadcastState()
    })
  }

  async consume() {
    const decoder = new TextDecoder('utf-8', { ignoreBOM: true })
    const outcome = Promise.resolve(this.handle.done).then(
      (value) => {
        this.exited = true
        return { value }
      },
      (error) => {
        this.exited = true
        return { error }
      },
    )
    try {
      if (this.handle.output) {
        for await (const chunk of this.handle.output) {
          const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
          if (text.length > 0) await this.pushOutput(text)
        }
      }
      const tail = decoder.decode()
      await this.pushOutput(tail, true)
      const result = await outcome
      if ('error' in result) throw result.error
      this.info = { ...this.info, state: 'exited', exitCode: result.value?.exitCode ?? 0 }
    } catch (error) {
      this.info = {
        ...this.info,
        state: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }
    }
    this.broadcastState()
  }

  async pushOutput(data, final = false) {
    await this.enqueue(async () => {
      const visible = this.completion ? this.completion.push(data, final) : data
      if (!visible) return
      await this.screen.write(visible)
      this.broadcast({ type: 'output', sequence: ++this.sequence, data: visible })
    })
  }

  close() {
    if (this.closing !== null) return this.closing
    clearTimeout(this.commandTimer)
    this.closing = (async () => {
      try {
        await this.handle.terminate?.()
      } catch {
        // Ignore termination errors on already exited processes.
      }
      await this.drained
      for (const res of [...this.followers]) {
        try {
          res.end()
        } catch {
          // Ignore closed sockets.
        }
      }
      this.followers.clear()
      this.screen.dispose()
    })()
    return this.closing
  }
}

/** Read a JSON request body safely. */
async function readJsonBody(req, limit = 256 * 1024) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buf.length
      if (size > limit) {
        req.destroy?.()
        return null
      }
      chunks.push(buf)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return null
  }
}

/** Send one JSON HTTP response. */
function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(payload))
}

/** Check whether the request carries the plugin guard header. */
function guarded(req) {
  return req.headers?.[GUARD_HEADER] === '1'
}

/** Create a self-contained controller over a subprocess service for Host or tests. */
export function createAgentsCliController(subprocess, { defaultDirectory = () => process.cwd() } = {}) {
  const resolveCwd = (cwd = '') => resolveWorkingDirectory(cwd, typeof defaultDirectory === 'function' ? defaultDirectory() : defaultDirectory)
  const terminals = new Map()
  const pending = new Map()
  let disposed = false

  // Serialize opens/restarts/closes per id, without blocking unrelated agents.
  function schedule(id, operation) {
    const task = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(operation)
    pending.set(id, task)
    void task.finally(() => { if (pending.get(id) === task) pending.delete(id) }).catch(() => {})
    return task
  }

  function openTerminal(options) {
    return schedule(options.id, () => open(options))
  }

  async function open({ id, command, title, cwd, cols, rows, restart = false, deferCommand = false, resume = false }) {
    if (disposed) throw new Error('终端控制器已关闭')
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
      throw new Error('无效的终端 ID')
    }
    if (restart) {
      await close(id)
    }
    const existing = terminals.get(id)
    if (existing !== undefined && !existing.exited && existing.info.state === 'running' && !(resume && existing.info.agentState === 'exited')) {
      if (Number.isSafeInteger(cols) && Number.isSafeInteger(rows)) {
        await existing.resize(cols, rows)
      }
      return existing
    }
    if (existing !== undefined && !resume && !restart) return existing
    if (existing !== undefined) {
      await close(id)
    }
    {
      if (typeof subprocess?.spawnTerminal !== 'function') {
        throw new Error('当前 DSH 宿主未提供 subprocess.spawnTerminal 终端服务')
      }
      const dims = clampDimensions(cols, rows)
      const resolvedCwd = resolveCwd(cwd)
      const shellPath = await resolveUserShell(subprocess)
      const launch = buildShellLaunch(shellPath)
      const env = buildTerminalEnv(shellPath, process.env, process.platform, await resolveLoginPath(shellPath))
      if (launch.name === 'cmd') { env.DSH_AGENTS_ESC = '\x1b'; env.DSH_AGENTS_BEL = '\x07' }
      const handle = await subprocess.spawnTerminal({
        argv: launch.argv,
        cwd: resolvedCwd,
        cols: dims.cols,
        rows: dims.rows,
        terminalType: 'xterm-256color',
        env,
        shellActivity: true,
        graceMs: LIMITS.disposeGraceMs,
      })
      const info = {
        id,
        shell: { path: launch.path, name: launch.name, args: launch.argv.slice(1) },
        title: title || command || launch.name,
        command: command || '',
        cwd: resolvedCwd,
        cols: dims.cols,
        rows: dims.rows,
        state: 'running',
        agentState: command ? 'running' : 'exited',
        completionToken: randomBytes(12).toString('hex'),
        exitCode: null,
      }
      const managed = new ManagedTerminal(id, handle, info)
      terminals.set(id, managed)
      const keystrokes = agentKeystrokes(command, launch.name, managed.completionToken)
      managed.startCommand = () => {
        if (managed.commandStarted) return
        managed.commandStarted = true
        clearTimeout(managed.commandTimer)
        if (keystrokes) void managed.write(keystrokes).catch(() => {})
      }
      if (deferCommand) {
        // Attach the renderer before CLI startup so OSC color/cursor probes receive timely replies.
        managed.commandTimer = setTimeout(managed.startCommand, 2000)
        managed.commandTimer.unref?.()
      } else {
        managed.startCommand()
      }
      return managed
    }
  }

  function closeTerminal(id) {
    return schedule(id, () => close(id))
  }

  async function close(id) {
    const existing = terminals.get(id)
    if (existing !== undefined) {
      terminals.delete(id)
      await existing.close()
      return true
    }
    return false
  }

  async function closeAll(exceptId = null) {
    const ids = [...new Set([...terminals.keys(), ...pending.keys()])].filter((id) => id !== exceptId)
    await Promise.allSettled(ids.map((id) => closeTerminal(id)))
  }

  async function dispose() {
    disposed = true
    await closeAll()
  }

  function listStatus() {
    const result = {}
    for (const [id, term] of terminals.entries()) {
      result[id] = {
        id,
        state: term.info.state,
        agentState: term.info.agentState,
        cwd: term.info.cwd,
        command: term.info.command,
        exitCode: term.info.exitCode,
        error: term.info.error,
      }
    }
    return result
  }

  function getTerminal(id) {
    return terminals.get(id)
  }

  return {
    openTerminal,
    closeTerminal,
    closeAll,
    dispose,
    listStatus,
    getTerminal,
    resolveCwd,
  }
}

/** A single quoted leading executable can be detected without ever running the user's command. */
export function detectionTarget(command) {
  const text = command.trim()
  const quoted = text.match(/^["']([^"']+)["'](?:\s|$)/)
  if (quoted) return quoted[1]
  const simple = text.match(/^([a-zA-Z0-9_@./\\:\\-]+)(?:\s|$)/)
  return simple?.[1] || null
}

/** Probe all entries in one login/interactive shell; never execute an agent as a detection side effect. */
export function detectionScript(agents, kind, nonce) {
  const prefix = `DSH_AGENTS_${nonce}`
  const lines = []
  for (let index = 0; index < agents.length; index++) {
    const target = detectionTarget(agents[index].command)
    if (!target || /[\r\n\0]/.test(target)) continue
    const yes = `${prefix}:${index}:yes`, no = `${prefix}:${index}:no`
    if (kind === 'cmd') {
      if (!/^[a-zA-Z0-9_.@:/\\\\ -]+$/.test(target)) continue
      lines.push(`where "${target}" >nul 2>nul && echo ${yes} || echo ${no}`)
    } else if (kind === 'pwsh' || kind === 'powershell') {
      const quoted = target.replaceAll("'", "''")
      lines.push(`if (Get-Command -Name '${quoted}' -ErrorAction SilentlyContinue) { [Console]::WriteLine('${yes}') } else { [Console]::WriteLine('${no}') }`)
    } else {
      const quoted = kind === 'fish' ? target.replaceAll('\\', '\\\\').replaceAll("'", "\\'") : target.replaceAll("'", "'\\''")
      lines.push(kind === 'fish' ? `if type -q -- '${quoted}'; printf '%s\\n' '${yes}'; else; printf '%s\\n' '${no}'; end`
        : `if command -v '${quoted}' >/dev/null 2>&1; then printf '%s\\n' '${yes}'; else printf '%s\\n' '${no}'; fi`)
    }
  }
  return lines.join('\n')
}

export function createAvailabilityDetector(subprocess, { run = execFileAsync, platform = process.platform, ttlMs = 30000 } = {}) {
  let cache, pending
  return async (agents) => {
    const key = JSON.stringify(agents.map(({ id, command }) => [id, command]))
    if (cache?.key === key && Date.now() - cache.at < ttlMs) return cache.value
    if (pending?.key === key) return pending.promise
    const promise = (async () => {
      const value = Object.fromEntries(agents.map((agent) => [agent.id, { installed: null }]))
      try {
        const shell = await resolveUserShell(subprocess), kind = shellKind(shell), nonce = randomBytes(8).toString('hex')
        const script = detectionScript(agents, kind, nonce)
        if (!script) return value
        const argv = kind === 'cmd' ? ['/d', '/q', '/c', script.replaceAll('\n', ' & ')]
          : kind === 'pwsh' || kind === 'powershell' ? ['-NoLogo', '-NonInteractive', '-Command', script]
            : ['-ilc', script]
        const { stdout } = await run(shell, argv, { encoding: 'utf8', timeout: 6000, maxBuffer: 128 * 1024, windowsHide: true, env: buildTerminalEnv(shell, process.env, platform) })
        for (const match of stdout.matchAll(new RegExp(`DSH_AGENTS_${nonce}:(\\d+):(yes|no)`, 'g'))) {
          const agent = agents[Number(match[1])]
          if (agent) value[agent.id] = { installed: match[2] === 'yes' }
        }
      } catch { /* Uncertain detection must not hide a user's working custom command. */ }
      cache = { key, at: Date.now(), value }
      return value
    })()
    pending = { key, promise }
    try { return await promise } finally { if (pending?.promise === promise) pending = null }
  }
}

/** Build HTTP/SSE routes for the Host webServer. */
export function createRoutes(controller, { detect = async () => ({}) } = {}) {
  return [
    {
      path: ROUTES.state,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const settings = readSettings()
        return json(res, 200, {
          ok: true,
          panelId: PANEL_ID,
          settings,
          availability: await detect(settings.agents),
          defaultCwd: controller.resolveCwd(),
          terminals: controller.listStatus(),
        })
      },
    },
    {
      path: ROUTES.settings,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const body = await readJsonBody(req)
        if (body === null || typeof body !== 'object') return json(res, 400, { ok: false, error: 'invalid body' })
        try {
          const current = readSettings()
          const merged = {
            ...current,
            ...(body.settings !== null && typeof body.settings === 'object' ? body.settings : body),
            version: 4,
          }
          controller.resolveCwd(merged.cwd)
          const saved = writeSettings(merged)
          // Clean up terminals for removed agent entries.
          const validIds = new Set(saved.agents.filter((agent) => agent.enabled).map((a) => a.id))
          for (const id of Object.keys(controller.listStatus())) {
            if (!validIds.has(id)) await controller.closeTerminal(id)
          }
          return json(res, 200, {
            ok: true,
            settings: saved,
            availability: await detect(saved.agents),
            defaultCwd: controller.resolveCwd(),
            terminals: controller.listStatus(),
          })
        } catch (error) {
          return json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      path: ROUTES.open,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const body = await readJsonBody(req)
        if (body === null || typeof body !== 'object') return json(res, 400, { ok: false, error: 'invalid body' })
        const settings = readSettings()
        const id = typeof body.id === 'string' ? body.id.trim() : ''
        const agent = settings.agents.find((item) => item.id === id)
        if (agent === undefined) {
          return json(res, 404, { ok: false, error: `未找到入口：${id}` })
        }
        if (!agent.enabled) return json(res, 409, { ok: false, error: '入口已停用，请先恢复' })
        try {
          const term = await controller.openTerminal({
            id: agent.id,
            command: agent.command,
            title: agent.name,
            cwd: settings.cwd,
            cols: body.cols,
            rows: body.rows,
            restart: body.restart === true,
            deferCommand: true,
            resume: body.resume === true,
          })
          return json(res, 200, {
            ok: true,
            info: term.info,
            environment: {
              cwd: term.info.cwd,
              maxCols: LIMITS.maxCols,
              maxRows: LIMITS.maxRows,
              scrollback: LIMITS.scrollback,
              maxInputBytes: LIMITS.maxInputBytes,
              maxBufferedBytes: LIMITS.maxBufferedBytes,
            },
          })
        } catch (error) {
          return json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      path: ROUTES.stream,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const body = await readJsonBody(req)
        const url = new URL(req.url || ROUTES.stream, 'http://127.0.0.1')
        const id = (typeof body?.id === 'string' && body.id) || url.searchParams.get('id') || ''
        const term = controller.getTerminal(id)
        if (term === undefined) {
          return json(res, 404, { ok: false, error: 'terminal not found' })
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        })
        res.flushHeaders?.()
        const detach = await term.attachSse(res)
        if (res.destroyed || res.writableEnded) { detach(); return }
        term.startCommand?.()
        const beat = setInterval(() => {
          try { res.write(': ping\n\n') } catch { stop() }
        }, 25000)
        beat.unref?.()
        const stop = () => {
          clearInterval(beat)
          detach()
        }
        // IncomingMessage 'close' may mean the POST body completed, not that SSE disconnected.
        req.on?.('aborted', stop)
        res.on?.('close', stop)
      },
    },
    {
      path: ROUTES.input,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const body = await readJsonBody(req)
        if (body === null || typeof body !== 'object') return json(res, 400, { ok: false, error: 'invalid body' })
        const id = typeof body.id === 'string' ? body.id : ''
        const term = controller.getTerminal(id)
        if (term === undefined) return json(res, 404, { ok: false, error: 'terminal not found' })
        try {
          if (body.type === 'write') {
            await term.write(typeof body.data === 'string' ? body.data : '')
          } else if (body.type === 'resize') {
            await term.resize(body.cols, body.rows)
          } else {
            return json(res, 400, { ok: false, error: 'unsupported input command' })
          }
          return json(res, 200, { ok: true })
        } catch (error) {
          return json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
      },
    },
    {
      path: ROUTES.close,
      method: 'POST',
      handler: async (req, res) => {
        if (!guarded(req)) return json(res, 403, { ok: false, error: 'missing plugin header' })
        const body = await readJsonBody(req)
        if (body === null || typeof body !== 'object') return json(res, 400, { ok: false, error: 'invalid body' })
        if (body.allBackground === true) {
          const exceptId = typeof body.exceptId === 'string' ? body.exceptId : null
          await controller.closeAll(exceptId)
          return json(res, 200, { ok: true, terminals: controller.listStatus() })
        }
        const id = typeof body.id === 'string' ? body.id : ''
        const closed = await controller.closeTerminal(id)
        return json(res, 200, { ok: true, closed, terminals: controller.listStatus() })
      },
    },
  ]
}

/** Cordis Host entry. */
export function apply(ctx) {
  const controller = createAgentsCliController(ctx.subprocess, { defaultDirectory: () => ctx.workingDirectory.defaultDirectory })
  const detect = createAvailabilityDetector(ctx.subprocess)
  for (const route of createRoutes(controller, { detect })) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'exact',
      path: route.path,
      handler: (req, res) => {
        const pathname = (req.url || '').split('?')[0]
        if (pathname !== route.path) {
          res.writeHead(404)
          res.end()
          return
        }
        if (req.method !== route.method) {
          res.writeHead(405, { allow: route.method })
          res.end()
          return
        }
        Promise.resolve(route.handler(req, res)).catch((error) => {
          if (!res.headersSent) {
            json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
          }
        })
      },
    }), `dsh-agents-cli: ${route.path}`)
  }
  ctx.effect(() => () => controller.dispose(), 'dsh-agents-cli: dispose terminals')
}
