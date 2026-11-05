import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizePriceBook } from "../lib/pricing.js";
import { watchPriceBook } from "../lib/reload.js";

const priceBookPath = fileURLToPath(new URL("./fixtures/reload/prices.json", import.meta.url));
const clientArtifact = fileURLToPath(new URL("./fixtures/reload/client.artifact", import.meta.url));
const original = readFileSync(priceBookPath, "utf8");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await wait(100);
  }
  assert.fail(message);
}

function load(path) {
  return normalizePriceBook(JSON.parse(readFileSync(path, "utf8")));
}

test("valid JSON reloads automatically and invalid JSON preserves the last valid book", async () => {
  let registrations = 0;
  let disposals = 0;
  let active = 0;
  const errors = [];
  const reloader = watchPriceBook({
    priceBookPath,
    clientArtifact,
    load,
    register: () => {
      registrations += 1;
      active += 1;
      return () => {
        disposals += 1;
        active -= 1;
      };
    },
    onError: (error) => errors.push(error)
  });
  try {
    assert.equal(registrations, 1);
    assert.equal(active, 1);
    const previousMtime = statSync(clientArtifact).mtimeMs;
    writeFileSync(priceBookPath, JSON.stringify({
      version: 2,
      models: [{ match: ["demo/a"], rules: [{ currency: "CNY", input: 1, output: 2 }] }]
    }));
    await until(() => registrations === 2, "valid price book was not reloaded");
    assert.equal(disposals, 1);
    assert.equal(active, 1);
    assert.ok(statSync(clientArtifact).mtimeMs > previousMtime, "Client artifact was not invalidated");

    writeFileSync(priceBookPath, "{ invalid JSON");
    await until(() => errors.length > 0, "invalid price book was not reported");
    await wait(250);
    assert.equal(registrations, 2);
    assert.equal(active, 1);
  } finally {
    reloader.close();
    writeFileSync(priceBookPath, original);
  }
  assert.equal(active, 0);
});
