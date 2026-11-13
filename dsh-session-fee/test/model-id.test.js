import test from "node:test";
import assert from "node:assert/strict";
import { pricingModelId } from "../lib/model-id.js";

const accountModel = (account, model) => `~account:${encodeURIComponent(account)}:${encodeURIComponent(model)}`;

test("only canonical independent account ids are unwrapped, with one URI decode", () => {
  for (const account of [JSON.stringify(["workspace-fixture", "user", "user-fixture"]), "账号:/%测试"]) {
    for (const model of ["gpt-6.1-sol", "provider/Model:variant", "literal%2Fmodel"]) {
      assert.equal(pricingModelId(accountModel(account, model)), model);
    }
  }
});

test("ordinary model ids and display aliases are untouched", () => {
  for (const model of ["gpt-6.1-sol", "youxia-GPT-6.1-Sol", "youxia · GPT-6.1-Sol", "provider/model", ""]) {
    assert.equal(pricingModelId(model), model);
  }
});

test("malformed and noncanonical reserved ids stay unknown instead of throwing or guessing", () => {
  for (const model of [
    "~account:", "~account::gpt-6.1-sol", "~account:fixture:", "~account:fixture:gpt-6.1-sol:extra",
    "~account:%broken:gpt-6.1-sol", "~account:fixture:%broken", "~account:fixture/model:gpt-6.1-sol",
    "~account:fixture%2faccount:gpt-6.1-sol", "~account:fixture:%67pt-6.1-sol"
  ]) {
    assert.equal(pricingModelId(model), model);
  }
});
