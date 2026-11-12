import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { installProgressReminder, POLICY, REMINDER, ESCALATED_REMINDER, SOURCE } from '../progress.js'
import { apply as applySettings } from '../settings.js'

const MINUTE = 60_000
const SETTINGS = Symbol.for('dsh-pi-mode.settings')
const text = value => ({ type: 'text', text: value })

function harness() {
  let clock = 1_800_000_000_000
  let turn = 0
  let step = 0
  const history = []
  const agent = { session: {
    get seq() { return history.length },
    snapshotEvents: (offset = 0) => history.slice(offset),
  } }
  const createUserMessage = input => ({ id: `message-${history.length}`, role: 'user', ...input })
  const ctx = { on: (event, callback) => {
    assert.equal(event, 'agent/pre-step')
    ctx.preStep = callback
  } }
  const install = () => installProgressReminder(ctx, { createUserMessage, now: () => clock })
  install()
  function append(type, data = {}) {
    const event = { seq: history.length, time: clock, type, data }
    history.push(event)
    return event
  }
  function startTurn() {
    turn++
    step = 0
    append('turn/start', { turn })
    append('user/message', { source: { kind: 'user' }, content: [text('开始工作')] })
  }
  function toolStep({ calls = 1, visible, reasoning = true } = {}) {
    step++
    append('step/start', { turn, step })
    const content = [
      ...(reasoning ? [{ type: 'reasoning', text: '内部思考，不是进度汇报' }] : []),
      ...(visible === undefined ? [] : [text(visible)]),
      ...Array.from({ length: calls }, (_, index) => ({ type: 'tool-call', id: `${turn}-${step}-${index}`, name: 'read', arguments: '{}' })),
    ]
    append('assistant/message', { turn, step, message: { content } })
    for (const block of content.filter(block => block.type === 'tool-call')) {
      append('tool/result', { turn, step, message: { toolCallId: block.id, content: [text('工具结果')] } })
    }
    append('step/end', { turn, step })
  }
  async function prepare({ messages = [], kind = 'enter', aborted = false, commit = true } = {}) {
    const decision = { kind, messages, retained: '不得丢弃其他钩子的元数据' }
    const result = await ctx.preStep({ agent, turn, step: step + 1, signal: { aborted } }, async () => decision)
    if (commit && result.kind === 'enter') {
      for (const message of result.messages) append('user/message', message)
    }
    return result
  }
  return { agent, append, history, install, prepare, startTurn, toolStep,
    useListener: listener => { ctx.preStep = listener },
    get listener() { return ctx.preStep },
    advance: milliseconds => { clock += milliseconds },
    silentSteps: count => { for (let index = 0; index < count; index++) toolStep() },
  }
}

test('首次和后续提醒均须 5 分钟 + 5 步，不因两次未响应永久放弃', () => {
  assert.deepEqual(POLICY, { firstMs: 5 * MINUTE, repeatMs: 5 * MINUTE, minSteps: 5 })
  assert(Object.isFrozen(POLICY))
  assert.equal(REMINDER, '进度提醒：本次响应必须先向本对话用户发1—2句可见正文，说明进展或阻碍；无进展也说在等什么，不复述工具操作。思考、工具描述不算。任务可继续时，同次响应接着调用工具，勿结束本轮或等用户。')
  assert.equal(ESCALATED_REMINDER, `上次提醒后仍无可见汇报。${REMINDER}`)
  assert.doesNotMatch(REMINDER, /如有|随后汇报/)
})

test('短任务即使连续几十步也不提醒；刚到 5 分钟才有资格', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(30)
  h.advance(5 * MINUTE - 1)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(1)
  const decision = await h.prepare()
  assert.equal(decision.messages.length, 1)
  assert.equal(decision.messages[0].content[0].text, REMINDER)
})

test('一次并行五个调用只算一步，内部思考不额外计步', async () => {
  const h = harness()
  h.startTurn()
  h.toolStep({ calls: 5 })
  h.advance(10 * MINUTE)
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(3)
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(1)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('没有工具调用的思考与请求失败不计工具步', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(4)
  h.toolStep({ calls: 0 })
  h.append('assistant/attempt', { stream: [] })
  h.advance(10 * MINUTE)
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(1)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('只有一条询问或首轮输入时不额外制造请求', async () => {
  const h = harness()
  h.startTurn()
  h.advance(60 * MINUTE)
  assert.deepEqual((await h.prepare()).messages, [])
})

test('只在已完成工具步之后提醒；工具执行中不计步、不插消息', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(4)
  h.advance(5 * MINUTE)
  h.append('step/start', { turn: 1, step: 5 })
  h.append('assistant/message', { message: { content: [{ type: 'tool-call', id: 'pending' }] } })
  assert.deepEqual((await h.prepare()).messages, [])
  h.append('step/end', { turn: 1, step: 5 })
  assert.equal((await h.prepare()).messages.length, 1)
})

test('第二次及后续提醒升级措辞，但仍须新增五步和五分钟', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages[0].content[0].text, REMINDER)
  h.silentSteps(5)
  h.advance(5 * MINUTE - 1)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(1)
  assert.equal((await h.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
  for (let count = 0; count < 3; count++) {
    assert.deepEqual((await h.prepare()).messages, [])
    h.silentSteps(5)
    h.advance(5 * MINUTE - 1)
    assert.deepEqual((await h.prepare()).messages, [])
    h.advance(1)
    assert.equal((await h.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
  }

  const slow = harness()
  slow.startTurn()
  slow.silentSteps(5)
  slow.advance(5 * MINUTE)
  await slow.prepare()
  slow.advance(5 * MINUTE)
  slow.silentSteps(4)
  assert.deepEqual((await slow.prepare()).messages, [])
  slow.silentSteps(1)
  assert.equal((await slow.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
})

test('主动汇报后重置时间、步数和次数；文字加工具的那一步不算静默', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  await h.prepare()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  await h.prepare()
  h.toolStep({ visible: '已经定位到问题，正在验证。' })
  h.silentSteps(4)
  h.advance(5 * MINUTE)
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(1)
  assert.equal((await h.prepare()).messages[0].content[0].text, REMINDER)
})

test('只在思考里承诺汇报、在工具结果里出现进展，都不解除升级状态', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  await h.prepare()
  h.toolStep({ reasoning: false })
  h.append('assistant/message', { message: { content: [{ type: 'reasoning', text: '用户要求更新，我会简要汇报后继续。' }] } })
  h.append('tool/result', { message: { toolCallId: 'external', content: [text('已接通新顾问，继续等待回复。')] } })
  h.silentSteps(4)
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
})

test('可见正文与工具同一步输出后继续工作，不产生额外消息或立即再催', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  await h.prepare()
  h.toolStep({ visible: '已要求邮件升级，正在等顾问回复；我会继续跟进。' })
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(5)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages[0].content[0].text, REMINDER)
})

test('空白文字不是进度更新；内部时间、技能等消息也不重置静默', async () => {
  const h = harness()
  h.startTurn()
  h.toolStep({ visible: ' \n ' })
  h.silentSteps(4)
  for (const kind of ['time-context', 'skill', 'runtime-context']) {
    h.append('user/message', { source: { kind }, content: [text('内部上下文')] })
  }
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('下一步有用户新输入时不提醒，输入接纳后重新计时计步', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  const message = { source: { kind: 'user' }, content: [text('先看另一个问题')] }
  assert.deepEqual((await h.prepare({ messages: [message] })).messages, [message])
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(5)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('新一轮任务不继承上轮步数，离线空闲不导致首步提醒', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.append('turn/end', { turn: 1 })
  h.advance(24 * 60 * MINUTE)
  h.startTurn()
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(5)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('询问用户的等待结束后重置静默，不催报等待用户期间的进度', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.append('tool/call', { callId: 'question', name: 'ask_user_question' })
  h.advance(30 * MINUTE)
  h.append('tool/result', { message: { toolCallId: 'question' } })
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(5)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('拒绝、取消以及未提交的提醒不消耗额度，重试不会被误计作工具步', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare({ kind: 'reject' })).kind, 'reject')
  assert.deepEqual((await h.prepare({ aborted: true })).messages, [])
  assert.equal((await h.prepare({ commit: false })).messages.length, 1)
  assert.equal((await h.prepare()).messages.length, 1)
  assert.deepEqual((await h.prepare()).messages, [])
})

test('恢复／重挂载从日志还原已发次数，不重复发送最后一步的提醒', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  await h.prepare()
  h.install()
  assert.deepEqual((await h.prepare()).messages, [])
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
  h.install()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  assert.equal((await h.prepare()).messages[0].content[0].text, ESCALATED_REMINDER)
})

test('消息只追加，原消息与日志前缀不变，并保留钩子元数据和来源', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  const history = JSON.stringify(h.history)
  const message = Object.freeze({ source: { kind: 'time-context' }, content: [text('时间')] })
  const messages = Object.freeze([message])
  const decision = await h.prepare({ messages, commit: false })
  assert.equal(JSON.stringify(h.history), history)
  assert.equal(decision.retained, '不得丢弃其他钩子的元数据')
  assert.equal(messages.length, 1)
  assert.equal(decision.messages[0], message)
  assert.equal(decision.messages[1].role, 'user')
  assert.deepEqual(decision.messages[1].source, { kind: SOURCE, form: 'notice', summary: '长任务静默提醒' })
})

test('不同会话的静默状态与提醒额度相互独立', async () => {
  const a = harness(), b = harness()
  b.useListener(a.listener)
  a.startTurn()
  b.startTurn()
  a.silentSteps(5)
  b.silentSteps(4)
  a.advance(5 * MINUTE)
  b.advance(5 * MINUTE)
  assert.equal((await a.prepare()).messages.length, 1)
  assert.deepEqual((await b.prepare()).messages, [])
  b.silentSteps(1)
  assert.equal((await b.prepare()).messages.length, 1)
})

test('待接纳消息已有本功能提醒时不重复追加', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  const reminder = { source: { kind: SOURCE }, content: [text(REMINDER)] }
  assert.deepEqual((await h.prepare({ messages: [reminder] })).messages, [reminder])
  assert.deepEqual((await h.prepare()).messages, [])
})

test('系统时钟回拨时不提前触发提醒', async () => {
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(-MINUTE)
  assert.deepEqual((await h.prepare()).messages, [])
  h.advance(6 * MINUTE)
  assert.equal((await h.prepare()).messages.length, 1)
})

test('个人开关可立即关闭，不丢失原有工具屏蔽配置，卸载后恢复默认', async () => {
  const previous = globalThis[SETTINGS]
  const disposers = []
  const h = harness()
  h.startTurn()
  h.silentSteps(5)
  h.advance(5 * MINUTE)
  try {
    applySettings({ effect: fn => disposers.push(fn()), emit() {} }, {
      deny: ['desktop_tool'], imDeny: ['im_tool'], progressReminder: false,
    })
    assert.deepEqual((await h.prepare()).messages, [])
    assert.deepEqual(globalThis[SETTINGS].deny, ['desktop_tool'])
    assert.deepEqual(globalThis[SETTINGS].imDeny, ['im_tool'])
    disposers.pop()()
    assert.equal((await h.prepare()).messages.length, 1)
  } finally {
    for (const dispose of disposers) dispose()
    if (previous === undefined) delete globalThis[SETTINGS]
    else globalThis[SETTINGS] = previous
  }
})

test('包内入口可解析、打包清单完整，三个预设只挂一次，阈值和提醒正文不塞进 system', async () => {
  const module = await import('dsh-pi-mode/progress.js')
  assert.equal(typeof module.apply, 'function')
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert(manifest.files.includes('progress.js'))
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-llm'], '>=0.2.2-rc.1')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.equal((patch.match(/name: 'dsh-pi-mode\/progress\.js'/g) ?? []).length, 1)
  const core = patch.split(/- &pi-files\r?\n/)[0]
  assert(core.includes("name: 'dsh-pi-mode/progress.js'"))
  assert.match(patch, /progressReminder: true/)
  const prefix = patch.match(/prefix: \|-\r?\n([\s\S]*?)(?=\r?\n {14}- id: agent-instructions)/)?.[1]
  assert.doesNotMatch(prefix, /progressReminder|5 分钟|5 个工具步|上次提醒后/)
  assert(!prefix.includes(REMINDER))
  assert(!prefix.includes(ESCALATED_REMINDER))
})
