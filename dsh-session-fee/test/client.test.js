import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { pricingModelId } from "../lib/model-id.js";

// Load the browser module with a stub ModuleLoader and expose its pure helpers.
const hook = {};
const sandbox = {
  globalThis: null,
  window: { __ModuleLoader__: { load: ({ factory }) => factory(() => ({ createElement: () => null, memo: (component) => component })) } },
  __DSH_SESSION_COST_TEST__: hook
};
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(new URL("../client.js", import.meta.url), "utf8"), sandbox);
const { subagentTree, pillText, dialogRows, grandTotal, displaySegments, pricingModelId: clientModelId, zh } = hook;
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
const accountModel = (account, model) => `~account:${encodeURIComponent(account)}:${encodeURIComponent(model)}`;
const modelRun = (model, amount, firstTime, extra = {}) => ({ ...run("USD", amount, firstTime), provider: "codex", model, ...extra });

test("display groups ordinary and independent account entries for the same consecutive model", () => {
  const model = "gpt-6.1-sol";
  const own = view(
    modelRun(model, 2.7163, 100, { rules: ["GPT-6.1 Sol", "GPT-6.1 Sol · >272K"] }),
    modelRun(accountModel(JSON.stringify(["workspace-fixture", "user", "user-first"]), model), 2.0394, 200, { rules: ["GPT-6.1 Sol · >272K", "GPT-6.1 Sol"] }),
    modelRun(accountModel("second-account-fixture", model), 1, 300, { rules: ["GPT-6.1 Sol"] })
  );
  const original = structuredClone(own);
  const tree = subagentTree("root", {});
  assert.equal(pillText(own, tree, t), "$5.7557");
  assert.deepEqual(plain(dialogRows(own, tree, t)), [
    { kind: "entry", label: "主会话", value: "$5.7557", spaced: false },
    { kind: "route", label: "codex/gpt-6.1-sol（GPT-6.1 Sol、GPT-6.1 Sol · >272K）", value: "" }
  ]);
  assert.deepEqual(own, original, "display normalization must not modify account facts");
});

test("the reported two Sol runs show one total instead of a split sum or internal account id", () => {
  const own = view(modelRun("gpt-6.1-sol", 2.7163, 100),
    modelRun(accountModel("fixture-account", "gpt-6.1-sol"), 2.0394, 200));
  const tree = subagentTree("root", {});
  assert.equal(pillText(own, tree, t), "$4.7557");
  assert.equal(grandTotal(own, tree), "$4.7557");
  assert.equal(dialogRows(own, tree, t).length, 2);
  assert.equal(JSON.stringify(dialogRows(own, tree, t)).includes("~account:"), false);
});

test("normalized runs retain unknown calls, currency and provider boundaries without mutating facts", () => {
  const model = "gpt-6.1-sol";
  const own = view(modelRun(model, 1, 100),
    modelRun(accountModel("fixture", model), 0, 200, { amounts: [], unknownCalls: 1 }),
    modelRun(accountModel("fixture-other", model), 2, 300),
    modelRun(model, 4, 400, { amounts: [{ currency: "CNY", amount: 4 }] }),
    modelRun(model, 5, 500, { provider: "other" }));
  const before = structuredClone(own);
  const groups = displaySegments(own);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].calls, 3);
  assert.equal(groups[0].unknownCalls, 1);
  assert.equal(groups[0].firstTime, 100);
  assert.equal(groups[0].lastTime, 300);
  assert.equal(groups[0].usage.uncachedInputTokens, 3);
  assert.equal(pillText(own, subagentTree("root", {}), t), "$3.00 + -- + ¥4.00 + $5.00");
  assert.deepEqual(own, before);
});

test("real model switches remain ordered while same-model subagent costs join the normalized run", () => {
  const sol = "gpt-6.1-sol";
  const own = view(modelRun(sol, 1, 100), modelRun(accountModel("fixture-one", sol), 2, 200),
    modelRun("gpt-6-astra", 5, 300), modelRun(accountModel("fixture-two", sol), 3, 400));
  const projections = parent(own, [{ id: "a", createdAt: 250 }], child("a", 250, [["USD", 0.5]]));
  assert.equal(pillText(own, subagentTree("root", projections), t), "$3.50 + $5.00 + $3.00 ($0.50)");
  assert.equal(displaySegments(own).length, 3);
  assert.equal(grandTotal(own, subagentTree("root", projections)), "$11.50");
});

test("independent entries stay readable for child agents and unknown models without exposing account ids", () => {
  const own = view(modelRun(accountModel("private-fixture", "not-priced"), 0, 100, { amounts: [], unknownCalls: 2, rules: [] }));
  const rows = dialogRows(own, subagentTree("root", {}), t);
  assert.equal(rows[1].label, "codex/not-priced");
  assert.equal(rows[2].label, "2 次未定价，需在 prices.json 为 codex/not-priced 配价格");
  for (const invalid of ["~account:%broken:gpt-6.1-sol", "~account:private-fixture:"]) {
    const bad = view(modelRun(invalid, 0, 100, { amounts: [], unknownCalls: 1, rules: [] }));
    assert.equal(JSON.stringify(dialogRows(bad, subagentTree("root", {}), t)).includes("~account:"), false);
  }
  const projections = parent(view(modelRun("gpt-6.1-sol", 1, 100)), [{ id: "a", createdAt: 150 }], {
    a: { state: "ready", values: { sessionCost: view(modelRun(accountModel("private-fixture", "gpt-6.1-sol"), 2, 200)) } }
  });
  const childRows = dialogRows(projections.root.values.sessionCost, subagentTree("root", projections), t);
  assert.equal(JSON.stringify(childRows).includes("private-fixture"), false);
  assert.ok(childRows.some((row) => row.kind === "route" && row.label.startsWith("codex/gpt-6.1-sol")));
});

test("browser and host account-id parsers agree on canonical and malformed ids", () => {
  for (const model of ["gpt-6.1-sol", "youxia · GPT-6.1-Sol", "~account::gpt-6.1-sol", "~account:fixture:%broken",
    "~account:fixture%2faccount:gpt-6.1-sol", accountModel("工作:/%账号", "provider/Model:variant"),
    accountModel(JSON.stringify(["workspace-fixture", "user", "user-fixture"]), "gpt-6.1-sol")]) {
    assert.equal(clientModelId(model), pricingModelId(model));
  }
});

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

test("details panel: the main session, then each subagent, each with its model run", () => {
  const own = projections.root.values.sessionCost;
  const tree = subagentTree("root", projections);
  assert.equal(grandTotal(own, tree), "¥12.00 + $0.50");
  assert.deepEqual(plain(dialogRows(own, tree, t)), [
    { kind: "entry", label: "主会话", value: "¥10.00", spaced: false },
    { kind: "route", label: "p/m（r）", value: "" },
    { kind: "rule" },
    { kind: "entry", label: "调研", value: "¥2.00", spaced: false },
    { kind: "route", label: "p/m（r）", value: "" },
    { kind: "entry", label: "\u2003孙代理", value: "$0.50", spaced: true },
    { kind: "route", label: "\u2003p/m（r）", value: "" },
    { kind: "entry", label: "审查", value: "读取中", spaced: true }
  ]);
});

test("details panel: runs get their own amounts after a model switch; unpriced runs are flagged", () => {
  const own = view(run("CNY", 10, 100), { ...run("USD", 1, 200), model: "n", rules: [] });
  const solo = { root: { state: "ready", values: { sessionCost: own } } };
  assert.deepEqual(plain(dialogRows(own, subagentTree("root", solo), t)), [
    { kind: "entry", label: "主会话", value: "¥10.00 + $1.00", spaced: false },
    { kind: "route", label: "p/m（r）", value: "¥10.00" },
    { kind: "route", label: "p/n", value: "$1.00" }
  ]);
  const unpriced = cost([], 2, 2);
  assert.deepEqual(plain(dialogRows(unpriced, subagentTree("root", {}), t)), [
    { kind: "entry", label: "主会话", value: "--", spaced: false },
    { kind: "route", label: "p/m（r）", value: "" },
    { kind: "meta", label: "2 次未定价，需在 prices.json 为 p/m 配价格" }
  ]);
});
