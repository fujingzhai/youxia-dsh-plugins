#!/usr/bin/env node
// Session History 命令行：检索各 agent 的历史对话，并管理整理、索引与技能接入。不调用模型。
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 15)) {
  console.error(`Session History 需要 Node 22.15 以上（推荐 24，内置 SQLite 与 zstd），当前 ${process.version}。`);
  process.exit(3);
}
// node:sqlite 在 Node 22/23 会打一行 ExperimentalWarning，混进输出没用。
const emit = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
  if (type === 'ExperimentalWarning' && /SQLite/i.test(String(warning))) return;
  return emit.call(process, warning, ...rest);
};

const { resolveHome, loadConfig, saveConfig, layout, readJson, DEFAULTS } = await import('../lib/config.js');
const { connect, updateIndex } = await import('../lib/store.js');
const { search, get, outline, timeline, UsageError } = await import('../lib/recall.js');
const { raw } = await import('../lib/raw.js');
const { refresh, refreshIfStale, problems } = await import('../lib/refresh.js');
const { allSources, byId, byFolder, enabled } = await import('../lib/agents.js');
const { installSkill, logFolders, VERSION } = await import('../lib/skill.js');
const { skillStatus, link, linkAll, unlink } = await import('../lib/links.js');
const { tilde } = await import('../lib/files.js');
const { readdirSync } = await import('node:fs');
const { join } = await import('node:path');

const HELP = `Session History ${VERSION} — 各 agent 的历史对话检索（不调用模型）

检索
  search <词…> [--agent A] [--since D] [--until D] [--session ID] [--role user|assistant]
         [--sort relevance|recent] [--limit 6] [--snippet 220] [--snippets] [--budget 3000]
  outline <会话ID|块ID> [--agent A] [--all] [--width 100] [--budget 3000]
  get <块ID> [--context 1] [--budget 4000]
  raw <会话ID|块ID> <词…> [--agent A] [--width 200] [--budget 2000]
  timeline [--since D] [--until D] [--agent A] [--all] [--budget 3000]

管理
  refresh [--agent A]     整理会话为日志并更新索引（只重读变过的会话）
  index                   只增量更新索引
  status                  数据目录、各 agent 与技能接入情况
  setup                   生成技能文件（SKILL.md、入口），首次使用先跑
  link <agent|all>        在 agent 的技能目录里建指向数据目录的软链
  unlink <agent>          移除上述软链
  config [键 [值]]        查看或修改设置

通用：--home DIR（数据目录，默认 ~/.session-history 或 $SESSION_HISTORY_HOME）  --no-refresh（检索前不补整理）
日期：YYYY-MM-DD、MM-DD、today、7d；--until 含当天。词：空格＝AND，词内 | 任选其一。`;

const BOOL = new Set(['snippets', 'all', 'no-refresh', 'json', 'help']);
const NUM = { limit: 6, snippet: 220, budget: null, context: 1, width: null };

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { args._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split(/=(.*)/s);
      if (BOOL.has(key)) { args[key] = true; continue; }
      const value = inline ?? argv[++i];
      if (value === undefined) throw new UsageError(`--${key} 需要一个值`);
      args[key] = value;
    } else if (a === '-h') args.help = true;
    else args._.push(a);
  }
  for (const key of Object.keys(NUM)) if (args[key] !== undefined) {
    const n = Number(args[key]);
    if (!Number.isInteger(n)) throw new UsageError(`--${key} 应为整数`);
    args[key] = n;
  }
  return args;
}

/** --agent 收 Claude／claude／Claude Code 等写法，统一成日志文件夹名。 */
function findSource(value, config) {
  const v = String(value).toLowerCase().replace(/\s+/g, '');
  return allSources(config).find(s => s.id === v || s.folder.toLowerCase() === v || s.name.toLowerCase().replace(/\s+/g, '') === v);
}

function agentFolder(value, home, config) {
  if (!value) return null;
  const v = String(value).toLowerCase().replace(/\s+/g, '');
  const folders = [...new Set([...allSources(config).map(s => s.folder), ...logFolders(home)])];
  const hit = findSource(value, config)?.folder
    || folders.find(f => f.toLowerCase() === v);
  if (!hit) throw new UsageError(`--agent 可选：${folders.join('、')}`);
  return hit;
}

function withIndex(home, config, fn) {
  const db = connect(home);
  try { updateIndex(home, config, db); return fn(db); } finally { db.close(); }
}

function statusText(home) {
  const logDaysOf = folder => { try { return readdirSync(join(layout(home).logs, folder)).filter(f => f.endsWith('-log.md')).length; } catch { return 0; } };
  const config = loadConfig(home);
  const last = readJson(layout(home).status, null);
  const { agents, targets, links } = skillStatus(home, config);
  const lines = [`Session History ${VERSION}｜数据目录 ${tilde(home)}`];
  lines.push(last ? `最近整理 ${last.run}（${(last.ms / 1000).toFixed(1)} 秒）｜索引 ${last.index?.sessions ?? '?'} 个会话、${last.index?.files ?? '?'} 份日志` : '尚未整理过：先跑 refresh');
  // 与插件页同一份判定；各家的整理错误在下面各自那行显示，这里列其余的。
  const issues = problems(last);
  if (last) lines.push(issues.length ? `状态：${issues.length} 处问题` : '状态：正常');
  for (const p of issues.filter(x => x.scope !== 'agent')) lines.push(`  ${p.text}`);
  for (const a of agents.filter(x => x.installed || x.custom)) {
    const run = last?.agents?.[a.folder];
    const src = !a.installed ? '未检测到' : enabled(byId(a.id, config), config) ? (run ? (run.ok ? `${run.files} 个会话文件 · 日志 ${logDaysOf(a.folder)} 天` : `整理出错：${run.error}`) : '已启用，待整理') : '已检测到，未启用整理';
    const skill = { ready: `已接入（经 ${a.via}）`, missing: '待接入', conflict: `冲突：${a.conflict?.path}`, nodir: '不接入（未设技能目录）' }[a.state];
    lines.push(`  ${a.name.padEnd(12)} ${src}｜${skill}`);
  }
  for (const t of targets) lines.push(`  → 在 ${t.display} 建软链，${t.agents.join('、')} 即可接入：session-history link all`);
  for (const l of links) lines.push(`  软链 ${l.entry} → 数据目录（${l.agents.join('、')}）`);
  // 与插件页同一口径：日志文件夹对应的 agent 不在列表里（已卸载或不再支持）。
  const listed = new Set(agents.filter(x => x.installed || x.custom).map(x => x.folder));
  const legacy = logFolders(home).filter(f => !listed.has(f));
  if (legacy.length) lines.push(`  另有旧日志：${legacy.join('、')}（对应的 agent 已不在，日志照常检索）`);
  return lines.join('\n');
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const [cmd, ...rest] = args._;
  if (!cmd || args.help || cmd === 'help') { console.log(HELP); return; }
  const home = resolveHome(args.home);
  const config = loadConfig(home);
  const log = message => console.error(message);
  const ctx = { config, cmd: 'session-history' };
  const agent = agentFolder(args.agent, home, config);
  const ensure = () => { if (!args['no-refresh']) refreshIfStale({ home }); };
  const budget = d => args.budget ?? d;
  if (args.budget !== undefined && args.budget < 100) throw new UsageError('budget 至少 100');
  if (args.limit !== undefined && args.limit < 1) throw new UsageError('limit 为正数');
  if (args.snippet !== undefined && args.snippet < 20) throw new UsageError('snippet 至少 20');
  switch (cmd) {
    case 'search':
      ensure();
      return console.log(withIndex(home, config, db => search(db, { query: rest, agent, since: args.since, until: args.until, session: args.session,
        role: args.role, sort: args.sort || 'relevance', limit: args.limit ?? 6, snippet: args.snippet ?? 220, snippets: !!args.snippets, budget: budget(3000) }, ctx)));
    case 'get':
      if (!rest[0]) throw new UsageError('用法：get <块ID>');
      ensure();
      return console.log(withIndex(home, config, db => get(db, { id: rest[0], context: args.context ?? 1, budget: budget(4000) }, ctx)));
    case 'outline':
      if (!rest[0]) throw new UsageError('用法：outline <会话ID|块ID>');
      ensure();
      return console.log(withIndex(home, config, db => outline(db, { target: rest[0], agent, all: !!args.all, width: args.width ?? 100, budget: budget(3000) }, ctx)));
    case 'raw':
      if (rest.length < 2) throw new UsageError('用法：raw <会话ID|块ID> <词…>');
      ensure();
      return console.log(withIndex(home, config, db => raw(db, { target: rest[0], query: rest.slice(1), agent, width: args.width ?? 200, budget: budget(2000) }, ctx)));
    case 'timeline':
      ensure();
      return console.log(withIndex(home, config, db => timeline(db, { since: args.since, until: args.until, agent, all: !!args.all, budget: budget(3000) }, ctx)));
    case 'index':
      return console.log(JSON.stringify(updateIndex(home, config)));
    case 'refresh': {
      const only = agent ? [byFolder(agent, config)?.id].filter(Boolean) : null;
      const status = refresh({ home, only, log });
      const issues = problems(status);
      // 与插件页、status 同一份判定：有任何一处问题就以 1 退出（--json 也一样，宿主据输出内容显示问题）。
      if (issues.length) process.exitCode = 1;
      if (args.json) return console.log(JSON.stringify({ ...status, problems: issues }, null, 2));
      if (status.skipped) return console.log(status.reason);
      for (const [name, r] of Object.entries(status.agents)) console.log(`${name}: ${r.ok ? `OK 会话文件 ${r.files}（重读 ${r.parsed}）· 日志 ${r.days} 天 · 变更 ${r.changed} 天` : 'ERROR ' + r.error}`);
      console.log(`索引: ${status.index.ok ? `${status.index.sessions} 个会话 · 更新 ${status.index.updated} 份` : 'ERROR 日志已保存，索引没更新上：' + status.index.error}｜${(status.ms / 1000).toFixed(1)} 秒`);
      for (const p of issues.filter(x => x.scope === 'skill' || x.scope === 'git')) console.log(p.text);
      const warnings = Object.values(status.agents).flatMap(r => r.warnings || []);
      if (warnings.length) console.error(warnings.slice(0, 20).join('\n') + (warnings.length > 20 ? `\n……另有 ${warnings.length - 20} 条` : ''));
      return;
    }
    case 'status':
      return console.log(args.json ? JSON.stringify({ home, config, last: readJson(layout(home).status, null), agents: skillStatus(home, config) }, null, 2) : statusText(home));
    case 'setup': {
      const r = installSkill(home);
      console.log(`技能文件已${r.changed.length ? '更新：' + r.changed.join('、') : '是最新'}｜${tilde(layout(home).skill)}`);
      console.log(statusText(home));
      if (!readJson(layout(home).status)) console.log('\n下一步：session-history refresh（首次整理全部历史，可能要一两分钟）');
      return;
    }
    case 'link': {
      if (!rest[0]) throw new UsageError('用法：link <agent|all>');
      installSkill(home);
      const results = rest[0] === 'all' ? linkAll(home, config) : [link(home, findSource(rest[0], config)?.id || rest[0], config)];
      if (!results.length) console.log('所有检测到的 agent 技能都已生效。');
      for (const r of results) console.log(r.error ? `失败：${r.error}` : r.changed ? `已建软链 ${r.entry}（${r.agents.join('、')} 生效）` : `已生效（经 ${r.via}）`);
      return;
    }
    case 'unlink': {
      if (!rest[0]) throw new UsageError('用法：unlink <agent>');
      const id = findSource(rest[0], config)?.id || rest[0];
      const r = unlink(home, id, config);
      return console.log(`已移除 ${r.removed.join('、')}${r.affects.length ? `；共用该目录的 ${r.affects.join('、')} 也随之看不到` : ''}`);
    }
    case 'config': {
      if (!rest.length) return console.log(JSON.stringify(config, null, 2));
      const [key, ...value] = rest;
      if (!(key in DEFAULTS) || key === 'agents') throw new UsageError(`可改的键：${Object.keys(DEFAULTS).filter(k => k !== 'agents').join('、')}（agents 请直接编辑 config.json）`);
      if (!value.length) return console.log(JSON.stringify(config[key]));
      let parsed = value.join(' ');
      try { parsed = JSON.parse(parsed); } catch { /* 当字符串 */ }
      const next = saveConfig(home, { [key]: parsed });
      installSkill(home);
      return console.log(`${key} = ${JSON.stringify(next[key])}`);
    }
    default:
      throw new UsageError(`未知命令 ${cmd}；session-history help 查看用法`);
  }
}

try { await main(); }
catch (error) {
  if (error instanceof UsageError) { console.error(error.message); process.exit(2); }
  console.error(`Session History 出错：${error.stack || error.message}`);
  process.exit(1);
}
