import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function load() {
  const hook = {};
  let plugin;
  vm.runInNewContext(readFileSync(new URL("../client.js", import.meta.url), "utf8"), {
    window: { __ModuleLoader__: { load: ({ id, factory }) => {
      assert.equal(id, "dsh-settings-customizer");
      plugin = factory(name => {
        assert.equal(name, "react");
        return { createElement: (type, props, ...children) => ({ type, props, children }) };
      });
    } } },
    globalThis: { __DSH_SETTINGS_CUSTOMIZER_TEST__: hook }
  });
  return { ...hook, plugin };
}

// 模拟官方台账：同 id 同 priority 拒绝注册，低 priority 遮蔽，先声明才可注册。
function ledger({ declared = true, batched = false } = {}) {
  const records = new Map();
  const injections = new Map();
  const spec = name => {
    if (!records.has(name)) records.set(name, { entries: [], listeners: new Set(), version: 0, declared });
    return records.get(name);
  };
  function notify(name) {
    const record = spec(name);
    record.version++;
    const emit = () => { for (const fn of [...record.listeners]) fn(); };
    if (batched) queueMicrotask(emit);
    else emit();
  }
  const slots = {
    entries: name => spec(name).entries,
    getVersion: name => spec(name).version,
    subscribe(name, fn) {
      spec(name).listeners.add(fn);
      return () => spec(name).listeners.delete(fn);
    },
    inject(name, callback) {
      const item = { callback, stop: undefined };
      if (!injections.has(name)) injections.set(name, new Set());
      injections.get(name).add(item);
      if (spec(name).declared) item.stop = callback();
      return () => {
        injections.get(name).delete(item);
        if (typeof item.stop === "function") item.stop();
      };
    },
    register(options, component) {
      const { name } = options;
      const record = spec(name);
      assert.ok(record.declared, `${name} must be declared`);
      assert.equal(record.entries.some(entry => entry.options.id === options.id
        && (entry.options.priority ?? 0) === (options.priority ?? 0)), false, "duplicate priority");
      const entry = { component, options: Object.fromEntries(["id", "order", "label", "priority"]
        .filter(key => options[key] !== undefined).map(key => [key, options[key]])) };
      record.entries = [...record.entries, entry].sort((a, b) =>
        (a.options.priority ?? 0) - (b.options.priority ?? 0) || (a.options.order ?? 0) - (b.options.order ?? 0));
      notify(name);
      return () => {
        if (!record.entries.includes(entry)) return;
        record.entries = record.entries.filter(row => row !== entry);
        notify(name);
      };
    }
  };
  return {
    slots,
    declare(name) {
      spec(name).declared = true;
      for (const item of injections.get(name) ?? []) item.stop = item.callback();
    },
    collapse(name) {
      spec(name).declared = false;
      for (const item of injections.get(name) ?? []) {
        if (typeof item.stop === "function") item.stop();
        item.stop = undefined;
      }
      spec(name).entries = [];
      notify(name);
    },
    entries: name => slots.entries(name),
    winner: id => slots.entries("settings.section.icon").find(entry => entry.options.id === id)
  };
}
const SECTION = "settings.section";
const ICON = "settings.section.icon";
const noop = () => null;
function section(slots, id, order = 0, label = id) {
  return slots.register({ name: SECTION, id, order, label }, noop);
}

const { install: installCore, project, makeIcon, RULES } = load();
const SAMPLE_RULES = {
  "sample-billing": { order: 30 },
  "sample-code": { order: 31 },
  "sample-chat": { order: 32 }
};
const install = (slots, rules = SAMPLE_RULES, options = { autoOrder: true }) => installCore(slots, rules, options);

test("默认不改名称和图标，示例账单 → 示例编程 → 示例通信保持原排序", () => {
  const { slots, entries } = ledger();
  const originalIcon = () => "original";
  slots.register({ name: ICON, id: "sample-code" }, originalIcon);
  for (const [id, order] of [["account", -1], ["general", 0], ["models", 10], ["plugins", 15],
    ["sample-code", 15], ["agent-presets", 20], ["sample-chat", 21], ["sample-billing", 90], ["archived-sessions", 100]]) {
    section(slots, id, order);
  }
  install(slots);
  assert.deepEqual(Array.from(project(entries(SECTION)), row => row.id), [
    "account", "general", "models", "plugins", "agent-presets", "sample-billing", "sample-code", "sample-chat", "archived-sessions"
  ]);
  assert.equal(entries(SECTION).find(entry => entry.options.id === "sample-code").options.label, "sample-code");
  assert.equal(entries(ICON)[0].component, originalIcon);
});

test("先装入时，后来的新插件从 40 顺排，官方项不动", () => {
  const { slots, entries } = ledger();
  install(slots);
  for (const [id, order] of [["plugins", 15], ["sample-code", 15], ["future-plugin", 5], ["other", -100], ["agent-presets", 20]]) {
    section(slots, id, order);
  }
  assert.deepEqual(Array.from(project(entries(SECTION)), row => `${row.id}:${row.order}`), [
    "plugins:15", "agent-presets:20", "sample-code:31", "future-plugin:40", "other:41"
  ]);
});

test("覆盖先注册及后注册的名称，保留页面组件与传入配置", () => {
  const { slots, entries } = ledger();
  const label = () => "原始本地化名称";
  const options = { name: SECTION, id: "sample-billing", order: 90, label };
  slots.register(options, noop);
  install(slots, { "sample-billing": { order: 30, label: "订阅管理" }, "sample-code": { order: 31, label: "编程模型" } });
  section(slots, "sample-code", 15, "示例编程");
  assert.equal(entries(SECTION).find(entry => entry.options.id === "sample-billing").options.label, "订阅管理");
  assert.equal(entries(SECTION).find(entry => entry.options.id === "sample-code").options.label, "编程模型");
  assert.equal(entries(SECTION)[0].component, noop);
  assert.equal(options.label, label);
  assert.equal(options.order, 90);
});

test("显式规则也可覆盖官方页；不影响其他槽位", () => {
  const { slots, entries } = ledger();
  install(slots, { general: { label: "通用", order: -5 } });
  section(slots, "general", 0);
  slots.register({ name: "settings.plugins.tab", id: "general", order: 2, label: "原样" }, noop);
  assert.equal(entries(SECTION)[0].options.label, "通用");
  assert.equal(entries(SECTION)[0].options.order, -5);
  assert.equal(entries("settings.plugins.tab")[0].options.label, "原样");
});

test("名称支持原生本地化函数，且空字符串、order=0 有效", () => {
  const { slots, entries } = ledger();
  const label = () => "本地化覆盖";
  install(slots, { "sample-code": { label, order: 0 }, "sample-billing": { label: "" } });
  section(slots, "sample-code", 15);
  section(slots, "sample-billing", 90);
  assert.equal(entries(SECTION).find(row => row.options.id === "sample-code").options.label, label);
  assert.equal(entries(SECTION).find(row => row.options.id === "sample-code").options.order, 0);
  assert.equal(entries(SECTION).find(row => row.options.id === "sample-billing").options.label, "");
});

test("重注册或切换语言后仍使用覆盖值", () => {
  const { slots, entries } = ledger();
  install(slots, { "sample-code": { order: 31, label: "编程模型" } });
  const dispose = section(slots, "sample-code", 15, "示例编程");
  dispose();
  section(slots, "sample-code", 15, "示例编程 English");
  assert.equal(entries(SECTION)[0].options.label, "编程模型");
  assert.equal(entries(SECTION)[0].options.order, 31);
});

test("图标先注册、后注册、无原图标均可覆盖，低优先级原图标也能压住", () => {
  for (const before of [true, false]) {
    const { slots, winner } = ledger();
    const old = () => "old";
    if (before) slots.register({ name: ICON, id: "sample-code", priority: -3 }, old);
    const stop = install(slots, { "sample-code": { icon: "code" }, "sample-billing": { icon: "credit-card" } });
    if (!before) slots.register({ name: ICON, id: "sample-code", priority: -3 }, old);
    assert.notEqual(winner("sample-code").component, old);
    assert.ok(winner("sample-code").options.priority < -3);
    assert.ok(winner("sample-billing"));
    stop();
    assert.equal(winner("sample-code").component, old);
    assert.equal(winner("sample-billing"), undefined);
  }
});

test("后来的图标与覆盖项 priority 相同，不产生同 id 注册冲突", () => {
  const { slots, winner } = ledger();
  const stop = install(slots, { "sample-code": { icon: "code" } });
  const original = () => "original";
  slots.register({ name: ICON, id: "sample-code", priority: -1 }, original);
  assert.equal(winner("sample-code").options.priority, -2);
  assert.notEqual(winner("sample-code").component, original);
  stop();
  assert.equal(winner("sample-code").component, original);
});

test("图标声明晚于插件，声明销毁重建后重新挂载", () => {
  const { slots, declare, collapse, entries } = ledger({ declared: false });
  install(slots, { "sample-code": { label: "编程模型", icon: "code" } });
  assert.equal(entries(ICON).length, 0);
  declare(SECTION);
  section(slots, "sample-code", 15);
  declare(ICON);
  assert.equal(entries(ICON).length, 1);
  collapse(ICON);
  declare(ICON);
  assert.equal(entries(ICON).length, 1);
  assert.equal(entries(SECTION)[0].options.label, "编程模型");
});

test("卸载还原原始 order 和 label，恢复注册方法且不留下临时项", () => {
  const { slots, entries } = ledger();
  const originalRegister = slots.register;
  const label = () => "示例编程";
  section(slots, "sample-code", 15, label);
  const stop = install(slots, { "sample-code": { order: 31, label: "编程模型" } });
  section(slots, "new-plugin", 1);
  stop();
  stop();
  assert.equal(slots.register, originalRegister);
  assert.equal(entries(SECTION).find(row => row.options.id === "sample-code").options.label, label);
  assert.equal(entries(SECTION).find(row => row.options.id === "sample-code").options.order, 15);
  assert.equal(entries(SECTION).find(row => row.options.id === "new-plugin").options.order, 1);
  assert.equal(entries(SECTION).length, 2);
});

test("卸载时不覆盖别人后来修改的字段；原来缺失的字段恢复缺失", () => {
  const { slots, entries } = ledger();
  slots.register({ name: SECTION, id: "sample-code" }, noop);
  const stop = install(slots, { "sample-code": { label: "编程模型" } });
  entries(SECTION)[0].options.label = "后来修改";
  stop();
  assert.equal(entries(SECTION)[0].options.label, "后来修改");
  assert.equal(Object.hasOwn(entries(SECTION)[0].options, "order"), false);
});

test("重复安装不重复包装；卸载后可以再次安装", () => {
  const { slots, entries } = ledger();
  const stop = install(slots);
  const register = slots.register;
  install(slots)();
  assert.equal(slots.register, register);
  stop();
  install(slots);
  section(slots, "sample-code", 15);
  assert.equal(entries(SECTION)[0].options.order, 31);
});

test("微任务合并通知不会无限刷新或遗留空项", async () => {
  const { slots, entries } = ledger({ batched: true });
  section(slots, "sample-code", 15);
  const stop = install(slots, { "sample-code": { order: 31, label: "编程模型", icon: "code" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(entries(SECTION).length, 1);
  assert.equal(entries(ICON).length, 1);
  assert.ok(slots.getVersion(SECTION) < 10);
  stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(entries(ICON).length, 0);
});

test("内置图标、SVG 路径和自定义组件，均接收 size，继承主题颜色", () => {
  const element = makeIcon("code")({ size: 20, active: true });
  assert.equal(element.type, "svg");
  assert.equal(element.props.width, 20);
  assert.equal(element.props.stroke, "currentColor");
  assert.equal(element.props.strokeWidth, 1.7);
  assert.equal(makeIcon({ paths: ["M1 1h4"], viewBox: "0 0 16 16" })({}).props.strokeWidth, 1.3);
  assert.equal(element.children.length, 3);
  assert.equal(makeIcon({ paths: ["M0 0h10"], viewBox: "0 0 10 10" })({}).props.viewBox, "0 0 10 10");
  assert.equal(makeIcon(({ active }) => active)({ active: true }), true);
  assert.throws(() => makeIcon("unknown"), /无效图标/);
});

test("公共默认规则为空；异常配置不污染注册函数", () => {
  assert.deepEqual(Object.keys(RULES), []);
  assert.ok(Object.values(RULES).every(rule => !Object.hasOwn(rule, "label") && !Object.hasOwn(rule, "icon")));
  const { slots } = ledger();
  const original = slots.register;
  assert.throws(() => install(slots, { "sample-code": { icon: "bad" } }), /无效图标/);
  assert.equal(slots.register, original);
});

function form(initial = { status: "loading" }) {
  let snapshot = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    update(value) { snapshot = value; for (const fn of listeners) fn(); }
  };
}

test("公开空规则默认不动 order、label、图标；自动排序需主动开启", () => {
  const { slots, entries } = ledger();
  section(slots, "sample-code", 5);
  const stop = installCore(slots);
  assert.equal(entries(SECTION)[0].options.order, 5);
  assert.equal(entries(ICON).length, 0);
  stop();
  installCore(slots, {}, { autoOrder: true, extraStart: 70 });
  assert.equal(entries(SECTION)[0].options.order, 70);
});

test("Host 表单加载后应用规则，改配置即时更新，删除覆盖恢复原始值", () => {
  const { bindConfig } = load();
  const { slots, entries } = ledger();
  section(slots, "sample-code", 15, "原名");
  const source = form();
  const stop = bindConfig(slots, source);
  assert.equal(entries(SECTION)[0].options.order, 15);
  source.update({ status: "ready", value: { rules: { "sample-code": { order: 31, label: "自定", icon: "code" } } } });
  assert.equal(entries(SECTION)[0].options.label, "自定");
  assert.equal(entries(ICON).length, 1);
  source.update({ status: "ready", value: { rules: { "sample-code": { label: "第二次" } } } });
  assert.equal(entries(SECTION)[0].options.order, 15);
  assert.equal(entries(SECTION)[0].options.label, "第二次");
  assert.equal(entries(ICON).length, 0);
  const version = slots.getVersion(SECTION);
  source.update({ status: "ready", value: { rules: { "sample-code": { label: "第二次" } } } });
  assert.equal(slots.getVersion(SECTION), version);
  source.update({ status: "ready", value: { rules: {} } });
  assert.equal(entries(SECTION)[0].options.label, "原名");
  stop();
});

test("Cordis 风格每次绑定新函数的 Service Proxy 能正确卸载并重装", () => {
  const { slots, entries } = ledger();
  const proxy = new Proxy(slots, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== "function") return value;
      return Object.assign(value.bind(target), value);
    }
  });
  const { bindConfig } = load();
  section(proxy, "sample-code", 15);
  const source = form({ status: "ready", value: { rules: { "sample-code": { label: "第一次", icon: "star" } } } });
  const stop = bindConfig(proxy, source);
  source.update({ status: "ready", value: { rules: { "sample-code": { label: "第二次", icon: "code" } } } });
  assert.equal(entries(SECTION)[0].options.label, "第二次");
  assert.equal(entries(ICON).length, 1);
  stop();
  assert.equal(entries(SECTION)[0].options.label, "sample-code");
  assert.equal(proxy.register.dshSettingsCustomizer, undefined);
});

test("Host 不再提供配置时撤销覆盖；卸载后不再跟随变化", () => {
  const { bindConfig } = load();
  const { slots, entries } = ledger();
  section(slots, "sample-code", 15);
  const source = form({ status: "ready", value: { rules: { "sample-code": { order: 31 } } } });
  const stop = bindConfig(slots, source);
  assert.equal(entries(SECTION)[0].options.order, 31);
  source.update({ status: "unavailable" });
  assert.equal(entries(SECTION)[0].options.order, 15);
  stop();
  source.update({ status: "ready", value: { rules: { "sample-code": { order: 50 } } } });
  assert.equal(entries(SECTION)[0].options.order, 15);
});

test("Cordis apply 从固定的个人 namespace 读配置并注册清理", () => {
  const { plugin } = load();
  const { slots, entries } = ledger();
  const source = form({ status: "ready", value: { rules: { "sample-code": { order: 31 } } } });
  let dispose;
  plugin.apply({ slots, configForms: { get(ns) { assert.equal(ns, "settings-customizer"); return source; } },
    effect(setup) { dispose = setup(); } });
  section(slots, "sample-code", 15);
  assert.equal(entries(SECTION)[0].options.order, 31);
  dispose();
  assert.equal(entries(SECTION)[0].options.order, 15);
});
