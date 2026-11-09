import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply } from '../index.js'
import { apply as applyShell, shellRules } from '../shell.js'
import { apply as applyWeb } from '../web.js'
import { apply as applySettings } from '../settings.js'
import { EDIT_RULES, PATCH_RULES, fileRules } from '../files.js'

function mask(config, globals = []) {
  const events = new Map()
  const effects = []
  const masks = new Set()
  const variables = new Map()
  const registered = new Set(globals)
  const ctx = {
    systemPrompt: {
      variable: (name, provider) => variables.set(name, provider),
    },
    emit: event => {
      for (const handler of events.get(event) ?? []) handler()
    },
    effect: fn => effects.push(fn()),
    tools: {
      get: name => registered.has(name) ? { name } : undefined,
      restrict: ({ deny }) => {
        assert(deny.every(name => registered.has(name)), '不能限制尚未注册的工具')
        const names = new Set(deny)
        masks.add(names)
        ctx.emit('tools/change')
        return () => {
          masks.delete(names)
          ctx.emit('tools/change')
        }
      },
    },
    on: (event, fn) => {
      const handlers = events.get(event) ?? []
      handlers.push(fn)
      events.set(event, handlers)
    },
  }
  apply(ctx, config)
  return {
    ctx,
    variable: name => variables.get(name)?.(),
    visible: names => names.filter(name => ![...masks].some(deny => deny.has(name))),
    register: name => {
      registered.add(name)
      ctx.emit('tools/change')
    },
    unregister: name => {
      registered.delete(name)
      ctx.emit('tools/change')
    },
    dispose: () => effects.forEach(dispose => dispose()),
  }
}

test('公共默认值保留所有工具', async () => {
  const result = mask(undefined, ['global'])
  assert.deepEqual(result.visible(['read', 'global']), ['read', 'global'])
})

test('只过滤 deny 点名且确实是全局注册的工具', async () => {
  const result = mask({ deny: ['global', 'scoped', 'missing'] }, ['global'])
  assert.deepEqual(result.visible(['read', 'global', 'scoped']), ['read', 'scoped'])
})

test('无效 deny 配置按空名单处理', async () => {
  const result = mask({ deny: 'global' }, ['global'])
  assert.deepEqual(result.visible(['global']), ['global'])
})

test('个人名单由 pi-mode-settings 登记并与预设 deny 合并，卸载后失效', async () => {
  const effects = []
  const result = mask({ deny: ['global'] }, ['global', 'im_tool'])
  applySettings({ effect: fn => effects.push(fn()), emit: result.ctx.emit }, { deny: ['im_tool', '', 7] })
  try {
    assert.deepEqual(result.visible(['read', 'global', 'im_tool']), ['read'])
  } finally {
    for (const dispose of effects) dispose()
  }
  assert.deepEqual(result.visible(['read', 'global', 'im_tool']), ['read', 'im_tool'])
})

test('点名工具延迟注册、卸载、重新注册时同步限制', () => {
  const result = mask({ deny: ['late'] })
  result.register('late')
  assert.deepEqual(result.visible(['read', 'late']), ['read'])
  result.unregister('late')
  assert.deepEqual(result.visible(['late']), ['late'])
  result.register('late')
  assert.deepEqual(result.visible(['late']), [])
})

test('卸载插件释放限制，后续注册表事件不会恢复限制', () => {
  const result = mask({ deny: ['global'] }, ['global'])
  result.dispose()
  result.register('another')
  assert.deepEqual(result.visible(['global', 'another']), ['global', 'another'])
})

test('可选联网 hook 可以接管，公共包不需要作者的私有工具', async () => {
  const key = Symbol.for('dsh-pi-mode.web-tools')
  const previous = globalThis[key]
  const ctx = {}
  let received
  globalThis[key] = { apply: async value => { received = value } }
  try {
    await applyWeb(ctx)
    assert.equal(received, ctx)
  } finally {
    if (previous === undefined) delete globalThis[key]
    else globalThis[key] = previous
  }
})

test('desktop 用个人名单 deny，im 用 imDeny，互不影响', () => {
  const effects = []
  const desktop = mask({ channel: 'desktop' }, ['im_return', 'im_group'])
  const im = mask({ channel: 'im' }, ['im_return', 'im_group'])
  const emit = event => {
    desktop.ctx.emit(event)
    im.ctx.emit(event)
  }
  applySettings({ effect: fn => effects.push(fn()), emit }, { deny: ['im_return', 'im_group'], imDeny: ['im_group'] })
  try {
    assert.deepEqual(desktop.visible(['read', 'im_return', 'im_group']), ['read'])
    assert.deepEqual(im.visible(['read', 'im_return', 'im_group']), ['read', 'im_return'])
  } finally {
    for (const dispose of effects) dispose()
  }
})

test('channel_rules 变量取 config.rules，缺省为空串', () => {
  assert.equal(mask({ channel: 'im', rules: '- 规矩' }).variable('channel_rules'), '- 规矩')
  assert.equal(mask(undefined).variable('channel_rules'), '')
})

test('组合补丁保持通用默认值，不带 IM 定制名单', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  // 所有 deny / imDeny 都是空名单（个人名单只写在用户 profile 里）
  for (const line of patch.split(/\r?\n/).filter(line => /^\s+(deny|imDeny):/.test(line))) assert.match(line, /: \[\]$/)
  // Windows checkouts may use CRLF line endings.
  assert.match(patch, /- id: pi-mode-settings\r?\n\s+name: 'dsh-pi-mode\/settings\.js'\r?\n\s+config:\r?\n\s+deny: \[\]\r?\n\s+imDeny: \[\]/)
  assert(patch.includes("name: 'dsh-pi-mode/web.js'"))
  assert(patch.includes('@deepseek-ai/dsh-agent-preset'))
  assert(patch.includes("process.platform === 'win32'"))
  assert(patch.includes("process.platform !== 'win32'"))
})

test('Pi-IM 原样引用 Pi 模式的 pi-core，只另带自己的 channel 行', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const [pi, remainder] = patch.split(/- id: preset-pi-im\r?\n/)
  const [im] = remainder.split(/- id: preset-pi-plus\r?\n/)
  assert(im, '缺少 preset-pi-im')
  assert.match(pi, /- &pi-core\r?\n\s+id: pi-core/)
  assert.match(im, /plugins:\r?\n(\s+#.*\r?\n)*\s+- \*pi-core\r?\n/)
  assert.match(pi, /channel: desktop/)
  assert.match(im, /channel: im/)
  assert(!/dsh-tool-present/.test(im), 'Pi-IM 不挂 present')
  const body = patch.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n')
  assert.equal((body.match(/\{\{channel_rules\}\}/g) ?? []).length, 1, '提示词里只引用一次')
})

test('补丁里用包名引用的 web.js / settings.js / shell.js / files.js 能按 exports 解析', async () => {
  // 0.2.2 曾给 exports 加了白名单却漏掉这两个子路径；用相对路径 import 文件测不出来，
  // 要等 DSH 新建会话时才报 "web-tools (dsh-pi-mode/web.js): never started"。
  const [web, settings, shell, files] = await Promise.all([
    import('dsh-pi-mode/web.js'),
    import('dsh-pi-mode/settings.js'),
    import('dsh-pi-mode/shell.js'),
    import('dsh-pi-mode/files.js'),
  ])
  assert.equal(typeof web.apply, 'function')
  assert.equal(typeof settings.apply, 'function')
  assert.equal(typeof shell.apply, 'function')
  assert.equal(typeof files.apply, 'function')
})

test('找文件的规矩按系统填写，shell.js 把对应文本登记为 shell_rules', () => {
  const posix = shellRules('darwin')
  const linux = shellRules('linux')
  const windows = shellRules('win32')
  assert.equal(posix, linux)
  assert.match(posix, /bash（ls、rg、find）/)
  assert.doesNotMatch(posix, /glob|grep|pwsh|PowerShell/)
  assert.match(windows, /找文件用 glob，搜文件内容用 grep/)
  assert.match(windows, /跑命令用 pwsh/)
  assert.doesNotMatch(windows, /都用 bash/)
  const variables = new Map()
  applyShell({ systemPrompt: { variable: (name, provider) => variables.set(name, provider) } })
  assert.equal(variables.get('shell_rules')?.(), shellRules())
})

test('前后台与批量并行规则在共用核心各出现一次，平台规则不再重复注入', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const prefix = patch.match(/prefix: \|-\r?\n([\s\S]*?)(?=\r?\n {14}- id: agent-instructions)/)?.[1]
    .split(/\r?\n/).map(line => line.trimStart()).join('\n')
  assert(prefix, '缺少共用核心提示词')
  const background = '- 短任务默认前台，勿为几秒等待设置极短超时或转后台；仅耗时较久且有独立工作可推进，或需持续运行时才主动转后台，下一步依赖结果则优先前台。后台须跟踪 job id，等完成通知，不重复启动或轮询；取回必要结果，及时停止无用任务。'
  const parallel = '- 互不依赖且无资源冲突的操作优先批量处理，能安全并行则并行，并汇总结果；有前后依赖或可能相互影响的操作按顺序执行，不把同批调用视为已经并行。'
  assert.equal(patch.split(background).length - 1, 1)
  assert.equal(patch.split(parallel).length - 1, 1)
  assert(prefix.indexOf(background) < prefix.indexOf(parallel))
  assert(prefix.indexOf(parallel) < prefix.indexOf('{{shell_rules}}'))
  for (const platform of ['darwin', 'linux', 'win32']) {
    const shell = shellRules(platform)
    assert.doesNotMatch(shell, /长命令转后台|短任务默认前台|job id|安全并行/)
    for (const applyPatch of [false, true]) {
      const prompt = prefix.replace('{{shell_rules}}', shell).replace('{{file_rules}}', fileRules({ applyPatch }))
      assert.equal(prompt.split(background).length - 1, 1)
      assert.equal(prompt.split(parallel).length - 1, 1)
      assert.doesNotMatch(prompt, /长命令转后台|\{\{(?:shell|file)_rules\}\}/)
    }
  }
})

test('glob/grep 与提示词变量随系统开关，两边不混用', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /- id: tool-fs-search\r?\n\s+name: '@deepseek-ai\/dsh-tool-fs-search'\r?\n\s+disabled: !!js process\.platform !== 'win32'\r?\n\s+config:\r?\n\s+sampleOverCapGlobResults: false/)
  assert.match(patch, /- id: shell-rules\r?\n\s+name: 'dsh-pi-mode\/shell\.js'/)
  assert.match(patch, /\{\{shell_rules\}\}/)
  assert.doesNotMatch(patch, /都用 bash（ls、rg、find）/)
  const body = patch.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n')
  assert.equal((body.match(/\{\{shell_rules\}\}/g) ?? []).length, 1, '提示词里只引用一次')
})

test('Pi+ 原样复用核心、present 与桌面 channel，只有文件规则开启补丁', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const [base, plus] = patch.split(/- id: preset-pi-plus\r?\n/)
  assert(plus)
  assert.match(plus, /id: pi-plus\r?\n\s+name: Pi\+模式/)
  assert.match(plus, /plugins:\r?\n\s+- \*pi-core/)
  assert.match(plus, /name: 'dsh-pi-mode\/files\.js'\r?\n\s+config:\r?\n\s+applyPatch: true/)
  assert.match(plus, /- \*pi-present\r?\n\s+- \*pi-desktop/)
  assert.doesNotMatch(base, /applyPatch: true/)
  assert.match(base, /- &pi-files\r?\n\s+id: file-rules/)
  assert.match(base, /- \*pi-files/)
  assert.match(base, /\{\{file_rules\}\}/)
})

test('普通模式文件规则保持原文，Pi+ 只替换分工并加匹配和失败恢复一条', () => {
  assert.equal(fileRules(), EDIT_RULES)
  assert.equal(fileRules({ applyPatch: false }), EDIT_RULES)
  assert.equal(fileRules({ applyPatch: true }), PATCH_RULES)
  assert.equal(PATCH_RULES.split('\n').length, 2)
  assert.match(PATCH_RULES, /单处局部修改用 edit；同一文件多处或跨文件修改优先用 apply_patch/)
  assert.match(PATCH_RULES, /预检拒绝不改文件/)
  assert.match(PATCH_RULES, /不会整批回滚/)
  assert.match(PATCH_RULES, /失败或中断后先重读受影响文件/)
  assert.doesNotMatch(PATCH_RULES, /本次试用|Delete File|Move to|只用于新增和更新/)
})

test('模式菜单顺序固定：order 5 / 6 / 7，Pi-IM 最后，且不与 DSH 内置值 1–4 相同', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const body = patch.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n')
  const orders = new Map()
  for (const [, id, order] of body.matchAll(/^\s+id: (pi(?:-im|-plus)?)\r?\n(?:.*\r?\n)*?\s+order: (\d+)/gm)) {
    orders.set(id, Number(order))
  }
  assert.deepEqual([...orders.entries()], [['pi', 5], ['pi-im', 7], ['pi-plus', 6]])
  // DSH 内置预设占用 1–4（standard / ptc / minimal / cordis）；同值会被 id 字典序打散。
  for (const order of orders.values()) assert(order > 4, 'order 须大于内置最大值 4，避免与其他预设同值')
})
