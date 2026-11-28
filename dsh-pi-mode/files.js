/** 三种预设共用 DSH 原生文件工具和精简指引。 */
export const name = 'pi-mode-files'
export const inject = ['tools', 'fs', 'systemPrompt', 'workingDirectory']

export const FILE_RULES = [
  '- 单处修改用 edit，多处或跨文件修改优先用 apply_patch。新建或整篇重写用 write。',
  '- edit 前先用 read 核对相关内容，刚创建或编辑过且掌握现状时可接着改。write 覆盖前先读原文。',
  '- 每个补丁块留足能唯一定位的上下文。预检失败不改文件。执行中遇错即停，已完成的操作保留。失败或中断后重读受影响文件再试。',
].join('\n')

export async function apply(ctx) {
  const builtin = await import('@deepseek-ai/dsh-tool-fs')
  // DSH 0.2.3-alpha.3 之前的宿主默认关闭 apply_patch。
  const resolved = builtin.Config({ applyPatch: true })
  if (resolved.applyPatch !== true) throw new Error('DSH-Pi 需要 DSH 0.2.2-rc.2 或更新版本的 apply_patch 支持')
  builtin.apply(ctx, resolved)
  ctx.systemPrompt.variable('file_rules', () => FILE_RULES)
}
