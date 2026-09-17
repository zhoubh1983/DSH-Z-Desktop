// src/index.ts
import Schema from "@deepseek-ai/schemastery";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { homedir as homedir2 } from "node:os";
import { join as join3 } from "node:path";

// src/rag.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join as join2 } from "node:path";

// src/embedding.ts
import { env, pipeline } from "@xenova/transformers";
import { homedir } from "node:os";
import { join } from "node:path";
var EMBEDDING_MODEL = "bge-small-zh-v1.5";
function modelDir() {
  const base = process.env.DSH_HOME || join(homedir(), ".dsh");
  return join(base, "dsh-memory", "models");
}
var extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    env.allowRemoteModels = false;
    env.localModelPath = modelDir() + "/";
    extractorPromise = pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractorPromise;
}
async function embedText(text) {
  const extractor = await getExtractor();
  const out = await extractor(text.slice(0, 8e3), { pooling: "mean", normalize: true });
  return out.data;
}

// src/rag.ts
var TEXT_EXTS = /* @__PURE__ */ new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".log",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".go",
  ".rs",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".sh",
  ".bat",
  ".ps1",
  ".sql",
  ".xml",
  ".toml",
  ".ini",
  ".conf",
  ".cfg",
  ".properties"
]);
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".venv",
  "__pycache__",
  ".dsh",
  ".tools",
  ".cache"
]);
function kindOf(file) {
  const ext = extname(file).toLowerCase().replace(".", "");
  return ext || "other";
}
function chunkText(text, size = 500, overlap = 80) {
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chunks = [];
  let buf = "";
  for (const p of paragraphs) {
    if (p.length > size) {
      if (buf.trim()) chunks.push(buf.trim());
      buf = "";
      for (let i = 0; i < p.length; i += size - overlap) {
        chunks.push(p.slice(i, i + size));
      }
    } else if (buf && buf.length + p.length + 2 > size) {
      chunks.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? `${buf}

${p}` : p;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
function collectFiles(target) {
  const out = [];
  const walk = (p) => {
    const st = statSync(p);
    if (st.isDirectory()) {
      const name2 = basename(p);
      if (SKIP_DIRS.has(name2)) return;
      for (const entry of readdirSync(p)) walk(join2(p, entry));
    } else if (TEXT_EXTS.has(extname(p).toLowerCase())) {
      out.push(p);
    }
  };
  walk(target);
  return out;
}
async function importPath(store, target) {
  const files = statSync(target).isDirectory() ? collectFiles(target) : [target];
  let documents = 0;
  let chunks = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const parts = chunkText(text);
    if (parts.length === 0) continue;
    const docId = store.addDocument(basename(file), file, kindOf(file));
    let seq = 0;
    for (const part of parts) {
      const vec = await embedText(part);
      store.addChunk(docId, seq++, part, vec, EMBEDDING_MODEL);
      chunks++;
    }
    documents++;
  }
  return { documents, chunks };
}
async function searchKnowledge(store, query, topK = 3) {
  const vec = await embedText(query);
  return store.searchChunks(vec, topK);
}

// src/index.ts
var name = "dsh-memory-plugin";
var inject = ["sessions", "systemPrompt", "llm", "settings", "tools"];
var Config = Schema.object({
  enabled: Schema.boolean().default(true),
  autoExtract: Schema.boolean().default(true),
  provider: Schema.string().default("deepseek"),
  model: Schema.string().default(""),
  minMessages: Schema.number().default(3),
  injectTopK: Schema.number().default(8),
  injectMaxChars: Schema.number().default(1500),
  decayDays: Schema.number().default(30),
  summarize: Schema.boolean().default(true),
  ragEnabled: Schema.boolean().default(true)
});
var CATEGORIES = ["preference", "identity", "project", "work", "other"];
function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
function memoryDbPath() {
  const base = process.env.DSH_HOME || join3(homedir2(), ".dsh");
  const dir = join3(base, "dsh-memory");
  try {
    mkdirSync(dir, { recursive: true });
  } catch {
  }
  return join3(dir, "memory.db");
}
var MemoryStore = class {
  db;
  constructor(file = memoryDbPath()) {
    this.db = new DatabaseSync(file);
    this.init();
  }
  init() {
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
    `);
  }
  close() {
    this.db.close();
  }
  /** 统计。 */
  counts() {
    const facts = this.db.prepare("SELECT COUNT(*) AS n FROM facts").get();
    const summaries = this.db.prepare("SELECT COUNT(*) AS n FROM summaries").get();
    return { facts: facts.n, summaries: summaries.n };
  }
  /**
   * 写入一条事实。先做简单去重（归一化后文本包含匹配），命中则合并：
   * 重要度取 max(旧, 新)，刷新 last_seen_at。
   */
  upsertFact(content, category, importance, source) {
    const norm = content.trim().replace(/\s+/g, " ");
    if (!norm) return;
    const existing = this.db.prepare(
      "SELECT id, importance FROM facts WHERE content = ? ORDER BY last_seen_at DESC LIMIT 1"
    ).get(norm);
    const now = Date.now();
    if (existing) {
      const nextImportance = Math.min(1, Math.max(existing.importance, importance));
      this.db.prepare(
        "UPDATE facts SET importance = ?, last_seen_at = ?, source = ? WHERE id = ?"
      ).run(nextImportance, now, source, existing.id);
      return;
    }
    const cat = CATEGORIES.includes(category) ? category : "other";
    this.db.prepare(
      `INSERT INTO facts (id, content, category, importance, source, pinned, created_at, last_seen_at, access_count)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`
    ).run(uuid(), norm, cat, Math.min(1, Math.max(0, importance)), source, now, now);
  }
  /**
   * 取 top-k 事实：按 有效重要度 × 时间衰减 排序（钉住的不衰减）。
   */
  topFacts(limit, decayDays, now) {
    const halfLife = Math.max(1, decayDays);
    const rows = this.db.prepare("SELECT * FROM facts").all();
    const scored = rows.map((row) => {
      const days = Math.max(0, (now - row.last_seen_at) / 864e5);
      const decay = row.pinned === 1 ? 1 : Math.exp(-Math.LN2 * days / halfLife);
      return { row, score: row.importance * decay };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.row);
  }
  /** 记录一次命中（注入或检索），用于衰减的 last_seen 刷新。 */
  touchFact(id) {
    this.db.prepare(
      "UPDATE facts SET last_seen_at = ?, access_count = access_count + 1 WHERE id = ?"
    ).run(Date.now(), id);
  }
  /** 手动增删改（P2 面板用；P0 预留）。 */
  insertFactRaw(fact) {
    const now = Date.now();
    this.db.prepare(
      `INSERT INTO facts (id, content, category, importance, source, pinned, created_at, last_seen_at, access_count)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, 0)`
    ).run(uuid(), fact.content, fact.category, fact.importance, fact.source, now, now);
  }
  deleteFact(id) {
    this.db.prepare("DELETE FROM facts WHERE id = ?").run(id);
  }
  /** 事实列表（最近优先）。 */
  listFacts(limit = 100) {
    return this.db.prepare("SELECT * FROM facts ORDER BY last_seen_at DESC LIMIT ?").all(limit);
  }
  /** 编辑事实（内容/类别/重要度/钉住）。 */
  updateFact(id, patch) {
    const current = this.db.prepare("SELECT * FROM facts WHERE id = ?").get(id);
    if (!current) return;
    this.db.prepare(
      "UPDATE facts SET content = ?, category = ?, importance = ?, pinned = ? WHERE id = ?"
    ).run(
      patch.content ?? current.content,
      patch.category ?? current.category,
      patch.importance ?? current.importance,
      patch.pinned === void 0 ? current.pinned : patch.pinned ? 1 : 0,
      id
    );
  }
  /** 摘要列表（最近优先）。 */
  listSummaries(limit = 50) {
    return this.db.prepare("SELECT * FROM summaries ORDER BY created_at DESC LIMIT ?").all(limit);
  }
  deleteSummary(id) {
    this.db.prepare("DELETE FROM summaries WHERE id = ?").run(id);
  }
  /** 追加一条对话摘要。 */
  addSummary(sessionId, summary) {
    if (!summary.trim()) return;
    this.db.prepare(
      "INSERT INTO summaries (id, session_id, summary, created_at) VALUES (?, ?, ?, ?)"
    ).run(uuid(), sessionId, summary.trim(), Date.now());
  }
  /** 最近的摘要（注入时回看用）。 */
  recentSummaries(limit, maxChars) {
    const rows = this.db.prepare(
      "SELECT summary FROM summaries ORDER BY created_at DESC LIMIT ?"
    ).all(limit);
    const out = [];
    let used = 0;
    for (const row of rows) {
      const s = row.summary.trim();
      if (!s) continue;
      const slice = s.slice(0, maxChars - used);
      out.push(slice);
      used += slice.length;
      if (used >= maxChars) break;
    }
    return out;
  }
  // ---- 本地 RAG：documents / chunks ----
  /** 登记一个文档，返回 docId。 */
  addDocument(title, path, kind) {
    const id = uuid();
    this.db.prepare(
      "INSERT INTO documents (id, title, path, kind, chunk_count, status, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(id, title, path, kind, "indexed", Date.now());
    return id;
  }
  listDocuments() {
    return this.db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all();
  }
  deleteDocument(id) {
    this.db.prepare("DELETE FROM chunks WHERE document_id = ?").run(id);
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  }
  /** 追加一个分块（含向量 BLOB）。 */
  addChunk(docId, seq, text, vector, model) {
    this.db.prepare(
      "INSERT INTO chunks (id, document_id, seq, text, vector, model) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(uuid(), docId, seq, text, Buffer.from(vector.buffer), model);
    this.db.prepare("UPDATE documents SET chunk_count = chunk_count + 1 WHERE id = ?").run(docId);
  }
  /** 余弦相似度 top-k 检索（P1 全表扫描；量级小，P2 可换向量索引）。 */
  searchChunks(queryVector, topK) {
    const rows = this.db.prepare(`
      SELECT c.document_id AS documentId, c.seq, c.text, c.vector, d.title
      FROM chunks c JOIN documents d ON d.id = c.document_id
    `).all();
    const q = queryVector;
    const scored = [];
    for (const row of rows) {
      if (!row.vector) continue;
      const v = new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4);
      let dot = 0;
      for (let i = 0; i < q.length; i++) dot += q[i] * v[i];
      scored.push({
        documentId: row.documentId,
        title: row.title,
        seq: row.seq,
        text: row.text,
        score: dot
      });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }
  chunkStats() {
    const d = this.db.prepare("SELECT COUNT(*) AS n FROM documents").get();
    const c = this.db.prepare("SELECT COUNT(*) AS n FROM chunks").get();
    return { documents: d.n, chunks: c.n };
  }
};
async function complete(ctx, config, system, userText, logger) {
  const provider = config.provider || "deepseek";
  const model = config.model || void 0;
  const options = {
    provider,
    model,
    system,
    temperature: 0,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }]
  };
  let out = "";
  try {
    for await (const chunk of ctx.llm.stream(options)) {
      if (chunk.type === "text-delta" && chunk.text) out += chunk.text;
      if (chunk.type === "finish" && chunk.reason?.kind === "error") {
        throw new Error(chunk.reason.failure?.message || "LLM stream error");
      }
    }
  } catch (error) {
    logger.warn(`[dsh-memory] LLM \u8C03\u7528\u5931\u8D25\uFF08provider=${provider} model=${model ?? "(default)"}\uFF09:`, error.message || error);
    throw error;
  }
  return out;
}
function messageToText(message) {
  const role = message.role === "assistant" ? "assistant" : "user";
  const content = message.content;
  let text = "";
  if (typeof content === "string") {
    text = content;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      const b = block;
      if (b && b.type === "text" && typeof b.text === "string") text += b.text;
    }
  }
  const trimmed = text.trim();
  return trimmed ? `${role}: ${trimmed}` : "";
}
function sessionToText(messages, maxCount) {
  const recent = Array.isArray(messages) ? messages.slice(-maxCount) : [];
  return recent.map(messageToText).filter(Boolean).join("\n");
}
function buildExtractPrompt(dialogText) {
  const system = [
    "\u4F60\u662F\u4E00\u4E2A\u672C\u5730\u8BB0\u5FC6\u63D0\u53D6\u5F15\u64CE\u3002\u4F60\u7684\u4EFB\u52A1\u662F\u4ECE\u4E00\u6BB5\u5BF9\u8BDD\u4E2D\u63D0\u53D6\uFF1A",
    "1) \u5173\u4E8E\u7528\u6237\u7684\u957F\u671F\u4E8B\u5B9E\uFF08\u8EAB\u4EFD\u3001\u504F\u597D\u3001\u6240\u5728\u9879\u76EE\u3001\u5DE5\u4F5C\u65B9\u5F0F\u7B49\uFF0C\u4E0D\u5305\u542B\u4E00\u6B21\u6027\u95F2\u804A\u5185\u5BB9\uFF09\uFF1B",
    "2) \u5BF9\u8BE5\u6BB5\u5BF9\u8BDD\u7684\u4E00\u53E5\u8BDD\u6458\u8981\u3002",
    "\u53EA\u8F93\u51FA\u4E25\u683C JSON\uFF08\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u3001\u4E0D\u8981 markdown \u4EE3\u7801\u5757\uFF09\uFF1A",
    '{"facts":[{"content":"\u4E8B\u5B9E\u6587\u672C","category":"preference|identity|project|work|other","importance":0\u52301}],"summary":"\u6458\u8981"}',
    "facts \u53EF\u4E3A\u7A7A\u6570\u7EC4\uFF1B\u6BCF\u6761\u7684 importance \u8868\u793A\u5BF9\u957F\u671F\u8BB0\u5FC6\u7684\u91CD\u8981\u6027\uFF080~1\uFF09\u3002"
  ].join("\n");
  return { system, user: `\u5BF9\u8BDD\uFF1A
${dialogText}` };
}
function parseExtraction(raw) {
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned);
    const facts = Array.isArray(parsed.facts) ? parsed.facts.filter((f) => {
      const x = f;
      return typeof x.content === "string" && x.content.trim().length > 0;
    }).map((f) => ({
      content: f.content.trim(),
      category: typeof f.category === "string" ? f.category : "other",
      importance: typeof f.importance === "number" ? f.importance : 0.5
    })) : [];
    return {
      facts,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : ""
    };
  } catch {
    return { facts: [], summary: "" };
  }
}
function renderMemorySection(store, config, now) {
  if (!config.enabled) return "";
  const facts = store.topFacts(config.injectTopK, config.decayDays, now);
  const lines = [];
  if (facts.length > 0) {
    lines.push("[\u6C38\u4E45\u8BB0\u5FC6] \u4EE5\u4E0B\u662F\u4F60\u5BF9\u7528\u6237\u7684\u957F\u671F\u4E86\u89E3\uFF08\u4F9B\u53C2\u8003\uFF0C\u5982\u6709\u8FC7\u65F6\u4EE5\u672C\u6B21\u5BF9\u8BDD\u4E3A\u51C6\uFF09\uFF1A");
    let used = 0;
    for (const f of facts) {
      const line = `- ${f.content}`;
      if (used + line.length > config.injectMaxChars) break;
      lines.push(line);
      used += line.length;
      store.touchFact(f.id);
    }
  }
  if (config.summarize) {
    const summaries = store.recentSummaries(2, Math.floor(config.injectMaxChars / 3));
    if (summaries.length > 0) {
      lines.push("[\u8FD1\u671F\u5BF9\u8BDD\u56DE\u987E]");
      for (const s of summaries) lines.push(`- ${s}`);
    }
  }
  return lines.join("\n");
}
function mount(ctx, config) {
  const settings = ctx.settings?.register?.("dsh-memory-plugin", Config, { base: config, applies: "live" });
  const effective = { ...settings ? settings.get() : config };
  const store = new MemoryStore();
  if (settings) {
    settings.watch((next) => {
      Object.assign(effective, next);
    });
  }
  const extractTurn = async (session) => {
    if (!effective.enabled || !effective.autoExtract) return;
    try {
      let messages = [];
      if (session && typeof session.deriveMessages === "function") {
        messages = session.deriveMessages();
      }
      if (!Array.isArray(messages) || messages.length < effective.minMessages) return;
      const dialog = sessionToText(messages, 20);
      if (!dialog.trim()) return;
      const { system, user } = buildExtractPrompt(dialog);
      const raw = await complete(ctx, effective, system, user, ctx.logger);
      const result = parseExtraction(raw);
      for (const f of result.facts) {
        store.upsertFact(f.content, f.category, f.importance, "session");
      }
      if (effective.summarize && result.summary) {
        store.addSummary(typeof session.id === "string" ? session.id : "", result.summary);
      }
      if (result.facts.length > 0 || result.summary) {
        ctx.logger.info(`[dsh-memory] \u63D0\u53D6 ${result.facts.length} \u6761\u4E8B\u5B9E${result.summary ? " + 1 \u6761\u6458\u8981" : ""}`);
      }
    } catch (error) {
      ctx.logger.warn("[dsh-memory] \u63D0\u53D6\u5931\u8D25\uFF08\u5DF2\u8DF3\u8FC7\u672C\u7A97\u53E3\uFF09:", error.message || error);
    }
  };
  ctx.on("session/event", (session, event) => {
    if (event && event.type === "turn/end") {
      void extractTurn(session);
    }
  });
  ctx.systemPrompt.section({
    name: "dsh-memory:facts",
    order: 50,
    text: () => renderMemorySection(store, effective, Date.now())
  });
  if (effective.ragEnabled && ctx.tools && typeof ctx.tools.register === "function") {
    ctx.tools.register({
      name: "knowledge_search",
      description: "\u5728\u672C\u5730\u77E5\u8BC6\u5E93\u4E2D\u505A\u8BED\u4E49\u68C0\u7D22\uFF0C\u8FD4\u56DE\u547D\u4E2D\u7684\u6587\u6863\u7247\u6BB5\u3002\u5F53\u95EE\u9898\u6D89\u53CA\u5DF2\u5BFC\u5165\u7684\u672C\u5730\u6587\u6863\uFF08\u8FD0\u7EF4\u624B\u518C\u3001\u7B14\u8BB0\u3001\u6280\u672F\u6587\u6863\u7B49\uFF09\u65F6\u8C03\u7528\uFF0C\u4E0D\u8981\u5728\u4E0D\u77E5\u9053\u7B54\u6848\u65F6\u76F4\u63A5\u7F16\u9020\u3002",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "\u68C0\u7D22\u67E5\u8BE2\uFF0C\u7528\u81EA\u7136\u8BED\u8A00\u63CF\u8FF0\u8981\u627E\u7684\u5185\u5BB9" },
          k: { type: "integer", description: "\u8FD4\u56DE\u6761\u6570\uFF08\u9ED8\u8BA4 3\uFF0C\u6700\u5927 5\uFF09" }
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args) {
        const { query, k } = args;
        if (!query || !query.trim()) return "\u7F3A\u5C11 query \u53C2\u6570";
        try {
          const hits = await searchKnowledge(store, query, Math.max(1, Math.min(k ?? 3, 5)));
          if (hits.length === 0) return "\u77E5\u8BC6\u5E93\u4E2D\u6CA1\u6709\u627E\u5230\u76F8\u5173\u5185\u5BB9\u3002";
          return hits.map((h, i) => `[${i + 1}] \u6765\u6E90\u300A${h.title}\u300B\u76F8\u4F3C\u5EA6 ${h.score.toFixed(3)}\uFF1A
${h.text}`).join("\n\n");
        } catch (error) {
          return `\u77E5\u8BC6\u5E93\u68C0\u7D22\u5931\u8D25\uFF1A${error.message || error}`;
        }
      }
    });
    ctx.logger.info("[dsh-memory] \u672C\u5730 RAG \u5DF2\u542F\u7528\uFF08knowledge_search\uFF09");
  }
  if (ctx.tools && typeof ctx.tools.register === "function") {
    ctx.tools.register({
      name: "memory_search",
      description: "\u68C0\u7D22\u4F60\u5BF9\u7528\u6237\u7684\u6C38\u4E45\u8BB0\u5FC6\uFF08\u957F\u671F\u4E8B\u5B9E\u4E0E\u8FD1\u671F\u5BF9\u8BDD\u6458\u8981\uFF09\u3002\u9700\u8981\u56DE\u5FC6\u7528\u6237\u504F\u597D\u3001\u8EAB\u4EFD\u3001\u6240\u5728\u9879\u76EE\u6216\u5386\u53F2\u5BF9\u8BDD\u5185\u5BB9\u65F6\u8C03\u7528\u3002",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "\u60F3\u56DE\u5FC6\u7684\u4E3B\u9898\u6216\u5173\u952E\u8BCD\uFF08\u53EF\u9009\uFF09" },
          k: { type: "integer", description: "\u8FD4\u56DE\u6761\u6570\uFF08\u9ED8\u8BA4 5\uFF0C\u6700\u5927 10\uFF09" }
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args) {
        const { k } = args;
        const limit = Math.max(1, Math.min(k ?? 5, 10));
        try {
          const facts = store.topFacts(limit, effective.decayDays, Date.now());
          const summaries = effective.summarize ? store.recentSummaries(2, 400) : [];
          const parts = [];
          if (facts.length > 0) {
            parts.push("\u6C38\u4E45\u8BB0\u5FC6\u4E2D\u7684\u4E8B\u5B9E\uFF1A");
            for (const f of facts) parts.push(`- ${f.content}`);
          }
          if (summaries.length > 0) {
            parts.push("\u8FD1\u671F\u5BF9\u8BDD\u56DE\u987E\uFF1A");
            for (const s of summaries) parts.push(`- ${s}`);
          }
          if (parts.length === 0) return "\u8FD8\u6CA1\u6709\u53EF\u7528\u7684\u6C38\u4E45\u8BB0\u5FC6\u3002";
          return parts.join("\n");
        } catch (error) {
          return `\u8BB0\u5FC6\u68C0\u7D22\u5931\u8D25\uFF1A${error.message || error}`;
        }
      }
    });
  }
  if (typeof ctx.inject === "function") {
    ctx.inject(["webServer"], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: "prefix",
          path: "/plugins/dsh-memory",
          handler: createMemoryApi(store, settings ?? localSettingsScope(effective), effective)
        }),
        "dsh-memory: management api"
      );
    });
  }
  ctx.logger.info("[dsh-memory] \u6C38\u4E45\u8BB0\u5FC6\u5DF2\u542F\u7528\uFF08autoExtract=%s provider=%s\uFF09", String(effective.autoExtract), effective.provider || "deepseek");
}
function apply(ctx, config = {}) {
  if (typeof ctx.inject === "function") {
    ctx.inject(["settings"], (settingsCtx) => mount(settingsCtx, config));
    return;
  }
  mount(ctx, config);
}
function localSettingsScope(value) {
  return {
    get: () => value,
    update: async () => {
    },
    replace: async () => {
    },
    watch: () => () => {
    }
  };
}
function apiJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function queryParam(url, key) {
  const search = url.split("?")[1];
  if (!search) return void 0;
  return new URLSearchParams(search).get(key) ?? void 0;
}
function createMemoryApi(store, settings, effective) {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      apiJson(res, 403, { ok: false, error: "local access only" });
      return;
    }
    const origin = req.headers?.origin;
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
      }
      if (!originHost || originHost !== req.headers.host) {
        apiJson(res, 403, { ok: false, error: "origin mismatch" });
        return;
      }
    }
    if (req.method === "OPTIONS") {
      apiJson(res, 204, {});
      return;
    }
    const urlPath = (req.url ?? "/").split("?")[0];
    try {
      if (urlPath === "/plugins/dsh-memory/config") return handleConfig(req, res, settings);
      if (urlPath === "/plugins/dsh-memory/stats") {
        const counts = store.counts();
        const stats = store.chunkStats();
        return apiJson(res, 200, {
          ok: true,
          facts: counts.facts,
          summaries: counts.summaries,
          documents: stats.documents,
          chunks: stats.chunks,
          model: EMBEDDING_MODEL,
          enabled: effective.enabled,
          ragEnabled: effective.ragEnabled
        });
      }
      if (urlPath === "/plugins/dsh-memory/facts") return handleFacts(req, res, store);
      if (urlPath === "/plugins/dsh-memory/summaries") return handleSummaries(req, res, store);
      if (urlPath === "/plugins/dsh-memory/documents") return handleDocuments(req, res, store);
      if (urlPath === "/plugins/dsh-memory/documents/import") return handleImport(req, res, store);
      if (urlPath === "/plugins/dsh-memory/search") return handleSearch(req, res, store);
      return apiJson(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      return apiJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
async function handleConfig(req, res, settings) {
  if (req.method === "GET") {
    return apiJson(res, 200, settings.get());
  }
  if (req.method !== "PATCH") {
    return apiJson(res, 405, { ok: false, error: "method not allowed" });
  }
  const body = await readJsonBody(req);
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return apiJson(res, 400, { ok: false, error: "patch must be an object" });
  }
  if (typeof settings.replace === "function") await settings.replace(body);
  else if (typeof settings.update === "function") await settings.update(body);
  return apiJson(res, 200, { ok: true, config: settings.get() });
}
async function handleFacts(req, res, store) {
  if (req.method === "GET") {
    return apiJson(res, 200, { ok: true, facts: store.listFacts() });
  }
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    if (!body || typeof body.content !== "string" || !body.content.trim()) {
      return apiJson(res, 400, { ok: false, error: "content is required" });
    }
    store.insertFactRaw({
      content: body.content,
      category: typeof body.category === "string" ? body.category : "other",
      importance: typeof body.importance === "number" ? body.importance : 0.5,
      source: "manual"
    });
    return apiJson(res, 200, { ok: true });
  }
  if (req.method === "PATCH") {
    const id = queryParam(req.url ?? "", "id");
    if (!id) return apiJson(res, 400, { ok: false, error: "id is required" });
    const body = await readJsonBody(req);
    store.updateFact(id, body);
    return apiJson(res, 200, { ok: true });
  }
  if (req.method === "DELETE") {
    const id = queryParam(req.url ?? "", "id");
    if (!id) return apiJson(res, 400, { ok: false, error: "id is required" });
    store.deleteFact(id);
    return apiJson(res, 200, { ok: true });
  }
  return apiJson(res, 405, { ok: false, error: "method not allowed" });
}
async function handleSummaries(req, res, store) {
  if (req.method === "GET") {
    return apiJson(res, 200, { ok: true, summaries: store.listSummaries() });
  }
  if (req.method === "DELETE") {
    const id = queryParam(req.url ?? "", "id");
    if (!id) return apiJson(res, 400, { ok: false, error: "id is required" });
    store.deleteSummary(id);
    return apiJson(res, 200, { ok: true });
  }
  return apiJson(res, 405, { ok: false, error: "method not allowed" });
}
async function handleDocuments(req, res, store) {
  if (req.method === "GET") {
    return apiJson(res, 200, { ok: true, documents: store.listDocuments() });
  }
  if (req.method === "DELETE") {
    const id = queryParam(req.url ?? "", "id");
    if (!id) return apiJson(res, 400, { ok: false, error: "id is required" });
    store.deleteDocument(id);
    return apiJson(res, 200, { ok: true });
  }
  return apiJson(res, 405, { ok: false, error: "method not allowed" });
}
async function handleImport(req, res, store) {
  if (req.method !== "POST") {
    return apiJson(res, 405, { ok: false, error: "method not allowed" });
  }
  const body = await readJsonBody(req);
  if (!body || typeof body.path !== "string" || !body.path.trim()) {
    return apiJson(res, 400, { ok: false, error: "path is required" });
  }
  const result = await importPath(store, body.path.trim());
  return apiJson(res, 200, { ok: true, ...result });
}
async function handleSearch(req, res, store) {
  if (req.method !== "POST") {
    return apiJson(res, 405, { ok: false, error: "method not allowed" });
  }
  const body = await readJsonBody(req);
  if (!body || typeof body.query !== "string" || !body.query.trim()) {
    return apiJson(res, 400, { ok: false, error: "query is required" });
  }
  const hits = await searchKnowledge(store, body.query, Math.max(1, Math.min(body.k ?? 3, 5)));
  return apiJson(res, 200, { ok: true, hits });
}
export {
  Config,
  MemoryStore,
  apply,
  chunkText,
  importPath,
  inject,
  name,
  searchKnowledge
};
