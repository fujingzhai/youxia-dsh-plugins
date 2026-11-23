#!/usr/bin/env node
/**
 * 生成合集根目录的 index.json（DSH 插件市场索引，格式 1）。
 * DSH 0.2.3 起可在插件页「发现 → 索引源」填 git+https://github.com/fujingzhai/youxia-dsh-plugins.git，
 * DSH 读取默认分支根目录的 index.json。
 *
 * - 每个插件只列 npm 发布标签（latest 等）指向的版本：旧版本的 engines.dsh 是当时写的下限，
 *   对后来的 DSH 未必真实（例如会话标签 0.1.4 在 DSH 0.2.3 下路由失效）；回退旧版走插件详情里的 npm 版本列表。
 *   版本、发布时间、engines.dsh 取自 npm 官方源，且须声明 engines.dsh 与 dsh.bundle。
 * - 标题、说明、图标、关键词取自仓库当前文件，规则同 DSH 显示已安装插件：
 *   locale/<语言>.json 的 meta.title / meta.description，回退 package.json 的 description；图标为 ./icon 导出的 SVG。
 * - 来源一律 { type: 'npm' }，不写 registry：用户从自己配置的源安装，DSH 再在公共源之间回退；
 *   写死官方源会让配了镜像的用户只能去连官方源。
 *
 *   node scripts/build-index.mjs                    重写 index.json
 *   node scripts/build-index.mjs --check            与 npm 现状、仓库文件比对，不一致退出码 1（CI 用）
 *   node scripts/build-index.mjs --expect a@1,b@2   等这些版本在 npm 官方源可见后再生成（发布脚本用）
 *
 * 装有 @deepseek-ai/dsh-plugin-market-index 时，另用 DSH 官方校验器解析一遍（CI 会安装）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { isDeepStrictEqual } from 'node:util'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const INDEX = join(root, 'index.json')
const INDEX_URL = 'git+https://github.com/fujingzhai/youxia-dsh-plugins.git'
const REGISTRY = 'https://registry.npmjs.org/'
const MAX_ICON_BYTES = 32 * 1024
const args = process.argv.slice(2)
const check = args.includes('--check')
const expectArg = args[args.indexOf('--expect') + 1]
const expected = args.includes('--expect') && expectArg ? expectArg.split(',').filter(Boolean) : []

const readJson = path => JSON.parse(readFileSync(path, 'utf8'))

function trackedPlugins() {
  const result = spawnSync('git', ['ls-files', '--', 'dsh-*/package.json'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || '无法读取 Git 插件清单')
  const names = result.stdout.trim().split(/\r?\n/).filter(p => /^dsh-[^/]+\/package\.json$/.test(p)).map(p => p.split('/')[0])
  // 发布者顺序即首页版本表顺序；表里没有的排在后面。
  const order = [...readFileSync(join(root, 'README.md'), 'utf8').matchAll(/^\| \[(dsh-[^\]]+)\]\(/gm)].map(m => m[1])
  const rank = name => (order.indexOf(name) + 1 || order.length + 1)
  return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/** 仅为输出稳定排序；DSH 读取时自己按 SemVer 排。 */
function compareSemver(a, b) {
  const split = v => { const [core, pre] = v.split('+')[0].split(/-(.*)/s); return [core.split('.').map(Number), pre?.split('.') ?? []] }
  const [ca, pa] = split(a), [cb, pb] = split(b)
  for (let i = 0; i < 3; i++) if (ca[i] !== cb[i]) return ca[i] - cb[i]
  if (!pa.length || !pb.length) return pb.length - pa.length
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1
    if (pb[i] === undefined) return 1
    const na = /^\d+$/.test(pa[i]), nb = /^\d+$/.test(pb[i])
    if (na && nb && +pa[i] !== +pb[i]) return +pa[i] - +pb[i]
    if (na !== nb) return na ? -1 : 1
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1
  }
  return 0
}

function localized(directory, field, fallback) {
  const values = {}
  for (const lang of ['en', 'zh']) {
    const file = join(directory, 'locale', `${lang}.json`)
    const text = existsSync(file) ? readJson(file).meta?.[field] : undefined
    if (typeof text === 'string' && text.trim()) values[lang] = text
  }
  if (values.en) return values
  return typeof fallback === 'string' && fallback.trim() ? fallback : undefined
}

function iconOf(directory, manifest) {
  const target = manifest.exports?.['./icon'] ?? manifest.icon
  if (typeof target !== 'string') return undefined
  const bytes = readFileSync(join(directory, target))
  if (!target.endsWith('.svg')) throw new Error(`${manifest.name}: 图标须为 SVG（${target}）`)
  if (bytes.length > MAX_ICON_BYTES) throw new Error(`${manifest.name}: 图标超过 32 KiB`)
  return `data:image/svg+xml;base64,${bytes.toString('base64')}`
}

function authorOf(author) {
  const name = typeof author === 'string' ? author.replace(/\s*[<(].*$/, '') : author?.name
  return typeof name === 'string' && name.trim() ? name.trim() : undefined
}

function repositoryOf(manifest) {
  const url = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  if (typeof url !== 'string') return undefined
  const web = url.replace(/^git\+/, '').replace(/\.git$/, '')
  return { url: web, ...manifest.repository?.directory ? { directory: manifest.repository.directory } : {} }
}

async function packument(name) {
  const response = await fetch(REGISTRY + name.replace('/', '%2F'), { headers: { accept: 'application/json' } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`${name}: npm 官方源返回 ${response.status}`)
  return response.json()
}

async function waitForExpected() {
  const deadline = Date.now() + 180_000
  for (const spec of expected) {
    const at = spec.lastIndexOf('@')
    const [name, version] = [spec.slice(0, at), spec.slice(at + 1)]
    while (!(await packument(name))?.versions?.[version]) {
      if (Date.now() > deadline) throw new Error(`${spec} 三分钟内未在 npm 官方源出现`)
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }
}

async function build() {
  const plugins = []
  const notes = []
  for (const name of trackedPlugins()) {
    const directory = join(root, name)
    const manifest = readJson(join(directory, 'package.json'))
    const doc = await packument(manifest.name)
    if (!doc) { notes.push(`${manifest.name}: 尚未发布到 npm，暂不收录`); continue }
    const versions = Object.entries(doc.versions ?? {})
      .filter(([, v]) => typeof v.engines?.dsh === 'string' && v.engines.dsh.trim() && v.dsh?.bundle && !v.deprecated)
      .map(([version, v]) => ({
        version,
        publishTimestamp: Math.floor(Date.parse(doc.time[version]) / 1000),
        source: { type: 'npm' },
        engines: { dsh: v.engines.dsh },
      }))
      .sort((a, b) => compareSemver(b.version, a.version))
    const tagged = new Set(Object.values(doc['dist-tags'] ?? {}))
    const current = versions.filter(v => tagged.has(v.version))
    versions.splice(0, versions.length, ...(current.length ? current : versions.slice(0, 1)))
    if (!versions.length) { notes.push(`${manifest.name}: 没有声明 engines.dsh 与 dsh.bundle 的已发布版本，暂不收录`); continue }
    const listed = new Set(versions.map(v => v.version))
    const distTags = Object.fromEntries(Object.entries(doc['dist-tags'] ?? {}).filter(([, v]) => listed.has(v)).sort())
    if (manifest.version !== versions[0].version) notes.push(`${manifest.name}: 仓库为 ${manifest.version}，npm 最高为 ${versions[0].version}`)
    const title = localized(directory, 'title')
    const description = localized(directory, 'description', manifest.description)
    const icon = iconOf(directory, manifest)
    const author = authorOf(manifest.author)
    const repository = repositoryOf(manifest)
    const keywords = (manifest.keywords ?? []).filter(k => typeof k === 'string' && k.trim())
    plugins.push({
      name: manifest.name,
      ...title ? { title } : {},
      ...description ? { description } : {},
      ...icon ? { icon } : {},
      ...author ? { author } : {},
      ...manifest.homepage ? { homepage: manifest.homepage } : {},
      ...repository ? { repository } : {},
      ...keywords.length ? { metadata: { keywords } } : {},
      ...Object.keys(distTags).length ? { 'dist-tags': distTags } : {},
      versions,
    })
  }
  const index = {
    format: 1,
    title: { en: 'youxia DSH plugins', zh: '游夏 DSH 插件合集' },
    description: {
      en: 'DSH plugins maintained by youxia, each installed and updated on its own.',
      zh: '自用并持续维护的 DSH 插件合集，各插件独立安装、独立更新。',
    },
    plugins,
  }
  return { index, notes }
}

async function validate(index) {
  let parseMarketIndex
  try { ({ parseMarketIndex } = await import('@deepseek-ai/dsh-plugin-market-index')) }
  catch { return '未安装 @deepseek-ai/dsh-plugin-market-index，跳过 DSH 官方校验' }
  parseMarketIndex(structuredClone(index), INDEX_URL)
  return 'DSH 官方校验通过'
}

await waitForExpected()
const { index, notes } = await build()
for (const note of notes) console.log(`· ${note}`)
console.log(`· ${await validate(index)}`)
const text = JSON.stringify(index, null, 2) + '\n'
if (check) {
  const current = existsSync(INDEX) ? readJson(INDEX) : null
  if (!isDeepStrictEqual(current, index)) {
    console.error('✗ index.json 与 npm 现状或仓库文件不一致。运行 node scripts/build-index.mjs 重新生成后提交。')
    const before = new Map((current?.plugins ?? []).map(p => [p.name, p]))
    for (const plugin of index.plugins) {
      const old = before.get(plugin.name)
      const missing = plugin.versions.map(v => v.version).filter(v => !old?.versions?.some(o => o.version === v))
      if (!old) console.error(`  缺少插件 ${plugin.name}`)
      else if (missing.length) console.error(`  ${plugin.name} 缺少版本 ${missing.join('、')}`)
      else if (!isDeepStrictEqual(old, plugin)) console.error(`  ${plugin.name} 的展示信息或版本元数据有变`)
      before.delete(plugin.name)
    }
    for (const name of before.keys()) console.error(`  多出插件 ${name}`)
    process.exit(1)
  }
  console.log(`✓ index.json 与 npm 现状一致（${index.plugins.length} 个插件）`)
} else {
  writeFileSync(INDEX, text)
  console.log(`✓ 已写入 index.json（${index.plugins.length} 个插件，${index.plugins.reduce((n, p) => n + p.versions.length, 0)} 个版本）`)
}
