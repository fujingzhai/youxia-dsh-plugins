import test from "node:test";
import assert from "node:assert/strict";
import { Config, normalizeConfig } from "../lib/config.js";

test("defaults need no configuration: price book first, DSH's own pi-ai as fallback", () => {
  const config = normalizeConfig(undefined);
  assert.equal(config.priceBook, "./prices.json");
  assert.equal(config.catalog.enabled, true);
  assert.deepEqual(config.catalog.sources, []);
  assert.equal(config.catalog.includeHost, true);
  assert.deepEqual(config.addReasoningToOutput, ["antigravity"]);
  assert.deepEqual(config.catalog.hints.codex, ["openai-codex", "openai"]);
});

test("DSH validates config through the Standard Schema interface and reports typos", () => {
  const ok = Config["~standard"].validate({ priceBook: "/abs/prices.json", catalog: { sources: ["/newer/pi-ai", "@earendil-works/pi-ai"] } });
  assert.equal(ok.issues, undefined);
  assert.equal(ok.value.priceBook, "/abs/prices.json");
  assert.deepEqual(ok.value.catalog.sources, ["/newer/pi-ai", "@earendil-works/pi-ai"]);
  assert.match(Config["~standard"].validate({ catalog: { sorces: [] } }).issues[0].message, /unknown key "sorces"/);
  assert.match(Config["~standard"].validate({ catalog: { enabled: "no" } }).issues[0].message, /true or false/);
  assert.match(Config["~standard"].validate({ addReasoningToOutput: [""] }).issues[0].message, /non-empty strings/);
});
