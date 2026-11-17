// 自动查找：内置 agent 每次读状态都会重新检测；这里另外找格式相同、但不在内置列表里的 agent，
// 以及同一 agent 的其他配置目录（多开、多账号）。只看固定的几处位置和家目录第一层，不深入扫描。
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { home, entries, isDir, tilde } from './files.js';
import { allSources, pathsOf, customSource } from './agents.js';

// 已知的同格式 agent：会话目录确定；技能目录只写有官方依据的。
const KNOWN = [
  { name: 'Qoder CLI', format: 'claude', sessions: '.qoder/projects' },
  { name: 'Qoder CLI（国内版）', format: 'claude', sessions: '.qoder-cn/projects' },
  { name: 'CodeBuddy Code', format: 'workbuddy', sessions: '.codebuddy/projects', skills: '.codebuddy/skills' },
];

// 内置 agent 的配置目录换个后缀（~/.claude-work 之类），按同样的子路径找会话与技能目录。
const FAMILIES = [
  { re: /^\.claude[-_.].+$/, label: 'Claude Code', format: 'claude', sessions: 'projects', skills: 'skills' },
  { re: /^\.codex[-_.].+$/, label: 'Codex', format: 'codex', sessions: 'sessions', skills: 'skills' },
  { re: /^\.dsh[-_.].+$/, label: 'DSH', format: 'dsh', sessions: 'sessions', skills: 'skills' },
  { re: /^\.gemini[-_.].+$/, label: 'Antigravity', format: 'antigravity', sessions: 'antigravity-cli/brain', skills: 'config/skills' },
  { re: /^\.pi[-_.].+$/, label: 'Pi', format: 'pi', sessions: 'agent/sessions', skills: 'agent/skills' },
  { re: /^\.workbuddy[-_.].+$/, label: 'WorkBuddy', format: 'workbuddy', sessions: 'projects', skills: 'skills' },
];

const real = path => { try { return realpathSync(path); } catch { return path; } };

/** 找到的候选：{ name, format, sessions, skills?, files, turns }，已内置或已添加的不列。 */
export function scan(config = {}) {
  const h = home();
  const covered = new Set(allSources(config).flatMap(s => pathsOf(s, config).roots).filter(isDir).map(real));
  const found = [];
  const consider = c => {
    const abs = join(h, c.sessions);
    if (!isDir(abs) || covered.has(real(abs))) return;
    const source = customSource({ id: 'scan', folder: 'scan', name: c.name, format: c.format, sessions: abs });
    const files = source.files(source.locate());
    if (!files.length) return;
    let turns = 0;
    for (const file of files.slice(0, 5)) { try { const d = source.parse(file); turns += (d.turns || d.records || d.sessions || []).length; } catch { /* 跳过 */ } }
    if (!turns) return;
    covered.add(real(abs));
    found.push({ name: c.name.slice(0, 24), format: c.format, sessions: tilde(abs),
      ...(c.skills && isDir(join(h, c.skills)) ? { skills: tilde(join(h, c.skills)) } : {}), files: files.length });
  };
  for (const c of KNOWN) consider(c);
  for (const d of entries(h)) {
    const family = FAMILIES.find(f => f.re.test(d.name));
    if (!family || !isDir(join(h, d.name))) continue;
    // 名称取配置目录的后缀：~/.claude-work → Claude Code（work）。
    const suffix = d.name.replace(/^\.[a-z]+[-_.]/i, '').slice(0, 24 - family.label.length - 2);
    consider({ name: `${family.label}（${suffix}）`, format: family.format,
      sessions: join(d.name, family.sessions), skills: join(d.name, family.skills) });
  }
  return found;
}
