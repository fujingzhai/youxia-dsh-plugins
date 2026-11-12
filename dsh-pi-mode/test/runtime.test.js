import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { installProgressReminder, SOURCE, REMINDER, ESCALATED_REMINDER } from '../progress.js'
import { shellRules, shellTool, dshRules } from '../shell.js'
import { fileRules } from '../files.js'

// 显式选择当前安装的运行时；Desktop 须用 DSH_NODE_EXECUTABLE 的 Electron 执行。
// 不接真实供应商，不使用个人 profile、持久化或外部工具。
test('真实 AgentLoop：思考不解除升级，第三次仍提醒，正文与工具同次输出后继续并正常收尾', {
  skip: process.env.DSH_PI_RUNTIME_TEST !== '1', timeout: 15_000,
}, async () => {
  assert(process.env.DSH_INSTALL_DIR, '请由待验证的 DSH 环境提供 DSH_INSTALL_DIR')
  const require = createRequire(path.join(process.env.DSH_INSTALL_DIR, 'package.json'))
  const load = name => import(pathToFileURL(require.resolve(name)))
  const { Context } = await load('@deepseek-ai/cordis')
  const { LlmAdapter, createUserMessage } = await load('@deepseek-ai/dsh-llm')
  const { defineTool } = await load('@deepseek-ai/dsh-tools')
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const prompt = patch.match(/prefix: \|-\r?\n([\s\S]*?)(?=\r?\n {14}- id: agent-instructions)/)[1]
    .split(/\r?\n/).map(line => line.trimStart()).join('\n').trimEnd()
    .replace('{{file_rules}}', fileRules({ applyPatch: true }))
    .replace('{{shell_rules}}', shellRules()).replace('{{shell_tool}}', shellTool())
    .replace('{{dsh_rules}}', dshRules()).replace('{{channel_rules}}', '').replace('{{gui_rules}}', '')
  assert.doesNotMatch(prompt, /\{\{/)
  let requests = 0, executed = 0, clock = Date.now()
  const text = (type, value) => ({ type, text: value })

  class Mock extends LlmAdapter {
    async *stream() {
      assert(++requests <= 18, '模拟模型不得无限续跑')
      if (requests >= 17) {
        const block = text('text', requests === 17 ? '升级已申请，仍在等答复；我继续核对。' : '已核实模拟答复，测试结束。')
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: block.text }
        yield { type: 'block-end', index: 0, block }
      }
      if (requests === 18) {
        yield { type: 'finish', reason: { kind: 'stop' } }
        return
      }
      const reasoning = text('reasoning', '需要汇报，但这里只是思考。')
      yield { type: 'block-start', index: 1, blockType: 'reasoning' }
      yield { type: 'reasoning-delta', index: 1, text: reasoning.text }
      yield { type: 'block-end', index: 1, block: reasoning }
      const block = { type: 'tool-call', id: `call-${requests}`, name: 'status_check', arguments: '{}' }
      yield { type: 'block-start', index: 2, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 2, id: block.id, name: block.name, argumentsDelta: '{}' }
      yield { type: 'block-end', index: 2, block }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
    }
  }

  const root = new Context()
  let handle
  try {
    for (const [name, config] of [
      ['@deepseek-ai/dsh-system-prompt', { includeHarnessIdentity: false, personaPrefix: prompt }],
      ['@deepseek-ai/dsh-session'], ['@deepseek-ai/dsh-session-projection'], ['@deepseek-ai/dsh-agent'],
      ['@deepseek-ai/dsh-llm'], ['@deepseek-ai/dsh-tools'], ['@deepseek-ai/dsh-tool-executor-native'],
      ['@deepseek-ai/dsh-agent-loop', {}],
    ]) {
      const module = await load(name)
      await root.plugin(module.default ?? module, config)
    }
    root.llm.registerAdapter(['fixture'], new Mock())
    handle = await root.agents.create({ sessionId: `pi-progress-test-${randomUUID()}`,
      agentOptions: { provider: 'fixture', model: 'fixture' } })
    const { agent } = handle
    installProgressReminder(agent.ctx, { createUserMessage, now: () => clock })
    agent.ctx.tools.register(defineTool({
      name: 'status_check', description: '无副作用模拟状态检查。', parameters: {},
      output: { schema: { type: 'string' }, render: (_args, value) => [text('text', value)] },
      async execute() { executed++; clock += 61_000; return '仍在等待模拟回复。' },
    }))
    agent.followup(createUserMessage({ content: [text('text', '开始模拟任务。')], source: { kind: 'user' } }))
    await agent.whenIdle()
    const events = agent.session.snapshotEvents()
    assert.equal(requests, 18)
    assert.equal(executed, 17)
    assert.deepEqual(events.filter(event => event.type === 'user/message' && event.data.source.kind === SOURCE)
      .map(event => event.data.content[0].text), [REMINDER, ESCALATED_REMINDER, ESCALATED_REMINDER])
    const visible = events.filter(event => event.type === 'assistant/message'
      && event.data.message.content.some(block => block.type === 'text' && block.text.trim()))
    assert.deepEqual(visible.map(event => event.data.step), [17, 18])
    assert(visible[0].data.message.content.some(block => block.type === 'tool-call'))
    assert(events.some(event => event.type === 'tool/result' && event.data.step === 17))
    assert.equal(events.findLast(event => event.type === 'turn/end').data.reason.kind, 'completed')
  } finally {
    await handle?.dispose()
    await root.fiber.dispose()
  }
})
