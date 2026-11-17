// 日志派生的块索引与会话目录（SQLite FTS5 trigram），可随时删掉重建；原文不改写。
// 另收 Claude Code 的记忆文件（整理过的结论），search 时最多提示两条。
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { layout } from './config.js';
import { entries, isDir } from './files.js';
import { sortPaths } from './py.js';
import { SEP, fenceStep } from './markdown.js';
import { norm } from './normalize.js';
import claude from './sources/claude.js';
import { roleTools, clip, sessionTitle, toDay, skipChars } from './text.js';

// 2：代码围栏不再认缩进超过 3 格的行（0.3.0），旧索引须按新规则重新切分。
export const SCHEMA = 2;
export const CHUNK = 1200, OVERLAP = 160;
const HEADER = /^## (\d\d:\d\d)\s+(.+)$/;
const META = /<!--[\s\S]*?-->/g;
const FRONT = /^---\n([\s\S]*?)\n---\n/;

export const mask = body => body.replace(META, m => ' '.repeat(m.length));

export function connect(home) {
  const path = layout(home).index;
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 60000 });
  db.exec('PRAGMA busy_timeout=60000');
  if (db.prepare('PRAGMA user_version').get().user_version !== SCHEMA) {
    for (const table of ['terms', 'chunks', 'files', 'sessions', 'memories', 'heads']) db.exec(`DROP TABLE IF EXISTS ${table}`);
    db.exec('VACUUM');
    db.exec(`
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS files(path TEXT PRIMARY KEY, signature TEXT);
      CREATE TABLE IF NOT EXISTS chunks(rid INTEGER PRIMARY KEY, id TEXT UNIQUE, path TEXT, agent TEXT, day TEXT,
        session TEXT, turn INTEGER, part INTEGER, role TEXT, clock TEXT, start INTEGER, end INTEGER, body TEXT, normalized TEXT);
      CREATE INDEX IF NOT EXISTS chunk_location ON chunks(path, turn, part);
      CREATE INDEX IF NOT EXISTS chunk_session ON chunks(agent, session);
      CREATE VIRTUAL TABLE IF NOT EXISTS terms USING fts5(normalized, content='chunks', content_rowid='rid', tokenize='trigram');
      CREATE TABLE IF NOT EXISTS sessions(agent TEXT, session TEXT, first_day TEXT, last_day TEXT, first_clock TEXT,
        last_clock TEXT, turns INTEGER, user_turns INTEGER, chunks INTEGER, chars INTEGER, title TEXT, title_norm TEXT,
        PRIMARY KEY(agent, session));
      CREATE TABLE IF NOT EXISTS heads(path TEXT, agent TEXT, session TEXT, title TEXT, PRIMARY KEY(path, session));
      CREATE TABLE IF NOT EXISTS memories(path TEXT PRIMARY KEY, signature TEXT, day TEXT, head TEXT, head_norm TEXT, body_norm TEXT);
      PRAGMA user_version=${SCHEMA};`);
  }
  return db;
}

/** 按会话与发言切分，代码围栏中的 # 不算标题；标题行「# ID · 原生标题」只取 ID，原生标题记入 heads。 */
export function* turns(text, heads = null) {
  const lines = text.split('\n').map(l => l.endsWith('\r') ? l.slice(0, -1) : l);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let session = '', turn = 0, role = '', clock = '', start = null, fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = fenceStep(fence, line);
    if (fence !== null || next !== null) { fence = next; continue; }
    const header = HEADER.exec(line);
    if (line.startsWith('# ') || header) {
      if (start !== null) yield [session, turn, role, clock, start + 1, lines.slice(start, i)];
      start = null;
      if (header) { turn++; clock = header[1]; role = header[2].trim(); start = i + 1; }
      else {
        const key = line.slice(2).trim(), at = key.indexOf(SEP);
        session = at >= 0 ? key.slice(0, at) : key;
        if (at >= 0 && heads) heads.set(session, key.slice(at + SEP.length));
      }
    }
  }
  if (start !== null) yield [session, turn, role, clock, start + 1, lines.slice(start)];
}

const countNl = (s, a = 0, b = s.length) => { let n = 0; for (let i = s.indexOf('\n', a); i >= 0 && i < b; i = s.indexOf('\n', i + 1)) n++; return n; };

/** 长消息切成至多 1200 字的块，相邻重叠 160 字。 */
export function* pieces(lines, base) {
  let i = 0;
  while (i < lines.length && !lines[i].trim()) { i++; base++; }
  const text = lines.slice(i).join('\n').trimEnd();
  const cps = /[\uD800-\uDFFF]/.test(text) ? Array.from(text) : null;
  const length = cps ? cps.length : text.length;
  const slice = (a, b) => cps ? cps.slice(a, b).join('') : text.slice(a, b);
  for (let part = 0, offset = 0; offset < Math.max(length, 1); part++, offset += CHUNK - OVERLAP) {
    const body = slice(offset, offset + CHUNK);
    if (body.trim()) {
      const start = base + countNl(cps ? slice(0, offset) : text, 0, cps ? undefined : offset);
      yield [part, start, start + countNl(body), body];
    }
    if (offset + CHUNK >= length) break;
  }
}

function logFiles(home) {
  const root = layout(home).logs, out = new Map();
  for (const d of sortPaths(entries(root).filter(e => isDir(join(root, e.name))).map(e => e.name))) {
    for (const file of sortPaths(entries(join(root, d)).filter(e => e.name.endsWith('-log.md')).map(e => e.name))) {
      out.set(`logs/${d}/${file}`, join(root, d, file));
    }
  }
  return out;
}

const sig = path => { const s = statSync(path, { bigint: true }); return `${s.mtimeNs}:${s.size}`; };

/**
 * 增量更新：日志文件 mtime／大小变了才重新分块，并刷新涉及的会话目录。
 * 先只读地核对一遍，什么都没变就不开写事务：search → outline → get 连着查时不必次次抢写锁。
 */
export function updateIndex(home, config, db = null) {
  const own = !db;
  db ??= connect(home);
  const tools = roleTools(config.userLabel);
  try {
    const paths = logFiles(home);
    const plan = () => {
      const old = new Map(db.prepare('SELECT path, signature FROM files').all().map(r => [r.path, r.signature]));
      const removed = [...old.keys()].filter(rel => !paths.has(rel));
      const changed = [];
      for (const [rel, path] of paths) { const signature = sig(path); if (old.get(rel) !== signature) changed.push([rel, path, signature]); }
      return { removed, changed, memories: memoryPlan(db, config) };
    };
    let work = plan(), updated = 0;
    if (work.removed.length || work.changed.length || work.memories.stale) {
      db.exec('BEGIN IMMEDIATE');
      try {
        work = plan(); // 拿到写锁后重新核对：等锁期间别的进程可能已经更新过
        updated = applyPlan(db, work, tools);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
    const count = sql => db.prepare(sql).get().n;
    return { files: paths.size, updated, chunks: count('SELECT count(*) n FROM chunks'),
      sessions: count('SELECT count(*) n FROM sessions'), memories: count('SELECT count(*) n FROM memories') };
  } finally { if (own) db.close(); }
}

function applyPlan(db, { removed, changed, memories }, tools) {
  const touched = new Map();
  const touch = (agent, session) => touched.set(`${agent}\u0000${session}`, [agent, session]);
  const q = {
    sessionsOf: db.prepare('SELECT DISTINCT agent, session FROM chunks WHERE path=?'),
    ftsDelete: db.prepare("INSERT INTO terms(terms, rowid, normalized) SELECT 'delete', rid, normalized FROM chunks WHERE path=?"),
    chunksDelete: db.prepare('DELETE FROM chunks WHERE path=?'),
    headsDelete: db.prepare('DELETE FROM heads WHERE path=?'),
    filesDelete: db.prepare('DELETE FROM files WHERE path=?'),
    chunkInsert: db.prepare('INSERT INTO chunks(id,path,agent,day,session,turn,part,role,clock,start,end,body,normalized) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'),
    ftsInsert: db.prepare('INSERT INTO terms(rowid, normalized) VALUES(?,?)'),
    headInsert: db.prepare('INSERT OR REPLACE INTO heads VALUES(?,?,?,?)'),
    fileInsert: db.prepare('INSERT OR REPLACE INTO files VALUES(?,?)'),
  };
  const drop = rel => {
    for (const r of q.sessionsOf.all(rel)) touch(r.agent, r.session);
    q.ftsDelete.run(rel); q.chunksDelete.run(rel); q.headsDelete.run(rel);
  };
  for (const rel of removed) { drop(rel); q.filesDelete.run(rel); }
  for (const [rel, path, signature] of changed) {
    drop(rel);
    const agent = basename(dirname(path)), day = basename(path).slice(0, 10);
    const heads = new Map();
    for (const [session, turn, role, clock, base, lines] of turns(readFileSync(path, 'utf8'), heads)) {
      touch(agent, session);
      for (const [part, start, end, body] of pieces(lines, base)) {
        const key = createHash('sha256').update(`${rel}:${session}:${turn}:${part}:${body}`).digest('hex').slice(0, 20);
        const normalized = norm(mask(body));
        const { lastInsertRowid } = q.chunkInsert.run(key, rel, agent, day, session, turn, part, role, clock, start, end, body, normalized);
        q.ftsInsert.run(lastInsertRowid, normalized);
      }
    }
    for (const [k, v] of heads) q.headInsert.run(rel, agent, k, v);
    q.fileInsert.run(rel, signature);
  }
  refreshSessions(db, [...touched.values()], tools);
  applyMemories(db, memories);
  return removed.length + changed.length;
}

function refreshSessions(db, keys, tools) {
  const del = db.prepare('DELETE FROM sessions WHERE agent=? AND session=?');
  const rowsOf = db.prepare('SELECT day, clock, turn, part, role, body FROM chunks WHERE agent=? AND session=? ORDER BY day, turn, part');
  const nativeOf = db.prepare('SELECT title FROM heads WHERE agent=? AND session=? ORDER BY path DESC LIMIT 1');
  const insert = db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const [agent, session] of keys) {
    del.run(agent, session);
    const rows = rowsOf.all(agent, session);
    if (!rows.length) continue;
    const spoken = new Set(rows.map(r => `${r.day}|${r.turn}`));
    const asked = new Set(rows.filter(r => tools.isUser(r.role)).map(r => `${r.day}|${r.turn}`));
    const chars = rows.reduce((sum, r) => sum + (r.part ? skipChars(r.body, OVERLAP) : r.body).length, 0);
    const native = nativeOf.get(agent, session);
    const title = native ? clip(native.title, 50) : sessionTitle(session, rows.filter(r => tools.isUser(r.role) && r.part === 0).map(r => r.body));
    insert.run(agent, session, rows[0].day, rows[rows.length - 1].day, rows[0].clock, rows[rows.length - 1].clock,
      spoken.size, asked.size, rows.length, chars, title, norm(title));
  }
}

/** Claude Code 记忆文件不切块：题目＝名称＋描述，正文另存归一化文本，只用于判断是否列出。这里只核对哪些变了。 */
function memoryPlan(db, config) {
  const files = [];
  if (config.memoryHints) {
    const root = claude.locate().memory;
    for (const d of entries(root)) {
      const dir = join(root, d.name, 'memory');
      if (!isDir(dir)) continue;
      for (const f of entries(dir)) if (f.name.endsWith('.md') && f.name !== 'MEMORY.md') files.push(join(dir, f.name));
    }
  }
  const sorted = sortPaths(files), keep = new Set(sorted);
  const old = new Map(db.prepare('SELECT path, signature FROM memories').all().map(r => [r.path, r.signature]));
  const gone = [...old.keys()].filter(path => !keep.has(path));
  const fresh = [];
  for (const path of sorted) {
    let stat;
    try { stat = statSync(path, { bigint: true }); } catch { continue; }
    const signature = `${stat.mtimeNs}:${stat.size}`;
    if (old.get(path) !== signature) fresh.push([path, signature, stat]);
  }
  return { gone, fresh, stale: gone.length + fresh.length > 0 };
}

function applyMemories(db, { gone, fresh }) {
  const del = db.prepare('DELETE FROM memories WHERE path=?');
  for (const path of gone) del.run(path);
  const insert = db.prepare('INSERT OR REPLACE INTO memories VALUES(?,?,?,?,?,?)');
  for (const [path, signature, stat] of fresh) {
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { continue; }
    const m = FRONT.exec(text);
    const front = m ? m[1] : '', body = m ? text.slice(m[0].length) : text;
    const field = name => {
      const f = new RegExp(`^\\s*${name}:\\s*(.+)$`, 'm').exec(front);
      return f ? f[1].trim().replace(/^"+|"+$/g, '').replaceAll('\\"', '"') : '';
    };
    // 修改日期优先取记忆自带的 modified；不少文件被批量动过，mtime 只作后备。
    const day = field('modified').slice(0, 10) || toDay(Number(stat.mtimeMs));
    const stem = basename(path, '.md');
    const head = field('description') || field('name') || stem;
    insert.run(path, signature, day, head, norm(`${field('name') || stem} ${head}`), norm(body));
  }
}
