// Pi：~/.pi/agent/sessions/*/*.jsonl。保留各分支实际消息及 id／parent／源行号／stop，便于核查分支与中止。
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { home, expand, filesTwoDeep } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, show, isObject } from '../py.js';
import { tidy, demote } from '../markdown.js';
import { excluded } from './common.js';

export function locate(env = process.env) {
  const base = env.PI_CODING_AGENT_DIR ? expand(env.PI_CODING_AGENT_DIR) : join(home(), '.pi/agent');
  const agents = env.AGENTS_HOME ? expand(env.AGENTS_HOME) : join(home(), '.agents');
  return { base, sessions: join(base, 'sessions'), roots: [join(base, 'sessions')], skills: [join(base, 'skills'), join(agents, 'skills')] };
}

export function files(paths) {
  return sortPaths(filesTwoDeep(paths.sessions, name => name.endsWith('.jsonl')));
}

const tmp = cwd => cwd.startsWith('/tmp/') || cwd.startsWith('/private/tmp/') || cwd === '/tmp' || cwd === '/private/tmp' || cwd.includes('/.tmp/');

export function parse(path) {
  const parsed = [], warnings = [];
  const lines = jsonLines(readFileSync(path, 'utf8'));
  lines.forEach((line, i) => {
    const e = parseJson(line);
    if (e === undefined) warnings.push(`WARNING malformed JSONL: ${path}:${i + 1}`);
    else parsed.push([i + 1, e]);
  });
  const header = parsed.map(([, e]) => e).find(e => isObject(e) && e.type === 'session') || {};
  const cwd = typeof header.cwd === 'string' ? header.cwd : '';
  const sid = Object.hasOwn(header, 'id') ? header.id : basename(path, '.jsonl');
  const names = parsed.filter(([, e]) => isObject(e) && e.type === 'session_info').map(([, e]) => tidy(e.name));
  const records = [], seen = new Set();
  for (const [n, e] of parsed) {
    if (!isObject(e)) continue;
    const msg = isObject(e.message) ? e.message : {};
    const role = msg.role;
    if (e.type !== 'message' || !['user', 'assistant'].includes(role)) continue;
    const eid = Object.hasOwn(e, 'id') ? e.id : String(n);
    const seenKey = show(eid);
    if (seen.has(seenKey)) continue;
    seen.add(seenKey);
    const content = msg.content ?? [];
    let text;
    if (typeof content === 'string') text = strip(content);
    else text = strip((Array.isArray(content) ? content : [])
      .filter(b => isObject(b) && ['text', 'image'].includes(b.type))
      .map(b => b.type === 'text' ? String(b.text ?? '') : '[图片]').join('\n\n'));
    if (!text) continue;
    const ts = e.timestamp || msg.timestamp;
    records.push([ts, role, text, eid, e.parentId ?? null, n, Object.hasOwn(msg, 'stopReason') ? show(msg.stopReason) : '']);
  }
  return { sid, cwd, title: names.length && names[names.length - 1] ? names[names.length - 1] : '', records, warnings };
}

export function build(entries, options = {}) {
  const turns = [], titles = {};
  for (const { path, data } of entries) {
    if (tmp(data.cwd) || excluded(data.cwd, options.excludeCwds)) continue;
    if (data.title) titles[show(data.sid)] = data.title;
    for (const r of data.records) turns.push([...r, show(data.sid), path]);
  }
  return { turns, titles, count: entries.length };
}

/** 每天一份；会话按首次出现的顺序，不重排、不合并不同消息。 */
export function render(turns, clock, userLabel) {
  const days = new Map();
  for (const [ts, role, text, eid, parent, n, stop, sid, source] of turns) {
    const day = clock.day(ts);
    let sessions = days.get(day);
    if (!sessions) days.set(day, sessions = new Map());
    const key = `${sid}\u0000${source}`;
    if (!sessions.has(key)) sessions.set(key, { sid, source, turns: [] });
    sessions.get(key).turns.push([ts, role, text, eid, parent, n, stop]);
  }
  const bodies = new Map();
  for (const [day, sessions] of days) {
    const out = [];
    for (const { sid, source, turns: list } of sessions.values()) {
      out.push(`# ${sid}\n\n<!-- source: ${source} -->\n`);
      for (const [ts, role, text, eid, parent, n, stop] of list) {
        const label = role === 'user' ? userLabel : 'Pi';
        out.push(`## ${clock.hm(ts)}  ${label}\n\n<!-- id: ${show(eid)}; parent: ${show(parent)}; source-line: ${n}; stop: ${stop} -->\n\n${demote(text)}\n`);
      }
    }
    bodies.set(day, out.join('\n'));
  }
  return bodies;
}

export function rawFiles(paths, key) {
  return files(paths).filter(p => basename(p).includes(`_${key}`));
}

export default { id: 'pi', folder: 'Pi', name: 'Pi', version: 1, locate, files, parse, build, render, rawFiles };
