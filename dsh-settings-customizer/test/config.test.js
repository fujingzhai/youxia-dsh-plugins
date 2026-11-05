import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import z from "@deepseek-ai/schemastery";
import { Config } from "../index.js";

function values(input) {
  const config = Config(input);
  return Object.fromEntries(Object.entries(config).map(([key, value]) => [key, value.get()]));
}

test("公共默认不改任何人的设置，也没有作者规则", () => {
  assert.deepEqual(values({}), { rules: {}, autoOrder: false, extraStart: 40 });
  const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
  assert.match(patch, /rules: \{\}/);
  assert.match(patch, /autoOrder: false/);
});

test("只填某一个字段不会给未填字段增加默认覆盖", () => {
  for (const rule of [{ order: 0 }, { label: "自定名称" }, { icon: "code" }, {}]) {
    assert.deepEqual(values({ rules: { sample: rule } }).rules.sample, rule);
  }
});

test("接受内置图标及数据式 SVG，不执行脚本或加载网络图标", () => {
  assert.equal(values({ rules: { sample: { icon: "bot" } } }).rules.sample.icon, "bot");
  assert.deepEqual(values({ rules: { sample: { icon: { paths: ["M3 5h18v14H3z"] } } } }).rules.sample.icon,
    { paths: ["M3 5h18v14H3z"], viewBox: "0 0 24 24" });
  for (const icon of ["unknown", "https://example.com/icon.svg", { paths: [] }, { paths: [" "] },
    { paths: ["M0 0"], viewBox: "0 0 0 0" }, { paths: ["M0 0"], viewBox: "<script>" }]) {
    assert.throws(() => values({ rules: { sample: { icon } } }));
  }
});

test("拒绝错误字段类型与过大排序，false、0、空名称均有效", () => {
  for (const input of [{ autoOrder: "yes" }, { extraStart: Infinity }, { rules: [] },
    { rules: { sample: { order: "30" } } }, { rules: { sample: { order: 1000001 } } }]) {
    assert.throws(() => values(input));
  }
  assert.equal(values({ extraStart: 0, rules: { sample: { label: "" } } }).extraStart, 0);
});

test("schema 可序列化、重建；规则与开关均为 volatile", () => {
  const json = JSON.parse(JSON.stringify(Config.toJSON()));
  const rebuilt = new z(json);
  const input = { rules: { sample: { order: 30, label: "示例名称", icon: "star" } }, autoOrder: true, extraStart: 50 };
  const config = rebuilt(input);
  assert.deepEqual(config.rules.get(), input.rules);
  assert.equal(config.autoOrder.get(), true);
  assert.equal(config.extraStart.get(), 50);
  assert.equal(Config.dict.rules.meta.volatile, true);
});
