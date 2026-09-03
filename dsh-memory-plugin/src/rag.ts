/**
 * 本地 RAG 编排：文档扫描、分块、向量化入库、语义检索。
 * 纯文本类文件（txt/md/code/json/yaml...）递归导入，分块后本地 embedding 入库，
 * 查询时同模型向量化后做余弦相似度 top-k。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { MemoryStore } from './index'
import { embedText, EMBEDDING_MODEL } from './embedding'

/** 可导入的纯文本扩展名（运维文档/笔记/代码为主）。 */
const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.yaml', '.yml', '.csv', '.log',
  '.js', '.ts', '.jsx', '.tsx', '.go', '.rs', '.py', '.java', '.c', '.cpp',
  '.h', '.hpp', '.sh', '.bat', '.ps1', '.sql', '.xml', '.toml', '.ini',
  '.conf', '.cfg', '.properties',
])

/** 导入时跳过的目录。 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.venv',
  '__pycache__', '.dsh', '.tools', '.cache',
])

export interface ImportResult {
  documents: number
  chunks: number
}

function kindOf(file: string): string {
  const ext = extname(file).toLowerCase().replace('.', '')
  return ext || 'other'
}

/**
 * 分块：优先按空行段落切；超长段落按固定窗口（带重叠）切。
 */
export function chunkText(text: string, size = 500, overlap = 80): string[] {
  const cleaned = text.replace(/\r\n/g, '\n').replace(/\u0000/g, '').trim()
  if (!cleaned) return []
  const paragraphs = cleaned.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  const chunks: string[] = []
  let buf = ''
  for (const p of paragraphs) {
    if (p.length > size) {
      if (buf.trim()) chunks.push(buf.trim())
      buf = ''
      for (let i = 0; i < p.length; i += size - overlap) {
        chunks.push(p.slice(i, i + size))
      }
    } else if (buf && buf.length + p.length + 2 > size) {
      chunks.push(buf.trim())
      buf = p
    } else {
      buf = buf ? `${buf}\n\n${p}` : p
    }
  }
  if (buf.trim()) chunks.push(buf.trim())
  return chunks
}

function collectFiles(target: string): string[] {
  const out: string[] = []
  const walk = (p: string) => {
    const st = statSync(p)
    if (st.isDirectory()) {
      const name = basename(p)
      if (SKIP_DIRS.has(name)) return
      for (const entry of readdirSync(p)) walk(join(p, entry))
    } else if (TEXT_EXTS.has(extname(p).toLowerCase())) {
      out.push(p)
    }
  }
  walk(target)
  return out
}

/**
 * 导入一个文件或文件夹（递归）到知识库。
 * @returns 处理的文档数与分块数。
 */
export async function importPath(store: MemoryStore, target: string): Promise<ImportResult> {
  const files = statSync(target).isDirectory() ? collectFiles(target) : [target]
  let documents = 0
  let chunks = 0
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const parts = chunkText(text)
    if (parts.length === 0) continue
    const docId = store.addDocument(basename(file), file, kindOf(file))
    let seq = 0
    for (const part of parts) {
      const vec = await embedText(part)
      store.addChunk(docId, seq++, part, vec, EMBEDDING_MODEL)
      chunks++
    }
    documents++
  }
  return { documents, chunks }
}

export interface KnowledgeHit {
  documentId: string
  title: string
  seq: number
  text: string
  score: number
}

/** 语义检索知识库，返回 top-k 命中片段。 */
export async function searchKnowledge(store: MemoryStore, query: string, topK = 3): Promise<KnowledgeHit[]> {
  const vec = await embedText(query)
  return store.searchChunks(vec, topK)
}
