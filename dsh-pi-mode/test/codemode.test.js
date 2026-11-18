import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../codemode.js'

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
      ['dsh-tool-fs', { read: true, readImage: false, write: false, edit: false, applyPatch: false }],
    ]) {
      const module = await import('@deepseek-ai/' + name)
      await root.plugin(module.default ?? module, config ?? {})
    }
    handle = await root.agents.create({ sessionId: 'pi-plus-test', agentOptions: { provider: 'test', model: 'test' } })
    const agent = handle.agent, host = agent.ctx
    await apply(host)
    let id = 0
    async function run(code, signal = new AbortController().signal) {
      const toolSet = await host.tools.resolve({ agent, modelSelection: agent.options, signal })
      try {
        const batch = await host.tools.execute({ calls: [{ id: 'outer-' + ++id, type: 'tool-call',
          name: 'codemode', arguments: JSON.stringify({ code }) }], agent, toolSet, signal })
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
      for (const name of ['masked','conditional','present','ask_user_question','codemode']) assert(!JSON.parse(catalog.value).includes(name))
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
      const call = run('return await tools.wait_for_cancel({})', ctrl.signal)
      await started.promise
      ctrl.abort()
      assert((await call).isError); assert(stopped)
      assert.equal((await run('return typeof process')).value, 'undefined')
    })
  } finally { await handle?.dispose(); await root.fiber.dispose() }
})
