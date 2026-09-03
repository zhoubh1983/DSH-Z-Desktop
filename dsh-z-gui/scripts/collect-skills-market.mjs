#!/usr/bin/env node
/**
 * 采集官方技能仓库 → 生成内置技能市场（dsh-z-gui/app/skills-market/）。
 *
 * 数据源（离线下载的 tarball，默认位于 .tools/skills-src/，可用环境变量
 * SKILLS_SRC 覆盖）：
 *   - anthropics/skills   （官方，多数 Apache-2.0；docx/pdf/pptx/xlsx 为 source-available）
 *   - openai/skills       （官方，每个技能自带 LICENSE.txt，只采集 .curated 社区策展技能）
 *   - vercel-labs/agent-skills（官方，MIT）
 *
 * 产物：
 *   app/skills-market/manifest.json   —— 市场清单（技能元数据索引）
 *   app/skills-market/skills/<name>/  —— 每个技能的完整目录（SKILL.md + scripts/references/assets）
 *
 * 幂等：重复运行会先清空 skills/ 再重建。
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const SRC = process.env.SKILLS_SRC || join(REPO_ROOT, '.tools', 'skills-src')
const OUT = join(HERE, '..', 'app', 'skills-market')
const SKILLS_OUT = join(OUT, 'skills')

/** 采集源配置。skillsRoot 为仓库内的技能根目录。 */
const SOURCES = [
  {
    id: 'anthropic',
    author: 'anthropics',
    homepage: 'https://github.com/anthropics/skills',
    defaultLicense: 'Apache-2.0',
    skillsRoot: join(SRC, 'anthropic-src', 'skills-main', 'skills'),
    // 文档技能为 source-available（非开源），用 license 覆盖标记
    sourceAvailable: new Set(['docx', 'pdf', 'pptx', 'xlsx']),
  },
  {
    id: 'openai',
    author: 'openai',
    homepage: 'https://github.com/openai/skills',
    defaultLicense: 'Apache-2.0',
    // 只采集社区策展技能；.system 为 Codex 系统技能（依赖 OpenAI 服务），不内置
    skillsRoot: join(SRC, 'openai-src', 'skills-main', 'skills', '.curated'),
    perSkillLicense: true,
  },
  {
    id: 'vercel',
    author: 'vercel-labs',
    homepage: 'https://github.com/vercel-labs/agent-skills',
    defaultLicense: 'MIT',
    skillsRoot: join(SRC, 'vercel-src', 'agent-skills-main', 'skills'),
  },
]

/** 复制时排除的顶层项（不进入市场包）。 */
const EXCLUDE_NAMES = new Set(['.git', '.github', 'node_modules', '__tests__', 'test', 'tests', 'dist', 'build'])

/** 极简 frontmatter 解析（与 dsh skills 引擎一致的容错子集）。 */
function parseFrontmatter(raw) {
  const lines = raw.split(/\r?\n/)
  if (lines.length === 0 || lines[0].trim() !== '---') return {}
  let closeIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { closeIdx = i; break }
  }
  if (closeIdx < 0) return {}
  const data = {}
  for (let i = 1; i < closeIdx; i++) {
    const line = lines[i]
    // YAML 多行折叠：`key:` 后无值，后续缩进行作为值（如 description 跨行书写）
    if (/^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      const key = line.slice(0, line.indexOf(':')).trim()
      const vals = []
      let j = i + 1
      while (j < closeIdx && /^\s+\S/.test(lines[j])) {
        vals.push(lines[j].trim())
        j++
      }
      if (vals.length > 0) {
        data[key] = vals.join(' ')
        i = j - 1
        continue
      }
    }
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim()
    let val = line.slice(colon + 1).trim()
    if (val.length >= 2 && ((val[0] === '"' && val[val.length - 1] === '"') || (val[0] === "'" && val[val.length - 1] === "'"))) {
      val = val.slice(1, -1)
    }
    if (val === '' || key === '') continue
    data[key] = val
  }
  return data
}

/** 规范化为 dsh 兼容的小写 kebab-case。 */
function normalizeName(name) {
  let n = String(name || '').trim().toLowerCase()
  n = n.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return n
}

/** 粗粒度分类（按技能名关键词推断，供市场浏览分组）。 */
function inferCategory(name) {
  const n = name.toLowerCase()
  const docs = ['docx', 'pdf', 'pptx', 'xlsx', 'doc-', 'writing', 'release-notes', 'notion-', 'document']
  const dev = ['mcp', 'webapp', 'frontend', 'web-artifacts', 'theme-factory', 'canvas', 'claude-api', 'skill-creator',
    'react', 'vercel', 'aspnet', 'cli-creator', 'cloudflare', 'netlify', 'gh-', 'jupyter', 'linear', 'codex', 'deploy',
    'compos', 'optimize', 'openai-docs', 'plugin-creator', 'algorithmic-art', 'spec', 'model']
  const creative = ['art', 'slack-gif', 'imagegen', 'figma', 'hatch', 'chatgpt', 'design-system', 'generate-design']
  const comm = ['brand', 'internal-comms', 'define-goal', 'academy', 'coauthor']
  if (docs.some((k) => n.includes(k))) return 'document'
  if (dev.some((k) => n.includes(k))) return 'development'
  if (creative.some((k) => n.includes(k))) return 'creative'
  if (comm.some((k) => n.includes(k))) return 'communication'
  return 'other'
}

/** 复制一个技能目录到市场包，应用排除规则。 */
function copySkillDir(from, to) {
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, {
    recursive: true,
    filter: (src) => {
      const name = basename(src)
      if (EXCLUDE_NAMES.has(name)) return false
      if (name.endsWith('.zip')) return false
      return true
    },
  })
}

/** 读取技能目录内的 license 文本（openai 模式），返回一行摘要或 null。 */
function readSkillLicense(dir) {
  for (const file of ['LICENSE.txt', 'LICENSE', 'LICENSE.md']) {
    const p = join(dir, file)
    if (existsSync(p)) {
      try {
        const line = readFileSync(p, 'utf8').split(/\r?\n/).find((l) => l.trim()) || ''
        return line.trim().slice(0, 120)
      } catch { /* 忽略 */ }
    }
  }
  return null
}

function main() {
  rmSync(SKILLS_OUT, { recursive: true, force: true })
  mkdirSync(SKILLS_OUT, { recursive: true })

  const seen = new Map() // 名称冲突检测
  const skills = []
  let skipped = []

  for (const src of SOURCES) {
    if (!existsSync(src.skillsRoot)) {
      console.warn(`[collect] 跳过缺失源: ${src.id} (${src.skillsRoot})`)
      continue
    }
    const entries = readdirSync(src.skillsRoot, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue
      const skillDir = join(src.skillsRoot, entry.name)
      const mdPath = join(skillDir, 'SKILL.md')
      if (!existsSync(mdPath)) continue

      const raw = readFileSync(mdPath, 'utf8')
      const fm = parseFrontmatter(raw)
      const rawName = fm.name || entry.name
      let name = normalizeName(rawName)
      if (!name) { skipped.push(`${src.id}/${entry.name} (name 非法)`); continue }

      // 冲突处理：同名技能加源前缀
      const seenKey = name
      if (seen.has(seenKey)) {
        name = `${src.id}-${name}`
      }
      seen.set(seenKey, true)

      // 许可：openai 读技能内 LICENSE.txt；anthropic 文档技能标注 source-available
      let license = src.defaultLicense
      if (src.perSkillLicense) {
        license = readSkillLicense(skillDir) || src.defaultLicense
      } else if (src.sourceAvailable && src.sourceAvailable.has(entry.name)) {
        license = 'source-available'
      }

      const description = fm.description || ''
      const whenToUse = fm.whenToUse || ''
      const targetDir = join(SKILLS_OUT, name)
      copySkillDir(skillDir, targetDir)

      skills.push({
        name,
        description,
        whenToUse,
        author: src.author,
        version: '1.0.0',
        category: inferCategory(name),
        license,
        source: src.id,
        homepage: src.homepage,
        tags: name.split('-').slice(0, 4),
      })
    }
  }

  skills.sort((a, b) => a.name.localeCompare(b.name))

  const manifest = {
    name: 'dsh-official-market',
    displayName: '官方技能市场',
    version: '1.0.0',
    description: '内置技能市场：采集自 Anthropic / OpenAI / Vercel 官方技能仓库（SKILL.md 标准），随应用离线分发。',
    updatedAt: new Date().toISOString().slice(0, 10),
    skillCount: skills.length,
    skills,
  }

  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
  console.log(`[collect] 内置技能市场已生成: ${OUT}`)
  console.log(`[collect] 技能数: ${skills.length}`)
  if (skipped.length) {
    console.warn(`[collect] 跳过 ${skipped.length} 项:`)
    for (const s of skipped) console.warn('  - ' + s)
  }
  console.log(`[collect] 分类统计: ${JSON.stringify(manifest.skills.reduce((acc, s) => { acc[s.category] = (acc[s.category] || 0) + 1; return acc }, {}))}`)
}

main()
