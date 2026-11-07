/**
 * Bundle the browser terminal renderer into lib/client.js.
 * xterm is inlined because the desktop module loader does not expose it;
 * React stays a require() provided by DSH.
 */
import { build, transform } from 'esbuild'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const runtime = await build({
  stdin: {
    contents: [
      "import { Terminal } from '@xterm/xterm'",
      "import { FitAddon } from '@xterm/addon-fit'",
      "import css from '@xterm/xterm/css/xterm.css'",
      'globalThis.__dshAgentsXterm = { Terminal, FitAddon, css }',
    ].join('\n'),
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  format: 'iife',
  write: false,
  minify: true,
  legalComments: 'none',
  loader: { '.css': 'text' },
})
const source = await transform(readFileSync(join(root, 'src/client.js'), 'utf8'), {
  minify: true, legalComments: 'none', target: 'es2022',
})
const banner = [
  '/* dsh-agents-cli client. Includes @xterm/xterm and @xterm/addon-fit, both MIT. */',
  runtime.outputFiles[0].text,
  '',
].join('\n')
writeFileSync(join(root, 'lib/client.js'), banner + source.code)
