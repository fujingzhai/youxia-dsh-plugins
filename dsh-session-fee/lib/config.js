import { DEFAULT_CATALOG_PROVIDERS, DEFAULT_PROVIDER_HINTS } from "./catalog.js";

function plain(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value, path, fallback) {
  if (value === void 0) return [...fallback];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    throw new Error(`${path} must be a list of non-empty strings`);
  }
  return value.map((entry) => entry.trim());
}

function known(value, path, keys) {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${path} has unknown key "${key}"`);
}

/**
 * Validate the plugin config and fill defaults.
 * - priceBook: price-book path, relative to this package or absolute.
 * - catalog: fallback USD list prices for models the price book lacks. Order:
 *   `sources` (pi-ai installs you point to), then DSH's own pi-ai when
 *   `includeHost` is on.
 * - addReasoningToOutput: providers whose outputTokens exclude reasoningTokens.
 */
export function normalizeConfig(input) {
  const raw = input ?? {};
  if (!plain(raw)) throw new Error("config must be an object");
  known(raw, "config", ["priceBook", "catalog", "addReasoningToOutput"]);
  if (raw.priceBook !== void 0 && (typeof raw.priceBook !== "string" || raw.priceBook.trim() === "")) {
    throw new Error("config.priceBook must be a non-empty string");
  }
  const catalog = raw.catalog ?? {};
  if (!plain(catalog)) throw new Error("config.catalog must be an object");
  known(catalog, "config.catalog", ["enabled", "sources", "includeHost", "providers", "hints"]);
  if (catalog.enabled !== void 0 && typeof catalog.enabled !== "boolean") throw new Error("config.catalog.enabled must be true or false");
  if (catalog.includeHost !== void 0 && typeof catalog.includeHost !== "boolean") throw new Error("config.catalog.includeHost must be true or false");
  const hints = catalog.hints ?? DEFAULT_PROVIDER_HINTS;
  if (!plain(hints)) throw new Error("config.catalog.hints must map provider ids to lists");
  return {
    priceBook: raw.priceBook?.trim() ?? "./prices.json",
    catalog: {
      enabled: catalog.enabled ?? true,
      sources: strings(catalog.sources, "config.catalog.sources", []),
      includeHost: catalog.includeHost ?? true,
      providers: strings(catalog.providers, "config.catalog.providers", DEFAULT_CATALOG_PROVIDERS),
      hints: Object.fromEntries(Object.entries(hints).map(([key, list]) => [key, strings(list, `config.catalog.hints.${key}`, [])]))
    },
    addReasoningToOutput: strings(raw.addReasoningToOutput, "config.addReasoningToOutput", ["antigravity"])
  };
}

/** Standard Schema (https://standardschema.dev) wrapper, the interface DSH's loader validates plugin config with. */
export const Config = {
  "~standard": {
    version: 1,
    vendor: "dsh-session-fee",
    validate(value) {
      try {
        return { value: normalizeConfig(value) };
      } catch (error) {
        return { issues: [{ message: error.message }] };
      }
    }
  },
  parse: normalizeConfig
};
