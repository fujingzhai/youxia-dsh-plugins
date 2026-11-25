window.__ModuleLoader__.load({
  id: 'dsh-pi-mode',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const namespace = 'youxiaPiMode'
    const text = {
      zh: {
        share: '帮助改进插件',
        defaultOn: '默认开启，可在插件页关闭。',
        details: '分享日期、插件版本、每周随机码、当天用过的模式及是否调用过 Code Mode。明细保留 14 天。',
        reminder: '长任务静默提醒', reminderHelp: '长任务长时间没有进度汇报时，提醒助手汇报。',
        off: '关闭统计', done: '知道了', error: '设置未保存，请重试。', unavailable: '暂时无法读取设置。',
        globalOff: '已随 DSH 遥测停用。',
      },
      en: {
        share: 'Help improve the plugin',
        defaultOn: 'On by default. Turn it off on the plugin page. ',
        details: 'Shares the date, plugin version, weekly random code, modes used that day, and whether Code Mode was called. Records are kept for 14 days.',
        reminder: 'Progress reminders', reminderHelp: 'Prompt the assistant to report progress after a long period of silence.',
        off: 'Turn off sharing', done: 'Got it', error: 'Settings could not be saved. Try again.', unavailable: 'Settings are temporarily unavailable.',
        globalOff: 'Disabled by the DSH telemetry setting.',
      },
    }
    const muted = { display: 'block', marginTop: 4, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-secondary, #666)' }
    const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBlock: 8 }
    const button = { font: 'inherit', padding: '4px 9px', cursor: 'pointer', borderRadius: 6,
      color: 'inherit', background: 'var(--dsw-alias-bg-layer-3, transparent)', border: '1px solid var(--dsw-alias-border-l4, #8886)' }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, text))
        let state = { data: null, busy: false, error: false }
        const listeners = new Set()
        const lifecycle = new AbortController()
        const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
        const snapshot = () => state
        function update(change) {
          state = { ...state, ...change }
          listeners.forEach(listener => listener())
        }
        async function request(change) {
          if (state.busy) return
          update({ busy: true, error: false })
          try {
            const options = change ? { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-dsh-pi-settings': '1' }, body: JSON.stringify(change) } : {}
            const response = await fetch('/dsh-pi-mode/settings', { ...options, signal: lifecycle.signal })
            if (!response.ok) throw new Error('Settings request failed')
            update({ data: await response.json() })
          } catch { if (!lifecycle.signal.aborted) update({ error: true }) }
          finally { if (!lifecycle.signal.aborted) update({ busy: false }) }
        }
        function useSettings() {
          const value = React.useSyncExternalStore(subscribe, snapshot, snapshot)
          React.useEffect(() => { void request() }, [])
          return value
        }

        function Settings({ t }) {
          const { data, busy, error } = useSettings()
          function toggle(key, label, details, disabled = false) {
            return h('label', { style: row }, h('span', null, label, h('small', { style: muted }, details)),
              h('input', { type: 'checkbox', role: 'switch', 'aria-label': label, checked: Boolean(data?.[key]),
                disabled: busy || !data?.editable || disabled, onChange: event => void request({ [key]: event.target.checked }) }))
          }
          return h('div', null,
            toggle('shareUsage', t('share'), t('details') + (data?.globalOff ? ' ' + t('globalOff') : ''), data?.globalOff),
            toggle('progressReminder', t('reminder'), t('reminderHelp')),
            error && h('small', { role: 'alert', style: muted }, t(data ? 'error' : 'unavailable')))
        }

        function Notice({ t }) {
          const { data, busy, error } = useSettings()
          const show = data?.showNotice
          React.useEffect(() => {
            if (!show) return
            let timer
            function schedule() {
              clearTimeout(timer)
              if (document.visibilityState === 'visible') timer = setTimeout(() => void request({ usageNoticeSeen: true }), 30_000)
            }
            schedule()
            document.addEventListener('visibilitychange', schedule)
            return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule) }
          }, [show])
          if (!show) return null
          return h('aside', { 'aria-label': t('share'), style: { position: 'fixed', insetInlineEnd: 20, bottom: 24, zIndex: 50,
            width: 'min(340px, calc(100vw - 40px))', boxSizing: 'border-box', padding: 14, fontSize: 13,
            color: 'var(--dsw-alias-label-primary, #222)', background: 'var(--dsw-specific-menu, Canvas)',
            border: '1px solid var(--dsw-alias-border-l4, #8886)', borderRadius: 10, boxShadow: '0 3px 16px #0002' } },
            h('strong', null, t('share')), h('span', { style: muted }, t('defaultOn') + t('details')),
            error && h('small', { role: 'alert', style: muted }, t('error')),
            h('div', { style: { display: 'flex', justifyContent: 'end', gap: 8, marginTop: 8 } },
              h('button', { type: 'button', style: button, disabled: busy, onClick: () => void request({ shareUsage: false }) }, t('off')),
              h('button', { type: 'button', style: button, disabled: busy, onClick: () => void request({ usageNoticeSeen: true }) }, t('done'))))
        }

        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-pi-mode', locale: namespace }, Settings))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-pi-mode.usage-notice', locale: namespace }, Notice))
        ctx.effect(() => () => lifecycle.abort())
      },
    }
  },
})
