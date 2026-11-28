export const name = 'pi-mode-document-tools'
export const inject = ['tools', 'fs', 'workingDirectory', 'agents']

export async function apply(ctx, config = {}) {
  let entry
  try {
    entry = import.meta.resolve('@deepseek-ai/dsh-tool-document')
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    entry = import.meta.resolve('@deepseek-ai/dsh-tool-office')
  }
  const builtin = await import(entry)
  return builtin.apply(ctx, builtin.Config(config))
}
