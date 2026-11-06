import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const NS = 'youxia-session-labels';
function harness() {
  const slots = [], menus = [], effects = [], disposed = [], requests = [], opened = [];
  const state = { revision: 0, tags: [{ id: 'red', name: '论文', color: '#FF3B30' }], assignments: {}, appearance: 'tint' };
  let active = null, reads = 0, focused = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  const contextMenus = {
    active: { getSnapshot: () => active, subscribe: () => () => {} },
    open(target, point) { active = target; opened.push({ target, point }); },
    close() { active = null; }, notify() {},
    register(contribution) { menus.push(contribution); return () => disposed.push(contribution.target); },
  };
  let plugin;
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(spec) { plugin = spec.factory(name => name === 'react' ? React : { createPortal: (child, host) => ({ child, host }) }); } } },
    document: { body: {} },
    sessionStorage: { getItem: () => null },
    fetch: async (_url, options) => {
      const command = options.body && JSON.parse(options.body);
      if (command) {
        requests.push(command);
        state.revision++;
        if (command.op === 'assign') state.assignments[command.sessionId] = command.enabled ? [command.id] : [];
        if (command.op === 'clear') state.assignments[command.sessionId] = [];
      }
      return { ok: true, json: async () => structuredClone(state) };
    },
  });
  plugin.apply({
    slots: {
      inject(name, factory) { if (name !== 'sidebar.workspaces') factory(); },
      register(spec, component) { slots.push({ ...spec, component }); return () => {}; },
    },
    contextMenus,
    effect(callback) { effects.push(callback); },
  });
  // The final effect owns the browser DOM/polling; menu lifetimes need no DOM.
  const cleanups = effects.slice(0, -1).map(effect => effect());
  const direct = menus.find(menu => menu.target === NS), session = menus.find(menu => menu.target === 'session');
  const load = () => {
    direct.observe()[0].set(structuredClone(state));
    const ui = direct.observe()[1];
    ui.set({ ...ui.getSnapshot(), loading: false });
  };
  const button = slots.find(slot => slot.name === 'sidebar.workspaces.session.row.action');
  const target = { sessionId: 'session-target', displayTitle: '目标会话' };
  const render = () => button.component(target);
  const event = () => ({
    stopPropagation() { reads++; },
    currentTarget: { focus(options) { assert.equal(options.preventScroll, true); focused++; },
      getBoundingClientRect: () => ({ left: 120, bottom: 240 }) },
  });
  return { slots, direct, session, button, target, render, event, requests, opened, contextMenus, load,
    state, cleanups, disposed, get reads() { return reads; }, get focused() { return focused; } };
}

test('hover tag button follows Pin at order 300 and uses native compact geometry', () => {
  const app = harness(), button = app.render();
  assert.equal(app.button.order, 300);
  assert.equal(app.button.id, NS);
  assert.equal(button.type, 'button');
  assert.equal(button.props['aria-label'], '标签');
  assert.equal(button.props['aria-haspopup'], 'menu');
  assert.equal(button.props['aria-expanded'], false);
  assert.equal(button.props['data-context-menu-trigger'], '');
  assert.equal(button.children[0].props.size, 14);
  const text = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(text, /\.yxsl-row-action\{[^}]*width:24px;height:24px;margin:-4px/);
});

test('button captures its own session and opens a flat shared popup without row activation', () => {
  const app = harness(), button = app.render();
  button.props.onPointerDown(app.event());
  button.props.onDoubleClick(app.event());
  button.props.onClick(app.event());
  assert.equal(app.reads, 3);
  assert.equal(app.focused, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(app.opened)), [{ target: { kind: NS, value: app.target }, point: { x: 120, y: 240 } }]);
  assert.equal(app.render().props['aria-expanded'], true);
  app.load();
  const actions = app.direct.resolve(app.target);
  assert.deepEqual(Array.from(actions, action => action.id), ['red', 'create']);
  assert.equal(actions.some(action => action.children), false);
  app.contextMenus.close();
  assert.equal(app.render().props['aria-expanded'], false);
});

test('hover and right-click share live membership, create, and clear actions', async () => {
  const app = harness();
  const directActions = () => app.direct.resolve(app.target);
  const contextActions = () => app.session.resolve(app.target)[0].children;
  assert.deepEqual(Array.from(directActions(), action => action.id), Array.from(contextActions(), action => action.id));
  assert.equal(directActions()[0].disabled, true); // initial data still loading
  app.load();
  await directActions()[0].run();
  assert.deepEqual(app.requests[0], { op: 'assign', sessionId: 'session-target', id: 'red', enabled: true });
  assert.equal(directActions()[0].label, '✓  论文');
  assert.equal(contextActions()[0].label, '✓  论文');
  assert.equal(directActions().find(action => action.id === 'create').disabled, false);
  await contextActions()[0].run();
  assert.equal(app.requests[1].enabled, false);
  await directActions()[0].run();
  await directActions().find(action => action.id === 'clear').run();
  assert.deepEqual(app.requests.at(-1), { op: 'clear', sessionId: 'session-target' });
  assert.equal(directActions().some(action => action.id === 'clear'), false);
});

test('new-tag action closes popup, preserves target, and both providers dispose on unload', () => {
  const app = harness();
  app.render().props.onClick(app.event());
  app.direct.resolve(app.target).find(action => action.id === 'create').run();
  assert.equal(app.render().props['aria-expanded'], false);
  const overlay = app.slots.find(slot => slot.name === 'shell.overlay');
  const modal = overlay.component().children[0].child.props.modal;
  assert.equal(modal.kind, 'create');
  assert.equal(modal.sessionId, app.target.sessionId);
  assert.equal(app.session.resolve(app.target)[0].afterContent, true);
  assert.equal(app.direct.observe()[0], app.session.observe()[0]);
  for (const cleanup of app.cleanups) cleanup();
  assert.deepEqual(app.disposed.sort(), [NS, 'session'].sort());
});
