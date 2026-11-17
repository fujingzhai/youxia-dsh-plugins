// agent 注册表：内置各家的会话来源（清洗用）与技能目录（接入技能用），外加用户手动添加的同格式 agent。
import { dirname } from 'node:path';
import claude from './sources/claude.js';
import codex from './sources/codex.js';
import antigravity from './sources/antigravity.js';
import pi from './sources/pi.js';
import dsh from './sources/dsh.js';
import lobsterai from './sources/lobsterai.js';
import workbuddy from './sources/workbuddy.js';
import { isDir, expand } from './files.js';

export const SOURCES = [claude, codex, antigravity, pi, dsh, lobsterai, workbuddy];

/**
 * 自定义 agent 可选的会话格式：与哪一家相同，会话目录选哪一层。
 * dir：要填的那一层目录名；layout：它下面的结构；example：常见用法。
 */
export const FORMATS = {
  claude: { source: claude, label: 'Claude Code 格式', dir: 'projects', layout: '<项目>/<会话>.jsonl',
    example: 'Qoder CLI：~/.qoder-cn/projects；另一套 Claude Code 配置：~/.claude-work/projects' },
  codex: { source: codex, label: 'Codex 格式', dir: 'sessions', layout: '<年>/<月>/<日>/rollout-*.jsonl',
    example: '另一个 CODEX_HOME：~/.codex-work/sessions' },
  pi: { source: pi, label: 'Pi 格式', dir: 'sessions', layout: '<目录>/<会话>.jsonl', example: '另一个 Pi 配置目录下的 sessions' },
  dsh: { source: dsh, label: 'DSH 格式', dir: 'sessions', layout: '<目录>/<会话>/session.vN.jsonl.zstd', example: '另一个 DSH_HOME：~/.dsh-work/sessions' },
  antigravity: { source: antigravity, label: 'Antigravity 格式', dir: 'brain', layout: '<会话>/.system_generated/logs/transcript_full.jsonl',
    example: '第二个实例：~/.gemini-work/antigravity-cli/brain' },
  lobsterai: { source: lobsterai, label: 'LobsterAI（OpenClaw）格式', dir: 'agents', layout: '<agent>/sessions/<会话>.jsonl',
    example: '其他基于 OpenClaw 的客户端的 agents 目录' },
  workbuddy: { source: workbuddy, label: 'WorkBuddy（CodeBuddy）格式', dir: 'projects', layout: '<项目>/<会话>.jsonl',
    example: 'CodeBuddy Code：~/.codebuddy/projects' },
};

const RESERVED = new Set(SOURCES.map(s => s.folder.toLowerCase()));

/** 名称 → 日志文件夹名：保留字母（含中文）、数字、- 和 _，其余换成 -；与内置或彼此重名时加序号。 */
export function folderFor(name, taken = new Set()) {
  const base = String(name).trim().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'Agent';
  let folder = base, n = 2;
  while (RESERVED.has(folder.toLowerCase()) || taken.has(folder.toLowerCase())) folder = `${base}-${n++}`;
  taken.add(folder.toLowerCase());
  return folder;
}

/** 自定义 agent：沿用对应格式的解析与渲染，只换会话目录、技能目录与名称。 */
export function customSource(def) {
  const format = FORMATS[def.format];
  const base = format.source;
  return {
    ...base, id: def.id, folder: def.folder, name: def.name, custom: true, format: def.format,
    locate() {
      const sessions = expand(def.sessions);
      return { base: dirname(sessions), sessions, projects: sessions, agentsRoot: sessions, roots: [sessions], cowork: null,
        marks: [sessions], skills: def.skills ? [expand(def.skills)] : [] };
    },
    render: (all, clock, userLabel) => base.render(all, clock, userLabel, def.name),
  };
}

/** 内置＋自定义。 */
export function allSources(config = {}) {
  return [...SOURCES, ...(config.custom || []).map(customSource)];
}

export const byId = (id, config = {}) => allSources(config).find(s => s.id === id);
export const byFolder = (folder, config = {}) => allSources(config).find(s => s.folder === folder);

/** 某 agent 在本机的路径（随环境变量与配置变）。 */
export function pathsOf(source, config = {}, env = process.env) {
  return source.locate(env, config.agents?.[source.id] || {});
}

/** 是否装过：会话根目录或该 agent 的配置根目录存在。 */
export function detected(source, config = {}, env = process.env) {
  const paths = pathsOf(source, config, env);
  return [...paths.roots, ...(paths.marks || [paths.base])].some(isDir);
}

/** 是否收录：配置里显式开关优先，否则检测到就收录。 */
export function enabled(source, config = {}, env = process.env) {
  const flag = config.agents?.[source.id]?.enabled;
  return typeof flag === 'boolean' ? flag : detected(source, config, env);
}
