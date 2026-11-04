/**
 * Pi 模式的全局工具屏蔽：只挡 config.deny 点名的全局工具，其余全局工具（以后新装插件带来的也一样）照常给模型。
 * 预设各行自己注册的工具不受影响。
 *
 * 做法：挂在预设里监听 system-prompt/assemble（只对本预设的对话分发），在组装结果里过滤工具；
 * 只拿掉点名且确属全局注册的（ctx.tools.get(名字) 不带作用域即全局视图）。
 * 不用 ctx.tools.restrict：预设各行的工具挂在 agent 的上一层，对 agent 来说也算「继承」，会被一并屏蔽；
 * 点到当时还没注册的名字它还会报错。
 */
export const name = 'pi-mode-tool-mask'
export const inject = ['tools', 'systemPrompt']

export function apply(ctx, config) {
  const deny = new Set(Array.isArray(config?.deny) ? config.deny : [])
  ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    const assembly = await next()
    if (deny.size === 0) return assembly
    assembly.tools = assembly.tools.filter((tool) => !(deny.has(tool.name) && ctx.tools.get(tool.name) !== undefined))
    return assembly
  })
}
