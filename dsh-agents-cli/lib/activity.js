/** Bounded VT observer. Never infers task completion from output silence or process liveness. */
export class ActivityTracker {
  constructor(changed = () => {}, reply = () => {}) {
    this.changed = changed
    this.reply = reply
    this.activity = { phase: 'unknown', revision: 0, completed: 0 }
    this.records = new Map()
    this.mode = 'text'
    this.buffer = ''
    this.escape = false
    this.structured = false
    this.titleWorking = false
  }

  set(phase) {
    if (phase === this.activity.phase) return
    const completed = this.activity.completed + (phase === 'done' ? 1 : 0)
    this.activity = { phase, revision: this.activity.revision + 1, completed }
    this.changed(this.activity)
  }

  report(fields) {
    const phases = { idle: 'idle', working: 'working', done: 'done', blocked: 'blocked', failed: 'error', error: 'error', clear: 'unknown' }
    if (!Object.hasOwn(phases, fields.state)) return
    const id = fields.id || ''
    if (id.length > 128 || (!this.records.has(id) && this.records.size >= 64)) return
    this.structured = true
    if (fields.state === 'clear') this.records.delete(id)
    else this.records.set(id, phases[fields.state])
    const states = [...this.records.values()]
    const root = this.records.get('')
    // Child completion alone is never completion of the root agent.
    const phase = states.includes('working') ? 'working' : states.includes('blocked') ? 'blocked' : states.includes('error') ? 'error' : root === 'done' ? 'done' : root === 'idle' ? 'idle' : 'unknown'
    this.set(phase)
  }

  osc(raw) {
    const split = raw.indexOf(';')
    if (split < 0) return
    const code = raw.slice(0, split), value = raw.slice(split + 1)
    if (code === '7501') {
      if (value === '?') { this.reply('\x1b]7501;?:states=idle,working,done,blocked,error,failed:kinds=permission,question,auth\x1b\\'); return }
      const fields = Object.fromEntries(value.split(':').map((part) => { const at = part.indexOf('='); return at < 0 ? [part, ''] : [part.slice(0, at), part.slice(at + 1)] }))
      this.report(fields)
    } else if (['0', '1', '2'].includes(code)) {
      const explicit = /^dsh-agents:(idle|working|done|blocked|error)(?:\s|$)/.exec(value)
      if (explicit) { const phase = explicit[1] === 'idle' && this.activity.phase === 'working' ? 'done' : explicit[1]; this.report({ state: phase }); return }
      if (this.structured) return
      if (/^\[\s*[!.]\s*\]\s*Action Required\b/.test(value)) { this.titleWorking = false; this.set('blocked'); return }
      const native = /^(?:●\s+)?(?:◐|◑|[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏])(?:\s|$)/.test(value)
      // Some user shell wrappers preserve activity as an alternating zero-width title separator.
      const wrapped = value.includes('\u200c\u200c\u200a\u200c\u200c')
      if (native || wrapped) { this.titleWorking = true; this.set('working') }
      else if (/^✳(?:\s|$)/.test(value) || (this.titleWorking && !value.includes('\u20d2'))) {
        this.titleWorking = false
        this.set(this.activity.phase === 'working' ? 'done' : 'idle')
      }
    } else if (code === '9' && value.startsWith('4;') && !this.structured) {
      const progress = value.split(';')[1]
      if (['1', '3'].includes(progress)) this.set('working')
      else if (progress === '2') this.set('error')
      else if (progress === '4') this.set('blocked')
      else if (progress === '0' && this.activity.phase === 'working') this.set('done')
    } else if (code === '9' && !value.startsWith('4;') && !this.structured && this.activity.phase === 'working') {
      this.set('done')
    }
  }

  push(text) {
    for (const char of text) {
      if (this.mode === 'text') {
        if (char === '\x1b') this.mode = 'escape'
      } else if (this.mode === 'escape') {
        this.buffer = ''; this.escape = false
        this.mode = char === ']' ? 'osc' : ['P', '_', '^', 'X'].includes(char) ? 'string' : char === '\x1b' ? 'escape' : 'text'
      } else {
        if ((this.escape && char === '\\') || (this.mode === 'osc' && char === '\x07')) {
          if (this.mode === 'osc') this.osc(this.buffer)
          this.mode = 'text'; this.buffer = ''; this.escape = false
        } else if (char === '\x18' || char === '\x1a') {
          this.mode = 'text'; this.buffer = ''; this.escape = false
        } else if (char === '\x1b') {
          this.escape = true
        } else {
          if (this.mode === 'osc') {
            if (this.escape) this.buffer += '\x1b'
            if (this.buffer.length < 8192) this.buffer += char
            else { this.mode = 'string'; this.buffer = '' }
          }
          this.escape = false
        }
      }
    }
  }
}
