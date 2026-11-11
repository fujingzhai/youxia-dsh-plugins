/**
 * 按运行 DSH 的系统提供 {{shell_tool}}、{{shell_rules}}（搜索与退出码）及 {{dsh_rules}}（实现定位与 dsh-doc 入口）。
 *
 * 提示词是整份替换的，官方工具自己注入的英文段落不会出现，所以对应说法写在这里。
 * Windows 挂了官方 glob / grep（自带 ripgrep，不要求本机安装 rg），命令行是 PowerShell；
 * macOS / Linux 不挂这两个工具，继续用 bash 的 ls、rg、find。
 * 检测只看 process.platform，用户不用改配置。
 */
export const name = 'pi-mode-shell'
export const inject = ['systemPrompt']

const RULES = {
  win32: [
    '- 用 glob 工具——而不是 shell find——按路径模式查找文件。',
    '- 用 grep 工具——而不是 shell grep 或 rg——搜索文件内容。需要上下文时，对命中的文件用 read。',
    '- 检查 pwsh 的 [exit code: N] 标记并结合命令语义判断；非预期失败或输出异常先查明再继续，不把无匹配等正常状态当失败。被中断后单独一个 [exit code: 1] 且没有信号标记，是终止，不是命令本身失败。',
  ].join('\n'),
  posix: [
    "- 列目录、找文件、搜内容都用 bash（ls、rg、find）。围绕同一子目录连续操作时优先传 workdir 或切 working_directory；内联多行脚本用 <<'EOF' 避免引号转义出错。",
    '- 检查 bash 的 [exit code: N] 标记并结合命令语义判断；非预期失败或输出异常先查明再继续，不把无匹配等正常状态当失败。',
  ].join('\n'),
}

export const shellRules = (platform = process.platform) => platform === 'win32' ? RULES.win32 : RULES.posix
export const shellTool = (platform = process.platform) => platform === 'win32' ? 'pwsh' : 'bash'

export function dshRules() {
  return '- DSH 实现位置以 runtime-context 为准；涉及 DSH 自身的功能、配置、插件、预设、工具或升级时，先加载 dsh-doc，按需查阅当前安装版本的文档，不默认遍历、解包或通读源码，信息不足则进行联网搜索。'
}

export function apply(ctx) {
  ctx.systemPrompt.variable('shell_tool', () => shellTool())
  ctx.systemPrompt.variable('shell_rules', () => shellRules())
  ctx.systemPrompt.variable('dsh_rules', () => dshRules())
}
