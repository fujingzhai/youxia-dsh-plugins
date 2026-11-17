// Claude Code：~/.claude/projects/*/*.jsonl，另收 macOS 桌面版 Cowork 本地会话。
import { basename, dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { home, expand, filesTwoDeep, walk, isDir } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { tidy } from '../markdown.js';
import { renderDays, tmpPrefix, excluded, ms, str } from './common.js';

const INJECT = ['<system-reminder', '<command-', '<local-command-', 'Caveat:', '<user-memory', '<budget:',
  'Base directory for this skill:'];
const machinery = text => !text || INJECT.some(p => text.startsWith(p)) || text.startsWith('[Request interrupted');

function docName(block) {
  const src = isObject(block.source) ? block.source : {};
  return block.name || src.name || src.title || '';
}

export function locate(env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR ? expand(env.CLAUDE_CONFIG_DIR) : join(home(), '.claude');
  const cowork = process.platform === 'darwin' ? join(home(), 'Library/Application Support/Claude/local-agent-mode-sessions') : null;
  return { base, projects: join(base, 'projects'), cowork, roots: [join(base, 'projects'), ...(cowork ? [cowork] : [])],
    skills: [join(base, 'skills')], memory: join(base, 'projects') };
}

function coworkFiles(root) {
  if (!root || !isDir(root)) return [];
  return sortPaths(walk(root, path => path.endsWith('.jsonl') && basename(dirname(path)).endsWith('-outputs')));
}

export function files(paths) {
  return [...sortPaths(filesTwoDeep(paths.projects, name => name.endsWith('.jsonl'))), ...coworkFiles(paths.cowork)];
}

/** 一个会话文件 → 工作目录、问答、标题候选。文件不写入正文，只留轻量标记。 */
export function parse(path) {
  const turns = [];
  let cwd = '', custom = null, ai = null;
  for (const line of jsonLines(readFileSync(path, 'utf8'))) {
    if (!strip(line)) continue;
    const ev = parseJson(line);
    if (!isObject(ev)) continue;
    if (!cwd && ev.cwd) cwd = ev.cwd;
    if (ev.type === 'custom-title' || ev.type === 'ai-title') {
      const name = ev.customTitle || ev.aiTitle || null;
      if (ev.type === 'custom-title') custom = name; else ai = name;
    }
    if (ev.isMeta || ev.isSidechain) continue;
    const ts = ev.timestamp;
    const content = isObject(ev.message) ? ev.message.content : undefined;
    if (ev.type === 'user') {
      const pieces = [];
      if (typeof content === 'string') {
        if (!machinery(strip(content))) pieces.push(strip(content));
      } else if (Array.isArray(content)) {
        for (const b of content) {
          if (!isObject(b)) continue;
          if (b.type === 'text') {
            const t = strip(str(b.text));
            if (!machinery(t)) pieces.push(t);
          } else if (b.type === 'image') pieces.push('[🖼️ 图片]');
          else if (b.type === 'document') {
            const n = docName(b);
            pieces.push(n ? `[📎 附件: ${n}]` : '[📎 附件]');
          }
        }
      }
      if (pieces.length && ts) turns.push([ts, 'user', pieces.join('\n\n')]);
    } else if (ev.type === 'assistant' && Array.isArray(content)) {
      const pieces = [];
      for (const b of content) {
        if (!isObject(b)) continue;
        if (b.type === 'text') {
          const t = strip(str(b.text));
          if (t) pieces.push(t);
        } else if (b.type === 'tool_use' && b.name === 'SendUserFile') {
          const list = (isObject(b.input) ? b.input.files : null) || [];
          pieces.push(`[📎 已发送文件: ${list.map(f => basename(String(f))).join(', ')}]`);
        }
      }
      if (pieces.length && ts) turns.push([ts, 'assistant', pieces.join('\n\n')]);
    }
  }
  return { sid: basename(path, '.jsonl').slice(0, 8), cwd, cowork: path.includes('local-agent-mode-sessions'), turns, custom, ai };
}

/** entries: [{ path, data }]（文件顺序）。 */
export function build(entries, options = {}) {
  const all = [];
  for (const { data } of entries) {
    // 除临时目录外一律纳入；Cowork 跑在沙箱里，cwd 无法过滤，全收。
    if (!data.cowork && (tmpPrefix(data.cwd) || excluded(data.cwd, options.excludeCwds))) continue;
    for (const [ts, role, text] of data.turns) all.push([ts, role, text, data.sid]);
  }
  // 原生标题：最后一条 custom-title（改名），没有就用 ai-title；后台会话 /new 会把旧标题抄进新会话，
  // 同名标题只归最早的会话，其余照旧取开场请求。
  const first = new Map();
  for (const [ts, , , sid] of all) if (!first.has(sid) || ms(ts) < ms(first.get(sid))) first.set(sid, ts);
  const found = new Map();
  for (const { data } of entries) {
    if (!first.has(data.sid)) continue;
    const title = tidy(data.custom) || tidy(data.ai);
    if (title) found.set(data.sid, title);
  }
  const owner = new Map();
  for (const sid of [...found.keys()].sort((a, b) => ms(first.get(a)) - ms(first.get(b)))) {
    if (!owner.has(found.get(sid))) owner.set(found.get(sid), sid);
  }
  const titles = {};
  for (const [sid, title] of found) if (owner.get(title) === sid) titles[sid] = title;
  return { turns: all, titles, count: all.length };
}

export function render(all, clock, userLabel, name = 'Claude') {
  return renderDays(all, clock, { user: `🧑 ${userLabel}`, assistant: `🤖 ${name}` });
}

export function rawFiles(paths, key) {
  return [...sortPaths(filesTwoDeep(paths.projects, name => name.startsWith(key) && name.endsWith('.jsonl'))),
    ...coworkFiles(paths.cowork).filter(p => basename(p, '.jsonl').startsWith(key))];
}

export default { id: 'claude', folder: 'Claude', name: 'Claude Code', version: 1, locate, files, parse, build, render, rawFiles };
