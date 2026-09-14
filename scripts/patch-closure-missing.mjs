/** 补齐 dsh-runtime 闭包缺失的 @deepseek-ai workspace 包（从已构建的 harness 源码复制）。 */
import { readdirSync, existsSync, mkdirSync, copyFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const harness = 'd:/sourceCode/ai-app/dsh-d/deepseek-harness'
const closure = 'd:/sourceCode/ai-app/dsh-d/dsh-z-gui/app/dsh-runtime/node_modules/@deepseek-ai'

const ws = new Map()
function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (!e.isDirectory() || e.name === 'node_modules' || e.name === 'lib' || e.name === 'dist') continue
    const pj = join(p, 'package.json')
    if (existsSync(pj)) {
      try {
        const j = JSON.parse(readFileSync(pj, 'utf8'))
        if (j.name && j.name.startsWith('@deepseek-ai/')) ws.set(j.name, p)
      } catch {}
    }
    if (!['.git', 'node_modules'].includes(e.name)) walk(p)
  }
}
walk(join(harness, 'packages'))
// vendored @deepseek-ai deps (cordis/cosmokit/schemastery/...) live in harness/vendor
walk(join(harness, 'vendor'))

const has = existsSync(closure) ? readdirSync(closure) : []
const missing = [...ws.keys()].filter((n) => !has.includes(n.replace('@deepseek-ai/', '')))
console.log(`missing: ${missing.length}`)

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true })
  for (const e of readdirSync(src, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue
    const s = join(src, e.name)
    const t = join(dest, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) copyDir(s, t)
    else copyFileSync(s, t)
  }
}
let copied = 0
for (const name of missing) {
  const src = ws.get(name)
  const dest = join(closure, name.replace('@deepseek-ai/', ''))
  if (src) { copyDir(src, dest); copied++ }
}
console.log(`copied: ${copied}`)
