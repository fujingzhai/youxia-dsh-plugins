/** 低频静默提醒：只在下一步前追加消息，不改写历史、系统提示词或工具列表。 */
export const name = 'pi-mode-progress-reminder'
export const inject = ['agents']

const SETTINGS = Symbol.for('dsh-pi-mode.settings')
export const SOURCE = 'pi-progress-reminder'
export const POLICY = Object.freeze({ firstMs: 300_000, repeatMs: 300_000, minSteps: 5 })
export const REMINDER = '进度提醒：本次响应必须先向本对话用户发1—2句可见正文，说明进展或阻碍；无进展也说在等什么，不复述工具操作。思考、工具描述不算。任务可继续时，同次响应接着调用工具，勿结束本轮或等用户。'
export const ESCALATED_REMINDER = `上次提醒后仍无可见汇报。${REMINDER}`

function reset(state, time) {
  state.silentSince = time
  state.steps = 0
  state.reminders = 0
  state.lastReminderAt = undefined
  state.lastReminderSteps = 0
}

function observe(state, event) {
  const { type, data, time } = event
  if (type === 'turn/start') {
    state.turn = data.turn
    state.step = undefined
    state.questionCalls.clear()
    reset(state, time)
  } else if (type === 'turn/end') {
    state.turn = undefined
  } else if (type === 'step/start') {
    state.step = { number: data.step, tools: false, visible: false, ended: false }
  } else if (type === 'assistant/message') {
    const content = data.message.content
    if (content.some(block => block.type === 'text' && block.text.trim() !== '')) {
      reset(state, time)
      if (state.step) state.step.visible = true
    }
    if (state.step && content.some(block => block.type === 'tool-call')) state.step.tools = true
  } else if (type === 'tool/call' && data.name === 'ask_user_question') {
    state.questionCalls.add(data.callId)
  } else if (type === 'tool/result' && state.questionCalls.delete(data.message.toolCallId)) {
    // 等待用户回答不属于埋头工作；从回答返回后重新计时、计步。
    reset(state, time)
    if (state.step) state.step.visible = true
  } else if (type === 'step/end' && state.step?.number === data.step && !state.step.ended) {
    state.step.ended = true
    if (state.step.tools && !state.step.visible) state.steps++
  } else if (type === 'user/message') {
    if (data.source.kind === 'user') reset(state, time)
    else if (data.source.kind === SOURCE) {
      state.reminders++
      state.lastReminderAt = time
      state.lastReminderSteps = state.steps
    }
  }
}

/** 工厂与时钟可替换供测试使用；实际运行始终用宿主的消息工厂和事件时间。 */
export function installProgressReminder(ctx, { createUserMessage, now = Date.now }) {
  const states = new WeakMap()
  ctx.on('agent/pre-step', async ({ agent, turn, step, signal }, next) => {
    const decision = await next()
    if (decision.kind !== 'enter' || signal.aborted) return decision
    const session = agent.session
    if (globalThis[SETTINGS]?.progressReminder === false) {
      states.delete(session)
      return decision
    }
    let state = states.get(session)
    if (!state) {
      state = { cursor: 0, questionCalls: new Set() }
      // 恢复时只重建当前轮；旧轮的静默、提醒次数和离线时间不带入新任务。
      const history = session.snapshotEvents()
      const start = history.findLastIndex(event => event.type === 'turn/start')
      for (const event of history.slice(Math.max(0, start))) observe(state, event)
      state.cursor = session.seq
      states.set(session, state)
    } else {
      for (const event of session.snapshotEvents(state.cursor)) observe(state, event)
      state.cursor = session.seq
    }
    // 新用户输入与内部上下文不同；被其他钩子拒绝的步骤、重试请求均不消耗提醒次数。
    if (decision.messages.some(message => message.source.kind === 'user' || message.source.kind === SOURCE)) return decision
    if (state.turn !== turn || step <= 1 || !state.step?.ended || !state.step.tools) return decision
    const currentTime = now()
    const anchor = state.lastReminderAt ?? state.silentSince
    const delay = state.lastReminderAt === undefined ? POLICY.firstMs : POLICY.repeatMs
    if (state.steps - state.lastReminderSteps < POLICY.minSteps ||
        !Number.isFinite(anchor) || currentTime - anchor < delay) return decision
    return {
      ...decision,
      messages: [...decision.messages, createUserMessage({
        content: [{ type: 'text', text: state.reminders === 0 ? REMINDER : ESCALATED_REMINDER }],
        source: { kind: SOURCE, form: 'notice', summary: '长任务静默提醒' },
      })],
    }
  })
}

export async function apply(ctx) {
  const { createUserMessage } = await import('@deepseek-ai/dsh-llm')
  installProgressReminder(ctx, { createUserMessage })
}
