import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, existsSync, lstatSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zstdCompressSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

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

test('SKILL.md 按检测到的 agent 自适应', () => {
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

test('技能接入：按真实路径归组，只对未生效的 agent 给操作，一条软链覆盖共用者', () => {
  const { skillStatus, linkTarget, linkAll, unlinkTarget, link } = lib.links;
  let st = skillStatus(DATA);
  const agent = id => st.agents.find(a => a.id === id);
  assert.equal(agent('claude').state, 'missing');
  // ~/.claude/skills 与 ~/.agents/skills 都指向 my-skills：只有一组，四家都在里面。
  assert.equal(st.targets.length, 1);
  assert.deepEqual([...st.targets[0].agents].sort(), ['Claude Code', 'Codex', 'DSH', 'Pi']);
  assert.ok(!st.targets[0].create);
  assert.throws(() => linkTarget(DATA, '/somewhere/else'), /无需建软链/, '只接受算出来的目标');
  const r = linkTarget(DATA, st.targets[0].key);
  assert.equal(r.changed, true);
  assert.ok(lstatSync(join(HOME, 'my-skills/session-history')).isSymbolicLink());
  st = skillStatus(DATA);
  for (const id of ['claude', 'codex', 'pi', 'dsh']) assert.equal(agent(id).state, 'ready', id);
  assert.equal(st.targets.length, 0, '都生效后不再给建软链的操作');
  assert.equal(st.links.length, 1);
  assert.deepEqual([...st.links[0].agents].sort(), ['Claude Code', 'Codex', 'DSH', 'Pi']);
  assert.equal(agent('antigravity').installed, false, '未检测到的不参与');
  assert.deepEqual(linkAll(DATA), [], '无事可做');
  const removed = unlinkTarget(DATA, st.links[0].key);
  assert.deepEqual([...removed.affects].sort(), ['Claude Code', 'Codex', 'DSH', 'Pi']);
  assert.equal(skillStatus(DATA).agents.find(a => a.id === 'pi').state, 'missing');
  // 同名的独立副本算冲突，不覆盖，也不给建软链的按钮。
  mkdirSync(join(HOME, 'my-skills/session-history'));
  writeFileSync(join(HOME, 'my-skills/session-history/SKILL.md'), '---\nname: session-history\n---\n');
  st = skillStatus(DATA);
  assert.equal(st.agents.find(a => a.id === 'pi').state, 'conflict');
  assert.equal(st.targets.length, 0);
  assert.ok(st.conflicts.length >= 1);
  assert.throws(() => link(DATA, 'pi'), /旧版副本/);
  rmSync(join(HOME, 'my-skills/session-history'), { recursive: true });
});

test('自定义 agent：同格式的另一套目录，独立日志与名称；可检查目录、移除后日志保留', async () => {
  // 一个 Claude Code 格式的“第二实例”。
  put(join(HOME, '.qoder/projects/-work/abcdef12-0000.jsonl'), jsonl([
    { type: 'user', cwd: '/work', timestamp: '2026-11-10T09:00:00.000Z', message: { content: '用 Qoder 查一下集韵的版本' } },
    { type: 'assistant', timestamp: '2026-11-10T09:01:00.000Z', message: { content: [{ type: 'text', text: '好的。' }] } },
  ]));
  const { probe, command } = await import('../index.js');
  assert.deepEqual({ ...probe('claude', '~/.qoder/projects'), sample: undefined }, { exists: true, files: 1, turns: 2, path: join('~', '.qoder', 'projects'), sample: undefined });
  assert.equal(probe('pi', '~/.qoder/projects').turns, 0, '目录结构相近但格式不对：解析不出对话');
  assert.ok(probe('claude', '~/.qoder/projects').turns > 0);
  assert.equal(probe('claude', '~/.nope').exists, false);
  const runner = { running: false, run: async () => ({ ok: true }) };
  const after = await command(DATA, runner, { op: 'addCustom', name: 'Qoder CLI', format: 'claude', sessions: '~/.qoder/projects', skills: '' });
  const q = after.agents.find(a => a.name === 'Qoder CLI');
  assert.ok(q && q.custom && q.state === 'nodir', '未填技能目录：只收录会话');
  lib.refresh.refresh({ home: DATA });
  const log = readFileSync(join(DATA, 'logs/Qoder-CLI/2026-11-10-qoder-cli-log.md'), 'utf8');
  assert.match(log, /## 17:01  🤖 Qoder CLI\n/);
  assert.match(lib.skill.skillMarkdown(DATA), /Qoder CLI/);
  const removed = await command(DATA, runner, { op: 'removeCustom', id: q.id });
  assert.ok(!removed.agents.some(a => a.name === 'Qoder CLI'));
  assert.ok(existsSync(join(DATA, 'logs/Qoder-CLI/2026-11-10-qoder-cli-log.md')), '日志保留');
  assert.ok(removed.legacy.includes('Qoder-CLI'), '移除后作为旧日志照常检索');
  await assert.rejects(command(DATA, runner, { op: 'addCustom', name: 'X', format: 'claude', sessions: '~/.nope' }), /不存在/);
});

test('LobsterAI：剥掉系统信封、合并流式重复；WorkBuddy：缺时间戳的条目按前后时刻补', async () => {
  const lob = (await import('../lib/sources/lobsterai.js')).default;
  const lpath = join(HOME, 'lob/main/sessions/5a5a5a5a-1.jsonl');
  put(lpath, jsonl([
    { type: 'session' },
    { type: 'message', timestamp: '2026-11-10T01:00:00Z', message: { role: 'user', content: [{ type: 'text', text: '[LobsterAI system instructions]\nxx\n[Current user request]\n帮我订票' }] } },
    { type: 'message', timestamp: '2026-11-10T01:01:00Z', message: { role: 'assistant', content: [{ type: 'text', text: '订好了' }] } },
    { type: 'message', timestamp: '2026-11-10T01:01:01Z', message: { role: 'assistant', content: [{ type: 'text', text: '订好了\nMEDIA: x.png' }] } },
  ]));
  const data = lob.parse(lpath);
  assert.equal(data.turns[0][2], '帮我订票');
  const { createClock } = await import('../lib/clock.js');
  const body = lob.render(lob.build([{ path: lpath, data }]).turns, createClock({ timezone: '+08:00' }), '用户').get('2026-11-10');
  assert.equal((body.match(/订好了/g) || []).length, 1, '流式收尾的重复版本只留一份');
  const wb = (await import('../lib/sources/workbuddy.js')).default;
  const wpath = join(HOME, '.workbuddy/projects/p/77777777-a.jsonl');
  put(wpath, jsonl([
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<system-reminder>x' }], providerData: { isMeta: true } },
    { type: 'message', role: 'user', content: [{ type: 'input_text', text: '整理一下会议纪要' }] },
    { type: 'function_call', name: 'read', timestamp: Date.parse('2026-11-10T02:00:00Z') },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '好了' }], timestamp: Date.parse('2026-11-10T02:05:00Z') },
    { type: 'custom-title', customTitle: '会议纪要' },
  ]));
  const w = wb.parse(wpath);
  assert.deepEqual(w.turns.map(t => [t[1], t[2]]), [['user', '整理一下会议纪要'], ['assistant', '好了']]);
  assert.equal(w.turns[0][0], '2026-11-10T02:00:00.000Z', '缺时刻的用户发言取之后最近的时刻');
  assert.equal(wb.build([{ path: wpath, data: w }]).titles['77777777'], '会议纪要');
});

test('数据目录就在技能目录里时直接可见（共用，不需软链）', () => {
  const inside = join(HOME, 'skills-real/session-history');
  mkdirSync(join(HOME, 'skills-real'), { recursive: true });
  lib.skill.installSkill(inside);
  const status = lib.links.skillStatus(inside, { agents: {} }).agents;
  // ~/.agents/skills 指向 my-skills，不含 inside：不可见；把 my-skills 换成指向 skills-real 的场景用 entryState 直接测。
  assert.equal(lib.links.entryState(join(HOME, 'skills-real'), inside).state, 'shared');
  assert.ok(status.length >= 5);
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

test('OpenCode：从 SQLite 库读会话，标题行用自带标题，剥掉 <think>', async () => {
  const oc = (await import('../lib/sources/opencode.js')).default;
  const dir = join(HOME, '.local/share/opencode');
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, 'opencode.db'));
  db.exec(`CREATE TABLE session(id TEXT, title TEXT, directory TEXT); CREATE TABLE message(id TEXT, session_id TEXT, time_created INTEGER, data TEXT);
    CREATE TABLE part(id TEXT, message_id TEXT, time_created INTEGER, data TEXT);`);
  db.prepare('INSERT INTO session VALUES(?,?,?)').run('ses_abcdef123', '修 VPN', '/work');
  db.prepare('INSERT INTO session VALUES(?,?,?)').run('ses_tmp000000', '临时', '/tmp/x');
  const t0 = Date.parse('2026-11-10T03:00:00Z');
  for (const [mid, sid, ms, role, text] of [['m1', 'ses_abcdef123', t0, 'user', '断线了'], ['m2', 'ses_abcdef123', t0 + 60000, 'assistant', '<think>想想</think>是 DPD'],
    ['m3', 'ses_tmp000000', t0, 'user', '不该收']]) {
    db.prepare('INSERT INTO message VALUES(?,?,?,?)').run(mid, sid, ms, JSON.stringify({ role }));
    db.prepare('INSERT INTO part VALUES(?,?,?,?)').run('p' + mid, mid, ms, JSON.stringify({ type: 'text', text }));
  }
  db.close();
  const paths = oc.locate();
  const [file] = oc.files(paths);
  const data = oc.parse(file);
  const built = oc.build([{ path: file, data }]);
  const { createClock } = await import('../lib/clock.js');
  const body = oc.render(built.turns, createClock({ timezone: '+08:00' }), '用户').get('2026-11-10');
  assert.match(body, /^# 修 VPN（ses_abcd）\n\n## 11:00  🧑 用户\n\n断线了\n\n## 11:01  🤖 OpenCode\n\n是 DPD\n/);
  assert.doesNotMatch(body, /不该收|想想/);
  assert.match(oc.signature(file), /\|/, '签名含 -wal');
});

test('自动查找：已知的同格式 agent 与同一 agent 的其他配置目录；已内置或已添加的不列', async () => {
  put(join(HOME, '.qoder-cn/projects/-w/aaaa1111-1.jsonl'), jsonl([
    { type: 'user', cwd: '/w', timestamp: '2026-11-10T01:00:00Z', message: { content: '用 Qoder 问一句' } }]));
  put(join(HOME, '.claude-work/projects/-w/bbbb2222-1.jsonl'), jsonl([
    { type: 'user', cwd: '/w', timestamp: '2026-11-10T01:00:00Z', message: { content: '第二个账号' } }]));
  mkdirSync(join(HOME, '.claude-work/skills'), { recursive: true });
  mkdirSync(join(HOME, '.codex-empty/sessions'), { recursive: true }); // 没有会话的不列
  const { scan } = await import('../lib/scan.js');
  const found = scan(lib.config.loadConfig(DATA));
  const names = found.map(f => f.name);
  assert.ok(names.includes('Qoder CLI（国内版）'), names.join(','));
  const work = found.find(f => f.name === 'Claude Code（work）');
  assert.ok(work && work.format === 'claude' && /skills$/.test(work.skills));
  assert.ok(!names.some(n => n.includes('.codex-empty')));
  assert.ok(!found.some(f => /\.claude[\\/]projects$/.test(f.sessions)), '内置的 ~/.claude 不重复列');
});

test('已接入要读得到 SKILL.md：软链指向数据目录但读不到时算失效', () => {
  const dir = join(HOME, 'check-skills');
  mkdirSync(dir, { recursive: true });
  const fake = join(HOME, 'fake-home');
  mkdirSync(fake, { recursive: true });
  symlinkSync(fake, join(dir, 'session-history'), LINK);
  assert.equal(lib.links.entryState(dir, fake).state, 'broken', '数据目录里没有 SKILL.md');
  writeFileSync(join(fake, 'SKILL.md'), '---\nname: session-history\ndescription: x\n---\n');
  assert.equal(lib.links.entryState(dir, fake).state, 'link');
});

test('各家不共用技能文件夹时分组显示；读多个目录的 agent 只归入覆盖最多的那组', async () => {
  const { skillStatus } = lib.links;
  const H2 = join(HOME, 'sep-home');
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = H2; process.env.USERPROFILE = H2;
  try {
    for (const p of ['.claude/projects', '.claude/skills', '.codex/sessions', '.agents/skills', '.gemini/antigravity-cli/brain', '.gemini/config/skills',
      '.pi/agent/sessions', '.pi/agent/skills']) mkdirSync(join(H2, p), { recursive: true });
    const st = skillStatus(join(H2, '.session-history'), {});
    const groups = Object.fromEntries(st.targets.map(g => [g.display.replaceAll('\\', '/'), [...g.agents].sort()]));
    assert.deepEqual(groups, { '~/.claude/skills': ['Claude Code'], '~/.agents/skills': ['Codex', 'Pi'], '~/.gemini/config/skills': ['Antigravity'] });
  } finally { process.env.HOME = prev.HOME; process.env.USERPROFILE = prev.USERPROFILE; }
});

test('Codex 归档目录 archived_sessions 也收；与 sessions 里同名的只取一份', async () => {
  const codex = (await import('../lib/sources/codex.js')).default;
  const row = (id, text) => jsonl([{ type: 'session_meta', payload: { id, cwd: '/work' } },
    { type: 'response_item', timestamp: '2026-11-08T04:00:00.000Z', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }]);
  put(join(HOME, '.codex/archived_sessions/rollout-2026-11-08T12-00-00-aaaa9999-1.jsonl'), row('aaaa9999-1', '归档的会话'));
  put(join(HOME, '.codex/archived_sessions/rollout-2026-11-10-cccccccc.jsonl'), row('cccccccc-3333', '与 sessions 同名'));
  const list = codex.files(codex.locate());
  assert.ok(list.some(p => p.includes('archived_sessions') && p.includes('aaaa9999')));
  assert.equal(list.filter(p => p.endsWith('rollout-2026-11-10-cccccccc.jsonl')).length, 1, '同名只取 sessions 里的');
  assert.ok(!list.some(p => p.includes('archived_sessions') && p.includes('cccccccc')));
});
