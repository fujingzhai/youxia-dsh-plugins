import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function setup(draft = "", overrides = {}) {
  const effects = [];
  const listeners = new Map();
  const edits = [];
  let component;
  let plugin;
  const input = {
    getAttribute: () => "true",
    hasAttribute: () => false,
    closest: (selector) => selector === "[data-composer-input]" ? input : card,
    ownerDocument: { activeElement: null }
  };
  input.ownerDocument.activeElement = input;
  const card = {
    querySelector: () => input,
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: (name) => listeners.delete(name)
  };
  const refs = [];
  let index = 0;
  const React = {
    createElement: (_tag, props) => {
      props.ref.current = { closest: () => card };
      return null;
    },
    useLayoutEffect: (fn) => effects.push(fn),
    useReducer: () => [0, () => {}],
    useRef: (initial) => {
      const at = index++;
      return refs[at] ??= { current: initial };
    }
  };
  vm.runInNewContext(readFileSync(new URL("../client.js", import.meta.url), "utf8"), {
    window: { __ModuleLoader__: { load: ({ factory }) => { plugin = factory(() => React); } } },
    queueMicrotask
  });
  plugin.apply({ slots: {
    inject: (_name, fn) => fn(),
    register: (_registration, view) => { component = view; }
  } });
  const state = { phase: "plain", draft, draftRev: 3, occurrences: [], ...overrides };
  const actions = {
    captureInsertion: () => ({ start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }),
    insertText: (text, span) => { edits.push({ text, span: { ...span } }); return true; }
  };
  const render = () => {
    index = 0;
    effects.length = 0;
    component({ useInput: (selector) => selector(state), inputActions: actions });
    return effects.map((effect) => effect());
  };
  const cleanups = render();
  return { edits, listeners, state, actions, input, render, cleanups };
}

test("行首顿号通过公开插入 API 变为 slash，保留光标前完整文本", () => {
  const s = setup("、计划 论题");
  assert.deepEqual(s.edits, [{ text: "/计划 论题", span: { start: 0, end: 6, draftRev: 3 } }]);
});

test("正文顿号、原生 slash、冻结及已认领命令保持原样", () => {
  for (const draft of ["正文、", "/计划", "\n、", ""]) assert.equal(setup(draft).edits.length, 0);
  for (const phase of ["claimed", "sending", "submitting", "adjudicating"]) {
    assert.equal(setup("、", { phase }).edits.length, 0);
  }
});

test("beforeinput 在行首直接插入 slash，避免操作系统输入法切换", () => {
  const s = setup();
  let prevented = false;
  let stopped = false;
  s.listeners.get("beforeinput")({
    target: s.input, inputType: "insertText", data: "、", cancelable: true,
    preventDefault: () => { prevented = true; },
    stopImmediatePropagation: () => { stopped = true; }
  });
  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(s.edits[0].text, "/");
});

test("IME 组合期间不改写，最终提交后才转换", () => {
  const s = setup();
  s.listeners.get("compositionstart")({ target: s.input });
  s.state.draft = "、计划";
  s.render();
  assert.equal(s.edits.length, 0);
  s.listeners.get("compositionend")({ target: s.input });
  s.render();
  assert.equal(s.edits[0].text, "/计划");
});

test("撤销恢复顿号时不立刻再次转换", () => {
  const s = setup();
  s.listeners.get("beforeinput")({ target: s.input, inputType: "historyUndo" });
  s.state.draft = "、";
  s.render();
  assert.equal(s.edits.length, 0);
});

test("不在离焦编辑器或跨引用芯片的范围内改写", () => {
  const s = setup();
  s.input.ownerDocument.activeElement = null;
  s.state.draft = "、计划";
  s.render();
  assert.equal(s.edits.length, 0);
  const chips = setup("、chip", { occurrences: [{ start: 1, end: 5 }] });
  assert.equal(chips.edits.length, 0);
});

test("修订过期或没有选中起点时不拦截输入", () => {
  const s = setup();
  let prevented = false;
  s.actions.captureInsertion = () => ({ start: 0, end: 0, draftRev: -1 });
  s.listeners.get("beforeinput")({
    target: s.input, inputType: "insertText", data: "、", cancelable: true,
    preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => {}
  });
  assert.equal(prevented, false);
  assert.equal(s.edits.length, 0);
});

test("插入失败时保留原生输入，不吞掉顿号", () => {
  const s = setup();
  let prevented = false;
  s.actions.insertText = () => false;
  s.listeners.get("beforeinput")({
    target: s.input, inputType: "insertText", data: "、", cancelable: true,
    preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => {}
  });
  assert.equal(prevented, false);
});

test("只替换光标前前缀，后方正文和引用不动", () => {
  const s = setup();
  s.state.draft = "、plan 后方引用";
  s.state.occurrences = [{ start: 6, end: 10 }];
  s.actions.captureInsertion = () => ({ start: 5, end: 5, draftRev: 3 });
  s.render();
  assert.deepEqual(s.edits, [{ text: "/plan", span: { start: 0, end: 5, draftRev: 3 } }]);
});

test("卸载移除所有事件监听", () => {
  const s = setup();
  for (const cleanup of s.cleanups) if (typeof cleanup === "function") cleanup();
  assert.equal(s.listeners.size, 0);
});
