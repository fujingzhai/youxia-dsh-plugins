import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join, resolve, basename, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { ActivityTracker } from '../lib/activity.js'
import { activityCommand, quoteArgument, antigravityTitleSettings } from '../lib/launch.js'
import piExtension from '../lib/pi-activity.mjs'

const osc = (value, code = 7501) => `\x1b]${code};${value}\x1b\\`
test('OSC status detection replies and tracks root completion through split UTF-8-decoded chunks', () => {
  const replies = [], changes = [], tracker = new ActivityTracker((value) => changes.push(value), (value) => replies.push(value))
  const stream = osc('?') + osc('state=idle:app=claude-code') + osc('state=working:app=claude-code') + osc('state=done:app=claude-code')
  for (const char of stream) tracker.push(char)
  assert.match(replies[0], /7501;\?:states=/)
  assert.deepEqual(changes.map((value) => value.phase), ['idle', 'working', 'done'])
  assert.equal(tracker.activity.completed, 1)
  tracker.push(osc('state=done')); assert.equal(tracker.activity.completed, 1)
  tracker.push(osc('state=working') + osc('state=done')); assert.equal(tracker.activity.completed, 2)
})
test('children do not falsely finish a root and genuine idle does not mean success', () => {
  const tracker = new ActivityTracker()
  tracker.push(osc('state=working') + osc('state=done:id=child'))
  assert.equal(tracker.activity.phase, 'working')
  tracker.push(osc('state=idle'))
  assert.equal(tracker.activity.phase, 'idle'); assert.equal(tracker.activity.completed, 0)
  tracker.push(osc('state=blocked') + osc('state=error:id=child'))
  assert.equal(tracker.activity.phase, 'blocked')
  tracker.push(osc('state=clear:id=child') + osc('state=done'))
  assert.equal(tracker.activity.phase, 'done')
})
test('VT string payloads and oversized OSCs cannot spoof state; memory is bounded', () => {
  const tracker = new ActivityTracker()
  tracker.push('\x1bPpayload' + osc('state=working') + '\x1b\\')
  assert.equal(tracker.activity.phase, 'unknown')
  tracker.push('\x1b]7501;' + 'x'.repeat(100000) + '\x07\x1b\\')
  assert(tracker.buffer.length <= 8192)
  tracker.push(osc('state=working'))
  assert.equal(tracker.activity.phase, 'working')
  tracker.push(osc('state=constructor'))
  assert.equal(tracker.activity.phase, 'working')
})
test('native Codex activity, completion notifications and Antigravity explicit titles are observed', () => {
  const tracker = new ActivityTracker()
  tracker.push(osc('⠋ Reading files', 0)); assert.equal(tracker.activity.phase, 'working')
  tracker.push(osc('My task', 0)); assert.equal(tracker.activity.phase, 'done')
  tracker.push(osc('dsh-agents:working Antigravity', 2)); assert.equal(tracker.activity.phase, 'working')
  tracker.push(osc('dsh-agents:idle Antigravity', 2)); assert.equal(tracker.activity.phase, 'done')
  tracker.push(osc('state=working')); tracker.push(osc('unrelated title', 0)); assert.equal(tracker.activity.phase, 'working')
})
test('progress clear is completion only after work; arbitrary output never means work or completion', () => {
  const tracker = new ActivityTracker()
  tracker.push('Working... done!\x07' + osc('4;0', 9)); assert.equal(tracker.activity.phase, 'unknown')
  tracker.push(osc('4;3', 9)); assert.equal(tracker.activity.phase, 'working')
  tracker.push(osc('4;0', 9)); assert.equal(tracker.activity.phase, 'done')
})
test('session adapters preserve custom commands and quote spaces and apostrophes', () => {
  for (const command of ['claude', 'pi --model custom', 'codex resume', 'agy --continue', 'custom-agent', 'echo hello; pi']) assert.equal(activityCommand(command), command)
  assert.match(activityCommand('pi'), /--extension .*pi-activity\.mjs/)
  assert.match(activityCommand('codex'), /tui\.terminal_title=.*activity/)
  assert.match(activityCommand('agy'), /--settings .*agy-title\.cjs/)
  assert.equal(quoteArgument("a'b", 'pwsh'), "'a''b'")
})
test('POSIX adapters preserve function arguments and never execute callbacks during shell parsing', { skip: process.platform === 'win32' }, () => {
  for (const command of ['pi', 'codex', 'agy']) {
    const script = `${command}() { printf '%s\\n' "$@"; }; ${activityCommand(command)}`
    const child = spawnSync('/bin/sh', ['-c', script], { encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr)
    const args = child.stdout.trim().split('\n')
    if (command === 'agy') assert.equal(JSON.parse(args[1]).title.enabled, true)
    if (command === 'pi') assert.match(args[1], /pi-activity\.mjs$/)
    if (command === 'codex') assert(args.includes('tui.terminal_title=["activity","thread-name"]'))
  }
})
test('Windows cmd passes Codex options and Antigravity settings-file path through .cmd shims unchanged', { skip: process.platform !== 'win32' }, () => {
  const base = process.env.CI ? join(homedir(), '.dsh-agents-cli-tests') : join(homedir(), 'AI-Space', '.tmp')
  mkdirSync(base, { recursive: true })
  const dir = mkdtempSync(join(base, 'agents-cli-test-'))
  try {
    const helper = join(dir, 'args.cjs')
    writeFileSync(helper, 'console.log(JSON.stringify(process.argv.slice(2)))')
    for (const name of ['codex', 'agy']) {
      const shim = join(dir, name + '.cmd')
      writeFileSync(shim, `@echo off\r\n"${process.execPath}" "${helper}" %*\r\n`)
      const settingsFile = join(dir, 'title settings.json')
      writeFileSync(settingsFile, JSON.stringify(antigravityTitleSettings()))
      const command = activityCommand(name, 'cmd', process.execPath, settingsFile)
      const script = join(dir, 'run.cmd')
      writeFileSync(script, `@echo off\r\nset "PATH=${dir};%PATH%"\r\ncall ${command}\r\n`)
      const child = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/c', script], { encoding: 'utf8' })
      assert.equal(child.status, 0, child.stderr)
      const args = JSON.parse(child.stdout.trim())
      if (name === 'codex') assert(args.includes('tui.terminal_title=["activity","thread-name"]'))
      else assert.equal(args[1], settingsFile)
    }
  } finally {
    const target = resolve(dir), trash = resolve(homedir(), '.Trash')
    assert.equal(dirname(target), resolve(base)); assert(basename(target).startsWith('agents-cli-test-'))
    mkdirSync(trash, { recursive: true })
    const destination = resolve(trash, basename(target) + '-' + Date.now())
    assert.equal(dirname(destination), trash)
    renameSync(target, destination)
  }
})

test('Antigravity title adapter reads structured state without exposing prompt content', () => {
  const script = fileURLToPath(new URL('../lib/agy-title.cjs', import.meta.url))
  const child = spawnSync(process.execPath, [script], { input: JSON.stringify({ agent_state: 'working', prompt: 'private' }), encoding: 'utf8' })
  assert.equal(child.status, 0); assert.equal(child.stdout, 'dsh-agents:working Antigravity')
})
test('Pi extension waits for full settlement and respects background work', () => {
  const events = new Map(), custom = new Map(), output = []
  const original = process.stdout.write
  const pi = { on(name, fn) { events.set(name, fn) }, events: { on(name, fn) { custom.set(name, fn) } } }
  piExtension(pi)
  try {
    process.stdout.write = (text) => { output.push(text); return true }
    const ctx = { mode: 'tui' }
    events.get('session_start')({}, ctx)
    custom.get('bgrun:status')({ running: 0 }); assert.match(output.at(-1), /state=idle/)
    events.get('agent_start')({}, ctx)
    events.get('agent_end')({ messages: [] }, ctx)
    assert.match(output.at(-1), /state=working/)
    custom.get('bgrun:status')({ running: 1 })
    events.get('agent_settled')({}, ctx)
    assert.match(output.at(-1), /state=working/)
    custom.get('bgrun:status')({ running: 0 }); assert.match(output.at(-1), /state=done/)
    events.get('agent_start')({}, ctx); events.get('agent_settled')({ aborted: true }, ctx)
    assert.match(output.at(-1), /state=idle/)
  } finally { process.stdout.write = original }
})
