import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, readFileSync, realpathSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';

const HOME = realpathSync(mkdtempSync(join(tmpdir(), 'shist-plugin-')));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
after(() => rmSync(HOME, { recursive: true, force: true })); // 只删本测试自建的临时目录
for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'PI_CODING_AGENT_DIR', 'DSH_HOME', 'DSH_AGENTS_HOME', 'SESSION_HISTORY_HOME']) delete process.env[k];
mkdirSync(join(HOME, '.pi/agent/sessions'), { recursive: true });

test('插件页面板：注册到本包的 bundle 配置槽，读接口并渲染', async () => {
  const slots = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useSyncExternalStore: (_s, get) => get(),
    useEffect: () => {},
    useState: initial => [initial, () => {}],
  };
  let plugin;
  const requests = [];
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(spec) { plugin = spec.factory(name => (name === 'react' ? React : {})); } } },
    fetch: async (url, options) => { requests.push([url, options]); return { ok: true, json: async () => ({}) }; },
    JSON, Promise, Array, Set, Map, Number, String, Object,
  });
  const effects = [];
  plugin.apply({
    effect: fn => effects.push(fn),
    slots: { inject: (name, fn) => { slots.push(name); fn(); }, register: (options, component) => { slots.push(options); slots.component = component; return () => {}; } },
  });
  assert.equal(slots[0], 'plugins.bundle.config');
  assert.equal(slots[1].key, 'dsh-session-history');
  const view = slots.component({ view: 'page' });
  assert.ok(view, '页面视图有内容');
  assert.equal(slots.component({ view: 'summary' }) === null || slots.component({ view: 'summary' })?.props?.className?.includes('yxsh'), true);
});

test('宿主接口：快照含各 agent 的检测与技能状态', async () => {
  const { snapshot, command, nextSlot, Config } = await import('../index.js');
  const home = join(HOME, '.session-history');
  const runner = { running: false, run: async () => ({ ok: true }) };
  const s = snapshot(home, runner);
  assert.equal(s.agents.length, 5);
  assert.equal(s.agents.find(a => a.id === 'pi').installed, true);
  assert.equal(s.agents.find(a => a.id === 'claude').installed, false);
  assert.match(s.skill, /name: session-history/);
  const after = await command(home, runner, { op: 'config', patch: { userLabel: '主人', refreshMinutes: 30, bogus: 1 } });
  assert.equal(after.config.userLabel, '主人');
  assert.equal(after.config.refreshMinutes, 30);
  const linked = await command(home, runner, { op: 'link', agent: 'pi' });
  assert.equal(linked.agents.find(a => a.id === 'pi').visible, true);
  await assert.rejects(command(home, runner, { op: 'nope' }), /未知操作/);
  assert.equal(Config['~standard'].validate({ home: '~/x' }).value.home, '~/x');
  assert.ok(Config['~standard'].validate({ other: 1 }).issues);
  const t = new Date(2026, 10, 17, 21, 5).getTime();
  assert.equal(new Date(nextSlot(t, 60)).getHours(), 22);
  assert.equal(new Date(nextSlot(t, 30)).getMinutes(), 30);
});
