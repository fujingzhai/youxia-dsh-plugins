// OpenCode：会话存在 SQLite 库 ~/.local/share/opencode/opencode.db（session／message／part 三表），只读打开。
// 标题行「# ses_ID · 标题」，标题取 OpenCode 自带的。0.2.x 写成「# 标题（ses_ 加 4 位）」：标题一改就成了另一场，
// 前 4 位又只是时间，同题的会话会并到一起；旧日志照常检索，整理时认作同一会话（markdown.js stillPresent）。
import { join } from 'node:path';
import { statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { home, expand, isFile } from '../files.js';
import { parseJson, strip, isObject } from '../py.js';
import { demote, tidy } from '../markdown.js';
import { excluded, str } from './common.js';

const dataHome = env => env.XDG_DATA_HOME ? expand(env.XDG_DATA_HOME) : join(home(), '.local/share');
const configHome = env => env.XDG_CONFIG_HOME ? expand(env.XDG_CONFIG_HOME) : join(home(), '.config');
const agentsHome = env => env.AGENTS_HOME ? expand(env.AGENTS_HOME) : join(home(), '.agents');

export function locate(env = process.env) {
  const base = join(dataHome(env), 'opencode');
  return { base, db: join(base, 'opencode.db'), roots: [base], marks: [base],
    skills: [join(configHome(env), 'opencode/skills'), join(home(), '.claude/skills'), join(agentsHome(env), 'skills')] };
}

export function files(paths) {
  const db = paths.db || join(paths.base, 'opencode.db');
  return isFile(db) ? [db] : [];
}

/** 库在 WAL 模式下，新写入可能还在 -wal 里，签名要把它算上。 */
export function signature(path) {
  const parts = [];
  for (const p of [path, `${path}-wal`]) { try { const s = statSync(p, { bigint: true }); parts.push(`${s.mtimeNs}:${s.size}`); } catch { parts.push('-'); } }
  return parts.join('|');
}

const THINK = /<think\b[^>]*>[\s\S]*?<\/think>\s*/g;
const TEMP = ['/private/tmp', '/tmp', '/.tmp/'];

export function parse(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const sessions = {};
    for (const r of db.prepare('SELECT id, title, directory FROM session').all()) sessions[r.id] = [r.title || '', r.directory || ''];
    const rows = db.prepare(`SELECT m.session_id AS sid, m.time_created AS ms, json_extract(m.data, '$.role') AS role,
      json_extract(p.data, '$.type') AS ptype, p.data AS pdata FROM part p JOIN message m ON p.message_id = m.id
      ORDER BY m.time_created, p.time_created`).all();
    const per = new Map();
    let cur = null, pieces = [];
    const flush = () => {
      if (cur && pieces.length) { if (!per.has(cur.sid)) per.set(cur.sid, []); per.get(cur.sid).push([cur.ms, cur.role, pieces.join('\n\n')]); }
      pieces = [];
    };
    for (const r of rows) {
      if (!cur || r.sid !== cur.sid || r.ms !== cur.ms || r.role !== cur.role) { flush(); cur = { sid: r.sid, ms: Number(r.ms), role: r.role }; }
      const d = parseJson(r.pdata);
      if (!isObject(d)) continue;
      if (r.ptype === 'text') {
        let t = strip(str(d.text));
        if (r.role === 'assistant') t = strip(t.replace(THINK, ''));
        if (t) pieces.push(t);
      } else if (r.ptype === 'file') {
        const name = d.filename || '';
        pieces.push(name ? `[🖼️ 图片: ${name}]` : '[🖼️ 图片]');
      }
    }
    flush();
    const out = [];
    for (const [sid, turns] of per) {
      if (!sessions[sid] || !turns.some(t => t[1] === 'user')) continue;
      out.push({ sid, title: sessions[sid][0], directory: sessions[sid][1], turns });
    }
    return { sessions: out };
  } finally { db.close(); }
}

export function build(entries, options = {}) {
  const all = [], titles = {};
  for (const { data } of entries) for (const s of data.sessions) {
    if (TEMP.some(p => s.directory.includes(p)) || excluded(s.directory, options.excludeCwds)) continue;
    // 「New session - 时间」是生成标题前的占位，不当标题。
    const title = /^New session\b/.test(strip(s.title)) ? '' : tidy(s.title);
    if (title) titles[s.sid] = title;
    for (const [ms, role, text] of s.turns) all.push([ms, role, text, s.sid]);
  }
  return { turns: all, titles, count: all.length };
}

const core = text => text.split('\n').map(l => strip(l)).filter(s => s && !s.startsWith('MEDIA:') && !s.startsWith('[🖼️') && !s.startsWith('[📎')).join('\n');
function merge(turns) {
  const out = [];
  for (const [ts, role, text] of turns) {
    const last = out[out.length - 1];
    if (last && last[1] === role) {
      const prev = core(last[2]), c = core(text);
      if (c === prev || (c && prev.includes(c))) continue;
      if (prev && c.includes(prev)) { last[2] = text; continue; }
      last[2] += '\n\n' + text;
    } else out.push([ts, role, text]);
  }
  return out;
}

export function render(all, clock, userLabel, name = 'OpenCode') {
  const days = new Map();
  for (const [ms, role, text, key] of all) {
    const day = clock.day(ms);
    if (!days.has(day)) days.set(day, new Map());
    const sessions = days.get(day);
    if (!sessions.has(key)) sessions.set(key, []);
    sessions.get(key).push([ms, role, text]);
  }
  const bodies = new Map();
  for (const [day, sessions] of days) {
    const out = [];
    for (const [key, turns] of [...sessions].sort((a, b) => a[1][0][0] - b[1][0][0])) {
      out.push(`# ${key}\n`);
      for (const [ms, role, text] of merge(turns)) {
        out.push(`## ${clock.hm(ms)}  ${role === 'user' ? `🧑 ${userLabel}` : `🤖 ${name}`}\n`);
        out.push(demote(text) + '\n');
      }
    }
    bodies.set(day, out.join('\n'));
  }
  return bodies;
}

// 原始记录在 SQLite 里，不是逐行的 JSONL；raw 暂不支持 OpenCode。
export const rawFiles = () => [];

export default { id: 'opencode', folder: 'OpenCode', name: 'OpenCode', version: 1, locate, files, signature, parse, build, render, rawFiles };
