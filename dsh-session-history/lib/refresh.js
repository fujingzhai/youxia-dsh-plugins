// 整理：各 agent 会话 → 每天一份清洗日志，再增量更新索引。全程不调用模型。
// 只重解析变过的会话文件（按 mtime＋大小），其余用缓存；每次仍按全部会话重新渲染并与既有日志逐日比对，
// 内容有变化才原子替换——旧会话补写、迟到的历史消息都能发现。来源里已没有的旧会话段原样保留。
import { mkdirSync, openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SOURCES, pathsOf, enabled } from './agents.js';
import { layout, loadConfig, readJson } from './config.js';
import { createClock } from './clock.js';
import { retitle, preserveMissing, atomicWrite } from './markdown.js';
import { signature } from './files.js';
import { strip } from './py.js';
import { updateIndex } from './store.js';
import { installSkill } from './skill.js';

const LOCK_STALE_MS = 10 * 60 * 1000;

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/** 互斥：上一轮没结束就跳过。锁里记 pid，进程不在或超过 10 分钟视为残留。 */
export function acquireLock(path) {
  mkdirSync(join(path, '..'), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return () => { try { if (readJson(path)?.pid === process.pid) unlinkSync(path); } catch { /* 已不在 */ } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const held = readJson(path, {});
      let age = Infinity;
      try { age = Date.now() - statSync(path).mtimeMs; } catch { /* 刚被释放 */ }
      if (held?.pid && alive(held.pid) && age < LOCK_STALE_MS) return null;
      try { unlinkSync(path); } catch { /* 别人先清了 */ }
    }
  }
  return null;
}

function openCache(path) {
  mkdirSync(join(path, '..'), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=60000;
    CREATE TABLE IF NOT EXISTS parsed(agent TEXT, path TEXT, sig TEXT, version INTEGER, data TEXT, PRIMARY KEY(agent, path));`);
  return db;
}

function logPath(dirs, source, day) {
  return join(dirs.logs, source.folder, `${day}-${source.folder.toLowerCase()}-log.md`);
}

/** 清洗一家：返回统计；单个文件解析失败时沿用缓存，不阻断其他文件。 */
export function cleanSource(source, { home, config, cache, clock, log = () => {} }) {
  const dirs = layout(home);
  const options = { ...(config.agents[source.id] || {}), excludeCwds: config.excludeCwds };
  const paths = pathsOf(source, config);
  const list = source.files(paths);
  const cached = new Map(cache.prepare('SELECT path, sig, version, data FROM parsed WHERE agent=?').all(source.id).map(r => [r.path, r]));
  const upsert = cache.prepare('INSERT OR REPLACE INTO parsed(agent, path, sig, version, data) VALUES(?,?,?,?,?)');
  const entries = [], warnings = [];
  let parsed = 0;
  cache.exec('BEGIN IMMEDIATE');
  try {
    for (const path of list) {
      let sig;
      try { sig = signature(path); } catch { continue; }
      const row = cached.get(path);
      let data;
      if (row && row.sig === sig && row.version === source.version) data = JSON.parse(row.data);
      else {
        try {
          data = source.parse(path);
          upsert.run(source.id, path, sig, source.version, JSON.stringify(data));
          parsed++;
        } catch (error) {
          warnings.push(`解析失败 ${path}：${error.message}`);
          if (!row) continue;
          data = JSON.parse(row.data);
        }
      }
      if (data.warnings?.length) warnings.push(...data.warnings);
      entries.push({ path, data });
    }
    const present = new Set(list);
    const drop = cache.prepare('DELETE FROM parsed WHERE agent=? AND path=?');
    for (const path of cached.keys()) if (!present.has(path)) drop.run(source.id, path);
    cache.exec('COMMIT');
  } catch (error) {
    cache.exec('ROLLBACK');
    throw error;
  }
  const { turns, titles, count } = source.build(entries, options, paths);
  const bodies = source.render(turns, clock, config.userLabel);
  let changed = 0, kept = 0;
  for (const day of [...bodies.keys()].sort()) {
    let body = retitle(bodies.get(day), titles);
    const path = logPath(dirs, source, day);
    const old = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (old) {
      const [merged, missing] = preserveMissing(old, body);
      if (missing) { warnings.push(`${day}：来源缺失 ${missing} 个既有会话，保留其旧日志。`); kept += missing; }
      body = merged;
    }
    if (strip(body) && old !== body) {
      if (body.length < old.length) log(`NOTICE ${day}: 正文缩短 ${old.length} -> ${body.length} 字符（来源修订或清洗规则变化）。`);
      atomicWrite(path, body);
      changed++;
    }
  }
  if (!bodies.size) warnings.push('无可提取内容；既有日志保持原样，请核查来源是否仍可用。');
  return { files: list.length, parsed, records: count, days: bodies.size, changed, preserved: kept, warnings };
}

function snapshot(home, clock) {
  if (!existsSync(join(home, '.git'))) return { ok: false, reason: '数据目录不是 Git 仓库' };
  const git = args => spawnSync('git', ['-C', home, ...args], { encoding: 'utf8' });
  const spec = ':(glob)logs/**';
  if (git(['add', '-A', '--', spec]).status !== 0) return { ok: false, reason: 'git add 失败' };
  if (git(['diff', '--cached', '--quiet', '--', spec]).status === 0) return { ok: true, committed: false };
  const r = git(['commit', '-q', '-m', `日志快照 ${clock.iso().slice(0, 16).replace('T', ' ')}`, '--', spec]);
  return { ok: r.status === 0, committed: r.status === 0 };
}

/**
 * 整理全部（或 only 指定的）agent，然后更新索引、按需提交快照、重写 SKILL.md。
 * 返回状态对象；已有整理在跑时返回 { skipped: true }。
 */
export function refresh({ home, only = null, log = () => {}, engine = null } = {}) {
  const dirs = layout(home);
  const release = acquireLock(dirs.lock);
  if (!release) return { skipped: true, reason: '已有整理在运行' };
  const started = Date.now();
  try {
    const config = loadConfig(home);
    const clock = createClock(config);
    const cache = openCache(dirs.cache);
    const agents = {};
    try {
      for (const source of SOURCES) {
        if (only && !only.includes(source.id)) continue;
        if (!enabled(source, config)) continue;
        const t = Date.now();
        try { agents[source.folder] = { ok: true, ...cleanSource(source, { home, config, cache, clock, log }), ms: Date.now() - t }; }
        catch (error) { agents[source.folder] = { ok: false, error: error.message, ms: Date.now() - t }; }
        log(`${source.folder}: ${agents[source.folder].ok ? 'OK' : 'ERROR ' + agents[source.folder].error}`);
      }
    } finally { cache.close(); }
    let index;
    try { index = { ok: true, ...updateIndex(home, config) }; }
    catch (error) { index = { ok: false, error: error.message }; }
    const git = config.gitSnapshots ? snapshot(home, clock) : null;
    let skill = null;
    try { skill = installSkill(home, { engine }); } catch (error) { skill = { ok: false, error: error.message }; }
    const status = { run: clock.iso(), ms: Date.now() - started, agents, index, ...(git ? { git } : {}), skill };
    const previous = readJson(dirs.status, {});
    if (only) status.agents = { ...(previous.agents || {}), ...agents };
    atomicWrite(dirs.status, JSON.stringify(status, null, 2) + '\n');
    return status;
  } finally { release(); }
}

/** 距上次整理超过 staleMinutes 才补整理；拿不到锁（别处正在整理）就直接用现有索引。 */
export function refreshIfStale({ home, log, engine } = {}) {
  const config = loadConfig(home);
  if (!config.staleMinutes) return null;
  const last = readJson(layout(home).status, {})?.run;
  if (last && Date.now() - Date.parse(last) < config.staleMinutes * 60000) return null;
  return refresh({ home, log, engine });
}
