/**
 * Pi 模式的 channel 行（Pi 模式、Pi-IM 各挂一行，config.channel 分别为 desktop / im）：
 *
 * 1. 提供系统提示词变量 {{channel_rules}}＝config.rules（交付方式等随渠道变化的规矩）。
 * 2. 全局工具屏蔽：只挡点名的全局工具，其余全局工具（以后新装插件带来的也一样）照常给模型；预设各行自己注册的工具不受影响。
 *    名单＝config.deny ＋ 个人名单（pi-mode-settings 的 deny 对应 desktop、imDeny 对应 im）。
 *    在预设作用域用 tools.restrict 屏蔽，模型声明与执行使用同一份限制；先用不带作用域的 tools.get 确认是全局注册，
 *    跳过预设工具和暂未注册的名字；注册表或个人设置变化时重算。DSH 0.2.2 起 assemble 监听器不再接收工具列表。
 */
export const name = 'pi-mode-channel'
export const inject = ['tools', 'systemPrompt']

// 个人名单由 settings.js（profile 补丁里的 pi-mode-settings 条目）登记，见该文件说明。
const SETTINGS = Symbol.for('dsh-pi-mode.settings')
const PERSONAL_KEY = { desktop: 'deny', im: 'imDeny' }

export function apply(ctx, config) {
  const own = Array.isArray(config?.deny) ? config.deny : []
  const personalKey = PERSONAL_KEY[config?.channel] ?? 'deny'
  const rules = typeof config?.rules === 'string' ? config.rules : ''
  let current = '[]'
  let disposeMask
  let refreshing = false
  let disposed = false

  ctx.systemPrompt.variable('channel_rules', () => rules)

  function refresh() {
    if (refreshing || disposed) return
    const personal = globalThis[SETTINGS]?.[personalKey]
    const deny = [...new Set([...own, ...(Array.isArray(personal) ? personal : [])])]
      .filter(name => typeof name === 'string' && ctx.tools.get(name) !== undefined).sort()
    const key = JSON.stringify(deny)
    if (key === current) return
    // restrict 和 dispose 都会发 tools/change；避免因自己的变更递归刷新。
    refreshing = true
    try {
      const next = deny.length ? ctx.tools.restrict({ deny }) : undefined
      const previous = disposeMask
      disposeMask = next
      current = key
      previous?.()
    } finally {
      refreshing = false
    }
  }

  ctx.effect(() => () => {
    disposed = true
    disposeMask?.()
  })
  ctx.on('tools/change', refresh)
  ctx.on('pi-mode/settings-change', refresh)
  ctx.on('ready', refresh)
  refresh()
}
