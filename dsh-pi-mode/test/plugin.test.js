import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apply } from '../index.js'
import { apply as applyWeb } from '../web.js'
import { apply as applySettings } from '../settings.js'

function mask(config, globals = []) {
  let handler
  const ctx = {
    tools: { get: name => globals.includes(name) ? { name } : undefined },
    on: (event, fn) => {
      assert.equal(event, 'system-prompt/assemble')
      handler = fn
    },
  }
  apply(ctx, config)
  return async names => {
    const assembly = { tools: names.map(name => ({ name })) }
    return handler(undefined, undefined, async () => assembly)
  }
}

test('公共默认值保留所有工具', async () => {
  const result = await mask(undefined, ['global'])(['read', 'global'])
  assert.deepEqual(result.tools.map(tool => tool.name), ['read', 'global'])
})

test('只过滤 deny 点名且确实是全局注册的工具', async () => {
  const result = await mask({ deny: ['global', 'scoped', 'missing'] }, ['global'])(['read', 'global', 'scoped'])
  assert.deepEqual(result.tools.map(tool => tool.name), ['read', 'scoped'])
})

test('无效 deny 配置按空名单处理', async () => {
  const result = await mask({ deny: 'global' }, ['global'])(['global'])
  assert.equal(result.tools.length, 1)
})

test('个人名单由 pi-mode-settings 登记并与预设 deny 合并，卸载后失效', async () => {
  const effects = []
  applySettings({ effect: (fn) => effects.push(fn()) }, { deny: ['im_tool', '', 7] })
  try {
    const result = await mask({ deny: ['global'] }, ['global', 'im_tool'])(['read', 'global', 'im_tool'])
    assert.deepEqual(result.tools.map(tool => tool.name), ['read'])
  } finally {
    for (const dispose of effects) dispose()
  }
  const after = await mask(undefined, ['im_tool'])(['im_tool'])
  assert.deepEqual(after.tools.map(tool => tool.name), ['im_tool'])
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
