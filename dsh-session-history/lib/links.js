// 技能接入：不往各 agent 拷副本，而是在它读的技能目录里放一个指向数据目录的软链 session-history。
// 很多人只管一个技能目录、其余用软链共用（如 ~/.claude/skills → ~/my-skills），所以按真实路径归并：
// 同一个真实目录只需一条软链，共用它的 agent 自动都能看到。
import { lstatSync, readlinkSync, realpathSync, symlinkSync, mkdirSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SOURCES, byId, pathsOf, detected } from './agents.js';
import { SKILL_NAME } from './config.js';
import { tilde } from './files.js';

// Windows 路径不分大小写；realpath 结果统一成小写再比。
const real = path => { try { const r = realpathSync(path); return process.platform === 'win32' ? r.toLowerCase() : r; } catch { return null; } };

function skillName(folder) {
  try {
    const m = /^---\n[\s\S]*?^name:\s*(.+)$/m.exec(readFileSync(join(folder, 'SKILL.md'), 'utf8'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch { return null; }
}

/**
 * 某技能目录里 session-history 的状态：
 * none 没有｜link 我们的软链｜shared 目录本身就在数据目录里（或别的软链也指向它）｜
 * copy 同名技能的独立副本（旧版拷贝）｜broken 失效软链｜other 别的同名东西
 */
export function entryState(dir, home) {
  const entry = join(dir, SKILL_NAME);
  let st;
  try { st = lstatSync(entry); } catch { return { state: 'none', entry }; }
  const target = real(entry), homeReal = real(home);
  if (st.isSymbolicLink()) {
    if (!target) return { state: 'broken', entry, target: readlinkSync(entry) };
    return { state: target === homeReal ? 'link' : (skillName(target) === SKILL_NAME ? 'copy' : 'other'), entry, target };
  }
  if (target && target === homeReal) return { state: 'shared', entry, target };
  return { state: st.isDirectory() && skillName(entry) === SKILL_NAME ? 'copy' : 'other', entry, target };
}

/** 各 agent 的技能目录与可见性；dirs 里 real 相同者是同一个目录。 */
export function skillStatus(home, config = {}) {
  const agents = SOURCES.map(source => {
    const dirs = pathsOf(source, config).skills.map(path => {
      const exists = existsSync(path);
      return { path, display: tilde(path), exists, real: exists ? real(path) : null, ...(exists ? entryState(path, home) : { state: 'none' }) };
    });
    const via = dirs.find(d => d.state === 'link' || d.state === 'shared');
    const blocked = dirs.find(d => ['copy', 'other', 'broken'].includes(d.state));
    return { id: source.id, name: source.name, folder: source.folder, installed: detected(source, config), visible: !!via,
      via: via ? via.display : null, conflict: !via && blocked ? { path: tilde(blocked.entry), state: blocked.state } : null, dirs };
  });
  // 共用：同一真实目录被几家读。
  const byReal = new Map();
  for (const a of agents) for (const d of a.dirs) if (d.real) {
    if (!byReal.has(d.real)) byReal.set(d.real, new Set());
    byReal.get(d.real).add(a.name);
  }
  for (const a of agents) for (const d of a.dirs) d.sharedWith = d.real ? [...byReal.get(d.real)].filter(n => n !== a.name) : [];
  return agents;
}

/** 给某 agent 接入：已可见就不动；否则在它第一个已存在的技能目录（都不在就建首选目录）里建软链。 */
export function link(home, id, config = {}) {
  const source = byId(id);
  if (!source) throw new Error(`未知 agent：${id}`);
  const status = skillStatus(home, config).find(a => a.id === id);
  if (status.visible) return { changed: false, via: status.via };
  if (status.conflict) {
    const why = { copy: '已有同名技能的独立副本（多半是旧版拷贝）', other: '已有同名的其他文件', broken: '已有失效的同名软链' }[status.conflict.state];
    throw new Error(`${status.conflict.path} ${why}，请先移走再接入。`);
  }
  const dir = status.dirs.find(d => d.exists) || status.dirs[0];
  mkdirSync(dir.path, { recursive: true });
  const entry = join(dir.path, SKILL_NAME);
  symlinkSync(resolve(home), entry, process.platform === 'win32' ? 'junction' : 'dir');
  return { changed: true, via: tilde(dir.path), entry: tilde(entry) };
}

/** 一键接入：逐个接，前一个建的软链若被后一个共用就不重复建。 */
export function linkAll(home, config = {}) {
  const results = [];
  for (const a of skillStatus(home, config)) {
    if (!a.installed) continue;
    try { results.push({ id: a.id, ...link(home, a.id, config) }); }
    catch (error) { results.push({ id: a.id, error: error.message }); }
  }
  return results;
}

/** 只移除我们自己的软链（指向数据目录的），不碰真实文件夹。共用同一目录的 agent 会一起看不到。 */
export function unlink(home, id, config = {}) {
  const status = skillStatus(home, config).find(a => a.id === id);
  if (!status) throw new Error(`未知 agent：${id}`);
  const own = status.dirs.filter(d => d.state === 'link');
  if (!own.length) throw new Error(status.dirs.some(d => d.state === 'shared') ? '技能文件夹本身就在该技能目录里（不是软链），不移除。' : '没有可移除的软链。');
  for (const d of own) unlinkSync(d.entry);
  return { changed: true, removed: own.map(d => tilde(d.entry)), affects: [...new Set(own.flatMap(d => d.sharedWith))] };
}

export const _dirname = dirname;
