// 支持的 agent：会话来源（清洗用）与技能目录（接入技能用）。
import claude from './sources/claude.js';
import codex from './sources/codex.js';
import antigravity from './sources/antigravity.js';
import pi from './sources/pi.js';
import dsh from './sources/dsh.js';
import { isDir } from './files.js';

export const SOURCES = [claude, codex, antigravity, pi, dsh];
export const byId = id => SOURCES.find(s => s.id === id);
export const byFolder = folder => SOURCES.find(s => s.folder === folder);

/** 某 agent 在本机的路径（随环境变量与配置变）。 */
export function pathsOf(source, config = {}, env = process.env) {
  return source.locate(env, config.agents?.[source.id] || {});
}

/** 是否装过：会话根目录或配置根目录存在。 */
export function detected(source, config = {}, env = process.env) {
  const paths = pathsOf(source, config, env);
  return [...paths.roots, ...(paths.marks || [paths.base])].some(isDir);
}

/** 是否清洗：配置里显式开关优先，否则检测到就清洗。 */
export function enabled(source, config = {}, env = process.env) {
  const flag = config.agents?.[source.id]?.enabled;
  return typeof flag === 'boolean' ? flag : detected(source, config, env);
}
