// 0.3.0 修过的问题各留一条回归：会话归属、短 ID、仅题目命中、生僻字拼接、整理状态、只读快路径。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HOME = realpathSync(mkdtempSync(join(tmpdir(), 'shist-reg-')));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
after(() => rmSync(HOME, { recursive: true, force: true })); // 只删本测试自建的临时目录
for (const k of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'PI_CODING_AGENT_DIR', 'DSH_HOME', 'DSH_AGENTS_HOME', 'AGENTS_HOME', 'SESSION_HISTORY_HOME', 'XDG_DATA_HOME']) delete process.env[k];

const DATA = join(HOME, '.session-history');
const BIN = fileURLToPath(new URL('../bin/session-history.js', import.meta.url));
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const put = (path, text) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); };
const TRACE = 'Traceback (most recent call last):\n  File "x.py", line 3, in <module>\n    raise SystemExit(main())\n                     ~~~~^^\nValueError: boom\n\n# 结论\n参数写错了。';
const CUT = '看下面：\n\n```\nmacOS 系统代理\n  Web 代理: 127.0.0.1\n  H';
const BIG = '甲'.repeat(1000) + '𠮷'.repeat(300) + '乙'.repeat(500);
const ID1 = '01a1b6e7-13ec-7131-a824-b39578e40dcf', ID2 = '01a1b6e7-760b-7263-a8a6-80b12aa733b2';

function fixtures() {
  const claude = (name, rows) => put(join(HOME, '.claude/projects/-work', name), jsonl(rows));
  const at = m => `2026-11-10T0${m}:00:00.000Z`;
  // 第一场：助手正文里有 Python 报错回溯（~~~~^^ 不是围栏），还有一条停在代码块中间的回复。
  claude('aaaa0001-1111.jsonl', [
    { type: 'user', cwd: '/work', timestamp: at(1), message: { content: '跑脚本报错了' } },
    { type: 'assistant', timestamp: at(1).replace(':00:00', ':01:00'), message: { content: [{ type: 'text', text: TRACE }] } },
    { type: 'user', timestamp: at(1).replace(':00:00', ':02:00'), message: { content: '再试' } },
    { type: 'assistant', timestamp: at(1).replace(':00:00', ':03:00'), message: { content: [{ type: 'text', text: CUT }] } },
  ]);
  claude('bbbb0002-2222.jsonl', [
    { type: 'user', cwd: '/work', timestamp: at(2), message: { content: '第二场：查一下代理' } },
    { type: 'assistant', timestamp: at(2).replace(':00:00', ':01:00'), message: { content: [{ type: 'text', text: '好。' }] } },
    { type: 'custom-title', customTitle: '第二场标题' },
  ]);
  claude('cccc0003-3333.jsonl', [{ type: 'user', cwd: '/work', timestamp: at(3), message: { content: '第三场的提问' } }]);
  // Codex：两场在同一分钟里开（UUIDv7 前 8 位相同）。
  const codex = (stamp, id, text) => put(join(HOME, `.codex/sessions/2026/11/08/rollout-2026-11-08T${stamp}-${id}.jsonl`), jsonl([
    { type: 'session_meta', payload: { id, cwd: '/work' } },
    { type: 'response_item', timestamp: `2026-11-08T${stamp.replaceAll('-', ':')}.000Z`, payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
  ]));
  codex('00-45-59', ID1, '先开的那一场');
  codex('00-46-24', ID2, '紧跟着开的另一场');
  put(join(HOME, '.codex/session_index.jsonl'), jsonl([{ id: ID1, thread_name: '甲场' }, { id: ID2, thread_name: '乙场' }]));
  // 0.2.x 写下的旧日志：Codex 只存了前 8 位（两场被并成一场），另有一场来源早已删除。
  put(join(DATA, 'logs/Codex/2026-11-08-codex-log.md'),
    '# 01a1b6e7 · 旧标题\n\n## 08:45  用户\n\n先开的那一场\n\n## 08:46  用户\n\n紧跟着开的另一场\n\n# 0badf00d\n\n## 09:00  用户\n\n来源早已删除的旧会话\n');
  // 手写的日志（没有对应来源，整理不动它们）：微信会话、旧版 OpenCode、仅题目命中、跨块的扩展区汉字。
  put(join(DATA, 'logs/DSH/2026-11-12-dsh-log.md'),
    '# weixin-oABCDEFGHIJ-im-wechat-5dd8971a-b8fd-4c2e-9a1b-0123456789ab · 微信甲\n\n## 10:00  🧑 用户\n\n微信里问的第一件事\n\n'
    + '# weixin-oABCDEFGHIJ-im-wechat-efce8ed7-ad74-4c2e-9a1b-0123456789ab · 微信乙\n\n## 11:00  🧑 用户\n\n微信里问的第二件事\n');
  put(join(DATA, 'logs/OpenCode/2026-08-06-opencode-log.md'),
    '# 甲事（ses_1c5b）\n\n## 10:00  🧑 用户\n\n旧版 OpenCode 的第一场\n\n# 乙事（ses_1c5b）\n\n## 10:05  🧑 用户\n\n旧版 OpenCode 的第二场\n');
  put(join(DATA, 'logs/Claude/2026-11-13-claude-log.md'),
    '# 0a0a0a0a · 检索索引迁移\n\n## 10:00  🧑 用户\n\n照上次做\n\n## 10:01  🤖 Claude\n\n好的。\n\n# 0c0c0c0c\n\n## 11:00  🧑 用户\n\n' + BIG + '\n');
}

let lib, config;
before(async () => {
  fixtures();
  lib = {
    config: await import('../lib/config.js'),
    refresh: await import('../lib/refresh.js'),
    store: await import('../lib/store.js'),
    recall: await import('../lib/recall.js'),
    raw: await import('../lib/raw.js'),
    markdown: await import('../lib/markdown.js'),
    text: await import('../lib/text.js'),
  };
  lib.config.saveConfig(DATA, { userLabel: '用户', timezone: '+08:00' });
  config = lib.config.loadConfig(DATA);
  const status = lib.refresh.refresh({ home: DATA });
  assert.equal(status.index.ok, true, JSON.stringify(status.index));
});

const withDb = fn => { const db = lib.store.connect(DATA); try { lib.store.updateIndex(DATA, config, db); return fn(db); } finally { db.close(); } };
const base = { limit: 6, snippet: 220, budget: 3000, sort: 'relevance' };

test('围栏：缩进的 ~~~~^^ 不算；收尾同种符号、不短于开头；没收尾的发言补上', () => {
  const { fenceStep, demote, sections } = lib.markdown;
  assert.equal(fenceStep(null, '                     ~~~~^^'), null, '缩进超过 3 格不是围栏');
  assert.equal(fenceStep(null, '\t```'), null, '制表符缩进也不算');
  assert.equal(fenceStep(null, '   ```js'), '```');
  assert.equal(fenceStep('````', '```'), '````', '收尾不能比开头短');
  assert.equal(fenceStep('```', '~~~'), '```', '符号不同不收尾');
  assert.equal(fenceStep('```', '```bash'), null, '带信息串的也算收尾，与旧版一致');
  // 嵌在 ```md 里的代码块：旧日志常见，按这套规则开合成对，后面的会话照常切开。
  assert.deepEqual([...sections('# a\n\n```md\nx\n```bash\ny\n```\nz\n```\n\n# b\n\nw\n').keys()], ['a', 'b']);
  assert.equal(demote(TRACE).split('\n').at(-2), '### 结论', '回溯之后的标题照常降级');
  assert.equal(demote(CUT), CUT + '\n```', '停在代码块中间的发言补上收尾');
  assert.equal(demote('```\nx\n'), '```\nx\n```\n');
  assert.deepEqual([...sections('# a\n\n    ~~~~^^\n\n# b\n\nx\n').keys()], ['a', 'b']);
});

test('会话归属：回溯和截断的代码块之后，同一天后面的会话不再被并进前一场', () => {
  const log = readFileSync(join(DATA, 'logs/Claude/2026-11-10-claude-log.md'), 'utf8');
  assert.match(log, /  H\n```\n/, '截断的代码块在日志里已补上收尾');
  assert.doesNotMatch(log, /\n~~~~\n/, '回溯不当围栏，不补收尾');
  assert.match(log, /^# bbbb0002 · 第二场标题$/m, '后面的会话照常补上标题');
  withDb(db => {
    const rows = db.prepare("SELECT session, title FROM sessions WHERE agent='Claude' AND first_day='2026-11-10' ORDER BY session").all();
    assert.deepEqual(rows.map(r => r.session), ['aaaa0001', 'bbbb0002', 'cccc0003']);
    assert.equal(rows[1].title, '第二场标题');
    const first = db.prepare("SELECT group_concat(body, '') b FROM chunks WHERE agent='Claude' AND session='aaaa0001'").get().b;
    assert.doesNotMatch(first, /第二场|第三场/);
  });
});

test('Codex：同一分钟开的两场分开；旧日志的 8 位 ID 认作同一会话，不重复保留', () => {
  const log = readFileSync(join(DATA, 'logs/Codex/2026-11-08-codex-log.md'), 'utf8');
  assert.match(log, new RegExp(`^# ${ID1} · 甲场$`, 'm'));
  assert.match(log, new RegExp(`^# ${ID2} · 乙场$`, 'm'));
  assert.doesNotMatch(log, /旧标题/, '旧的合并段已由新渲染取代');
  assert.match(log, /来源早已删除的旧会话/, '真正缺来源的旧会话照常保留');
  const { preserveMissing } = lib.markdown;
  const [body, kept] = preserveMissing('# 修 VPN（ses_abcd）\n\nold\n\n# 别的（ses_ffff）\n\nkeep\n', '# ses_abcdef123 · 修 VPN\n\nnew\n');
  assert.equal(kept, 1, '旧版 OpenCode 的「标题（ses_xxxx）」也认得');
  assert.match(body, /keep/);
  assert.doesNotMatch(body, /old/);
  assert.equal(preserveMissing('# session-1\n\nx\n', '# session-10\n\ny\n')[1], 1, '只对旧版写法按前缀认，别的 ID 不按前缀');
  withDb(db => {
    const ctx = { config };
    assert.match(lib.recall.outline(db, { target: '01a1b6e7', budget: 3000, width: 100 }, ctx), /有多个会话匹配/);
    assert.match(lib.recall.outline(db, { target: '01a1b6e7-13ec', budget: 3000, width: 100 }, ctx), /^Codex 01a1b6e7-13ec「甲场」/);
    assert.match(lib.raw.raw(db, { target: '01a1b6e7-760b', query: ['另一场'], width: 200, budget: 2000 }, ctx), /乙场.*原始记录｜1 处/s);
  });
});

test('短 ID：微信会话取末尾 UUID；同 agent 撞了的显示完整 ID；--session 有歧义时列出来', () => {
  assert.equal(lib.text.shortSid('weixin-oABCDEFGHIJ-im-wechat-5dd8971a-b8fd-4c2e-9a1b-0123456789ab'), '5dd8971a-b8fd');
  assert.equal(lib.text.shortSid('ses_1c5b2f3a8ffeAbCdEfGh123456'), 'ses_1c5b2f3a8ffe');
  withDb(db => {
    const ctx = { config };
    const line = lib.recall.timeline(db, { since: '2026-08-01', budget: 3000, all: true }, ctx);
    assert.match(line, /DSH 5dd8971a-b8fd 1轮「微信甲」/);
    assert.match(line, /DSH efce8ed7-ad74 1轮「微信乙」/);
    assert.match(line, /OpenCode 甲事（ses_1c5b） /, '旧版 OpenCode 只存了 4 位，撞了就给完整 ID');
    assert.match(lib.recall.outline(db, { target: 'efce8ed7-ad74', budget: 3000, width: 100 }, ctx), /^DSH efce8ed7-ad74「微信乙」/);
    assert.match(lib.recall.outline(db, { target: '乙事（ses_1c5b）', budget: 3000, width: 100 }, ctx), /第二场/);
    const mixed = lib.recall.search(db, { ...base, query: ['微信'], session: 'weixin-o' }, ctx);
    assert.match(mixed, /有多个会话匹配/);
    assert.doesNotMatch(mixed, /内按时间列/);
  });
});

test('仅题目命中：题目里有、正文里没有的词也能找到；限定发言人时不看题目', () => {
  withDb(db => {
    const ctx = { config };
    assert.match(lib.recall.search(db, { ...base, query: ['索引迁移'] }, ctx), /Claude 0a0a0a0a 2轮 仅题目命中「检索索引迁移」\n {3}↳ .*outline 0a0a0a0a/);
    const both = lib.recall.search(db, { ...base, query: ['索引', '照上次'] }, ctx);
    assert.match(both, /1 个会话含全部词/, '题目和正文合起来覆盖全部词');
    assert.match(lib.recall.search(db, { ...base, query: ['索引迁移'], role: 'user' }, ctx), /未查到记录/);
  });
});

test('get：跨块拼回含扩展区汉字的长消息，与原文逐字相同', () => {
  withDb(db => {
    const parts = db.prepare("SELECT id, part FROM chunks WHERE session='0c0c0c0c' ORDER BY part").all();
    assert.equal(parts.length, 2, '这条消息切成两块，重叠区全是 𠮷');
    const out = lib.recall.get(db, { id: parts[0].id, context: 0, budget: 20000 }, { config });
    assert.equal((out.match(/𠮷/gu) || []).length, 300);
    assert.ok(out.includes(BIG), '拼回的正文与原文一致');
    assert.doesNotMatch(out, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, '没有切成半个字');
  });
  assert.equal(lib.text.clip('ab𠮷cd', 4), 'ab…', '截断不切开扩展区汉字');
});

test('整理状态：索引失败时 CLI 以 1 退出（含 --json），status 与插件页都显示问题', async () => {
  const broken = join(HOME, 'broken-home');
  mkdirSync(join(broken, 'state/index.sqlite3'), { recursive: true }); // 索引路径被目录占了，打不开
  const run = (...args) => spawnSync(process.execPath, [BIN, ...args, '--home', broken], { encoding: 'utf8', env: { ...process.env, HOME } });
  const json = run('refresh', '--json');
  assert.equal(json.status, 1, json.stderr);
  const status = JSON.parse(json.stdout);
  assert.equal(status.index.ok, false);
  assert.ok(status.problems.some(p => p.scope === 'index' && /日志已保存/.test(p.text)));
  assert.equal(status.agents.Claude.ok, true, '日志照常写好');
  const text = run('refresh');
  assert.equal(text.status, 1);
  assert.match(text.stdout, /索引: ERROR 日志已保存/);
  assert.match(run('status').stdout, /状态：1 处问题\n {2}日志已保存，检索索引更新失败/);
  const { snapshot } = await import('../index.js');
  assert.ok(snapshot(broken).problems.some(p => p.scope === 'index'), '插件页拿到同一份问题');
  assert.deepEqual(lib.refresh.problems({ agents: { Claude: { ok: true } }, index: { ok: true }, skill: {} }), []);
});

test('索引已是最新时不开写事务：别的进程拿着写锁也能查', () => {
  withDb(() => {});
  const path = join(DATA, 'state/index.sqlite3');
  const holder = new DatabaseSync(path);
  holder.exec('BEGIN IMMEDIATE');
  const quick = new DatabaseSync(path, { timeout: 200 });
  try {
    const r = lib.store.updateIndex(DATA, config, quick);
    assert.equal(r.updated, 0);
    assert.ok(r.sessions > 0);
  } finally {
    holder.exec('ROLLBACK');
    holder.close();
    quick.close();
  }
});

test('0.3.2 自定义 agent：status 不崩，并列出这个 agent', () => {
  const home = join(HOME, 'custom-status');
  const sessions = join(home, 'pi-sessions');
  mkdirSync(join(sessions, 'chat'), { recursive: true });
  writeFileSync(join(home, 'config.json'), JSON.stringify({ custom: [{ name: 'wechat-agent', format: 'pi', sessions }] }));
  const r = spawnSync(process.execPath, [BIN, 'status', '--home', home], { encoding: 'utf8', env: { ...process.env, HOME } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /wechat-agent/);
});
