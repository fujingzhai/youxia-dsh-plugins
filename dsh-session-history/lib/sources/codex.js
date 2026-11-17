// Codex：~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl；闲置 7 天的会话会被压成 .jsonl.zst，两种都读。
import { basename, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { home, expand, entries, isDir, readText, exists } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { tidy } from '../markdown.js';
import { renderDays, tmpPrefix, dotTmp, excluded, ms, str } from './common.js';

const MACHINERY = ['<recommended_plugins>', '# AGENTS.md instructions', '<environment_context>', '<permissions instructions>',
  '<app-context>', '<collaboration_mode>', '<apps_instructions>', '<skills_instructions>', '<plugins_instructions>'];

export function locate(env = process.env) {
  const base = env.CODEX_HOME ? expand(env.CODEX_HOME) : join(home(), '.codex');
  const agents = env.AGENTS_HOME ? expand(env.AGENTS_HOME) : join(home(), '.agents');
  return { base, sessions: join(base, 'sessions'), roots: [join(base, 'sessions')], skills: [join(agents, 'skills'), join(base, 'skills')] };
}

function rollouts(root) {
  const out = [];
  for (const y of entries(root)) {
    const yd = join(root, y.name);
    if (!isDir(yd)) continue;
    for (const m of entries(yd)) {
      const md = join(yd, m.name);
      if (!isDir(md)) continue;
      for (const d of entries(md)) {
        const dd = join(md, d.name);
        if (!isDir(dd)) continue;
        for (const f of entries(dd)) if (f.name.startsWith('rollout-')) out.push(join(dd, f.name));
      }
    }
  }
  return out;
}

/** 同一会话若明文与 .zst 并存（续聊时解压回明文的间隙），取明文。 */
export function files(paths) {
  const all = rollouts(paths.sessions);
  const plain = new Set(all.filter(p => p.endsWith('.jsonl')));
  const zst = all.filter(p => p.endsWith('.jsonl.zst') && !plain.has(p.slice(0, -4)));
  return sortPaths([...plain, ...zst]);
}

function contentText(content) {
  if (typeof content === 'string') return strip(content);
  if (!Array.isArray(content)) return '';
  const pieces = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    const type = block.type;
    if (['input_text', 'output_text', 'text'].includes(type)) {
      const text = strip(str(block.text));
      if (text) pieces.push(text);
    } else if (['input_image', 'image'].includes(type)) pieces.push('[图片]');
    else if (['input_file', 'file', 'document'].includes(type)) {
      const name = block.filename || block.name || '';
      pieces.push(name ? `[附件: ${name}]` : '[附件]');
    }
  }
  return strip(pieces.join('\n\n'));
}

const machinery = text => { const s = strip(text); return !s || MACHINERY.some(p => s.startsWith(p)); };

export function parse(path) {
  let meta = null;
  const turns = [];
  for (const line of jsonLines(readText(path))) {
    if (!strip(line)) continue;
    const ev = parseJson(line);
    if (!isObject(ev)) continue;
    if (meta === null && ev.type === 'session_meta') meta = isObject(ev.payload) ? ev.payload : {};
    if (ev.type !== 'response_item') continue;
    const payload = isObject(ev.payload) ? ev.payload : {};
    if (payload.type !== 'message' || !['user', 'assistant'].includes(payload.role)) continue;
    const text = contentText(payload.content);
    if (machinery(text) || !ev.timestamp) continue;
    turns.push([ev.timestamp, payload.role, text]);
  }
  meta ??= {};
  return { cwd: meta.cwd ?? null, sid: String(meta.id || basename(path).split('.')[0]).slice(0, 8), turns };
}

/**
 * options.onlyCwds：只收这些工作目录（精确匹配）；留空则收临时目录以外的全部。
 * options.since：只收此时刻之后的发言（ISO）。
 */
export function build(entries, options = {}, paths) {
  const only = (options.onlyCwds || []).map(expand).filter(Boolean);
  const since = options.since ? ms(options.since) : null;
  const all = [];
  for (const { data } of entries) {
    if (only.length ? !only.includes(data.cwd) : (tmpPrefix(data.cwd) || dotTmp(data.cwd) || excluded(data.cwd, options.excludeCwds))) continue;
    for (const [ts, role, text] of data.turns) if (since === null || ms(ts) > since) all.push([ts, role, text, data.sid]);
  }
  const titles = {};
  const index = paths && join(paths.base, 'session_index.jsonl');
  if (index && exists(index)) {
    for (const line of jsonLines(readFileSync(index, 'utf8'))) {
      const e = parseJson(line);
      if (isObject(e) && typeof e.id === 'string' && tidy(e.thread_name)) titles[e.id.slice(0, 8)] = tidy(e.thread_name);
    }
  }
  return { turns: all, titles, count: all.length };
}

export function render(all, clock, userLabel) {
  return renderDays(all, clock, { user: userLabel, assistant: 'Codex' });
}

export function rawFiles(paths, key) {
  return files(paths).filter(p => basename(p).includes(key));
}

export default { id: 'codex', folder: 'Codex', name: 'Codex', version: 1, locate, files, parse, build, render, rawFiles };
