/**
 * 构建 React 桌面标题栏 client bundle。
 * esbuild 打成 CommonJS（external react/react-dom），再用 __ModuleLoader__.load 的
 * factory 包装——bundle 内的 require(...) 在 factory 作用域解析到 dsh client 模块系统。
 */
import { build } from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = path.resolve(__dirname, '..')
const entry = path.join(app, 'client-src', 'desktop-titlebar', 'index.tsx')
const tmpBundle = path.join(app, 'node_modules', '.cache', 'desktop-titlebar-bundle.cjs')
const outfile = path.join(app, 'builtin-plugins', 'dsh-desktop-frame', 'lib', 'client.js')

fs.mkdirSync(path.dirname(tmpBundle), { recursive: true })

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'cjs',
  outfile: tmpBundle,
  external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

const bundle = fs.readFileSync(tmpBundle, 'utf8')
const wrapper = `window.__ModuleLoader__.load({
  id: 'dsh-desktop-frame',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
${bundle}
    return module.exports
  },
})
`
fs.writeFileSync(outfile, wrapper)
fs.rmSync(tmpBundle, { force: true })
console.log('[build-titlebar] done -> builtin-plugins/dsh-desktop-frame/lib/client.js')
