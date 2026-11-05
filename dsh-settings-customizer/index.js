import z from "@deepseek-ai/schemastery";

export const name = "settings-customizer";

const iconNames = ["credit-card", "code", "bot", "globe", "star"];
const paths = z.array(z.string().min(1).max(16384).pattern(/\S/)).min(1).max(64);
const svg = z.object({
  paths: paths.required(),
  viewBox: z.string().max(128).pattern(/^\s*-?\d+(?:\.\d+)?[\s,]+-?\d+(?:\.\d+)?[\s,]+(?:[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)[\s,]+(?:[1-9]\d*(?:\.\d+)?|0?\.\d*[1-9]\d*)\s*$/).default("0 0 24 24")
});
const rule = z.object({
  order: z.number().min(-1000000).max(1000000),
  label: z.string(),
  icon: z.union([z.union(iconNames), svg])
});

// 仅配置字段使用 volatile；设置服务按 entry id 投影，浏览器不读取作者源码配置。
export const Config = z.object({
  rules: z.dict(rule).default({}).volatile(),
  autoOrder: z.boolean().default(false).volatile(),
  extraStart: z.number().min(-1000000).max(1000000).default(40).volatile()
});

// settings 默认投影所有 volatile Config 字段，无需注册自定义 RPC 或写入源码。
export function apply() {}
