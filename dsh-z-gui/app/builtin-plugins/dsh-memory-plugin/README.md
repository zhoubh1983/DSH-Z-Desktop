# dsh-memory-plugin

DeepSeek Harness (dsh) 插件：为 Agent 增加**永久记忆**（跨会话事实 + 对话摘要）与**本地知识库 RAG** 能力，**全本地、离线可用**，适配私网无外网部署。

随 DSH Desktop 作为内置插件分发（`builtin-plugins/dsh-memory-plugin`），也支持独立安装到任一 dsh profile。

---

## 功能

| 能力 | 说明 |
|---|---|
| 永久记忆 | 对话结束后自动提取长期事实（身份/偏好/项目/工作）与对话摘要；每次对话把 top-k 相关事实注入系统提示 |
| 记忆衰减 | 事实按重要度 × 时间衰减排序，可「钉住」不衰减、手动编辑/删除 |
| 本地 RAG | 文件夹/文件导入纯文本文档 → 本地分块 → 本地 embedding（bge-small-zh-v1.5）→ 语义检索 |
| 工具 | Agent 按需调用 `memory_search`（记忆）/ `knowledge_search`（知识库） |
| 控制面板 | 设置页一级菜单「记忆与知识库」：概览 / 事实管理 / 知识库导入 / 检索测试 / 配置开关 |
| 全本地 | 存储用 Node 内置 SQLite，向量用本地 ONNX 推理，零外网依赖 |

---

## 安装

### 随 DSH Desktop（推荐）

插件已内置：GUI 启动时自动安装到 web profile 并注册 bundle；embedding 模型随安装包分发并自举复制到 `$DSH_HOME/dsh-memory/models/`。

### 独立安装到 dsh profile

```bash
dsh plugin --profile web add D:/sourceCode/ai-app/dsh-d/dsh-memory-plugin
```

（插件依赖 `@xenova/transformers`，需随插件 `node_modules` 一起分发；embedding 模型需放到 `$DSH_HOME/dsh-memory/models/bge-small-zh-v1.5/`）

---

## 配置

插件通过 `ctx.settings` 持久化到 `$DSH_HOME/settings.yaml` 的 `dsh-memory-plugin` 命名空间，也支持在 profile 的 `cordis.patch.yml` 里按 id `dsh-memory` 覆盖：

```yaml
- id: dsh-memory
  config:
    enabled: true          # 记忆系统总开关
    autoExtract: true      # 对话结束后自动提取事实/摘要
    provider: ''           # 提取用 LLM provider 路由（空 = deepseek；私网建议填本地 Ollama/网关）
    model: ''              # 提取用模型（空 = 由 provider 解析默认）
    minMessages: 3         # 至少多少条消息才触发提取
    injectTopK: 8          # 每次注入系统提示的事实条数
    injectMaxChars: 1500   # 注入的记忆文本最大字符数
    decayDays: 30          # 事实衰减半衰期（天），钉住的不衰减
    summarize: true        # 是否生成对话摘要
    ragEnabled: true       # 本地 RAG（knowledge_search 工具）
```

> 面板（设置 → 记忆与知识库）可在线修改以上配置。

---

## 使用

### 控制面板

设置 → **记忆与知识库**：

- **概览**：事实/摘要/文档/分块计数。
- **永久事实**：查看、新增、钉住、删除长期事实。
- **知识库**：输入本地文件/文件夹路径导入（自动分块 + 向量化）；查看文档与分块数；检索测试预览命中片段。
- **设置**：开关与提取/注入参数。

### Agent 工具

- `memory_search(topic?, k?)`：检索你对用户的永久记忆（事实 + 近期摘要）。
- `knowledge_search(query, k?)`：语义检索已导入的本地文档。

### 管理 API（本机回环，同源校验）

| 端点 | 方法 | 说明 |
|---|---|---|
| `/plugins/dsh-memory/config` | GET / PATCH | 读取 / 保存配置 |
| `/plugins/dsh-memory/stats` | GET | 概览统计 |
| `/plugins/dsh-memory/facts` | GET / POST / PATCH / DELETE | 事实管理 |
| `/plugins/dsh-memory/summaries` | GET / DELETE | 摘要查看/删除 |
| `/plugins/dsh-memory/documents` | GET / DELETE | 文档列表/删除 |
| `/plugins/dsh-memory/documents/import` | POST | 导入 `{path}` |
| `/plugins/dsh-memory/search` | POST | 检索测试 `{query, k}` |

### 数据存储

- 数据库：`$DSH_HOME/dsh-memory/memory.db`（SQLite：`facts` / `summaries` / `documents` / `chunks`）
- embedding 模型：`$DSH_HOME/dsh-memory/models/bge-small-zh-v1.5/`

---

## 目录结构

```
dsh-memory-plugin/
├── src/
│   ├── index.ts        # 插件入口：存储/提取/注入/工具/管理 API
│   ├── embedding.ts    # 本地 embedding 服务（Transformers.js + bge）
│   └── rag.ts          # RAG 编排：文档扫描/分块/导入/检索
├── lib/
│   ├── index.js        # esbuild 构建产物（服务端）
│   └── client.js       # 设置面板客户端（零构建）
├── cordis.patch.yml    # bundle 补丁
└── package.json
```

## 开发

```bash
# 构建服务端 bundle（external 依赖由 dsh runtime 提供）
node <path-to-esbuild>/esbuild src/index.ts --bundle --platform=node --format=esm \
  --external:@deepseek-ai/cordis --external:@deepseek-ai/schemastery \
  --external:@deepseek-ai/dsh-session --external:@deepseek-ai/dsh-llm \
  --external:@deepseek-ai/dsh-settings --external:@xenova/transformers \
  --outfile=lib/index.js
```

- 服务端依赖（`@xenova/transformers` 等）需随插件 `node_modules` 分发（打包进安装包）。
- 更多设计细节见 [`docs/dsh-memory-design.md`](../docs/dsh-memory-design.md)。
