import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, reduce, openStore } from '../lib/store.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handler } from '../index.js';
import { catalog } from '../lib/sessions.js';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const create = (state, name = '论文', color = '#0a84ff', extra = {}) => reduce(state, { op: 'create', name, color, ...extra }, () => name);
test('create normalizes color and applies tag atomically', () => {
  const before = emptyState(), next = create(before, '论文', '#0a84ff', { sessionId: 'session-1' });
  assert.deepEqual(next.tags, [{ id: '论文', name: '论文', color: '#0A84FF' }]);
  assert.deepEqual(next.assignments, { 'session-1': ['论文'] });
  assert.equal(before.tags.length, 0);
});
test('reject duplicate names, hostile keys and CSS injections', () => {
  const state = create(emptyState(), 'Work');
  assert.throws(() => create(state, 'work'), /同名/);
  assert.throws(() => create(state, 'Other', 'red;position:fixed'), /颜色/);
  assert.throws(() => create(state, 'X', '#ffffff', { sessionId: '__proto__' }), /ID/);
  assert.throws(() => create(state, 'x'.repeat(65)), /字符/);
});
test('multi-tag membership is idempotent and clear never deletes sessions', () => {
  let state = create(create(emptyState(), 'A'), 'B');
  const command = { op: 'assign', sessionId: 's1', id: 'A', enabled: true };
  state = reduce(reduce(state, command), command);
  state = reduce(state, { ...command, id: 'B' });
  assert.deepEqual(state.assignments.s1, ['A', 'B']);
  state = reduce(state, { ...command, enabled: false });
  assert.deepEqual(state.assignments.s1, ['B']);
  assert.deepEqual(reduce(state, { op: 'clear', sessionId: 's1' }).assignments, {});
});
test('rename preserves stable identity; deletion removes dangling assignments', () => {
  let state = create(emptyState(), 'A', '#ffffff', { sessionId: 's1' });
  state = reduce(state, { op: 'update', id: 'A', name: 'B', color: '#000000' });
  assert.deepEqual(state.assignments.s1, ['A']);
  assert.equal(state.tags[0].name, 'B');
  assert.throws(() => reduce(state, { op: 'update', id: 'A', name: 'C', color: '#000000', expected: { name: 'A', color: '#ffffff' } }), /其他窗口/);
  assert.deepEqual(reduce(state, { op: 'remove', id: 'A' }).assignments, {});
});
test('combined appearance becomes background color once on open', () => {
  assert.equal(emptyState().appearance, 'tint');
  assert.equal(reduce(emptyState(), { op: 'appearance', value: 'marks' }).appearance, 'marks');
  assert.throws(() => reduce(emptyState(), { op: 'appearance', value: 'both' }), /显示方式/);
  const dir = mkdtempSync(join(tmpdir(), 'yxsl-'));
  const path = join(dir, 'labels.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE labels (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
    db.prepare('INSERT INTO labels VALUES (1, ?)').run(JSON.stringify({
      version: 1, revision: 2, tags: [], assignments: {}, appearance: 'both', appearanceMigrated: 1
    }));
    db.close();
    const store = openStore(path);
    try { assert.equal(store.snapshot().appearance, 'tint'); }
    finally { store.close(); }
    const again = openStore(path);
    try { assert.equal(again.snapshot().appearance, 'tint'); }
    finally { again.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('legacy default gray becomes slightly darker once on open', () => {
  const dir = mkdtempSync(join(tmpdir(), 'yxsl-'));
  const path = join(dir, 'labels.sqlite');
  try {
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE labels (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
    db.prepare('INSERT INTO labels VALUES (1, ?)').run(JSON.stringify({
      version: 1, revision: 1, tags: [{ id: '灰', name: '灰', color: '#8E8E93' }], assignments: {}, appearance: 'tint'
    }));
    db.close();
    const store = openStore(path);
    try { assert.equal(store.snapshot().tags[0].color, '#6E6E73'); }
    finally { store.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('tag order moves without changing ids or assignments', () => {
  let state = ['甲', '乙', '丙'].reduce((value, name) => create(value, name), emptyState());
  state = reduce(state, { op: 'assign', sessionId: 's1', id: '乙', enabled: true });
  state = reduce(state, { op: 'move', id: '丙', direction: 'up' });
  assert.deepEqual(state.tags.map(tag => tag.name), ['甲', '丙', '乙']);
  assert.deepEqual(state.assignments.s1, ['乙']);
  assert.throws(() => reduce(state, { op: 'move', id: '甲', direction: 'up' }), /边界/);
});
test('association rows distinguish deleted and archived sessions', () => {
  const { sessionRows } = client();
  const rows = sessionRows({ a: ['red'], b: ['red'], c: ['red'] }, 'red',
    [{ sessionId: 'a', title: '可见', updatedAt: 10, workspace: '默认工作区' }, { sessionId: 'b', title: '旧稿', updatedAt: 20, workspace: '资料' }], ['b']);
  assert.deepEqual(Array.from(rows.map(row => row.state)), ['active', 'archived', 'deleted']);
  assert.equal(rows[2].title, '已删除的会话');
  assert.equal(rows[0].workspace, '默认工作区');
});
test('sqlite transaction rolls back validation errors', () => {
  const store = openStore(':memory:');
  try {
    const before = store.mutate({ op: 'create', name: 'A', color: '#ffffff' });
    assert.throws(() => store.mutate({ op: 'create', name: 'A', color: '#ffffff' }));
    assert.deepEqual(store.snapshot(), before);
  } finally { store.close(); }
});
async function request(ctx, store, method = 'GET', payload, contentType = 'application/json') {
  const req = Readable.from(payload === undefined ? [] : [Buffer.from(payload)]);
  req.method = method; req.headers = { 'content-type': contentType };
  let status, value;
  await handler(ctx, store)(req, { writeHead(s) { status = s; }, end(v) { value = JSON.parse(v); } });
  return { status, value };
}
const owner = { get: () => ({ admit: () => ({ peer: { principal: { kind: 'owner' } } }) }) };
test('catalog keeps a deleted session title and only marks a missing record deleted', () => {
  const root = mkdtempSync(join(tmpdir(), 'labels-'));
  try {
    const id = 'session-5a7f3746-4a11-4aed-a9f5-f89c16993ac5';
    const gone = 'session-70cf0419-1a57-419a-b285-647c51852ae9';
    mkdirSync(join(root, 'sessions', 'cwd', id), { recursive: true });
    writeFileSync(join(root, 'sessions', 'cwd', id, 'session.v4.jsonl.zstd'), '');
    mkdirSync(join(root, 'storages', 'session_projcache', 'sessions'), { recursive: true });
    const cache = (title, at) => JSON.stringify({ record: { identity: { createdAt: at }, rows: { title: { val: title }, sessionListMetadata: { val: { lastPromptAt: at } } } } });
    writeFileSync(join(root, 'storages', 'session_projcache', 'sessions', `${id}.json`), cache('还在', 20));
    writeFileSync(join(root, 'storages', 'session_projcache', 'sessions', `${gone}.json`), cache('已经删了', 10));
    writeFileSync(join(root, 'storages', 'workspace.json'), JSON.stringify({ global: { archivedSessionIds: [id] }, tables: { workspaces: { a: { title: 'AI-Space', sessionIds: [id, gone] } } } }));
    const value = catalog(root, [id, gone, '../secret']);
    assert.equal(value.items.find(item => item.sessionId === id).exists, true);
    assert.equal(value.items.find(item => item.sessionId === gone).exists, false);
    assert.equal(value.items.find(item => item.sessionId === gone).title, '已经删了');
    assert.deepEqual(value.archived, [id]);
    assert.equal(value.items.length, 2);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test('API fails closed and requires JSON for writes', async () => {
  const store = { snapshot: () => emptyState(), mutate: () => { throw new Error('must not write'); } };
  assert.equal((await request({ get: () => null }, store)).status, 503);
  assert.equal((await request({ get: () => ({ admit: () => ({ rejection: 401 }) }) }, store)).status, 403);
  assert.equal((await request({ get: () => ({ admit: () => ({ peer: { principal: { kind: 'guest' } } }) }) }, store)).status, 403);
  assert.equal((await request(owner, store)).status, 200);
  assert.equal((await request(owner, store, 'POST', '{}', 'text/plain')).status, 415);
  assert.equal((await request(owner, store, 'POST', '{')).status, 400);
  assert.equal((await request(owner, store, 'POST', 'x'.repeat(16385))).status, 413);
  assert.equal((await request(owner, store, 'DELETE')).status, 405);
});
function client() {
  let plugin;
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: spec => { plugin = spec.factory(() => ({})); } } }
  });
  return plugin;
}
test('filter handles OR, AND, untagged and keeps blank composer session', () => {
  const { matches, filterSnapshot } = client();
  const state = { assignments: { a: ['red', 'blue'], b: ['red'] } };
  assert.equal(matches(state, 'b', { ids: ['red', 'blue'], mode: 'any' }), true);
  assert.equal(matches(state, 'b', { ids: ['red', 'blue'], mode: 'all' }), false);
  assert.equal(matches(state, 'c', { ids: [], untagged: true }), true);
  const list = { ids: ['a', 'b', 'c'], byId: { a: {}, b: {}, c: { blank: true } } };
  const filtered = filterSnapshot(list, state, { ids: ['blue'], mode: 'any' });
  assert.deepEqual(Array.from(filtered.ids), ['a', 'c']);
  assert.equal(filtered.byId.b, undefined);
  assert.equal(list.ids.length, 3);
  assert.equal(filterSnapshot(list, state, { ids: [] }), list);
});
test('filtered list cannot overwrite persistent native manual order', () => {
  const { protectOrder } = client();
  let writes = 0, other = 0;
  const actions = { syncSessionOrders() { writes++; }, setSessionOrder() { writes++; }, setGroupBy() { other++; } };
  for (const f of [{ ids: ['red'] }, { ids: [], untagged: true }]) {
    const guarded = protectOrder(actions, f);
    guarded.syncSessionOrders({ w: ['partial'] }); guarded.setSessionOrder('w', ['partial']); guarded.setGroupBy('flat');
  }
  assert.equal(writes, 0); assert.equal(other, 2);
  assert.equal(protectOrder(actions, { ids: [] }), actions);
});
test('remote content hits intersect tags and preserve truncation metadata', () => {
  const { filterSearch } = client();
  const result = { items: [{ sessionId: 'a', snippet: 'hit A' }, { sessionId: 'b', snippet: 'hit B' }], hasMore: true };
  const filtered = filterSearch(result, { assignments: { a: ['red'] } }, { ids: ['red'] });
  assert.deepEqual(Array.from(filtered.items), [result.items[0]]);
  assert.equal(filtered.hasMore, true);
  assert.equal(result.items.length, 2);
  assert.equal(filterSearch(result, {}, { ids: [] }), result);
});
