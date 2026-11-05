import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply } from '../index.js'
import { apply as applyWeb } from '../web.js'
import { apply as applySettings } from '../settings.js'

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
  const [pi, im] = patch.split(/- id: preset-pi-im\r?\n/)
  assert(im, '缺少 preset-pi-im')
  assert.match(pi, /- &pi-core\r?\n\s+id: pi-core/)
  assert.match(im, /plugins:\r?\n(\s+#.*\r?\n)*\s+- \*pi-core\r?\n/)
  assert.match(pi, /channel: desktop/)
  assert.match(im, /channel: im/)
  assert(!/dsh-tool-present/.test(im), 'Pi-IM 不挂 present')
  const body = patch.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n')
  assert.equal((body.match(/\{\{channel_rules\}\}/g) ?? []).length, 1, '提示词里只引用一次')
})
