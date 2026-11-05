const DEFAULT_TIME_ZONE = "Asia/Shanghai";
const DEFAULT_UNIT = 1_000_000;
const PRICE_KEYS = ["input", "output", "cacheRead", "cacheWrite"];
const localFormatters = new Map();
const globCache = new Map();

function fail(path, message) {
  throw new Error(`Invalid session-cost price book at ${path}: ${message}`);
}

function object(value, path, allowedKeys = null) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "expected an object");
  if (allowedKeys !== null) {
    const allowed = new Set(allowedKeys);
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail(path, `unknown key "${key}"`);
  }
  return value;
}

function text(value, path) {
  if (typeof value !== "string" || value.trim() === "") fail(path, "expected a non-empty string");
  return value.trim();
}

function number(value, path, optional = false) {
  if (value === void 0 && optional) return void 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) fail(path, "expected a finite non-negative number");
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value;
}

function validDate(value, path) {
  const source = text(value, path);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(source);
  if (match === null) fail(path, "expected YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) fail(path, "invalid calendar date");
  return source;
}

function instant(value, path) {
  const source = text(value, path);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/.exec(source);
  if (match === null) fail(path, "expected YYYY-MM-DDTHH:mm:ss with Z or an explicit offset");
  validDate(match[1], path);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = match[4] === void 0 ? 0 : Number(match[4]);
  if (hour > 23 || minute > 59 || second > 59) fail(path, "invalid ISO time of day");
  if (match[5] !== "Z") {
    const offset = /^[+-](\d{2}):(\d{2})$/.exec(match[5]);
    if (Number(offset[1]) > 23 || Number(offset[2]) > 59) fail(path, "invalid ISO offset");
  }
  const milliseconds = Date.parse(source);
  if (!Number.isFinite(milliseconds)) fail(path, "invalid ISO date-time");
  return milliseconds;
}

function clock(value, path, allowEndOfDay = false) {
  const source = text(value, path);
  if (allowEndOfDay && source === "24:00") return 1440;
  const match = /^(\d{2}):(\d{2})$/.exec(source);
  if (match === null) fail(path, "expected HH:mm");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) fail(path, "invalid local time");
  return hour * 60 + minute;
}

function timeZone(value, path) {
  const zone = value === void 0 ? DEFAULT_TIME_ZONE : text(value, path);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(0);
  } catch {
    fail(path, `unknown IANA time zone ${zone}`);
  }
  return zone;
}

/** "YYYY-MM-DD" or "YYYY-MM-DD..YYYY-MM-DD" → one inclusive [start, end] range. */
function dateRange(value, path) {
  const source = text(value, path);
  const [start, end = start, extra] = source.split("..");
  if (extra !== void 0) fail(path, "expected YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD");
  validDate(start, path);
  validDate(end, path);
  if (end < start) fail(path, "range end is earlier than its start");
  return [start, end];
}

function normalizeDateSets(input) {
  const sets = new Map();
  if (input === void 0) return sets;
  object(input, "priceBook.dateSets");
  for (const [name, list] of Object.entries(input)) {
    const path = `priceBook.dateSets.${name}`;
    if (!/^[\w.-]+$/.test(name)) fail(path, "set names may use letters, digits, _, . and -");
    sets.set(name, array(list, path).map((entry, index) => dateRange(entry, `${path}[${index}]`)));
  }
  return sets;
}

/** Date lists accept single dates, inclusive ranges and "@name" references to dateSets. */
function dateList(value, path, dateSets) {
  if (value === void 0) return null;
  const ranges = [];
  array(value, path).forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const source = text(entry, itemPath);
    if (source.startsWith("@")) {
      const set = dateSets.get(source.slice(1));
      if (set === void 0) fail(itemPath, `unknown date set ${source}`);
      ranges.push(...set);
    } else {
      ranges.push(dateRange(source, itemPath));
    }
  });
  return ranges;
}

function normalizeWhen(input, path, defaultZone, dateSets) {
  if (input === void 0) return null;
  const value = object(input, path, ["timeZone", "from", "to", "dates", "excludeDates", "weekdays", "intervals"]);
  const zone = value.timeZone === void 0 ? defaultZone : timeZone(value.timeZone, `${path}.timeZone`);
  const fromMs = value.from === void 0 ? null : instant(value.from, `${path}.from`);
  const toMs = value.to === void 0 ? null : instant(value.to, `${path}.to`);
  if (fromMs !== null && toMs !== null && fromMs >= toMs) fail(path, "from must be earlier than to");
  const dates = dateList(value.dates, `${path}.dates`, dateSets);
  const excludeDates = dateList(value.excludeDates, `${path}.excludeDates`, dateSets);
  const weekdays = value.weekdays === void 0 ? null : array(value.weekdays, `${path}.weekdays`).map((entry, index) => {
    if (!Number.isInteger(entry) || entry < 1 || entry > 7) fail(`${path}.weekdays[${index}]`, "expected ISO weekday 1 (Monday) through 7 (Sunday)");
    return entry;
  });
  const intervals = value.intervals === void 0 ? null : array(value.intervals, `${path}.intervals`).map((entry, index) => {
    const item = object(entry, `${path}.intervals[${index}]`, ["start", "end"]);
    const start = clock(item.start, `${path}.intervals[${index}].start`);
    const end = clock(item.end, `${path}.intervals[${index}].end`, true);
    if (start === end) fail(`${path}.intervals[${index}]`, "start and end must differ");
    return { start, end };
  });
  return { timeZone: zone, fromMs, toMs, dates, excludeDates, weekdays, intervals };
}

/** Tier prices replace the base prices once the prompt (input + cache read + cache write) exceeds `above`. */
function normalizeTiers(input, path, base) {
  if (input === void 0) return [];
  const seen = new Set();
  const tiers = array(input, path).map((entry, index) => {
    const tierPath = `${path}[${index}]`;
    const tier = object(entry, tierPath, ["above", ...PRICE_KEYS]);
    const above = number(tier.above, `${tierPath}.above`);
    if (!Number.isInteger(above) || above === 0) fail(`${tierPath}.above`, "expected a positive integer token count");
    if (seen.has(above)) fail(`${tierPath}.above`, `duplicate tier threshold ${above}`);
    seen.add(above);
    const prices = { above };
    for (const key of PRICE_KEYS) prices[key] = number(tier[key], `${tierPath}.${key}`, true) ?? base[key];
    return prices;
  });
  return tiers.sort((left, right) => left.above - right.above);
}

function normalizeRule(entry, path, index, zone, dateSets) {
  const rule = object(entry, path, ["name", "note", "currency", "unit", ...PRICE_KEYS, "tiers", "when"]);
  const unit = rule.unit === void 0 ? DEFAULT_UNIT : number(rule.unit, `${path}.unit`);
  if (unit === 0) fail(`${path}.unit`, "must be greater than zero");
  const currency = text(rule.currency, `${path}.currency`).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) fail(`${path}.currency`, "expected a three-letter ISO currency code");
  const base = {
    input: number(rule.input, `${path}.input`),
    output: number(rule.output, `${path}.output`),
    cacheRead: number(rule.cacheRead, `${path}.cacheRead`, true),
    cacheWrite: number(rule.cacheWrite, `${path}.cacheWrite`, true)
  };
  return {
    name: rule.name === void 0 ? `Rule ${index + 1}` : text(rule.name, `${path}.name`),
    currency,
    unit,
    ...base,
    tiers: normalizeTiers(rule.tiers, `${path}.tiers`, base),
    when: normalizeWhen(rule.when, `${path}.when`, zone, dateSets)
  };
}

/** "provider/model": provider is exact or "*", model may use "*" globs; both compare case-insensitively. */
function routePattern(value, path, allowWildcard = true) {
  const source = text(value, path);
  const slash = source.indexOf("/");
  if (slash <= 0 || slash === source.length - 1) fail(path, 'expected "provider/model"');
  const provider = source.slice(0, slash).toLowerCase();
  const model = source.slice(slash + 1).toLowerCase();
  if (provider.includes("*") && provider !== "*") fail(path, 'provider must be exact or "*"');
  const wildcard = provider === "*" || model.includes("*");
  if (wildcard && !allowWildcard) fail(path, "wildcards are not allowed here");
  return { source, provider, model, wildcard };
}

/** Validate and normalize the user-owned JSON price book. Rules inside one model are first-match. */
export function normalizePriceBook(input) {
  const root = object(input, "priceBook", ["version", "note", "timeZone", "dateSets", "models"]);
  if (root.version === 1) fail("priceBook.version", 'version 1 is no longer supported: rewrite each "provider" + "model" pair as a "match" list (see README)');
  if (root.version !== 2) fail("priceBook.version", "only version 2 is supported");
  const defaultZone = timeZone(root.timeZone, "priceBook.timeZone");
  const dateSets = normalizeDateSets(root.dateSets);
  const claimed = new Map();
  const entries = array(root.models, "priceBook.models").map((entry, modelIndex) => {
    const path = `priceBook.models[${modelIndex}]`;
    const model = object(entry, path, ["name", "note", "match", "rules", "catalog"]);
    const patterns = array(model.match, `${path}.match`).map((item, index) => routePattern(item, `${path}.match[${index}]`));
    if (patterns.length === 0) fail(`${path}.match`, "expected at least one route");
    for (const pattern of patterns) {
      const key = `${pattern.provider}/${pattern.model}`;
      if (claimed.has(key)) fail(path, `route ${pattern.source} is already claimed by ${claimed.get(key)}`);
      claimed.set(key, path);
    }
    if ((model.rules === void 0) === (model.catalog === void 0)) fail(path, 'expected exactly one of "rules" or "catalog"');
    const name = model.name === void 0 ? patterns[0].source : text(model.name, `${path}.name`);
    if (model.catalog !== void 0) {
      const target = routePattern(model.catalog, `${path}.catalog`, false);
      return { name, patterns, rules: null, catalog: { provider: target.provider, model: target.model } };
    }
    const rules = array(model.rules, `${path}.rules`).map((item, ruleIndex) => normalizeRule(item, `${path}.rules[${ruleIndex}]`, ruleIndex, defaultZone, dateSets));
    return { name, patterns, rules, catalog: null };
  });
  return { version: 2, timeZone: defaultZone, entries };
}

function formatter(zone) {
  let result = localFormatters.get(zone);
  if (result === void 0) {
    result = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    localFormatters.set(zone, result);
  }
  return result;
}

function weekday(date) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() || 7;
}

function shiftDate(date, days) {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}-${String(shifted.getUTCDate()).padStart(2, "0")}`;
}

function localParts(milliseconds, zone) {
  const parts = {};
  for (const part of formatter(zone).formatToParts(new Date(milliseconds))) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

const inRanges = (ranges, date) => ranges.some(([start, end]) => start <= date && date <= end);

function dateAllowed(when, date) {
  if (when.dates !== null && !inRanges(when.dates, date)) return false;
  if (when.excludeDates !== null && inRanges(when.excludeDates, date)) return false;
  if (when.weekdays !== null && !when.weekdays.includes(weekday(date))) return false;
  return true;
}

function localTimeAllowed(when, milliseconds) {
  const local = localParts(milliseconds, when.timeZone);
  if (when.intervals === null) return dateAllowed(when, local.date);
  for (const interval of when.intervals) {
    if (interval.start < interval.end) {
      if (local.minutes >= interval.start && local.minutes < interval.end && dateAllowed(when, local.date)) return true;
    } else {
      if (local.minutes >= interval.start && dateAllowed(when, local.date)) return true;
      if (local.minutes < interval.end && dateAllowed(when, shiftDate(local.date, -1))) return true;
    }
  }
  return false;
}

function whenMatches(when, milliseconds) {
  if (when === null) return true;
  if (when.fromMs !== null && milliseconds < when.fromMs) return false;
  if (when.toMs !== null && milliseconds >= when.toMs) return false;
  return localTimeAllowed(when, milliseconds);
}

function globMatches(glob, value) {
  let regex = globCache.get(glob);
  if (regex === void 0) {
    regex = new RegExp(`^${glob.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);
    globCache.set(glob, regex);
  }
  return regex.test(value);
}

function patternMatches(pattern, provider, model) {
  if (pattern.provider !== "*" && pattern.provider !== provider) return false;
  return pattern.model.includes("*") ? globMatches(pattern.model, model) : pattern.model === model;
}

function compactTokens(value) {
  if (value >= 1_000_000 && value % 1_000_000 === 0) return `${value / 1_000_000}M`;
  if (value >= 1000 && value % 1000 === 0) return `${value / 1000}K`;
  return String(value);
}

/** "above 272000" → ">272K"; "above 199999" (i.e. from 200K on) → "≥200K". */
function tierLabel(above) {
  const next = compactTokens(above + 1);
  return /[KM]$/.test(next) && !/[KM]$/.test(compactTokens(above)) ? `≥${next}` : `>${compactTokens(above)}`;
}

/**
 * Bind one validated price book and an optional model catalog into a pricer.
 * Resolution order: exact routes in the book, then wildcard routes in file
 * order, then the catalog fallback. Results are cached per route.
 */
export function createPricer({ book, catalog = null, addReasoningToOutput = [] }) {
  const resolved = new Map();
  const reasoningProviders = new Set(addReasoningToOutput.map((provider) => provider.toLowerCase()));

  function fromEntry(entry) {
    if (entry.catalog === null) return { kind: "book", name: entry.name, rules: entry.rules };
    const hit = catalog?.lookup(entry.catalog.provider, entry.catalog.model) ?? null;
    if (hit === null) return null;
    return { kind: "book-catalog", name: entry.name, rules: [{ ...hit.rule, name: `${entry.name} → ${hit.rule.name}` }] };
  }

  function lookup(route) {
    const provider = route.provider.toLowerCase();
    const model = route.model.toLowerCase();
    for (const entry of book.entries) {
      if (entry.patterns.some((pattern) => !pattern.wildcard && patternMatches(pattern, provider, model))) return fromEntry(entry);
    }
    for (const entry of book.entries) {
      if (entry.patterns.some((pattern) => pattern.wildcard && patternMatches(pattern, provider, model))) return fromEntry(entry);
    }
    const hit = catalog?.find(route.provider, route.model) ?? null;
    return hit === null ? null : { kind: "catalog", name: hit.rule.name, rules: [hit.rule] };
  }

  function resolve(route) {
    if (route === null) return null;
    const key = `${route.provider}\0${route.model}`;
    if (!resolved.has(key)) resolved.set(key, lookup(route));
    return resolved.get(key);
  }

  /**
   * Price one provider-reported attempt. Missing routes, rules, or a non-zero
   * bucket without a price return null; a zero price is an exact zero cost.
   */
  function price(route, usage, milliseconds) {
    const source = resolve(route);
    if (source === null) return null;
    const rule = source.rules.find((candidate) => whenMatches(candidate.when, milliseconds));
    if (rule === void 0) return null;
    const outputTokens = usage.outputTokens + (reasoningProviders.has(route.provider.toLowerCase()) ? usage.reasoningTokens ?? 0 : 0);
    const promptTokens = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
    let rates = rule;
    let tier = null;
    for (const candidate of rule.tiers) {
      if (promptTokens > candidate.above) {
        rates = candidate;
        tier = candidate;
      }
    }
    let amount = 0;
    for (const [tokens, unitPrice] of [
      [usage.uncachedInputTokens, rates.input],
      [outputTokens, rates.output],
      [usage.cacheReadTokens, rates.cacheRead],
      [usage.cacheWriteTokens, rates.cacheWrite]
    ]) {
      if (tokens === 0) continue;
      if (unitPrice === void 0) return null;
      amount += tokens / rule.unit * unitPrice;
    }
    if (!Number.isFinite(amount)) return null;
    return {
      currency: rule.currency,
      amount,
      rule: tier === null ? rule.name : `${rule.name} · ${tierLabel(tier.above)}`,
      source: source.kind
    };
  }

  return { resolve, price };
}
