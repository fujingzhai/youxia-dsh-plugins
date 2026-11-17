// 日志 Markdown 的公共规则：正文标题降级、会话标题行、按会话分段与保留来源已缺失的旧会话。
import { mkdirSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { splitlines, strip, rstrip, words, cut } from './py.js';

export const SEP = ' · '; // 会话标题行「# ID · 原生标题」
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)+$/; // clear-conversation-state 之类的机器名
// 代码围栏：行首至多缩进 3 格（同 CommonMark），缩进更深的不算，比如 Python 报错回溯里标出错位置的 ~~~~^^。
// 收尾＝同种符号、不短于开头；带信息串的也算收尾（与 0.2.x 相同）。模型常把代码块嵌在 ```md 里，
// 按 CommonMark 严格认收尾，旧日志里这类发言反而会一路开到底；本机全部旧日志对比过，这样认出错最少。
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})(\s+\S)/;

/** 读入一行后的围栏状态：null＝不在围栏里，否则是开头的围栏符。写日志、分段、建索引共用这一条规则。 */
export function fenceStep(fence, line) {
  const m = FENCE.exec(line);
  if (!m) return fence;
  const token = m[1];
  if (fence === null) return token;
  return token[0] === fence[0] && token.length >= fence.length ? null : fence;
}

/**
 * 一条发言的正文：标题整体降 levels 级（# → ###），嵌在「## 时刻 角色」之下；代码围栏内不动。
 * 发言停在代码块中间（回复被打断、截断）时补上收尾，否则后面的发言头和会话标题都会被当成代码。
 */
export function demote(text, levels = 2) {
  let fence = null;
  const lines = text.split('\n').map(line => {
    const inside = fence !== null;
    fence = fenceStep(fence, line);
    if (inside) return line;
    const m = HEADING.exec(line);
    return m ? '#'.repeat(Math.min(m[1].length + levels, 6)) + line.slice(m[1].length) : line;
  });
  if (fence !== null) lines.splice(lines[lines.length - 1] === '' ? -1 : lines.length, 0, fence);
  return lines.join('\n');
}

/** 原生标题整理：空白归并、去引号、截 60 字；连字符机器名不用。 */
export function tidy(title) {
  const text = strip(words(String(title ?? '')).join(' '), '"\'“”「」');
  return SLUG.test(text) ? '' : cut(text, 0, 60);
}

/** 会话标题行 → 会话 ID。 */
export function headId(line) {
  const key = strip(line.slice(2));
  const at = key.indexOf(SEP);
  return at >= 0 ? key.slice(0, at) : key;
}

/** 逐行喂入，返回读完这一行后是否在围栏外（围栏的开头、收尾行本身不会是标题行）。 */
function fenceTracker() {
  let fence = null;
  return line => (fence = fenceStep(fence, line)) === null;
}

/** 给会话标题行补上原生标题；判定标题行的规则与 sections 相同。 */
export function retitle(body, titles) {
  const open = fenceTracker();
  return splitlines(body, true).map(line => {
    if (open(line) && line.startsWith('# ')) {
      const sid = headId(line);
      if (Object.hasOwn(titles, sid)) return `# ${sid}${SEP}${titles[sid]}` + (line.endsWith('\n') ? '\n' : '');
    }
    return line;
  }).join('');
}

/** 按真实会话标题分段（Map 保序），不把代码围栏中的 # 当标题。 */
export function sections(text) {
  const result = new Map();
  const open = fenceTracker();
  let key = null, lines = [];
  for (const line of splitlines(text, true)) {
    if (open(line) && line.startsWith('# ')) {
      if (key !== null) result.set(key, lines.join(''));
      key = headId(line);
      lines = [];
    }
    lines.push(line);
  }
  if (key !== null) result.set(key, lines.join(''));
  return result;
}


// 旧版写的短会话 ID：Codex 只取前 8 位；OpenCode 写成「标题（ses_ 加 4 位）」。新 ID 以它开头即视为同一会话。
const LEGACY_CODEX = /^[0-9a-f]{8}$/;
const LEGACY_OPENCODE = /（(ses_[0-9A-Za-z]{4})）$/;

/** 旧日志里的会话 ID 在新渲染中是否还在（含上述两种旧写法）。 */
export function stillPresent(key, current) {
  if (current.has(key)) return true;
  const m = LEGACY_OPENCODE.exec(key);
  const prefix = m ? m[1] : LEGACY_CODEX.test(key) ? key + '-' : null;
  if (!prefix) return false;
  for (const k of current.keys()) if (k.startsWith(prefix) && k.length > prefix.length) return true;
  return false;
}

/** 来源里已没有的旧会话段原样保留（应用清理了历史也不丢日志）；返回 [正文, 保留段数]。 */
export function preserveMissing(old, next) {
  const current = sections(next);
  const missing = [...sections(old)].filter(([key]) => !stillPresent(key, current)).map(([, body]) => body);
  if (!missing.length) return [next, 0];
  // 段间只留一个空行。
  return [rstrip(next) + '\n\n' + missing.map(m => rstrip(m, '\n')).join('\n\n') + '\n', missing.length];
}

/** 同目录临时文件写好再改名，读者不会看到半截文件。 */
export function atomicWrite(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    writeFileSync(temp, text);
    for (let attempt = 0; ; attempt++) {
      try { renameSync(temp, path); break; }
      catch (error) {
        // Windows 上目标文件被杀毒、索引或编辑器短暂占用时改名会失败，稍等重试。
        if (process.platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 9) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}
