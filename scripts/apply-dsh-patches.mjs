#!/usr/bin/env node
/**
 * apply-dsh-patches.mjs
 *
 * Re-apply this workspace's persistent patches to the Deep Seek Harness source
 * tree (deepseek-harness/) after upgrading it. Each patch is idempotent: run
 * inside deepseek-harness/, this script first probes whether a patch's effect
 * is already present and, if so, skips it; otherwise it applies it with
 * `git apply` (inside the harness directory, path-stripped as needed).
 *
 * Usage:
 *   node scripts/apply-dsh-patches.mjs          # eval copy inside deepseek-harness/
 *   node scripts/apply-dsh-patches.mjs --check  # report which patches would apply
 *
 * Paths are relative to the repo root; each entry resolves to a file inside
 * deepseek-harness/ whose post-patch content marks "applied".
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const HARNESS = join(ROOT, 'deepseek-harness')

/**
 * A patch definition. `files` are harness-relative paths to probe; `applied`
 * is a substring that must be present in the file for it to count as applied.
 * `args` are extra git apply flags (usually `['-p2']` for patches whose paths
 * carry a `deepseek-harness/` prefix).
 */
const PATCHES = [
  {
    name: 'directory-picker-native: use koffi.decode.string16 (official bug workaround)',
    file: join(HARNESS, 'packages/host/directory-picker-native/src/win32-dialog-bindings.ts'),
    applied: 'koffi.decode.string16(address)',
    patch: join(ROOT, 'patches/dsh/0002-fix-directory-picker-string16.patch'),
    args: ['-p1'],
  },
  {
    name: 'ui-settings-models: align deepseek key ref + validate at save (48b8bdd)',
    file: join(HARNESS, 'packages/client/ui-settings-models/src/client/ProviderEditor.tsx'),
    applied: "layout === 'pi-ai' || layout === 'deepseek'",
    patch: join(ROOT, 'patches/dsh/0001-fix-models-align-deepseek-key-ref-validate-key-at-sa.patch'),
    args: ['-p2'],
  },
  {
    name: 'ui-settings-general: add custom model provider nav icons (dafeiyu/webhook/memory/skill-market)',
    file: join(HARNESS, 'packages/client/ui-settings-general/src/client/SettingsRoot.tsx'),
    applied: "id === 'dsh-skill-market'",
    patch: join(ROOT, 'patches/dsh/0003-add-custom-model-nav-icons.patch'),
    args: ['-p1'],
  },
  {
    name: 'credentials-local: tolerate an unreadable credentials document at boot (self-heal)',
    file: join(HARNESS, 'packages/credentials/credentials-local/src/index.ts'),
    applied: "ignoring unreadable %s at boot",
    patch: join(ROOT, 'patches/dsh/0004-credentials-local-tolerate-corrupt-doc.patch'),
    args: ['-p1'],
  },
]

function state(patch) {
  try {
    const text = readFileSync(patch.file, 'utf8')
    return text.includes(patch.applied)
  } catch (error) {
    return `unreadable: ${error.message}`
  }
}

const checkOnly = process.argv.includes('--check')

function applyPatch(patch, checkOnly) {
  // git apply requires a git repository (otherwise it "skips" the patch silently
  // with exit 0 while changing nothing). The harness snapshot from update-dsh.mjs
  // is a plain zip extraction with no .git, so initialize one on the first run.
  if (!existsSync(join(HARNESS, '.git'))) {
    execFileSync('git', ['init', '-q'], { cwd: HARNESS, stdio: 'pipe' })
  }
  try {
    execFileSync('git', [
      'apply', '--ignore-space-change', '--whitespace=nowarn', ...patch.args, patch.patch,
    ], { cwd: HARNESS, stdio: 'pipe' })
    console.log('  ✓ applied')
    return true
  } catch (error) {
    const msg = error.stderr?.toString() ?? error.message
    console.error(`  ✗ FAILED to apply (needs human review):\n${msg}`)
    return false
  }
}

let failures = 0
for (const patch of PATCHES) {
  const applied = state(patch)
  console.log(`\n[${applied === true ? 'ALREADY' : applied === false ? 'PENDING' : '???'}] ${patch.name}`)
  if (applied === false && !checkOnly) {
    if (!existsSync(patch.patch)) {
      console.error(`  ✗ missing patch file: ${patch.patch}`)
      failures += 1
      continue
    }
    if (!applyPatch(patch, checkOnly)) failures += 1
  } else if (applied === true) {
    console.log('  ✓ already applied; skipping')
  } else {
    console.error(`  ✗ target file ${patch.file} ${applied}`)
    failures += 1
  }
}

console.log(failures === 0
  ? '\napply-dsh-patches: OK — all patches present.'
  : `\napply-dsh-patches: ${failures} patch(es) need attention.`)
process.exit(failures === 0 ? 0 : 1)