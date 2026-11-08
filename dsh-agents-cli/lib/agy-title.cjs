/** Antigravity's session-only title adapter: reads state JSON and emits plain text, never prompt content. */
const { readFileSync } = require('node:fs')
try {
  const data = JSON.parse(readFileSync(0, 'utf8'))
  const phase = { working: 'working', tool_use: 'working', initializing: 'working', idle: 'idle', done: 'done', reviewing: 'blocked', authenticating: 'blocked', blocked: 'blocked', waiting: 'blocked', waiting_for_user: 'blocked', error: 'error', failed: 'error' }[data.agent_state] || 'idle'
  process.stdout.write(`dsh-agents:${phase} Antigravity`)
} catch { process.stdout.write('dsh-agents:idle Antigravity') }
