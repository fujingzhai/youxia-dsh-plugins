import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createPricer, normalizePriceBook } from "../lib/pricing.js";
import { createSessionCostProjection } from "../lib/projection.js";

// Opt in with the installed DSH runtime; no personal profile, log I/O or requests.
test("installed DSH projection registry reprices a pre-fix independent-account checkpoint", {
  skip: process.env.DSH_FEE_RUNTIME_TEST !== "1", timeout: 15_000
}, async () => {
  assert(process.env.DSH_INSTALL_DIR, "DSH_INSTALL_DIR must identify the runtime under test");
  const require = createRequire(join(process.env.DSH_INSTALL_DIR, "package.json"));
  const load = (name) => import(pathToFileURL(require.resolve(name)));
  const { Context } = await load("@deepseek-ai/cordis");
  const projectionPlugin = await load("@deepseek-ai/dsh-session-projection");
  const root = new Context();
  let handle;
  try {
    await root.plugin(projectionPlugin.default ?? projectionPlugin);
    const provider = "codex";
    const model = `~account:${encodeURIComponent(JSON.stringify(["workspace-fixture", "user", "user-fixture"]))}:gpt-6.1-sol`;
    const legacy = createSessionCostProjection({ price: () => null });
    let state = legacy.init();
    for (const event of [
      { seq: 0, time: 0, type: "request/header", data: { header: { config: { provider, model } } } },
      { seq: 1, time: 0, type: "step/start", data: { turn: 1, step: 1 } },
      { seq: 2, time: 1, type: "assistant/message", data: { turn: 1, step: 1, stream: [],
        usage: { inputTokens: 1000, cacheReadTokens: 5000, outputTokens: 500 },
        message: { role: "assistant", source: { provider, model }, content: [] } } }
    ]) state = legacy.apply(state, event);
    assert.equal(legacy.wire.view(state).pricedCalls, 0);
    const checkpoint = { sessionCost: { ver: legacy.stateVersion, seq: 2, val: structuredClone(state) } };
    const pricer = createPricer({ book: normalizePriceBook({ version: 2, models: [{
      match: ["codex/gpt-6.1-sol"], rules: [{ currency: "USD", input: 2, cacheRead: 0.1, output: 10 }]
    }] }) });
    handle = await root.sessionProjections.register(createSessionCostProjection(pricer));
    const view = root.sessionProjections.viewCheckpoint(checkpoint).sessionCost;
    assert.equal(view.totalCalls, 1);
    assert.equal(view.pricedCalls, 1);
    assert.equal(view.segments[0].unknownCalls, 0);
    assert.equal(view.segments[0].amounts[0].amount, 0.0075);
    assert.equal(view.segments[0].model, model);
    assert.deepEqual(checkpoint.sessionCost.val, state);
  } finally {
    await handle?.dispose();
    await root.fiber.dispose();
  }
});
