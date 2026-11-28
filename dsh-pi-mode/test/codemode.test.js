import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../codemode.js'
import * as fileTools from '../files.js'

test('DSH-Pi 插件列表显示名和导出的本地化文件', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  assert.equal(manifest.name, 'dsh-pi-mode')
  for (const language of ['zh', 'en']) {
    const file = manifest.exports['./locale/*.json'].replace('*', language)
    assert.equal(JSON.parse(readFileSync(new URL('../' + file, import.meta.url))).meta.title, 'DSH-Pi')
  }
})

test('Pi+ Code Mode 在真实 DSH 步骤中执行、筛选与取消', { skip: process.env.DSH_PI_CODEMODE_TEST !== '1', timeout: 30_000 }, async t => {
  const { Context } = await import('@deepseek-ai/cordis')
  const { defineTool } = await import('@deepseek-ai/dsh-tools')
  const root = new Context()
  const directory = fileURLToPath(new URL('../', import.meta.url))
  let handle
  try {
    for (const [name, config] of [
      ['dsh-system-prompt'], ['dsh-session'], ['dsh-session-projection'], ['dsh-agent'], ['dsh-llm'],
      ['dsh-tools'], ['dsh-tool-executor-native'], ['dsh-agent-loop'], ['dsh-fs-local', { cwd: directory }],
      ['dsh-working-directory', { defaultDirectory: directory }],
    ]) {
      const module = await import('@deepseek-ai/' + name)
      await root.plugin(module.default ?? module, config ?? {})
    }
    await root.plugin(fileTools)
    handle = await root.agents.create({ sessionId: 'pi-plus-test', agentOptions: { provider: 'test', model: 'test' } })
    const agent = handle.agent, host = agent.ctx
    await apply(host)
    let id = 0
    async function run(code, signal = new AbortController().signal, target = agent) {
      const tools = target.ctx.tools
      const toolSet = await tools.resolve({ agent: target, modelSelection: target.options, signal })
      try {
        const batch = await tools.execute({ calls: [{ id: 'outer-' + ++id, type: 'tool-call',
          name: 'codemode', arguments: JSON.stringify({ code }) }], agent: target, toolSet, signal })
        return batch.results[0].result
      } finally { toolSet.dispose() }
    }
    const output = { schema: { type: 'string' }, render: (_args, v) => [{ type: 'text', text: v }] }
    await t.test('两次原生 read 只回传所需字段，子调用保留父子事件', async () => {
      const result = await run(`const docs = await Promise.all(["package.json","locale/zh.json"].map(file_path => tools.read({file_path})))
        return docs.map(d => JSON.parse(d.lines.map(l => l.text).join("\\n"))).map(d => d.version || d.meta.title)`)
      const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
      assert.deepEqual(JSON.parse(result.value), [version, 'DSH-Pi'])
      const events = agent.session.snapshotEvents().filter(e => e.type.startsWith('tool/ptc-dispatch'))
      assert.deepEqual(events.map(e => e.data.name), ['read','read','read','read'])
      assert.equal(new Set(events.map(e => e.data.subCallId)).size, 2)
      assert(events.every(e => e.data.rootCallId === 'outer-1' && e.data.parentCallId === 'outer-1'))
    })
    await t.test('真实管线保留审批策略、工具范围、条件激活与脚本部分失败', async () => {
      const hits = []
      let enabled = false
      for (const name of ['masked', 'conditional', 'blocked', 'present', 'ask_user_question']) {
        root.tools.register(defineTool({ name, description: name, parameters: {}, output,
          execute() { hits.push(name); return 'ok' } }), name === 'conditional' ? { when: () => enabled } : {})
      }
      host.tools.restrict({ deny: ['masked'] })
      host.tools.guard(exec => exec.name === 'blocked' ? { kind: 'deny', reason: 'fixture policy' } : undefined)
      const catalog = await run('return ALL_TOOLS.map(t=>t.name)')
      const toolNames = JSON.parse(catalog.value)
      assert(toolNames.includes('apply_patch'))
      for (const name of ['masked','conditional','present','ask_user_question','codemode']) assert(!toolNames.includes(name))
      enabled = true
      const result = await run('text((await describeTool("read")).parameters.required); text((await searchTools("conditional"))[0].name); return await Promise.allSettled([tools.conditional({}),tools.blocked({})]).then(x=>x.map(r=>r.status))')
      assert.match(result.value, /file_path/); assert.match(result.value, /conditional/); assert.match(result.value, /fulfilled","rejected/)
      assert.deepEqual(hits, ['conditional'])
      const silent = await run('// @options: {"max_output_tokens":0}\nreturn "long private intermediate"')
      assert.equal(silent.value, '[文本输出预算为 0]')
      const timeout = await run('// @options: {"timeout_ms":50}\nwhile (true) {}')
      assert(timeout.isError)
      const failure = await run('text("partial evidence"); throw Error("fixture failure")')
      assert(failure.isError); assert.match(failure.error.message, /partial evidence[\s\S]*fixture failure/)
    })
    await t.test('只读重叠，独占为屏障，已开始的操作在父调用退出前结算', async () => {
      const events = []
      const secondStarted = Promise.withResolvers()
      host.tools.register(defineTool({ name: 'work', description: 'work',
        parameters: { id: { type: 'string', required: true } }, output,
        isConcurrencySafe: ({ id }) => id !== 'exclusive',
        async execute({ id }, exec) {
          assert(exec.parent); assert.match(exec.rootCallId, /^outer-/)
          events.push('start ' + id)
          if (id === 'first') await secondStarted.promise
          if (id === 'second') secondStarted.resolve()
          events.push('end ' + id)
          return id
        } }))
      const result = await run('return await Promise.all(["first","second","exclusive","last"].map(id=>tools.work({id})))')
      assert.equal(result.value, '["first","second","exclusive","last"]')
      assert(events.indexOf('start second') < events.indexOf('end first'))
      assert(events.indexOf('start exclusive') > events.indexOf('end first'))
      assert(events.indexOf('end exclusive') < events.indexOf('start last'))
      const started = Promise.withResolvers()
      let stopped = false
      host.tools.register(defineTool({ name: 'wait_for_cancel', description: 'wait', parameters: {}, output,
        async execute(_args, exec) {
          started.resolve()
          await new Promise(resolve => exec.signal.addEventListener('abort', resolve, { once: true }))
          stopped = true
          return 'ended'
        } }))
      const ctrl = new AbortController()
      const call = run('store("cancelled", true); return await tools.wait_for_cancel({})', ctrl.signal)
      await started.promise
      ctrl.abort()
      assert((await call).isError); assert(stopped)
      // 工具说明写明沙箱里没有 Node、网络和定时器。
      assert.equal((await run('return [typeof process, typeof require, typeof fetch, typeof setTimeout].join()')).value, 'undefined,undefined,undefined,undefined')
      assert.equal((await run('return load("cancelled") === undefined')).value, 'true')
    })
    await t.test('脚本只回传摘要，保存的结果可恢复且按会话隔离', async () => {
      assert.match(host.tools.get('codemode', agent).description, /store\(key, value\) and load\(key\)/)
      const saved = await run('const hits = [{ line: 42, text: "原文命中" }]; store("hits", hits); return hits.length')
      assert.equal(saved.value, '1')
      assert.doesNotMatch(JSON.stringify(saved.content), /原文命中/)
      const event = agent.session.snapshotEvents().find(value => value.type === 'plugin:dsh-pi-mode/codemode-store')
      assert.equal(event.ignorable, true)
      assert.equal(agent.session.deriveEventMessage(event), null)
      assert.equal((await run('return load("hits")[0].text')).value, '原文命中')

      const failed = await run('store("hits", []); store("discard", true); throw Error("failed")')
      assert(failed.isError)
      assert.equal((await run('return [load("hits")[0].line, load("discard") === undefined]')).value, '[42,true]')

      const seed = JSON.parse(JSON.stringify(agent.session.snapshotEvents()))
      const restored = await root.agents.create({ sessionId: 'pi-plus-restored', seed, agentOptions: agent.options, setup: apply })
      try {
        assert.equal((await run('return load("hits")[0].line', undefined, restored.agent)).value, '42')
        const removed = await run('store("hits", undefined); return load("hits") === undefined', undefined, restored.agent)
        assert.equal(removed.value, 'true')
        assert.equal((await run('return load("hits") === undefined', undefined, restored.agent)).value, 'true')
        assert.equal((await run('return load("hits")[0].line')).value, '42')
      } finally { await restored.dispose() }

      const fresh = await root.agents.create({ sessionId: 'pi-plus-new', agentOptions: agent.options, setup: apply })
      try {
        assert.equal((await run('return load("hits") === undefined', undefined, fresh.agent)).value, 'true')
      } finally { await fresh.dispose() }
    })
  } finally { await handle?.dispose(); await root.fiber.dispose() }
})
