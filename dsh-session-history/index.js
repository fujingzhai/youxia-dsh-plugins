// DSH 宿主半边：插件页的管理接口、DSH 运行期间的定时整理、启动时生成技能文件。
// 数据目录（默认 ~/.session-history）与插件包分开：卸载、更新、重装插件都不动日志与设置。
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveHome, loadConfig, saveConfig, layout, readJson } from './lib/config.js';
import { SOURCES, enabled, byId } from './lib/agents.js';
import { installSkill, skillMarkdown, logFolders, findNode, ENGINE, VERSION } from './lib/skill.js';
import { skillStatus, link, linkAll, unlink } from './lib/links.js';
import { tilde } from './lib/files.js';

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
  const agents = skillStatus(home, config).map(a => ({ ...a, enabled: enabled(byId(a.id), config) }));
  const known = new Set(SOURCES.map(s => s.folder));
  return {
    version: VERSION,
    home: tilde(home),
    homeAbs: home,
    config,
    last: readJson(layout(home).status, null),
    running: runner?.running ?? false,
    agents,
    legacy: logFolders(home).filter(f => !known.has(f)),
    git: existsSync(join(home, '.git')),
    skill: skillMarkdown(home, { config }),
  };
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
    case 'link': link(home, String(input.agent), config); break;
    case 'linkAll': linkAll(home, config); break;
    case 'unlink': unlink(home, String(input.agent), config); break;
    case 'enable': {
      if (!byId(input.agent) || typeof input.enabled !== 'boolean') throw invalid('参数无效');
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
