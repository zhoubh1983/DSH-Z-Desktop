# DSH 永久记忆 + 本地 RAG 设计文档

> 版本：v0.1（讨论定稿）
> 状态：待审阅 → P0 实现
> 目标：为 DSH Desktop 增加跨会话「永久记忆」与「本地知识库 RAG」，**全本地、离线可用**，适配私网无外网部署。

***

## 1. 定位与目标

以 dsh 插件 `dsh-memory-plugin`（自包含 bundle，沿用 `dsh-webhook-plugin` 模式）实现：

* **永久记忆**：跨会话保留用户事实/偏好（长期）与对话摘要（滚动），Agent 每次对话都能"想起"。

* **本地 RAG**：把本地文档（运维手册/笔记/代码）向量化入库，Agent 通过工具按需检索。

* **全本地**：存储、向量、推理全部在私网内完成，**安装包内自带所需资源**，零外网依赖。

### 非目标（本期不做）

* 不替换 DSH 会话持久化（复用 `node:sqlite`，与会话系统并存）。

* 不做在线/云同步、不做多端共享、不做权限体系（单机个人使用）。

***

## 2. 技术选型

| 能力        | 选型                                                                            | 理由                                                                |
| --------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 存储        | **Node 内置** **`node:sqlite`（DatabaseSync）**                                   | 零 native 依赖、零 npm 包、完全离线；DSH `dsh-session-persistence-sqlite` 已同款 |
| 向量        | SQLite 存 float32 blob + 应用层余弦相似度                                              | 记忆量级（数千条）足够；后续可平滑换 `sqlite-vec` 不破坏接口                             |
| Embedding | **Transformers.js（`@huggingface/transformers`）跑 ONNX**，模型 `bge-small-zh-v1.5` | 本地离线推理；模型 \~50–100MB 打进安装包                                        |
| 事实/摘要引擎   | **复用 DSH provider**（私网内本地 LLM，非流式 completion）                                 | 无需额外 LLM 服务；质量高                                                   |
| 记忆注入      | `ctx.systemPrompt`（`system-prompt/assemble` 注入 top-k 事实）+ `ctx.tools`（按需深查）   | 双通道：核心事实常驻上下文，细节按需检索                                              |
| 记忆提取      | `ctx.sessions` 的 `session/event` 事件监听，**对话结束后聚合提取+摘要**                        | 聚合一次性调用 LLM，省 token、及时性好（用户已确认）                                   |
| 配置面板      | `settings.plugin.item` 卡片（同 webhook 卡片机制）                                     | DSH 原生扩展，不改内核                                                     |

> 关键利好：DSH runtime 已内置 `node:sqlite` 且 `dsh-session-persistence-sqlite` 是现成参考实现，SQLite 引擎无需随包分发。

***

## 3. 总体架构

```
┌─ 提取层（事件驱动）──────────────────────────────────┐
│ ctx.sessions session/event（对话结束）                │
│   → 事实提取器（本地 LLM）→ facts 表                 │
│   → 摘要压缩器（本地 LLM）→ summaries 表              │
└───────────────────────────────┬────────────────────┘
                                ▼
┌─ 注入层 ────────────────────────────────────────────┐
│ ① ctx.systemPrompt assemble：拼 top-k 相关事实       │
│ ② ctx.tools：memory_search / knowledge_search 工具   │
└───────────────────────────────┬────────────────────┘
                                ▼
┌─ 本地 RAG 层（离线 embedding）──────────────────────┐
│ 文档(文件夹/文件导入) → 分块 → Transformers.js ONNX   │
│   → 向量存 SQLite → 查询相似度 top-k                  │
└────────────────────────────────────────────────────┘
           存储：$DSH_HOME/dsh-memory/memory.db
           facts / summaries / documents / chunks+vectors
```

### 挂载点（DSH 原生扩展点）

| 扩展点                                          | 用途                                      |
| -------------------------------------------- | --------------------------------------- |
| `ctx.sessions` + `session/event`             | 监听对话、触发聚合提取                             |
| `ctx.systemPrompt`（`system-prompt/assemble`） | 每次对话注入相关记忆                              |
| `ctx.tools`                                  | 注册 `memory_search` / `knowledge_search` |
| `ctx.settings` + webServer                   | 配置持久化 + 控制面板 API                        |
| `settings.plugin.item`（客户端卡片）                | 控制面板 UI                                 |

***

## 4. 数据模型（SQLite）

文件：`$DSH_HOME/dsh-memory/memory.db`

### `facts` —— 结构化事实（长期记忆）

| 列              | 类型      | 说明                  |
| -------------- | ------- | ------------------- |
| id             | TEXT PK | uuid                |
| content        | TEXT    | 事实内容（如"用户是 Go 开发者"） |
| category       | TEXT    | 偏好/身份/项目/工作/其他      |
| importance     | REAL    | 0–1，默认 0.5          |
| source         | TEXT    | 来源（session 或手动）     |
| pinned         | INT     | 1=钉住（不衰减）           |
| created\_at    | INT     | ms                  |
| last\_seen\_at | INT     | 最近一次被检索/提及          |
| access\_count  | INT     | 累计被注入次数             |

### `summaries` —— 对话摘要（滚动）

| 列                 | 类型      | 说明       |
| ----------------- | ------- | -------- |
| id                | TEXT PK | uuid     |
| session\_id       | TEXT    | 来源会话     |
| window\_start/end | INT     | 覆盖的消息时间窗 |
| summary           | TEXT    | 摘要正文     |
| created\_at       | INT     | ms       |

### `documents` —— 知识库文档

| 列            | 类型      | 说明                |
| ------------ | ------- | ----------------- |
| id           | TEXT PK | uuid              |
| title        | TEXT    | 文件名/标题            |
| path         | TEXT    | 原始路径（导入记录）        |
| kind         | TEXT    | md/txt/code/other |
| chunk\_count | INT     | 分块数               |
| status       | TEXT    | indexed/failed    |
| created\_at  | INT     | ms                |

### `chunks` —— 文档分块与向量

| 列            | 类型      | 说明                              |
| ------------ | ------- | ------------------------------- |
| id           | TEXT PK | uuid                            |
| document\_id | TEXT FK | 所属文档                            |
| seq          | INT     | 块序号                             |
| text         | TEXT    | 分块文本                            |
| vector       | BLOB    | float32 embedding（模型名/维度记于元数据表） |
| model        | TEXT    | 嵌入模型标识（校验/重建用）                  |

### `meta` —— 元数据

模型名、向量维度、schema 版本、统计。

***

## 5. 核心流程

### 5.1 记忆提取（对话结束后聚合）

1. `session/event` 收到对话结束信号（超时/用户停止/会话切换）。
2. 取本窗口新增消息（数量超阈值才触发，如 ≥3 条）。
3. 调本地 LLM（复用 DSH provider）一次，产出：`{ facts: [{content, category, importance}], summary }`。
4. `facts` upsert：同义事实合并（LLM 归一化 + 内容去重），更新 `last_seen_at`、`importance` 加权。
5. `summaries` 追加一条；可选与上一窗口摘要做滚动压缩（超长时）。
6. 失败降级：LLM 不可用时跳过本窗口（不阻塞对话，日志记录）。

### 5.2 记忆注入（`system-prompt/assemble`）

1. 读取当前会话上下文关键词/最近消息。
2. 检索 top-k 事实（`importance × 时间衰减 × 与上下文相关度` 排序）。
3. 拼入系统提示 `[永久记忆]` 区块（限制字符数/条数，如 ≤1500 字、≤8 条）。
4. 更新命中事实的 `last_seen_at` / `access_count`（异步、不阻塞组装）。

### 5.3 记忆工具（`ctx.tools`）

* `memory_search(query, k)`：语义检索 facts + summaries，返回片段+来源。

* `knowledge_search(query, k, scope?)`：RAG 文档检索，返回命中块+文档。

* 工具描述明确"只有需要回忆/查证时才调用"，减少无效调用。

### 5.4 本地 RAG 管道

1. 导入：文件夹/文件选择 → 过滤纯文本类（txt/md/code/json/yaml…）→ 逐文件入库 `documents`。
2. 分块：按段落/固定窗口（含重叠）切分。
3. 向量化：Transformers.js 加载本地 ONNX 模型 → 每块产出向量存 `chunks.vector`。
4. 检索：query → 同模型向量化 → 余弦相似度 top-k → 返回。
5. 重建：面板提供"重建索引"（模型升级/失败重试）。

***

## 6. 记忆衰减与纠正（复用既有偏好）

* **衰减**：`effectiveImportance = importance × exp(-λ · daysSince(last_seen_at))`；`pinned=1` 不衰减。

* **纠正**：控制面板支持编辑/删除/钉住事实；用户纠正后 `source='manual'`、提高 `importance`。

* **合并去重**：提取时 LLM 归一化表达 + 库内相似度去重，避免事实膨胀。

***

## 7. 控制面板（`settings.plugin.item` 卡片）

* **概览**：事实/摘要/文档计数、最近记忆、今日新增。

* **事实管理**：列表+搜索，编辑/删除/钉住/重要度调整。

* **知识库管理**：文件夹/文件导入、索引进度、删除、重建。

* **检索测试**：输入 query 预览命中片段与来源。

* **开关**：记忆注入开关、自动提取开关、摘要窗口/频率、top-k 条数、token 上限。

后端暴露 `/plugins/dsh-memory/config` 与 `/plugins/dsh-memory/*` 管理 API（同 webhook 卡片模式，回环+同源校验）。

***

## 8. 私网资源预集成清单（打进安装包 extraResources）

1. `dsh-memory-plugin` bundle（服务端 + 客户端卡片）。
2. embedding ONNX 模型：`bge-small-zh-v1.5`（含 tokenizer），\~50–100MB，随包分发。
3. Transformers.js 运行时（随 bundle 依赖携带，自包含）。
4. SQLite 引擎：**无需**（Node 内置）。
5. 事实/摘要 LLM：**复用 DSH provider**（私网内本地 LLM），无需额外资源。

首启流程：将随包模型复制到 `$DSH_HOME/dsh-memory/models/`（校验哈希），之后完全离线。

***

## 9. 分阶段实施计划

### P0 永久记忆（先做，可验证）

* SQLite schema + `node:sqlite` 存取层。

* `session/event` 监听 + 对话结束后聚合提取（本地 LLM）。

* `system-prompt/assemble` 注入 top-k 事实 + 衰减算法。

* 最小设置项（开关/阈值，走 `ctx.settings`）。

* **验收**：跨会话"记得你是谁/你的偏好"；断网环境下完整可用。

### P1 本地 RAG

* 本地 embedding 管道（Transformers.js + ONNX，模型随包）。

* 文件夹/文件导入 + 分块 + 向量化 + 检索。

* `knowledge_search` / `memory_search` 工具注册。

* **验收**：文档入库后 Agent 能检索到准确片段回答。

### P2 控制面板

* `settings.plugin.item` 卡片全功能（概览/事实管理/知识库/检索测试/开关）。

* 记忆管理 API（CRUD/导入/重建）。

* **验收**：面板可查看/编辑记忆、导入文档、测试检索。

每阶段独立可验证、可回滚；P0 优先（符合 P0>P1>P2 优先级习惯）。

***

## 10. 风险与开放问题

| 风险/问题                        | 应对                                         |
| ---------------------------- | ------------------------------------------ |
| 本地 LLM（私网 provider）质量影响事实提取  | 提取 prompt 严格约束 JSON 输出；质量不足可回退规则提取（预留引擎接口） |
| `bge-small-zh` 对中文代码/混合文本效果  | 备选 `m3e-small`；分块策略可调                      |
| token 成本（每对话结束一次 LLM 提取）     | 聚合提取+阈值触发；提取走非流式小模型；面板可关                   |
| Transformers.js 首次加载/内存占用    | 模型常驻复用、懒加载；量级小                             |
| 向量检索精度（应用层余弦）                | 数据量小够用；接口抽象，可换 sqlite-vec                  |
| `node:sqlite` 在打包 Node 版本可用性 | 与 DSH runtime 同 Node 版本（≥22），已验证           |

