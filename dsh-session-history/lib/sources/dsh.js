// DeepSeek Harness：~/.dsh/sessions/<编码后的 cwd>/<会话>/session[.vN].jsonl.zstd（同目录取版本最高的）。
import { join, dirname, basename } from 'node:path';
import { home, expand, entries, isDir, isFile, readText } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { tidy } from '../markdown.js';
import { renderDays, excluded, str } from './common.js';

// v4 之前没有 source.kind，靠前缀过滤系统注入。
const INJECT = ['<system-reminder', '<goal_round', '<goal_blocked', 'Current runtime context', 'Current DSH file policy',
  'Approval prompts are disabled', 'Its closing message:'];
const machinery = text => !text || INJECT.some(p => text.startsWith(p));
const NAME = /^session(?:\.v(\d+))?\.jsonl\.zstd$/;

export function locate(env = process.env) {
  const base = env.DSH_HOME ? expand(env.DSH_HOME) : join(home(), '.dsh');
  const agents = env.DSH_AGENTS_HOME ? expand(env.DSH_AGENTS_HOME) : join(home(), '.agents');
  return { base, sessions: join(base, 'sessions'), roots: [join(base, 'sessions')], skills: [join(base, 'skills'), join(agents, 'skills')] };
}

export function files(paths) {
  const picked = new Map();
  for (const a of entries(paths.sessions)) {
    const ad = join(paths.sessions, a.name);
    if (!isDir(ad)) continue;
    for (const b of entries(ad)) {
      const bd = join(ad, b.name);
      if (!isDir(bd)) continue;
      for (const f of entries(bd)) {
        const m = NAME.exec(f.name);
        if (!m || !isFile(join(bd, f.name))) continue;
        const version = Number(m[1] ?? 0);
        if (!picked.has(bd) || version > picked.get(bd)[0]) picked.set(bd, [version, join(bd, f.name)]);
      }
    }
  }
  return sortPaths([...picked.values()].map(v => v[1]));
}

const included = cwd => !cwd || !(cwd === '/tmp' || cwd.startsWith('/tmp/') || cwd.startsWith('/private/tmp') || cwd.includes('/.tmp/'));

export function parse(path) {
  const turns = [];
  let sid = basename(dirname(path)), cwd = null, first = true, title = '', fallback = '';
  for (const raw of jsonLines(readText(path))) {
    const line = strip(raw);
    if (!line) continue;
    const ev = parseJson(line);
    if (ev === undefined) continue;
    const t = isObject(ev) ? ev.type : undefined;
    if (first) {
      first = false;
      if (t === 'session') {
        sid = ev.id || sid;
        cwd = ev.cwd || '';
        if (!included(cwd) || (ev.delegationDepth || 0) > 0) return { skip: true, sid, cwd, turns: [], title: '' };
      }
      continue; // 首行不是 session 也继续（视为 cwd 未知，纳入）
    }
    if (!isObject(ev)) continue;
    const data = isObject(ev.data) ? ev.data : {};
    if (t === 'session/title') {
      const text = strip(str(data.title));
      if (text) { if (isObject(data.source) && data.source.kind === 'fallback') fallback = text; else title = text; }
      continue;
    }
    const ts = ev.time;
    if (typeof ts !== 'number' || !ts) continue;
    if (t === 'user/message') {
      if (isObject(data.source) && ![undefined, null, 'user'].includes(data.source.kind)) continue; // runtime-context 等注入
      const content = data.content, pieces = [];
      if (typeof content === 'string') {
        if (!machinery(strip(content))) pieces.push(strip(content));
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (!isObject(b)) continue;
          if (b.type === 'text') { const txt = strip(str(b.text)); if (!machinery(txt)) pieces.push(txt); }
          else if (b.type === 'image') pieces.push('[🖼️ 图片]');
          else if (b.type === 'file' || b.type === 'document') {
            const name = b.name || b.filename || '';
            pieces.push(name ? `[📎 附件: ${name}]` : '[📎 附件]');
          }
        }
      }
      if (pieces.length) turns.push([ts, 'user', pieces.join('\n\n')]);
    } else if (t === 'assistant/message') {
      const content = isObject(data.message) ? data.message.content : undefined, pieces = [];
      if (typeof content === 'string') { const txt = strip(content); if (txt) pieces.push(txt); }
      else if (Array.isArray(content)) for (const b of content) if (isObject(b) && b.type === 'text') { const txt = strip(str(b.text)); if (txt) pieces.push(txt); }
      if (pieces.length) turns.push([ts, 'assistant', pieces.join('\n\n')]);
    }
  }
  return { skip: false, sid, cwd, turns, title: title || fallback };
}

export function build(entriesList, options = {}) {
  const all = [], titles = {}, notes = [];
  for (const { data } of entriesList) {
    if (data.skip || excluded(data.cwd, options.excludeCwds)) { notes.push(data.sid); continue; }
    if (data.title && tidy(data.title)) titles[data.sid] = tidy(data.title);
    for (const [ts, role, text] of data.turns) all.push([ts, role, text, data.sid]);
  }
  return { turns: all, titles, count: all.length, skipped: notes.length };
}

export function render(all, clock, userLabel, name = 'DSH') {
  return renderDays(all, clock, { user: `🧑 ${userLabel}`, assistant: `🤖 ${name}` });
}

export function rawFiles(paths, key) {
  return files(paths).filter(p => basename(dirname(p)).replace(/^session-/, '').startsWith(key));
}

export default { id: 'dsh', folder: 'DSH', name: 'DSH', version: 1, locate, files, parse, build, render, rawFiles };
