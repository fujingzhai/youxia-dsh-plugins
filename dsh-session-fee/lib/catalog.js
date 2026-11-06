import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Catalog providers whose list prices are first-party USD prices. Chinese
 * vendors are left out on purpose: their models should be priced in CNY from
 * the price book, not from an international USD list.
 */
export const DEFAULT_CATALOG_PROVIDERS = Object.freeze([
  "openai-codex",
  "openai",
  "anthropic",
  "google-vertex",
  "google",
  "xai",
  "mistral",
  "github-copilot"
]);

/** DSH provider id → catalog providers searched before the general list. */
export const DEFAULT_PROVIDER_HINTS = Object.freeze({
  codex: ["openai-codex", "openai"],
  grok: ["xai"],
  claude: ["anthropic"],
  antigravity: ["google", "anthropic"],
  copilot: ["github-copilot"]
});

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function packageRootFrom(file, name) {
  let directory = dirname(file);
  for (let depth = 0; depth < 8; depth += 1) {
    const manifest = join(directory, "package.json");
    if (existsSync(manifest)) {
      try {
        if (readJson(manifest).name === name) return directory;
      } catch {
        // keep walking
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

/** Find an installed package: the host resolver first, then node_modules above the host entry script. */
function locatePackage(name) {
  try {
    const root = packageRootFrom(fileURLToPath(import.meta.resolve(name)), name);
    if (root !== null) return root;
  } catch {
    // not resolvable from this plugin; fall through
  }
  const entry = process.argv[1];
  if (typeof entry === "string" && entry !== "") {
    let directory = dirname(resolve(entry));
    for (let depth = 0; depth < 12; depth += 1) {
      const candidate = join(directory, "node_modules", ...name.split("/"));
      if (existsSync(join(candidate, "package.json"))) return candidate;
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return null;
}

function validCost(cost) {
  if (typeof cost !== "object" || cost === null) return false;
  for (const key of ["input", "output"]) if (typeof cost[key] !== "number" || !Number.isFinite(cost[key]) || cost[key] < 0) return false;
  // An all-zero list price means "free tier / unknown", not a market price.
  return cost.input > 0 || cost.output > 0;
}

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function toRule(label, cost) {
  const base = {
    input: cost.input,
    output: cost.output,
    cacheRead: finite(cost.cacheRead, 0),
    cacheWrite: finite(cost.cacheWrite, 0)
  };
  const tiers = (Array.isArray(cost.tiers) ? cost.tiers : [])
    .filter((tier) => Number.isInteger(tier?.inputTokensAbove) && tier.inputTokensAbove > 0)
    .map((tier) => ({
      above: tier.inputTokensAbove,
      input: finite(tier.input, base.input),
      output: finite(tier.output, base.output),
      cacheRead: finite(tier.cacheRead, base.cacheRead),
      cacheWrite: finite(tier.cacheWrite, base.cacheWrite)
    }))
    .sort((left, right) => left.above - right.above);
  return { name: label, currency: "USD", unit: 1_000_000, ...base, tiers, when: null };
}

/** Candidate catalog ids for one DSH model id, most literal first. */
export function modelIdVariants(model) {
  const variants = [];
  const add = (value) => {
    if (value !== "" && !variants.includes(value)) variants.push(value);
  };
  const lower = model.toLowerCase();
  add(lower);
  if (lower.includes("/")) add(lower.slice(lower.lastIndexOf("/") + 1));
  for (const value of [...variants]) {
    if (value.endsWith("-thinking")) add(value.slice(0, -"-thinking".length));
  }
  for (const value of [...variants]) {
    // claude-sonnet-4.5 (Copilot style) ↔ claude-sonnet-4-5 (Anthropic style)
    if (value.startsWith("claude-")) {
      add(value.replace(/(\d)\.(\d)/g, "$1-$2"));
      add(value.replace(/(\d)-(\d)(?!\d{3})/g, "$1.$2"));
    }
  }
  return variants;
}

export const HOST_PI_AI = "@earendil-works/pi-ai";

/**
 * Build the fallback price index for routes the price book does not cover.
 * Earlier layers win:
 *   1. `sources`: pi-ai installs or package names you point to (newest first);
 *   2. DSH's own pi-ai (`includeHost`).
 * Missing layers are reported in `errors`, never thrown.
 */
export function loadCatalog({
  sources = [],
  includeHost = true,
  providers = DEFAULT_CATALOG_PROVIDERS,
  hints = DEFAULT_PROVIDER_HINTS,
  baseDirectory = process.cwd()
}) {
  const index = new Map(providers.map((provider) => [provider, new Map()]));
  const loaded = [];
  const errors = [];
  const seenDirectories = new Set();

  function add(provider, id, cost, version) {
    const table = index.get(provider);
    if (table === void 0 || typeof id !== "string" || !validCost(cost)) return false;
    const key = id.toLowerCase();
    if (table.has(key)) return false;
    table.set(key, toRule(`pi-ai ${version} · ${provider}/${id}`, cost));
    return true;
  }

  function loadPackage(spec) {
    const directory = isAbsolute(spec) || spec.startsWith(".") ? resolve(baseDirectory, spec) : locatePackage(spec);
    if (directory === null || !existsSync(join(directory, "package.json"))) {
      errors.push(`catalog source not found: ${spec}`);
      return;
    }
    if (seenDirectories.has(directory)) return;
    seenDirectories.add(directory);
    let version = "?";
    try {
      version = readJson(join(directory, "package.json")).version ?? "?";
    } catch (error) {
      errors.push(`unreadable package.json in ${directory}: ${error.message}`);
      return;
    }
    const dataDirectory = join(directory, "dist", "providers", "data");
    if (!existsSync(dataDirectory)) {
      errors.push(`no dist/providers/data in ${directory}`);
      return;
    }
    const available = new Set(readdirSync(dataDirectory).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)));
    let models = 0;
    for (const provider of providers) {
      if (!available.has(provider)) continue;
      let data;
      try {
        data = readJson(join(dataDirectory, `${provider}.json`));
      } catch (error) {
        errors.push(`unreadable ${provider}.json in ${directory}: ${error.message}`);
        continue;
      }
      for (const group of Object.values(data ?? {})) {
        for (const [key, entry] of Object.entries(group ?? {})) {
          if (!key.startsWith("chat:") || (entry?.type ?? "chat") !== "chat") continue;
          if (add(provider, entry?.id, entry?.cost, version)) models += 1;
        }
      }
    }
    loaded.push({ kind: "pi-ai", spec, directory, version, models });
  }

  for (const spec of sources) loadPackage(spec);
  if (includeHost) loadPackage(HOST_PI_AI);

  function lookup(provider, model) {
    const table = index.get(provider.toLowerCase());
    if (table === void 0) return null;
    for (const id of modelIdVariants(model)) {
      const rule = table.get(id);
      if (rule !== void 0) return { provider, rule };
    }
    return null;
  }

  function find(dshProvider, model) {
    const key = dshProvider.toLowerCase();
    const order = [...(hints[key] ?? []), ...(index.has(key) ? [key] : []), ...providers];
    for (const provider of new Set(order)) {
      const hit = lookup(provider, model);
      if (hit !== null) return hit;
    }
    return null;
  }

  return {
    sources: loaded,
    errors,
    fingerprint: JSON.stringify([loaded, providers, hints]),
    lookup,
    find
  };
}
