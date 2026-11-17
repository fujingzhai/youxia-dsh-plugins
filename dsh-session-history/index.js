// DSH 宿主半边：插件页的管理接口、DSH 运行期间的定时整理、启动时生成技能文件。
// 数据目录（默认 ~/.session-history）与插件包分开：卸载、更新、重装插件都不动日志与设置。
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveHome, loadConfig, saveConfig, layout, readJson } from './lib/config.js';
import { SOURCES, FORMATS, enabled, byId, allSources, customSource, folderFor } from './lib/agents.js';
import { installSkill, skillMarkdown, logFolders, findNode, ENGINE, VERSION } from './lib/skill.js';
import { skillStatus, linkTarget, linkAll, unlinkTarget } from './lib/links.js';
import { tilde, expand, isDir } from './lib/files.js';
import { scan } from './lib/scan.js';

export const name = 'session-history';
export const ROUTE = '/youxia-session-history/api';

/** 插件配置只有一项：数据目录。其余设置存在数据目录的 config.json，跟数据走。 */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'dsh-session-history',
    validate(value) {
      const v = value ?? {};
      if (typeof v !== 'object' || Array.isArray(v)) return { issues: [{ message: 'config must be an object' }] };
      for (const key of Object.keys(v)) if (key !== 'home') return { issues: [{ message: `unknown key "${key}"` }] };
      if (v.home !== undefined && (typeof v.home !== 'string' || !v.home.trim())) return { issues: [{ message: 'home must be a non-empty string' }] };
      return { value: { home: v.home?.trim() } };
    },
  },
};

const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

function authorize(ctx, req) {
  const connection = ctx.get('connection');
  if (!connection?.admit) throw invalid('认证服务不可用', 503);
  const admission = connection.admit(req);
  if (!admission || 'rejection' in admission || admission.peer?.principal?.kind !== 'owner') throw invalid('仅限已认证的 owner', 403);
}

async function body(req) {
  if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) throw invalid('只接受 application/json', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw invalid('请求体过大', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw invalid('JSON 格式错误'); }
}

/** 整理放子进程：要读几百 MB 会话、建索引，不能卡住 DSH 宿主。 */
export function createRunner(home, { node = findNode(), engine = ENGINE } = {}) {
  let running = null;
  return {
    get running() { return !!running; },
    run() {
      if (running) return running;
      running = new Promise(resolve => {
        const child = spawn(node, [engine, 'refresh', '--json', '--home', home], {
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        let out = '', err = '';
        child.stdout.on('data', c => { out += c; });
        child.stderr.on('data', c => { err = (err + c).slice(-4000); });
        child.on('error', error => resolve({ ok: false, error: error.message }));
        child.on('close', code => {
          let status = null;
          try { status = JSON.parse(out); } catch { /* 非 JSON 输出 */ }
          resolve(status ? { ok: code === 0 || !!status.skipped, status } : { ok: false, error: (err || out || `退出码 ${code}`).trim().slice(-800) });
        });
      }).finally(() => { running = null; });
      return running;
    },
  };
}

export function snapshot(home, runner) {
  const config = loadConfig(home);
  const last = readJson(layout(home).status, null);
  const status = skillStatus(home, config);
  const sources = new Map(allSources(config).map(source => [source.id, source]));
  const shown = status.agents.filter(a => a.installed || a.custom).map(a => {
    const source = sources.get(a.id);
    const run = last?.agents?.[a.folder] || null;
    return { ...a, enabled: enabled(source, config), sessions: (roots => roots.filter(isDir).map(tilde).join('、') || tilde(roots[0]))(source.locate(process.env, config.agents?.[a.id] || {}).roots),
      run: run && { ok: run.ok, files: run.files, days: run.days, error: run.error || null },
      ...(a.custom ? { def: config.custom.find(c => c.id === a.id) } : {}) };
  });
  // 只剩旧日志：日志文件夹对应的 agent 不在列表里（已卸载，或来自不再支持的来源）。新用户一般没有。
  const listed = new Set(shown.map(a => a.folder));
  return {
    version: VERSION, home: tilde(home), homeAbs: home, config, last, running: runner?.running ?? false,
    agents: shown,
    targets: status.targets, links: status.links, conflicts: status.conflicts,
    legacy: logFolders(home).filter(f => !listed.has(f)),
    formats: Object.entries(FORMATS).map(([id, f]) => ({ id, label: f.label, dir: f.dir, layout: f.layout, example: f.example })),
    git: existsSync(join(home, '.git')),
    skill: skillMarkdown(home, { config }),
  };
}

/** 检查自定义 agent 的会话目录：存在与否、按所选格式能找到几个会话文件。 */
export function probe(format, sessions) {
  if (!FORMATS[format]) throw invalid('未知的会话格式');
  const path = expand(String(sessions || '').trim());
  if (!path) throw invalid('请填写会话目录');
  if (!isDir(path)) return { exists: false, files: 0, path: tilde(path) };
  const source = customSource({ id: 'probe', folder: 'probe', name: 'probe', format, sessions: path });
  const files = source.files(source.locate());
  // 只看文件名分不出格式（几家的目录结构相近），抽几个实际解析，能解析出对话才算对。
  let turns = 0;
  for (const file of files.slice(0, 5)) {
    try { const data = source.parse(file); turns += (data.turns || data.records || []).length; } catch { /* 解析失败按 0 计 */ }
  }
  return { exists: true, files: files.length, turns, path: tilde(path), sample: files[0] ? tilde(files[0]) : null };
}

function gitInit(home) {
  if (existsSync(join(home, '.git'))) return;
  return new Promise((resolve, reject) => {
    const r = spawn('git', ['init', '-q', home], { stdio: 'ignore', windowsHide: true });
    r.on('error', () => reject(invalid('找不到 git：请先安装 Git 再开启快照', 400)));
    r.on('close', code => {
      if (code !== 0) return reject(invalid(`git init 失败（退出码 ${code}）`, 500));
      const ignore = join(home, '.gitignore');
      if (!existsSync(ignore)) writeFileSync(ignore, '# 只给日志做快照；索引、缓存与生成文件不进仓库\n/*\n!/logs/\n!/.gitignore\n');
      resolve();
    });
  });
}

function openFolder(path) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [path]] : process.platform === 'win32' ? ['explorer', [path]] : ['xdg-open', [path]];
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true, windowsHide: true });
  child.on('error', () => {}); // 没有文件管理器（如精简 Linux）时静默
  child.unref();
}

export async function command(home, runner, input) {
  const op = input?.op;
  const config = loadConfig(home);
  switch (op) {
    case 'refresh': {
      const r = await runner.run();
      if (!r.ok) throw invalid(`整理失败：${r.error || '见状态'}`, 500);
      return snapshot(home, runner);
    }
    case 'linkTarget': linkTarget(home, String(input.key), config); break;
    case 'linkAll': linkAll(home, config); break;
    case 'unlinkTarget': unlinkTarget(home, String(input.key), config); break;
    case 'probe': return { probe: probe(input.format, input.sessions) };
    case 'scan': return { ...snapshot(home, runner), found: scan(config) };
    case 'addCustom': {
      const name = String(input.name || '').trim();
      if (!name || name.length > 24 || /[\n#]/.test(name)) throw invalid('名称须为 1–24 个字，不含 # 与换行');
      const result = probe(input.format, input.sessions);
      if (!result.exists) throw invalid(`会话目录不存在：${result.path}`);
      const def = { name, format: input.format, sessions: String(input.sessions).trim(), ...(input.skills?.trim() ? { skills: input.skills.trim() } : {}) };
      saveConfig(home, { custom: [...config.custom, def] });
      installSkill(home);
      break;
    }
    case 'removeCustom': {
      if (!config.custom.some(c => c.id === input.id)) throw invalid('没有这个自定义 agent');
      saveConfig(home, { custom: config.custom.filter(c => c.id !== input.id) });
      installSkill(home);
      break;
    }
    case 'enable': {
      if (!byId(input.agent, config) || typeof input.enabled !== 'boolean') throw invalid('参数无效');
      saveConfig(home, { agents: { [input.agent]: { enabled: input.enabled } } });
      installSkill(home);
      break;
    }
    case 'config': {
      const patch = input.patch && typeof input.patch === 'object' ? input.patch : {};
      const allowed = ['userLabel', 'timezone', 'dayStartHour', 'refreshMinutes', 'staleMinutes', 'memoryHints', 'gitSnapshots', 'excludeCwds'];
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
      if (clean.gitSnapshots === true) await gitInit(home);
      saveConfig(home, clean);
      installSkill(home);
      break;
    }
    case 'open': openFolder(home); break;
    default: throw invalid('未知操作');
  }
  return snapshot(home, runner);
}

export function handler(ctx, home, runner) {
  return async (req, res) => {
    let status = 200, payload;
    try {
      authorize(ctx, req);
      if (req.method === 'GET') payload = snapshot(home, runner);
      else if (req.method === 'POST') payload = await command(home, runner, await body(req));
      else throw invalid('不支持此请求方法', 405);
    } catch (error) {
      status = error.status ?? 500;
      payload = { error: error.message || '操作失败' };
      if (status === 500) console.error('[dsh-session-history]', error);
    }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(payload));
  };
}

/** 下一个整点对齐的时刻（间隔 60 分钟即每个整点）。 */
export function nextSlot(now, minutes) {
  const step = minutes * 60000;
  const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
  return midnight.getTime() + (Math.floor((now - midnight.getTime()) / step) + 1) * step;
}

export function apply(ctx, rawConfig) {
  const home = resolveHome(rawConfig?.home);
  const runner = createRunner(home);
  try { installSkill(home); } catch (error) { console.error('[dsh-session-history] 技能文件生成失败', error); }
  ctx.inject(['webServer', 'connection'], scoped => {
    scoped.effect(() => scoped.webServer.register({ kind: 'exact', path: ROUTE, handler: handler(scoped, home, runner) }));
  });
  ctx.effect(() => {
    let timer = null, stopped = false;
    const schedule = () => {
      if (stopped) return;
      const minutes = loadConfig(home).refreshMinutes;
      if (!minutes) { timer = setTimeout(schedule, 10 * 60000); return; } // 关着也定期看看是否被打开
      timer = setTimeout(async () => { await runner.run(); schedule(); }, Math.max(1000, nextSlot(Date.now(), minutes) - Date.now()));
    };
    // 启动后若已过期（或从没整理过），稍候补一次。
    const last = readJson(layout(home).status, null)?.run;
    const minutes = loadConfig(home).refreshMinutes;
    const boot = minutes && (!last || Date.now() - Date.parse(last) > minutes * 60000) ? setTimeout(() => runner.run(), 20000) : null;
    schedule();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(boot); };
  });
}
