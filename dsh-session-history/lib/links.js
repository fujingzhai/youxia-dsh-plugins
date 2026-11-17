// 技能接入：不往各 agent 拷副本，而是在它读取的技能目录里放一条指向数据目录的软链 session-history。
// 很多人只维护一个技能文件夹，其余用软链共用（如 ~/.claude/skills → ~/my-skills），所以一律按真实路径归并：
// 同一个真实目录只需一条软链，读它的 agent 都会生效。
//
// 每个 agent 的技能状态：
//   ready    已生效：它读取的某个技能目录里已有指向数据目录的 session-history
//   missing  未生效：需要在它的技能目录里建软链（按目标目录归组，一组一个操作）
//   conflict 有冲突：技能目录里已有同名的其他东西（旧版副本、失效软链……），不覆盖
//   nodir    不接入：没有可用的技能目录（自定义 agent 未填技能目录）
import { lstatSync, readlinkSync, realpathSync, symlinkSync, mkdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { allSources, byId, pathsOf, detected } from './agents.js';
import { SKILL_NAME } from './config.js';
import { tilde } from './files.js';

const win = process.platform === 'win32';
// Windows 路径不分大小写；realpath 结果统一成小写再比。
const real = path => { try { const r = realpathSync(path); return win ? r.toLowerCase() : r; } catch { return null; } };
const key = path => (win ? resolve(path).toLowerCase() : resolve(path));

function skillName(folder) {
  try {
    const m = /^---\n[\s\S]*?^name:\s*(.+)$/m.exec(readFileSync(join(folder, 'SKILL.md'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}

/** 技能目录里 session-history 这一项的状态：none／link（我们的软链）／shared（目录就在数据目录里）／copy／broken／other。 */
export function entryState(dir, home) {
  const entry = join(dir, SKILL_NAME);
  let st;
  try { st = lstatSync(entry); } catch { return { state: 'none', entry }; }
  const target = real(entry), homeReal = real(home);
  // 只认 realpath 还不够：要像 agent 加载技能那样，从这个技能目录出发顺着软链读到 SKILL.md、名字对得上。
  const readable = () => skillName(entry) === SKILL_NAME;
  if (st.isSymbolicLink()) {
    if (!target) return { state: 'broken', entry, target: readlinkSync(entry) };
    if (target === homeReal) return readable() ? { state: 'link', entry, target } : { state: 'broken', entry, target };
    return { state: skillName(target) === SKILL_NAME ? 'copy' : 'other', entry, target };
  }
  if (target && target === homeReal) return readable() ? { state: 'shared', entry, target } : { state: 'broken', entry, target };
  return { state: st.isDirectory() && skillName(entry) === SKILL_NAME ? 'copy' : 'other', entry, target };
}

function agentStatus(source, home, config) {
  const paths = pathsOf(source, config);
  const dirs = (paths.skills || []).map(path => {
    const exists = existsSync(path);
    return { path, display: tilde(path), exists, real: exists ? real(path) : null, ...(exists ? entryState(path, home) : { state: 'none', entry: join(path, SKILL_NAME) }) };
  });
  const via = dirs.find(d => d.state === 'link' || d.state === 'shared');
  const blocked = dirs.find(d => ['copy', 'other', 'broken'].includes(d.state));
  const state = !dirs.length ? 'nodir' : via ? 'ready' : blocked ? 'conflict' : 'missing';
  // 建软链的位置：第一个已存在的技能目录；都不存在就用首选目录（届时新建）。
  const first = dirs.find(d => d.exists) || dirs[0];
  return {
    id: source.id, name: source.name, folder: source.folder, custom: !!source.custom, experimental: !!source.experimental,
    format: source.format, installed: detected(source, config), state, dirs, note: paths.skillNote || null,
    via: via ? via.display : null,
    conflict: state === 'conflict' ? { path: tilde(blocked.entry), state: blocked.state } : null,
    target: state === 'missing' && first ? { path: first.path, display: first.display, key: first.real || key(first.path), create: !first.exists } : null,
  };
}

/** 全部状态：各 agent、待建的软链（按目标目录归组）、已建的软链、冲突。 */
export function skillStatus(home, config = {}) {
  const agents = allSources(config).map(source => agentStatus(source, home, config));
  const live = agents.filter(a => a.installed || a.custom);
  const reads = dir => live.filter(a => a.dirs.some(d => d.real === dir)).map(a => a.name);
  const groups = new Map();
  for (const a of live.filter(x => x.state === 'missing' && x.target)) {
    const g = groups.get(a.target.key) || { key: a.target.key, path: a.target.path, display: a.target.display, create: a.target.create, agents: [] };
    g.agents.push(a.name);
    groups.set(a.target.key, g);
  }
  // 同一目录还被别的未接入 agent 读到的，一并算进受益者。
  for (const g of groups.values()) {
    for (const a of live.filter(x => x.state === 'missing' && !g.agents.includes(x.name))) if (a.dirs.some(d => d.real === g.key)) g.agents.push(a.name);
  }
  // 一个 agent 读多个目录时（如 Pi 既读自己的目录也读 ~/.agents/skills），只归入覆盖 agent 最多的那一组，
  // 免得同一家出现在两组、让人以为要点两次；被完全覆盖的组不再列出。
  const assigned = new Set();
  for (const g of [...groups.values()].sort((a, b) => b.agents.length - a.agents.length)) {
    g.agents = g.agents.filter(n => !assigned.has(n));
    for (const n of g.agents) assigned.add(n);
  }
  for (const [k, g] of groups) if (!g.agents.length) groups.delete(k);
  for (const g of groups.values()) {
    const realPath = g.create ? null : realpathSafe(g.path);
    g.realDisplay = realPath && key(realPath) !== key(g.path) ? tilde(realPath) : null;
    g.paths = [...new Set(live.filter(a => g.agents.includes(a.name)).flatMap(a => a.dirs.filter(d => d.real === g.key).map(d => d.display)))];
  }
  const links = new Map();
  for (const a of live) for (const d of a.dirs) if (d.state === 'link' && d.real && !links.has(d.real)) {
    links.set(d.real, { key: d.real, entry: tilde(join(realpathSafe(d.path) || d.path, SKILL_NAME)), agents: reads(d.real) });
  }
  const conflicts = live.filter(a => a.state === 'conflict').map(a => ({ agent: a.name, ...a.conflict }));
  return { agents, targets: [...groups.values()], links: [...links.values()], conflicts };
}

const realpathSafe = path => { try { return realpathSync(path); } catch { return null; } };

function makeLink(home, dirPath) {
  mkdirSync(dirPath, { recursive: true });
  const entry = join(dirPath, SKILL_NAME);
  symlinkSync(resolve(home), entry, win ? 'junction' : 'dir');
  return tilde(entry);
}

/** 按归组的目标目录建软链；只接受当前算出来的目标，防止被指向任意位置。 */
export function linkTarget(home, targetKey, config = {}) {
  const group = skillStatus(home, config).targets.find(g => g.key === targetKey);
  if (!group) throw new Error('该目录已无需建软链，或不是任何 agent 的技能目录。');
  return { changed: true, entry: makeLink(home, group.path), agents: group.agents };
}

/** 一键接入：逐组建，前一组建好后若别的组已被覆盖就跳过。 */
export function linkAll(home, config = {}) {
  const results = [];
  for (let guard = 0; guard < 20; guard++) {
    const next = skillStatus(home, config).targets[0];
    if (!next) break;
    try { results.push(linkTarget(home, next.key, config)); } catch (error) { results.push({ error: error.message }); break; }
  }
  return results;
}

/** 移除一条我们建的软链（只动指向数据目录的软链，不碰真实文件夹）。 */
export function unlinkTarget(home, linkKey, config = {}) {
  const link = skillStatus(home, config).links.find(l => l.key === linkKey);
  if (!link) throw new Error('没有找到这条软链。');
  const entry = join(linkKey, SKILL_NAME);
  const st = lstatSync(entry);
  if (!st.isSymbolicLink() || real(entry) !== real(home)) throw new Error('该位置不是指向数据目录的软链，未移除。');
  unlinkSync(entry);
  return { changed: true, removed: link.entry, affects: link.agents };
}

/** 命令行用：给某 agent 接入（已生效就不动）。 */
export function link(home, id, config = {}) {
  if (!byId(id, config)) throw new Error(`未知 agent：${id}`);
  const status = skillStatus(home, config);
  const a = status.agents.find(x => x.id === id);
  if (a.state === 'ready') return { changed: false, via: a.via };
  if (a.state === 'nodir') throw new Error(`${a.name} 没有可用的技能目录。`);
  if (a.state === 'conflict') throw new Error(`${a.conflict.path} 已有同名的其他文件或旧版副本，请先移走再接入。`);
  return linkTarget(home, a.target.key, config);
}

/** 命令行用：移除某 agent 能读到的我们的软链。 */
export function unlink(home, id, config = {}) {
  const status = skillStatus(home, config);
  const a = status.agents.find(x => x.id === id);
  if (!a) throw new Error(`未知 agent：${id}`);
  const own = status.links.filter(l => a.dirs.some(d => d.real === l.key));
  if (!own.length) throw new Error(a.dirs.some(d => d.state === 'shared') ? '数据目录本身就在该技能目录里（不是软链），不移除。' : '没有可移除的软链。');
  const removed = own.map(l => unlinkTarget(home, l.key, config));
  return { changed: true, removed: removed.map(r => r.removed), affects: [...new Set(removed.flatMap(r => r.affects))].filter(n => n !== a.name) };
}
