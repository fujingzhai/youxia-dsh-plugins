/**
 * 三种预设的 channel 行（Pi / Pi+ 共用 desktop，Pi-IM 用 im）：
 *
 * 1. 提供 {{channel_rules}}＝config.rules（结果交付）与 {{gui_rules}}＝config.guiRules（仅桌面界面），按主题分别插入。
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
  const guiRules = config?.channel === 'im' ? '' : typeof config?.guiRules === 'string' ? config.guiRules : ''
  let current = '[]'
  let disposeMask
  let refreshing = false
  let refreshPending = false
  let disposed = false

  ctx.systemPrompt.variable('channel_rules', () => rules)
  ctx.systemPrompt.variable('gui_rules', () => guiRules)

  function refresh() {
    if (disposed) return
    if (refreshing) {
      refreshPending = true
      return
    }
    // restrict 和 dispose 也会发 tools/change；不递归，但须补算期间收到的变更。
    refreshing = true
    try {
      do {
        refreshPending = false
        const personal = globalThis[SETTINGS]?.[personalKey]
        const deny = [...new Set([...own, ...(Array.isArray(personal) ? personal : [])])]
          .filter(name => typeof name === 'string' && ctx.tools.get(name) !== undefined).sort()
        const key = JSON.stringify(deny)
        if (key === current) continue
        const next = deny.length ? ctx.tools.restrict({ deny }) : undefined
        const previous = disposeMask
        disposeMask = next
        current = key
        previous?.()
      } while (refreshPending && !disposed)
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
