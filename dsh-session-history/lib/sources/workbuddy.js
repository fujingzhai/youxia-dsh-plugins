// WorkBuddy（腾讯，内核是 CodeBuddy Code）：~/.workbuddy/projects/<项目>/<会话>.jsonl。
// 实验性：格式按 CodeBuddy Code 公开发布的代码推断（OpenAI Agents 式的 message 条目、custom-title／ai-title 标题），
// 未用真实会话验证；时间戳缺失时沿用前后条目的时刻，不丢消息。同格式的 CodeBuddy Code 可作为自定义 agent 添加。
import { basename, join } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { home, expand, filesTwoDeep } from '../files.js';
import { jsonLines, parseJson, sortPaths, strip, isObject } from '../py.js';
import { tidy } from '../markdown.js';
import { renderDays, excluded, str } from './common.js';
import { toMs } from '../clock.js';

const INJECT = ['<system-reminder', '<turn_aborted>', '<command-', '<local-command-', 'Caveat:', '<user-memory', 'Base directory for this skill:'];
const machinery = text => !text || INJECT.some(p => text.startsWith(p)) || text.startsWith('[Request interrupted');

export function locate(env = process.env) {
  const base = env.WORKBUDDY_HOME ? expand(env.WORKBUDDY_HOME) : join(home(), '.workbuddy');
  return { base, projects: join(base, 'projects'), roots: [join(base, 'projects')], marks: [base], skills: [join(base, 'skills')] };
}

export function files(paths) {
  return sortPaths(filesTwoDeep(paths.projects, name => name.endsWith('.jsonl')));
}

/** 条目自身或 providerData 带的时刻；毫秒数或 ISO 都行。 */
function stamp(e) {
  for (const v of [e.timestamp, e.createdAt, e.created_at, e.providerData?.timestamp]) {
    const ms = toMs(v);
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return null;
}

const skipped = p => !!(p && (p.isMeta || p.skipRun || p.isCompactInternal || p.isCompacted || p.isSummary || typeof p.compactType === 'string' || p.teammateMessage));

function text(content, role) {
  if (typeof content === 'string') return machinery(strip(content)) ? '' : strip(content);
  if (!Array.isArray(content)) return '';
  const pieces = [];
  for (const b of content) {
    if (!isObject(b)) continue;
    if (['input_text', 'output_text', 'text'].includes(b.type)) { const t = strip(str(b.text)); if (!machinery(t)) pieces.push(t); }
    else if (['input_image', 'image'].includes(b.type)) pieces.push(role === 'user' ? '[🖼️ 图片]' : '[🖼️ 已生成图片]');
    else if (['input_file', 'file', 'document'].includes(b.type)) { const n = b.filename || b.name || ''; pieces.push(n ? `[📎 附件: ${n}]` : '[📎 附件]'); }
  }
  return pieces.join('\n\n');
}

export function parse(path) {
  const pending = [], stamps = [], turns = [];
  let custom = null, ai = null, cwd = '', index = 0;
  for (const line of jsonLines(readFileSync(path, 'utf8'))) {
    if (!strip(line)) continue;
    const e = parseJson(line);
    if (!isObject(e)) continue;
    index++;
    if (!cwd && typeof e.cwd === 'string') cwd = e.cwd;
    const ms = stamp(e);
    if (ms) stamps.push([index, ms]);
    if (e.type === 'custom-title' && e.customTitle) custom = e.customTitle;
    if (e.type === 'ai-title' && e.aiTitle) ai = e.aiTitle;
    if (e.type !== 'message' || !['user', 'assistant'].includes(e.role) || skipped(e.providerData)) continue;
    const t = text(e.content, e.role);
    if (t) pending.push([ms, e.role, t, index]);
  }
  // 没带时刻的条目：取其后最近一条（任何类型）的时刻；后面没有就取前面最近的；都没有用文件修改时间。
  let mtime = null;
  try { mtime = statSync(path).mtimeMs; } catch { /* 无 */ }
  for (const p of pending) {
    if (p[0]) continue;
    const after = stamps.find(([i]) => i > p[3]);
    const before = [...stamps].reverse().find(([i]) => i < p[3]);
    p[0] = after?.[1] ?? before?.[1] ?? mtime;
  }
  for (const [ms, role, t] of pending) if (ms) turns.push([new Date(ms).toISOString(), role, t]);
  return { sid: basename(path, '.jsonl').slice(0, 8), cwd, turns, custom, ai };
}

export function build(entries, options = {}) {
  const all = [], titles = {};
  for (const { data } of entries) {
    if (excluded(data.cwd, options.excludeCwds)) continue;
    if (!data.turns.length) continue;
    const title = tidy(data.custom) || tidy(data.ai);
    if (title) titles[data.sid] = title;
    for (const [ts, role, t] of data.turns) all.push([ts, role, t, data.sid]);
  }
  return { turns: all, titles, count: all.length };
}

export function render(all, clock, userLabel, name = 'WorkBuddy') {
  return renderDays(all, clock, { user: `🧑 ${userLabel}`, assistant: `🤖 ${name}` });
}

export function rawFiles(paths, key) {
  return files(paths).filter(p => basename(p).startsWith(key));
}

export default { id: 'workbuddy', folder: 'WorkBuddy', name: 'WorkBuddy', experimental: true, version: 1, locate, files, parse, build, render, rawFiles };
