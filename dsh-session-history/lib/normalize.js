// 检索归一化：繁转简、全角转半角、英文小写。只用于匹配，原文不改字。
import { ConverterBuilder } from 'opencc-js/core';
import * as t2cn from 'opencc-js/preset/t2cn';
import * as cn2t from 'opencc-js/preset/cn2t';

let toSimple, toTrad;
const wide = text => text.replace(/[！-～　]/g, ch => ch === '　' ? ' ' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));

export function norm(text) {
  toSimple ??= ConverterBuilder(t2cn)({ from: 't', to: 'cn' });
  return wide(toSimple(text)).toLowerCase();
}

/** 简转繁：raw 粗筛时兼查繁体写法。 */
export function trad(text) {
  toTrad ??= ConverterBuilder(cn2t)({ from: 'cn', to: 't' });
  return toTrad(text);
}

const charCache = new Map();
export function normChar(ch) {
  let value = charCache.get(ch);
  if (value === undefined) {
    value = norm(ch);
    if (charCache.size > 8192) charCache.clear();
    charCache.set(ch, value);
  }
  return value;
}
