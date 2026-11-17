// 读文件的小工具：目录列举（不扫家目录，只进给定根目录）、文本读取（含 zstd 多帧）、签名。
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { homedir } from 'node:os';

// os.homedir() 在 POSIX 读 HOME、在 Windows 读 USERPROFILE，与各家 agent 的取法一致。
export const home = () => homedir();

/** 展开开头的 ~。 */
export function expand(path) {
  if (typeof path !== 'string' || !path) return path;
  if (path === '~') return home();
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(home(), path.slice(2));
  return path;
}

/** 家目录换回 ~，便于展示。 */
export function tilde(path) {
  if (typeof path !== 'string') return path;
  const h = home(), win = process.platform === 'win32';
  const a = win ? path.toLowerCase() : path, b = win ? h.toLowerCase() : h;
  return a === b || a.startsWith(b + sep) || (win && a.startsWith(b + '/')) ? '~' + path.slice(h.length) : path;
}

export function isDir(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}

export function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

/** 列出目录项（含隐藏项，与 pathlib 的 * 一致）；目录不存在返回空。 */
export function entries(dir) {
  try { return readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

/** dir 下各子目录中名字满足 test 的文件（root/*\/name）。 */
export function filesTwoDeep(root, test) {
  const out = [];
  for (const d of entries(root)) {
    const sub = join(root, d.name);
    if (!isDir(sub)) continue;
    for (const f of entries(sub)) if (test(f.name) && isFile(join(sub, f.name))) out.push(join(sub, f.name));
  }
  return out;
}

/** 递归找满足 test(相对路径段数组) 的文件；depth 限深，跟随目录符号链接时防环。 */
export function walk(root, test, depth = 8, seen = new Set()) {
  const out = [];
  let real;
  try { real = statSync(root); } catch { return out; }
  const key = `${real.dev}:${real.ino}`;
  if (seen.has(key) || depth < 0) return out;
  seen.add(key);
  for (const d of entries(root)) {
    const path = join(root, d.name);
    if (isDir(path)) out.push(...walk(path, test, depth - 1, seen));
    else if (test(path)) out.push(path);
  }
  return out;
}

/** mtime＋大小，判断文件是否变过。 */
export function signature(path) {
  const s = statSync(path, { bigint: true });
  return `${s.mtimeNs}:${s.size}`;
}

// zstd：DSH 会话是多帧拼接，node:zlib 一次只解一帧，这里按帧头切开逐帧解。
function frames(buf) {
  const out = [];
  let p = 0;
  while (p + 4 <= buf.length) {
    const magic = buf.readUInt32LE(p);
    if ((magic & 0xFFFFFFF0) >>> 0 === 0x184D2A50) { p += 8 + buf.readUInt32LE(p + 4); continue; } // 可跳过帧
    if (magic !== 0xFD2FB528) throw new Error(`zstd 帧头无效（偏移 ${p}）`);
    const start = p;
    p += 4;
    const fhd = buf[p++];
    const fcs = fhd >> 6, single = (fhd >> 5) & 1, checksum = (fhd >> 2) & 1, dict = fhd & 3;
    if (!single) p += 1;
    p += [0, 1, 2, 4][dict] + [single ? 1 : 0, 2, 4, 8][fcs];
    for (;;) {
      if (p + 3 > buf.length) throw new Error('zstd 数据被截断');
      const h = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16);
      p += 3;
      const type = (h >> 1) & 3;
      p += type === 1 ? 1 : h >>> 3;
      if (h & 1) break;
    }
    if (checksum) p += 4;
    out.push(buf.subarray(start, Math.min(p, buf.length)));
  }
  return out;
}

export function unzstd(buf) {
  const parts = frames(buf);
  if (parts.length === 1) return zstdDecompressSync(parts[0]);
  return Buffer.concat(parts.map(part => zstdDecompressSync(part)));
}

/** 读文本；.zst / .zstd 先解压。坏字节按 U+FFFD 替换。 */
export function readText(path) {
  const buf = readFileSync(path);
  return (/\.zstd?$/.test(path) ? unzstd(buf) : buf).toString('utf8');
}

export const exists = existsSync;
