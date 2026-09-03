/**
 * dsh-memory-plugin —— P0：永久记忆。
 *
 * 为 DSH Agent 增加跨会话记忆：
 *  - 监听 `session/event` 的 `turn/end`（一轮对话结束），聚合提取长期事实与对话摘要；
 *  - 提取用本地 LLM（复用 DSH provider，`ctx.llm.stream` 非流式收集），产出严格 JSON；
 *  - 存储用 Node 内置 `node:sqlite`（`$DSH_HOME/dsh-memory/memory.db`），全本地离线；
 *  - 通过 `ctx.systemPrompt.section()` 在每次对话把 top-k 相关事实注入系统提示；
 *  - 事实带重要度 + 时间衰减 + 访问计数，支持钉住与纠正（P2 面板提供管理）。
 *
 * 依赖 external：@deepseek-ai/cordis、schemastery、dsh-session、dsh-llm、dsh-settings
 * （均由 dsh runtime 提供）。
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { importPath, searchKnowledge } from './rag'
import { EMBEDDING_MODEL } from './embedding'

export const name = 'dsh-memory-plugin'

/** 依赖的服务：会话（读消息）、系统提示（注入）、LLM（提取）、设置（持久化）、工具（RAG 检索）。 */
export const inject = ['sessions', 'systemPrompt', 'llm', 'settings', 'tools']

/** 用户可配置项。 */
export interface Config {
  /** 记忆系统总开关。 */
  enabled: boolean
  /** 对话结束后是否自动聚合提取。 */
  autoExtract: boolean
  /** 提取用 provider 路由（空 = 'deepseek'）。 */
  provider: string
  /** 提取用 model（空 = 交由 DSH 按 provider 解析默认模型）。 */
  model: string
  /** 至少多少条消息才触发提取。 */
  minMessages: number
  /** 每次注入的事实条数上限。 */
  injectTopK: number
  /** 注入的记忆文本最大字符数。 */
  injectMaxChars: number
  /** 事实衰减半衰期（天），钉住的不衰减。 */
  decayDays: number
  /** 是否生成对话摘要。 */
  summarize: boolean
  /** 本地 RAG 开关（knowledge_search 工具 + 文档检索）。 */
  ragEnabled: boolean
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
  autoExtract: Schema.boolean().default(true),
  provider: Schema.string().default('deepseek'),
  model: Schema.string().default(''),
  minMessages: Schema.number().default(3),
  injectTopK: Schema.number().default(8),
  injectMaxChars: Schema.number().default(1500),
  decayDays: Schema.number().default(30),
  summarize: Schema.boolean().default(true),
  ragEnabled: Schema.boolean().default(true),
})

/** 事实类别。 */
const CATEGORIES = ['preference', 'identity', 'project', 'work', 'other'] as const
type FactCategory = typeof CATEGORIES[number]

interface FactRow {
  id: string
  content: string
  category: string
  importance: number
  source: string
  pinned: number
  created_at: number
  last_seen_at: number
  access_count: number
}

function uuid(): string {
  // 自包含实现（不引 crypto.randomUUID 亦可，但 Node 内置可用则用）
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** 记忆数据库文件路径：$DSH_HOME/dsh-memory/memory.db。 */
function memoryDbPath(): string {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dir = join(base, 'dsh-memory')
  try {
    mkdirSync(dir, { recursive: true })
  } catch {
    /* 目录已存在或不可建时交给 DatabaseSync 报错 */
  }
  return join(dir, 'memory.db')
}

/**
 * 记忆存取层：facts（长期事实）+ summaries（对话摘要）。
 * 使用 Node 内置 node:sqlite，零第三方依赖。
 */
export class MemoryStore {
  private readonly db: DatabaseSync

  constructor(file: string = memoryDbPath()) {
    this.db = new DatabaseSync(file)
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS facts (
        id            TEXT PRIMARY KEY,
        content       TEXT NOT NULL,
        category      TEXT NOT NULL DEFAULT 'other',
        importance    REAL NOT NULL DEFAULT 0.5,
        source        TEXT NOT NULL DEFAULT '',
        pinned        INTEGER NOT NULL DEFAULT 0,
        created_at    INTEGER NOT NULL,
        last_seen_at  INTEGER NOT NULL,
        access_count  INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS summaries (
        id            TEXT PRIMARY KEY,
        session_id    TEXT NOT NULL DEFAULT '',
        summary       TEXT NOT NULL,
        created_at    INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_facts_last_seen ON facts(last_seen_at);
      CREATE TABLE IF NOT EXISTS documents (
        id            TEXT PRIMARY KEY,
        title         TEXT NOT NULL,
        path          TEXT NOT NULL DEFAULT '',
        kind          TEXT NOT NULL DEFAULT 'other',
        chunk_count   INTEGER NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'indexed',
        created_at    INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chunks (
        id            TEXT PRIMARY KEY,
        document_id   TEXT NOT NULL,
        seq           INTEGER NOT NULL,
        text          TEXT NOT NULL,
        vector        BLOB,
        model         TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
    `)
  }

  close(): void {
    this.db.close()
  }

  /** 统计。 */
  counts(): { facts: number; summaries: number } {
    const facts = this.db.prepare('SELECT COUNT(*) AS n FROM facts').get() as { n: number }
    const summaries = this.db.prepare('SELECT COUNT(*) AS n FROM summaries').get() as { n: number }
    return { facts: facts.n, summaries: summaries.n }
  }

  /**
   * 写入一条事实。先做简单去重（归一化后文本包含匹配），命中则合并：
   * 重要度取 max(旧, 新)，刷新 last_seen_at。
   */
  upsertFact(content: string, category: string, importance: number, source: string): void {
    const norm = content.trim().replace(/\s+/g, ' ')
    if (!norm) return
    const existing = this.db.prepare(
      'SELECT id, importance FROM facts WHERE content = ? ORDER BY last_seen_at DESC LIMIT 1',
    ).get(norm) as { id: string; importance: number } | undefined
    const now = Date.now()
    if (existing) {
      const nextImportance = Math.min(1, Math.max(existing.importance, importance))
      this.db.prepare(
        'UPDATE facts SET importance = ?, last_seen_at = ?, source = ? WHERE id = ?',
      ).run(nextImportance, now, source, existing.id)
      return
    }
    const cat = CATEGORIES.includes(category as FactCategory) ? category : 'other'
    this.db.prepare(
      `INSERT INTO facts (id, content, category, importance, source, pinned, created_at, last_seen_at, access_count)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`,
    ).run(uuid(), norm, cat, Math.min(1, Math.max(0, importance)), source, now, now)
  }

  /**
   * 取 top-k 事实：按 有效重要度 × 时间衰减 排序（钉住的不衰减）。
   */
  topFacts(limit: number, decayDays: number, now: number): FactRow[] {
    const halfLife = Math.max(1, decayDays)
    const rows = this.db.prepare('SELECT * FROM facts').all() as FactRow[]
    const scored = rows.map((row) => {
      const days = Math.max(0, (now - row.last_seen_at) / 86400000)
      const decay = row.pinned === 1 ? 1 : Math.exp((-Math.LN2 * days) / halfLife)
      return { row, score: row.importance * decay }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.row)
  }

  /** 记录一次命中（注入或检索），用于衰减的 last_seen 刷新。 */
  touchFact(id: string): void {
    this.db.prepare(
      'UPDATE facts SET last_seen_at = ?, access_count = access_count + 1 WHERE id = ?',
    ).run(Date.now(), id)
  }

  /** 手动增删改（P2 面板用；P0 预留）。 */
  insertFactRaw(fact: Omit<FactRow, 'id' | 'created_at' | 'last_seen_at' | 'access_count' | 'pinned'>): void {
    const now = Date.now()
    this.db.prepare(
      `INSERT INTO facts (id, content, category, importance, source, pinned, created_at, last_seen_at, access_count)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`,
    ).run(uuid(), fact.content, fact.category, fact.importance, fact.source, now, now)
  }
  deleteFact(id: string): void {
    this.db.prepare('DELETE FROM facts WHERE id = ?').run(id)
  }

  /** 事实列表（最近优先）。 */
  listFacts(limit = 100): FactRow[] {
    return this.db.prepare('SELECT * FROM facts ORDER BY last_seen_at DESC LIMIT ?').all(limit) as FactRow[]
  }

  /** 编辑事实（内容/类别/重要度/钉住）。 */
  updateFact(id: string, patch: { content?: string; category?: string; importance?: number; pinned?: boolean }): void {
    const current = this.db.prepare('SELECT * FROM facts WHERE id = ?').get(id) as FactRow | undefined
    if (!current) return
    this.db.prepare(
      'UPDATE facts SET content = ?, category = ?, importance = ?, pinned = ? WHERE id = ?',
    ).run(
      patch.content ?? current.content,
      patch.category ?? current.category,
      patch.importance ?? current.importance,
      patch.pinned === undefined ? current.pinned : patch.pinned ? 1 : 0,
      id,
    )
  }

  /** 摘要列表（最近优先）。 */
  listSummaries(limit = 50): { id: string; session_id: string; summary: string; created_at: number }[] {
    return this.db.prepare('SELECT * FROM summaries ORDER BY created_at DESC LIMIT ?').all(limit) as never
  }

  deleteSummary(id: string): void {
    this.db.prepare('DELETE FROM summaries WHERE id = ?').run(id)
  }

  /** 追加一条对话摘要。 */
  addSummary(sessionId: string, summary: string): void {
    if (!summary.trim()) return
    this.db.prepare(
      'INSERT INTO summaries (id, session_id, summary, created_at) VALUES (?, ?, ?, ?)',
    ).run(uuid(), sessionId, summary.trim(), Date.now())
  }

  /** 最近的摘要（注入时回看用）。 */
  recentSummaries(limit: number, maxChars: number): string[] {
    const rows = this.db.prepare(
      'SELECT summary FROM summaries ORDER BY created_at DESC LIMIT ?',
    ).all(limit) as { summary: string }[]
    const out: string[] = []
    let used = 0
    for (const row of rows) {
      const s = row.summary.trim()
      if (!s) continue
      const slice = s.slice(0, maxChars - used)
      out.push(slice)
      used += slice.length
      if (used >= maxChars) break
    }
    return out
  }

  // ---- 本地 RAG：documents / chunks ----

  /** 登记一个文档，返回 docId。 */
  addDocument(title: string, path: string, kind: string): string {
    const id = uuid()
    this.db.prepare(
      'INSERT INTO documents (id, title, path, kind, chunk_count, status, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
    ).run(id, title, path, kind, 'indexed', Date.now())
    return id
  }

  listDocuments(): { id: string; title: string; path: string; kind: string; chunk_count: number; status: string; created_at: number }[] {
    return this.db.prepare('SELECT * FROM documents ORDER BY created_at DESC').all() as never
  }

  deleteDocument(id: string): void {
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(id)
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  /** 追加一个分块（含向量 BLOB）。 */
  addChunk(docId: string, seq: number, text: string, vector: Float32Array, model: string): void {
    this.db.prepare(
      'INSERT INTO chunks (id, document_id, seq, text, vector, model) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(uuid(), docId, seq, text, Buffer.from(vector.buffer), model)
    this.db.prepare('UPDATE documents SET chunk_count = chunk_count + 1 WHERE id = ?').run(docId)
  }

  /** 余弦相似度 top-k 检索（P1 全表扫描；量级小，P2 可换向量索引）。 */
  searchChunks(queryVector: Float32Array, topK: number): {
    documentId: string
    title: string
    seq: number
    text: string
    score: number
  }[] {
    const rows = this.db.prepare(`
      SELECT c.document_id AS documentId, c.seq, c.text, c.vector, d.title
      FROM chunks c JOIN documents d ON d.id = c.document_id
    `).all() as { documentId: string; seq: number; text: string; vector: Uint8Array; title: string }[]
    const q = queryVector
    const scored: { documentId: string; title: string; seq: number; text: string; score: number }[] = []
    for (const row of rows) {
      if (!row.vector) continue
      const v = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4)
      let dot = 0
      for (let i = 0; i < q.length; i++) dot += q[i] * v[i]
      scored.push({
        documentId: row.documentId,
        title: row.title,
        seq: row.seq,
        text: row.text,
        score: dot,
      })
    }
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, topK)
  }

  chunkStats(): { documents: number; chunks: number } {
    const d = this.db.prepare('SELECT COUNT(*) AS n FROM documents').get() as { n: number }
    const c = this.db.prepare('SELECT COUNT(*) AS n FROM chunks').get() as { n: number }
    return { documents: d.n, chunks: c.n }
  }
}

/** 一次 LLM 完整调用（非流式收集 text-delta）。失败抛出。 */
async function complete(
  ctx: Context,
  config: Config,
  system: string,
  userText: string,
  logger: { warn(...args: unknown[]): void },
): Promise<string> {
  const provider = config.provider || 'deepseek'
  const model = config.model || undefined
  const options = {
    provider,
    model,
    system,
    temperature: 0,
    messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
  }
  let out = ''
  try {
    for await (const chunk of (ctx as unknown as { llm: { stream(o: unknown): AsyncIterable<{ type: string; text?: string; reason?: { kind?: string; failure?: { message?: string } } }> } }).llm.stream(options)) {
      if (chunk.type === 'text-delta' && chunk.text) out += chunk.text
      if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
        throw new Error(chunk.reason.failure?.message || 'LLM stream error')
      }
    }
  } catch (error) {
    logger.warn(`[dsh-memory] LLM 调用失败（provider=${provider} model=${model ?? '(default)'}）:`, (error as Error).message || error)
    throw error
  }
  return out
}

/** 把一条会话消息渲染成纯文本。 */
function messageToText(message: { role?: string; content?: unknown }): string {
  const role = message.role === 'assistant' ? 'assistant' : 'user'
  const content = message.content
  let text = ''
  if (typeof content === 'string') {
    text = content
  } else if (Array.isArray(content)) {
    for (const block of content) {
      const b = block as { type?: string; text?: string }
      if (b && b.type === 'text' && typeof b.text === 'string') text += b.text
    }
  }
  const trimmed = text.trim()
  return trimmed ? `${role}: ${trimmed}` : ''
}

/** 从会话推导消息，取最近 maxCount 条渲染为文本。 */
function sessionToText(messages: unknown[], maxCount: number): string {
  const recent = Array.isArray(messages) ? messages.slice(-maxCount) : []
  return recent.map(messageToText).filter(Boolean).join('\n')
}

/** 构造提取 prompt。 */
function buildExtractPrompt(dialogText: string): { system: string; user: string } {
  const system = [
    '你是一个本地记忆提取引擎。你的任务是从一段对话中提取：',
    '1) 关于用户的长期事实（身份、偏好、所在项目、工作方式等，不包含一次性闲聊内容）；',
    '2) 对该段对话的一句话摘要。',
    '只输出严格 JSON（不要任何解释、不要 markdown 代码块）：',
    '{"facts":[{"content":"事实文本","category":"preference|identity|project|work|other","importance":0到1}],"summary":"摘要"}',
    'facts 可为空数组；每条的 importance 表示对长期记忆的重要性（0~1）。',
  ].join('\n')
  return { system, user: `对话：\n${dialogText}` }
}

/** 解析 LLM 输出为 {facts, summary}；解析失败返回空。 */
function parseExtraction(raw: string): { facts: { content: string; category: string; importance: number }[]; summary: string } {
  try {
    const cleaned = raw.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/, '')
    const parsed = JSON.parse(cleaned) as { facts?: unknown; summary?: unknown }
    const facts = Array.isArray(parsed.facts)
      ? parsed.facts.filter((f): f is { content: string; category: string; importance: number } => {
          const x = f as { content?: unknown; category?: unknown; importance?: unknown }
          return typeof x.content === 'string' && x.content.trim().length > 0
        }).map((f) => ({
          content: f.content.trim(),
          category: typeof f.category === 'string' ? f.category : 'other',
          importance: typeof f.importance === 'number' ? f.importance : 0.5,
        }))
      : []
    return {
      facts,
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    }
  } catch {
    return { facts: [], summary: '' }
  }
}

/** 渲染注入用的记忆区块（top-k 事实 + 最近摘要）。 */
function renderMemorySection(store: MemoryStore, config: Config, now: number): string {
  if (!config.enabled) return ''
  const facts = store.topFacts(config.injectTopK, config.decayDays, now)
  const lines: string[] = []
  if (facts.length > 0) {
    lines.push('[永久记忆] 以下是你对用户的长期了解（供参考，如有过时以本次对话为准）：')
    let used = 0
    for (const f of facts) {
      const line = `- ${f.content}`
      if (used + line.length > config.injectMaxChars) break
      lines.push(line)
      used += line.length
      store.touchFact(f.id)
    }
  }
  if (config.summarize) {
    const summaries = store.recentSummaries(2, Math.floor(config.injectMaxChars / 3))
    if (summaries.length > 0) {
      lines.push('[近期对话回顾]')
      for (const s of summaries) lines.push(`- ${s}`)
    }
  }
  return lines.join('\n')
}

/** 挂载逻辑。 */
function mount(ctx: Context, config: Config): void {
  const settings = (ctx.settings as unknown as {
    register?(ns: string, schema: unknown, opts: { base: Config; applies: string }): {
      get(): Config
      update(patch: object): Promise<void>
      watch(fn: (next: Config) => void): () => void
    }
  })?.register?.('dsh-memory-plugin', Config, { base: config, applies: 'live' })

  const effective: Config = { ...(settings ? settings.get() : config) }
  const store = new MemoryStore()

  // 配置变更 → 就地更新生效配置。
  if (settings) {
    settings.watch((next) => {
      Object.assign(effective, next)
    })
  }

  // 处理一次对话结束：聚合提取事实 + 摘要。
  const extractTurn = async (session: { id?: string; deriveMessages?(): unknown[] }) => {
    if (!effective.enabled || !effective.autoExtract) return
    try {
      let messages: unknown[] = []
      if (session && typeof session.deriveMessages === 'function') {
        messages = session.deriveMessages()
      }
      if (!Array.isArray(messages) || messages.length < effective.minMessages) return
      const dialog = sessionToText(messages, 20)
      if (!dialog.trim()) return
      const { system, user } = buildExtractPrompt(dialog)
      const raw = await complete(ctx, effective, system, user, ctx.logger)
      const result = parseExtraction(raw)
      for (const f of result.facts) {
        store.upsertFact(f.content, f.category, f.importance, 'session')
      }
      if (effective.summarize && result.summary) {
        store.addSummary(typeof session.id === 'string' ? session.id : '', result.summary)
      }
      if (result.facts.length > 0 || result.summary) {
        ctx.logger.info(`[dsh-memory] 提取 ${result.facts.length} 条事实${result.summary ? ' + 1 条摘要' : ''}`)
      }
    } catch (error) {
      // 提取失败不影响对话与宿主，仅记录。
      ctx.logger.warn('[dsh-memory] 提取失败（已跳过本窗口）:', (error as Error).message || error)
    }
  }

  // 监听会话事件：turn/end = 一轮对话结束。
  ctx.on('session/event', (session: { id?: string; deriveMessages?(): unknown[] }, event: { type?: string }) => {
    if (event && event.type === 'turn/end') {
      // 异步提取，不阻塞事件回放。
      void extractTurn(session)
    }
  })

  // 每次对话组装系统提示时注入记忆区块。
  ctx.systemPrompt.section({
    name: 'dsh-memory:facts',
    order: 50,
    text: () => renderMemorySection(store, effective, Date.now()),
  })

  // 本地 RAG：knowledge_search 工具（语义检索已导入的本地文档）。
  if (effective.ragEnabled && ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register({
      name: 'knowledge_search',
      description:
        '在本地知识库中做语义检索，返回命中的文档片段。当问题涉及已导入的本地文档（运维手册、笔记、技术文档等）时调用，不要在不知道答案时直接编造。',
      parameters: {
        query: { type: 'string', description: '检索查询，用自然语言描述要找的内容' },
        k: { type: 'integer', description: '返回条数（默认 3，最大 5）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const { query, k } = args as { query?: string; k?: number }
        if (!query || !query.trim()) return '缺少 query 参数'
        try {
          const hits = await searchKnowledge(store, query, Math.max(1, Math.min(k ?? 3, 5)))
          if (hits.length === 0) return '知识库中没有找到相关内容。'
          return hits.map((h, i) => `[${i + 1}] 来源《${h.title}》相似度 ${h.score.toFixed(3)}：\n${h.text}`).join('\n\n')
        } catch (error) {
          return `知识库检索失败：${(error as Error).message || error}`
        }
      },
    })
    ctx.logger.info('[dsh-memory] 本地 RAG 已启用（knowledge_search）')
  }

  // 永久记忆：memory_search 工具（按重要性×衰减取 top 事实 + 近期摘要）。
  if (ctx.tools && typeof ctx.tools.register === 'function') {
    ctx.tools.register({
      name: 'memory_search',
      description:
        '检索你对用户的永久记忆（长期事实与近期对话摘要）。需要回忆用户偏好、身份、所在项目或历史对话内容时调用。',
      parameters: {
        topic: { type: 'string', description: '想回忆的主题或关键词（可选）' },
        k: { type: 'integer', description: '返回条数（默认 5，最大 10）' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      async execute(args) {
        const { k } = args as { k?: number }
        const limit = Math.max(1, Math.min(k ?? 5, 10))
        try {
          const facts = store.topFacts(limit, effective.decayDays, Date.now())
          const summaries = effective.summarize ? store.recentSummaries(2, 400) : []
          const parts: string[] = []
          if (facts.length > 0) {
            parts.push('永久记忆中的事实：')
            for (const f of facts) parts.push(`- ${f.content}`)
          }
          if (summaries.length > 0) {
            parts.push('近期对话回顾：')
            for (const s of summaries) parts.push(`- ${s}`)
          }
          if (parts.length === 0) return '还没有可用的永久记忆。'
          return parts.join('\n')
        } catch (error) {
          return `记忆检索失败：${(error as Error).message || error}`
        }
      },
    })
  }

  // P2 管理 API：webServer 暴露 /plugins/dsh-memory/*（配置/统计/事实/摘要/文档/检索）。
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: 'prefix',
          path: '/plugins/dsh-memory',
          handler: createMemoryApi(store, settings ?? localSettingsScope(effective), effective),
        }),
        'dsh-memory: management api',
      )
    })
  }

  ctx.logger.info('[dsh-memory] 永久记忆已启用（autoExtract=%s provider=%s）', String(effective.autoExtract), effective.provider || 'deepseek')
}

/** 应用入口：settings 服务就绪后挂载（与 dafeiyu 一致的可选服务注入模式）。 */
export function apply(ctx: Context, config: Config = {}) {
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => mount(settingsCtx, config))
    return
  }
  mount(ctx, config)
}

// 供面板/管理 API 与测试复用：RAG 导入与检索。
export { importPath, searchKnowledge, chunkText } from './rag'
export type { ImportResult, KnowledgeHit } from './rag'

// ---- P2 管理 API（/plugins/dsh-memory/*） ----

interface SettingsLike {
  get(): unknown
  update?(patch: object): Promise<void>
  replace?(section: object): Promise<void>
  watch?(_cb: (next: Config, prev: Config) => void): () => void
}

/** 无 settings 服务时的内存兜底作用域。 */
function localSettingsScope<T>(value: T): SettingsLike & { get(): T } {
  return {
    get: () => value,
    update: async () => {},
    replace: async () => {},
    watch: () => () => {},
  }
}

function apiJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 1024 * 1024) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function queryParam(url: string, key: string): string | undefined {
  const search = url.split('?')[1]
  if (!search) return undefined
  return new URLSearchParams(search).get(key) ?? undefined
}

/**
 * 管理 API 处理器：按路径前缀分发到 配置/统计/事实/摘要/文档/检索。
 * 仅允许本机回环访问（设置面板同源）。
 */
function createMemoryApi(
  store: MemoryStore,
  settings: SettingsLike,
  effective: Config,
): (req: IncomingMessage, res: ServerResponse) => void | Promise<void> {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      apiJson(res, 403, { ok: false, error: 'local access only' })
      return
    }
    const origin = req.headers?.origin
    if (origin) {
      let originHost: string | undefined
      try { originHost = new URL(origin).host } catch { /* ignore */ }
      if (!originHost || originHost !== req.headers.host) {
        apiJson(res, 403, { ok: false, error: 'origin mismatch' })
        return
      }
    }
    if (req.method === 'OPTIONS') {
      apiJson(res, 204, {})
      return
    }
    const urlPath = (req.url ?? '/').split('?')[0]
    try {
      if (urlPath === '/plugins/dsh-memory/config') return handleConfig(req, res, settings)
      if (urlPath === '/plugins/dsh-memory/stats') {
        const counts = store.counts()
        const stats = store.chunkStats()
        return apiJson(res, 200, {
          ok: true,
          facts: counts.facts,
          summaries: counts.summaries,
          documents: stats.documents,
          chunks: stats.chunks,
          model: EMBEDDING_MODEL,
          enabled: effective.enabled,
          ragEnabled: effective.ragEnabled,
        })
      }
      if (urlPath === '/plugins/dsh-memory/facts') return handleFacts(req, res, store)
      if (urlPath === '/plugins/dsh-memory/summaries') return handleSummaries(req, res, store)
      if (urlPath === '/plugins/dsh-memory/documents') return handleDocuments(req, res, store)
      if (urlPath === '/plugins/dsh-memory/documents/import') return handleImport(req, res, store)
      if (urlPath === '/plugins/dsh-memory/search') return handleSearch(req, res, store)
      return apiJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return apiJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

async function handleConfig(req: IncomingMessage, res: ServerResponse, settings: SettingsLike): Promise<void> {
  if (req.method === 'GET') {
    return apiJson(res, 200, settings.get())
  }
  if (req.method !== 'PATCH') {
    return apiJson(res, 405, { ok: false, error: 'method not allowed' })
  }
  const body = await readJsonBody(req)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return apiJson(res, 400, { ok: false, error: 'patch must be an object' })
  }
  if (typeof settings.replace === 'function') await settings.replace(body as object)
  else if (typeof settings.update === 'function') await settings.update(body as object)
  return apiJson(res, 200, { ok: true, config: settings.get() })
}

async function handleFacts(req: IncomingMessage, res: ServerResponse, store: MemoryStore): Promise<void> {
  if (req.method === 'GET') {
    return apiJson(res, 200, { ok: true, facts: store.listFacts() })
  }
  if (req.method === 'POST') {
    const body = (await readJsonBody(req)) as { content?: string; category?: string; importance?: number }
    if (!body || typeof body.content !== 'string' || !body.content.trim()) {
      return apiJson(res, 400, { ok: false, error: 'content is required' })
    }
    store.insertFactRaw({
      content: body.content,
      category: typeof body.category === 'string' ? body.category : 'other',
      importance: typeof body.importance === 'number' ? body.importance : 0.5,
      source: 'manual',
    })
    return apiJson(res, 200, { ok: true })
  }
  if (req.method === 'PATCH') {
    const id = queryParam(req.url ?? '', 'id')
    if (!id) return apiJson(res, 400, { ok: false, error: 'id is required' })
    const body = (await readJsonBody(req)) as { content?: string; category?: string; importance?: number; pinned?: boolean }
    store.updateFact(id, body)
    return apiJson(res, 200, { ok: true })
  }
  if (req.method === 'DELETE') {
    const id = queryParam(req.url ?? '', 'id')
    if (!id) return apiJson(res, 400, { ok: false, error: 'id is required' })
    store.deleteFact(id)
    return apiJson(res, 200, { ok: true })
  }
  return apiJson(res, 405, { ok: false, error: 'method not allowed' })
}

async function handleSummaries(req: IncomingMessage, res: ServerResponse, store: MemoryStore): Promise<void> {
  if (req.method === 'GET') {
    return apiJson(res, 200, { ok: true, summaries: store.listSummaries() })
  }
  if (req.method === 'DELETE') {
    const id = queryParam(req.url ?? '', 'id')
    if (!id) return apiJson(res, 400, { ok: false, error: 'id is required' })
    store.deleteSummary(id)
    return apiJson(res, 200, { ok: true })
  }
  return apiJson(res, 405, { ok: false, error: 'method not allowed' })
}

async function handleDocuments(req: IncomingMessage, res: ServerResponse, store: MemoryStore): Promise<void> {
  if (req.method === 'GET') {
    return apiJson(res, 200, { ok: true, documents: store.listDocuments() })
  }
  if (req.method === 'DELETE') {
    const id = queryParam(req.url ?? '', 'id')
    if (!id) return apiJson(res, 400, { ok: false, error: 'id is required' })
    store.deleteDocument(id)
    return apiJson(res, 200, { ok: true })
  }
  return apiJson(res, 405, { ok: false, error: 'method not allowed' })
}

async function handleImport(req: IncomingMessage, res: ServerResponse, store: MemoryStore): Promise<void> {
  if (req.method !== 'POST') {
    return apiJson(res, 405, { ok: false, error: 'method not allowed' })
  }
  const body = (await readJsonBody(req)) as { path?: string }
  if (!body || typeof body.path !== 'string' || !body.path.trim()) {
    return apiJson(res, 400, { ok: false, error: 'path is required' })
  }
  const result = await importPath(store, body.path.trim())
  return apiJson(res, 200, { ok: true, ...result })
}

async function handleSearch(req: IncomingMessage, res: ServerResponse, store: MemoryStore): Promise<void> {
  if (req.method !== 'POST') {
    return apiJson(res, 405, { ok: false, error: 'method not allowed' })
  }
  const body = (await readJsonBody(req)) as { query?: string; k?: number }
  if (!body || typeof body.query !== 'string' || !body.query.trim()) {
    return apiJson(res, 400, { ok: false, error: 'query is required' })
  }
  const hits = await searchKnowledge(store, body.query, Math.max(1, Math.min(body.k ?? 3, 5)))
  return apiJson(res, 200, { ok: true, hits })
}
