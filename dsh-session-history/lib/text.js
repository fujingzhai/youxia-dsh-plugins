// 检索输出用的文本工具：截断、去标记、发言人、会话短 ID、细分词。
import { basename } from 'node:path';
import { home } from './files.js';

const pad = n => String(n).padStart(2, '0');
export const toDay = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const META = /<!--[\s\S]*?-->/g;
const mask = body => body.replace(META, m => ' '.repeat(m.length));
const PLACEHOLDER = /^\s*(\[(?:🖼|📎)[^\]]*\]|#{1,6} Files mentioned by the user:?|#{1,6} .+\.(?:png|jpe?g|gif|webp|heic|pdf)\s*:.*|#{1,6} My request for Codex:?)\s*$/i;

export function clip(text, width) {
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length <= width ? t : t.slice(0, Math.max(1, width - 1)) + '…';
}

export function plain(text) {
  const lines = mask(text).split(/\r?\n/).filter(l => l.trim() && !PLACEHOLDER.test(l));
  return lines.join(' ').replace(/(\*\*|^#{2,6} )/g, '');
}

/** 清洗器按用户发言保留下来的后台任务回执，不是用户原话。 */
export const machine = body => /^\s*(<task-notification>|<system-reminder>)/.test(body);

/** 用户称呼：当前设置的，加上旧日志里的「主人」「用户」。 */
export function roleTools(userLabel = '用户') {
  const marks = [...new Set([userLabel, '主人', '用户'].filter(Boolean))];
  const isUser = role => marks.some(m => String(role).includes(m));
  return { marks, isUser, said: row => isUser(row.role) && !machine(row.lead) };
}

export const speaker = role => String(role).replace(/^[^\p{L}\p{N}_]+/u, '').trim();

export function shortSid(session) {
  const m = /（(ses_[0-9A-Za-z]+)）$/.exec(session);
  if (m) return m[1];
  const s = session.startsWith('session-') ? session.slice(8) : session;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s) ? s.slice(0, 13) : s.slice(0, 8);
}

export const span = (first, last) => first === last ? first : `${first}—${last.slice(5)}`;
export const mark = i => i < 20 ? String.fromCodePoint(0x2460 + i) : `(${i + 1})`;

export function sessionTitle(session, userBodies) {
  const m = /^(?!New session)(.+?)（ses_[0-9A-Za-z]+）$/.exec(session);
  if (m) return clip(m[1], 50);
  let fallback = '';
  for (const body of userBodies.filter(b => !machine(b)).slice(0, 3)) {
    const text = clip(plain(body), 60);
    if (text.length >= 8) return text;
    fallback ||= text;
  }
  return fallback;
}

const CJK = /[㐀-鿿]+/g;
const WORD = /[a-z][a-z0-9+#_.-]*[a-z0-9]/g;
// 只收很少出现在实词内部的虚词、代词：更、下、用、会这类字常在实词里（更新、下载、用户、会话），不能当切分点。
const FUNCTION = /[的了吗呢吧啊呀嘛么我你他她它们这那哪和与及或把被就也都又很并而但是个些]/;
const STOP = new Set(`看看 一下 我们 帮我 什么 为什 这个 那个 现在 是否 如何 怎么 可以 之前 问题 一个 进行 是不 不是 能不 你看 一些
  的话 有没 没有 这里 已经 然后 还是 但是 因为 所以 如果 需要 应该 就是 自己 我的 你的 目前 这样 那么 以及 或者 还有
  这些 那些 时候 哪些 怎样 下这 看一 一样 这次 里面 不要 不能 能够 直接 其实 感觉 觉得 的是 了一 我想 想要 请你 我在
  是什 么样 有什 帮忙 一直 这边 那边 为啥 咋样 不了 看下 查看 检查 下我 们的 的问 题的 一次 电脑 脑上 上的 本机
  情况 效果 状态 基本 结果 方式 东西 内容 看一下 什么 怎么样 为什么
  http https www com github.com users tmp desktop library my request for the and to of
  files mentioned user summary event monitor task-id task-notification tool-use-id output-file status
  png jpg jpeg md state application support`.split(/\s+/).filter(Boolean));
// 路径里的用户名也是噪声。
STOP.add(basename(home()).toLowerCase());

/** 细分词候选（已归一化文本）：中文按虚词、代词与标点切成 2–6 字短语，外加英文词；查询词本身当切分点。 */
export function phrases(text, alts = []) {
  let t = text;
  for (const a of alts) t = t.replaceAll(a, ' ');
  const bag = new Set();
  for (const run of t.match(CJK) || []) for (const part of run.split(FUNCTION)) if (part.length >= 2 && part.length <= 6) bag.add(part);
  for (const w of t.match(WORD) || []) bag.add(w);
  for (const s of STOP) bag.delete(s);
  return bag;
}
