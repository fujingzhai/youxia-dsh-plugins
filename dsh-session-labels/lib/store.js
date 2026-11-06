import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const emptyState = () => ({ version: 1, revision: 0, tags: [], assignments: {}, appearance: 'tint' });
export function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function text(value, label, max = 64) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw invalid(`${label}须为 1–${max} 个有效字符`);
  return value.trim();
}
function sessionId(value) {
  const id = text(value, '会话 ID', 256);
  if (['__proto__', 'constructor', 'prototype'].includes(id)) throw invalid('无效会话 ID');
  return id;
}
function color(value) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw invalid('颜色须为 #RRGGBB');
  return value.toUpperCase();
}
function tagName(state, value, except) {
  const name = text(value, '标签名称');
  if (state.tags.some(tag => tag.id !== except && tag.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw invalid('已有同名标签', 409);
  return name;
}
function findTag(state, id) {
  const tag = state.tags.find(tag => tag.id === id);
  if (!tag) throw invalid('标签已不存在，请刷新后重试', 404);
  return tag;
}
export function reduce(state, command, idFactory = randomUUID) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw invalid('请求须为对象');
  const next = structuredClone(state);
  switch (command.op) {
    case 'create': {
      if (next.tags.length >= 256) throw invalid('最多创建 256 个标签');
      const tag = { id: idFactory(), name: tagName(next, command.name), color: color(command.color) };
      next.tags.push(tag);
      if (command.sessionId !== undefined) {
        const id = sessionId(command.sessionId);
        next.assignments[id] = [...(own(next.assignments, id) ? next.assignments[id] : []), tag.id];
      }
      break;
    }
    case 'update': {
      const tag = findTag(next, command.id);
      // A stale editor must not overwrite another window's rename/recolor.
      if (command.expected && (tag.name !== command.expected.name || tag.color !== command.expected.color)) throw invalid('标签已在其他窗口修改，请刷新后再保存', 409);
      tag.name = tagName(next, command.name, tag.id);
      tag.color = color(command.color);
      break;
    }
    case 'remove': {
      findTag(next, command.id);
      next.tags = next.tags.filter(tag => tag.id !== command.id);
      for (const [id, tags] of Object.entries(next.assignments)) {
        const kept = tags.filter(tag => tag !== command.id);
        if (kept.length) next.assignments[id] = kept;
        else delete next.assignments[id];
      }
      break;
    }
    case 'assign': {
      findTag(next, command.id);
      const id = sessionId(command.sessionId);
      if (typeof command.enabled !== 'boolean') throw invalid('enabled 须为布尔值');
      const tags = new Set(own(next.assignments, id) ? next.assignments[id] : []);
      if (command.enabled) tags.add(command.id); else tags.delete(command.id);
      if (tags.size) next.assignments[id] = [...tags]; else delete next.assignments[id];
      break;
    }
    case 'clear': delete next.assignments[sessionId(command.sessionId)]; break;
    case 'move': {
      const index = next.tags.findIndex(tag => tag.id === command.id);
      if (index < 0) throw invalid('标签已不存在，请刷新后重试', 404);
      const target = index + (command.direction === 'up' ? -1 : command.direction === 'down' ? 1 : NaN);
      if (!Number.isInteger(target) || target < 0 || target >= next.tags.length) throw invalid('标签已在边界，无法继续移动', 409);
      [next.tags[index], next.tags[target]] = [next.tags[target], next.tags[index]];
      break;
    }
    case 'appearance':
      if (!['tint', 'marks'].includes(command.value)) throw invalid('无效显示方式');
      next.appearance = command.value; break;
    default: throw invalid('未知操作');
  }
  next.revision++;
  return next;
}

/** SQLite transaction serializes independent Host instances; no read/modify/write JSON race. */
export function openStore(path) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS labels (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)');
  db.prepare('INSERT OR IGNORE INTO labels VALUES (1, ?)').run(JSON.stringify(emptyState()));
  const get = db.prepare('SELECT value FROM labels WHERE id=1');
  const put = db.prepare('UPDATE labels SET value=? WHERE id=1');
  function snapshot() {
    const value = JSON.parse(get.get().value);
    if (value.version !== 1 || !Array.isArray(value.tags) || !value.assignments) throw new Error('标签数据库版本不受支持；未覆盖原数据');
    return value;
  }
  {
    const current = snapshot();
    let changed = false;
    if (current.appearance === 'both' || !['tint', 'marks'].includes(current.appearance)) {
      current.appearance = 'tint';
      delete current.appearanceMigrated;
      changed = true;
    }
    for (const tag of current.tags) if (String(tag.color).toUpperCase() === '#8E8E93') { tag.color = '#6E6E73'; changed = true; }
    if (changed) put.run(JSON.stringify(current));
  }
  return {
    snapshot,
    mutate(command) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = reduce(snapshot(), command);
        put.run(JSON.stringify(state));
        db.exec('COMMIT');
        return state;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); }
  };
}
