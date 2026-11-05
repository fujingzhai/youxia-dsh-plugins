import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./lib/catalog.js";
import { Config } from "./lib/config.js";
import { createPricer, normalizePriceBook } from "./lib/pricing.js";
import { createSessionCostProjection } from "./lib/projection.js";
import { watchPriceBook } from "./lib/reload.js";

export const name = "session-cost";
export const inject = ["sessionProjections"];

export { Config };

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const packageVersion = JSON.parse(readFileSync(join(packageDirectory, "package.json"), "utf8")).version;
const statusPath = join(process.env.DSH_HOME || join(homedir(), ".dsh"), "plugins", "session-cost", "status.json");

function freeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export function loadPriceBook(path) {
  const source = readFileSync(path, "utf8");
  let json;
  try {
    json = JSON.parse(source);
  } catch (error) {
    throw new Error(`Unable to parse session-cost price book ${path}: ${error.message}`, { cause: error });
  }
  return freeze(normalizePriceBook(json));
}

/** Price book + catalog → one immutable pricing context. */
export function loadPricing(priceBookPath, config = Config.parse({})) {
  const book = loadPriceBook(priceBookPath);
  const catalog = config.catalog.enabled
    ? loadCatalog({ ...config.catalog, baseDirectory: packageDirectory })
    : null;
  const pricer = createPricer({ book, catalog, addReasoningToOutput: config.addReasoningToOutput });
  return {
    book,
    catalog,
    pricer,
    fingerprint: JSON.stringify([book, catalog?.fingerprint ?? null, config.addReasoningToOutput])
  };
}

function writeStatus(status) {
  try {
    mkdirSync(dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify({ plugin: `dsh-session-cost@${packageVersion}`, ...status }, null, 2)}\n`);
  } catch {
    // Diagnostics only.
  }
}

export function apply(ctx, rawConfig) {
  const config = Config.parse(rawConfig ?? {});
  const priceBookPath = isAbsolute(config.priceBook) ? config.priceBook : resolve(packageDirectory, config.priceBook);
  let lastGood = null;
  ctx.effect(() => {
    const reloader = watchPriceBook({
      priceBookPath,
      clientArtifact: resolve(packageDirectory, "client.js"),
      load: (path) => loadPricing(path, config),
      fingerprint: (pricing) => pricing.fingerprint,
      register: (pricing) => ctx.sessionProjections.register(createSessionCostProjection(pricing.pricer)),
      onLoad: (pricing) => {
        lastGood = {
          loadedAt: new Date().toISOString(),
          priceBook: { path: priceBookPath, models: pricing.book.entries.length },
          catalog: pricing.catalog === null ? null : { sources: pricing.catalog.sources, errors: pricing.catalog.errors }
        };
        writeStatus(lastGood);
      },
      onError: (error) => {
        console.error(`[dsh-session-cost] Keeping the last valid price book: ${error.message}`);
        writeStatus({ ...lastGood, lastError: { at: new Date().toISOString(), message: error.message } });
      }
    });
    return () => reloader.close();
  }, "dsh-session-cost: price-book watcher");
}
