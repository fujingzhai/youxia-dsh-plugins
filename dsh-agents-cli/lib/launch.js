/** Add session-local adapters only to the unmodified, bare default commands. */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
export function quoteArgument(value, shell = 'zsh') {
  const text = String(value)
  if (shell === 'cmd') return `"${text.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
  if (shell === 'pwsh' || shell === 'powershell') return `'${text.replaceAll("'", "''")}'`
  if (shell === 'fish') return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
  return `'${text.replaceAll("'", "'\\''")}'`
}
export function antigravityTitleSettings(node = process.execPath, platform = process.platform) {
  const callback = platform === 'win32'
    ? `set ELECTRON_RUN_AS_NODE=1&& "${node}" "${join(root, 'agy-title.cjs')}"`
    : `ELECTRON_RUN_AS_NODE=1 ${quoteArgument(node)} ${quoteArgument(join(root, 'agy-title.cjs'))}`
  return { title: { type: 'command', enabled: true, command: callback } }
}
export function activityCommand(command, shell = 'zsh', node = process.execPath, settingsFile) {
  const name = command.trim()
  const q = (text) => quoteArgument(text, shell)
  if (name === 'pi') return `${command} --extension ${q(join(root, 'pi-activity.mjs'))}`
  if (name === 'codex') return `${command} -c ${q('tui.terminal_title=["activity","thread-name"]')} -c ${q('tui.notifications=true')} -c ${q('tui.notification_method="osc9"')} -c ${q('tui.notification_condition="always"')}`
  if (name === 'agy') {
    // cmd reparses embedded quotes and && even in JSON; pass a session file instead.
    const settings = shell === 'cmd' ? settingsFile : JSON.stringify(antigravityTitleSettings(node))
    if (!settings) throw new Error('cmd Antigravity adapter requires its session settings file')
    return `${command} --settings ${q(settings)}`
  }
  return command
}
