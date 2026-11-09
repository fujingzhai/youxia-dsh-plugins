/**
 * Pi 模式的联网工具入口；联网规矩统一写在预设的核心提示词中。
 *
 * 默认用 DSH 自带的 web_search / web_fetch（@deepseek-ai/dsh-tool-web），后端是 DSH 设置里配的搜索服务。
 * 若有别的插件在 globalThis[Symbol.for('dsh-pi-mode.web-tools')] 登记了 { apply(ctx) }，就改用它：
 * 它负责在本预设里注册 web_search / web_fetch；旧接口可继续注册 web_rules，但预设不再引用该变量。
 * config.prefer: 'builtin' 可强制用 DSH 自带工具。
 */
export const name = 'pi-mode-web'
export const inject = ['tools', 'web', 'systemPrompt']

const HOOK = Symbol.for('dsh-pi-mode.web-tools')

// 与 DSH 标准模式的 tool-web 行一致：只写标准模式改过的两项，其余交给 tool-web 自己的 Config 补默认值
// （DSH 0.2.2 新增必填的 searchSummaryMaxChars，手抄全量配置会漏）。
const BUILTIN_OVERRIDES = { fetch: true, searchTimeoutMs: 60_000 }

export async function apply(ctx, config) {
  const hook = globalThis[HOOK]
  if (config?.prefer !== 'builtin' && typeof hook?.apply === 'function') return hook.apply(ctx)
  const builtin = await import('@deepseek-ai/dsh-tool-web')
  const resolved = typeof builtin.Config === 'function' ? builtin.Config(BUILTIN_OVERRIDES) : BUILTIN_OVERRIDES
  builtin.apply(ctx, resolved)
}
