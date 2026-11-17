// 数据目录与设置。数据目录本身就是技能文件夹：SKILL.md、入口、日志、索引、设置都在里面，
// 与插件包分开存放，所以卸载、更新、重装插件都不动它。
import { readFileSync, existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { expand } from './files.js';
import { atomicWrite } from './markdown.js';
import { SOURCES, FORMATS, folderFor } from './agents.js';

export const SKILL_NAME = 'session-history';
export const DEFAULT_HOME = '~/.session-history';

/** 显式参数 > 环境变量 SESSION_HISTORY_HOME > ~/.session-history。 */
export function resolveHome(explicit, env = process.env) {
  const raw = explicit || env.SESSION_HISTORY_HOME || DEFAULT_HOME;
  const path = expand(String(raw).trim());
  return isAbsolute(path) ? path : resolve(path);
}

export function layout(home) {
  const state = join(home, 'state');
  return {
    home, state,
    logs: join(home, 'logs'),
    config: join(home, 'config.json'),
    skill: join(home, 'SKILL.md'),
    readme: join(home, 'README.md'),
    bin: join(home, 'bin'),
    launcher: join(home, 'bin', process.platform === 'win32' ? 'session-history.cmd' : 'session-history'),
    shell: join(home, 'bin', 'session-history'),
    cmd: join(home, 'bin', 'session-history.cmd'),
    index: join(state, 'index.sqlite3'),
    cache: join(state, 'cache.sqlite3'),
    status: join(state, 'status.json'),
    lock: join(state, 'refresh.lock'),
    runtime: join(state, 'runtime.json'),
  };
}

export const DEFAULTS = Object.freeze({
  userLabel: '用户',      // 日志里用户发言的称呼
  timezone: '',           // 留空跟随系统
  dayStartHour: 4,        // 日界：几点前算前一天
  refreshMinutes: 60,     // DSH 运行时的定时整理间隔；0 关闭
  staleMinutes: 30,       // 检索前若距上次整理超过这么久，先补一次（只重解析变过的会话文件）
  memoryHints: true,      // search 附对题的 Claude Code 记忆
  gitSnapshots: false,    // 整理后把 logs/ 提交成 Git 快照（数据目录须是 Git 仓库）
  excludeCwds: [],        // 这些工作目录下的会话不收
  agents: {},             // { claude: { enabled, onlyCwds, since, extraRoots } … }
  custom: [],             // 手动添加的 agent：[{ name, format, sessions, skills? }]
});

const strings = (value, fallback = []) => Array.isArray(value) ? value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) : fallback;
const int = (value, fallback, min, max) => Number.isInteger(value) && value >= min && value <= max ? value : fallback;

/** 校验并补默认值；非法值回落默认，不抛错（设置文件可能被手改）。 */
export function normalizeConfig(raw = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  // 自定义 agent：名称、格式、会话目录必填；技能目录可选。id 与日志文件夹由名称导出。
  const taken = new Set(), custom = [];
  for (const c of Array.isArray(r.custom) ? r.custom : []) {
    if (!c || typeof c !== 'object' || !FORMATS[c.format]) continue;
    const name = typeof c.name === 'string' ? c.name.trim().slice(0, 24) : '';
    const sessions = typeof c.sessions === 'string' ? c.sessions.trim() : '';
    if (!name || !sessions || /[\n#]/.test(name)) continue;
    const folder = folderFor(name, taken);
    const item = { name, format: c.format, sessions, id: `custom-${folder.toLowerCase()}`, folder };
    if (typeof c.skills === 'string' && c.skills.trim()) item.skills = c.skills.trim();
    custom.push(item);
  }
  const agents = {};
  for (const id of [...SOURCES.map(s => s.id), ...custom.map(c => c.id)]) {
    const a = r.agents?.[id];
    if (!a || typeof a !== 'object') continue;
    const item = {};
    if (typeof a.enabled === 'boolean') item.enabled = a.enabled;
    if (strings(a.onlyCwds).length) item.onlyCwds = strings(a.onlyCwds);
    if (typeof a.since === 'string' && !Number.isNaN(Date.parse(a.since))) item.since = a.since;
    if (strings(a.extraRoots).length) item.extraRoots = strings(a.extraRoots);
    if (Object.keys(item).length) agents[id] = item;
  }
  const label = typeof r.userLabel === 'string' && r.userLabel.trim() && !/[\n#]/.test(r.userLabel) ? r.userLabel.trim().slice(0, 12) : DEFAULTS.userLabel;
  return {
    userLabel: label,
    timezone: typeof r.timezone === 'string' ? r.timezone.trim() : DEFAULTS.timezone,
    dayStartHour: int(r.dayStartHour, DEFAULTS.dayStartHour, 0, 23),
    refreshMinutes: int(r.refreshMinutes, DEFAULTS.refreshMinutes, 0, 1440),
    staleMinutes: int(r.staleMinutes, DEFAULTS.staleMinutes, 0, 1440),
    memoryHints: typeof r.memoryHints === 'boolean' ? r.memoryHints : DEFAULTS.memoryHints,
    gitSnapshots: typeof r.gitSnapshots === 'boolean' ? r.gitSnapshots : DEFAULTS.gitSnapshots,
    excludeCwds: strings(r.excludeCwds),
    agents,
    custom,
  };
}

export function loadConfig(home) {
  const path = layout(home).config;
  if (!existsSync(path)) return normalizeConfig({});
  try { return normalizeConfig(JSON.parse(readFileSync(path, 'utf8'))); }
  catch { return normalizeConfig({}); }
}

/** 合并保存；agents 按 id 逐项合并。返回保存后的设置。 */
export function saveConfig(home, patch = {}) {
  const current = loadConfig(home);
  const agents = { ...current.agents };
  for (const [id, value] of Object.entries(patch.agents || {})) agents[id] = { ...(agents[id] || {}), ...(value || {}) };
  const next = normalizeConfig({ ...current, ...patch, agents });
  const stored = { ...next, custom: next.custom.map(({ name, format, sessions, skills }) => ({ name, format, sessions, ...(skills ? { skills } : {}) })) };
  atomicWrite(layout(home).config, JSON.stringify(stored, null, 2) + '\n');
  return next;
}

export function readJson(path, fallback = null) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}
