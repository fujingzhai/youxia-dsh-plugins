import assert from 'node:assert/strict'
import test from 'node:test'
import { installInputCompatibility } from '../src/xterm-compat.js'

function fixture() {
  const output = []
  const core = {
    textarea: { value: '' }, _keyDownSeen: false, _keyPressHandled: false,
    coreService: { triggerDataEvent(text) { output.push(text) } },
    _compositionHelper: { isComposing: false, _isSendingComposition: false, _handleAnyTextareaChanges() {} },
    _keyDown(event) { this._keyDownSeen = true; this.lastCode = event.keyCode },
    _inputEvent(event) { if (event.data && event.inputType === 'insertText' && (!event.composed || !this._keyDownSeen) && !this._keyPressHandled) { output.push(event.data); return true } return false },
  }
  const dispose = installInputCompatibility({ _core: core })
  return { core, output, dispose }
}
const direct = (data) => ({ data, inputType: 'insertText', composed: true, isComposing: false })
test('modifier-only keydown preserves the input gate and first shifted fullwidth punctuation', () => {
  for (const keyCode of [16, 17, 18, 91]) {
    const { core, output, dispose } = fixture()
    core._keyDown({ keyCode })
    core._inputEvent(direct('？'))
    assert.equal(output.join(''), '？')
    core._keyDown({ keyCode: 65 }); core._keyDown({ keyCode })
    core._inputEvent(direct('a'))
    assert.equal(output.join(''), '？')
    dispose()
  }
})
test('IME punctuation direct commit bypasses stale gate without being emitted twice by fallback', async () => {
  const { core, output, dispose } = fixture()
  core._keyDown({ keyCode: 229 })
  core._compositionHelper._handleAnyTextareaChanges()
  core.textarea.value = '，'
  core._inputEvent(direct('，'))
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(output, ['，'])
  dispose()
})
test('composition candidates remain on xterm composition path and printable ASCII stays deduplicated', () => {
  const { core, output, dispose } = fixture()
  core._compositionHelper.isComposing = true
  core._keyDown({ keyCode: 229, code: 'Escape', isComposing: true })
  assert.equal(core.lastCode, 229)
  core._inputEvent({ ...direct('中'), inputType: 'insertCompositionText', isComposing: true })
  assert.deepEqual(output, [])
  core._compositionHelper.isComposing = false
  core._keyDown({ keyCode: 65 }); core._inputEvent(direct('a'))
  assert.deepEqual(output, [])
  dispose()
})
test('noncomposing IME control keys recover physical codes without changing Alt or Meta shortcuts', () => {
  const { core, dispose } = fixture()
  const locked = Object.defineProperty({ code: 'KeyC', ctrlKey: true }, 'keyCode', { value: 229, configurable: false })
  core._keyDown(locked); assert.equal(core.lastCode, 67)
  core._keyDown({ keyCode: 229, code: 'Escape' }); assert.equal(core.lastCode, 27)
  core._keyDown({ keyCode: 229, code: 'KeyC', ctrlKey: true, altKey: true }); assert.equal(core.lastCode, 229)
  dispose()
})
test('unloading cancels delayed IME fallback and restores original methods', async () => {
  const { core, output, dispose } = fixture()
  core._compositionHelper._handleAnyTextareaChanges()
  core.textarea.value = '。'
  dispose()
  await new Promise((resolve) => setTimeout(resolve, 5))
  assert.deepEqual(output, [])
})
