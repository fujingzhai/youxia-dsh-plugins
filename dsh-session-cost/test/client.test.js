import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Load the browser module with a stub ModuleLoader and expose its pure helpers.
const hook = {};
const sandbox = {
  globalThis: null,
  window: { __ModuleLoader__: { load: ({ factory }) => factory(() => ({ createElement: () => null, memo: (component) => component })) } },
  __DSH_SESSION_COST_TEST__: hook
};
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(new URL("../client.js", import.meta.url), "utf8"), sandbox);
const { subagentTree, pillText, dialogRows, grandTotal, zh } = hook;
const plain = (value) => JSON.parse(JSON.stringify(value));
const t = (key, values = {}) => zh[key].replace(/\{(\w+)\}/g, (_, name) => String(values[name]));

const cost = (amounts, calls = 1, unknownCalls = 0) => ({
  totalCalls: calls,
  pricedCalls: calls - unknownCalls,
  segments: [{
    provider: "p", model: "m", calls, unknownCalls, firstTime: 0, lastTime: 0,
    usage: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 },
    amounts: amounts.map(([currency, amount]) => ({ currency, amount })),
    rules: ["r"]
  }]
});

const projections = {
  root: { state: "ready", values: { sessionCost: cost([["CNY", 10]]), subagentCatalog: [{ id: "a", label: "调研" }, { id: "x", mode: "external" }, { id: "b", label: "审查" }] } },
  a: { state: "ready", values: { sessionCost: cost([["CNY", 2]]), subagentCatalog: [{ id: "a1", label: "孙代理" }] } },
  a1: { state: "ready", values: { sessionCost: cost([["USD", 0.5]]) } },
  b: { state: "idle", values: {} }
};

test("walks nested subagents depth-first, skips external children and tracks unloaded ones", () => {
  const tree = subagentTree("root", projections);
  assert.deepEqual(plain(tree.nodes.map((node) => [node.id, node.depth])), [["a", 1], ["a1", 2], ["b", 1]]);
  assert.deepEqual(plain([...tree.sums]), [["CNY", 2], ["USD", 0.5]]);
  assert.equal(tree.pending, 1);
  assert.equal(tree.unknown, false);
});

const run = (currency, amount, firstTime) => ({ ...cost([[currency, amount]]).segments[0], firstTime, lastTime: firstTime });
const view = (...segments) => ({ totalCalls: segments.length, pricedCalls: segments.length, segments });
const child = (id, createdAt, amounts) => ({ [id]: { state: "ready", values: { sessionCost: cost(amounts) } } });
const parent = (own, entries, extra = {}) => ({ root: { state: "ready", values: { sessionCost: own, subagentCatalog: entries } }, ...extra });

test("outside the parentheses is the whole spend, inside is the subagents' part", () => {
  const own = view(run("CNY", 106.4186, 100));
  const projections = parent(own, [{ id: "a", createdAt: 150 }], child("a", 150, [["CNY", 30.6228]]));
  assert.equal(pillText(own, subagentTree("root", projections), t), "¥137.0414 (¥30.6228)");
  assert.equal(pillText(own, subagentTree("root", { root: { state: "ready", values: { sessionCost: own } } }), t), "¥106.4186");
});

test("with model switches each subagent joins the run it was spawned in, so the runs still add up to the total", () => {
  const own = view(run("CNY", 10, 100), run("USD", 1, 200), run("CNY", 5, 300));
  const projections = parent(own, [{ id: "a", createdAt: 150 }, { id: "b", createdAt: 350 }], {
    ...child("a", 150, [["CNY", 2]]),
    ...child("b", 350, [["CNY", 3]])
  });
  assert.equal(pillText(own, subagentTree("root", projections), t), "¥12.00 + $1.00 + ¥8.00 (¥5.00)");
});

test("a subagent in another currency joins the nearest run in its currency, else is appended", () => {
  const own = view(run("CNY", 10, 100), run("USD", 1, 200));
  const sameCurrencyElsewhere = parent(own, [{ id: "a", createdAt: 250 }], child("a", 250, [["CNY", 2]]));
  assert.equal(pillText(own, subagentTree("root", sameCurrencyElsewhere), t), "¥12.00 + $1.00 (¥2.00)");
  const foreign = parent(own, [{ id: "a", createdAt: 250 }], child("a", 250, [["EUR", 2]]));
  assert.equal(pillText(own, subagentTree("root", foreign), t), "¥10.00 + $1.00 + €2.00 (€2.00)");
});

test("nested subagents count toward their top-level child, and loading or unpriced subagents are marked", () => {
  const own = view(run("CNY", 10, 100));
  assert.equal(pillText(own, subagentTree("root", projections), t), "¥12.00 + $0.50 (¥2.00 + $0.50)");
  assert.equal(pillText(own, subagentTree("root", parent(own, [{ id: "a" }])), t), "¥10.00 (…)");
  const unpriced = parent(own, [{ id: "a" }], { a: { state: "ready", values: { sessionCost: cost([], 2, 2) } } });
  assert.equal(pillText(own, subagentTree("root", unpriced), t), "¥10.00 (--)");
});

test("details panel lists totals, own model runs and one row per subagent", () => {
  const own = projections.root.values.sessionCost;
  const tree = subagentTree("root", projections);
  assert.equal(grandTotal(own, tree), "¥12.00 + $0.50");
  const rows = plain(dialogRows(own, tree, t));
  assert.deepEqual(rows.slice(0, 3), [
    { kind: "strong", label: "本会话", value: "¥10.00" },
    { kind: "strong", label: "子代理（3 个）", value: "¥2.00 + $0.50" },
    { kind: "rule" }
  ]);
  assert.deepEqual(rows[3], { kind: "row", label: "p/m", value: "¥10.00" });
  assert.deepEqual(rows[4], { kind: "meta", label: "1 次调用 · r" });
  const subagents = rows.slice(6);
  assert.deepEqual(subagents.map((row) => [row.label, row.value]), [["调研", "¥2.00"], ["\u2003孙代理", "$0.50"], ["审查", "读取中"]]);
});

