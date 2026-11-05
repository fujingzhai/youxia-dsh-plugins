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
  const registered = new Set(globals)
  const ctx = {
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

test('组合补丁保持通用默认值，不带 IM 定制名单', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /deny: \[\]/)
  // Windows checkouts may use CRLF line endings.
  assert.match(patch, /- id: pi-mode-settings\r?\n\s+name: 'dsh-pi-mode\/settings\.js'\r?\n\s+config:\r?\n\s+deny: \[\]/)
  assert(!patch.includes('dsh_im_'))
  assert(patch.includes("name: 'dsh-pi-mode/web.js'"))
  assert(patch.includes('@deepseek-ai/dsh-agent-preset'))
  assert(patch.includes("process.platform === 'win32'"))
  assert(patch.includes("process.platform !== 'win32'"))
})
