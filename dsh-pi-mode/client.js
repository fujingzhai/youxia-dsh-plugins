window.__ModuleLoader__.load({
  id: 'dsh-pi-mode',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const namespace = 'youxiaPiMode'
    const text = {
      zh: {
        heading: '设置',
        share: '帮助改进 Pi 模式插件',
        defaultOn: '默认开启，可随时在「插件 → DSH-Pi」关闭。',
        details: '仅在使用 Pi / Pi+ / Pi-IM 时发送匿名统计：日期、插件版本、每周轮换的随机编号、当天用过的模式，以及是否用过 Code Mode。不收集对话、代码、脚本内容、文件路径或账号等任何隐私信息；原始记录保留 14 天后自动清理。',
        off: '关闭统计',
        done: '知道了',
        error: '设置未保存，请重试。',
        unavailable: '暂时无法读取设置。',
        globalOff: '已随 DSH 遥测设置停用。',
      },
      en: {
        heading: 'Settings',
        share: 'Help improve the Pi Mode plugin',
        defaultOn: 'On by default. You can turn this off anytime in Plugins → DSH-Pi.',
        details: 'Sends anonymous usage counts only when you use Pi, Pi+, or Pi-IM: the date, plugin version, a weekly rotating random ID, which modes were used that day, and whether Code Mode was used. No conversations, code, scripts, file paths, accounts, or other personal data are collected; raw records are automatically deleted after 14 days.',
        off: 'Turn off',
        done: 'Got it',
        error: 'Could not save setting. Please try again.',
        unavailable: 'Settings are temporarily unavailable.',
        globalOff: 'Disabled by DSH telemetry setting.',
      },
    }

    const css = `
.yxpi-section{display:flex;flex-direction:column;gap:12px}
.yxpi-heading{margin:0;font-size:14px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.yxpi-row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:12px 2px;border-top:.5px solid var(--dsw-alias-border-l2,#8883);border-bottom:.5px solid var(--dsw-alias-border-l2,#8883)}
.yxpi-copy{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.yxpi-label{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.yxpi-desc{margin:0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary,#666)}
.yxpi-error{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-error,#e44848)}
.yxpi-switch{box-sizing:border-box;position:relative;flex:none;width:36px;height:20px;padding:2px;margin-top:2px;border:0;border-radius:999px;background:var(--dsw-alias-border-l3,#8885);cursor:pointer;transition:background-color .12s;-webkit-tap-highlight-color:transparent}
.yxpi-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary,#4d6bfe)}
.yxpi-switch:disabled{cursor:default;opacity:.5}
.yxpi-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:2px}
.yxpi-thumb{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .12s;pointer-events:none}
.yxpi-switch[aria-checked=true] .yxpi-thumb{background:var(--dsw-alias-label-primary-foreground,#fff);transform:translateX(16px)}
.yxpi-notice{position:fixed;inset-inline-end:20px;bottom:24px;z-index:1050;width:min(368px,calc(100vw - 40px));box-sizing:border-box;padding:14px 16px;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#222);background:var(--dsw-specific-menu,Canvas);backdrop-filter:var(--dsw-menu-backdrop-filter,none);border:.5px solid var(--dsw-alias-border-l1,var(--dsw-alias-border-l4,#8886));border-radius:var(--dsw-radius-lg,12px);box-shadow:var(--dsw-elevation-prominent,0 6px 24px #0002);display:flex;flex-direction:column;gap:6px}
.yxpi-notice-title{margin:0;font-size:13px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.yxpi-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}
.yxpi-btn{box-sizing:border-box;appearance:none;font:inherit;font-size:12px;line-height:18px;height:28px;padding:0 11px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary,inherit);background:transparent;border:.5px solid transparent;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,#8885)}
.yxpi-btn:disabled{opacity:.45;cursor:not-allowed}
.yxpi-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d6bfe));outline-offset:2px}
.yxpi-btn.primary{box-shadow:none;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#4d6bfe));color:var(--dsw-alias-label-primary-foreground,#fff)}
@media (hover:hover){.yxpi-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8882)}.yxpi-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#4d6bfe))}}
@media (prefers-reduced-motion:reduce){.yxpi-switch,.yxpi-thumb{transition:none}}
`

    function createController({ fetchImpl = fetch, signal } = {}) {
      let state = {
        data: null,
        optimistic: null,
        noticeOpen: false,
        noticeBusy: false,
        settingsError: null,
        noticeError: false,
      }
      const listeners = new Set()
      let loading = null
      let flushing = null
      let mutationEpoch = 0
      let desiredShareUsage = null
      let noticeTriggered = false
      let noticeAcked = false
      let pendingNoticeAck = false

      const isAborted = () => Boolean(signal?.aborted)
      const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }
      const getSnapshot = () => state
      function update(change) {
        if (isAborted()) return
        const next = { ...state, ...change }
        if (Object.keys(change).every(key => state[key] === next[key])) return
        state = next
        listeners.forEach(listener => listener())
      }

      async function callApi(change) {
        const options = change
          ? {
              method: 'PATCH',
              credentials: 'same-origin',
              cache: 'no-store',
              headers: { 'content-type': 'application/json', 'x-dsh-pi-settings': '1' },
              body: JSON.stringify(change),
            }
          : { credentials: 'same-origin', cache: 'no-store' }
        const response = await fetchImpl('/dsh-pi-mode/settings', { ...options, ...(signal ? { signal } : {}) })
        if (!response.ok) throw new Error('Settings request failed')
        return response.json()
      }

      function load() {
        if (isAborted()) return Promise.resolve()
        if (loading) return loading
        const epoch = mutationEpoch
        loading = (async () => {
          try {
            const data = await callApi()
            if (isAborted() || epoch !== mutationEpoch) return
            if (data.showNotice === false) noticeAcked = true
            update({ data, settingsError: null })
          } catch {
            if (!isAborted() && !state.data) update({ settingsError: 'load' })
          } finally {
            loading = null
          }
        })()
        return loading
      }

      function flush() {
        if (flushing) return flushing
        flushing = (async () => {
          try {
            while (!isAborted()) {
              if (desiredShareUsage !== null) {
                const target = desiredShareUsage
                desiredShareUsage = null
                pendingNoticeAck = false
                try {
                  const data = await callApi({ shareUsage: target })
                  if (isAborted()) return
                  noticeAcked = true
                  if (desiredShareUsage === data.shareUsage) desiredShareUsage = null
                  const settled = desiredShareUsage === null
                  update({
                    data,
                    ...(settled ? { optimistic: null } : {}),
                    settingsError: null,
                    noticeError: false,
                  })
                } catch {
                  if (isAborted()) return
                  if (desiredShareUsage === null) {
                    update({ optimistic: null, settingsError: 'save', noticeError: state.noticeOpen })
                  }
                }
                continue
              }
              if (pendingNoticeAck) {
                pendingNoticeAck = false
                if (noticeAcked) continue
                try {
                  const data = await callApi({ usageNoticeSeen: true })
                  if (isAborted()) return
                  noticeAcked = true
                  update({ data, noticeError: false })
                } catch { /* Retry when the user dismisses or on next visit if still unseen. */ }
                continue
              }
              break
            }
          } finally {
            flushing = null
            if (!isAborted() && (desiredShareUsage !== null || (pendingNoticeAck && !noticeAcked))) void flush()
          }
        })()
        return flushing
      }

      function openNoticeOnce() {
        if (noticeTriggered || !state.data?.showNotice) return false
        noticeTriggered = true
        update({ noticeOpen: true, noticeError: false })
        return true
      }

      function ackNoticeInBackground() {
        if (noticeAcked || pendingNoticeAck || desiredShareUsage !== null) return
        mutationEpoch++
        pendingNoticeAck = true
        void flush()
      }

      async function dismissNotice() {
        if (noticeAcked) {
          update({ noticeOpen: false, noticeError: false })
          return true
        }
        mutationEpoch++
        pendingNoticeAck = true
        update({ noticeBusy: true, noticeError: false })
        await flush()
        if (isAborted()) return false
        if (noticeAcked) {
          update({ noticeOpen: false, noticeBusy: false, noticeError: false })
          return true
        }
        update({ noticeBusy: false, noticeError: true })
        return false
      }

      async function turnOffFromNotice() {
        mutationEpoch++
        desiredShareUsage = false
        pendingNoticeAck = false
        update({ optimistic: false, noticeBusy: true, settingsError: null, noticeError: false })
        await flush()
        if (isAborted()) return false
        const savedOff = state.data?.shareUsage === false
        if (!state.noticeOpen) {
          update({ noticeBusy: false, noticeError: false })
          return savedOff
        }
        update({
          noticeBusy: false,
          ...(savedOff ? { noticeOpen: false, noticeError: false } : { noticeError: true }),
        })
        return savedOff
      }

      function autoHideNotice() {
        if (!state.noticeOpen) return
        update({ noticeOpen: false })
        if (!noticeAcked) ackNoticeInBackground()
      }

      function toggleShareUsage(next) {
        if (!state.data?.editable || state.data?.globalOff) return
        mutationEpoch++
        desiredShareUsage = Boolean(next)
        pendingNoticeAck = false
        update({
          optimistic: Boolean(next),
          noticeOpen: false,
          settingsError: null,
          noticeError: false,
        })
        void flush()
      }

      return {
        subscribe,
        getSnapshot,
        load,
        openNoticeOnce,
        ackNoticeInBackground,
        dismissNotice,
        turnOffFromNotice,
        autoHideNotice,
        toggleShareUsage,
      }
    }

    return {
      // Exposed pure helpers permit regression tests without a browser DOM.
      createController,
      text,
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, text))
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.dshPiMode = ''
          style.textContent = css
          document.head.appendChild(style)
          return () => style.remove()
        })

        const lifecycle = new AbortController()
        const controller = createController({ signal: lifecycle.signal })
        function useSettings() {
          const value = React.useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
          React.useEffect(() => { void controller.load() }, [])
          return value
        }

        function Settings({ t }) {
          const { data, optimistic, settingsError } = useSettings()
          const labelId = React.useId()
          const descId = React.useId()
          if (!data) {
            return settingsError === 'load'
              ? h('div', { className: 'yxpi-section' },
                  h('h4', { className: 'yxpi-heading' }, t('heading')),
                  h('p', { role: 'alert', className: 'yxpi-error' }, t('unavailable')))
              : null
          }
          const disabled = !data.editable || data.globalOff
          const checked = disabled ? Boolean(data.shareUsage) : (optimistic ?? Boolean(data.shareUsage))
          const details = t('details') + (data.globalOff ? ' ' + t('globalOff') : '')
          return h('div', { className: 'yxpi-section' },
            h('h4', { className: 'yxpi-heading' }, t('heading')),
            h('div', { className: 'yxpi-row' },
              h('div', { className: 'yxpi-copy' },
                h('span', { id: labelId, className: 'yxpi-label' }, t('share')),
                h('p', { id: descId, className: 'yxpi-desc' }, details)),
              h('button', {
                type: 'button',
                role: 'switch',
                className: 'yxpi-switch',
                'aria-checked': checked,
                'aria-labelledby': labelId,
                'aria-describedby': descId,
                disabled,
                onClick: () => controller.toggleShareUsage(!checked),
              }, h('span', { className: 'yxpi-thumb', 'aria-hidden': true }))),
            settingsError === 'save' && h('p', { role: 'alert', className: 'yxpi-error' }, t('error')))
        }

        function Notice({ t }) {
          const { data, noticeOpen, noticeBusy, noticeError } = useSettings()
          const showNotice = Boolean(data?.showNotice)

          React.useEffect(() => {
            if (!showNotice) return
            function tryOpen() {
              if (document.visibilityState === 'visible') controller.openNoticeOnce()
            }
            tryOpen()
            document.addEventListener('visibilitychange', tryOpen)
            return () => document.removeEventListener('visibilitychange', tryOpen)
          }, [showNotice])

          React.useEffect(() => {
            if (!noticeOpen) return
            let ackTimer
            let hideTimer
            let remaining = 30_000
            let startedAt = 0
            let ackScheduled = false

            function clearTimers() {
              clearTimeout(ackTimer)
              clearTimeout(hideTimer)
              ackTimer = hideTimer = undefined
              if (startedAt) {
                remaining = Math.max(0, remaining - (Date.now() - startedAt))
                startedAt = 0
              }
            }

            function syncVisibility() {
              if (document.visibilityState !== 'visible') {
                clearTimers()
                return
              }
              if (startedAt) return
              startedAt = Date.now()
              if (!ackScheduled) {
                ackTimer = setTimeout(() => {
                  ackScheduled = true
                  controller.ackNoticeInBackground()
                }, 800)
              }
              hideTimer = setTimeout(() => controller.autoHideNotice(), remaining)
            }

            syncVisibility()
            document.addEventListener('visibilitychange', syncVisibility)
            return () => {
              clearTimers()
              document.removeEventListener('visibilitychange', syncVisibility)
            }
          }, [noticeOpen])

          if (!noticeOpen) return null
          return h('aside', { 'aria-label': t('share'), className: 'yxpi-notice' },
            h('p', { className: 'yxpi-notice-title' }, t('share')),
            h('p', { className: 'yxpi-desc' }, t('defaultOn')),
            h('p', { className: 'yxpi-desc' }, t('details')),
            noticeError && h('p', { role: 'alert', className: 'yxpi-error' }, t('error')),
            h('div', { className: 'yxpi-actions' },
              h('button', { type: 'button', className: 'yxpi-btn', disabled: noticeBusy, onClick: () => void controller.turnOffFromNotice() }, t('off')),
              h('button', { type: 'button', className: 'yxpi-btn primary', disabled: noticeBusy, onClick: () => void controller.dismissNotice() }, t('done'))))
        }

        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: 'dsh-pi-mode', locale: namespace }, Settings))
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'dsh-pi-mode.usage-notice', locale: namespace }, Notice))
        ctx.effect(() => () => lifecycle.abort())
      },
    }
  },
})
