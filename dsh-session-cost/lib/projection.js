// Minimal validators with the `.parse()` DSH's projection registry calls; no
// runtime dependency. Restored checkpoints that fail them are re-folded.
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const amount = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value) => typeof value === "string";
const nullable = (check) => (value) => value === null || check(value);
const list = (check) => (value) => Array.isArray(value) && value.every(check);
const shape = (fields) => (value) => typeof value === "object" && value !== null && !Array.isArray(value)
  && Object.entries(fields).every(([key, check]) => check(value[key]));

function schema(name, check) {
  return {
    parse(value) {
      if (!check(value)) throw new TypeError(`Invalid session-cost ${name}`);
      return value;
    }
  };
}

const route = shape({ provider: text, model: text });
const usage = shape({
  uncachedInputTokens: count,
  outputTokens: count,
  cacheReadTokens: count,
  cacheWriteTokens: count,
  reasoningTokens: count
});
const attemptShape = shape({
  turn: count,
  step: count,
  firstSeq: count,
  lastSeq: count,
  startTime: amount,
  route: nullable(route),
  usage
});

const stateSchema = schema("state", shape({
  inherited: count,
  attempts: list(attemptShape),
  route: nullable(route),
  open: nullable(shape({ turn: count, step: count, startTime: amount })),
  current: nullable(shape({ index: count, turn: count, step: count }))
}));

const viewSchema = schema("view", shape({
  totalCalls: count,
  pricedCalls: count,
  segments: list(shape({
    provider: text,
    model: text,
    calls: count,
    unknownCalls: count,
    firstTime: amount,
    lastTime: amount,
    usage,
    amounts: list(shape({ currency: text, amount })),
    rules: list(text)
  }))
}));

const zeroUsage = () => ({
  uncachedInputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0
});

function sameRoute(left, right) {
  return left === right || left !== null && right !== null && left.provider === right.provider && left.model === right.model;
}

function headerRoute(event) {
  const config = event.data.header?.config;
  if (typeof config?.provider !== "string" || typeof config?.model !== "string" || config.provider === "" || config.model === "") return null;
  return { provider: config.provider, model: config.model };
}

function messageRoute(event) {
  if (event.type !== "assistant/message") return null;
  const source = event.data.message?.source;
  if (typeof source?.provider !== "string" || typeof source?.model !== "string" || source.provider === "" || source.model === "") return null;
  return { provider: source.provider, model: source.model };
}

function lastUsageChunk(stream) {
  if (!Array.isArray(stream)) return null;
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index];
    if (record?.type === "chunk" && record.chunk?.type === "usage") return record.chunk.usage;
  }
  return null;
}

function usageOf(event) {
  if (event.type === "assistant/message" && event.data.usage !== void 0) return event.data.usage;
  if (event.type !== "assistant/message" && event.type !== "assistant/attempt") return null;
  return lastUsageChunk(event.data.stream);
}

function bucketsOf(sample) {
  if (typeof sample !== "object" || sample === null || !count(sample.inputTokens) || !count(sample.outputTokens)) return null;
  if (sample.cacheReadTokens !== void 0 && !count(sample.cacheReadTokens)) return null;
  if (sample.cacheWriteTokens !== void 0 && !count(sample.cacheWriteTokens)) return null;
  if (sample.reasoningTokens !== void 0 && !count(sample.reasoningTokens)) return null;
  // DSH usage buckets are disjoint: inputTokens already excludes cache reads/writes.
  return {
    uncachedInputTokens: sample.inputTokens,
    outputTokens: sample.outputTokens,
    cacheReadTokens: sample.cacheReadTokens ?? 0,
    cacheWriteTokens: sample.cacheWriteTokens ?? 0,
    reasoningTokens: sample.reasoningTokens ?? 0
  };
}

/** Build a projection definition closed over one pricer (price book + catalog). */
export function createSessionCostProjection(pricer) {
  function attempt(event, route, usage, startTime) {
    return {
      turn: event.data.turn,
      step: event.data.step,
      firstSeq: event.seq,
      lastSeq: event.seq,
      startTime,
      route,
      usage
    };
  }

  function applyUsage(state, event) {
    const usage = bucketsOf(usageOf(event));
    if (usage === null || !count(event.data.turn) || !count(event.data.step)) return state;
    const current = state.current;
    const route = messageRoute(event) ?? state.route;
    if (current !== null && current.turn === event.data.turn && current.step === event.data.step) {
      const previous = state.attempts[current.index];
      if (previous === void 0) return state;
      const nextRoute = route ?? previous.route;
      const replacement = {
        ...previous,
        lastSeq: event.seq,
        route: nextRoute,
        usage
      };
      const attempts = state.attempts.slice();
      attempts[current.index] = replacement;
      return { ...state, attempts };
    }
    const open = state.open;
    const startTime = open !== null && open.turn === event.data.turn && open.step === event.data.step ? open.startTime : event.time;
    const next = attempt(event, route, usage, startTime);
    return {
      ...state,
      attempts: [...state.attempts, next],
      current: { index: state.attempts.length, turn: next.turn, step: next.step }
    };
  }

  function view(state) {
    const segments = [];
    let pricedCalls = 0;
    for (const item of state.attempts) {
      const provider = item.route?.provider ?? "";
      const model = item.route?.model ?? "";
      let segment = segments.at(-1);
      if (segment === void 0 || segment.provider !== provider || segment.model !== model) {
        segment = {
          provider,
          model,
          calls: 0,
          unknownCalls: 0,
          firstTime: item.startTime,
          lastTime: item.startTime,
          usage: zeroUsage(),
          amounts: [],
          rules: []
        };
        segments.push(segment);
      }
      segment.calls += 1;
      segment.lastTime = item.startTime;
      for (const key of Object.keys(segment.usage)) segment.usage[key] += item.usage[key];
      // Cost is deliberately derived at the wire boundary. Projection checkpoints
      // contain only log facts, so a new price book reprices the whole history.
      const cost = item.route === null ? null : pricer.price(item.route, item.usage, item.startTime);
      if (cost === null) {
        segment.unknownCalls += 1;
        continue;
      }
      pricedCalls += 1;
      let amount = segment.amounts.find((entry) => entry.currency === cost.currency);
      if (amount === void 0) {
        amount = { currency: cost.currency, amount: 0 };
        segment.amounts.push(amount);
      }
      amount.amount += cost.amount;
      if (!segment.rules.includes(cost.rule)) segment.rules.push(cost.rule);
    }
    return { totalCalls: state.attempts.length, pricedCalls, segments };
  }

  return {
    key: "sessionCost",
    stateVersion: 5,
    stateSchema,
    // Forks (branches, fork subagents) start with a copy of the parent's log.
    // Those inherited calls were paid in the parent, so they are skipped here;
    // otherwise a parent total that includes its subagents would count them twice.
    init: (_header, inheritedEventCount) => ({
      inherited: Number.isSafeInteger(inheritedEventCount) && inheritedEventCount > 0 ? inheritedEventCount : 0,
      attempts: [],
      route: null,
      open: null,
      current: null
    }),
    apply: (state, event) => {
      if (event.seq < state.inherited) return state;
      switch (event.type) {
        case "request/header": {
          const route = headerRoute(event);
          const open = state.open !== null && state.current === null ? { ...state.open, startTime: event.time } : state.open;
          return sameRoute(state.route, route) && open === state.open ? state : { ...state, route, open };
        }
        case "request/context":
          if (state.open === null || state.current !== null) return state;
          return { ...state, open: { ...state.open, startTime: event.time } };
        case "step/start":
          return {
            ...state,
            open: { turn: event.data.turn, step: event.data.step, startTime: event.time },
            current: null
          };
        case "llm/retry-started": {
          const matches = state.current?.turn === event.data.turn && state.current?.step === event.data.step || state.open?.turn === event.data.turn && state.open?.step === event.data.step;
          if (!matches) return state;
          return {
            ...state,
            open: state.open === null ? null : { ...state.open, startTime: event.time },
            current: null
          };
        }
        case "step/end":
          if (state.open === null && state.current === null) return state;
          return { ...state, open: null, current: null };
        case "assistant/attempt":
        case "assistant/message":
          return applyUsage(state, event);
        default:
          return state;
      }
    },
    wire: { viewSchema, view }
  };
}
