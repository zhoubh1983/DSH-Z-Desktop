/**
 * 技能市场引擎：读取市场清单（manifest.json）、解析技能包、安装到
 * ~/.dsh/skills、卸载（仅限市场来源安装的技能，防误删用户自建技能）。
 * 全本地文件系统操作，零第三方依赖。
 * @module
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** 市场清单中单个技能的元数据。 */
export interface MarketSkill {
  name: string
  description: string
  whenToUse?: string
  author?: string
  version?: string
  category?: string
  license?: string
  source?: string
  homepage?: string
  tags?: string[]
}

/** 市场清单文件结构（manifest.json）。 */
export interface MarketManifest {
  name?: string
  displayName?: string
  version?: string
  description?: string
  updatedAt?: string
  skills: MarketSkill[]
}

/** dsh 兼容的技能名校验（小写 kebab-case），同时用于防目录穿越。 */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 市场来源标记文件名：安装时写入，标记该技能由市场安装（卸载保护用）。 */
export const MARKET_MARKER = '.dsh-market-installed.json'

/** dsh 用户数据根目录（与官方 CLI 一致，默认 ~/.dsh）。 */
export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 用户技能安装目录：~/.dsh/skills。 */
export function userSkillsDir(): string {
  return join(dshHome(), 'skills')
}

/** 默认市场目录：~/.dsh/skills-market（GUI 启动时把内置技能集合同步到此）。 */
export function defaultMarketDir(): string {
  return join(dshHome(), 'skills-market')
}

export class MarketEngine {
  private marketDir: string

  constructor(marketDir: string = defaultMarketDir()) {
    this.marketDir = marketDir || defaultMarketDir()
  }

  /** 变更市场目录（marketUrl 配置变化时调用）。 */
  setMarketDir(dir: string): void {
    this.marketDir = dir || defaultMarketDir()
  }

  getMarketDir(): string {
    return this.marketDir
  }

  /** 校验技能名（防目录穿越）。 */
  static validName(name: string): boolean {
    return NAME_RE.test(name)
  }

  /** 读取市场清单；目录/文件缺失或解析失败返回 null。 */
  loadManifest(): MarketManifest | null {
    if (!existsSync(this.marketDir)) return null
    const file = join(this.marketDir, 'manifest.json')
    if (!existsSync(file)) return null
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as MarketManifest
      if (data && Array.isArray(data.skills)) return data
    } catch {
      /* 忽略损坏的清单 */
    }
    return null
  }

  /** 市场内技能包目录。 */
  skillSourceDir(name: string): string {
    return join(this.marketDir, 'skills', name)
  }

  /** 已安装技能目录（~/.dsh/skills/<name>）。 */
  installedDir(name: string): string {
    return join(userSkillsDir(), name)
  }

  isInstalled(name: string): boolean {
    return existsSync(this.installedDir(name)) && existsSync(join(this.installedDir(name), 'SKILL.md'))
  }

  /** 该技能是否由市场安装（有来源标记），决定是否允许卸载。 */
  isMarketManaged(name: string): boolean {
    return existsSync(join(this.installedDir(name), MARKET_MARKER))
  }

  /** 安装（覆盖更新）：市场包 → ~/.dsh/skills/<name>，并写入来源标记。 */
  install(name: string): { ok: boolean; reason?: string } {
    if (!MarketEngine.validName(name)) return { ok: false, reason: 'invalid skill name' }
    const src = this.skillSourceDir(name)
    if (!existsSync(src)) return { ok: false, reason: 'skill not found in market' }
    const dest = this.installedDir(name)
    mkdirSync(userSkillsDir(), { recursive: true })
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    cpSync(src, dest, { recursive: true })
    writeFileSync(
      join(dest, MARKET_MARKER),
      JSON.stringify({ market: this.marketDir, name, installedAt: Date.now() }, null, 2),
      'utf8',
    )
    return { ok: true }
  }

  /** 卸载：仅允许移除由市场安装的技能（防误删用户自建技能）。 */
  uninstall(name: string): { ok: boolean; reason?: string } {
    if (!MarketEngine.validName(name)) return { ok: false, reason: 'invalid skill name' }
    const dest = this.installedDir(name)
    if (!existsSync(dest)) return { ok: false, reason: 'not installed' }
    if (!this.isMarketManaged(name)) return { ok: false, reason: 'skill not managed by market' }
    rmSync(dest, { recursive: true, force: true })
    return { ok: true }
  }

  /** 市场技能列表（附已安装/可卸载状态）。 */
  list(): Array<MarketSkill & { installed: boolean; managed: boolean; exists: boolean }> {
    const manifest = this.loadManifest()
    if (!manifest) return []
    return manifest.skills.map((skill) => {
      const installed = this.isInstalled(skill.name)
      return {
        ...skill,
        installed,
        managed: installed && this.isMarketManaged(skill.name),
        exists: existsSync(this.skillSourceDir(skill.name)),
      }
    })
  }

  /** 市场头部信息 + 统计。 */
  info(): { name?: string; displayName?: string; version?: string; description?: string; updatedAt?: string; skillCount: number; dir: string } | null {
    const manifest = this.loadManifest()
    if (!manifest) return null
    return {
      name: manifest.name,
      displayName: manifest.displayName,
      version: manifest.version,
      description: manifest.description,
      updatedAt: manifest.updatedAt,
      skillCount: manifest.skills.length,
      dir: this.marketDir,
    }
  }

  /**
   * 技能详情（懒加载）：读取市场技能包内 SKILL.md，解析完整 frontmatter
   * 与正文，返回比 manifest 更全的字段（补全 description/whenToUse 等残缺项）。
   */
  skillDetail(name: string): { ok: boolean; error?: string; skill?: Record<string, unknown>; detail?: SkillDetail } {
    if (!MarketEngine.validName(name)) return { ok: false, error: 'invalid skill name' }
    const src = this.skillSourceDir(name)
    const mdFile = join(src, 'SKILL.md')
    if (!existsSync(mdFile)) return { ok: false, error: 'skill not found in market' }
    const raw = readFileSync(mdFile, 'utf8')
    const { frontmatter, body } = parseSkillMd(raw)
    return {
      ok: true,
      skill: { name, ...frontmatter },
      detail: {
        name,
        description: frontmatter.description,
        whenToUse: frontmatter.whenToUse,
        author: frontmatter.author,
        version: frontmatter.version,
        license: frontmatter.license,
        homepage: frontmatter.homepage,
        tags: frontmatter.tags,
        body,
      },
    }
  }
}

/** 技能详情结构：SKILL.md 的 frontmatter 字段 + 正文。 */
export interface SkillDetail {
  name: string
  description?: string
  whenToUse?: string
  author?: string
  version?: string
  license?: string
  homepage?: string
  tags?: unknown
  body: string
}

/** 解析 SKILL.md：拆分 frontmatter（--- 块）与正文。 */
function parseSkillMd(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const trimmed = raw.replace(/^\uFEFF/, '')
  if (!trimmed.startsWith('---')) return { frontmatter: {}, body: trimmed.trim() }
  const end = trimmed.indexOf('\n---', 3)
  if (end < 0) return { frontmatter: {}, body: trimmed.trim() }
  return { frontmatter: parseFrontmatter(trimmed.slice(3, end)), body: trimmed.slice(end + 4).trim() }
}

/**
 * 轻量 YAML frontmatter 解析：支持 key: value、`>` 折叠、`|` 字面块与数组。
 * 只覆盖技能包实际用到的语法，无需引入 YAML 依赖。
 */
function parseFrontmatter(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const lines = raw.split('\n')
  let key: string | null = null
  let block: string[] | null = null
  let blockStyle: '>' | '|' | null = null
  const flush = () => {
    if (key && block) out[key] = blockStyle === '|' ? block.join('\n') : block.join(' ')
    key = null
    block = null
    blockStyle = null
  }
  for (const line of lines) {
    if (key && block) {
      const indented = /^\s+/.test(line)
      if (indented) {
        block.push(line.trim())
        continue
      }
      if (/^\s*$/.test(line)) continue
      flush()
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!m) continue
    key = m[1]
    const val = m[2].trim()
    if (val === '>') { block = []; blockStyle = '>'; continue }
    if (val === '|') { block = []; blockStyle = '|'; continue }
    out[key] = parseScalar(val)
    key = null
  }
  flush()
  return out
}

/** 解析标量：布尔 / 数组 / 字符串（去引号）。 */
function parseScalar(val: string): unknown {
  if (val.startsWith('[') && val.endsWith(']')) {
    return val
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  const un = val.replace(/^['"]|['"]$/g, '')
  if (un === 'true') return true
  if (un === 'false') return false
  return un
}
