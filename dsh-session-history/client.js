window.__ModuleLoader__.load({
  id: 'dsh-session-history',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PACKAGE = 'dsh-session-history';
    const API = './youxia-session-history/api';

    const css = `
.yxsh{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:flex;flex-direction:column;gap:22px;max-width:820px}
.yxsh *{box-sizing:border-box}.yxsh button,.yxsh input,.yxsh select,.yxsh textarea{font:inherit;color:inherit}
.yxsh h3{margin:0 0 6px;font-size:13px;font-weight:600}.yxsh-muted{color:var(--dsw-alias-label-tertiary,#888);font-size:12px}
.yxsh-row{display:flex;align-items:center;gap:10px;min-width:0;flex-wrap:wrap}.yxsh-grow{flex:1;min-width:0}
.yxsh-btn{appearance:none;cursor:pointer;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:3px 10px;font-size:12px;line-height:1.6;white-space:nowrap}
.yxsh-btn:disabled{opacity:.5;cursor:default}.yxsh-btn.primary{background:var(--dsw-alias-interactive-bg-primary,#0A84FF);color:#fff;border-color:transparent}
@media (hover:hover){.yxsh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8882)}.yxsh-btn.primary:hover:not(:disabled){filter:brightness(1.08);background:var(--dsw-alias-interactive-bg-primary,#0A84FF)}}
.yxsh-card{border:0.5px solid var(--dsw-alias-border-l2,#8883);border-radius:10px;overflow:hidden}
.yxsh-agent{display:grid;grid-template-columns:minmax(120px,1.1fr) minmax(150px,1.4fr) minmax(170px,2fr) auto;gap:10px;align-items:center;padding:10px 12px;border-top:0.5px solid var(--dsw-alias-border-l2,#8883)}
.yxsh-agent:first-child{border-top:0}.yxsh-agent b{font-weight:500}
.yxsh-chip{display:inline-flex;align-items:center;gap:5px;border-radius:5px;padding:1px 7px;font-size:12px;background:var(--dsw-alias-bg-layer-4,#8881);color:var(--dsw-alias-label-secondary,#666);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.yxsh-chip.ok{background:color-mix(in srgb,#34C759 15%,transparent);color:var(--dsw-alias-label-primary,inherit)}
.yxsh-chip.bad{background:color-mix(in srgb,#FF3B30 14%,transparent);color:var(--dsw-alias-label-error,#e44848)}
.yxsh-dot{width:7px;height:7px;border-radius:50%;background:currentColor;flex:none}.yxsh-chip.ok .yxsh-dot{background:#34C759}
.yxsh-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer}.yxsh-switch input{margin:0}
.yxsh-field{display:grid;grid-template-columns:200px 1fr;gap:12px;align-items:start;padding:9px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2,#8883)}
.yxsh-field:last-of-type{border-bottom:0}.yxsh-field label{padding-top:4px}
.yxsh-input{height:30px;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:0 10px;min-width:0;width:100%;max-width:320px}
.yxsh textarea.yxsh-input{height:64px;padding:6px 10px;resize:vertical;max-width:420px;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
.yxsh-error{color:var(--dsw-alias-label-error,#e44848);font-size:12px;white-space:pre-wrap}
.yxsh-pre{margin:8px 0 0;padding:10px 12px;max-height:320px;overflow:auto;border-radius:8px;background:var(--dsw-alias-bg-layer-4,#8881);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11.5px;line-height:1.55;white-space:pre-wrap}
.yxsh summary{cursor:pointer;font-weight:600}.yxsh code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
@media (max-width:720px){.yxsh-agent{grid-template-columns:1fr 1fr}.yxsh-field{grid-template-columns:1fr}}
`;

    function source(initial) {
      let value = initial;
      const listeners = new Set();
      return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { value = { ...value, ...next }; for (const fn of listeners) fn(); } };
    }

    function fmtRun(last) {
      if (!last) return '尚未整理过';
      const when = String(last.run || '').replace('T', ' ').slice(0, 16);
      const bad = Object.entries(last.agents || {}).filter(([, r]) => !r.ok).map(([k]) => k);
      return `${when} · ${(Number(last.ms || 0) / 1000).toFixed(1)} 秒 · ${last.index?.sessions ?? '?'} 个会话` + (bad.length ? ` · 出错：${bad.join('、')}` : '');
    }

    function skillChip(agent) {
      if (agent.visible) return h('span', { className: 'yxsh-chip ok', title: agent.via }, h('span', { className: 'yxsh-dot' }), `技能可用 · 经 ${agent.via}`);
      if (agent.conflict) return h('span', { className: 'yxsh-chip bad', title: agent.conflict.path }, `冲突：${agent.conflict.path}`);
      return h('span', { className: 'yxsh-chip' }, '技能未接入');
    }

    function sourceText(agent, last) {
      if (!agent.installed) return h('span', { className: 'yxsh-muted' }, '本机未检测到');
      const run = last?.agents?.[agent.folder];
      if (!agent.enabled) return h('span', { className: 'yxsh-muted' }, '已检测到，未整理');
      if (!run) return h('span', { className: 'yxsh-muted' }, '已检测到，待整理');
      return run.ok ? h('span', null, `${run.files} 个会话文件 · ${run.days} 天日志`) : h('span', { className: 'yxsh-error' }, `出错：${run.error}`);
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        let alive = true;
        const state = source({ data: null, loading: true, error: '', pending: '' });
        const useState = () => React.useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);

        async function api(command) {
          const response = await fetch(API, { credentials: 'same-origin', cache: 'no-store',
            ...(command ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) } : {}) });
          const value = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
          return value;
        }
        async function load() {
          try { const data = await api(); if (alive) state.set({ data, loading: false, error: '' }); }
          catch (error) { if (alive) state.set({ loading: false, error: error.message }); }
        }
        async function run(command, label) {
          if (state.getSnapshot().pending) return false;
          state.set({ pending: label, error: '' });
          try { const data = await api(command); if (alive) state.set({ data }); return true; }
          catch (error) { if (alive) state.set({ error: error.message }); load(); return false; }
          finally { if (alive) state.set({ pending: '' }); }
        }

        function Agents({ data, pending }) {
          const missing = data.agents.filter(a => a.installed && !a.visible && !a.conflict);
          return h('section', null,
            h('div', { className: 'yxsh-row' },
              h('h3', { className: 'yxsh-grow' }, 'Agent 与技能'),
              missing.length ? h('button', { className: 'yxsh-btn primary', disabled: !!pending, onClick: () => run({ op: 'linkAll' }, 'link') },
                pending === 'link' ? '接入中…' : `一键接入（${missing.map(a => a.name).join('、')}）`) : null),
            h('p', { className: 'yxsh-muted', style: { margin: '0 0 8px' } },
              '技能不拷副本：在各 agent 读取的技能目录里放一个指向数据目录的软链 ', h('code', null, 'session-history'), '。按真实路径识别共用目录——几家共用的目录只需一条软链。'),
            h('div', { className: 'yxsh-card' }, ...data.agents.map(a => {
              const shared = [...new Set(a.dirs.flatMap(d => d.sharedWith || []))];
              const own = a.dirs.some(d => d.state === 'link');
              return h('div', { className: 'yxsh-agent', key: a.id },
                h('div', null, h('b', null, a.name), shared.length ? h('div', { className: 'yxsh-muted' }, `与 ${shared.join('、')} 共用技能目录`) : null),
                h('div', null, sourceText(a, data.last),
                  a.installed ? h('div', null, h('label', { className: 'yxsh-switch yxsh-muted' },
                    h('input', { type: 'checkbox', checked: a.enabled, disabled: !!pending, onChange: e => run({ op: 'enable', agent: a.id, enabled: e.target.checked }, 'enable') }), '整理此 agent 的会话')) : null),
                h('div', { style: { minWidth: 0 } }, skillChip(a),
                  h('div', { className: 'yxsh-muted', title: a.dirs.map(d => d.display).join('\n') }, '读取 ', a.dirs.map(d => d.display).join('、'))),
                h('div', null,
                  a.visible ? (own ? h('button', { className: 'yxsh-btn', disabled: !!pending, title: shared.length ? `共用该目录的 ${shared.join('、')} 也会一起看不到` : '',
                    onClick: () => run({ op: 'unlink', agent: a.id }, 'unlink') }, '移除软链') : null)
                    : a.conflict ? null
                    : h('button', { className: 'yxsh-btn', disabled: !!pending, onClick: () => run({ op: 'link', agent: a.id }, 'link') }, '创建软链')));
            })),
            data.legacy.length ? h('p', { className: 'yxsh-muted', style: { margin: '6px 0 0' } }, `已停用来源的旧日志：${data.legacy.join('、')}（照常检索）`) : null);
        }

        function Settings({ data, pending }) {
          const c = data.config;
          const [draft, setDraft] = React.useState(null);
          const d = draft || { userLabel: c.userLabel, timezone: c.timezone, dayStartHour: c.dayStartHour, refreshMinutes: c.refreshMinutes,
            staleMinutes: c.staleMinutes, memoryHints: c.memoryHints, gitSnapshots: c.gitSnapshots, excludeCwds: (c.excludeCwds || []).join('\n') };
          const set = patch => setDraft({ ...d, ...patch });
          const field = (label, control, hint) => h('div', { className: 'yxsh-field' }, h('label', null, label), h('div', null, control, hint ? h('div', { className: 'yxsh-muted' }, hint) : null));
          const select = (value, options, onChange) => h('select', { className: 'yxsh-input', value, onChange: e => onChange(Number(e.target.value)) },
            ...options.map(([v, text]) => h('option', { key: v, value: v }, text)));
          const save = async () => {
            const ok = await run({ op: 'config', patch: { ...d, excludeCwds: d.excludeCwds.split('\n').map(s => s.trim()).filter(Boolean) } }, 'config');
            if (ok) setDraft(null);
          };
          return h('section', null,
            h('h3', null, '设置'),
            field('日志里用户的称呼', h('input', { className: 'yxsh-input', value: d.userLabel, maxLength: 12, onChange: e => set({ userLabel: e.target.value }) }),
              '只影响此后新整理的发言标题；旧日志不改。'),
            field('定时整理（DSH 运行时）', select(d.refreshMinutes, [[0, '关闭'], [30, '每 30 分钟'], [60, '每小时整点'], [120, '每 2 小时'], [360, '每 6 小时']], v => set({ refreshMinutes: v })),
              '整理在子进程里跑，只重读变过的会话文件。'),
            field('检索前自动补整理', select(d.staleMinutes, [[0, '关闭'], [10, '距上次超过 10 分钟'], [30, '距上次超过 30 分钟'], [60, '距上次超过 1 小时']], v => set({ staleMinutes: v })),
              'DSH 没开时，别的 agent 检索也能拿到较新的对话。'),
            field('日界', select(d.dayStartHour, Array.from({ length: 24 }, (_, i) => [i, `${i} 点`]), v => set({ dayStartHour: v })), '这个钟点之前的对话算前一天。'),
            field('时区', h('input', { className: 'yxsh-input', value: d.timezone, placeholder: '留空跟随系统；或 +08:00、Asia/Shanghai', onChange: e => set({ timezone: e.target.value }) })),
            field('检索附 Claude Code 记忆', h('label', { className: 'yxsh-switch' }, h('input', { type: 'checkbox', checked: d.memoryHints, onChange: e => set({ memoryHints: e.target.checked }) }), '对题时列至多 2 条记忆的文件名与描述')),
            field('日志 Git 快照', h('label', { className: 'yxsh-switch' }, h('input', { type: 'checkbox', checked: d.gitSnapshots, onChange: e => set({ gitSnapshots: e.target.checked }) }), '每次整理后把 logs/ 提交一次'),
              data.git ? '数据目录已是 Git 仓库。' : '开启时在数据目录建 Git 仓库（只收 logs/）。'),
            field('不收的工作目录', h('textarea', { className: 'yxsh-input', value: d.excludeCwds, placeholder: '每行一个，如 ~/scratch', onChange: e => set({ excludeCwds: e.target.value }) }),
              '临时目录（/tmp 等）本就不收。'),
            h('div', { className: 'yxsh-row', style: { paddingTop: '10px' } },
              h('button', { className: 'yxsh-btn primary', disabled: !draft || !!pending, onClick: save }, pending === 'config' ? '保存中…' : '保存'),
              draft ? h('button', { className: 'yxsh-btn', disabled: !!pending, onClick: () => setDraft(null) }, '还原') : null));
        }

        function Panel({ view }) {
          const s = useState();
          React.useEffect(() => { load(); }, []);
          if (view && view !== 'page') return null;
          if (s.loading && !s.data) return h('div', { className: 'yxsh yxsh-muted' }, h('style', null, css), '读取中…');
          if (!s.data) return h('div', { className: 'yxsh' }, h('style', null, css), h('p', { className: 'yxsh-error' }, s.error || '读取失败'),
            h('button', { className: 'yxsh-btn', onClick: load }, '重试'));
          const data = s.data;
          return h('div', { className: 'yxsh' }, h('style', null, css),
            h('section', null,
              h('div', { className: 'yxsh-row' },
                h('div', { className: 'yxsh-grow' },
                  h('div', null, '数据目录 ', h('code', null, data.home), h('span', { className: 'yxsh-muted' }, '（日志、索引、设置都在这里，与插件分开存放：卸载、更新、重装都不动它）')),
                  h('div', { className: 'yxsh-muted' }, '最近整理：', fmtRun(data.last))),
                h('button', { className: 'yxsh-btn', onClick: () => run({ op: 'open' }, 'open'), disabled: !!s.pending }, '打开目录'),
                h('button', { className: 'yxsh-btn primary', onClick: () => run({ op: 'refresh' }, 'refresh'), disabled: !!s.pending || data.running },
                  s.pending === 'refresh' || data.running ? '整理中…' : '立即整理')),
              s.error ? h('p', { className: 'yxsh-error', role: 'alert' }, s.error) : null),
            h(Agents, { data, pending: s.pending }),
            h(Settings, { data, pending: s.pending, key: JSON.stringify(data.config) }),
            h('section', null, h('details', null, h('summary', null, 'SKILL.md（按本机 agent 自动生成）'),
              h('pre', { className: 'yxsh-pre' }, data.skill))));
        }

        ctx.effect(() => () => { alive = false; });
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE }, Panel));
      },
    };
  },
});
