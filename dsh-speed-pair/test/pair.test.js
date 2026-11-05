import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(packageDirectory, "client.js"), "utf8");

/** Minimal React surface: the factory only references it, apply() never renders. */
const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  Fragment: Symbol("Fragment"),
  memo: (component) => component,
  useState: () => [undefined, () => {}],
  useRef: () => ({ current: null }),
  useMemo: (factory) => factory(),
  useEffect: () => {},
  useLayoutEffect: () => {}
};

/** Load the browser artifact the way DSH's module loader does. */
function load() {
  const hook = {};
  let module;
  globalThis.__DSH_SPEED_PAIR_TEST__ = hook;
  globalThis.window = {
    __ModuleLoader__: {
      load({ id, factory }) {
        module = { id, exports: factory((name) => (name === "react" ? React : {})) };
      }
    }
  };
  new Function(source)();
  delete globalThis.window;
  return { module, hook };
}

function apply(module) {
  const registrations = [];
  const dictionaries = [];
  const ctx = {
    effect: (callback) => {
      callback();
    },
    locale: { register: (namespace, dictionaries_) => dictionaries.push({ namespace, dictionaries: dictionaries_ }) },
    slots: {
      inject: (owner, callback) => callback(),
      register: (options, component) => {
        registrations.push({ options, component });
        return () => {};
      }
    }
  };
  module.exports.apply(ctx);
  return { registrations, dictionaries };
}

const t = (key, values = {}) => {
  const template = hooked.zh[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
};
let hooked;

test("loads under the browser module loader with a unique id", () => {
  const { module } = load();
  assert.equal(module.id, "dsh-speed-pair");
  assert.deepEqual(module.exports.inject, ["slots", "locale"]);
});

test("registers one composer-dock entry that takes the activity slot position", () => {
  const { module } = load();
  const { registrations, dictionaries } = apply(module);
  assert.equal(registrations.length, 1);
  const [entry] = registrations;
  assert.equal(entry.options.name, "conversation.composer.dock");
  assert.equal(entry.options.id, "speed");
  assert.equal(entry.options.order, 0);
  assert.equal(typeof entry.component, "function");
  assert.deepEqual(dictionaries.map((item) => item.namespace), ["speed-pair"]);
  assert.ok(dictionaries[0].dictionaries.zh["speed.pair"]);
});

test("hides the built-in reading only while this entry is present", () => {
  hooked = load().hook;
  assert.match(hooked.css, /:has\(\[data-composer-stat="speed"\]\)/);
  assert.match(hooked.css, /\[data-composer-stat="activity"\]\{display:none\}/);
});

test("both readings come from one batch of steps", () => {
  hooked = load().hook;
  const pair = hooked.pairOf({ decodeTokens: 500, decodeMs: 2500, llmMs: 3900 });
  assert.equal(hooked.formatTps(pair.x), "200");
  assert.equal(hooked.formatTps(pair.y), "128");
  assert.equal(hooked.pairText(pair, t), "200(128) tok/s");
});

test("the parenthesised reading never exceeds the decode reading", () => {
  hooked = load().hook;
  const pair = hooked.pairOf({ decodeTokens: 500, decodeMs: 3900, llmMs: 2500 });
  assert.equal(pair.y, pair.x);
});

test("no usage yet, or no decode window, shows nothing", () => {
  hooked = load().hook;
  assert.equal(hooked.pairOf(undefined), null);
  assert.equal(hooked.pairOf({ decodeTokens: 0, decodeMs: 0, llmMs: 0 }), null);
  assert.equal(hooked.pairOf({ decodeTokens: 500, decodeMs: 0, llmMs: 10 }), null);
});

test("a step without a first token keeps a single reading", () => {
  hooked = load().hook;
  const pair = hooked.pairOf({ decodeTokens: 120, decodeMs: 900, llmMs: 0 });
  assert.equal(pair.y, null);
  assert.equal(hooked.pairText(pair, t), "133 tok/s");
});

test("both dictionaries carry the same keys, including every panel row", () => {
  hooked = load().hook;
  assert.deepEqual(Object.keys(hooked.zh).sort(), Object.keys(hooked.en).sort());
  for (const key of ["speed.dialogTitle", "speed.llmTime", "speed.toolTime", "speed.ttft", "speed.decodeTime", "speed.x", "speed.y"]) {
    assert.ok(hooked.zh[key], key);
  }
  assert.equal(hooked.zh["speed.pair"], hooked.en["speed.pair"]);
});

test("durations read like the host's compact form", () => {
  hooked = load().hook;
  assert.equal(hooked.formatDuration(420, t), "420毫秒");
  assert.equal(hooked.formatDuration(3100, t), "3.1秒");
  assert.equal(hooked.formatDuration(162000, t), "2分42秒");
});
