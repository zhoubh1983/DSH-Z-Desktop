#!/usr/bin/env node
/**
 * update-dsh.mjs
 *
 * Upgrade the vendored Deep Seek Harness snapshot (deepseek-harness/) from the
 * official upstream, then re-apply this workspace's persistent patches.
 *
 * Why not a git submodule: github.com's git transport (port 443) is
 * unreliable in this environment, while codeload.github.com / raw.githubusercontent.com
 * are reachable. So the source of truth is fetched as a codeload zip and the
 * harness directory is replaced with the snapshot; the patches layer
 * (scripts/apply-dsh-patches.mjs) restores your local fixes on top.
 *
 * Usage:
 *   node scripts/update-dsh.mjs [<tag-or-branch>] [--dry-run]
 *     <tag-or-branch>  defaults to the tag matching the currently vendored
 *                      version (from deepseek-harness/package.json) as
 *                      `dsh-v<version>`, else `master`.
 *     --dry-run        resolve the target and report the plan without touching disk.
 *
 * Flow:
 *   1. Resolve target ref (default: dsh-v<curVersion>).
 *   2. Download https://codeload.github.com/deepseek-ai/deepseek-harness/zip/<ref>.
 *   3. Extract to a temp dir.
 *   4. Replace deepseek-harness/ with the snapshot (rm the old contents and move).
 *   5. Run scripts/apply-dsh-patches.mjs to re-apply your local patches.
 *   6. Remind the user to rebuild dsh-runtime + repackage.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const HARNESS = join(ROOT, 'deepseek-harness')
const OWNER = 'deepseek-ai'
const REPO = 'deepseek-harness'
const CDN = `https://codeload.github.com/${OWNER}/${REPO}/zip`

function fail(msg) {
  console.error(`update-dsh: ${msg}`)
  process.exit(1)
}

/** Current vendored version from deepseek-harness/package.json. */
function currentVersion() {
  try {
    const p = JSON.parse(readFileSync(join(HARNESS, 'package.json'), 'utf8'))
    return p.version
  } catch {
    return undefined
  }
}

/** Resolve the ref to fetch. A tag `dsh-v<version>` is preferred when it heads the current snapshot. */
function resolveRef() {
  const positional = process.argv.slice(2).find(a => !a.startsWith('-'))
  if (positional !== undefined) return positional
  const ver = currentVersion()
  if (ver !== undefined) return `dsh-v${ver}`
  return 'master'
}

const dryRun = process.argv.includes('--dry-run')
const ref = resolveRef()
console.log(`update-dsh: target ref = ${ref}`)
if (dryRun) {
  console.log('update-dsh: dry-run — no changes made.')
  console.log(`update-dsh: would download ${CDN}/${ref}, replace ${HARNESS}, then apply patches.`)
  process.exit(0)
}

if (!existsSync(HARNESS)) {
  console.log(`update-dsh: ${HARNESS} missing; will create it from scratch.`)
}

// 1. Download the zip into a temp extraction root.
const extractionRoot = mkdtempSync(join(tmpdir(), 'dsh-update-'))
const zipPath = join(extractionRoot, 'harness.zip')
const url = `${CDN}/${encodeURIComponent(ref)}`
console.log(`update-dsh: downloading ${url} …`)
try {
  const res = await fetch(url)
  if (!res.ok) fail(`codeload answered ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`update-dsh: downloaded ${(buf.length / 1024 / 1024).toFixed(1)} MiB`)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(zipPath, buf)
} catch (error) {
  fail(`download failed: ${error.message}`)
}

// 2. Extract. Windows bsdtar chokes on dot-entries (.claude/, .agents/, CLAUDE.md),
// so use Python's zipfile (the repo already depends on python for other scripts).
const py = process.platform === 'win32' ? 'python' : 'python3'
try {
  execFileSync(py, ['-c', `import zipfile; zipfile.ZipFile(r'${zipPath}').extractall(r'${extractionRoot}')`], { stdio: 'pipe' })
} catch (error) {
  const msg = error.stderr?.toString() ?? error.message
  fail(`extract failed (need python zipfile): ${msg}`)
}
// codeload zips one top-level dir `<repo>-<ref>`; find it.
const top = readdirSync(extractionRoot).find(name => name !== 'harness.zip')
if (top === undefined) fail('extract produced no top-level directory')
const snapshot = join(extractionRoot, top)
if (!existsSync(join(snapshot, 'package.json'))) {
  fail(`snapshot ${snapshot} has no package.json; check the ref ${ref}`)
}

// 3. Replace deepseek-harness/ with the snapshot.
console.log(`update-dsh: replacing ${HARNESS} …`)
if (existsSync(HARNESS)) rmSync(HARNESS, { recursive: true, force: true })
const { cp, mkdir } = await import('node:fs/promises')
await mkdir(HARNESS, { recursive: true })
await cp(snapshot, HARNESS, { recursive: true })
console.log('update-dsh: harness snapshot in place.')

// 4. Re-apply patches.
const applyPatches = join(ROOT, 'scripts', 'apply-dsh-patches.mjs')
console.log('\nupdate-dsh: re-applying local patches …')
try {
  execFileSync('node', [applyPatches], { stdio: 'inherit' })
} catch (error) {
  console.error('\nupdate-dsh: patch application reported failures (exit nonzero). Review and fix before rebuilding.')
  // Continue to print guidance; exit code stays nonzero.
}

// 5. Cleanup + guidance.
rmSync(extractionRoot, { recursive: true, force: true })
console.log('\nupdate-dsh: done.')
console.log('Next: rebuild dsh-runtime and repackage (see CODEX_HANDOFF §4.2):')
console.log('  pnpm --config.verify-deps-before-run=false --filter @deepseek-ai/dsh deploy dsh-z-gui/app/dsh-runtime --prod --legacy --ignore-scripts --config.node-linker=hoisted')
console.log('  python dsh-z-gui/scripts/ensure-portable-closure.py .')
console.log('  cd dsh-z-gui/app && npx electron-builder --win --x64')