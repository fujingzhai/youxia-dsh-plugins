import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPricer, normalizePriceBook } from "../lib/pricing.js";

const route = { provider: "demo", model: "model-a" };
const usage = {
  uncachedInputTokens: 1_000_000,
  cacheReadTokens: 1_000_000,
  cacheWriteTokens: 500_000,
  outputTokens: 250_000,
  reasoningTokens: 0
};

function book(rules, extra = {}, match = [`${route.provider}/${route.model}`]) {
  return normalizePriceBook({
    version: 2,
    timeZone: "Asia/Shanghai",
    models: [{ match, rules }],
    ...extra
  });
}

function rule(overrides = {}) {
  return {
    name: "base",
    currency: "CNY",
    input: 4,
    cacheRead: 1,
    cacheWrite: 4,
    output: 8,
    ...overrides
  };
}

const at = (iso) => Date.parse(iso);
const price = (pricedBook, target, sample, iso, options = {}) => createPricer({ book: pricedBook, ...options }).price(target, sample, at(iso));

test("distributed and example price books are valid", () => {
  for (const filename of ["prices.json", "prices.example.json"]) {
    const json = JSON.parse(readFileSync(new URL(`../${filename}`, import.meta.url), "utf8"));
    assert.equal(normalizePriceBook(json).version, 2);
  }
});

test("prices all disjoint token buckets per million tokens", () => {
  const priced = price(book([rule()]), route, usage, "2026-11-04T12:00:00+08:00");
  assert.deepEqual(priced, { currency: "CNY", amount: 9, rule: "base", source: "book" });
});

test("missing model, rule, or a required non-zero bucket price is unknown", () => {
  const pricedBook = book([rule({ cacheRead: void 0 })]);
  assert.equal(price(pricedBook, route, usage, "2026-11-04T12:00:00+08:00"), null);
  assert.equal(price(pricedBook, route, { ...usage, cacheReadTokens: 0 }, "2026-11-04T12:00:00+08:00").amount, 8);
  assert.equal(price(pricedBook, { provider: "other", model: "other" }, usage, "2026-11-04T12:00:00+08:00"), null);
  assert.equal(price(book([]), route, usage, "2026-11-04T12:00:00+08:00"), null);
});

test("zero is a real price, not missing pricing", () => {
  const priced = price(book([rule({ input: 0, cacheRead: 0, cacheWrite: 0, output: 0 })]), route, usage, "2026-11-04T12:00:00+08:00");
  assert.equal(priced.amount, 0);
});

test("one entry serves several routes, case-insensitively, with provider and model wildcards", () => {
  const pricedBook = book([rule()], {}, ["qoder/dfmodel", "*/deepseek-flash", "relay/grok-4.20*"]);
  const when = "2026-11-04T12:00:00+08:00";
  assert.equal(price(pricedBook, { provider: "qoder", model: "dfmodel" }, usage, when).amount, 9);
  assert.equal(price(pricedBook, { provider: "some-relay", model: "DeepSeek-Flash" }, usage, when).amount, 9);
  assert.equal(price(pricedBook, { provider: "relay", model: "grok-4.20-0309-reasoning" }, usage, when).amount, 9);
  assert.equal(price(pricedBook, { provider: "other", model: "grok-4.20-0309-reasoning" }, usage, when), null);
});

test("exact routes beat wildcard routes regardless of file order", () => {
  const pricedBook = normalizePriceBook({
    version: 2,
    models: [
      { match: ["*/shared"], rules: [rule({ name: "generic" })] },
      { match: ["special/shared"], rules: [rule({ name: "special" })] }
    ]
  });
  assert.equal(price(pricedBook, { provider: "special", model: "shared" }, usage, "2026-11-04T12:00:00+08:00").rule, "special");
  assert.equal(price(pricedBook, { provider: "else", model: "shared" }, usage, "2026-11-04T12:00:00+08:00").rule, "generic");
});

const accountModel = (account, model) => `~account:${encodeURIComponent(account)}:${encodeURIComponent(model)}`;

test("independent account entries use their underlying model's shipped prices without rewriting routes", () => {
  const shipped = normalizePriceBook(JSON.parse(readFileSync(new URL("../prices.json", import.meta.url), "utf8")));
  const pricer = createPricer({ book: shipped });
  const when = at("2026-11-13T12:00:00+08:00");
  const samples = [
    { uncachedInputTokens: 1000, cacheReadTokens: 5000, cacheWriteTokens: 0, outputTokens: 500, reasoningTokens: 100 },
    { uncachedInputTokens: 100_000, cacheReadTokens: 200_000, cacheWriteTokens: 1000, outputTokens: 10_000, reasoningTokens: 5000 }
  ];
  for (const [provider, model] of [
    ["codex", "gpt-6.1-sol"], ["codex", "gpt-6-astra"], ["claude", "claude-opus-5.5"],
    ["grok", "grok-4.7"], ["antigravity", "gemini-4-carbon"], ["copilot", "gpt-6.1-sol"]
  ]) {
    for (const account of [JSON.stringify(["workspace-fixture", "user", "user-fixture"]), "person+test@example.invalid", "工作账号:/%测试"]) {
      const wrapped = Object.freeze({ provider, model: accountModel(account, model) });
      for (const sample of samples) {
        const expected = pricer.price({ provider, model }, sample, when);
        assert.notEqual(expected, null, model);
        assert.deepEqual(pricer.price(wrapped, sample, when), expected, `${provider}/${model}`);
        assert.equal(wrapped.model, accountModel(account, model));
      }
    }
  }
});

test("literal account-specific prices take precedence over underlying model prices", () => {
  const model = accountModel("fixture-account", "shared");
  const pricedBook = normalizePriceBook({ version: 2, models: [
    { match: ["codex/shared"], rules: [rule({ name: "base-exact" })] },
    { match: ["*/shared"], rules: [rule({ name: "base-wildcard" })] },
    { match: [`*/${model}`], rules: [rule({ name: "account-wildcard" })] },
    { match: [`codex/${model}`], rules: [rule({ name: "account-exact" })] }
  ] });
  const when = "2026-11-13T12:00:00+08:00";
  assert.equal(price(pricedBook, { provider: "codex", model }, usage, when).rule, "account-exact");
  assert.equal(price(pricedBook, { provider: "other", model }, usage, when).rule, "account-wildcard");
  const otherAccount = accountModel("other-account", "shared");
  assert.equal(price(pricedBook, { provider: "codex", model: otherAccount }, usage, when).rule, "base-exact");
  assert.equal(price(pricedBook, { provider: "other", model: otherAccount }, usage, when).rule, "base-wildcard");
});

test("account routes retain provider matching and do not guess display aliases or malformed wrappers", () => {
  const pricedBook = book([rule()], {}, ["codex/gpt-6.1-sol"]);
  const when = "2026-11-13T12:00:00+08:00";
  assert.equal(price(pricedBook, { provider: "other", model: accountModel("fixture", "gpt-6.1-sol") }, usage, when), null);
  for (const model of ["youxia-GPT-6.1-Sol", "~account::gpt-6.1-sol", "~account:fixture:", "~account:%broken:gpt-6.1-sol", "~account:fixture:gpt-6.1-sol:extra"]) {
    assert.equal(price(pricedBook, { provider: "codex", model }, usage, when), null, model);
  }
});

test("long-context tiers switch every bucket once the prompt exceeds the threshold", () => {
  const pricedBook = book([rule({ input: 2, cacheRead: 0.2, cacheWrite: 0, output: 10, currency: "USD", tiers: [{ above: 272000, input: 4, cacheRead: 0.4, output: 15 }] })]);
  const small = { uncachedInputTokens: 72_000, cacheReadTokens: 200_000, cacheWriteTokens: 0, outputTokens: 10_000, reasoningTokens: 0 };
  const large = { ...small, uncachedInputTokens: 72_001 };
  const base = price(pricedBook, route, small, "2026-11-04T12:00:00+08:00");
  assert.equal(base.rule, "base");
  assert.equal(Number(base.amount.toFixed(6)), Number((0.072 * 2 + 0.2 * 0.2 + 0.01 * 10).toFixed(6)));
  const tiered = price(pricedBook, route, large, "2026-11-04T12:00:00+08:00");
  assert.equal(tiered.rule, "base · >272K");
  assert.equal(Number(tiered.amount.toFixed(6)), Number((0.072001 * 4 + 0.2 * 0.4 + 0.01 * 15).toFixed(6)));
});

test("a threshold of 199999 reads as from 200K on", () => {
  const pricedBook = book([rule({ tiers: [{ above: 199_999, input: 8 }] })]);
  const sample = { uncachedInputTokens: 200_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  assert.equal(price(pricedBook, route, sample, "2026-11-04T12:00:00+08:00").rule, "base · ≥200K");
});

test("reasoning is added to output only for providers that report it separately", () => {
  const pricedBook = book([rule({ input: 0, cacheRead: 0, cacheWrite: 0, output: 10 })], {}, ["*/m"]);
  const sample = { uncachedInputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 100_000, reasoningTokens: 50_000 };
  const options = { addReasoningToOutput: ["antigravity"] };
  assert.equal(price(pricedBook, { provider: "codex", model: "m" }, sample, "2026-11-04T12:00:00+08:00", options).amount, 1);
  assert.equal(price(pricedBook, { provider: "antigravity", model: "m" }, sample, "2026-11-04T12:00:00+08:00", options).amount, 1.5);
});

test("catalog fallback prices routes the book does not cover, and catalog aliases borrow its prices", () => {
  const catalogRule = { name: "pi-ai · xai/grok-4.7", currency: "USD", unit: 1_000_000, input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0, tiers: [], when: null };
  const catalog = {
    find: (provider, model) => provider === "grok" && model === "grok-4.7" ? { provider: "xai", rule: catalogRule } : null,
    lookup: (provider, model) => provider === "xai" && model === "grok-4.7" ? { provider: "xai", rule: catalogRule } : null
  };
  const pricedBook = normalizePriceBook({ version: 2, models: [{ name: "Alias", match: ["odd/grok-latest"], catalog: "xai/grok-4.7" }] });
  const pricer = createPricer({ book: pricedBook, catalog });
  const sample = { uncachedInputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  assert.deepEqual(pricer.price({ provider: "grok", model: "grok-4.7" }, sample, 0), { currency: "USD", amount: 2, rule: "pi-ai · xai/grok-4.7", source: "catalog" });
  assert.equal(pricer.price({ provider: "odd", model: "grok-latest" }, sample, 0).rule, "Alias → pi-ai · xai/grok-4.7");
  assert.equal(pricer.price({ provider: "nobody", model: "nothing" }, sample, 0), null);
});

test("independent account routes use catalog fallback and underlying price-book aliases", () => {
  const catalogRule = { name: "pi-ai · xai/grok-fixture", currency: "USD", unit: 1_000_000, input: 2, output: 6, cacheRead: 0.5, cacheWrite: 0, tiers: [], when: null };
  const catalog = {
    find: (provider, model) => provider === "grok" && model === "grok-fixture" ? { provider: "xai", rule: catalogRule } : null,
    lookup: (provider, model) => provider === "xai" && model === "grok-fixture" ? { provider: "xai", rule: catalogRule } : null
  };
  const pricedBook = normalizePriceBook({ version: 2, models: [{ name: "Alias", match: ["odd/grok-latest"], catalog: "xai/grok-fixture" }] });
  const pricer = createPricer({ book: pricedBook, catalog });
  const sample = { uncachedInputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  assert.equal(pricer.price({ provider: "grok", model: accountModel("fixture", "grok-fixture") }, sample, 0)?.amount, 2);
  assert.equal(pricer.price({ provider: "odd", model: accountModel("fixture", "grok-latest") }, sample, 0)?.rule, "Alias → pi-ai · xai/grok-fixture");
  assert.equal(pricer.price({ provider: "grok", model: accountModel("fixture", "unknown-model") }, sample, 0), null);
});

test("limited price uses inclusive from and exclusive to, with first match winning", () => {
  const pricedBook = book([
    rule({
      name: "promotion",
      input: 1,
      cacheRead: 0.25,
      cacheWrite: 1,
      output: 2,
      when: { from: "2026-11-01T00:00:00+08:00", to: "2026-12-01T00:00:00+08:00" }
    }),
    rule()
  ]);
  assert.equal(price(pricedBook, route, usage, "2026-10-31T23:59:59+08:00").rule, "base");
  assert.equal(price(pricedBook, route, usage, "2026-11-01T00:00:00+08:00").rule, "promotion");
  assert.equal(price(pricedBook, route, usage, "2026-12-01T00:00:00+08:00").rule, "base");
});

test("overnight off-peak interval crosses midnight and excludes its end", () => {
  const pricedBook = book([
    rule({ name: "off-peak", when: { intervals: [{ start: "16:30", end: "00:30" }] } }),
    rule({ name: "peak", input: 8 })
  ]);
  assert.equal(price(pricedBook, route, usage, "2026-11-04T16:29:00+08:00").rule, "peak");
  assert.equal(price(pricedBook, route, usage, "2026-11-04T16:30:00+08:00").rule, "off-peak");
  assert.equal(price(pricedBook, route, usage, "2026-11-05T00:29:00+08:00").rule, "off-peak");
  assert.equal(price(pricedBook, route, usage, "2026-11-05T00:30:00+08:00").rule, "peak");
});

test("weekday filter on an overnight interval belongs to the interval's start date", () => {
  const pricedBook = book([
    rule({ name: "friday-off-peak", when: { weekdays: [5], intervals: [{ start: "16:30", end: "00:30" }] } }),
    rule({ name: "base" })
  ]);
  assert.equal(price(pricedBook, route, usage, "2026-11-06T23:00:00+08:00").rule, "friday-off-peak");
  assert.equal(price(pricedBook, route, usage, "2026-11-07T00:15:00+08:00").rule, "friday-off-peak");
  assert.equal(price(pricedBook, route, usage, "2026-11-07T23:00:00+08:00").rule, "base");
  assert.equal(price(pricedBook, route, usage, "2026-11-09T00:15:00+08:00").rule, "base");
});

test("date ranges and @date-set references work in dates and excludeDates", () => {
  const pricedBook = book([
    rule({ name: "holiday", when: { dates: ["@golden-week", "2026-12-25"], excludeDates: ["2026-10-02"] } }),
    rule({ name: "base" })
  ], { dateSets: { "golden-week": ["2026-10-01..2026-10-07"] } });
  assert.equal(price(pricedBook, route, usage, "2026-10-01T12:00:00+08:00").rule, "holiday");
  assert.equal(price(pricedBook, route, usage, "2026-10-02T12:00:00+08:00").rule, "base");
  assert.equal(price(pricedBook, route, usage, "2026-10-07T23:59:00+08:00").rule, "holiday");
  assert.equal(price(pricedBook, route, usage, "2026-10-08T00:00:00+08:00").rule, "base");
  assert.equal(price(pricedBook, route, usage, "2026-12-25T08:00:00+08:00").rule, "holiday");
});

test("the shipped DeepSeek rules follow the official weekday peak hours and skip holidays", () => {
  const shipped = normalizePriceBook(JSON.parse(readFileSync(new URL("../prices.json", import.meta.url), "utf8")));
  const flash = { provider: "dsh-provider-qoder", model: "dfmodel" };
  const sample = { uncachedInputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0, reasoningTokens: 0 };
  assert.equal(price(shipped, flash, sample, "2026-11-04T10:00:00+08:00").amount, 2);
  assert.equal(price(shipped, flash, sample, "2026-11-04T12:30:00+08:00").amount, 1);
  assert.equal(price(shipped, flash, sample, "2026-11-04T17:59:00+08:00").amount, 2);
  assert.equal(price(shipped, flash, sample, "2026-11-07T10:00:00+08:00").amount, 1);
  assert.equal(price(shipped, flash, sample, "2026-10-05T10:00:00+08:00").amount, 1);
  assert.equal(price(shipped, { provider: "some-relay", model: "deepseek-flash" }, sample, "2026-11-04T10:00:00+08:00").amount, 2);
});

test("the shipped Google rules price every global bucket across promotional boundaries", () => {
  const shipped = normalizePriceBook(JSON.parse(readFileSync(new URL("../prices.json", import.meta.url), "utf8")));
  const sample = { uncachedInputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 1_000_000, reasoningTokens: 0 };
  for (const model of ["gemini-4-carbon", "gemini-4-argon"]) {
    assert.equal(price(shipped, { provider: "google-vertex", model }, sample, "2026-11-30T23:59:00+08:00").amount, 12.1);
    assert.equal(price(shipped, { provider: "google-vertex", model }, sample, "2026-12-01T00:00:00+08:00").amount, 24.2);
  }
  assert.equal(price(shipped, { provider: "google-vertex", model: "gemini-4-hydrogen" }, sample, "2027-01-11T23:59:00+08:00").amount, 9.075);
  assert.equal(price(shipped, { provider: "google-vertex", model: "gemini-4-hydrogen" }, sample, "2027-01-12T00:00:00+08:00").amount, 10.95);
  assert.equal(price(shipped, { provider: "google-vertex", model: "gemini-3.8-flash" }, sample, "2026-12-31T23:59:00+08:00").amount, 4.575);
  assert.equal(price(shipped, { provider: "google-vertex", model: "gemini-3.8-flash" }, sample, "2027-01-01T00:00:00+08:00").amount, 9.15);
});

test("rules inherit the price book's time zone", () => {
  const pricedBook = book([
    rule({ name: "working-hour", when: { intervals: [{ start: "09:00", end: "10:00" }] } }),
    rule({ name: "base" })
  ], { timeZone: "America/New_York" });
  assert.equal(price(pricedBook, route, usage, "2026-07-01T13:00:00Z").rule, "working-hour");
  assert.equal(price(pricedBook, route, usage, "2026-07-01T14:00:00Z").rule, "base");
});

test("invalid price books fail early", () => {
  assert.throws(() => normalizePriceBook({ version: 1, models: [] }), /version 1 is no longer supported/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: ["a/b"], rules: [] }, { match: ["A/B"], rules: [] }] }), /already claimed/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: [], rules: [] }] }), /at least one route/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: ["no-slash"], rules: [] }] }), /provider\/model/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: ["a*/b"], rules: [] }] }), /exact or "\*"/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: ["a/b"] }] }), /exactly one of/);
  assert.throws(() => normalizePriceBook({ version: 2, models: [{ match: ["a/b"], catalog: "*/x" }] }), /wildcards are not allowed/);
  assert.throws(() => book([rule({ when: { dates: ["2026-02-30"] } })]), /invalid calendar date/);
  assert.throws(() => book([rule({ when: { dates: ["2026-03-02..2026-03-01"] } })]), /earlier than its start/);
  assert.throws(() => book([rule({ when: { excludeDates: ["@missing"] } })]), /unknown date set/);
  assert.throws(() => book([rule({ tiers: [{ above: 0, input: 1 }] })]), /positive integer/);
  assert.throws(() => book([rule({ tiers: [{ above: 10, input: 1 }, { above: 10, input: 2 }] })]), /duplicate tier/);
  assert.throws(() => book([rule({ when: { intervals: [{ start: "10:00", end: "10:00" }] } })]), /start and end must differ/);
  assert.throws(() => book([rule({ when: { from: "2026-11-01" } })]), /explicit offset/);
  assert.throws(() => book([rule({ when: { from: "2026-02-30T00:00:00Z" } })]), /invalid calendar date/);
  assert.throws(() => book([rule({ when: { interval: [{ start: "16:30", end: "00:30" }] } })]), /unknown key "interval"/);
  assert.throws(() => book([rule({ when: { timezone: "Asia/Shanghai" } })]), /unknown key "timezone"/);
  assert.throws(() => book([rule()], { timeZone: "Not/A_Zone" }), /unknown IANA time zone/);
});
