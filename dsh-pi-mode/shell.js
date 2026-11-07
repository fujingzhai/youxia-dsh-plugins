/**
 * Pi 模式的 {{shell_rules}}：按运行 DSH 的系统填写找文件、搜内容和命令行的规矩。
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
    '- 找文件用 glob，搜文件内容用 grep，不要用 PowerShell 的 Get-ChildItem、Select-String，也不要找 bash、rg、find。',
    '- 需要上下文时，对 grep 命中的文件用 read，不要为了多看几行再搜一遍。',
    '- 跑命令用 pwsh，写 PowerShell，不要写 bash：路径用 Windows 形式，环境变量用 $env:NAME。',
    '- pwsh 结果末尾的 [exit code: N] 不是 0，或 exit 0 但本应有输出却为空、null、带 error，即没拿到结果，先查再走。被中断后单独一个 [exit code: 1] 且没有信号标记，是终止，不是命令本身失败。',
    '- 长命令转后台，记下 job id：完成会通知，不要空等（sleep、反复查询），也别重复发起同一件事，先做别的；收尾时收回仍要的结果（确实卡住才等），不要的关掉。',
  ].join('\n'),
  posix: [
    '- 列目录、找文件、搜内容都用 bash（ls、rg、find）。',
    '- bash 结果末尾的 [exit code: N] 不是 0，或 exit 0 但本应有输出却为空、null、带 error，即没拿到结果，先查再走。',
    '- 长命令转后台，记下 job id：完成会通知，不要空等（sleep、反复查询），也别重复发起同一件事，先做别的；收尾时收回仍要的结果（确实卡住才等），不要的关掉。',
  ].join('\n'),
}

export const shellRules = (platform = process.platform) => platform === 'win32' ? RULES.win32 : RULES.posix

export function apply(ctx) {
  ctx.systemPrompt.variable('shell_rules', () => shellRules())
}
