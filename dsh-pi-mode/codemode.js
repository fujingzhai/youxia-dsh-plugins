import { DispatchQueue } from './codemode-queue.js'
import { shellTool } from './shell.js'

export const name = 'pi-plus-codemode'
export const inject = ['tools']
const directOnly = new Set(['codemode', 'run_code', 'ask_user_question', 'present', 'dsh_im_return_file'])
const maxCalls = 128
const storeRecord = 'plugin:dsh-pi-mode/codemode-store'
let activeWorkers = 0

function reserveWorker() {
  if (activeWorkers >= 4) throw new Error('Code Mode workers are busy. Retry after a running script finishes.')
  activeWorkers++
  return () => { activeWorkers-- }
}

function discovery(catalog) {
  const entries = [...catalog.values()]
  return [
    { name: 'describeTool', execute: name => {
      const entry = catalog.get(name) ?? entries.find(item => item.originalName === name)
      if (!entry) throw new Error('Unknown tool: ' + String(name))
      return entry
    } },
    { name: 'searchTools', execute: query => {
      const terms = String(query ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean)
      return entries.map(({ name, description }) => {
        const id = name.toLowerCase(), words = description.toLowerCase()
        const score = terms.reduce((sum, term) => sum + (id.includes(term) ? 3 : words.includes(term) ? 1 : 0), 0)
        return { name, description, score }
      }).filter(item => !terms.length || item.score).sort((a, b) => b.score - a.score)
        .slice(0, 12).map(({ name, description }) => ({ name, description }))
    } },
  ]
}

function excerpt(text, chars) {
  if (text.length <= chars) return text
  if (chars === 0) return '[文本输出预算为 0]'
  const half = Math.floor(chars / 2)
  return text.slice(0, half) + '\n… [输出已截断，请在脚本内筛选或分段返回] …\n' + text.slice(-half)
}

function readStore(stores, session) {
  let state = stores.get(session)
  if (!state) {
    state = { cursor: 0, values: Object.create(null) }
    stores.set(session, state)
  }
  // 插件记录不进入模型上下文。恢复或分支时，按该会话自己的日志重建。
  for (; state.cursor < session.seq; state.cursor++) {
    const event = session.eventAt(state.cursor)
    if (event.type !== storeRecord || event.ignorable !== true) continue
    const writes = event.data
    if (!writes?.set || typeof writes.set !== 'object' || Array.isArray(writes.set) ||
      !Array.isArray(writes.delete) || writes.delete.some(key => typeof key !== 'string')) continue
    for (const key of writes.delete) delete state.values[key]
    Object.assign(state.values, writes.set)
  }
  return state.values
}

function dispatchChild({ ctx, exec, pipeline, queue, createUserMessage, scopeTarget }, input, record) {
  return queue.submit(() => pipeline.executionMode(input).kind, async () => {
    input.signal.throwIfAborted()
    exec.agent.session.append('tool/ptc-dispatch-start', record)
    const prepared = await pipeline.prepare(input)
    return { prepared, body: prepared.kind === 'dispatch' ? pipeline.dispatch(prepared.exec) : prepared }
  }, async (prepared, outcome) => {
    const result = await pipeline.complete(prepared.exec, outcome)
    const dispatch = { exec, agent: exec.agent, subCallId: input.callId, name: input.name,
      isError: result.isError, content: result.content }
    let logged
    try {
      logged = await ctx.waterfall(scopeTarget(ctx.tools, exec.agent), 'tools/ptc-dispatch-log',
        dispatch, () => Promise.resolve(result.content))
    } catch {
      logged = [{ type: 'text', text: '(dispatch log content unavailable)' }]
    }
    exec.agent.session.append('tool/ptc-dispatch', { ...record, content: logged, isError: result.isError,
      ...(result.meta && { meta: result.meta }), ...(result.error?.info && { error: result.error.info }) })
    for (const context of result.additionalContexts ?? []) exec.deferContext(context)
    if (result.concludesTurn) exec.concludeTurn()
    if (result.isError) throw new Error(input.name + ': ' + result.error.message)
    // 原生读图、Office 渲染使用宿主的附件引用；保留图旁边的页码、尺寸等说明。
    if (result.content.some(block => block.type === 'image')) {
      exec.deferContext(createUserMessage({ content: result.content, source: { kind: 'ptc-mode' } }))
    }
    return result.value
  }, input.signal)
}

async function forwardScriptImages(ctx, exec, images, createUserMessage) {
  const selection = exec.agent.session.requestHeader()?.config
  const provider = selection?.provider ?? exec.agent.options.provider
  const model = selection?.model ?? exec.agent.options.model
  const route = await ctx.get('llm')?.resolveModelInfo(provider, model, exec.signal)
  if (!route?.inputModalities?.includes('image')) throw new Error('image() requires an image-capable model.')
  const attachments = ctx.get('attachments')
  if (!attachments) throw new Error('image() requires a DSH attachment store.')
  exec.signal.throwIfAborted()
  const refs = await attachments.saveImages(images.map(image => ({
    data: Buffer.from(image.data, 'base64'), mediaType: image.mimeType,
  })))
  exec.signal.throwIfAborted()
  const content = refs.map(attachment => ({ type: 'image', attachment }))
  exec.deferContext(createUserMessage({ content, source: { kind: 'ptc-mode' } }))
}

// 在真正启动 QuickJS 时才加载 WASM 包；DSH 的工具定义与管线来自宿主。
export async function apply(ctx) {
  const [{ defineTool, projectToolSchema }, { ToolExecutionPipeline }, { createUserMessage }, { scopeTarget }, sessionModule] = await Promise.all([
    import('@deepseek-ai/dsh-tools'), import('@deepseek-ai/dsh-tools/pipeline'),
    import('@deepseek-ai/dsh-llm'), import('@deepseek-ai/dsh-scope'), import('@deepseek-ai/dsh-session'),
  ])
  const pipeline = typeof ctx.tools.definitions === 'function'
    ? new ToolExecutionPipeline(ctx)
    : new ToolExecutionPipeline(ctx, {
      get(name, agent, step) {
        const definition = ctx.tools.get(name, agent)
        return definition && step?.declares(definition) ? definition : undefined
      },
    })
  const shell = shellTool()
  const appendStore = sessionModule.appendPluginRecord
  const stores = typeof appendStore === 'function' ? new WeakMap() : undefined
  const storeHint = stores
    ? ' For small JSON needed by later scripts in this session, use store(key, value) and load(key). Use store(key, undefined) to clear a key.'
    : ''
  ctx.tools.register(defineTool({
    name: 'codemode',
    description: 'Run a JavaScript async function body to batch or chain DSH tool calls and filter their results. '
      + 'Call tools directly for single operations. Return only the excerpts, sources, or results the task needs. '
      + 'The QuickJS sandbox has no Node, file system, network, or timers. Use tools. '
      + 'Use await tools.read({file_path}), Promise.allSettled(), text(value) or return. read returns {lines:[{number,text}],totalLines,path,offset}. '
      + shell + ' needs description. A foreground run returns {exitCode,stdout:{text,truncated},stderr:{text,truncated}}. '
      + 'write, edit, and apply_patch results include full file text. Return only relevant fields. '
      + 'ALL_TOOLS lists callable names. Await describeTool(name) for input/output schemas or await searchTools(query) for matches. '
      + 'DSH image results are attached automatically. Await all work. Completed tool effects persist even if the script fails.'
      + storeHint,
    parameters: { code: { type: 'string', required: true, description: 'JavaScript function body, with top-level await and return.' } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    isConcurrencySafe: () => false,
    async execute({ code }, exec) {
      const step = exec.toolStep
      if (!exec.agent || (!step && !exec.toolSet)) throw new Error('codemode requires the current agent step and its admitted tools.')
      const session = exec.agent.session
      const { CodemodeSandbox, toCodemodeIdentifier, parseCodemodeSource } = await import('@earendil-works/pi-codemode')
      const parsed = parseCodemodeSource(code)
      const queue = new DispatchQueue(8)
      const bridge = { ctx, exec, pipeline, queue, createUserMessage, scopeTarget }
      const stopped = new AbortController()
      const signal = AbortSignal.any([exec.signal, stopped.signal])
      const catalog = new Map()
      const bindings = []
      const admitted = step ? step.declarations : ctx.tools.definitions(exec.agent, exec.toolSet)
      const definitions = admitted.filter(tool => !directOnly.has(tool.name))
      const executionStep = step ? { toolStep: step } : { toolSet: exec.toolSet }
      // 已经是合法标识符的名字优先，避免插件名规范化后指向另一个工具。
      definitions.sort((a, b) => Number(toCodemodeIdentifier(b.name) === b.name) - Number(toCodemodeIdentifier(a.name) === a.name))
      let calls = 0

      for (const tool of definitions) {
        const schema = projectToolSchema(tool, true)
        const base = toCodemodeIdentifier(tool.name)
        let alias = base
        for (let suffix = 2; catalog.has(alias); suffix++) alias = base + '_' + suffix
        catalog.set(alias, { name: alias, originalName: tool.name, description: tool.description,
          parameters: schema.parameters, output: tool.output.schema })
        bindings.push({ name: alias, description: tool.description, execute: (args, child) => {
          if (++calls > maxCalls) {
            stopped.abort(new Error('codemode exceeded its 128 tool calls; split the task into smaller batches.'))
            throw stopped.signal.reason
          }
          if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error(tool.name + ' expects an arguments object.')
          const input = { callId: exec.callId + ':codemode:' + calls, rootCallId: exec.rootCallId,
            parent: exec.token, agent: exec.agent, ...executionStep, name: tool.name, schema,
            arguments: args, signal: AbortSignal.any([signal, child.signal]) }
          const record = { rootCallId: exec.rootCallId, parentCallId: exec.callId, subCallId: input.callId,
            name: tool.name, arguments: args }
          return dispatchChild(bridge, input, record)
        } })
      }
      const vm = new CodemodeSandbox({ tools: bindings, globals: discovery(catalog), acquireWorker: reserveWorker,
        memoryLimitBytes: 128 * 1024 ** 2, timeoutMs: Math.min(parsed.options.timeoutMs ?? 120_000, 300_000) })
      let result
      try {
        const store = stores ? readStore(stores, session) : undefined
        if (!signal.aborted) ctx.get('piModeUsage')?.record('pi-plus', true)
        result = await vm.execute(parsed.code, { signal, store })
      } finally {
        stopped.abort()
        await vm.close()
        await queue.drain()
      }
      const parts = result.output.filter(item => item.type === 'text').map(item => item.text)
      const images = result.output.filter(item => item.type === 'image')
      let imageError
      if (images.length) {
        try { await forwardScriptImages(ctx, exec, images, createUserMessage) }
        catch (error) { imageError = error.message }
      }
      if (result.ok && result.value !== undefined) parts.push(typeof result.value === 'string' ? result.value : JSON.stringify(result.value))
      const budget = Math.min(parsed.options.maxOutputTokens ?? 12_500, 32_000) * 4
      const output = excerpt(parts.join('\n'), budget)
      const scriptError = result.ok ? undefined : excerpt(result.error.stack ?? result.error.message, 2500)
      if (scriptError || imageError) throw new Error([output, scriptError, imageError].filter(Boolean).join('\n'))
      if (stores && result.ok) {
        const writes = result.storeWrites
        if (Object.keys(writes.set).length || writes.delete.length) {
          exec.signal.throwIfAborted()
          appendStore(session, storeRecord, writes)
        }
      }
      return output || '(script completed with no output)'
    },
  }))
}
