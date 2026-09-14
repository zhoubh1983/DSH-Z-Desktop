/** 生成干净补丁：clean 0.1.5 快照 vs 当前 harness 修改（供 apply-dsh-patches 幂等重打）。 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const clean = 'D:/_dsh_upgrade/extracted/deepseek-harness-dsh-v0.1.5-rc.2'
const current = 'D:/sourceCode/ai-app/dsh-d/deepseek-harness'
const patches = 'D:/sourceCode/ai-app/dsh-d/patches/dsh'

const modified = [
  'packages/client/ui-settings-models/src/client/ProviderEditor.tsx',
  'packages/llm/llm-deepseek/src/discovery.ts',
  'packages/llm/llm-deepseek/src/index.ts',
  'packages/host/directory-picker-native/src/win32-dialog-bindings.ts',
]

const work = mkdtempSync(join(tmpdir(), 'dsh-patchgen-'))
console.log('work:', work)
// 1) 复制 clean 快照
cpSync(clean, work, { recursive: true })
// 2) git init + commit clean
execSync('git init -q', { cwd: work })
execSync('git config user.email patch@local && git config user.name patch', { cwd: work })
execSync('git add -A && git commit -qm clean', { cwd: work })
// 3) 覆盖为当前修改
for (const rel of modified) {
  const src = join(current, rel)
  const dst = join(work, rel)
  if (existsSync(src)) {
    mkdirSync(join(work, rel.split('/').slice(0, -1).join('/')), { recursive: true })
    cpSync(src, dst)
  }
}
// 4) 生成补丁
const p1 = execSync('git diff HEAD -- packages/client/ui-settings-models packages/llm/llm-deepseek', { cwd: work, encoding: 'utf8' })
const p2 = execSync('git diff HEAD -- packages/host/directory-picker-native', { cwd: work, encoding: 'utf8' })
writeFileSync(join(patches, '0001-fix-models-align-deepseek-key-ref-validate-key-at-sa.patch'), p1)
writeFileSync(join(patches, '0002-fix-directory-picker-string16.patch'), p2)
console.log('0001 bytes:', p1.length, '| 0002 bytes:', p2.length)
rmSync(work, { recursive: true, force: true })
