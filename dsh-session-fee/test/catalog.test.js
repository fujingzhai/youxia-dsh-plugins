import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, modelIdVariants } from "../lib/catalog.js";

const created = [];
after(() => {
  for (const root of created) rmSync(root, { recursive: true, force: true });
});

function fakePiAi(version, providers) {
  const root = mkdtempSync(join(tmpdir(), "session-cost-catalog-"));
  created.push(root);
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-ai", version }));
  const data = join(root, "dist", "providers", "data");
  mkdirSync(data, { recursive: true });
  for (const [provider, models] of Object.entries(providers)) {
    const group = {};
    for (const model of models) group[`chat:${model.id}`] = { type: "chat", provider, ...model };
    writeFileSync(join(data, `${provider}.json`), JSON.stringify({ "some-api": group }));
  }
  return root;
}

const gpt = (input) => ({ id: "gpt-6.1-sol", cost: { input, output: 10, cacheRead: 0.1, cacheWrite: 2.5, tiers: [{ inputTokensAbove: 272000, input: input * 2, output: 15, cacheRead: 0.2, cacheWrite: 5 }] } });

test("earlier sources win, tiers are carried over, and missing sources are reported", () => {
  const newer = fakePiAi("1.5.0", { "openai-codex": [gpt(2)] });
  const older = fakePiAi("1.1.0", { "openai-codex": [gpt(3), { id: "gpt-6-sol", cost: { input: 2, output: 10 } }] });
  const catalog = loadCatalog({ sources: [newer, older, "/does/not/exist"], includeHost: false });
  assert.equal(catalog.sources.length, 2);
  assert.equal(catalog.errors.length, 1);
  const hit = catalog.find("codex", "gpt-6.1-sol");
  assert.equal(hit.rule.name, "pi-ai 1.5.0 · openai-codex/gpt-6.1-sol");
  assert.equal(hit.rule.input, 2);
  assert.deepEqual(hit.rule.tiers, [{ above: 272000, input: 4, output: 15, cacheRead: 0.2, cacheWrite: 5 }]);
  assert.equal(catalog.find("codex", "gpt-6-sol").rule.name, "pi-ai 1.1.0 · openai-codex/gpt-6-sol");
});

test("provider hints go first, then the general list; all-zero prices and Chinese vendors are skipped", () => {
  const root = fakePiAi("1.5.0", {
    xai: [{ id: "grok-4.7", cost: { input: 2, output: 6, cacheRead: 0.5 } }],
    "github-copilot": [{ id: "grok-4.7", cost: { input: 9, output: 9 } }, { id: "free-model", cost: { input: 0, output: 0 } }],
    deepseek: [{ id: "deepseek-flash", cost: { input: 0.3, output: 1.2 } }]
  });
  const catalog = loadCatalog({ sources: [root], includeHost: false });
  assert.equal(catalog.find("grok", "grok-4.7").provider, "xai");
  assert.equal(catalog.find("copilot", "grok-4.7").provider, "github-copilot");
  assert.equal(catalog.find("some-relay", "GROK-4.7").provider, "xai");
  assert.equal(catalog.find("copilot", "free-model"), null);
  assert.equal(catalog.find("dsh-provider-qoder", "deepseek-flash"), null);
});

test("model id variants cover prefixes, thinking suffixes and Claude version punctuation", () => {
  assert.deepEqual(modelIdVariants("openai/GPT-5"), ["openai/gpt-5", "gpt-5"]);
  assert.ok(modelIdVariants("claude-opus-4-6-thinking").includes("claude-opus-4-6"));
  assert.ok(modelIdVariants("claude-sonnet-4.5").includes("claude-sonnet-4-5"));
  assert.ok(modelIdVariants("claude-sonnet-4-5").includes("claude-sonnet-4.5"));
});

test("catalog fallback unwraps independent account entries before applying model variants", () => {
  const account = encodeURIComponent(JSON.stringify(["workspace-fixture", "user", "user-fixture"]));
  const wrap = (model) => `~account:${account}:${encodeURIComponent(model)}`;
  const root = fakePiAi("1.5.0", { "openai-codex": [gpt(2)] });
  const catalog = loadCatalog({ sources: [root], includeHost: false });
  assert.deepEqual(catalog.find("codex", wrap("gpt-6.1-sol")), catalog.find("codex", "gpt-6.1-sol"));
  assert.deepEqual(modelIdVariants(wrap("openai/GPT-6.1-Sol")), [
    wrap("openai/GPT-6.1-Sol").toLowerCase(), "openai/gpt-6.1-sol", "gpt-6.1-sol"
  ]);
  assert.ok(modelIdVariants(wrap("claude-sonnet-4.5-thinking")).includes("claude-sonnet-4-5"));
  assert.equal(catalog.find("codex", wrap("unknown-model")), null);
});
