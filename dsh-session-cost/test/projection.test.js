import test from "node:test";
import assert from "node:assert/strict";
import { createPricer, normalizePriceBook } from "../lib/pricing.js";
import { createSessionCostProjection } from "../lib/projection.js";

const time = (iso) => Date.parse(iso);
const usage = (inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0) => ({ inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens });
const message = (provider, model) => ({ source: { provider, model }, content: [], role: "assistant" });

function priceBook() {
  return createPricer({ book: normalizePriceBook({
    version: 2,
    timeZone: "Asia/Shanghai",
    models: [
      {
        match: ["p/a"],
        rules: [
          { name: "off-peak", currency: "CNY", input: 1, cacheRead: 0.25, cacheWrite: 1, output: 2, when: { intervals: [{ start: "16:30", end: "00:30" }] } },
          { name: "standard", currency: "CNY", input: 2, cacheRead: 0.5, cacheWrite: 2, output: 4 }
        ]
      },
      {
        match: ["p/b"],
        rules: [{ name: "usd", currency: "USD", input: 10, cacheRead: 1, cacheWrite: 10, output: 20 }]
      }
    ]
  }) });
}

function fold(events) {
  const projection = createSessionCostProjection(priceBook());
  let state = projection.init();
  for (const event of events) {
    state = projection.apply(state, event);
    projection.stateSchema.parse(state);
  }
  const value = projection.wire.view(state);
  projection.wire.viewSchema.parse(value);
  return value;
}

function event(seq, at, type, data) {
  return { seq, time: at, type, data };
}

function header(seq, at, model) {
  return event(seq, at, "request/header", { header: { config: { provider: "p", model } } });
}

function start(seq, at, turn = 1, step = 1) {
  return event(seq, at, "step/start", { turn, step });
}

function attempt(seq, at, sample, turn = 1, step = 1) {
  return event(seq, at, "assistant/attempt", { turn, step, stream: [{ type: "chunk", chunk: { type: "usage", usage: sample } }] });
}

function final(seq, at, model, sample, turn = 1, step = 1) {
  return event(seq, at, "assistant/message", { turn, step, usage: sample, stream: [], message: message("p", model) });
}

test("a final sample replaces the same attempt and model switches create ordered segments", () => {
  const value = fold([
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    attempt(2, time("2026-11-04T12:00:01+08:00"), usage(100, 5)),
    final(3, time("2026-11-04T12:00:02+08:00"), "a", usage(1_000_000, 100_000)),
    start(4, time("2026-11-04T12:01:00+08:00"), 1, 2),
    final(5, time("2026-11-04T12:01:02+08:00"), "b", usage(1_000_000, 100_000), 1, 2),
    header(6, time("2026-11-04T12:02:00+08:00"), "a"),
    start(7, time("2026-11-04T12:02:00+08:00"), 1, 3),
    final(8, time("2026-11-04T12:02:02+08:00"), "a", usage(500_000, 50_000), 1, 3)
  ]);
  assert.equal(value.totalCalls, 3);
  assert.equal(value.pricedCalls, 3);
  assert.deepEqual(value.segments.map((segment) => segment.model), ["a", "b", "a"]);
  assert.equal(value.segments[0].amounts[0].amount, 2.4);
  assert.equal(value.segments[1].amounts[0].amount, 12);
  assert.equal(value.segments[2].amounts[0].amount, 1.2);
});

test("retry-started starts a new billable attempt without duplicating stream samples", () => {
  const value = fold([
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    attempt(2, time("2026-11-04T12:00:01+08:00"), usage(100_000, 10_000)),
    event(3, time("2026-11-04T12:00:02+08:00"), "llm/retry-started", { turn: 1, step: 1 }),
    attempt(4, time("2026-11-04T12:00:03+08:00"), usage(200_000, 20_000)),
    final(5, time("2026-11-04T12:00:04+08:00"), "a", usage(300_000, 30_000))
  ]);
  assert.equal(value.totalCalls, 2);
  assert.equal(value.segments.length, 1);
  assert.equal(value.segments[0].calls, 2);
  assert.equal(value.segments[0].usage.uncachedInputTokens, 400_000);
  assert.equal(value.segments[0].amounts[0].amount, 0.96);
});

test("the price is selected at attempt start rather than response completion", () => {
  const value = fold([
    header(0, time("2026-11-04T00:29:00+08:00"), "a"),
    start(1, time("2026-11-04T00:29:00+08:00")),
    final(2, time("2026-11-04T00:31:00+08:00"), "a", usage(1_000_000, 100_000))
  ]);
  assert.equal(value.segments[0].rules[0], "off-peak");
  assert.equal(value.segments[0].amounts[0].amount, 1.2);
});

test("an unpriced route remains visible as unknown usage", () => {
  const value = fold([
    header(0, time("2026-11-04T12:00:00+08:00"), "not-in-price-book"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    attempt(2, time("2026-11-04T12:00:01+08:00"), usage(1234, 567))
  ]);
  assert.equal(value.totalCalls, 1);
  assert.equal(value.pricedCalls, 0);
  assert.equal(value.segments[0].unknownCalls, 1);
  assert.equal(value.segments[0].amounts.length, 0);
});

test("final message route is authoritative when it differs from the request header", () => {
  const value = fold([
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    attempt(2, time("2026-11-04T12:00:01+08:00"), usage(100, 10)),
    final(3, time("2026-11-04T12:00:02+08:00"), "b", usage(1_000_000, 100_000))
  ]);
  assert.equal(value.totalCalls, 1);
  assert.equal(value.segments[0].model, "b");
  assert.equal(value.segments[0].amounts[0].currency, "USD");
});

test("request metadata advances the pricing timestamp in real event order", () => {
  const value = fold([
    header(0, time("2026-11-04T00:28:00+08:00"), "a"),
    start(1, time("2026-11-04T00:29:00+08:00")),
    header(2, time("2026-11-04T00:31:00+08:00"), "a"),
    event(3, time("2026-11-04T00:31:30+08:00"), "request/context", { contextWindow: 1000000 }),
    final(4, time("2026-11-04T00:32:00+08:00"), "a", usage(1_000_000, 100_000))
  ]);
  assert.equal(value.segments[0].rules[0], "standard");
  assert.equal(value.segments[0].amounts[0].amount, 2.4);
});

test("wire view reprices restored log facts when the price book changes", () => {
  const first = createSessionCostProjection(priceBook());
  let state = first.init();
  for (const item of [
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    final(2, time("2026-11-04T12:00:02+08:00"), "a", usage(1_000_000, 100_000))
  ]) state = first.apply(state, item);
  const checkpoint = structuredClone(state);
  assert.equal(Object.hasOwn(checkpoint.attempts[0], "cost"), false);
  assert.equal(first.wire.view(checkpoint).segments[0].amounts[0].amount, 2.4);

  const updatedBook = createPricer({ book: normalizePriceBook({
    version: 2,
    models: [{ match: ["p/a"], rules: [{ name: "new-price", currency: "USD", input: 20, output: 40 }] }]
  }) });
  const second = createSessionCostProjection(updatedBook);
  assert.equal(second.stateVersion, 5);
  const repriced = second.wire.view(checkpoint);
  assert.equal(repriced.segments[0].amounts[0].currency, "USD");
  assert.equal(repriced.segments[0].amounts[0].amount, 24);
  assert.deepEqual(repriced.segments[0].rules, ["new-price"]);
});

test("irrelevant events and malformed usage do not change accounting", () => {
  const projection = createSessionCostProjection(priceBook());
  const initial = projection.init();
  const other = projection.apply(initial, event(0, 0, "tool/call", {}));
  assert.equal(other, initial);
  const invalid = projection.apply(initial, attempt(1, 1, { inputTokens: -1, outputTokens: 2 }));
  assert.equal(invalid, initial);
});

test("reasoning tokens are kept as log facts and shown per segment", () => {
  const value = fold([
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    final(2, time("2026-11-04T12:00:02+08:00"), "a", { ...usage(1000, 500, 9000), reasoningTokens: 200 })
  ]);
  assert.equal(value.segments[0].usage.reasoningTokens, 200);
  assert.equal(value.segments[0].usage.cacheReadTokens, 9000);
});

test("fork-inherited history is skipped so a parent total with subagents never counts it twice", () => {
  const projection = createSessionCostProjection(priceBook());
  let state = projection.init({}, 3);
  for (const item of [
    header(0, time("2026-11-04T12:00:00+08:00"), "a"),
    start(1, time("2026-11-04T12:00:00+08:00")),
    final(2, time("2026-11-04T12:00:02+08:00"), "a", usage(1_000_000, 100_000)),
    header(3, time("2026-11-04T12:05:00+08:00"), "b"),
    start(4, time("2026-11-04T12:05:00+08:00"), 2, 1),
    final(5, time("2026-11-04T12:05:02+08:00"), "b", usage(1_000_000, 100_000), 2, 1)
  ]) state = projection.apply(state, item);
  const value = projection.wire.view(projection.stateSchema.parse(state));
  assert.equal(value.totalCalls, 1);
  assert.deepEqual(value.segments.map((segment) => segment.model), ["b"]);
});
