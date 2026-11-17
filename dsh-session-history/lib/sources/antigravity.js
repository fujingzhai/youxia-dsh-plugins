// Antigravity（桌面版与 CLI）：~/.gemini/antigravity[-cli]/brain/<会话>/.system_generated/logs/transcript_full.jsonl。
import { basename, dirname, join } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { home, expand, entries, isDir, isFile } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { tidy } from '../markdown.js';
import { renderDays, tmpPrefix, excluded } from './common.js';

export function locate(env = process.env, options = {}) {
  const base = join(home(), '.gemini');
  const roots = [join(base, 'antigravity/brain'), join(base, 'antigravity-cli/brain'), ...(options.extraRoots || []).map(expand)];
  return { base, roots, marks: [join(base, 'antigravity'), join(base, 'antigravity-cli')], skills: [join(base, 'config/skills'), join(base, 'antigravity/skills')] };
}

const size = path => { try { return statSync(path).size; } catch { return 0; } };

export function files(paths) {
  const out = [];
  for (const root of paths.roots) {
    if (!isDir(root)) continue;
    for (const conv of sortPaths(entries(root).map(d => join(root, d.name)))) {
      if (basename(conv).startsWith('.') || !isDir(conv)) continue;
      const logs = join(conv, '.system_generated/logs');
      if (!isDir(logs)) continue;
      let file = join(logs, 'transcript_full.jsonl');
      if (!isFile(file) || size(file) === 0) file = join(logs, 'transcript.jsonl');
      if (isFile(file)) out.push(file);
    }
  }
  return out;
}

function userText(raw) {
  const req = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/.exec(raw);
  let text = req ? strip(req[1]) : strip(raw);
  text = strip(text.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/g, ''));
  text = strip(text.replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/g, ''));
  const pieces = text ? [text] : [];
  if (raw.includes('uploaded') && raw.toLowerCase().includes('image')) pieces.push('[🖼️ 图片]');
  return strip(pieces.join('\n\n'));
}

const WORKSPACE = /<user_information>[\s\S]*?([/\p{L}\p{N}_\-.]+)\s*->/u;

export function parse(path) {
  const turns = [];
  let workspace = null;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { text = ''; }
  for (const line of jsonLines(text)) {
    if (!strip(line)) continue;
    const d = parseJson(line);
    if (!isObject(d)) continue;
    const { type, created_at: ts, content } = d;
    if (!workspace && typeof content === 'string' && content) {
      const m = WORKSPACE.exec(content);
      if (m) workspace = strip(m[1]);
    }
    if (!ts) continue;
    if (type === 'USER_INPUT' && typeof content === 'string' && content) {
      const t = userText(content);
      if (t) turns.push([ts, 'user', t]);
    } else if (type === 'PLANNER_RESPONSE' && typeof content === 'string' && strip(content)) {
      turns.push([ts, 'assistant', strip(content)]);
    }
  }
  const conv = dirname(dirname(dirname(path)));
  return { sid: basename(conv).slice(0, 8), workspace, turns };
}

const excludedCwd = cwd => !!cwd && (tmpPrefix(cwd) || cwd.includes('/.tmp/') || cwd.endsWith('/.tmp'));

// protobuf 文本格式里的转义：八进制、\x、\n 等。
function unescape(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c !== 0x5c || i + 1 >= bytes.length) { out.push(c); continue; }
    const n = bytes[i + 1];
    if (n >= 0x30 && n <= 0x37) {
      let j = i + 1, v = '';
      while (j < bytes.length && j < i + 4 && bytes[j] >= 0x30 && bytes[j] <= 0x37) v += String.fromCharCode(bytes[j++]);
      out.push(parseInt(v, 8) & 0xff); i = j - 1;
    } else if (n === 0x78) {
      let j = i + 2, v = '';
      while (j < bytes.length && j < i + 4 && /[0-9a-fA-F]/.test(String.fromCharCode(bytes[j]))) v += String.fromCharCode(bytes[j++]);
      if (v) { out.push(parseInt(v, 16)); i = j - 1; } else { out.push(0x78); i += 1; }
    } else {
      out.push({ 0x6e: 0x0a, 0x74: 0x09, 0x72: 0x0d }[n] ?? n); i += 1;
    }
  }
  return Buffer.from(out);
}

function annotationTitles(paths) {
  const titles = {};
  for (const root of paths.roots) {
    const dir = join(dirname(root), 'annotations');
    for (const file of sortPaths(entries(dir).filter(d => d.name.endsWith('.pbtxt')).map(d => join(dir, d.name)))) {
      let raw;
      try { raw = readFileSync(file); } catch { continue; }
      const m = /^title:[ \t\n\r\f\v]*"((?:[^"\\]|\\[\s\S])*)"/m.exec(raw.toString('latin1'));
      if (!m) continue;
      const title = tidy(unescape(Buffer.from(m[1], 'latin1')).toString('utf8'));
      if (title) titles[basename(file, '.pbtxt').slice(0, 8)] = title;
    }
  }
  return titles;
}

export function build(entriesList, options = {}, paths) {
  const all = [];
  for (const { data } of entriesList) {
    if (excludedCwd(data.workspace) || excluded(data.workspace, options.excludeCwds)) continue;
    const roles = new Set(data.turns.map(t => t[1]));
    if (!roles.has('user') || !roles.has('assistant')) continue;
    for (const [ts, role, text] of data.turns) all.push([ts, role, text, data.sid]);
  }
  return { turns: all, titles: paths ? annotationTitles(paths) : {}, count: all.length };
}

export function render(all, clock, userLabel, name = 'Antigravity') {
  return renderDays(all, clock, { user: `🧑 ${userLabel}`, assistant: `🤖 ${name}` });
}

export function rawFiles(paths, key) {
  const found = [];
  for (const root of paths.roots) {
    for (const conv of sortPaths(entries(root).filter(d => d.name.startsWith(key)).map(d => join(root, d.name)))) {
      const logs = join(conv, '.system_generated/logs');
      const full = join(logs, 'transcript_full.jsonl');
      found.push(isFile(full) && size(full) ? full : join(logs, 'transcript.jsonl'));
    }
  }
  return found.filter(isFile);
}

export default { id: 'antigravity', folder: 'Antigravity', name: 'Antigravity', version: 1, locate, files, parse, build, render, rawFiles };
