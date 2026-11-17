// 检索：先定位会话，再有限度地读。search 以会话为单位排序：题目与用户原话里出现的词权重最高，
// 其次是词的稀有度、饱和词频、共现，乘轻度时间衰减。命中会话过多时只列题目和可用来细分的同现词。
import { basename, dirname } from 'node:path';
import { norm, normChar } from './normalize.js';
import { mask, OVERLAP } from './store.js';
import { createClock } from './clock.js';
import { tilde, home } from './files.js';
import { roleTools, clip, plain, machine, speaker, shortSid, span, mark, phrases } from './text.js';

export class UsageError extends Error {}

const cpLen = s => { let n = 0; for (const _ of s) n++; return n; };

export function parseDay(value, clock) {
  if (!value) return null;
  const today = clock.today();
  if (value === 'today') return today;
  let m = /^(\d+)d$/.exec(value);
  if (m) { const d = new Date(Date.parse(today + 'T00:00:00Z') - Number(m[1]) * 86400000); return d.toISOString().slice(0, 10); }
  if (/^\d\d-\d\d$/.test(value)) return `${today.slice(0, 4)}-${value}`;
  if (/^\d{4}-\d\d-\d\d$/.test(value)) return value;
  throw new UsageError(`日期应为 YYYY-MM-DD、MM-DD、today 或 7d：${value}`);
}

export function parseQuery(words) {
  const groups = [];
  for (const word of words) {
    for (const token of String(word).split(/\s+/).filter(Boolean)) {
      const alts = [];
      for (const alt of token.split('|')) { const a = norm(alt.trim()); if (a && !alts.includes(a)) alts.push(a); }
      if (alts.length && !groups.some(g => g[1].length === alts.length && g[1].every((x, i) => x === alts[i]))) groups.push([token, alts]);
    }
  }
  return groups;
}

export function resolveSessions(db, token, agent = null) {
  const t = String(token).trim();
  const sql = "SELECT * FROM sessions WHERE (session=? OR substr(session,1,length(?))=? OR substr(session,1,length(?)+8)='session-'||? OR instr(session,'（'||?||'）')>0)";
  const rows = db.prepare(sql + (agent ? ' AND agent=?' : '')).all(...Array(6).fill(t), ...(agent ? [agent] : []));
  const exact = rows.filter(r => r.session === t);
  return exact.length ? exact : rows;
}

export function findChunk(db, token, strict = true) {
  const t = String(token).replace(/^[\[\] ]+|[\[\] ]+$/g, '').toLowerCase();
  if (!/^[0-9a-f]{6,20}$/.test(t)) { if (strict) throw new UsageError('块 ID 应为 6–20 位十六进制。'); return null; }
  const rows = db.prepare('SELECT * FROM chunks WHERE id>=? AND id<? LIMIT 2').all(t, t + 'g');
  if (rows.length > 1) throw new UsageError('块 ID 前缀不唯一，请多给几位。');
  if (!rows.length && strict) throw new UsageError('ID 不存在或日志已更新，请重新检索。');
  return rows[0] || null;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isShortWord = alt => /^[a-z0-9]{1,3}$/.test(alt);
const bounded = alt => new RegExp(`(?<![a-z0-9])${escapeRe(alt)}(?![a-z0-9])`, 'g');

function countOf(text, alt) {
  if (isShortWord(alt)) return (text.match(bounded(alt)) || []).length;
  if (!alt) return 0;
  let n = 0;
  for (let i = text.indexOf(alt); i >= 0; i = text.indexOf(alt, i + alt.length)) n++;
  return n;
}
export const occurrences = countOf;

function chunkFilters(args, keys, clock, tools) {
  const where = [], params = [];
  for (const [column, value, op] of [['agent', args.agent, '='], ['day', parseDay(args.since, clock), '>='], ['day', parseDay(args.until, clock), '<=']]) {
    if (value) { where.push(`c.${column}${op}?`); params.push(value); }
  }
  if (args.role) {
    const any = '(' + tools.marks.map(() => 'instr(c.role,?)>0').join(' OR ') + ')';
    where.push(args.role === 'user' ? any : `NOT ${any}`);
    params.push(...tools.marks);
  }
  if (keys) {
    where.push('(' + keys.map(() => '(c.agent=? AND c.session=?)').join(' OR ') + ')');
    for (const k of keys) params.push(k.agent, k.session);
  }
  return [where, params];
}

function match(db, alt, where, params) {
  const cond = ['instr(c.normalized, ?)>0'], p = [alt];
  if (cpLen(alt) >= 3) { cond.unshift('c.rid IN (SELECT rowid FROM terms WHERE terms MATCH ?)'); p.unshift('"' + alt.replaceAll('"', '""') + '"'); }
  const word = isShortWord(alt);
  const sql = 'SELECT c.rid, c.agent, c.session, c.day, c.turn, c.part, c.role, substr(c.normalized, 1, 40) AS lead,'
    + " (length(c.normalized)-length(replace(c.normalized, ?, '')))/length(?) AS tf"
    + (word ? ', c.normalized' : '') + ' FROM chunks c WHERE ' + [...cond, ...where].join(' AND ');
  const rows = db.prepare(sql).all(alt, alt, ...p, ...params);
  if (!word) return rows;
  // 三个字符以内的英文数字词按词边界匹配，避免 pi 命中 api、cap 命中 capture。
  const re = bounded(alt);
  const out = [];
  for (const r of rows) { const n = (r.normalized.match(re) || []).length; if (n) out.push({ ...r, tf: n }); }
  return out;
}

function memoryNotes(db, groups, top = 2) {
  const rows = db.prepare('SELECT * FROM memories').all();
  if (!rows.length) return '';
  const stats = rows.map(r => [r, groups.map(([, alts]) => alts.reduce((s, a) => s + countOf(r.head_norm, a), 0)),
    groups.map(([, alts]) => alts.reduce((s, a) => s + countOf(r.body_norm, a), 0))]);
  const idf = groups.map((_, g) => Math.log(1 + rows.length / (stats.filter(([, h, b]) => h[g] + b[g]).length + 0.5)));
  const avg = rows.reduce((s, r) => s + r.body_norm.length, 0) / Math.max(rows.length, 1);
  const found = [];
  for (const [r, heads, bodies] of stats) {
    if (heads.filter(h => h > 0).length < Math.min(2, groups.length) || !heads.every((h, i) => h + bodies[i])) continue;
    const k = 1.2 * (0.25 + 0.75 * r.body_norm.length / avg);
    const score = idf.reduce((s, w, i) => s + w * (2 * (heads[i] > 0) + bodies[i] / (bodies[i] + k)), 0);
    found.push([score, r.day, r]);
  }
  if (!found.length) return '';
  found.sort((a, b) => b[0] - a[0] || (b[1] < a[1] ? -1 : b[1] > a[1] ? 1 : 0));
  const shown = found.slice(0, top).map(x => x[2]);
  const folders = new Set(shown.map(r => tilde(dirname(r.path))));
  const one = folders.size === 1;
  const lines = ['Claude 记忆（整理过的结论，对题就先读原文件' + (one ? `，在 ${[...folders][0]}/` : '') + '）：'];
  for (const r of shown) lines.push(`  · ${one ? basename(r.path) : tilde(r.path)} ${r.day.slice(5)}｜${clip(r.head, 80)}`);
  if (found.length > top) lines.push(`  （另有 ${found.length - top} 条，加词可收窄）`);
  return lines.join('\n');
}

function aligned(body, normalized) {
  if (normalized.length === body.length) return normalized;
  let out = '';
  for (const ch of mask(body)) { const n = normChar(ch); out += n.length === ch.length ? n : ch.toLowerCase(); }
  return out;
}

export function excerpt(row, groups, width) {
  const body = mask(row.body);
  const text = aligned(row.body, row.normalized);
  let spots = [];
  for (const [, alts] of groups) {
    const found = alts.map(a => [text.indexOf(a), a.length]).filter(([p]) => p >= 0);
    if (found.length) spots.push(found.reduce((m, x) => (x[0] < m[0] || (x[0] === m[0] && x[1] < m[1]) ? x : m)));
  }
  spots.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!spots.length) spots = [[0, 0]];
  const radius = Math.max(24, Math.floor((Math.floor(width / spots.length) - Math.max(...spots.map(s => s[1]))) / 2));
  const windows = [];
  for (const [pos, n] of spots) {
    const a = Math.max(0, pos - radius), b = Math.min(body.length, pos + n + radius);
    if (windows.length && a <= windows[windows.length - 1][1]) windows[windows.length - 1][1] = Math.max(windows[windows.length - 1][1], b);
    else windows.push([a, b]);
  }
  const out = windows.map(([a, b]) => (a ? '…' : '') + plain(body.slice(a, b)).trim() + (b < body.length ? '…' : '')).join('');
  return clip(out.replaceAll('……', '…'), width);
}

const lineOf = (row, text) => `[${row.id.slice(0, 10)}] ${row.day.slice(5)} L${row.start} ${row.clock} ${speaker(row.role)}：${text}`;

function topicWords(db, info, entries, groups, meta, tools, top = 8) {
  const alts = groups.flatMap(([, al]) => al);
  const asked = new Map(entries.map(([key, s]) => [key, s.rids.filter(rid => tools.said(meta.get(rid))).slice(0, 3)]));
  const rids = [...asked.values()].flat();
  const texts = new Map();
  for (let i = 0; i < rids.length; i += 500) {
    const batch = rids.slice(i, i + 500);
    for (const r of db.prepare(`SELECT rid, normalized FROM chunks WHERE rid IN (${batch.map(() => '?').join(',')})`).all(...batch)) texts.set(r.rid, r.normalized);
  }
  const seen = new Map();
  for (const [key] of entries) {
    const bag = phrases(info.get(key).title_norm, alts);
    for (const rid of asked.get(key)) {
      const text = texts.get(rid) || '';
      if (machine(text)) continue;
      const hits = alts.map(a => text.indexOf(a)).filter(p => p >= 0);
      const pos = hits.length ? Math.min(...hits) : 0;
      for (const w of phrases(text.slice(Math.max(0, pos - 40), pos + 40), alts)) bag.add(w);
    }
    for (const w of bag) seen.set(w, (seen.get(w) || 0) + 1);
  }
  const df = new Map();
  for (const about of info.values()) for (const t of phrases(about.title_norm)) df.set(t, (df.get(t) || 0) + 1);
  const score = new Map();
  for (const [t, c] of seen) if (c >= 2 && !alts.some(a => t.includes(a) || a.includes(t))) score.set(t, c * Math.log((info.size + 1) / ((df.get(t) || 0) + 1)));
  return [...score.keys()].sort((a, b) => score.get(b) - score.get(a) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, top).map(t => [t, seen.get(t)]);
}

export function budgeted(blocks, budget, unit = '块') {
  const out = [];
  let used = 0;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (used + block.length + 1 > budget) {
      if (!out.length || i === 1) out.push(block.slice(0, Math.max(0, budget - used - 20)) + '…');
      const left = blocks.length - out.length;
      if (left > 0) out.push(`（另有 ${left} ${unit}超出字符预算；缩小范围或加 --budget）`);
      break;
    }
    out.push(block);
    used += block.length + 1;
  }
  return out.join('\n');
}

const cmpTuple = (a, b) => { for (let i = 0; i < a.length; i++) { const x = +a[i], y = +b[i]; if (x !== y) return x < y ? -1 : 1; } return 0; };
const desc = key => (a, b) => cmpTuple(key(b), key(a));

export function search(db, args, ctx) {
  const { config, cmd = 'session-history' } = ctx;
  const clock = createClock(config), tools = roleTools(config.userLabel);
  const groups = parseQuery(args.query);
  if (!groups.length) throw new UsageError('请提供至少一个关键词。');
  let keys = null;
  if (args.session) {
    keys = resolveSessions(db, args.session, args.agent);
    if (!keys.length) return `没有匹配 ${args.session} 的会话。`;
  }
  const [where, params] = chunkFilters(args, keys, clock, tools);
  const total = db.prepare('SELECT count(*) n FROM chunks').get().n || 1;
  const meta = new Map(), hits = new Map(), df = [];
  groups.forEach(([, alts], g) => {
    const matched = new Set();
    for (const alt of alts) {
      for (const row of match(db, alt, where, params)) {
        meta.set(row.rid, row);
        if (!hits.has(row.rid)) hits.set(row.rid, new Map());
        const h = hits.get(row.rid);
        h.set(g, (h.get(g) || 0) + Math.max(row.tf, 1));
        matched.add(row.rid);
      }
    }
    df.push(matched.size);
  });
  const idf = df.map(n => Math.log(1 + total / (n + 0.5)));
  const head = '词频 ' + groups.map(([label], i) => `${label} ${df[i]}块`).join(' · ');
  // 记忆是跨会话的结论，限定了会话、agent 或发言人时不列。
  const notes = keys || args.agent || args.role || !config.memoryHints ? '' : memoryNotes(db, groups);
  if (!hits.size) {
    return [head, notes, (notes ? '日志' : '') + '未查到记录。可换同义词（词内用 | 连接任选）、减少词或放宽日期；不能据此断言从未发生。'
      + `接口名、参数、报错原文等多只在工具里：对相关会话用 ${cmd} raw <会话ID> 词 查原始记录。`].filter(Boolean).join('\n');
  }
  const weight = rid => {
    const h = hits.get(rid);
    let s = 0;
    for (const [g, tf] of h) s += idf[g] * Math.log1p(tf);
    return [h.size, s, tools.said(meta.get(rid))];
  };
  const fetch = rids => db.prepare(`SELECT * FROM chunks WHERE rid IN (${rids.map(() => '?').join(',')})`).all(...rids)
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || a.turn - b.turn || a.part - b.part);

  if (keys) {
    const best = [...hits.keys()].sort(desc(weight)).slice(0, args.limit);
    const info = keys[0];
    const out = [head + `｜会话 ${info.agent} ${shortSid(info.session)}「${info.title}」内按时间列 ${best.length}/${hits.size} 块`];
    for (const r of fetch(best)) out.push(lineOf(r, excerpt(r, groups, args.snippet)));
    return budgeted(out, args.budget);
  }

  const count = groups.length;
  const info = new Map(db.prepare('SELECT * FROM sessions').all().map(r => [`${r.agent}\u0000${r.session}`, r]));
  const stats = new Map();
  for (const [rid, found] of hits) {
    const r = meta.get(rid), key = `${r.agent}\u0000${r.session}`;
    if (!stats.has(key)) stats.set(key, { tf: Array(count).fill(0), n: Array(count).fill(0), asked: Array.from({ length: count }, () => new Set()), turns: new Map(), cooc: 0, rids: [] });
    const s = stats.get(key), spot = `${r.day}|${r.turn}`, user = tools.said(r);
    for (const [g, tf] of found) { s.tf[g] += tf; s.n[g] += 1; if (user) s.asked[g].add(spot); }
    if (user) { if (!s.turns.has(spot)) s.turns.set(spot, new Set()); for (const g of found.keys()) s.turns.get(spot).add(g); }
    s.cooc += found.size === count ? 1 : 0;
    s.rids.push(rid);
  }
  const todayMs = Date.parse(clock.today() + 'T00:00:00Z');
  for (const [key, s] of stats) {
    const about = info.get(key);
    // 题目（各家自起的标题或用户开场的请求）和用户原话最能说明"这场会话是关于什么的"，助手顺口提到的词权重低。
    const titled = new Set([...Array(count).keys()].filter(g => groups[g][1].some(a => about.title_norm.includes(a))));
    const covered = [...Array(count).keys()].filter(g => s.n[g]);
    let rel = 0;
    for (const g of covered) rel += idf[g] * (1 + 0.5 * Math.log1p(s.tf[g]) + Math.min(1, s.n[g] / Math.max(about.chunks, 1)) + Math.log1p(s.asked[g].size) + 2 * titled.has(g));
    if (count > 1) {
      if (titled.size === count) rel *= 2;
      else if ([...s.turns.values()].some(found => new Set([...found, ...titled]).size === count)) rel *= 1.6;
      else if (s.cooc) rel *= 1.3;
    }
    const age = Math.max(Math.round((todayMs - Date.parse(about.last_day + 'T00:00:00Z')) / 86400000), 0);
    s.score = rel * (0.75 + 0.25 * 0.5 ** (age / 60));
    s.covered = covered.length;
    s.titled = titled;
  }
  const full = [...stats.keys()].filter(k => stats.get(k).covered === count);
  const pool = full.length ? full : [...stats.keys()];
  const ranked = args.sort === 'recent'
    ? [...pool].sort((a, b) => { const x = info.get(a), y = info.get(b); const kx = x.last_day + ' ' + x.last_clock, ky = y.last_day + ' ' + y.last_clock; return kx < ky ? 1 : kx > ky ? -1 : 0; })
    : [...pool].sort(desc(k => [stats.get(k).covered, stats.get(k).score]));
  const byAgent = new Map();
  for (const k of pool) { const a = info.get(k).agent; byAgent.set(a, (byAgent.get(a) || 0) + 1); }
  const agents = [...byAgent].sort((a, b) => b[1] - a[1]).map(([a, n]) => `${a} ${n}`).join(' · ');
  const days = span(pool.map(k => info.get(k).first_day).sort()[0], pool.map(k => info.get(k).last_day).sort().at(-1));
  let scope;
  if (full.length) {
    const together = full.filter(k => stats.get(k).cooc).length;
    scope = `${full.length} 个会话含全部词` + (count > 1 ? `（${together} 个同块共现）` : '');
  } else scope = `没有会话同时含全部词，按命中词数列 ${pool.length} 个会话`;
  // 范围宽时只列题目：几十个会话的原文片段大多无关，先让调用方看题目挑会话或加词收窄。
  const broad = !args.snippets && pool.length > 3 * args.limit;
  const out = [`${head}｜${scope}：${agents}｜${days}`, ...(notes ? [notes] : [])];
  if (broad) {
    const words = topicWords(db, info, ranked.slice(0, 200).map(k => [k, stats.get(k)]), groups, meta, tools);
    const tips = words.map(([w, n]) => `${w} ${n}`).join(' · ') || '无';
    out.push(`范围宽：${pool.length} 个会话，只列题目。常同现的词（会话数）：${tips}。`
      + '加一个词再搜；看某一场用 outline <会话ID> 或 search 词 --session <会话ID>；--snippets 强制给原文');
  }
  // 同一 agent 同题的会话（批量子任务、重开的同一问题）只列最相关的一个，其余计数。
  const shown = [], lead = new Map(), twins = new Map();
  const room = broad ? Math.max(args.limit, 8) : args.limit;
  for (const key of ranked) {
    const tag = `${info.get(key).agent}\u0000${info.get(key).title}`;
    if (lead.has(tag)) twins.set(lead.get(tag), (twins.get(lead.get(tag)) || 0) + 1);
    else if (shown.length < room) { if (info.get(key).title) lead.set(tag, key); shown.push(key); }
  }
  shown.forEach((key, i) => {
    const s = stats.get(key), about = info.get(key);
    const missing = full.length ? '' : ' 缺：' + [...Array(count).keys()].filter(g => !s.n[g]).map(g => groups[g][0]).join('、');
    const same = twins.get(key) ? `（另有 ${twins.get(key)} 个同题会话）` : '';
    const lines = [`${mark(i)} ${span(about.first_day, about.last_day)} ${about.agent} ${shortSid(about.session)} `
      + `${about.turns}轮 命中${s.rids.length}块「${about.title}」${same}${missing}`];
    if (broad) {
      if (!s.titled.size) {
        let best = null, bestKey = null;
        for (const rid of s.rids) { const k = [tools.said(meta.get(rid)), ...weight(rid)]; if (!best || cmpTuple(k, bestKey) > 0) { best = rid; bestKey = k; } }
        const row = fetch([best])[0];
        lines.push('   ↳ ' + lineOf(row, excerpt(row, groups, 80)));
      }
    } else {
      const picked = [], turnsSeen = new Set();
      for (const rid of [...s.rids].sort(desc(weight))) {
        const spot = `${meta.get(rid).day}|${meta.get(rid).turn}`;
        if (!turnsSeen.has(spot)) { picked.push(rid); turnsSeen.add(spot); }
        if (picked.length >= (i < 3 ? 2 : 1)) break;
      }
      for (const r of fetch(picked)) lines.push('   ' + lineOf(r, excerpt(r, groups, args.snippet)));
    }
    out.push(lines.join('\n'));
  });
  return budgeted(out, args.budget, '个会话');
}

export function get(db, args, ctx) {
  const tools = roleTools(ctx.config.userLabel);
  const hit = findChunk(db, args.id);
  const span_ = Math.min(Math.max(args.context, 0), 5);
  const rows = db.prepare('SELECT * FROM chunks WHERE path=? AND session=? AND turn BETWEEN ? AND ? ORDER BY turn, part')
    .all(hit.path, hit.session, hit.turn - span_, hit.turn + span_);
  const about = resolveSessions(db, hit.session, hit.agent);
  const head = `${hit.path}｜${hit.agent} ${shortSid(hit.session)}「${about.length ? about[0].title : ''}」`;
  // 预算先给命中块，再按距离向外扩；同距离时用户发言看后文，助手发言看前文。
  const laterFirst = tools.isUser(hit.role);
  const priority = r => {
    const dist = Math.abs(r.turn - hit.turn);
    const side = laterFirst ? r.turn < hit.turn : r.turn > hit.turn;
    return [r.rid !== hit.rid, dist, side, dist === 0 ? Math.abs(r.part - hit.part) : r.part];
  };
  const chosen = new Set();
  let remaining = args.budget - head.length;
  for (const r of [...rows].sort((a, b) => cmpTuple(priority(a), priority(b)))) {
    const cost = r.body.length + 60;
    if (cost > remaining && r.rid !== hit.rid) break;
    chosen.add(r.rid);
    remaining -= cost;
  }
  // 同一发言的相邻块去掉重叠后拼回一段，只在段首标一次行号与发言人。
  const out = [head];
  let prev = null, gap = false;
  for (const r of rows) {
    if (!chosen.has(r.rid)) { gap = prev !== null; continue; }
    let body = r.body;
    if (r.rid === hit.rid && body.length > args.budget - head.length - 80) body = body.slice(0, Math.max(0, args.budget - head.length - 100)) + '…';
    const last = out[out.length - 1];
    if (prev !== null && !gap && prev.turn === r.turn && prev.part === r.part - 1 && typeof last === 'object') {
      last.end = r.end; last.text += body.slice(OVERLAP); last.hit ||= r.rid === hit.rid;
    } else {
      if (gap) out.push('……');
      out.push({ row: r, end: r.end, text: body, hit: r.rid === hit.rid });
    }
    prev = r; gap = false;
  }
  const render = seg => {
    if (typeof seg === 'string') return seg;
    const r = seg.row;
    const where = `L${r.start}` + (seg.end !== r.start ? `-${seg.end}` : '');
    const ident = seg.hit ? hit.id : r.id;
    return `${seg.hit ? '▶ ' : ''}[${ident.slice(0, 10)}] ${where} ${r.clock} ${speaker(r.role)}\n${seg.text.replace(/^\n+|\n+$/g, '')}`;
  };
  let text = out.map(render).join('\n');
  const omitted = rows.length - chosen.size;
  if (omitted) text += `\n（${omitted} 块因预算未显示；加 --budget，或按行号读 ${hit.path}）`;
  return text;
}

function pickSession(db, target, agent) {
  let keys = resolveSessions(db, target, agent);
  if (!keys.length) { const chunk = findChunk(db, target, false); if (chunk) keys = resolveSessions(db, chunk.session, chunk.agent); }
  if (!keys.length) return [null, `没有匹配 ${target} 的会话或块 ID。`];
  if (keys.length > 1) return [null, '有多个会话匹配，请多给几位或加 --agent：\n' + keys.slice(0, 10)
    .map(k => `  ${k.agent} ${k.session} ${span(k.first_day, k.last_day)}「${k.title}」`).join('\n')];
  return [keys[0], null];
}
export { pickSession };

export function outline(db, args, ctx) {
  const tools = roleTools(ctx.config.userLabel);
  const [about, message] = pickSession(db, args.target, args.agent);
  if (!about) return message;
  const rows = db.prepare('SELECT * FROM chunks WHERE agent=? AND session=? ORDER BY day, turn, part').all(about.agent, about.session);
  const first = rows.filter(r => r.part === 0);
  const notices = first.filter(r => tools.isUser(r.role) && machine(r.body)).length;
  const paths = [...new Set(rows.map(r => r.path))].join('、');
  const head = `${about.agent} ${shortSid(about.session)}「${about.title}」｜${span(about.first_day, about.last_day)} `
    + `${about.first_clock} 起｜${about.turns}轮（${ctx.config.userLabel} ${about.user_turns}）｜${paths}`
    + (notices ? `｜略去 ${notices} 条后台任务通知` : '');
  const shown = first.filter(r => (args.all || tools.isUser(r.role)) && !(tools.isUser(r.role) && machine(r.body)));
  const closing = [...first].reverse().find(r => !tools.isUser(r.role));
  const tail = closing && !args.all ? '末轮 ' + lineOf(closing, clip(plain(closing.body), 160)) : '';
  const room = args.budget - head.length - tail.length - 40;
  const width = Math.max(40, Math.min(args.width, Math.floor(room / Math.max(shown.length, 1)) - 32));
  let lines = shown.map(r => lineOf(r, clip(plain(r.body), width)));
  if (lines.reduce((s, l) => s + l.length + 1, 0) > room) {
    const keep = Math.max(2, Math.floor(room / (width + 33)));
    const headN = Math.floor(keep / 2), tailN = keep - headN;
    lines = [...lines.slice(0, headN), `……（中间 ${lines.length - keep} 条略；加 --budget 或用 search --session 定位）`, ...lines.slice(-tailN)];
  }
  return [head, ...lines, ...(tail ? [tail] : [])].join('\n');
}

export function timeline(db, args, ctx) {
  const clock = createClock(ctx.config);
  let since = parseDay(args.since, clock);
  if (!since) since = db.prepare('SELECT max(last_day) d FROM sessions').get().d || clock.today();
  const until = parseDay(args.until, clock) || '9999-12-31';
  const sql = 'SELECT * FROM sessions WHERE last_day>=? AND first_day<=?' + (args.agent ? ' AND agent=?' : '') + ' ORDER BY first_day DESC, first_clock, agent, session';
  const rows = db.prepare(sql).all(since, until, ...(args.agent ? [args.agent] : []));
  const shown = rows.filter(r => args.all || r.chars >= 300);
  const out = [];
  let day = null;
  for (const r of shown) {
    if (r.first_day !== day) { day = r.first_day; out.push(day); }
    out.push(`  ${r.first_clock} ${r.agent} ${shortSid(r.session)} ${r.turns}轮「${r.title}」`);
  }
  const hidden = rows.length - shown.length;
  const note = `（${since} 起共 ${rows.length} 个会话` + (hidden ? `，隐藏 ${hidden} 个不足 300 字的，加 --all 显示）` : '）');
  return out.length ? budgeted([note, ...out], args.budget, '行') : note;
}

export const _home = home;
