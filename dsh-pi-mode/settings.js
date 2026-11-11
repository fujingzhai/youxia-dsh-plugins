/**
 * Pi 模式的个人设置入口。写在自己 profile 的 cordis.patch.yml 里覆盖，不用改插件文件：
 *
 *   - id: pi-mode-settings
 *     name: dsh-pi-mode/settings.js
 *     config:
 *       deny: [要在 Pi 模式里屏蔽的全局工具名, ...]
 *       imDeny: [要在 Pi-IM 里屏蔽的全局工具名, ...]
 *       progressReminder: false # 可选：关闭内置的低频静默提醒，默认开启
 *
 * 预设里的全局工具屏蔽（index.js）随这里的名单变化更新，改完无需重启。
 * DSH 的用户补丁按 id 整体替换配置、不做深度合并，所以个人名单放在这个顶层条目，而不是预设内部那一行。
 */
export const name = 'pi-mode-settings'

const KEY = Symbol.for('dsh-pi-mode.settings')

const names = list => Object.freeze(Array.isArray(list) ? list.filter(item => typeof item === 'string' && item !== '') : [])

export function apply(ctx, config) {
  const value = Object.freeze({
    deny: names(config?.deny),
    imDeny: names(config?.imDeny),
    progressReminder: config?.progressReminder !== false,
  })
  ctx.effect(() => {
    globalThis[KEY] = value
    ctx.emit('pi-mode/settings-change')
    return () => {
      if (globalThis[KEY] === value) {
        delete globalThis[KEY]
        ctx.emit('pi-mode/settings-change')
      }
    }
  }, 'pi-mode-settings')
}
