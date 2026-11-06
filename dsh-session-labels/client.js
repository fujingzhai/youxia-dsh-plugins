window.__ModuleLoader__.load({
  id: 'dsh-session-labels',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    const NS = 'youxia-session-labels';
    const COLORS = ['#FF3B30', '#FF9500', '#C8960A', '#34C759', '#32ADE6', '#007AFF', '#AF52DE', '#FF2D55', '#A2845E', '#6E6E73'];
    const COLOR_NAMES = ['红色', '橙色', '黄色', '绿色', '青色', '蓝色', '紫色', '粉色', '棕色', '灰色'];
    const tone = color => String(color).toUpperCase() === '#8E8E93' ? '#6E6E73' : color;
    const EMPTY = { revision: -1, tags: [], assignments: {}, appearance: 'tint' };
    const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    const idsFor = (state, id) => own(state.assignments, id) ? state.assignments[id] : [];
    function matches(state, id, filter) {
      const ids = idsFor(state, id);
      if (filter.untagged) return !ids.length;
      if (!filter.ids.length) return true;
      return filter.mode === 'all' ? filter.ids.every(tag => ids.includes(tag)) : filter.ids.some(tag => ids.includes(tag));
    }
    function filterSnapshot(snapshot, state, filter) {
      if (!filter.untagged && !filter.ids.length) return snapshot;
      if (!Array.isArray(snapshot?.ids) || !snapshot.byId) return snapshot;
      const ids = snapshot.ids.filter(id => snapshot.byId[id]?.blank || matches(state, id, filter));
      return { ...snapshot, ids, byId: Object.fromEntries(ids.map(id => [id, snapshot.byId[id]])) };
    }
    const filterActive = f => f.untagged || f.ids.length > 0;
    function protectOrder(actions, f) {
      return !filterActive(f) ? actions : { ...actions, syncSessionOrders() {}, setSessionOrder() {} };
    }
    function sessionRows(assignments, tagId, sessions, archivedIds) {
      const archived = new Set(archivedIds);
      return Object.keys(assignments).filter(id => assignments[id].includes(tagId)).map(id => {
        const session = sessions.find(item => item.sessionId === id);
        const gone = !session || session.exists === false;
        return {
          id,
          title: session?.title || (gone ? '已删除的会话' : '未命名会话'),
          updatedAt: session?.updatedAt || 0,
          workspace: session?.workspace || '',
          state: gone ? 'deleted' : archived.has(id) ? 'archived' : 'active',
        };
      }).sort((a, b) => Number(a.state !== 'active') - Number(b.state !== 'active') || b.updatedAt - a.updatedAt || a.title.localeCompare(b.title, 'zh'));
    }
    function filterSearch(result, state, f) {
      return !filterActive(f) ? result : { ...result, items: result.items.filter(item => matches(state, item.sessionId, f)) };
    }
    function TagIcon({ size = 16, color = 'currentColor', filled = false }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: filled ? color : 'none', stroke: color,
        strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
      h('path', { d: 'M3 3h8l10 10-8 8L3 11Z' }),
      h('circle', { cx: 7.5, cy: 7.5, r: 1.2, fill: filled ? 'var(--dsw-specific-menu,#fff)' : color, stroke: 'none' }));
    }
    function source(initial) {
      let value = initial;
      const listeners = new Set();
      return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        set(next) { value = next; for (const fn of listeners) fn(); } };
    }
    const css = `
.yxsl{font:inherit;color:var(--dsw-alias-label-primary,inherit);box-sizing:border-box}.yxsl *{box-sizing:border-box}
.yxsl button,.yxsl input,.yxsl select{font:inherit;color:inherit}.yxsl button{cursor:pointer}.yxsl button:disabled{cursor:default;opacity:.5}
.yxsl button:focus-visible,.yxsl input:focus-visible,.yxsl select:focus-visible{outline:2px solid #0A84FF;outline-offset:2px}
.yxsl-row{display:flex;align-items:center;gap:10px;min-width:0}.yxsl-stack{display:flex;flex-direction:column;gap:14px}.yxsl-grow{flex:1;min-width:0}
.yxsl-muted{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary,#888);line-height:1.5}.yxsl-btn{appearance:none;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:5px 12px;font:inherit;font-size:13px;line-height:1.5}.yxsl button.yxsl-create{height:auto;padding:3px 7px;border:0;background:transparent;color:var(--dsw-alias-label-primary,inherit);font-size:13px;line-height:1.5;border-radius:5px;box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3,#8885);display:inline-flex;align-items:center;gap:5px}@media (hover:hover){.yxsl button.yxsl-create:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#8882)}}.yxsl-open{border:0;background:none;padding:0;font:inherit;font-weight:500;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yxsl-open:hover{text-decoration:underline}
.yxsl-input{height:34px;border:0.5px solid var(--dsw-alias-border-l4,#8884);background:var(--dsw-alias-bg-layer-3,transparent);border-radius:var(--dsw-radius-md,8px);padding:0 12px;min-width:0;font:inherit;font-size:13px;line-height:1.5}.yxsl-input[type=color]{width:42px;padding:3px}
.yxsl-palette{display:flex;flex-wrap:wrap;gap:8px}.yxsl-swatch{width:28px;height:28px;border-radius:50%;border:3px solid transparent;background:var(--tag);box-shadow:inset 0 0 0 1px #0001;position:relative}.yxsl-swatch[aria-pressed=true]{outline:2px solid var(--tag);outline-offset:2px}.yxsl-swatch[aria-pressed=true]:after{content:'✓';color:#fff;text-shadow:0 1px 3px #0008;font-size:15px;font-weight:600}.yxsl-colorpick{display:inline-flex;padding:0;cursor:pointer}.yxsl-colorpick input{position:absolute;inset:0;width:100%;height:100%;opacity:0;padding:0;border:0;cursor:pointer}
.yxsl-chip{border:0;border-radius:5px;padding:3px 7px;display:inline-flex;align-items:center;gap:5px;background:color-mix(in srgb,var(--tag) 12%,transparent);color:var(--dsw-alias-label-primary,inherit);max-width:100%;overflow:hidden}.yxsl-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yxsl-hover{display:flex;flex-wrap:wrap;gap:6px}.yxsl-hover .yxsl-chip{padding:1px 6px;gap:4px;font-size:12px;line-height:16px}
.yxsl-settings{max-width:760px;font-size:13px;line-height:1.5}.yxsl-lead{display:flex;flex-direction:column;gap:4px;margin:0 0 4px}.yxsl-actions{display:flex;padding-top:12px}.yxsl-card{padding:4px 0 0}.yxsl-field{display:flex;flex-direction:column;gap:6px;padding:12px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2,#8883)}.yxsl-fieldhead{display:flex;align-items:center;gap:8px}.yxsl-label{flex:1;min-width:0;font-size:13px;font-weight:500;line-height:1.5}.yxsl-tagrow{display:flex;align-items:center;gap:8px;padding:10px 0;border-bottom:0.5px solid var(--dsw-alias-border-l2,#8882)}.yxsl-tagrow:last-child{border-bottom:0}.yxsl-order{display:inline-flex}.yxsl-order button{width:24px;height:24px;padding:0}.yxsl button.yxsl-count,.yxsl span.yxsl-count{border:0;background:none;padding:0;font-size:12px;line-height:1.5;font-weight:400;color:var(--dsw-alias-label-tertiary,#888);opacity:1;text-align:left}.yxsl button.yxsl-unlink{width:22px;height:22px;padding:0;display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:none;color:var(--dsw-alias-label-tertiary,#888)}.yxsl-sessions{display:flex;flex-direction:column;padding:2px 0 8px}.yxsl-session{display:flex;align-items:center;gap:8px;min-width:0;padding:6px 0}.yxsl-session b{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.yxsl-mark{flex:none;border-radius:4px;padding:0 5px;font-size:11px;line-height:18px;color:var(--dsw-alias-label-secondary,#666);background:var(--dsw-alias-bg-layer-4,#8881)}
.yxsl-backdrop{position:fixed;inset:0;z-index:2200;background:#0004;display:grid;place-items:center;padding:20px}.yxsl-dialog{background:var(--dsw-specific-menu,#fff);color:var(--dsw-alias-label-primary,#222);border:1px solid var(--dsw-alias-border-l1,#8884);border-radius:16px;padding:22px;width:min(440px,100%);max-height:85vh;overflow:auto;box-shadow:0 20px 80px #0004;font-size:13px;line-height:1.5}.yxsl-dialog h2{font-size:15px;font-weight:600;margin:0}.yxsl-error{color:var(--dsw-alias-label-error,#e44848);font-size:12px;line-height:1.5;white-space:pre-wrap}.yxsl-danger{color:var(--dsw-alias-label-error,#e44848)!important}
.yxsl-filter{padding:0;font-size:13px;line-height:20px;font-weight:400;color:var(--dsw-alias-label-primary)}.yxsl-filter:before{content:'';display:block;height:.5px;margin:3px 8px;background:var(--dsw-alias-border-l2,#8883)}.yxsl-filterlabel,.yxsl-filterhint{padding:3px 8px;font-size:11px;line-height:15px;font-weight:400;color:var(--dsw-alias-label-tertiary,#888)}.yxsl-filterhint{margin:0}.yxsl-filterlist{max-height:210px;overflow:auto;display:flex;flex-direction:column}.yxsl-filteritem{border:0;background:transparent;text-align:left;display:flex;align-items:center;gap:6px;width:100%;min-height:30px;padding:4px 8px;border-radius:var(--dsw-radius-md,8px);font-size:13px;line-height:20px;font-weight:400}.yxsl-filteritem:hover,.yxsl-filteritem:focus-visible{background:var(--dsw-alias-interactive-bg-hover,#8882);outline:none}.yxsl-filtericon,.yxsl-filtercheck{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center}.yxsl-filtercheck{margin-inline-start:auto}.yxsl-filter select{height:30px;font-size:13px;line-height:20px}
.yxsl-marks{display:inline-flex;gap:3px;align-items:center;flex:none}.yxsl-title-color{color:var(--yxsl-color)!important}
.yxsl-empty{padding:18px 0;text-align:center;color:var(--dsw-alias-label-tertiary,#888)}
`;
    return {
      // Exposed pure helpers permit regression tests without a browser or private APIs.
      matches, filterSnapshot, protectOrder, filterSearch, sessionRows,
      inject: ['slots', 'contextMenus', 'uiWorkspace'],
      apply(ctx) {
        let alive = true, reading, requestSerial = 0, timer;
        const data = source(EMPTY), sessions = source({ ready: false, items: [], archived: [] });
        const ui = source({ loading: true, error: '', pending: false, modal: null, menuHost: null, adapter: false, expanded: [] });
        const filter = source({ ids: [], mode: 'any', untagged: false });
        const updateUI = patch => {
          const previous = ui.getSnapshot();
          if (Object.keys(patch).some(key => previous[key] !== patch[key])) ui.set({ ...previous, ...patch });
        };
        const useSource = s => React.useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
        function setData(next) {
          if (!alive || next.revision <= data.getSnapshot().revision) return;
          data.set(next);
          const f = filter.getSnapshot(), ids = f.ids.filter(id => next.tags.some(tag => tag.id === id));
          if (ids.length !== f.ids.length) setFilter({ ...f, ids });
        }
        function setFilter(next) {
          filter.set(next);
          try { sessionStorage.setItem(NS + ':filter', JSON.stringify(next)); } catch { /* private browsing */ }
        }
        try {
          const saved = JSON.parse(sessionStorage.getItem(NS + ':filter') || 'null');
          if (Array.isArray(saved?.ids) && saved.ids.every(id => typeof id === 'string') && ['any', 'all'].includes(saved.mode)) filter.set({ ids: saved.ids, mode: saved.mode, untagged: saved.untagged === true });
        } catch { /* nonessential window-local preference */ }
        async function api(command) {
          const response = await fetch('./youxia-session-labels/api', { credentials: 'same-origin', cache: 'no-store',
            ...(command ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) } : {}) });
          const value = await response.json();
          if (!response.ok) throw new Error(value.error || `HTTP ${response.status}`);
          return value;
        }
        async function refresh() {
          if (reading) return reading;
          const serial = ++requestSerial;
          reading = api().then(value => { if (alive && serial === requestSerial) { setData(value); if (value.sessions) sessions.set(value.sessions); updateUI({ loading: false, error: '' }); } })
            .catch(error => { if (alive) updateUI({ loading: false, error: error.message }); })
            .finally(() => { reading = undefined; });
          return reading;
        }
        async function mutate(command) {
          if (ui.getSnapshot().pending) return false;
          updateUI({ pending: true, error: '' });
          ++requestSerial;
          try { const value = await api(command); if (alive) { setData(value); if (value.sessions) sessions.set(value.sessions); } return true; }
          catch (error) { if (alive) { updateUI({ error: error.message }); ctx.contextMenus.notify(`会话标签：${error.message}`, false); } return false; }
          finally { if (alive) updateUI({ pending: false, loading: false }); }
        }
        function openModal(modal) { ctx.contextMenus.close(); updateUI({ modal, error: '' }); }
        function closeModal() { if (!ui.getSnapshot().pending) updateUI({ modal: null }); }
        function Palette({ value, onChange }) {
          return h('div', { className: 'yxsl-palette', 'aria-label': '标签颜色' }, ...COLORS.map((color, index) =>
            h('button', { key: color, type: 'button', className: 'yxsl-swatch', style: { '--tag': color },
              title: COLOR_NAMES[index], 'aria-label': COLOR_NAMES[index], 'aria-pressed': value === color, onClick: () => onChange(color) })));
        }
        function Editor({ tag, sessionId, onDone }) {
          const [name, setName] = React.useState(tag?.name || '');
          const [color, setColor] = React.useState(tag?.color || COLORS[0]);
          const status = useSource(ui);
          return h('form', { className: 'yxsl-stack', onSubmit: async event => {
            event.preventDefault();
            if (await mutate(tag ? { op: 'update', id: tag.id, name, color, expected: { name: tag.name, color: tag.color } }
              : { op: 'create', name, color, ...(sessionId ? { sessionId } : {}) })) onDone?.();
          } }, h('label', { className: 'yxsl-stack', style: { gap: 6 } }, '标签名称',
            h('input', { className: 'yxsl-input', value: name, maxLength: 64, required: true, autoFocus: true,
              placeholder: '例如：论文、待整理、重要', onChange: event => setName(event.target.value) })),
          h(Palette, { value: color, onChange: setColor }),
          h('div', { className: 'yxsl-row' }, h('span', {}, '自定颜色'), h('label', { className: 'yxsl-swatch yxsl-colorpick', style: { '--tag': color }, title: '自定颜色' }, h('input', { type: 'color', value: color, 'aria-label': '自定颜色', onChange: event => setColor(event.target.value.toUpperCase()) })),
            h('span', { className: 'yxsl-chip', style: { '--tag': color } }, h(TagIcon, { color, size: 14, filled: true }), h('span', {}, name || '标签预览'))),
          status.error && h('p', { role: 'alert', className: 'yxsl-error' }, status.error),
          h('div', { className: 'yxsl-row', style: { justifyContent: 'flex-end' } },
            h('button', { type: 'button', className: 'yxsl-btn', disabled: status.pending, onClick: onDone }, '取消'),
            h('button', { type: 'submit', className: 'yxsl-btn', disabled: status.pending || !name.trim() }, status.pending ? '保存中…' : sessionId && !tag ? '创建并打标' : '保存')));
        }
        function FilterPanel() {
          const state = useSource(data), f = useSource(filter), status = useSource(ui);
          const role = 'menuitemcheckbox';
          function item(label, checked, action, tag) {
            return h('button', { key: tag?.id || label, type: 'button', role, 'aria-checked': checked,
              className: 'yxsl-filteritem', disabled: !status.adapter, onClick: event => {
                event.stopPropagation();
                action();
                // The menu list is portaled, so its own outside-pointer handler is the native close.
                document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse' }));
              } },
            h('span', { className: 'yxsl-filtericon' }, tag ? h(TagIcon, { size: 14, color: tone(tag.color), filled: true }) : null),
            h('span', { className: 'yxsl-grow' }, label),
            h('span', { className: 'yxsl-filtercheck' }, checked ? '✓' : ''));
          }
          return h('div', { className: 'yxsl yxsl-filter', onKeyDown: event => { if (event.key !== 'Escape') event.stopPropagation(); } },
            h('div', { className: 'yxsl-filterlabel' }, '按标签筛选'),
            !status.adapter && h('p', { className: 'yxsl-error' }, '当前侧栏版本无法安全筛选；未隐藏任何会话。'),
            h('div', { className: 'yxsl-filterlist' },
              item('全部标签', !f.ids.length && !f.untagged, () => setFilter({ ids: [], mode: f.mode, untagged: false })),
              item('未打标签', f.untagged, () => setFilter({ ids: [], mode: f.mode, untagged: !f.untagged })),
              ...state.tags.map(tag => item(tag.name, f.ids.includes(tag.id), () => setFilter({ ...f, untagged: false,
                ids: f.ids.includes(tag.id) ? f.ids.filter(id => id !== tag.id) : [...f.ids, tag.id] }), tag))),
            f.ids.length > 1 && h('label', { className: 'yxsl-row yxsl-muted', style: { marginTop: 8 } }, '多标签匹配',
              h('select', { value: f.mode, onChange: event => setFilter({ ...f, mode: event.target.value }) },
                h('option', { value: 'any' }, '任意一个'), h('option', { value: 'all' }, '同时包含'))),
            !state.tags.length && h('p', { className: 'yxsl-filterhint' }, '尚无标签。右键会话，在标签中新建。'));
        }
        function openSession(sessionId, close) {
          const workspace = ctx.uiWorkspace || ctx.get?.('uiWorkspace');
          const open = workspace && workspace.openSession;
          if (typeof open !== 'function') { ctx.contextMenus.notify('当前版本不能从设置跳转到会话', false); return; }
          try {
            Promise.resolve(open.call(workspace, sessionId)).then(() => { if (typeof close === 'function') close(); }, error => {
              ctx.contextMenus.notify(`无法打开会话：${error && error.message || error}`, false);
            });
          } catch (error) { ctx.contextMenus.notify(`无法打开会话：${error.message || error}`, false); }
        }
        function Settings({ close }) {
          const state = useSource(data), status = useSource(ui);
          React.useEffect(() => () => updateUI({ expanded: [] }), []);
          const appearance = state.appearance === 'marks' ? 'marks' : 'tint';
          const catalog = useSource(sessions);
          const when = value => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(value) : '';
          return h('section', { className: 'yxsl yxsl-settings' },
            h('div', { className: 'yxsl-lead' },
              h('p', { className: 'yxsl-muted' }, '用标签整理会话。右键会话 → 标签即可打标；同一会话可拥有多个标签。'),
              h('p', { className: 'yxsl-muted' }, '删除标签只移除标签及其关联，不删除会话。数据保存在本机 Host，卸载后保留；不会发送到第三方。')),
            status.error && h('div', { className: 'yxsl-error', role: 'alert' }, status.error, ' ', h('button', { className: 'yxsl-btn', onClick: refresh }, '重试')),
            h('div', { className: 'yxsl-field' },
              h('label', { className: 'yxsl-fieldhead' }, h('span', { className: 'yxsl-label' }, '会话显示方式'),
                h('select', { className: 'yxsl-input', value: appearance, disabled: status.pending || status.loading,
                  onChange: event => mutate({ op: 'appearance', value: event.target.value }) },
                h('option', { value: 'tint' }, '字体色彩'),
                h('option', { value: 'marks' }, '标签符号'))),
              h('p', { className: 'yxsl-muted' }, appearance === 'marks'
                ? '只显示标签符号，不改变标题颜色。'
                : '标题使用第一个标签的颜色。还有其他标签时，用标签符号显示。')),
            h('div', { className: 'yxsl-card' }, status.loading ? '读取中…' : !state.tags.length ? h('div', { className: 'yxsl-empty' }, '还没有标签，先创建一个吧。') :
              state.tags.map((tag, index) => {
                const rows = sessionRows(state.assignments, tag.id, catalog.items, catalog.archived);
                const deleted = rows.filter(row => row.state === 'deleted').length;
                const archived = rows.filter(row => row.state === 'archived').length;
                const open = status.expanded.includes(tag.id);
                const count = `${rows.length} 个会话关联${deleted || archived ? `（${[deleted && `${deleted} 个已删除`, archived && `${archived} 个已归档`].filter(Boolean).join('，')}）` : ''}`;
                return h('div', { key: tag.id },
                  h('div', { className: 'yxsl-tagrow' },
                    h('span', { className: 'yxsl-chip', style: { '--tag': tone(tag.color) } }, h(TagIcon, { color: tone(tag.color), filled: true }), h('span', {}, tag.name)),
                    rows.length ? h('button', { className: 'yxsl-count yxsl-grow', 'aria-expanded': open, onClick: () => updateUI({ expanded: open ? status.expanded.filter(id => id !== tag.id) : [...status.expanded, tag.id] }) }, count) : h('span', { className: 'yxsl-count yxsl-grow' }, count),
                    h('button', { className: 'yxsl-btn', onClick: () => openModal({ kind: 'edit', tag }) }, '编辑'),
                    h('button', { className: 'yxsl-btn yxsl-danger', onClick: () => openModal({ kind: 'remove', tag }) }, '删除'),
                    h('span', { className: 'yxsl-order' },
                      h('button', { className: 'yxsl-btn', 'aria-label': `上移${tag.name}`, disabled: !index || status.pending, onClick: () => mutate({ op: 'move', id: tag.id, direction: 'up' }) }, '↑'),
                      h('button', { className: 'yxsl-btn', 'aria-label': `下移${tag.name}`, disabled: index === state.tags.length - 1 || status.pending, onClick: () => mutate({ op: 'move', id: tag.id, direction: 'down' }) }, '↓'))),
                  open && h('div', { className: 'yxsl-sessions' }, rows.map(row => h('div', { key: row.id, className: 'yxsl-session' },
                    row.state === 'deleted' ? h('b', { className: 'yxsl-grow' }, row.title)
                      : h('button', { type: 'button', className: 'yxsl-open yxsl-grow', title: '打开会话', onClick: () => openSession(row.id, close) }, row.title),
                    row.state !== 'active' && h('span', { className: 'yxsl-mark' }, row.state === 'deleted' ? '已删除' : '已归档'),
                    h('span', { className: 'yxsl-muted' }, [when(row.updatedAt), row.workspace].filter(Boolean).join(' · ')),
                    h('button', { className: 'yxsl-btn yxsl-unlink', title: '取消关联', 'aria-label': '取消关联', disabled: status.pending, onClick: () => mutate({ op: 'assign', sessionId: row.id, id: tag.id, enabled: false }) },
                      h('svg', { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true },
                        h('path', { d: 'M6 6l12 12M18 6L6 18' })))))));
              })),
            h('div', { className: 'yxsl-actions' },
              h('button', { className: 'yxsl-btn yxsl-create', onClick: () => openModal({ kind: 'create' }) },
                h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', 'aria-hidden': true }, h('path', { d: 'M12 5v14M5 12h14' })),
                '新建标签')));
        }
        function Marks({ sessionId }) {
          const state = useSource(data);
          const ids = new Set(idsFor(state, sessionId));
          const tags = state.tags.filter(tag => ids.has(tag.id));
          const shown = state.appearance === 'marks' ? tags : tags.slice(1);
          if (!shown.length) return null;
          const label = shown.map(tag => tag.name).join('、');
          return h('span', { className: 'yxsl-marks', title: label, 'aria-label': `标签：${label}` },
            ...shown.map(tag => h(TagIcon, { key: tag.id, size: 12, color: tone(tag.color), filled: true })));
        }
        function Hover({ sessionId }) {
          const state = useSource(data);
          return h('div', { className: 'yxsl yxsl-hover' }, ...idsFor(state, sessionId).map(id => {
            const tag = state.tags.find(tag => tag.id === id);
            return tag && h('span', { key: id, className: 'yxsl-chip', style: { '--tag': tone(tag.color) } }, h(TagIcon, { size: 12, color: tone(tag.color) }), tag.name);
          }));
        }
        function Modal({ modal }) {
          const ref = React.useRef(null), status = useSource(ui);
          React.useEffect(() => {
            const previous = document.activeElement;
            const el = ref.current;
            el.querySelector('input,button,select')?.focus();
            const key = event => {
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeModal(); }
              if (event.key !== 'Tab') return;
              const controls = [...el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
              const first = controls[0], last = controls.at(-1);
              if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
              else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
            };
            document.addEventListener('keydown', key, true);
            return () => { document.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
          }, []);
          const title = { create: '新建标签', edit: '编辑标签', remove: '删除标签' }[modal.kind];
          return h('div', { className: 'yxsl yxsl-backdrop', onPointerDown: event => { if (event.target === event.currentTarget) closeModal(); } },
            h('div', { ref, role: 'dialog', 'aria-modal': true, 'aria-label': title, className: 'yxsl-dialog yxsl-stack' },
              h('div', { className: 'yxsl-row' }, h(TagIcon, { size: 20 }), h('h2', { className: 'yxsl-grow' }, title),
                h('button', { className: 'yxsl-btn', 'aria-label': '关闭标签对话框', onClick: closeModal, disabled: status.pending }, '×')),
              ['create', 'edit'].includes(modal.kind) && h(Editor, { tag: modal.tag, sessionId: modal.sessionId, onDone: closeModal }),
              modal.kind === 'remove' && h(React.Fragment, {}, h('p', {}, `删除「${modal.tag.name}」及其所有会话关联？会话本身不会删除。`),
                status.error && h('p', { role: 'alert', className: 'yxsl-error' }, status.error),
                h('button', { className: 'yxsl-btn yxsl-danger', disabled: status.pending, onClick: async () => {
                  if (await mutate({ op: 'remove', id: modal.tag.id })) closeModal();
                } }, '确认删除标签'))));
        }
        function Overlay() {
          const status = useSource(ui);
          return h(React.Fragment, {}, status.modal && createPortal(h(Modal, { key: status.modal.kind + (status.modal.tag?.id || ''), modal: status.modal }), document.body),
            status.menuHost?.isConnected && createPortal(h(FilterPanel), status.menuHost));
        }
        function put(name, component, extra = {}) {
          ctx.slots.inject(name, () => ctx.slots.register({ name, id: NS, order: 10000, ...extra }, component));
        }
        put('settings.section', Settings, { label: '会话标签' });
        put('settings.section.icon', TagIcon);
        put('sidebar.session.row.trailing', Marks);
        put('sidebar.session.row.hover', Hover);
        put('shell.overlay', Overlay);
        ctx.effect(() => ctx.contextMenus.register({
          id: NS, target: 'session', order: 10000, observe: () => [data, ui],
          resolve: ({ sessionId }) => {
            const state = data.getSnapshot(), status = ui.getSnapshot();
            const tags = idsFor(state, sessionId);
            return [{ id: 'tags', label: '标签', icon: { key: NS }, separatorBefore: true, afterContent: true,
              children: [
                ...state.tags.map(tag => ({ id: tag.id, label: `${tags.includes(tag.id) ? '✓  ' : ''}${tag.name}`,
                  icon: { key: `${NS}.color`, src: tone(tag.color) }, disabled: status.pending,
                  run: async () => { await mutate({ op: 'assign', sessionId, id: tag.id, enabled: !tags.includes(tag.id) }); } })),
                { id: 'create', label: '＋ 新建标签…', separatorBefore: !!state.tags.length, disabled: status.loading || status.pending,
                  run: () => openModal({ kind: 'create', sessionId }) },
                ...(tags.length ? [{ id: 'clear', label: '清除此会话标签', disabled: status.pending, run: async () => { await mutate({ op: 'clear', sessionId }); } }] : [])
              ] }];
          }
        }));
        put('contextMenu.icon', TagIcon, { key: NS });
        put('contextMenu.icon', ({ icon }) => h(TagIcon, { filled: true, color: /^#[\dA-F]{6}$/i.test(icon.src || '') ? icon.src : 'currentColor' }), { key: `${NS}.color` });

        // Narrow compatibility seam: decorate the existing workspace component and its
        // useSessions input BEFORE grouping/watermarks; never mutate the Host list.
        // Only this entry is touched, and unloading restores its previous component.
        ctx.slots.inject('sidebar.workspaces', () => {
          const saved = new Map();
          let busy = false;
          function bump() {
            const dispose = ctx.slots.register({ name: 'sidebar.workspaces', priority: 987654 }, () => null);
            dispose();
          }
          function adapt() {
            if (busy || !alive) return;
            busy = true;
            try {
              let changed = false;
              for (const entry of ctx.slots.entries('sidebar.workspaces')) {
                if (saved.has(entry) || typeof entry.component !== 'function' || !entry.children?.['sidebar.session.row.trailing']) continue;
                const Original = entry.component;
                function Browser(props) {
                  const state = useSource(data), f = useSource(filter);
                  const useFilteredSessions = React.useCallback((selector = value => value) => {
                    const original = props.useSessions(value => value);
                    const narrowed = React.useMemo(() => filterSnapshot(original, state, f), [original, state, f]);
                    return selector(narrowed);
                  }, [props.useSessions, state, f]);
                  // The native browser persists reconciled manual orders. Never save
                  // a filtered subset as the user's complete order or allow partial drag sorting.
                  const actions = React.useMemo(() => protectOrder(props.actions, f), [props.actions, f]);
                  const searchSessions = React.useCallback(async (...args) =>
                    filterSearch(await props.searchSessions(...args), state, f), [props.searchSessions, state, f]);
                  React.useEffect(() => { updateUI({ adapter: typeof props.useSessions === 'function' }); }, [props.useSessions]);
                  return h(Original, { ...props, actions, searchSessions,
                    ...(typeof props.useSessions === 'function' ? { useSessions: useFilteredSessions } : {}) });
                }
                saved.set(entry, { Original, Browser });
                entry.component = Browser;
                changed = true;
              }
              if (changed) bump();
            } finally { busy = false; }
          }
          const unsubscribe = ctx.slots.subscribe('sidebar.workspaces', adapt);
          adapt();
          return () => {
            unsubscribe();
            for (const [entry, pair] of saved) if (entry.component === pair.Browser) entry.component = pair.Original;
            bump();
            updateUI({ adapter: false });
          };
        });

        ctx.effect(() => {
          const style = document.createElement('style'); style.textContent = css; document.head.append(style);
          let queued = false;
          const touched = new Set();
          function scan() {
            queued = false;
            if (!alive) return;
            const state = data.getSnapshot();
            for (const row of document.querySelectorAll('[data-row-key^="session:"]')) {
              const id = row.getAttribute('data-row-key').slice(8), ids = new Set(idsFor(state, id));
              const tags = state.tags.filter(tag => ids.has(tag.id));
              const title = row.querySelector(':scope > span:nth-of-type(2)');
              row.classList.remove('yxsl-row-tint'); row.style.removeProperty('--yxsl-wash');
              if (title && tags.length && state.appearance !== 'marks') {
                title.classList.add('yxsl-title-color'); title.style.setProperty('--yxsl-color', tone(tags[0].color)); touched.add(row);
              } else if (touched.has(row)) {
                title?.classList.remove('yxsl-title-color'); title?.style.removeProperty('--yxsl-color'); touched.delete(row);
              }
            }
            for (const row of touched) if (!row.isConnected) touched.delete(row);
            // No public view-options slot in 0.2.2-rc.1. Identify only the native
            // archived-filter menu by its complete three-option semantic signature.
            // No CSS hashes, translated heading guesses, or React fiber traversal.
            const labels = [
              ['隐藏已归档', '全部对话（显示已归档）', '仅显示已归档'],
              ['Hide archived', 'All conversations (show archived)', 'Archived only']
            ];
            let menuHost = null;
            for (const menu of document.querySelectorAll('[role="menu"]')) {
              const text = menu.textContent.replace(/\s/g, '');
              if (labels.some(group => group.every(label => text.includes(label.replace(/\s/g, ''))))) { menuHost = menu; break; }
            }
            if (ui.getSnapshot().menuHost !== menuHost) updateUI({ menuHost });
          }
          function schedule() { if (!queued) { queued = true; queueMicrotask(scan); } }
          const observer = new MutationObserver(schedule);
          observer.observe(document.body, { childList: true, subtree: true });
          const stopData = data.subscribe(schedule);
          scan();
          const wake = () => { if (!document.hidden) void refresh(); };
          window.addEventListener('focus', wake); document.addEventListener('visibilitychange', wake);
          void refresh(); timer = setInterval(wake, 5000);
          return () => {
            alive = false; ++requestSerial; clearInterval(timer); observer.disconnect(); stopData();
            window.removeEventListener('focus', wake); document.removeEventListener('visibilitychange', wake);
            style.remove();
            for (const row of touched) {
              row.classList.remove('yxsl-row-tint'); row.style.removeProperty('--yxsl-wash');
              const title = row.querySelector(':scope > span:nth-of-type(2)');
              title?.classList.remove('yxsl-title-color'); title?.style.removeProperty('--yxsl-color');
            }
          };
        });
      }
    };
  }
});
