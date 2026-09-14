/**
 * upgrade-dsh.mjs — 一键升级 deepseek-harness 上游并自动打本地补丁，可选重建闭包/打包。
 *
 * 用法：
 *   node scripts/upgrade-dsh.mjs [tag]            # 仅拉源码 + 自动打本地补丁（默认）
 *   node scripts/upgrade-dsh.mjs [tag] --build    # + 构建（tsc/tsdown/vite）
 *   node scripts/upgrade-dsh.mjs [tag] --package  # + 生成 dsh-runtime 闭包 + 补齐 + 实体化 + 打包
 *
 * tag 省略时沿用 update-dsh.mjs 默认（当前 vendored 版本同 tag）。
 * 步骤串联（全部继承 stdio 实时输出）：
 *   1) update-dsh.mjs      下载 codeload zip → 替换 deepseek-harness → apply-dsh-patches 自动补丁
 *   2) --build             Node24 + corepack pnpm run build（tsc host/client + tsdown + vite web）
 *   3) --package           pnpm deploy 闭包 → patch-closure-missing 补齐 → junction 实体化
 *                          → ensure-portable-closure → electron-builder --win --x64
 */
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const NODE24_DIR = path.join(ROOT, '.tools', 'node-v24.20.0-win-x64')
const NODE24 = path.join(NODE24_DIR, 'node.exe')
const COREPACK = 'C:/Program Files/nodejs/node_modules/corepack/dist/corepack.js'
const HARNESS = path.join(ROOT, 'deepseek-harness')
const APP = path.join(ROOT, 'dsh-z-gui', 'app')
const RUNTIME = path.join(APP, 'dsh-runtime')
const SCRIPTS = path.join(ROOT, 'scripts')

function run(cmd, args, opts = {}) {
  console.log(`\n>>> ${path.basename(cmd)} ${args.join(' ')}`)
  execFileSync(cmd, args, {
    stdio: 'inherit',
    cwd: opts.cwd || ROOT,
    env: opts.env || process.env,
  })
}

function node24(args, opts) { run(NODE24, args, opts) }

function pnpm(args, opts) {
  run(NODE24, [COREPACK, 'pnpm', ...args], {
    ...opts,
    env: { ...process.env, PATH: `${NODE24_DIR}${path.delimiter}${process.env.PATH || ''}` },
  })
}

/** 实体化闭包内残留 junction（deploy 的 hoisted 布局可能留下指向 harness/vendor 的链接，打包时 EPERM）。 */
function materializeJunctions(root) {
  const scope = path.join(root, 'node_modules', '@deepseek-ai')
  if (!existsSync(scope)) return 0
  let fixed = 0
  for (const name of readdirSync(scope)) {
    const p = path.join(scope, name)
    let st
    try { st = lstatSync(p) } catch { continue }
    if (!st.isSymbolicLink()) continue
    const target = path.join(ROOT, 'deepseek-harness', 'vendor', name)
    console.log(`[upgrade] 实体化 junction: @deepseek-ai/${name} -> ${target}`)
    rmSync(p, { recursive: false, force: true })
    run('robocopy', [target, p, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { cwd: ROOT })
    fixed += 1
  }
  return fixed
}

const args = process.argv.slice(2)
const positional = args.find((a) => !a.startsWith('-'))
const tag = positional || undefined
const doBuild = args.includes('--build')
const doPackage = args.includes('--package')

if (!existsSync(NODE24)) {
  console.error(`[upgrade] 缺少项目自带 Node24: ${NODE24}`)
  process.exit(1)
}

// 1) 拉源码 + 自动打本地补丁（update-dsh.mjs 已内置 apply-dsh-patches）。
node24([path.join(SCRIPTS, 'update-dsh.mjs'), ...(tag ? [tag] : [])])

// 2) 构建（Node24 + corepack pnpm）。
if (doBuild) {
  if (!existsSync(HARNESS)) { console.error('[upgrade] harness 缺失'); process.exit(1) }
  pnpm(['run', 'build'], { cwd: HARNESS })
}

// 3) 闭包 + 补齐 + 实体化 + 打包。
if (doPackage) {
  if (!existsSync(HARNESS)) { console.error('[upgrade] harness 缺失'); process.exit(1) }
  rmSync(RUNTIME, { recursive: true, force: true })
  pnpm([
    '--config.verify-deps-before-run=false', '--filter', '@deepseek-ai/dsh',
    'deploy', RUNTIME, '--prod', '--legacy', '--ignore-scripts', '--config.node-linker=hoisted',
  ], { cwd: HARNESS })
  node24([path.join(SCRIPTS, 'patch-closure-missing.mjs')])
  const fixed = materializeJunctions(RUNTIME)
  console.log(`[upgrade] junction 实体化完成: ${fixed} 个`)
  run('python', [path.join(ROOT, 'dsh-z-gui', 'scripts', 'ensure-portable-closure.py'), RUNTIME])
  const builder = path.join(APP, 'node_modules', 'electron-builder', 'cli.js')
  if (!existsSync(builder)) { console.error('[upgrade] 未找到 electron-builder cli'); process.exit(1) }
  run(NODE24, [builder, '--win', '--x64'], {
    cwd: APP,
    env: { ...process.env, ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/' },
  })
}

console.log('\n[upgrade] 完成。')
