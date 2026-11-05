/**
 * Pi 模式的个人设置入口。写在自己 profile 的 cordis.patch.yml 里覆盖，不用改插件文件：
 *
 *   - id: pi-mode-settings
 *     name: dsh-pi-mode/settings.js
 *     config:
 *       deny: [要在 Pi 模式里屏蔽的全局工具名, ...]
 *
 * 预设里的全局工具屏蔽（index.js）每次组装提示词时合并这里的 deny，改完无需重启。
 * DSH 的用户补丁按 id 整体替换配置、不做深度合并，所以个人名单放在这个顶层条目，而不是预设内部那一行。
 */
export const name = 'pi-mode-settings'

const KEY = Symbol.for('dsh-pi-mode.settings')

export function apply(ctx, config) {
  const value = Object.freeze({
    deny: Object.freeze(Array.isArray(config?.deny) ? config.deny.filter(item => typeof item === 'string' && item !== '') : []),
  })
  ctx.effect(() => {
    globalThis[KEY] = value
    return () => {
      if (globalThis[KEY] === value) delete globalThis[KEY]
    }
  }, 'pi-mode-settings')
}
