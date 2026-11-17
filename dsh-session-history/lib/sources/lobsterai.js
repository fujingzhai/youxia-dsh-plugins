// LobsterAI（基于 OpenClaw）：<应用数据>/LobsterAI/openclaw/state/agents/*/sessions/*.jsonl*。
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { home, expand, entries, isDir, isFile } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { demote } from '../markdown.js';
import { excluded, str } from './common.js';
import { toMs } from '../clock.js';

const MACHINERY = ['[LobsterAI system instructions]', '[cron:', '[OpenClaw heartbeat poll]', '<<<BEGIN_OPENCLAW_INTERNAL_CONTEXT>>>',
  '[Subagent Context]', '[Subagent Task]', '[Session info]', 'Sender (untrusted metadata)'];
const REQUEST_MARKER = /^\[(?:Current|Scheduled) user request\]\s*$/;

/** Electron 应用数据目录：macOS ~/Library/Application Support，Windows %APPDATA%，Linux ~/.config。 */
function appData(env) {
  if (process.platform === 'darwin') return join(home(), 'Library/Application Support');
  if (process.platform === 'win32') return env.APPDATA || join(home(), 'AppData/Roaming');
  return env.XDG_CONFIG_HOME ? expand(env.XDG_CONFIG_HOME) : join(home(), '.config');
}

export function locate(env = process.env) {
  const base = join(appData(env), 'LobsterAI');
  const agentsRoot = join(base, 'openclaw/state/agents');
  return { base, agentsRoot, roots: [agentsRoot], marks: [base], skills: [join(base, 'SKILLs')],
    skillNote: 'LobsterAI 可能还要在自己的技能设置里启用新技能' };
}

export function files(paths) {
  const out = [];
  for (const sessDir of sortPaths(entries(paths.agentsRoot).map(d => join(paths.agentsRoot, d.name, 'sessions')).filter(isDir))) {
    for (const path of sortPaths(entries(sessDir).map(d => join(sessDir, d.name)))) {
      const name = basename(path);
      if (!name.includes('.jsonl') || name.includes('.trajectory') || name.includes('.deleted.')) continue;
      if (!(name.endsWith('.jsonl') || name.includes('.jsonl.reset.')) || !isFile(path)) continue;
      out.push(path);
    }
  }
  return out;
}

/** 系统信封以 [Current user request] 结尾，真实请求在最后一个标记之后；无标记按机械前缀丢弃。 */
function cleanUserText(text) {
  const t = strip(text);
  if (!t) return '';
  const lines = t.split('\n');
  let keep = null;
  for (const line of lines) {
    if (REQUEST_MARKER.test(strip(line))) { keep = []; continue; }
    if (keep) keep.push(line);
  }
  if (keep) { const s = strip(keep.join('\n')); if (s) return s; }
  if (MACHINERY.some(p => t.startsWith(p)) || t.startsWith('[Request interrupted')) return '';
  return t;
}

export function parse(path) {
  const turns = [];
  for (const line of jsonLines(readFileSync(path, 'utf8'))) {
    if (!strip(line)) continue;
    const ev = parseJson(line);
    if (!isObject(ev) || ev.type !== 'message') continue; // session / model_change / custom_message 等内部事件
    const ts = ev.timestamp;
    const msg = isObject(ev.message) ? ev.message : {};
    const content = msg.content, pieces = [];
    if (msg.role === 'user') {
      if (typeof content === 'string') { const t = cleanUserText(content); if (t) pieces.push(t); }
      else if (Array.isArray(content)) for (const b of content) {
        if (!isObject(b)) continue;
        if (b.type === 'text') { const t = cleanUserText(str(b.text)); if (t) pieces.push(t); }
        else if (b.type === 'image') pieces.push('[🖼️ 图片]');
      }
      if (pieces.length) turns.push([ts, 'user', pieces.join('\n\n')]);
    } else if (msg.role === 'assistant' && Array.isArray(content)) {
      for (const b of content) {
        if (!isObject(b)) continue;
        if (b.type === 'text') { const t = strip(str(b.text)); if (t) pieces.push(t); }
        else if (b.type === 'image') pieces.push('[🖼️ 已生成图片]');
      }
      if (pieces.length) turns.push([ts, 'assistant', pieces.join('\n\n')]);
    }
  }
  // Path.stem 只去最后一个后缀（x.jsonl.reset.N → x.jsonl.reset），取前 8 位即会话 ID 前缀。
  return { sid: basename(path).replace(/\.[^.]*$/, '').slice(0, 8), turns };
}

export function build(entriesList, options = {}) {
  const all = [];
  for (const { data } of entriesList) {
    if (!data.turns.some(t => t[1] === 'user')) continue;
    for (const [ts, role, text] of data.turns) if (ts) all.push([ts, role, text, data.sid]);
  }
  return { turns: all, titles: {}, count: all.length };
}

// 同一最终回复的两个版本（带／不带 MEDIA 行、图片标记）在合并时去重。
function core(text) {
  return text.split('\n').map(l => strip(l)).filter(s => s && !s.startsWith('MEDIA:') && !s.startsWith('[🖼️') && !s.startsWith('[📎')).join('\n');
}
function mergeConsecutive(turns) {
  const merged = [];
  for (const [ts, role, text] of turns) {
    const last = merged[merged.length - 1];
    if (last && last[1] === role) {
      const prev = core(last[2]), cur = core(text);
      if (cur === prev || (cur && prev.includes(cur))) continue;
      if (prev && cur.includes(prev)) { last[2] = text; continue; }
      last[2] = last[2] + '\n\n' + text;
    } else merged.push([ts, role, text]);
  }
  return merged;
}

export function render(all, clock, userLabel, name = 'LobsterAI') {
  const days = new Map();
  for (const [ts, role, text, sid] of all) {
    const day = clock.day(ts);
    if (!days.has(day)) days.set(day, new Map());
    const sessions = days.get(day);
    if (!sessions.has(sid)) sessions.set(sid, []);
    sessions.get(sid).push([ts, role, text]);
  }
  const bodies = new Map();
  for (const [day, sessions] of days) {
    const out = [];
    for (const [sid, turns] of [...sessions].sort((a, b) => (a[1][0][0] < b[1][0][0] ? -1 : a[1][0][0] > b[1][0][0] ? 1 : 0))) {
      out.push(`# ${sid}\n`);
      for (const [ts, role, text] of mergeConsecutive(turns)) {
        out.push(`## ${clock.hm(ts)}  ${role === 'user' ? `🧑 ${userLabel}` : `🤖 ${name}`}\n`);
        out.push(demote(text) + '\n');
      }
    }
    bodies.set(day, out.join('\n'));
  }
  return bodies;
}

export function rawFiles(paths, key) {
  return files(paths).filter(p => basename(p).startsWith(key));
}

export const _ms = toMs;
export default { id: 'lobsterai', folder: 'LobsterAI', name: 'LobsterAI', version: 1, locate, files, parse, build, render, rawFiles };
