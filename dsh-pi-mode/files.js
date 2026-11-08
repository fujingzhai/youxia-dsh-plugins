/** 三种预设共用文件工具入口；Pi+ 只多开 apply_patch 并替换两条文件规矩。 */
export const name = 'pi-mode-files'
export const inject = ['tools', 'fs', 'systemPrompt', 'workingDirectory']

export const EDIT_RULES = '- 局部修改用 edit，write 只用于新建或整篇重写；修改或覆盖文件前先 read 一遍。'
export const PATCH_RULES = [
  '- 单处局部修改用 edit；同一文件多处或跨文件修改优先用 apply_patch；write 只用于新建或整篇重写。修改或覆盖文件前先 read 一遍。',
  '- apply_patch 各补丁块保留足够且不重叠的上下文以准确匹配；预检拒绝不改文件，但执行中失败会保留已完成的改动，不会整批回滚。失败或中断后先重读受影响文件，再按实际状态重试。',
].join('\n')

export function fileRules(config = {}) {
  return config?.applyPatch === true ? PATCH_RULES : EDIT_RULES
}

export async function apply(ctx, config = {}) {
  const builtin = await import('@deepseek-ai/dsh-tool-fs')
  const applyPatch = config?.applyPatch === true
  const resolved = builtin.Config({ applyPatch })
  // 旧版 DSH 可能忽略未知配置；不得让 Pi+ 静默退化成没有补丁工具的 Pi。
  if (applyPatch && resolved.applyPatch !== true) throw new Error('Pi+模式需要 DSH 0.2.2-rc.1 或更新版本的 apply_patch 支持')
  builtin.apply(ctx, resolved)
  ctx.systemPrompt.variable('file_rules', () => fileRules({ applyPatch }))
}
