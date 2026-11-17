window.__ModuleLoader__.load({
  id: 'dsh-session-history',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const PACKAGE = 'dsh-session-history';
    const API = './youxia-session-history/api';

    const css = `
.yxsh{width:100%;font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,inherit);display:flex;flex-direction:column;gap:28px}
.yxsh *{box-sizing:border-box}.yxsh button,.yxsh input,.yxsh select,.yxsh textarea{font:inherit;color:inherit}
.yxsh h3{margin:0;font-size:14px;font-weight:600}.yxsh h4{margin:0 0 2px;font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666)}
.yxsh-muted{color:var(--dsw-alias-label-tertiary,#888);font-size:12px}.yxsh-error{color:var(--dsw-alias-label-error,#e44848);font-size:12px;white-space:pre-wrap}
.yxsh-head{display:flex;align-items:center;gap:10px;margin-bottom:10px}.yxsh-grow{flex:1;min-width:0}
.yxsh-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.yxsh-btn{appearance:none;cursor:pointer;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:3px 11px;font-size:12px;line-height:1.7;white-space:nowrap}
.yxsh-btn:disabled{opacity:.5;cursor:default}.yxsh-btn.primary{background:var(--dsw-alias-interactive-bg-primary,#0A84FF);color:#fff;border-color:transparent}
.yxsh-link{appearance:none;border:0;background:none;padding:0;cursor:pointer;font-size:12px;color:var(--dsw-alias-label-tertiary,#888);text-decoration:underline;text-underline-offset:2px}
@media (hover:hover){.yxsh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8882)}.yxsh-btn.primary:hover:not(:disabled){filter:brightness(1.08);background:var(--dsw-alias-interactive-bg-primary,#0A84FF)}.yxsh-link:hover{color:var(--dsw-alias-label-primary,inherit)}}
.yxsh-card{border:0.5px solid var(--dsw-alias-border-l2,#8883);border-radius:10px;background:var(--dsw-alias-bg-layer-2,transparent)}
.yxsh-home{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.yxsh-path{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:13px;word-break:break-all}
.yxsh-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 18px;padding-top:12px;border-top:0.5px solid var(--dsw-alias-border-l2,#8883)}
.yxsh-stat span{display:block}.yxsh-stat b{font-weight:600;font-size:13px}
.yxsh-agent{display:grid;grid-template-columns:minmax(130px,1fr) minmax(220px,2.4fr) auto minmax(120px,auto);gap:4px 16px;align-items:center;padding:10px 14px;border-top:0.5px solid var(--dsw-alias-border-l2,#8883)}
.yxsh-agent:first-child{border-top:0}.yxsh-agent b{font-weight:500}
.yxsh-src{min-width:0}.yxsh-src .yxsh-muted{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.yxsh-badge{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font-size:11px;line-height:17px;background:var(--dsw-alias-bg-layer-4,#8881);color:var(--dsw-alias-label-secondary,#666);vertical-align:1px}
.yxsh-chip{display:inline-flex;align-items:center;gap:6px;border-radius:5px;padding:1px 8px;font-size:12px;white-space:nowrap;justify-self:start}
.yxsh-chip i{width:7px;height:7px;border-radius:50%;flex:none;background:currentColor}
.yxsh-chip.ready{background:color-mix(in srgb,#34C759 14%,transparent)}.yxsh-chip.ready i{background:#34C759}
.yxsh-chip.missing{background:color-mix(in srgb,#FF9500 15%,transparent)}.yxsh-chip.missing i{background:#FF9500}
.yxsh-chip.conflict{background:color-mix(in srgb,#FF3B30 14%,transparent);color:var(--dsw-alias-label-error,#e44848)}
.yxsh-chip.nodir{background:var(--dsw-alias-bg-layer-4,#8881);color:var(--dsw-alias-label-tertiary,#888)}.yxsh-chip.nodir i{opacity:.5}
.yxsh-switch{display:inline-flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}.yxsh-switch input{margin:0}
.yxsh-access{margin-top:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.yxsh-item{display:flex;align-items:flex-start;gap:12px}.yxsh-item>div{flex:1;min-width:0}
.yxsh code{font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
.yxsh-notes{margin-top:8px;display:flex;flex-direction:column;gap:2px}
.yxsh-form{margin-top:12px;padding:14px 16px;display:grid;grid-template-columns:150px minmax(0,1fr);gap:10px 14px;align-items:start}
.yxsh-form label{padding-top:5px}.yxsh-form .full{grid-column:1/-1}
.yxsh-input{height:30px;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:0 10px;width:100%;max-width:440px;min-width:0}
.yxsh textarea.yxsh-input{height:60px;padding:6px 10px;resize:vertical;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:12px}
.yxsh-group{padding:4px 0 6px}.yxsh-group+.yxsh-group{border-top:0.5px solid var(--dsw-alias-border-l2,#8883);padding-top:12px}
.yxsh-field{display:grid;grid-template-columns:190px minmax(0,1fr);gap:4px 14px;align-items:start;padding:7px 0}
.yxsh-field label{padding-top:5px}
.yxsh-pre{margin:10px 0 0;padding:12px 14px;max-height:360px;overflow:auto;border-radius:8px;background:var(--dsw-alias-bg-layer-4,#8881);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11.5px;line-height:1.6;white-space:pre-wrap}
.yxsh summary{cursor:pointer;font-size:14px;font-weight:600}
@media (max-width:760px){.yxsh-agent{grid-template-columns:1fr auto}.yxsh-field,.yxsh-form{grid-template-columns:1fr}.yxsh-form label{padding-top:0}}
`;

    function source(initial) {
      let value = initial;
      const listeners = new Set();
      return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { value = { ...value, ...next }; for (const fn of listeners) fn(); } };
    }

    const pad = n => String(n).padStart(2, '0');
    function when(iso) {
      if (!iso) return '尚未整理';
      const [date, time] = [iso.slice(0, 10), iso.slice(11, 16)];
      const d = new Date(), today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const y = new Date(d.getTime() - 86400000), yesterday = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
      return (date === today ? '今天 ' : date === yesterday ? '昨天 ' : date.slice(5) + ' ') + time;
    }
    const num = n => Number(n || 0).toLocaleString('zh-CN');

    const STATE = {
      ready: ['已接入', a => `经 ${a.via} 读到本技能`],
      missing: ['待接入', () => '它的技能目录里还没有 session-history，见下方「技能接入」'],
      conflict: ['冲突', a => `${a.conflict?.path} 已有同名的其他内容`],
      nodir: ['不接入', () => '没有设置技能目录，只收录会话'],
    };

    return {
      inject: ['slots'],
      apply(ctx) {
        let alive = true;
        const state = source({ data: null, loading: true, error: '', pending: '' });
        const useStore = () => React.useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot);

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

        function Home({ data, pending }) {
          const last = data.last, bad = Object.entries(last?.agents || {}).filter(([, r]) => !r.ok).map(([k]) => k);
          const busy = pending === 'refresh' || data.running;
          return h('section', null,
            h('div', { className: 'yxsh-head' }, h('h3', { className: 'yxsh-grow' }, '数据目录'),
              h('button', { className: 'yxsh-btn', onClick: () => run({ op: 'open' }, 'open'), disabled: !!pending }, '打开'),
              h('button', { className: 'yxsh-btn primary', onClick: () => run({ op: 'refresh' }, 'refresh'), disabled: !!pending || data.running }, busy ? '整理中…' : '立即整理')),
            h('div', { className: 'yxsh-card yxsh-home' },
              h('div', null, h('div', { className: 'yxsh-path' }, data.home),
                h('div', { className: 'yxsh-muted' }, '日志、索引与设置都在这里，与插件分开存放，卸载或更新插件不受影响。')),
              h('div', { className: 'yxsh-stats' },
                h('div', { className: 'yxsh-stat' }, h('span', { className: 'yxsh-muted' }, '最近整理'),
                  h('b', null, when(last?.run)), last ? h('span', { className: 'yxsh-muted' }, `用时 ${(Number(last.ms || 0) / 1000).toFixed(1)} 秒`) : null),
                h('div', { className: 'yxsh-stat' }, h('span', { className: 'yxsh-muted' }, '会话'), h('b', null, last?.index ? num(last.index.sessions) : '—'),
                  h('span', { className: 'yxsh-muted' }, last?.index ? `${num(last.index.files)} 份日志` : '整理后生成')),
                h('div', { className: 'yxsh-stat' }, h('span', { className: 'yxsh-muted' }, '状态'),
                  bad.length ? h('b', { className: 'yxsh-error' }, `${bad.join('、')} 出错`) : h('b', null, last ? '正常' : '等待首次整理'),
                  h('span', { className: 'yxsh-muted' }, data.config.refreshMinutes ? `定时：${({ 30: '每 30 分钟', 60: '每小时整点', 120: '每 2 小时', 360: '每 6 小时' })[data.config.refreshMinutes] || `每 ${data.config.refreshMinutes} 分钟`}` : '定时整理已关闭')))));
        }

        function AgentRow({ a, pending }) {
          const [label, hint] = STATE[a.state];
          const run_ = a.run;
          return h('div', { className: 'yxsh-agent' },
            h('div', null, h('b', null, a.name), a.custom ? h('span', { className: 'yxsh-badge' }, '自定义') : null,
              a.experimental && !a.custom ? h('span', { className: 'yxsh-badge', title: '会话格式按其公开代码推断，尚未用真实会话验证' }, '实验性') : null),
            h('div', { className: 'yxsh-src' },
              !a.enabled ? h('div', null, '未收录') : !run_ ? h('div', null, '待整理')
                : run_.ok ? h('div', { title: run_.days < a.logDays ? `其中 ${num(a.logDays - run_.days)} 天的原始会话已不在，日志照常保留` : '' }, `${num(run_.files)} 个会话文件 · 日志 ${num(a.logDays)} 天`) : h('div', { className: 'yxsh-error' }, `整理出错：${run_.error}`),
              h('div', { className: 'yxsh-muted', title: a.sessions }, a.sessions)),
            h('label', { className: 'yxsh-switch yxsh-muted', title: '关闭后不再整理它的新会话，已有日志照常检索' },
              h('input', { type: 'checkbox', checked: a.enabled, disabled: !!pending, onChange: e => run({ op: 'enable', agent: a.id, enabled: e.target.checked }, 'enable') }), '收录'),
            h('div', null, h('span', { className: `yxsh-chip ${a.state}`, title: [hint(a), ...a.dirs.map(d => `读取 ${d.display}`)].join('\n') }, h('i'), label),
              a.custom ? h('div', null, h('button', { className: 'yxsh-link', disabled: !!pending, onClick: () => {
                if (globalThis.confirm?.(`移除「${a.name}」？已整理的日志会保留并照常检索。`) !== false) run({ op: 'removeCustom', id: a.id }, 'remove');
              } }, '移除')) : null));
        }

        function Access({ data, pending }) {
          const { targets, links, conflicts } = data;
          const items = [];
          for (const t of targets) {
            const note = data.agents.find(a => t.agents.includes(a.name) && a.note)?.note;
            const shared = t.agents.length > 1;
            const where = t.create ? ['将新建技能目录 ', h('code', { key: 'p' }, t.display), '，']
              : t.realDisplay ? [shared ? '它们读取的 ' : '它读取的 ', (t.paths || [t.display]).map((p, i) => [i ? '、' : '', h('code', { key: p }, p)]), ' 实际都是 ', h('code', { key: 'r' }, t.realDisplay), '，']
              : ['技能目录 ', h('code', { key: 'p' }, t.display), ' '];
            items.push(h('div', { className: 'yxsh-item', key: 't' + t.key },
              h('div', null,
                h('div', null, h('b', null, t.agents.join('、')), '：待接入'),
                h('div', { className: 'yxsh-muted' }, ...where, '其中还没有 session-history。在这里建一条指向数据目录的软链，',
                  shared ? `这 ${t.agents.length} 家同时生效。` : '即可生效。', note ? ` 注意：${note}。` : '')),
              h('button', { className: 'yxsh-btn primary', disabled: !!pending, onClick: () => run({ op: 'linkTarget', key: t.key }, 'link') }, '建软链')));
          }
          for (const l of links) items.push(h('div', { className: 'yxsh-item', key: 'l' + l.key },
            h('div', null,
              h('div', null, '已接入：', h('code', null, l.entry), ' → 数据目录'),
              h('div', { className: 'yxsh-muted' }, `${l.agents.join('、')} 经此读取本技能`)),
            h('button', { className: 'yxsh-btn', disabled: !!pending, title: `移除后 ${l.agents.join('、')} 都将看不到本技能`,
              onClick: () => { if (globalThis.confirm?.(`移除这条软链？${l.agents.join('、')} 将看不到本技能。数据不受影响。`) !== false) run({ op: 'unlinkTarget', key: l.key }, 'unlink'); } }, '移除')));
          for (const c of conflicts) items.push(h('div', { className: 'yxsh-item', key: 'c' + c.path },
            h('div', { className: 'yxsh-error' }, `${c.agent}：${c.path} 已有同名的${c.state === 'copy' ? '旧版副本' : c.state === 'broken' ? '失效软链' : '其他文件'}，未覆盖。移走后即可接入。`)));
          return h('div', { className: 'yxsh-card yxsh-access' },
            h('div', { className: 'yxsh-row' }, h('h4', { className: 'yxsh-grow' }, '技能接入'),
              targets.length > 1 ? h('button', { className: 'yxsh-btn primary', disabled: !!pending, onClick: () => run({ op: 'linkAll' }, 'link') }, '全部接入') : null),
            items.length ? items : h('div', { className: 'yxsh-muted' }, '检测到的 agent 都已接入本技能。'),
            h('div', { className: 'yxsh-muted' }, '数据目录本身就是技能文件夹，不拷副本：在 agent 读取的技能目录里放一条指向它的软链即可。几家实际读同一个文件夹（比如都软链到你统一管理的技能目录）时，只需一条。'),
            h('div', { className: 'yxsh-muted' }, '是否已接入，是从每个 agent 自己的技能目录出发、顺着软链去读 session-history/SKILL.md 来判断的，与 agent 加载技能走同一条路。'));
        }

        function AddAgent({ data, pending }) {
          const [open, setOpen] = React.useState(false);
          const [form, setForm] = React.useState({ name: '', format: 'claude', sessions: '', skills: '' });
          const [check, setCheck] = React.useState(null);
          const fmt = data.formats.find(f => f.id === form.format) || data.formats[0];
          const set = patch => { setForm({ ...form, ...patch }); if ('sessions' in patch || 'format' in patch) setCheck(null); };
          const probe = async () => {
            try { const r = await api({ op: 'probe', format: form.format, sessions: form.sessions }); setCheck(r.probe); }
            catch (error) { setCheck({ error: error.message }); }
          };
          const add = async () => { if (await run({ op: 'addCustom', ...form }, 'add')) { setOpen(false); setForm({ name: '', format: 'claude', sessions: '', skills: '' }); setCheck(null); } };
          const [found, setFound] = React.useState(null);
          const find = async () => {
            setFound({ busy: true });
            try { const r = await api({ op: 'scan' }); if (alive) state.set({ data: r }); setFound({ list: r.found }); }
            catch (error) { setFound({ error: error.message }); }
          };
          const quick = c => run({ op: 'addCustom', name: c.name, format: c.format, sessions: c.sessions, skills: c.skills || '' }, 'add')
            .then(ok => { if (ok) setFound(f => ({ list: (f?.list || []).filter(x => x.sessions !== c.sessions) })); });
          const results = !found ? null : found.busy ? h('div', { className: 'yxsh-muted' }, '查找中…')
            : found.error ? h('div', { className: 'yxsh-error' }, found.error)
            : !found.list.length ? h('div', { className: 'yxsh-muted' }, '没有找到其他可收录的 agent。内置支持的 agent 装好并产生对话后，会自动出现在上面。')
            : h('div', { className: 'yxsh-card', style: { padding: '4px 14px', marginTop: '8px' } }, ...found.list.map(c => h('div', { className: 'yxsh-item', key: c.sessions, style: { padding: '8px 0' } },
              h('div', null, h('div', null, h('b', null, c.name), h('span', { className: 'yxsh-muted' }, ` · ${data.formats.find(f => f.id === c.format)?.label || c.format} · ${num(c.files)} 个会话文件`)),
                h('div', { className: 'yxsh-muted' }, h('code', null, c.sessions), c.skills ? ['　技能目录 ', h('code', { key: 's' }, c.skills)] : '　未发现技能目录，只收录会话')),
              h('button', { className: 'yxsh-btn', disabled: !!pending, onClick: () => quick(c) }, '添加'))));
          if (!open) return h('div', { style: { marginTop: '10px' } },
            h('div', { className: 'yxsh-row' },
              h('button', { className: 'yxsh-btn', disabled: found?.busy, onClick: find, title: '重新检测内置 agent，并查找格式相同的其他 agent 或同一 agent 的其他配置目录' }, '自动查找'),
              h('button', { className: 'yxsh-btn', onClick: () => setOpen(true) }, '手动添加')),
            results);
          const verdict = !check ? null : check.error ? h('span', { className: 'yxsh-error' }, check.error)
            : !check.exists ? h('span', { className: 'yxsh-error' }, `目录不存在：${check.path}`)
            : check.files && check.turns ? h('span', null, `找到 ${num(check.files)} 个会话文件，格式对得上。如 `, h('code', null, check.sample))
            : check.files ? h('span', { className: 'yxsh-error' }, `找到 ${num(check.files)} 个文件，但按「${fmt.label}」解析不出对话，格式可能选错了。`)
            : h('span', { className: 'yxsh-error' }, `目录存在，但按「${fmt.label}」没找到会话文件。请确认选的是 ${fmt.dir} 这一层、格式选对了。`);
          return h('div', { className: 'yxsh-card yxsh-form' },
            h('div', { className: 'full' }, h('h4', null, '添加其他 agent'),
              h('div', { className: 'yxsh-muted' }, '用于本插件未内置、但会话记录格式与上面某一家相同的 agent，或同一 agent 的另一套配置目录（多开、多账号）。添加后与内置 agent 一样整理、检索，填了技能目录也可接入技能。')),
            h('label', null, '名称'), h('div', null, h('input', { className: 'yxsh-input', value: form.name, maxLength: 24, placeholder: '如 Qoder CLI', onChange: e => set({ name: e.target.value }) }),
              h('div', { className: 'yxsh-muted' }, '日志里助手发言和检索时 --agent 用这个名字。')),
            h('label', null, '会话格式'), h('div', null, h('select', { className: 'yxsh-input', value: form.format, onChange: e => set({ format: e.target.value }) },
              ...data.formats.map(f => h('option', { key: f.id, value: f.id }, f.label))),
              h('div', { className: 'yxsh-muted' }, '它的会话记录与哪一家的格式相同。')),
            h('label', null, '会话目录'), h('div', null, h('input', { className: 'yxsh-input', value: form.sessions, placeholder: `…/${fmt.dir}`, onChange: e => set({ sessions: e.target.value }) }),
              h('div', { className: 'yxsh-muted' }, '填存放会话记录的 ', h('code', null, fmt.dir), ' 这一层，里面是 ', h('code', null, fmt.layout), '。例：', fmt.example, '。'),
              verdict ? h('div', { style: { marginTop: '4px', fontSize: '12px' } }, verdict) : null),
            h('label', null, '技能目录（可选）'), h('div', null, h('input', { className: 'yxsh-input', value: form.skills, placeholder: '如 ~/.qoder-cn/skills', onChange: e => set({ skills: e.target.value }) }),
              h('div', { className: 'yxsh-muted' }, '这个 agent 读取技能的文件夹。填了才会出现在「技能接入」里；留空则只收录它的会话。')),
            h('div', { className: 'full yxsh-row' },
              h('button', { className: 'yxsh-btn', disabled: !form.sessions.trim(), onClick: probe }, '检查目录'),
              h('button', { className: 'yxsh-btn primary', disabled: !!pending || !form.name.trim() || !form.sessions.trim(), onClick: add }, pending === 'add' ? '添加中…' : '添加'),
              h('button', { className: 'yxsh-link', onClick: () => { setOpen(false); setCheck(null); } }, '取消')));
        }

        function Agents({ data, pending }) {
          const live = data.agents, ready = live.filter(a => a.state === 'ready').length, linkable = live.filter(a => a.state !== 'nodir').length;
          return h('section', null,
            h('div', { className: 'yxsh-head' }, h('h3', { className: 'yxsh-grow' }, 'Agents'),
              linkable ? h('span', { className: 'yxsh-muted' }, `已接入 ${ready}/${linkable}`) : null),
            live.length ? h('div', { className: 'yxsh-card' }, ...live.map(a => h(AgentRow, { a, pending, key: a.id })))
              : h('div', { className: 'yxsh-card', style: { padding: '14px' } }, h('span', { className: 'yxsh-muted' }, '还没有检测到支持的 agent。装好后产生过对话就会出现在这里；也可以在下面手动添加。')),
            live.length ? h(Access, { data, pending }) : null,
            h('div', { className: 'yxsh-notes' },
              data.legacy.length ? h('div', { className: 'yxsh-muted' }, `另有旧日志：${data.legacy.join('、')}（对应的 agent 已不在，日志照常检索）`) : null),
            h(AddAgent, { data, pending }));
        }

        function Settings({ data, pending }) {
          const c = data.config;
          const initial = { userLabel: c.userLabel, timezone: c.timezone, dayStartHour: c.dayStartHour, refreshMinutes: c.refreshMinutes,
            staleMinutes: c.staleMinutes, memoryHints: c.memoryHints, gitSnapshots: c.gitSnapshots, excludeCwds: (c.excludeCwds || []).join('\n') };
          const [draft, setDraft] = React.useState(null);
          const d = draft || initial;
          const set = patch => setDraft({ ...d, ...patch });
          const field = (label, control, hint) => h('div', { className: 'yxsh-field' }, h('label', null, label),
            h('div', null, control, hint ? h('div', { className: 'yxsh-muted' }, hint) : null));
          const select = (value, options, onChange) => h('select', { className: 'yxsh-input', value, onChange: e => onChange(Number(e.target.value)) },
            ...options.map(([v, text]) => h('option', { key: v, value: v }, text)));
          const check = (value, text, onChange) => h('label', { className: 'yxsh-switch' }, h('input', { type: 'checkbox', checked: value, onChange: e => onChange(e.target.checked) }), text);
          const save = async () => {
            if (await run({ op: 'config', patch: { ...d, excludeCwds: d.excludeCwds.split('\n').map(x => x.trim()).filter(Boolean) } }, 'config')) setDraft(null);
          };
          return h('section', null,
            h('div', { className: 'yxsh-head' }, h('h3', { className: 'yxsh-grow' }, '设置'),
              draft ? h('button', { className: 'yxsh-btn', disabled: !!pending, onClick: () => setDraft(null) }, '还原') : null,
              h('button', { className: 'yxsh-btn primary', disabled: !draft || !!pending, onClick: save }, pending === 'config' ? '保存中…' : '保存')),
            h('div', { className: 'yxsh-card', style: { padding: '6px 16px' } },
              h('div', { className: 'yxsh-group' }, h('h4', null, '整理'),
                field('定时整理', select(d.refreshMinutes, [[0, '关闭'], [30, '每 30 分钟'], [60, '每小时整点'], [120, '每 2 小时'], [360, '每 6 小时']], v => set({ refreshMinutes: v })),
                  'DSH 开着时在后台整理，只重读有变化的会话文件，通常一两秒。'),
                field('检索前补整理', select(d.staleMinutes, [[0, '关闭'], [10, '距上次超过 10 分钟'], [30, '距上次超过 30 分钟'], [60, '距上次超过 1 小时']], v => set({ staleMinutes: v })),
                  'DSH 没开时也能查到较新的对话：任何 agent 检索前，若距上次整理超过所选时长，先补一次。')),
              h('div', { className: 'yxsh-group' }, h('h4', null, '日志'),
                field('你的发言标题', h('input', { className: 'yxsh-input', value: d.userLabel, maxLength: 12, onChange: e => set({ userLabel: e.target.value }) }),
                  `日志里你的发言显示为「🧑 ${d.userLabel || '用户'}」。只影响此后整理出的内容，检索新旧写法都认。`),
                field('日界', select(d.dayStartHour, Array.from({ length: 24 }, (_, i) => [i, `${i}:00`]), v => set({ dayStartHour: v })),
                  '此时刻之前的对话归入前一天的日志，熬夜的对话不会被拆到两天。'),
                field('时区', h('input', { className: 'yxsh-input', value: d.timezone, placeholder: '跟随系统', onChange: e => set({ timezone: e.target.value }) }),
                  '一般留空。可填 +08:00 或 Asia/Shanghai。'),
                field('不收录的工作目录', h('textarea', { className: 'yxsh-input', value: d.excludeCwds, placeholder: '每行一个，如 ~/scratch', onChange: e => set({ excludeCwds: e.target.value }) }),
                  '在这些目录里进行的会话不整理。临时目录本就不收。')),
              h('div', { className: 'yxsh-group' }, h('h4', null, '检索'),
                field('Claude Code 记忆', check(d.memoryHints, '检索时附上对题的记忆', v => set({ memoryHints: v })),
                  '列出至多 2 条相关记忆的文件名与描述，供 agent 先读这些整理过的结论。')),
              h('div', { className: 'yxsh-group' }, h('h4', null, '备份'),
                field('Git 快照', check(d.gitSnapshots, '每次整理后提交一次日志', v => set({ gitSnapshots: v })),
                  data.git ? '数据目录已是 Git 仓库，只提交 logs/。' : '开启时会在数据目录初始化 Git 仓库（只收 logs/）；需要装有 Git。'))));
        }

        function Panel({ view }) {
          const s = useStore();
          const busy = !!(s.data?.running || s.pending === 'refresh');
          // 打开期间定时重读：后台定时整理、别的 agent 检索前补整理都会改状态；整理进行中读得更勤。
          React.useEffect(() => {
            load();
            const timer = setInterval(() => { if (!state.getSnapshot().pending) load(); }, busy ? 3000 : 15000);
            return () => clearInterval(timer);
          }, [busy]);
          if (view && view !== 'page') return null;
          if (s.loading && !s.data) return h('div', { className: 'yxsh yxsh-muted' }, h('style', null, css), '读取中…');
          if (!s.data) return h('div', { className: 'yxsh' }, h('style', null, css), h('p', { className: 'yxsh-error' }, s.error || '读取失败'),
            h('button', { className: 'yxsh-btn', onClick: load }, '重试'));
          const data = s.data;
          return h('div', { className: 'yxsh' }, h('style', null, css),
            s.error ? h('div', { className: 'yxsh-error', role: 'alert' }, s.error) : null,
            h(Home, { data, pending: s.pending }),
            h(Agents, { data, pending: s.pending }),
            h(Settings, { data, pending: s.pending, key: JSON.stringify(data.config) }),
            h('section', null, h('details', null, h('summary', null, 'SKILL.md'),
              h('div', { className: 'yxsh-muted', style: { marginTop: '6px' } }, '按检测到的 agent 自动生成，各 agent 读的就是这一份。'),
              h('pre', { className: 'yxsh-pre' }, data.skill))));
        }

        ctx.effect(() => () => { alive = false; });
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', key: PACKAGE }, Panel));
      },
    };
  },
});
