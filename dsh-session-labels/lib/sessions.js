import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ID = /^session-[0-9a-f-]{36}$/i;

export function catalog(home, ids) {
  const wanted = new Set(ids.filter(id => ID.test(id)));
  const archived = new Set(readArchived(home));
  const workspaces = readWorkspaces(home);
  const found = new Map();
  let groups = [];
  try { groups = readdirSync(join(home, 'sessions'), { withFileTypes: true }).filter(entry => entry.isDirectory()); }
  catch { groups = []; }
  for (const group of groups) {
    let names = [];
    const dir = join(home, 'sessions', group.name);
    try { names = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of names) {
      if (!wanted.has(entry.name) || !entry.isDirectory()) continue;
      const record = join(dir, entry.name);
      if (!existsSync(join(record, 'session.v4.jsonl.zstd')) && !existsSync(join(record, 'session.jsonl'))) continue;
      found.set(entry.name, {
        sessionId: entry.name,
        title: titleOf(home, entry.name),
        updatedAt: updatedAt(home, entry.name),
        workspace: workspaces.get(entry.name) || '',
      });
    }
  }
  return {
    ready: true,
    archived: [...archived],
    items: [...wanted].map(id => ({
      sessionId: id,
      title: titleOf(home, id),
      updatedAt: updatedAt(home, id),
      workspace: workspaces.get(id) || '',
      exists: found.has(id),
    })),
  };
}

function readArchived(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, 'storages', 'workspace.json'), 'utf8'));
    return Array.isArray(value.global?.archivedSessionIds) ? value.global.archivedSessionIds : [];
  } catch { return []; }
}

function readWorkspaces(home) {
  const map = new Map();
  try {
    const tables = JSON.parse(readFileSync(join(home, 'storages', 'workspace.json'), 'utf8')).tables?.workspaces || {};
    for (const workspace of Object.values(tables)) {
      for (const id of workspace.sessionIds || []) map.set(id, workspace.title || '');
    }
  } catch { /* workspace names are optional */ }
  return map;
}

function cache(home, id) {
  return JSON.parse(readFileSync(join(home, 'storages', 'session_projcache', 'sessions', `${id}.json`), 'utf8'));
}

function titleOf(home, id) {
  try {
    const title = cache(home, id).record?.rows?.title?.val;
    return typeof title === 'string' ? title : '';
  } catch { return ''; }
}

function updatedAt(home, id) {
  try {
    const value = cache(home, id);
    return Number(value.record?.rows?.sessionListMetadata?.val?.lastPromptAt || value.record?.identity?.createdAt || 0);
  } catch { return 0; }
}
