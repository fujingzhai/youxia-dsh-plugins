// raw：在单个会话的原始记录里定点查（含思考与工具往来），不建索引。
// 接口名、参数、报错原文多只在工具调用与返回里，清洗日志按设计不收。
import { basename } from 'node:path';
import { byFolder, pathsOf } from './agents.js';
import { readText } from './files.js';
import { parseJson, isObject } from './py.js';
import { norm, trad } from './normalize.js';
import { createClock } from './clock.js';
import { shortSid } from './text.js';
import { parseQuery, pickSession, excerpt, budgeted, occurrences, UsageError } from './recall.js';

const SKIP = new Set(['signature', 'data', 'encrypted_content']); // 签名、图片、加密思考：大段无字内容
const AGY = { USER_INPUT: '用户', PLANNER_RESPONSE: '助手', CHECKPOINT: '压缩摘要', SYSTEM_MESSAGE: '系统', ERROR_MESSAGE: '报错' };
// 预算先给日志里没有的：工具调用、思考；工具返回量大多杂，排最后。
const ORDER = { 工具调用: 0, 思考: 1, 助手: 2, 用户: 3, 报错: 4, 压缩摘要: 5 };

function* leaves(x) {
  if (typeof x === 'string') yield x;
  else if (Array.isArray(x)) for (const v of x) yield* leaves(v);
  else if (isObject(x)) for (const [k, v] of Object.entries(x)) if (!SKIP.has(k)) yield* leaves(v);
}
const joined = x => [...leaves(x)].join(' ');
const pick = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
const omit = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

/** 原始记录的一行拆成 [类别, 文本]。CC 的请求快照、Codex 的配置与计量等跳过，否则查什么都是噪声。 */
export function* rawItems(kind, e) {
  if (!isObject(e)) return;
  if (kind === 'antigravity') { yield [AGY[e.type] || '工具返回', joined(pick(e, ['content', 'tool_calls']))]; return; }
  if (kind === 'dsh') {
    const kind = e.type || '', d = isObject(e.data) ? e.data : {};
    if (kind === 'user/message' && [undefined, null, 'user'].includes(isObject(d.source) ? d.source.kind : undefined)) yield ['用户', joined(d.content)];
    else if (kind === 'assistant/message') {
      for (const b of (isObject(d.message) && Array.isArray(d.message.content)) ? d.message.content : []) {
        if (!isObject(b)) continue;
        if (b.type === 'reasoning') yield ['思考', String(b.text ?? '')];
        else if (b.type === 'tool-call') yield ['工具调用', joined(pick(b, ['name', 'arguments']))];
        else if (b.type === 'text') yield ['助手', String(b.text ?? '')];
      }
    } else if (kind === 'tool/result') yield ['工具返回', joined(isObject(d.message) ? d.message.content : undefined)];
    else if (kind.includes('error')) yield ['报错', joined(d)];
    return;
  }
  if (kind === 'workbuddy') {
    const p = isObject(e.providerData) ? e.providerData : {};
    if (e.type === 'message' && ['user', 'assistant'].includes(e.role) && !p.isMeta && !p.skipRun) yield [e.role === 'user' ? '用户' : '助手', joined(e.content)];
    else if (e.type === 'reasoning') yield ['思考', joined(e.content ?? e.summary)];
    else if (e.type === 'function_call') yield ['工具调用', joined(pick(e, ['name', 'arguments']))];
    else if (e.type === 'function_call_result') yield ['工具返回', joined(e.output)];
    return;
  }
  if (kind === 'codex') {
    const p = isObject(e.payload) ? e.payload : {};
    const kind = e.type === 'response_item' ? (p.type || '') : '';
    if (kind === 'message' && ['user', 'assistant'].includes(p.role)) yield [p.role === 'user' ? '用户' : '助手', joined(p.content)];
    else if (kind === 'reasoning') yield ['思考', joined(p.summary)];
    else if (kind.endsWith('_output')) yield ['工具返回', joined(p.output)];
    else if (kind.endsWith('_call')) yield ['工具调用', joined(omit(p, ['type', 'id', 'call_id', 'status']))];
    return;
  }
  const m = isObject(e.message) ? e.message : {};
  const role = m.role;
  if (!['user', 'assistant', 'message'].includes(e.type) || !['user', 'assistant', 'toolResult'].includes(role)) return;
  const content = m.content;
  for (const b of typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []) {
    if (!isObject(b)) continue;
    const kind = b.type;
    if (kind === 'thinking' || kind === 'redacted_thinking') yield ['思考', String(b.thinking ?? '')];
    else if (kind === 'tool_use' || kind === 'toolCall') yield ['工具调用', joined(omit(b, ['type', 'id']))];
    else if (kind === 'tool_result' || role === 'toolResult') yield ['工具返回', joined(b.content ?? b.text)];
    else if (kind === 'text') yield [role === 'user' ? '用户' : '助手', String(b.text ?? '')];
  }
}

function rawClock(e, clock) {
  if (typeof e.time === 'number') return clock.stamp(e.time); // DSH：毫秒时间戳
  return clock.stamp(e.timestamp || e.created_at || '');
}

export function raw(db, args, ctx) {
  const { config } = ctx;
  const clock = createClock(config);
  const [about, message] = pickSession(db, args.target, args.agent);
  if (!about) return message;
  const tag = `${about.agent} ${shortSid(about.session)}「${about.title}」`;
  const source = byFolder(about.agent, config);
  const key = about.session.startsWith('session-') ? about.session.slice(8) : about.session;
  const files = source ? source.rawFiles(pathsOf(source, config), key) : [];
  const kind = source ? (source.custom ? source.format : source.id) : '';
  if (!files.length) return `${tag}的原始记录已不在（已删除、来源已停用或不支持），只能查清洗日志。`;
  const groups = parseQuery(args.query);
  if (!groups.length) throw new UsageError('请提供至少一个关键词。');
  const count = groups.length;
  // 先在原始行上粗筛（大小写不计，中文兼查繁体写法），命中的行才解析、归一化后逐项核对。
  const probes = [...new Set(groups.flatMap(([, alts]) => alts.flatMap(a => [a, trad(a).toLowerCase()])))];
  const hits = [];
  for (const path of files) {
    const lines = readText(path).split('\n');
    lines.forEach((line, i) => {
      const low = line.toLowerCase();
      if (!probes.some(p => low.includes(p))) return;
      const e = parseJson(line);
      if (e === undefined) return;
      for (const [label, value] of rawItems(kind, e)) {
        const text = value.replaceAll('\\n', '\n'); // 工具返回常是二次编码的 JSON 字符串
        const normalized = norm(text);
        const found = groups.filter(([, alts]) => alts.some(a => occurrences(normalized, a))).length;
        if (found) hits.push([found, path, i + 1, rawClock(e, clock), label, text, normalized]);
      }
    });
  }
  const where = files.length === 1 ? files[0] : `${files[0]} 等 ${files.length} 个文件`;
  if (!hits.length) return `${where}\n${tag}原始记录｜未查到。`;
  const best = Math.max(...hits.map(h => h[0]));
  const shown = hits.filter(h => h[0] === best).sort((a, b) => (ORDER[a[4]] ?? 9) - (ORDER[b[4]] ?? 9));
  const kinds = new Map();
  for (const h of shown) kinds.set(h[4], (kinds.get(h[4]) || 0) + 1);
  const scope = best === count ? `${shown.length} 处含全部词` : `没有一处同时含全部词，列命中 ${best}/${count} 个词的 ${shown.length} 处`;
  const say = label => label === '用户' ? config.userLabel : label;
  const out = [`${where}\n${tag}原始记录｜${scope}（${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${say(k)} ${n}`).join(' · ')}）`];
  const seen = new Set();
  for (const [, path, n, stamp, label, text, normalized] of shown) {
    const snippet = excerpt({ body: text, normalized }, groups, args.width);
    if (seen.has(snippet)) continue;
    seen.add(snippet);
    out.push(`${files.length === 1 ? '' : basename(path) + ' '}L${n} ${stamp} ${say(label)}：${snippet}`);
  }
  return budgeted(out, args.budget, '处');
}
