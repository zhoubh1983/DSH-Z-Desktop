# dsh-skill-market

DeepSeek Harness (dsh) 插件：**技能市场**。在 Web GUI「设置」新增一级菜单「技能市场」，用于浏览并安装官方技能（Anthropic / OpenAI / Vercel 技能仓库），全本地离线。

## 功能

- **一级设置菜单**：与「模型」「插件」「技能与 MCP」等并列。
- **可配置市场地址**：默认 `~/.dsh/skills-market`（随应用内置技能集合同步），可改为任意本地目录（含 `manifest.json` 与 `skills/` 子目录）。
- **浏览 / 搜索 / 分类**：市场清单解析 `manifest.json`，按名称/描述搜索，按分类（文档/开发/创意/沟通/其他）筛选。
- **安装 / 覆盖更新**：把市场技能复制到 `~/.dsh/skills/<name>`（同名覆盖更新），并写入 `.dsh-market-installed.json` 来源标记。
- **卸载**：仅允许卸载由市场安装的技能（有来源标记），防止误删用户自建技能。
- **安全**：技能名按 dsh 兼容 `kebab-case` 校验（防目录穿越）；管理 API 仅本机回环访问。

## 内置市场

`app/skills-market/` 内置采集自官方仓库的 67 个技能（约 15 MB）：

| 来源 | 内容 | 许可 |
|---|---|---|
| [anthropics/skills](https://github.com/anthropics/skills) | 18 个（文档/开发/创意/沟通） | 多数 Apache-2.0；docx/pdf/pptx/xlsx 为 source-available |
| [openai/skills](https://github.com/openai/skills) | 社区策展技能（.curated） | 每技能自带 LICENSE.txt |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | 8 个 | MIT |

内置市场由 GUI 启动时通过 `ensureBuiltinSkillsMarket()` 同步到 `~/.dhs/skills-market`（结构指纹增量刷新，与 `ensureBuiltinPlugins` 同机制）。技能格式为 SKILL.md（YAML frontmatter + 正文），与 dsh 技能引擎兼容。

## 安装

本插件随 DSH Desktop 内置分发（builtin-plugins）。独立安装：

    dsh plugin --profile web add dsh-skill-market

或在 profile 的 `cordis.patch.yml` 按 id `dsh-skill-market` 覆盖配置。

## 使用

1. 打开 Web GUI →「设置」→「技能市场」。
2. 顶部可修改市场地址（留空 = 内置市场，立即生效）。
3. 搜索/筛选技能 → 点「安装」→ 技能写入 `~/.dsh/skills`，重启会话后生效。
4. 已安装技能可在「技能与 MCP」页面统一管理；点「更新」可覆盖为新版，点「卸载」移除（仅市场来源技能）。

## 目录结构

    src/
      index.ts     # Host 入口：配置作用域 + /plugins/dsh-skill-market/api 路由族
      market.ts    # 市场引擎：manifest 解析、安装/覆盖/卸载、来源标记、越界防护
    lib/
      index.js     # esbuild 构建产物（Host）
      client.js    # 浏览器半区（零构建，注册 settings.section「技能市场」）
    cordis.patch.yml  # 插件注册行（insert dsh-skill-market）

## 管理 API

前缀 `/plugins/dsh-skill-market/api`（注意避开 `/plugins/<name>/client.js` 客户端 bundle 路径）：

- `GET  /list` → 市场信息 + 技能列表（含 installed/managed 状态）
- `GET  /config` / `PATCH /config` → 读写配置（enabled / marketUrl）
- `POST /install`  `{name}` → 安装（覆盖更新）
- `POST /uninstall` `{name}` → 卸载（仅市场来源技能）

## 许可

MIT。内置技能包遵循各自上游许可（见 manifest.json 的 `license` 字段与技能内 LICENSE）。
