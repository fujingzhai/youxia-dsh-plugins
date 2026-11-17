import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';

// 一切都在临时 HOME 里，不碰本机真实会话。
const HOME = realpathSync(mkdtempSync(join(tmpdir(), 'shist-test-')));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME; // Windows 的 os.homedir() 读它
after(() => rmSync(HOME, { recursive: true, force: true })); // 只删本测试自建的临时目录
for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'PI_CODING_AGENT_DIR', 'DSH_HOME', 'DSH_AGENTS_HOME', 'AGENTS_HOME', 'SESSION_HISTORY_HOME']) delete process.env[k];
const LINK = process.platform === 'win32' ? 'junction' : 'dir'; // Windows 用目录联接，无需管理员

const DATA = join(HOME, '.session-history');
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const put = (path, text) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); };

function fixtures() {
  // Claude Code：一个正常会话、一个临时目录会话（不收）、一个带改名标题。
  put(join(HOME, '.claude/projects/-work/aaaaaaaa-1111.jsonl'), jsonl([
    { type: 'user', cwd: '/work', timestamp: '2026-11-10T02:00:00.000Z', message: { content: '帮我排查 LobsterAI 更新失败的问题' } },
    { type: 'user', timestamp: '2026-11-10T02:00:01.000Z', isMeta: true, message: { content: '<system-reminder>x' } },
    { type: 'assistant', timestamp: '2026-11-10T02:01:00.000Z', message: { content: [{ type: 'text', text: '# 原因\n签名校验失败' }, { type: 'tool_use', name: 'Bash', input: {} }] } },
    { type: 'assistant', timestamp: '2026-11-10T02:02:00.000Z', message: { content: [{ type: 'text', text: '已修复。' }] } },
    { type: 'custom-title', customTitle: 'LobsterAI 更新排查' },
  ]));
  put(join(HOME, '.claude/projects/-tmp/bbbbbbbb-2222.jsonl'), jsonl([
    { type: 'user', cwd: '/tmp/x', timestamp: '2026-11-10T03:00:00.000Z', message: { content: '临时目录里的测试' } },
  ]));
  put(join(HOME, '.claude/projects/-Users-x-memory-dir/memory/lobster-update.md'),
    '---\nname: lobster-update\ndescription: LobsterAI 更新失败的根因与修法\nmodified: 2026-11-10T00:00:00Z\n---\n签名校验失败时重装。\n');
  // Codex：一个明文、一个 .zst。
  put(join(HOME, '.codex/sessions/2026/11/10/rollout-2026-11-10-cccccccc.jsonl'), jsonl([
    { type: 'session_meta', payload: { id: 'cccccccc-3333', cwd: '/work' } },
    { type: 'response_item', timestamp: '2026-11-10T05:00:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>x' }] } },
    { type: 'response_item', timestamp: '2026-11-10T05:00:01.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '把 openconnect 断线的问题查一下' }] } },
    { type: 'response_item', timestamp: '2026-11-10T05:01:00.000Z', payload: { type: 'function_call', name: 'shell', arguments: '{"cmd":"base_url=https://api.example"}' } },
    { type: 'response_item', timestamp: '2026-11-10T05:02:00.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '是 DPD 超时。' }] } },
  ]));
  put(join(HOME, '.codex/sessions/2026/11/09/rollout-2026-11-09-dddddddd.jsonl.zst'), zstdCompressSync(Buffer.from(jsonl([
    { type: 'session_meta', payload: { id: 'dddddddd-4444', cwd: '/work' } },
    { type: 'response_item', timestamp: '2026-11-09T05:00:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '压缩过的旧会话：集韵版本对比' }] } },
    { type: 'response_item', timestamp: '2026-11-09T05:01:00.000Z', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好的。' }] } },
  ]))));
  put(join(HOME, '.codex/session_index.jsonl'), jsonl([{ id: 'cccccccc-3333', thread_name: 'VPN 断线排查' }]));
  // Pi：含消息正文里的 U+2028（不是换行）。
  put(join(HOME, '.pi/agent/sessions/--work--/2026-11-10T06-00-00_eeeeeeee.jsonl'), jsonl([
    { type: 'session', id: 'eeeeeeee-5555', cwd: '/work' },
    { type: 'session_info', name: '思源 插件 迁移' },
    { type: 'message', id: 'm1', parentId: null, timestamp: '2026-11-10T06:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: '把思源插件迁到新版' + String.fromCharCode(0x2028) + '注意兼容' }] } },
    { type: 'message', id: 'm2', parentId: 'm1', timestamp: '2026-11-10T06:01:00.000Z', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '已迁移。' }] } },
  ]));
  // DSH：多帧 zstd；一个子代理会话（不收）。
  const dshRows = [
    { type: 'session', id: 'ffffffff-6666', cwd: '/work' },
    { type: 'session/title', data: { title: 'DSH 插件页 按钮', source: { kind: 'model' } } },
    { type: 'user/message', time: Date.parse('2026-11-10T07:00:00Z'), data: { source: { kind: 'runtime-context' }, content: 'Current runtime context' } },
    { type: 'user/message', time: Date.parse('2026-11-10T07:00:01Z'), data: { source: { kind: 'user' }, content: [{ type: 'text', text: '插件页加一个一键创建软链的按钮' }] } },
    { type: 'assistant/message', time: Date.parse('2026-11-10T07:01:00Z'), data: { message: { content: [{ type: 'reasoning', text: '想想' }, { type: 'text', text: '已加上。' }] } } },
  ];
  const frames = dshRows.map(r => zstdCompressSync(Buffer.from(JSON.stringify(r) + '\n')));
  put(join(HOME, '.dsh/sessions/--work--/session-ffffffff-6666/session.v4.jsonl.zstd'), Buffer.concat(frames));
  put(join(HOME, '.dsh/sessions/--work--/session-99999999-7777/session.v4.jsonl.zstd'), zstdCompressSync(Buffer.from(jsonl([
    { type: 'session', id: '99999999-7777', cwd: '/work', delegationDepth: 1 },
    { type: 'user/message', time: Date.parse('2026-11-10T08:00:00Z'), data: { content: '子代理任务' } },
  ]))));
  // 技能目录：~/.agents/skills 是真目录，~/.claude/skills 软链到它（只管一个技能文件夹的常见做法）。
  mkdirSync(join(HOME, 'my-skills'), { recursive: true });
  mkdirSync(join(HOME, '.agents'), { recursive: true });
  symlinkSync(join(HOME, 'my-skills'), join(HOME, '.agents/skills'), LINK);
  symlinkSync(join(HOME, 'my-skills'), join(HOME, '.claude/skills'), LINK);
}

let lib;
before(async () => {
  fixtures();
  lib = {
    config: await import('../lib/config.js'),
    refresh: await import('../lib/refresh.js'),
    store: await import('../lib/store.js'),
    recall: await import('../lib/recall.js'),
    raw: await import('../lib/raw.js'),
    skill: await import('../lib/skill.js'),
    links: await import('../lib/links.js'),
    markdown: await import('../lib/markdown.js'),
    py: await import('../lib/py.js'),
  };
  lib.config.saveConfig(DATA, { userLabel: '用户', timezone: '+08:00' });
});

test('Python 语义的小工具', () => {
  const { strip, splitlines, comparePaths, words } = lib.py;
  assert.equal(strip('\x1c  a b \x85'), 'a b');
  assert.deepEqual(words(' a　b  c '), ['a', 'b', 'c']);
  assert.deepEqual(splitlines('a\nb\r\nc' + String.fromCharCode(0x2028) + 'd'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(['a-b/x', 'a/x'].sort(comparePaths), ['a/x', 'a-b/x']);
});

test('Markdown：降级、标题、保留缺失会话', () => {
  const { demote, tidy, retitle, preserveMissing } = lib.markdown;
  assert.equal(demote('# T\n```\n# code\n```\n## S'), '### T\n```\n# code\n```\n#### S');
  assert.equal(tidy('  "clear-conversation-state" '), '');
  assert.equal(tidy('「改名 标题」'), '改名 标题');
  assert.equal(retitle('# abc\n\nx\n', { abc: '题' }), '# abc · 题\n\nx\n');
  const [body, kept] = preserveMissing('# a\n\nold\n\n# gone\n\nkeep\n', '# a\n\nnew\n');
  assert.equal(kept, 1);
  assert.equal(body, '# a\n\nnew\n\n# gone\n\nkeep\n');
});

test('整理：五家来源 → 每天一份日志', () => {
  const status = lib.refresh.refresh({ home: DATA });
  for (const name of ['Claude', 'Codex', 'Pi', 'DSH']) assert.equal(status.agents[name]?.ok, true, `${name}: ${JSON.stringify(status.agents[name])}`);
  assert.equal(status.index.ok, true);
  const claude = readFileSync(join(DATA, 'logs/Claude/2026-11-10-claude-log.md'), 'utf8');
  assert.match(claude, /^# aaaaaaaa · LobsterAI 更新排查\n\n## 10:00  🧑 用户\n\n帮我排查 LobsterAI 更新失败的问题\n/);
  assert.match(claude, /## 10:01  🤖 Claude\n\n### 原因\n签名校验失败\n\n已修复。\n/, '连续助手发言合并、正文标题降两级');
  assert.doesNotMatch(claude, /临时目录/);
  const codex = readFileSync(join(DATA, 'logs/Codex/2026-11-10-codex-log.md'), 'utf8');
  assert.match(codex, /^# cccccccc · VPN 断线排查\n/);
  assert.doesNotMatch(codex, /environment_context/);
  assert.ok(existsSync(join(DATA, 'logs/Codex/2026-11-09-codex-log.md')), '读到 .zst 压缩会话');
  const pi = readFileSync(join(DATA, 'logs/Pi/2026-11-10-pi-log.md'), 'utf8');
  assert.match(pi, /<!-- id: m2; parent: m1; source-line: 4; stop: stop -->/, '源行号按真实换行计');
  assert.match(pi, /<!-- id: m1; parent: None; source-line: 3; stop:  -->/);
  const dsh = readFileSync(join(DATA, 'logs/DSH/2026-11-10-dsh-log.md'), 'utf8');
  assert.match(dsh, /^# ffffffff-6666 · DSH 插件页 按钮\n/);
  assert.doesNotMatch(dsh, /runtime context|子代理|想想/);
  // 再跑一次：没有变化，只靠缓存。
  const again = lib.refresh.refresh({ home: DATA });
  assert.equal(again.agents.Claude.parsed, 0);
  assert.equal(Object.values(again.agents).reduce((s, r) => s + r.changed, 0), 0);
});

test('来源消失的旧会话保留', () => {
  const path = join(DATA, 'logs/Claude/2026-11-10-claude-log.md');
  writeFileSync(path, readFileSync(path, 'utf8') + '\n# 12345678\n\n## 09:00  🧑 用户\n\n早已删除的会话\n');
  lib.refresh.refresh({ home: DATA, only: ['claude'] });
  assert.match(readFileSync(path, 'utf8'), /早已删除的会话/);
});

test('检索：search／outline／get／timeline／raw', () => {
  const config = lib.config.loadConfig(DATA);
  const db = lib.store.connect(DATA);
  try {
    lib.store.updateIndex(DATA, config, db);
    const ctx = { config };
    const base = { limit: 6, snippet: 220, budget: 3000, sort: 'relevance' };
    const out = lib.recall.search(db, { ...base, query: ['LobsterAI', '更新'] }, ctx);
    assert.match(out, /Claude aaaaaaaa .*「LobsterAI 更新排查」/);
    assert.match(out, /Claude 记忆.*\n.*lobster-update\.md/, '附对题的 Claude Code 记忆');
    assert.match(lib.recall.search(db, { ...base, query: ['經學|集韵'] }, ctx), /Codex dddddddd/, '繁简与同义词');
    assert.match(lib.recall.search(db, { ...base, query: ['不存在的词'] }, ctx), /未查到记录/);
    const block = /\[([0-9a-f]{10})\]/.exec(out)[1];
    assert.match(lib.recall.get(db, { id: block, context: 1, budget: 4000 }, ctx), /▶ \[/);
    assert.match(lib.recall.outline(db, { target: 'aaaaaaaa', budget: 3000, width: 100 }, ctx), /轮（用户 1）/);
    assert.match(lib.recall.timeline(db, { since: '2026-11-09', budget: 3000, all: true }, ctx), /2026-11-10/);
    assert.match(lib.raw.raw(db, { target: 'cccccccc', query: ['base_url'], width: 200, budget: 2000 }, ctx), /工具调用：.*base_url/);
  } finally { db.close(); }
});

test('SKILL.md 按本机 agent 自适应', () => {
  const md = readFileSync(join(DATA, 'SKILL.md'), 'utf8');
  assert.match(md, /^---\nname: session-history\n/);
  assert.match(md, /# Session History/);
  for (const name of ['Claude Code', 'Codex', 'Pi', 'DSH']) assert.ok(md.includes(name), name);
  assert.ok(!md.includes('Antigravity'), '没装的不写');
  assert.match(md, /Pi 日志含走过的多个分支/);
  lib.config.saveConfig(DATA, { agents: { pi: { enabled: false }, claude: { enabled: false } } });
  const slim = lib.skill.skillMarkdown(DATA);
  assert.ok(!slim.includes('Claude Code 记忆'), '没有 Claude 就不提记忆');
  assert.match(slim, /--agent`（Codex｜DSH｜Claude｜Pi）/, '在用的在前，停用的旧日志仍可检索');
  assert.match(slim, /以及已停用的 Claude、Pi/);
  lib.config.saveConfig(DATA, { agents: { pi: { enabled: true }, claude: { enabled: true } } });
  const launcher = readFileSync(join(DATA, 'bin', 'session-history'), 'utf8');
  assert.match(launcher, /--home "\$HERE"/);
});

test('技能接入：按真实路径识别共用目录，只建一条软链', () => {
  const { skillStatus, link, linkAll, unlink } = lib.links;
  let status = skillStatus(DATA);
  const byId = id => status.find(a => a.id === id);
  assert.equal(byId('claude').visible, false);
  assert.deepEqual(byId('claude').dirs[0].sharedWith.sort(), ['Codex', 'DSH', 'Pi']);
  const r = link(DATA, 'codex');
  assert.equal(r.changed, true);
  assert.ok(lstatSync(join(HOME, 'my-skills/session-history')).isSymbolicLink());
  status = skillStatus(DATA);
  for (const id of ['claude', 'codex', 'pi', 'dsh']) assert.equal(byId(id).visible, true, id);
  assert.equal(byId('antigravity').visible, false);
  assert.ok(linkAll(DATA).every(x => !x.error));
  assert.equal(skillStatus(DATA).find(a => a.id === 'antigravity').installed, false);
  const removed = unlink(DATA, 'claude');
  assert.deepEqual(removed.affects.sort(), ['Codex', 'DSH', 'Pi']);
  assert.equal(skillStatus(DATA).find(a => a.id === 'pi').visible, false);
  // 同名的独立副本算冲突，不覆盖。
  mkdirSync(join(HOME, 'my-skills/session-history'));
  writeFileSync(join(HOME, 'my-skills/session-history/SKILL.md'), '---\nname: session-history\n---\n');
  assert.throws(() => link(DATA, 'pi'), /独立副本/);
});

test('数据目录就在技能目录里时直接可见（共用，不需软链）', () => {
  const inside = join(HOME, 'skills-real/session-history');
  mkdirSync(join(HOME, 'skills-real'), { recursive: true });
  lib.skill.installSkill(inside);
  const status = lib.links.skillStatus(inside, { agents: {} }).map(a => a);
  // ~/.agents/skills 指向 my-skills，不含 inside：不可见；把 my-skills 换成指向 skills-real 的场景用 entryState 直接测。
  assert.equal(lib.links.entryState(join(HOME, 'skills-real'), inside).state, 'shared');
  assert.ok(status.length === 5);
});

test('Windows：cmd 入口只含 ASCII，路径换成环境变量；Git Bash 入口用 MSYS 路径', () => {
  const env = { USERPROFILE: 'C:\\Users\\张三', LOCALAPPDATA: 'C:\\Users\\张三\\AppData\\Local', ProgramFiles: 'C:\\Program Files' };
  const engine = 'C:\\Users\\张三\\.dsh\\profiles\\desktop\\node_modules\\dsh-session-history\\bin\\session-history.js';
  const node = 'C:\\Users\\张三\\AppData\\Local\\Programs\\DeepSeek Harness\\resources\\runtime\\primary-runtime\\dependencies\\node\\bin\\node.exe';
  assert.equal(lib.skill.winPath(engine, env), '%USERPROFILE%\\.dsh\\profiles\\desktop\\node_modules\\dsh-session-history\\bin\\session-history.js');
  assert.match(lib.skill.winPath(node, env), /^%LOCALAPPDATA%\\Programs\\/);
  const cmd = lib.skill.cmdLauncher({ engine, node, env });
  assert.ok(!/[^\x00-\x7f]/.test(cmd), 'cmd 内容纯 ASCII');
  assert.ok(cmd.includes('\r\n') && !cmd.includes('chcp'), '能全换成变量时不切代码页');
  assert.match(cmd, /"%NODE%" "%ENGINE%" --home "%HERE%" %\*/);
  const odd = lib.skill.cmdLauncher({ engine: 'D:\\工具\\session-history.js', node, env });
  assert.match(odd, /chcp 65001/, '仍有中文路径时临时切 UTF-8');
  const sh = lib.skill.shellLauncher({ engine, node, platform: 'win32' });
  assert.match(sh, /NODE='\/c\/Users\/张三\/AppData\/Local\/Programs\//);
  assert.match(sh, /ENGINE='C:\/Users\/张三\/\.dsh\//);
  assert.match(sh, /pwd -W/);
  const md = lib.skill.skillMarkdown(DATA, { platform: 'win32' });
  assert.match(md, /PowerShell／cmd 用 `.*session-history\.cmd`/);
  assert.match(md, /Git Bash 用 `/);
});

test('Windows 实机：cmd 与 Git Bash 两种入口都能跑（目录名含中文和空格）', { skip: process.platform !== 'win32' }, () => {
  const home = join(HOME, '会话 历史');
  lib.skill.installSkill(home);
  const cmdPath = join(home, 'bin', 'session-history.cmd');
  const r = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${cmdPath}" status"`],
    { encoding: 'utf8', windowsVerbatimArguments: true, env: { ...process.env, SESSION_HISTORY_NODE: process.execPath } });
  assert.equal(r.status, 0, `cmd: ${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /Session History .*数据目录/);
  const bash = 'C:\\Program Files\\Git\\bin\\bash.exe';
  if (existsSync(bash)) {
    const posix = join(home, 'bin', 'session-history').replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replaceAll('\\', '/');
    const b = spawnSync(bash, ['-c', `"${posix}" status`], { encoding: 'utf8' });
    assert.equal(b.status, 0, `bash: ${b.stdout}\n${b.stderr}`);
    assert.match(b.stdout, /Session History .*数据目录/);
  }
});
