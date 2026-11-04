/**
 * Pi 模式的联网工具入口，并提供系统提示词变量 {{web_rules}}（搜索规矩）。
 *
 * 默认用 DSH 自带的 web_search / web_fetch（@deepseek-ai/dsh-tool-web），后端是 DSH 设置里配的搜索服务。
 * 若有别的插件在 globalThis[Symbol.for('dsh-pi-mode.web-tools')] 登记了 { apply(ctx) }，就改用它：
 * 它负责在本预设里注册 web_search / web_fetch，并注册变量 web_rules。作者自用的 dsh-agent-web（pi 同款工具）就是这样接进来的。
 * config.prefer: 'builtin' 可强制用 DSH 自带工具。
 */
export const name = 'pi-mode-web'
export const inject = ['tools', 'web', 'systemPrompt']

const HOOK = Symbol.for('dsh-pi-mode.web-tools')

// DSH 自带工具时用的搜索规矩（与 pi 默认一致）
const DEFAULT_RULES = ['- 外文资料更全的话题，另用英文搜一次。', '- 用网络资料作答时，文末列出来源链接。'].join('\n')

// 与 DSH 标准模式的 tool-web 行一致（插件自身默认值＋标准模式的 searchTimeoutMs）
const BUILTIN_CONFIG = {
  search: true,
  fetch: true,
  searchMaxResults: 8,
  searchMaxQueries: 4,
  fetchTimeoutMs: 30_000,
  searchTimeoutMs: 60_000,
  fetchMaxOutputChars: 200_000,
}

export async function apply(ctx, config) {
  const hook = globalThis[HOOK]
  if (config?.prefer !== 'builtin' && typeof hook?.apply === 'function') return hook.apply(ctx)
  const builtin = await import('@deepseek-ai/dsh-tool-web')
  builtin.apply(ctx, BUILTIN_CONFIG)
  ctx.systemPrompt.variable('web_rules', () => DEFAULT_RULES)
}
