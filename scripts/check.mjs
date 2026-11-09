import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
const rootReadme = read(join(root, 'README.md'))
const changelog = read(join(root, 'CHANGELOG.md'))
// 只检查已纳入 Git 的独立包；本地未提交的原型不是公开插件。
const tracked = spawnSync('git', ['ls-files', '--', 'dsh-*/package.json'], { cwd: root, encoding: 'utf8' })
assert.equal(tracked.status, 0, tracked.stderr || '无法读取 Git 插件清单')
const plugins = tracked.stdout.trim().split(/\r?\n/)
  .filter(path => /^dsh-[^/]+\/package\.json$/.test(path))
  .map(path => path.split('/')[0]).sort()
assert(plugins.length > 0, '没有发现已纳入 Git 的插件')

function run(args, cwd = root) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.stdout.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    throw new Error(`命令失败：node ${args.join(' ')}`)
  }
  return result.stdout
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.git'].includes(entry.name)) return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}

for (const name of plugins) {
  const directory = join(root, name)
  const manifest = JSON.parse(read(join(directory, 'package.json')))
  assert.match(manifest.name, /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, `${name}: 包名不合法`)
  const patchText = read(join(directory, manifest.dsh.bundle.patch))
  const patchName = manifest.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  assert(new RegExp(`name:\\s*['"]?${patchName}['"]?\\s*$`, 'm').test(patchText), `${name}: 组合补丁的 name 须为包名 ${manifest.name}`)
  assert.match(manifest.version, /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/)
  assert.notEqual(manifest.private, true, `${name}: 独立插件不可标记为 private`)
  assert(['MIT', 'Apache-2.0'].includes(manifest.license), `${name}: 许可须为 MIT 或 Apache-2.0`)
  if (manifest.license === 'Apache-2.0') assert(existsSync(join(directory, 'NOTICE')), `${name}: Apache-2.0 必须保留 NOTICE`)
  assert(manifest.engines?.node && manifest.engines?.dsh, `${name}: 缺少兼容范围`)
  assert.equal(manifest.repository?.directory, name)
  assert.equal(manifest.repository?.url, 'git+https://github.com/fujingzhai/youxia-dsh-plugins.git')
  assert(manifest.dsh?.bundle?.patch, `${name}: 缺少 dsh.bundle.patch`)
  assert(manifest.main && existsSync(join(directory, manifest.main)), `${name}: Host 入口缺失`)
  assert(existsSync(join(directory, manifest.dsh.bundle.patch)), `${name}: 组合补丁缺失`)
  if (manifest.dsh.client) {
    assert.equal(manifest.dsh.client.platform, 'web')
    assert(existsSync(join(directory, manifest.exports?.['./client'] ?? '')), `${name}: Client 入口缺失`)
  }
  const readme = read(join(directory, 'README.md'))
  // DSH 的 npm 版本检查由 Host 提供，不另写更新器；守住安装来源与清单条件。
  const npmBlock = `\`\`\`text\n${manifest.name}\n\`\`\``
  const gitPosition = readme.indexOf('git+https://')
  assert(readme.indexOf(npmBlock) >= 0 && (gitPosition < 0 || readme.indexOf(npmBlock) < gitPosition), `${name}: 安装须优先推荐 npm 包名，Git 仅作固定版本备选`)
  assert(readme.includes(`dsh plugin --profile desktop add ${manifest.name}`), `${name}: 缺少 npm 命令行安装方式`)
  for (const marker of ['### 检查更新', '重新检查', '更新到 <版本>', '无需手动卸载重装', '不是全局推送', '不自动升级', 'link:']) {
    assert(readme.includes(marker), `${name}: 更新说明缺少 ${marker}`)
  }
  assert(rootReadme.includes(`\n${manifest.name}\n`), `${name}: 首页缺少 npm 安装清单`)
  if (manifest.name !== name) {
    assert(rootReadme.includes(manifest.name), `${name}: 首页未写明 npm 包名 ${manifest.name}`)
    assert(readme.includes(manifest.name), `${name}: 插件说明未写明 npm 包名 ${manifest.name}`)
  }
  assert(existsSync(join(directory, 'LICENSE')), `${name}: 缺少 LICENSE`)
  const spec = `git+https://github.com/fujingzhai/youxia-dsh-plugins.git#${name}@${manifest.version}&path:/${name}`
  assert(rootReadme.includes(spec), `${name}: 首页安装地址未与版本同步`)
  assert(readme.includes(spec), `${name}: 插件安装地址未与版本同步`)
  assert(changelog.includes(`${name} ${manifest.version}`), `${name}: 缺少变更记录`)
  const allFiles = filesIn(directory)
  const tests = allFiles.filter(path => path.endsWith('.test.js'))
  assert(tests.length > 0, `${name}: 缺少回归测试`)
  for (const file of allFiles.filter(path => /\.(?:js|mjs)$/.test(path))) {
    run(['--check', file])
  }
  process.stdout.write(run(['--test', ...tests], directory))
  // Use npm's JS entry so this runs without a Unix shell on Windows too.
  assert(process.env.npm_execpath, '请通过 npm run check 执行')
  const packResult = JSON.parse(run([process.env.npm_execpath, 'pack', '--dry-run', '--json'], directory))
  const packed = Array.isArray(packResult) ? packResult[0] : packResult[manifest.name] ?? packResult[name]
  const packedPaths = new Set(packed.files.map(file => file.path))
  for (const required of ['package.json', 'README.md', 'LICENSE', manifest.main, manifest.dsh.bundle.patch,
    ...(manifest.dsh.client ? [manifest.exports['./client']] : [])]) {
    assert(packedPaths.has(required.replace(/^\.\//, '')), `${name}: 打包缺少 ${required}`)
  }
  for (const file of packed.files) {
    assert(!/(^|\/)(?:node_modules|\.git|\.env)(?:\/|$)/.test(file.path), `${name}: 包含不应分发的文件`)
    const content = read(join(directory, file.path))
    assert(!/\/Users\/|\/home\/[a-z][\w-]*\/|[A-Z]:\\Users\\/.test(content), `${name}/${file.path}: 含本机绝对路径`)
  }
  console.log(`✓ ${name}@${manifest.version}: 清单、文档、语法、测试、打包通过`)
}
console.log(`\n${plugins.length} 个独立插件全部通过。`)
