// 与旧版 amem（Python）对齐的小工具：清洗结果要逐字一致，空白、切行与排序都按 Python 的语义来。

// str.isspace() 认的空白（含 \x1c–\x1f、\x85），比 JS 的 \s 多几个、少 ﻿。
const WS = '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const EDGE = new RegExp(`^[${WS}]+|[${WS}]+$`, 'g');
const RUN = new RegExp(`[${WS}]+`);
const TAIL = new RegExp(`[${WS}]+$`);

/** str.strip()，或 str.strip(chars)。 */
export function strip(value, chars) {
  const text = String(value ?? '');
  if (chars === undefined) return text.replace(EDGE, '');
  let a = 0, b = text.length;
  while (a < b && chars.includes(text[a])) a++;
  while (b > a && chars.includes(text[b - 1])) b--;
  return text.slice(a, b);
}

/** str.rstrip()，或 str.rstrip(chars)。 */
export function rstrip(value, chars) {
  const text = String(value ?? '');
  if (chars === undefined) return text.replace(TAIL, '');
  let b = text.length;
  while (b > 0 && chars.includes(text[b - 1])) b--;
  return text.slice(0, b);
}

/** str.split()：按任意空白切开、丢掉空段。 */
export function words(value) {
  const text = strip(value);
  return text ? text.split(RUN) : [];
}

/** 按码位截取（Python 切片），不切开代理对。 */
export function cut(text, start, end) {
  if (!/[\uD800-\uDFFF]/.test(text)) return text.slice(start, end);
  return Array.from(text).slice(start, end).join('');
}

// str.splitlines() 认的换行；Markdown 分段沿用它，保证与旧日志判定一致。
const BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/g;

/** str.splitlines(keepends)。 */
export function splitlines(text, keepends = false) {
  const out = [];
  let last = 0;
  for (const match of text.matchAll(BREAK)) {
    const end = match.index + match[0].length;
    out.push(text.slice(last, keepends ? end : match.index));
    last = end;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** JSONL 按行切：只认 \n（行内的 U+2028 等不是换行）；去掉行尾 \r。 */
export function jsonLines(text) {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

/** pathlib 的路径排序：逐段比较，而不是整串比较（"a/x" 排在 "a-b/x" 前）。 */
export function comparePaths(a, b) {
  const x = a.split(/[\\/]/), y = b.split(/[\\/]/);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length;
}

export const sortPaths = paths => [...paths].sort(comparePaths);

/** Python 打印 None 的样子。 */
export const show = value => value === null || value === undefined ? 'None' : String(value);

export function parseJson(line) {
  try { return JSON.parse(line); } catch { return undefined; }
}

export const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
