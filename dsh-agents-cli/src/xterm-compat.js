/** Version-pinned xterm 6.0 input backports. Remove when a stable release includes these fixes. */
export function installInputCompatibility(terminal) {
  const core = terminal._core, helper = core?._compositionHelper
  if (!core?._keyDown || !core?._inputEvent || !helper?._handleAnyTextareaChanges) return () => {}
  const keydown = core._keyDown, input = core._inputEvent, changes = helper._handleAnyTextareaChanges
  let commits = 0, disposed = false, imeKey = false
  const composing = () => helper.isComposing || helper._isSendingComposition
  core._keyDown = function (event) {
    const modifier = [16, 17, 18, 91, 92, 93, 224].includes(event.keyCode) || event.key === 'Meta'
    const seen = this._keyDownSeen
    imeKey = event.keyCode === 229
    // Recover control keys claimed by an IME, but never cancel its active composition.
    let code
    if (imeKey && !event.isComposing && !composing() && !event.altKey && !event.metaKey) {
      if (event.code === 'Escape') code = 27
      else if (event.ctrlKey && /^Key[A-Z]$/.test(event.code)) code = event.code.charCodeAt(3)
      else if (event.ctrlKey && event.code === 'Space') code = 32
    }
    const normalized = code === undefined ? event : new Proxy({}, { get(_target, key) { if (key === 'keyCode' || key === 'which') return code; const value = Reflect.get(event, key, event); return typeof value === 'function' ? value.bind(event) : value } })
    try { return keydown.call(this, normalized) } finally {
      // xtermjs/xterm.js#6200: modifier-only keydowns neither arm nor disarm the gate.
      if (modifier) this._keyDownSeen = seen
    }
  }
  core._inputEvent = function (event) {
    const direct = event.data && event.inputType === 'insertText' && !event.isComposing && !composing()
    const recover = direct && !this._keyPressHandled && (imeKey || /[^\x00-\x7f]/.test(event.data))
    if (recover) this._keyDownSeen = false
    const handled = input.call(this, event)
    if (handled) { commits++; helper._dataAlreadySent = event.data || '' }
    return handled
  }
  helper._handleAnyTextareaChanges = function () {
    const oldValue = core.textarea.value, revision = commits
    setTimeout(() => {
      // A direct input event already committed these bytes; do not send them a second time.
      if (disposed || composing() || commits !== revision) return
      const value = core.textarea.value
      const diff = value.startsWith(oldValue) ? value.slice(oldValue.length) : value.replace(oldValue, '')
      this._dataAlreadySent = diff
      if (value.length > oldValue.length) core.coreService.triggerDataEvent(diff, true)
      else if (value.length < oldValue.length) core.coreService.triggerDataEvent('\x7f', true)
      else if (value !== oldValue) core.coreService.triggerDataEvent(value, true)
    }, 0)
  }
  return () => { disposed = true; core._keyDown = keydown; core._inputEvent = input; helper._handleAnyTextareaChanges = changes }
}
