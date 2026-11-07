/** dsh-agents-cli browser half. Sessions outlive React panel mounts, not the plugin. */
window.__ModuleLoader__.load({
  id: 'dsh-agents-cli',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const runtime = globalThis.__dshAgentsXterm
    const PANEL_ID = 'agents-cli'
    const GUARD = 'x-dsh-agents-cli'
    const STYLE_ID = 'dsh-agents-cli-style'
    const XTERM_STYLE_ID = 'dsh-agents-cli-xterm'
    const ROUTES = Object.fromEntries(['state', 'settings', 'open', 'stream', 'input'].map((key) => [key, `/api/dsh-agents-cli/${key}`]))
    const BUILTINS = [
      { id: 'claude', name: 'Claude', command: 'claude', color: '#e88b3a' },
      { id: 'codex', name: 'Codex', command: 'codex', color: '#4285f4' },
      { id: 'agy', name: 'Antigravity', command: 'agy', color: '#20a56b' },
      { id: 'pi', name: 'Pi', command: 'pi', color: '#df5252' },
    ]
    const CUSTOM_COLORS = ['#8b5cf6', '#ec4899', '#eab308', '#06b6d4', '#f97316', '#14b8a6', '#6366f1']
    const CSS = `
.ac{box-sizing:border-box;display:flex;flex-direction:column;width:100%;height:100%;min-width:0;min-height:0;color:var(--dsw-alias-label-primary,#202124);background:var(--dsw-alias-bg-base,#fff);font:13px/1.5 var(--dsw-font-family,-apple-system,BlinkMacSystemFont,sans-serif);overflow:hidden}
.ac *,.ac-dialog *{box-sizing:border-box}
.ac button,.ac input,.ac select,.ac-dialog button,.ac-dialog input{-webkit-app-region:no-drag;font:inherit}
.ac button,.ac-dialog button{cursor:pointer}.ac button:disabled,.ac-dialog button:disabled{opacity:.35;cursor:default}
.ac button:focus-visible,.ac select:focus-visible,.ac-dialog button:focus-visible,.ac-dialog input:focus-visible{outline:2px solid var(--dsw-focus-ring-color,#596bdf);outline-offset:2px}
.ac-bar{height:48px;min-height:48px;flex:none;display:grid;grid-template-columns:minmax(max(112px,calc(var(--dsh-frame-leading-clearance,0px) + 12px)),1fr) minmax(0,max-content) minmax(max(112px,calc(var(--dsh-frame-leading-clearance,0px) + 12px)),1fr);align-items:center;gap:8px;padding:6px 14px;border-bottom:1px solid var(--dsw-alias-border-l3,#ddd)}
.ac-leading{min-width:0;height:1px}
.ac-tabs{grid-column:2;justify-self:center;display:flex;gap:3px;max-width:100%;min-width:0;overflow-x:auto;scrollbar-width:thin;padding:3px;border-radius:11px;background:var(--dsw-alias-interactive-bg-hover,#8881)}
.ac-tabs>button{display:flex;align-items:center;gap:6px;flex:none;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary,#666);padding:5px 10px;font-size:12px;white-space:nowrap}
.ac-tabs>button[aria-selected=true]{background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#202124);border-color:var(--dsw-alias-border-l3,#ddd)}
.ac-dot{width:6px;height:6px;border-radius:50%;flex:none}
.ac-actions{grid-column:3;justify-self:end;display:flex;align-items:center;gap:4px}
.ac-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,#666);padding:0}
.ac-icon:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8881);color:var(--dsw-alias-label-primary,#202124)}
.ac-stage{position:relative;flex:1;min-width:0;min-height:0;background:var(--dsw-alias-bg-base,#fff)}
.ac-screen{position:absolute;inset:0;display:flex;flex-direction:column;min-width:0;min-height:0}.ac-screen[hidden]{display:none!important}
.ac-term{flex:1;min-width:0;min-height:0;padding:8px 8px 20px;overflow:hidden;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#202124)}
.ac-term-body{width:100%;height:100%;overflow:hidden}.ac-term .xterm{height:100%}.ac-term .xterm-viewport{background:var(--dsw-alias-bg-base,#fff)!important}
.ac-fail,.ac-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px;text-align:center;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-bg-base,#fff)}
.ac-fail{position:absolute;inset:0}.ac-empty{height:100%}.ac-fail h2,.ac-empty h2{margin:0;font-size:16px;font-weight:500;color:var(--dsw-alias-label-primary,#202124)}.ac-fail p,.ac-empty p{margin:0;max-width:440px;line-height:1.7}
.ac-primary{border:0;border-radius:7px;background:#596bdf;color:#fff;padding:7px 14px}
.ac-link{border:0;background:none;color:var(--dsw-alias-state-business-primary,#596bdf);padding:0;font-size:12px}
.ac-dot[data-status]:not([data-status=running]){background:var(--dsw-alias-label-tertiary,#9ca3af)!important}
.ac-color{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary,#666);font-size:12px}.ac-dialog input.ac-color-input{width:28px;height:28px;flex:none;padding:2px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:6px;background:transparent;cursor:pointer}
.ac-hint{max-width:100%;overflow-wrap:anywhere}.ac-row[data-disabled=true] b,.ac-row[data-disabled=true] small{opacity:.45}.ac-row[data-disabled=true] .ac-color-input{filter:grayscale(1);opacity:.5}.ac-status{display:inline-block;margin-top:3px;padding:1px 5px;border-radius:4px;font-size:10px;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-interactive-bg-hover,#8881)}.ac-status[data-missing=true]{border:1px dashed var(--dsw-alias-border-l3,#bbb);background:transparent}.ac-row[data-missing=true] .ac-color-input{outline:1px dashed var(--dsw-alias-label-secondary,#999);outline-offset:2px}
.ac-notice{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:8px;max-width:90%;padding:6px 10px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:8px;background:var(--dsw-alias-bg-base,#fff);color:#c35f65}
.ac-dialog{width:min(560px,calc(100vw - 48px));max-height:calc(100vh - 96px);overflow:auto;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:14px;padding:22px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#202124);box-shadow:0 16px 64px #0002;font:13px/1.5 var(--dsw-font-family,sans-serif)}
.ac-dialog::backdrop{background:#151b2e44}.ac-dialog h2{margin:0;font-size:17px;font-weight:600}.ac-dialog p{margin:6px 0 0;color:var(--dsw-alias-label-secondary,#666);font-size:12px;line-height:1.7}
.ac-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ac-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l3,#ddd)}
.ac-row b{font-weight:500}.ac-row small{display:block;max-width:280px;overflow:hidden;color:var(--dsw-alias-label-secondary,#666);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.ac-row>div{flex:1;min-width:0}.ac-edit{display:flex;flex-direction:column;gap:6px}.ac-edit input{width:100%;min-width:0;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:6px;padding:5px 7px;background:var(--dsw-alias-bg-base,#fff);color:inherit}.ac-edit-actions{display:flex;gap:10px}
.ac-field{display:flex;flex-direction:column;gap:4px;margin:14px 0;color:var(--dsw-alias-label-secondary,#666);font-size:12px}.ac-field input,.ac-add input{width:100%;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:6px;padding:7px 9px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#202124)}
.ac-add{display:grid;grid-template-columns:1fr 1.6fr auto auto;gap:8px;align-items:end;margin-top:14px}.ac-dialog .ac-error{color:#c35f65;font-size:12px}
@media(max-width:520px){.ac-bar{grid-template-columns:minmax(96px,1fr) minmax(0,max-content) minmax(96px,1fr);gap:3px;padding:6px}.ac-tabs>button{padding:5px 6px}.ac-add{grid-template-columns:1fr}}
`

    function copy() {
      const zh = String(document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase().startsWith('zh')
      return zh ? {
        label: 'Agents', manage: '设置入口', add: '添加', edit: '编辑', save: '保存', cancel: '取消', remove: '移除', close: '关闭',
        name: '名称', command: '终端指令', color: '颜色', cwd: '启动目录（留空使用 DSH 默认目录）', defaultCwd: 'DSH 默认目录：', cwdNote: '仅影响下次启动。命令或 shell 函数若自行切换目录，以它们为准。', empty: '还没有入口',
        loading: '正在连接终端…', failed: '终端连接中断', retry: '重新连接', exited: '终端已退出', reopen: '重新启动', need: '请填写名称和指令',
        up: '上移', down: '下移', stopped: '已退出，点击入口重新启动', restore: '恢复', disabled: '已停用', missing: '未检测到 CLI', detected: '已检测到', unknown: '检测暂不可用', noAgents: '尚无可用的 CLI 入口', inventory: '安装 CLI 后会自动检测。已停用的入口可在设置中单独恢复。',
        note: '每个入口首次打开时启动，切换入口或离开面板仍继续运行，DSH 重启后才需重新启动。移除仅停用入口并结束对应进程，可单独恢复。编辑指令和目录对下次启动生效。',
      } : {
        label: 'Agents', manage: 'Entry settings', add: 'Add', edit: 'Edit', save: 'Save', cancel: 'Cancel', remove: 'Remove', close: 'Close',
        name: 'Name', command: 'Shell command', color: 'Color', cwd: 'Launch directory (blank uses DSH default)', defaultCwd: 'DSH default directory: ', cwdNote: 'Applies on next launch. Commands and shell functions may change the directory themselves.', empty: 'No entries',
        loading: 'Connecting terminal…', failed: 'Terminal disconnected', retry: 'Reconnect', exited: 'Terminal exited', reopen: 'Start again', need: 'Name and command are required',
        up: 'Move up', down: 'Move down', stopped: 'Exited; click this entry to start again', restore: 'Restore', disabled: 'Disabled', missing: 'CLI not detected', detected: 'Detected', unknown: 'Detection unavailable', noAgents: 'No available CLI entries yet', inventory: 'Newly installed CLIs are detected automatically. Restore disabled entries individually in settings.',
        note: 'Entries start on first use and keep running when switching tabs or panels, until DSH restarts. Removing disables an entry and stops its process; each entry can be restored. Command and directory edits apply on next launch.',
      }
    }

    function ensureStyle() {
      for (const [id, css] of [[STYLE_ID, CSS], [XTERM_STYLE_ID, runtime?.css]]) {
        if (typeof css !== 'string') continue
        let tag = document.getElementById(id)
        if (!tag) { tag = document.createElement('style'); tag.id = id; tag.dataset.plugin = 'dsh-agents-cli'; document.head.appendChild(tag) }
        tag.textContent = css
      }
    }

    async function post(path, body, signal) {
      const response = await fetch(path, {
        method: 'POST', headers: { 'content-type': 'application/json', [GUARD]: '1' }, body: JSON.stringify(body ?? {}), signal,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload || payload.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`)
      return payload
    }

    function Icon(props) {
      return h('svg', { viewBox: '0 0 16 16', width: props?.size || 16, height: props?.size || 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('rect', { x: 1.6, y: 2.2, width: 12.8, height: 11.6, rx: 2 }), h('path', { d: 'M4.2 6.2 6.4 8.2 4.2 10.2M8 10.2h3.2' }))
    }
    function Glyph({ kind }) {
      const paths = {
        gear: 'M6.3 1.5h3.4l.4 1.8 1.2.7 1.8-.5 1.7 3-1.4 1.2v1.4l1.4 1.2-1.7 3-1.8-.5-1.2.7-.4 1.8H6.3l-.4-1.8-1.2-.7-1.8.5-1.7-3 1.4-1.2V7.7L1.2 6.5l1.7-3 1.8.5 1.2-.7z',
        edit: 'M10.5 2.5a1.4 1.4 0 0 1 2 2L6 11l-3 .8.8-3 6.7-6.3ZM9.5 3.5l2 2M2.8 14h10.4',
        up: 'M4 9.5 8 5.5l4 4', down: 'M4 6.5 8 10.5l4-4', close: 'M4 4l8 8M12 4l-8 8',
      }
      return h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.25, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: paths[kind] }), kind === 'gear' ? h('circle', { cx: 8, cy: 8.4, r: 2.1 }) : null)
    }

    function readFrames(buffer) {
      const frames = []
      let start = 0
      let split
      while ((split = buffer.indexOf('\n\n', start)) !== -1) {
        const block = buffer.slice(start, split)
        start = split + 2
        const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
        if (data) { try { frames.push(JSON.parse(data)) } catch { /* ignore foreign frames */ } }
      }
      return { frames, rest: buffer.slice(start) }
    }

    const listeners = new Set()
    let state = { settings: null, active: '', error: '', theme: null, defaultCwd: '', statuses: {}, availability: {} }
    let themeService
    let loadTask
    let refreshing = false
    let saveQueue = Promise.resolve()
    let disposed = false
    let pluginLife = new AbortController()
    const sessions = new Map()
    let parking
    function publish(patch) { state = { ...state, ...patch }; for (const fn of listeners) fn() }
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
    const snapshot = () => state
    function useStore() { return React.useSyncExternalStore(subscribe, snapshot, snapshot) }
    function parkingNode() {
      if (!parking) { parking = document.createElement('div'); parking.hidden = true; parking.dataset.agentsParking = 'true'; document.body.appendChild(parking) }
      return parking
    }
    function availableAgents(settings = state.settings) {
      return settings?.agents.filter((agent) => agent.enabled !== false && (state.availability[agent.id]?.installed !== false || state.statuses[agent.id] === 'running')) || []
    }
    function adopt(settings) {
      if (disposed) return
      const available = availableAgents(settings)
      // A new DSH window starts only the first usable entry; in-window navigation keeps its current session.
      const active = state.settings && available.some((agent) => agent.id === state.active) ? state.active : available[0]?.id || ''
      for (const [id, session] of sessions) if (!settings.agents.some((agent) => agent.id === id && agent.enabled !== false)) { session.dispose(); sessions.delete(id) }
      publish({ settings, active, error: '' })
    }
    function load() {
      loadTask ??= post(ROUTES.state, {}, pluginLife.signal).then((payload) => {
        publish({ availability: payload.availability || {}, defaultCwd: payload.defaultCwd || '', statuses: Object.fromEntries(Object.entries(payload.terminals || {}).map(([id, info]) => [id, info.state === 'running' && info.agentState !== 'exited' ? 'running' : 'exited'])) })
        adopt(payload.settings)
      }).catch((error) => {
        loadTask = null
        if (!disposed) publish({ error: error.message })
      })
      return loadTask
    }
    async function refreshAvailability() {
      if (refreshing || disposed || !state.settings) return
      refreshing = true
      const before = state.settings
      try {
        const payload = await post(ROUTES.state, {}, pluginLife.signal)
        if (disposed || state.settings !== before) return
        publish({ availability: payload.availability || {}, defaultCwd: payload.defaultCwd || state.defaultCwd })
        adopt(state.settings)
      } catch { /* Keep the last known inventory during a transient disconnect. */ } finally { refreshing = false }
    }
    function save(patch) {
      const task = saveQueue.catch(() => {}).then(async () => {
        // Send a patch, not a stale full settings object from an earlier render.
        const update = typeof patch === 'function' ? patch(state.settings) : patch
        const payload = await post(ROUTES.settings, { settings: update }, pluginLife.signal)
        publish({ availability: payload.availability || state.availability, defaultCwd: payload.defaultCwd || state.defaultCwd })
        adopt(payload.settings)
        return payload
      })
      saveQueue = task
      return task
    }
    function updateAgent(id, patch) {
      return save((latest) => ({ agents: latest.agents.map((agent) => agent.id === id ? { ...agent, ...patch, id } : agent) }))
    }
    const pendingStarts = new Set()
    function select(id) {
      const session = sessions.get(id)
      if (state.settings && !availableAgents().some((agent) => agent.id === id)) return
      const phase = session?.status.phase || state.statuses[id]
      if (phase === 'exited' || phase === 'failed') {
        if (session) session.connect(true)
        else pendingStarts.add(id)
      }
      if (state.active === id) { session?.term.focus(); return }
      publish({ active: id })
      void save({ activeId: id }).catch((error) => { if (!disposed) publish({ error: error.message }) })
    }

    class Session {
      constructor(id) {
        if (!runtime) throw new Error('terminal renderer missing')
        this.id = id
        this.life = new AbortController()
        this.connection = null
        this.listeners = new Set()
        this.status = { phase: 'loading', detail: '' }
        this.active = false
        this.writable = false
        this.input = ''
        this.inputBusy = false
        this.revision = 0
        this.sequence = 0
        this.node = document.createElement('div')
        this.node.className = 'ac-term'
        parkingNode().appendChild(this.node)
        this.term = new runtime.Terminal({ cursorBlink: false, fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', scrollback: 1000 })
        this.addon = new runtime.FitAddon()
        this.term.loadAddon(this.addon)
        this.updateTheme()
        this.body = document.createElement('div')
        this.body.className = 'ac-term-body'
        this.node.appendChild(this.body)
        this.term.open(this.body)
        this.dataListener = this.term.onData((data) => this.send(data))
        this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.fit()) : null
        this.observer?.observe(this.node)
      }
      subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn) }
      snapshot = () => this.status
      setStatus(phase, detail = '') {
        if (this.status.phase === phase && this.status.detail === detail) return
        this.status = { phase, detail }
        publish({ statuses: { ...state.statuses, [this.id]: phase } })
        for (const fn of this.listeners) fn()
      }
      mount(host) {
        host.appendChild(this.node)
        this.updateTheme()
        if (!this.connection) this.connect(pendingStarts.delete(this.id))
      }
      detach(host) {
        if (this.node.parentNode !== host) return
        if (this.life.signal.aborted) { this.node.remove(); return }
        this.setActive(false)
        parkingNode().appendChild(this.node)
      }
      setActive(active) {
        if (this.life.signal.aborted) return
        this.active = active
        this.term.options.cursorBlink = active
        if (active) { this.fit(); this.term.focus() }
      }
      updateTheme() {
        const style = getComputedStyle(this.node)
        const dark = state.theme?.active?.colorScheme === 'dark' || (!state.theme && document.body.hasAttribute('data-ds-dark-theme'))
        // The terminal node has an explicit opaque background; transparent is not a valid OSC 11 answer.
        const opaque = (color, fallback) => !color || color === 'transparent' || /rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(color) ? fallback : color
        const foreground = opaque(style.color, dark ? '#e8eaed' : '#202124')
        const background = opaque(style.backgroundColor, dark ? '#191a20' : '#ffffff')
        this.term.options.theme = {
          background, foreground, cursor: foreground, cursorAccent: background,
          selectionBackground: dark ? '#7aa2f744' : '#4176e644',
          ...(dark ? {} : { black: '#202124', red: '#b42318', green: '#16713c', yellow: '#8a5900', blue: '#2459b3', magenta: '#893aa1', cyan: '#087880', white: '#6b7280', brightBlack: '#59616d', brightRed: '#c43228', brightGreen: '#248047', brightYellow: '#986500', brightBlue: '#3568c0', brightMagenta: '#9b4aae', brightCyan: '#18858c', brightWhite: '#808894' }),
        }
        this.term.options.fontSize = state.theme?.fontSizes?.terminal || Number.parseInt(style.getPropertyValue('--dsh-terminal-font-size'), 10) || 13
        const family = state.theme?.fontFamilies?.terminal || style.getPropertyValue('--dsh-font-family-terminal').trim()
        this.term.options.fontFamily = [family, 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'].filter(Boolean).join(', ')
        this.fit()
      }
      fit() {
        if (this.fitFrame || !this.active || this.life.signal.aborted) return
        this.fitFrame = requestAnimationFrame(() => {
          this.fitFrame = 0
          if (!this.active || !this.node.clientWidth || !this.node.clientHeight) return
          const box = this.addon.proposeDimensions()
          if (!box || box.cols < 2 || box.rows < 1) return
          const cols = Math.min(500, box.cols), rows = Math.min(200, box.rows)
          if (this.term.cols !== cols || this.term.rows !== rows) this.term.resize(cols, rows)
          this.desiredSize = { cols, rows }
          void this.resizeRemote()
        })
      }
      async resizeRemote() {
        if (this.resizing || !this.writable || !this.desiredSize) return
        this.resizing = true
        try {
          while (this.writable && this.desiredSize && !this.life.signal.aborted) {
            const box = this.desiredSize
            if (this.remoteSize?.cols === box.cols && this.remoteSize?.rows === box.rows) break
            await post(ROUTES.input, { id: this.id, type: 'resize', ...box }, this.life.signal)
            this.remoteSize = box
          }
        } catch (error) {
          if (!this.life.signal.aborted) this.setStatus('failed', error.message)
        } finally { this.resizing = false }
      }
      send(data) {
        if (!this.writable || this.life.signal.aborted) return
        if (this.input.length + data.length > 512 * 1024) { this.setStatus('failed', 'Terminal input queue is full'); return }
        this.input += data
        if (!this.inputTimer && !this.inputBusy) this.inputTimer = setTimeout(() => { this.inputTimer = null; void this.flushInput() }, 8)
      }
      async flushInput() {
        if (this.inputBusy || !this.input) return
        this.inputBusy = true
        try {
          while (this.input && this.writable && !this.life.signal.aborted) {
            // 16K UTF-16 units fit the Host's 64KiB UTF-8 limit; never split a surrogate pair.
            let length = Math.min(this.input.length, 16 * 1024)
            if (length < this.input.length && /[\uD800-\uDBFF]/.test(this.input[length - 1])) length--
            const data = this.input.slice(0, length)
            this.input = this.input.slice(length)
            await post(ROUTES.input, { id: this.id, type: 'write', data }, this.life.signal)
          }
        } catch (error) {
          // Do not replay an uncertain write: duplicated keystrokes can execute commands twice.
          this.input = ''
          if (!this.life.signal.aborted) this.setStatus('failed', error.message)
        } finally { this.inputBusy = false }
      }
      render(data) { return new Promise((resolve) => this.term.write(data, resolve)) }
      async apply(frame, signal) {
        if (signal.aborted) return
        if (frame.type === 'snapshot') {
          this.writable = frame.writable === true
          this.remoteSize = { cols: frame.info.cols, rows: frame.info.rows }
          this.sequence = frame.sequence
          this.term.reset()
          this.term.resize(frame.info.cols, frame.info.rows)
          await this.render(frame.screen || '')
          if (signal.aborted) return
          this.setStatus(frame.info.state === 'running' && frame.info.agentState !== 'exited' ? 'running' : 'exited', frame.info.error || '')
          this.fit()
        } else if (frame.type === 'output' && frame.sequence > this.sequence) {
          this.sequence = frame.sequence
          await this.render(frame.data || '')
        } else if (frame.type === 'state' && frame.info) {
          this.writable = frame.writable === true
          this.setStatus(frame.info.state === 'running' && frame.info.agentState !== 'exited' ? 'running' : 'exited', frame.info.error || '')
        }
      }
      connect(resume = false) {
        if (this.life.signal.aborted) return
        if (resume && this.connection && this.status.phase === 'loading') return
        this.connection?.abort()
        clearTimeout(this.reconnectTimer)
        this.input = ''
        const life = new AbortController()
        this.connection = life
        const revision = ++this.revision
        this.writable = false
        this.setStatus('loading')
        const boot = async () => {
          const box = this.active ? this.addon.proposeDimensions() : null
          await post(ROUTES.open, { id: this.id, cols: Math.min(500, box?.cols || this.term.cols), rows: Math.min(200, box?.rows || this.term.rows), ...(resume ? { resume: true } : {}) }, life.signal)
          const response = await fetch(ROUTES.stream, {
            method: 'POST', headers: { 'content-type': 'application/json', [GUARD]: '1' }, body: JSON.stringify({ id: this.id }), signal: life.signal,
          })
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let pending = ''
          try {
            while (!life.signal.aborted) {
              const next = await reader.read()
              if (next.done) throw new Error('Terminal stream disconnected')
              pending += decoder.decode(next.value, { stream: true })
              if (pending.length > 2 * 1024 * 1024) throw new Error('Terminal stream frame is too large')
              const parsed = readFrames(pending)
              pending = parsed.rest
              for (const frame of parsed.frames) await this.apply(frame, life.signal)
            }
          } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
        }
        void boot().catch((error) => {
          if (life.signal.aborted || this.life.signal.aborted || revision !== this.revision) return
          this.writable = false
          this.setStatus('failed', error.message)
          // Reattach after transport loss. Never pass restart on a reconnect.
          this.reconnectTimer = setTimeout(() => this.connect(), 1500)
        })
      }
      dispose() {
        this.life.abort()
        this.connection?.abort()
        clearTimeout(this.reconnectTimer)
        clearTimeout(this.inputTimer)
        if (this.fitFrame) cancelAnimationFrame(this.fitFrame)
        this.observer?.disconnect()
        this.dataListener.dispose()
        this.term.dispose()
        this.node.remove()
        this.listeners.clear()
      }
    }

    function Screen({ agent, active }) {
      const host = React.useRef(null)
      const [session] = React.useState(() => {
        if (!sessions.has(agent.id)) sessions.set(agent.id, new Session(agent.id))
        return sessions.get(agent.id)
      })
      const status = React.useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot)
      React.useEffect(() => { const node = host.current; session.mount(node); return () => session.detach(node) }, [session])
      React.useEffect(() => { session.setActive(active); return () => session.setActive(false) }, [session, active])
      const text = copy()
      return h('section', { className: 'ac-screen', hidden: !active, role: 'tabpanel', id: `ac-panel-${agent.id}`, 'aria-labelledby': `ac-tab-${agent.id}` },
        h('div', { ref: host, style: { display: 'flex', flex: 1, minHeight: 0, minWidth: 0 } }),
        status.phase === 'failed' ? h('div', { className: 'ac-fail', role: 'status' },
          h('h2', null, text.failed), status.detail ? h('p', null, status.detail) : null,
          h('p', null, text.stopped)) : null)
    }

    function ColorPicker({ value, label, disabled, onSave }) {
      const [color, setColor] = React.useState(value)
      const timer = React.useRef(null)
      React.useEffect(() => { setColor(value) }, [value])
      React.useEffect(() => () => clearTimeout(timer.current), [])
      return h('input', { type: 'color', className: 'ac-color-input', value: color, disabled, title: label, 'aria-label': label,
        onChange: (event) => { const next = event.target.value; setColor(next); clearTimeout(timer.current); timer.current = setTimeout(() => onSave(next), 180) },
      })
    }

    function Manage({ settings, defaultCwd, availability, onClose }) {
      const dialog = React.useRef(null)
      const [name, setName] = React.useState('')
      const [command, setCommand] = React.useState('')
      const [color, setColor] = React.useState(CUSTOM_COLORS[settings.agents.length % CUSTOM_COLORS.length])
      const [editing, setEditing] = React.useState(null)
      const [cwd, setCwd] = React.useState(settings.cwd || '')
      const [error, setError] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const saving = React.useRef(false)
      const text = copy()
      React.useEffect(() => { if (dialog.current && !dialog.current.open) dialog.current.showModal(); void refreshAvailability() }, [])
      const commit = async (patch) => {
        if (saving.current) return false
        saving.current = true
        setBusy(true); setError('')
        try { await save(patch); return true } catch (cause) { setError(cause.message); return false } finally { saving.current = false; setBusy(false) }
      }
      const move = (index, delta) => {
        const id = settings.agents[index].id
        void commit((latest) => {
          const next = latest.agents.slice(), current = next.findIndex((agent) => agent.id === id), target = current + delta
          if (current < 0 || target < 0 || target >= next.length) return {}
          ;[next[current], next[target]] = [next[target], next[current]]
          return { agents: next }
        })
      }
      return h('dialog', { ref: dialog, className: 'ac-dialog', onCancel: onClose, onClick: (event) => { if (event.target === dialog.current) onClose() } },
        h('div', { className: 'ac-head' }, h('div', null, h('h2', null, text.manage), h('p', null, text.note)),
          h('button', { type: 'button', className: 'ac-icon', onClick: onClose, 'aria-label': text.close }, h(Glyph, { kind: 'close' }))),
        settings.agents.map((agent, index) => h('div', { className: 'ac-row', key: agent.id, 'data-disabled': agent.enabled === false, 'data-missing': availability[agent.id]?.installed === false },
          h(ColorPicker, { value: agent.color, label: `${text.color} ${agent.name}`, disabled: busy,
            onSave: async (color) => {
              setError('')
              try { await updateAgent(agent.id, { color }) } catch (cause) { setError(cause.message) }
            },
          }),
          editing?.id === agent.id ? h('form', { className: 'ac-edit', style: { flex: 1, minWidth: 0 }, onSubmit: async (event) => {
            event.preventDefault()
            if (!editing.name.trim() || !editing.command.trim()) { setError(text.need); return }
            const ok = await commit((latest) => ({ agents: latest.agents.map((item) => item.id === agent.id ? { ...item, name: editing.name.trim(), command: editing.command.trim() } : item) }))
            if (ok) setEditing(null)
          } },
          h('input', { 'aria-label': `${text.name} ${agent.name}`, maxLength: 24, value: editing.name, disabled: busy, onChange: (event) => setEditing({ ...editing, name: event.target.value }) }),
          h('input', { 'aria-label': `${text.command} ${agent.name}`, maxLength: 256, value: editing.command, disabled: busy, onChange: (event) => setEditing({ ...editing, command: event.target.value }) }),
          h('div', { className: 'ac-edit-actions' }, h('button', { type: 'submit', className: 'ac-link', disabled: busy }, text.save), h('button', { type: 'button', className: 'ac-link', disabled: busy, onClick: () => setEditing(null) }, text.cancel)),
          ) : h('div', null, h('b', null, agent.name), h('small', null, agent.command),
            h('span', { className: 'ac-status', 'data-missing': availability[agent.id]?.installed === false }, agent.enabled === false ? text.disabled : availability[agent.id]?.installed === false ? text.missing : availability[agent.id]?.installed === true ? text.detected : text.unknown)),
          h('button', { type: 'button', className: 'ac-icon', disabled: busy || editing?.id === agent.id, title: text.edit, 'aria-label': `${text.edit} ${agent.name}`, onClick: () => setEditing({ id: agent.id, name: agent.name, command: agent.command }) }, h(Glyph, { kind: 'edit' })),
          ...[[-1, text.up, 'up'], [1, text.down, 'down']].map(([delta, label, kind]) => h('button', {
            key: delta, type: 'button', className: 'ac-icon', disabled: busy || index + delta < 0 || index + delta >= settings.agents.length,
            title: label, 'aria-label': `${label} ${agent.name}`, onClick: () => move(index, delta),
          }, h(Glyph, { kind }))),
          h('button', { type: 'button', className: 'ac-link', disabled: busy, 'aria-label': `${agent.enabled === false ? text.restore : text.remove} ${agent.name}`, onClick: () => void commit((latest) => ({ agents: latest.agents.map((item) => item.id === agent.id ? { ...item, enabled: item.enabled === false } : item) })) }, agent.enabled === false ? text.restore : text.remove))),
        h('form', { className: 'ac-add', onSubmit: async (event) => {
          event.preventDefault()
          if (!name.trim() || !command.trim()) { setError(text.need); return }
          const entry = { id: `c-${Date.now().toString(36)}`, name: name.trim(), command: command.trim(), color }
          const ok = await commit((latest) => ({ agents: [...latest.agents, entry] }))
          if (ok) { setName(''); setCommand('') }
        } },
        h('input', { 'aria-label': text.name, placeholder: text.name, maxLength: 24, value: name, disabled: busy, onChange: (event) => setName(event.target.value) }),
        h('input', { 'aria-label': text.command, placeholder: text.command, maxLength: 256, value: command, disabled: busy, onChange: (event) => setCommand(event.target.value) }),
        h('label', { className: 'ac-color' }, h('input', { type: 'color', className: 'ac-color-input', 'aria-label': text.color, title: text.color, value: color, disabled: busy, onChange: (event) => setColor(event.target.value) })),
        h('button', { type: 'submit', className: 'ac-primary', disabled: busy || settings.agents.length >= 24 }, text.add)),
        error ? h('p', { className: 'ac-error', role: 'alert' }, error) : null,
        h('label', { className: 'ac-field' }, text.cwd, h('input', { value: cwd, placeholder: defaultCwd, disabled: busy, onChange: (event) => setCwd(event.target.value), onBlur: () => { if (cwd !== (settings.cwd || '')) void commit({ cwd }) } })),
        h('p', { className: 'ac-hint' }, text.defaultCwd, defaultCwd), h('p', null, text.cwdNote), h('p', null, text.inventory))
    }

    function AgentsPanel() {
      const { settings, active, error, statuses, defaultCwd, availability } = useStore()
      const [manage, setManage] = React.useState(false)
      const text = copy()
      React.useEffect(() => {
        void load()
        const timer = setInterval(() => { if (!document.hidden) void refreshAvailability() }, 30000)
        const focus = () => { if (!document.hidden) void refreshAvailability() }
        document.addEventListener('visibilitychange', focus)
        window.addEventListener('focus', focus)
        return () => { clearInterval(timer); document.removeEventListener('visibilitychange', focus); window.removeEventListener('focus', focus) }
      }, [])
      if (!settings) return h('div', { className: 'ac' }, h('div', { className: 'ac-empty' }, h('h2', null, error ? text.failed : text.loading), error ? h(React.Fragment, null, h('p', null, error), h('button', { className: 'ac-primary', onClick: () => void load() }, text.retry)) : null))
      const entries = availableAgents(settings)
      const current = entries.find((agent) => agent.id === active) || entries[0]
      const visible = entries.filter((agent) => agent.id === current?.id || sessions.has(agent.id))
      return h('div', { className: 'ac', 'data-agents-cli': 'true' },
        h('header', { className: 'ac-bar', 'data-window-drag': 'true' },
          h('div', { className: 'ac-leading', 'aria-hidden': true }),
          h('div', { className: 'ac-tabs', role: 'tablist', 'aria-label': text.label }, entries.map((agent) => h('button', {
            type: 'button', role: 'tab', key: agent.id, id: `ac-tab-${agent.id}`, 'aria-controls': `ac-panel-${agent.id}`, title: agent.command,
            'aria-selected': agent.id === current?.id, onClick: () => select(agent.id),
          }, h('span', { className: 'ac-dot', 'aria-hidden': true, 'data-status': statuses[agent.id] || 'unopened', title: statuses[agent.id] === 'exited' ? text.stopped : undefined, style: { background: agent.color } }), agent.name))),
          h('div', { className: 'ac-actions' },
            h('button', { type: 'button', className: 'ac-icon', title: text.manage, 'aria-label': text.manage, onClick: () => setManage(true) }, h(Glyph, { kind: 'gear' })))),
        h('div', { className: 'ac-stage' },
          error ? h('div', { className: 'ac-notice', role: 'alert' }, error, h('button', { className: 'ac-icon', 'aria-label': text.close, onClick: () => publish({ error: '' }) }, h(Glyph, { kind: 'close' }))) : null,
          current ? visible.map((agent) => h(Screen, { key: agent.id, agent, active: current.id === agent.id })) : h('div', { className: 'ac-empty' }, h('h2', null, text.noAgents), h('p', null, text.inventory), h('button', { type: 'button', className: 'ac-primary', onClick: () => setManage(true) }, text.manage))),
        manage ? h(Manage, { settings, defaultCwd, availability, onClose: () => setManage(false) }) : null)
    }

    function apply(ctx) {
      if (pluginLife.signal.aborted) {
        pluginLife = new AbortController()
        state = { settings: null, active: '', error: '', theme: null, defaultCwd: '', statuses: {}, availability: {} }
        loadTask = null
        saveQueue = Promise.resolve()
      }
      disposed = false
      ensureStyle()
      themeService = ctx.theme
      const syncTheme = () => {
        publish({ theme: themeService.getTheme() })
        // ui-layout applies tokens in its own theme/change handler. Read CSS after all handlers ran.
        if (themeFrame) cancelAnimationFrame(themeFrame)
        themeFrame = requestAnimationFrame(() => { themeFrame = 0; for (const session of sessions.values()) session.updateTheme() })
      }
      let themeFrame = 0
      syncTheme()
      ctx.on('theme/change', syncTheme)
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 16, label: () => copy().label }, Icon))
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, AgentsPanel))
      ctx.effect(() => () => {
        disposed = true
        pluginLife.abort()
        if (themeFrame) cancelAnimationFrame(themeFrame)
        for (const session of sessions.values()) session.dispose()
        sessions.clear(); pendingStarts.clear(); listeners.clear(); parking?.remove(); parking = null
        document.getElementById(STYLE_ID)?.remove(); document.getElementById(XTERM_STYLE_ID)?.remove()
      }, 'dsh-agents-cli: sessions and styles')
    }
    return { inject: ['slots', 'theme'], apply }
  },
})
