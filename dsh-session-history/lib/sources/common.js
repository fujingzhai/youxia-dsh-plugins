// 各来源共用：合并连续同角色发言、按日期渲染、临时目录判断。
import { demote } from '../markdown.js';
import { toMs } from '../clock.js';
import { expand } from '../files.js';
import { tmpdir } from 'node:os';

/** 合并连续同角色（被工具调用打断的助手正文重新拼起来）。turns: [ts, role, text][] */
export function mergeConsecutive(turns) {
  const merged = [];
  for (const [ts, role, text] of turns) {
    const last = merged[merged.length - 1];
    if (last && last[1] === role) last[2] = last[2] + '\n\n' + text;
    else merged.push([ts, role, text]);
  }
  return merged;
}

const before = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : (a < b ? -1 : a > b ? 1 : 0);

/**
 * 标准渲染：每天一份；当天各会话按首条发言时间排，会话内连续同角色合并。
 * all: [ts, role, text, sid][]；labels: { user, assistant }。返回 Map(日期 → 正文)。
 */
export function renderDays(all, clock, labels) {
  const days = new Map();
  for (const [ts, role, text, sid] of all) {
    const day = clock.day(ts);
    let sessions = days.get(day);
    if (!sessions) days.set(day, sessions = new Map());
    let turns = sessions.get(sid);
    if (!turns) sessions.set(sid, turns = []);
    turns.push([ts, role, text]);
  }
  const bodies = new Map();
  for (const [day, sessions] of days) {
    const out = [];
    for (const [sid, turns] of [...sessions].sort((a, b) => before(a[1][0][0], b[1][0][0]))) {
      out.push(`# ${sid}\n`);
      for (const [ts, role, text] of mergeConsecutive(turns)) {
        out.push(`## ${clock.hm(ts)}  ${labels[role]}\n`);
        out.push(demote(text) + '\n');
      }
    }
    bodies.set(day, out.join('\n'));
  }
  return bodies;
}

/** 毫秒比较用的 to_local；字符串或数字时间戳都行。 */
export const ms = toMs;

// Windows 的 cwd 用反斜杠；统一成 / 再按 POSIX 规则判断。
const posix = cwd => process.platform === 'win32' ? cwd.replace(/\\/g, '/') : cwd;
const fold = path => process.platform === 'win32' ? posix(path).toLowerCase().replace(/\/+$/, '') : path.replace(/\/+$/, '');

/** /tmp、/private/tmp 开头（Claude、Antigravity 的旧规则：前缀匹配）。 */
export const tmpPrefix = cwd => typeof cwd === 'string' && (posix(cwd).startsWith('/private/tmp') || posix(cwd).startsWith('/tmp'));

/** 任意 /.tmp/ 段。 */
export const dotTmp = cwd => typeof cwd === 'string' && posix(cwd).includes('/.tmp/');

/** 用户追加的排除前缀；Windows 另排除系统临时目录（%TEMP%）。 */
export function excluded(cwd, prefixes = []) {
  if (typeof cwd !== 'string' || !cwd) return false;
  const list = (prefixes || []).map(expand);
  if (process.platform === 'win32') list.push(tmpdir());
  const c = fold(cwd);
  return list.some(prefix => { const p = prefix && fold(prefix); return p && (c === p || c.startsWith(p + '/')); });
}

export const str = value => typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
