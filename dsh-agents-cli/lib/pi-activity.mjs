/** Session-only Pi extension; no settings, prompts, tools or conversation content are changed. */
export default function (pi) {
  let context, working = false, compacting = false, background = 0, failed = false, completed = false
  const report = (phase) => {
    if (context?.mode === 'tui' || context?.hasUI) process.stdout.write(`\x1b]7501;state=${phase}:app=pi\x1b\\`)
  }
  const sync = () => report(working || compacting || background > 0 ? 'working' : failed ? 'error' : completed ? 'done' : 'idle')
  pi.on('session_start', (_event, ctx) => { context = ctx; working = compacting = failed = completed = false; background = 0; report('idle') })
  pi.on('agent_start', (_event, ctx) => { context = ctx; working = true; failed = false; sync() })
  pi.on('agent_end', (event) => {
    const last = event.messages?.filter((message) => message.role === 'assistant').at(-1)
    failed = last?.stopReason === 'error'
  })
  pi.on('agent_settled', (event, ctx) => { context = ctx; working = false; completed = !event.aborted; sync() })
  pi.on('session_before_compact', (_event, ctx) => { context = ctx; compacting = true; sync() })
  for (const event of ['session_compact', 'session_compact_failed']) pi.on(event, (_event, ctx) => { context = ctx; compacting = false; completed = true; sync() })
  pi.on('ui_prompt_start', () => report('blocked'))
  pi.on('ui_prompt_end', sync)
  pi.events.on('bgrun:status', (data) => { if (typeof data?.running === 'number' && Number.isFinite(data.running)) { const next = Math.max(0, data.running); if (background > 0 && next === 0) completed = true; background = next; sync() } })
  pi.on('session_shutdown', () => { report('clear'); context = undefined })
}
