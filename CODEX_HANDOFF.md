# DSH-Z Desktop 项目交接文档（CODEX_HANDOFF）

> 本文件供**其他账号 / 新开发者 / 新 AI 会话**接手本仓库继续开发时阅读。
> 目标：让接手者在 15 分钟内了解项目全貌、能独立构建与打包、知道关键约定与易踩坑点。

---

## 1. 项目是什么

**DSH Desktop**：基于 DeepSeek Harness（dsh）的 Windows 桌面 GUI 应用（Electron 外壳 + dsh web 后端），集成多个自研插件（技能市场、记忆知识库、Webhook 告警、桌面伴侣、浏览器控制）。

- 仓库：https://github.com/zhoubh1983/DSH-Z-Desktop.git（**私有**，main 分支）
- 交付形态：`dsh-gui-0.1.0-win-x64-setup.exe`（NSIS 安装器，约 348MB）+ `dsh-gui-0.1.0-win-x64-portable.exe`（约 322MB）
- 运行时：Node 24（`.tools/node-v24.20.0-win-x64/node.exe`）；系统 node v22 缺 `createZstdDecompress` 无法启动 dsh web

---

## 2. 目录结构

```
dsh-d/                          # 仓库根（git 根）
├── dsh-z-gui/                  # Electron 桌面 GUI（核心交付物）
│   └── app/
│       ├── main/               # Electron 主进程（index.js / backend.js / paths.js / window.js）
│       ├── preload/
│       ├── builtin-plugins/    # 内置插件副本（打包/运行时实际加载的版本）
│       ├── dsh-runtime/        # dsh CLI 构建产物 + 依赖闭包（303 包实体布局）
│       ├── skills-market/      # 内置技能市场内容源（→ 同步到 ~/.dsh/skills-market）
│       ├── resources/          # 图标 / installer.nsh / vc_redist.x64.exe
│       ├── scripts/            # after-pack.js（dsh-runtime 补齐）等
│       ├── electron-builder.yml# 打包配置
│       └── release/            # 打包产物（git 已排除）
├── plugins/                    # 插件源码（自研：dsh-skill-market / dsh-whale-musume；独立仓库：其余）
├── deepseek-harness/           # 上游 dsh 框架源码快照（**不在 git 中**，见 4.4；含 directory-picker-native 等，改过 readUtf16）
├── dsh-memory-plugin/          # 记忆插件源码（模型在 builtin 副本内，onnx 已 git 排除）
├── dsh-webhook-plugin/         # Webhook 插件源码（空目录，实际在 builtin-plugins）
├── docs/                       # 设计文档（dsh-memory-design.md 等）
└── .gitignore                  # 已排除 node_modules/release/.tools/onnx/独立插件仓库/deepseek-harness快照
```

---

## 3. 关键子系统

### 3.1 GUI（dsh-z-gui/app）
- `main/backend.js`：以 `ELECTRON_RUN_AS_NODE=1` + `process.execPath` 启动 dsh web 后端（**后端跑在 Electron 主进程内**），注册 `BUILTIN_PLUGINS`。
- `main/window.js`：窗口创建 + 崩溃自愈（render-process-gone 自动重开；正常关窗即退出）。
- 开发模式：`resources/icon.png` 作窗口图标；打包后用 exe 自带图标。

### 3.2 内置插件（builtin-plugins/，共 7 个）
| 插件 | 作用 | 备注 |
|---|---|---|
| `dsh-skill-market` | 技能市场：市场地址/安装/卸载/搜索/分类/排序 UI | API 前缀必须 `/plugins/dsh-skill-market/api`（子路径），不能占根前缀 |
| `dsh-memory-plugin` | 记忆知识库（本地向量化，bge-small-zh 模型） | 模型 onnx 已从 git 排除（用 LFS 或运行时获取） |
| `dsh-webhook-plugin` | Webhook 告警（独立 HTTP :8787） | 配置持久化于 `~/.dsh/settings.yaml` 的 `dsh-webhook-plugin` |
| `dsh-whale-musume` | 桌面伴侣（动画 overlay） | `reconcile()` 渲染循环，报错会移除 DOM |
| `dsh-chrome-control` | 浏览器控制（daemon 架构） | 见 3.4 |
| `@zebbkira/dsh-skills-mcp-manager` | 技能与 MCP 管理页 | 独立系统，扫描 `~/.dsh/skills` |
| `dsh-dafeiyu` | 第三方插件 | 独立 upstream 仓库 |

### 3.3 技能市场（dsh-skill-market）
- 引擎：`src/market.ts`（MarketEngine：清单解析、安装/覆盖/卸载、来源标记、目录穿越防护）。
- 客户端 UI：`lib/client.js`（零构建 React createElement + 注入 `<style>`；注意嵌套三元括号易错，改后用 `node --check` 校验）。
- 内置市场：`app/skills-market` → GUI 启动 `ensureBuiltinSkillsMarket()` 同步到 `~/.dsh/skills-market`（指纹 `.dsh-market-fingerprint`）。
- 市场技能安装到 `~/.dsh/skills/<name>`，写 `.dsh-market-installed.json` 来源标记；卸载仅允许有标记者。
- 重新采集内置市场：`dsh-z-gui/scripts/collect-skills-market.mjs`（源 codeload.github.com tarball；github.com git 不可达、ghproxy 不可达、gitclone 可达）。

### 3.4 浏览器控制（dsh-chrome-control，重点交接项）
- 当前内置 **0.3.2 = daemon 架构**：`lib/server.js` spawn Rust `chrome-daemon`（`binaries/<platform-arch>/`），固定端口 **37086**，路由 `/chrome/mcp`、`/chrome/ws`（扩展 WebSocket）、`/chrome/status`、`/chrome/shutdown`。
- 协议：扩展连 `ws://127.0.0.1:37086/chrome/ws`（Origin 必须 `chrome-extension://`）；帧：`hello/pong/tool_result`（客户端），`ping/hello_ack/tool_call`（服务端）；共 27 个工具（navigate/snapshot/click/fill/…/get_text），契约在 daemon 源码 `tools_catalog.rs`。
- **扩展现状**：官方未发布配套扩展；Chrome 商店的 "DeepSeek Harness for Chrome" 是侧边栏 GUI 扩展，**协议不匹配**。官方仓库 `dshapp/dsh-chrome-control` 无扩展源码。
- **决策记录**：曾评估"内置自研扩展 + 引导安装"，**已被用户叫停**，未写任何代码。接手者如需浏览器控制闭环，可重新评估（自研 MV3 扩展 / 等官方 / 引导占位）——**不要假设扩展已存在**。
- `/chrome/status` 返回 503 `{"running":false,"extension_connected":false}` = 扩展未连接，正常。

---

## 4. 构建与打包（重要）

### 4.1 环境
- Node：`.tools/node-v24.20.0-win-x64/node.exe`（必须 24；系统 v22 不行）
- 打包命令（在 `dsh-z-gui/app` 下）：
  ```
  $env:ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"
  npx electron-builder --win --x64
  ```

### 4.2 关键机制
- **after-pack 钩子**（`app/scripts/after-pack.js`）：electron-builder 会排除 extraResources 根下的 `node_modules`，必须在打包后把 `app/dsh-runtime` **全量覆盖复制**到产物 `resources/dsh-runtime`。**改 dsh-runtime 内代码后必须重新打包才会入产物**。
- **dsh-runtime 重新生成**（仅当需要升级 dsh 时）：
  ```
  pnpm --config.verify-deps-before-run=false --filter @deepseek-ai/dsh deploy <dir> --prod --legacy --ignore-scripts --config.node-linker=hoisted
  python dsh-z-gui/scripts/ensure-portable-closure.py .
  ```
  必须实体布局（无 junction），否则启动报 `ERR_MODULE_NOT_FOUND`。
- **electron-builder.yml 要点**：
  - `signExecutable: false`（无证书环境跳过签名）
  - ⚠️ **绝不能设 `signAndEditExecutable: false`**——会连 rcedit 图标/元数据嵌入一起跳过，exe 退回默认 Electron 图标（历史上踩过）。
  - `nsis.include: resources/installer.nsh`：安装时检测并静默装 VC++ 2015-2022 Redistributable（随包 `resources/vc_redist.x64.exe`）。
  - nsis / portable 必须分别设 artifactName，否则同名覆盖。
- **安装路径**：`%LOCALAPPDATA%\Programs\DSH Desktop`（非管理员）；NSIS 用 LZMA 压缩（~28% 压缩率）。

### 4.3 图标
- 源素材 `resources/app-icon.png`（580×580 透明 PNG，Q 版角色）。
- 生成：ffmpeg `scale=w:h:flags=lanczos` 出多尺寸 PNG → Node 脚本打包 ICO（16/24/32/48/64/128/256，PNG 内嵌格式）→ `resources/icon.ico`；`icon.png`（512）供 dev 窗口。
- ⚠️ **不要用 PowerShell System.Drawing 函数返回值做打包**（未赋值的 `New-Object`/内联表达式会泄漏到输出流，ICO 损坏）——用 ffmpeg+Node 确定性方案。

---

## 4.4 dsh 升级流程（重要：无损同步官方 dsh）

**背景**：`deepseek-harness/` 是官方 dsh 的源码快照，官方升级时需无损同步、并保住本地定制补丁。github git 主站(443)在本环境不稳定，但 codeload/raw 可达，因此采用「**快照 + 补丁批**」方案（**不**用 git submodule）。

> **⚠️ harness 已从 git 跟踪移除（2026-09，提交 e6281e7）**：`.gitignore` 含 `/deepseek-harness/`，仓库不再承载 harness 的 7900 个文件（避免每次升级产生 6000 文件巨 diff）。`deepseek-harness/` 只是磁盘上的本地快照，**不在 git 里**。
> **当前版本**：`v0.1.2-rc.1`。
> **关键影响**：**新 clone 仓库后，必须先本地跑一次 `node scripts/update-dsh.mjs` 拉取快照，才能构建/打包**。升级 harness 同理走该脚本。

**两个脚本**（仓库根 `scripts/`）：
- `apply-dsh-patches.mjs`：幂等地把本地定制补丁应用到 `deepseek-harness/`。检测目标文件是否已含补丁效果（已应用→跳过；未应用→apply；冲突→非零退出停表）。**含 4 个补丁**：
  1. `patches/dsh/0001` 模型配置 ref 对齐 + 保存验证（`ui-settings-models`）
  2. `patches/dsh/0002` 目录选择器 `koffi.decode.string16` 修复（`directory-picker-native`，官方至今未修）
  3. `patches/dsh/0003` 设置页自定义导航图标（`ui-settings-general/SettingsRoot.tsx`）
  4. `patches/dsh/0004` credentials-local 凭据文档损坏容错降级（`credentials-local`）
- `update-dsh.mjs`：**升级入口**。下载官方 tag 的 codeload zip → Python zipfile 解压（Windows bsdtar 不能解 dot 目录）→ 覆盖 `deepseek-harness/` → 自动跑 `apply-dsh-patches`。

**升级 SOP**：
```bash
# 1) 升级 harness 到指定 tag/branch（默认=dsh-v<deepseek-harness/package.json version>，也支持显式 tag）
node scripts/update-dsh.mjs            # 或 node scripts/update-dsh.mjs dsh-v0.1.2-rc.1
# 2) 若补丁冲突导致非零退出，人工裁决后重跑
node scripts/apply-dsh-patches.mjs --check
# 3) 重新生成 dsh-runtime 闭包并重新打包（见 4.2）
pnpm --config.verify-deps-before-run=false --filter @deepseek-ai/dsh deploy <dir> --prod --legacy --ignore-scripts --config.node-linker=hoisted
python dsh-z-gui/scripts/ensure-portable-closure.py .
cd dsh-z-gui/app && npx electron-builder --win --x64
```

**新增本地定制时**：改 `deepseek-harness/` 后，把改动固化为 `patches/dsh/000N-*.patch`（diff 基准 = 官方 clean 版，路径前缀 `packages/...`），并在 `scripts/apply-dsh-patches.mjs` 的 `PATCHES` 数组增加条目。

## 5. 已知问题与已修复项（接手必读）

### 5.1 目录选择器（关键修复，勿回退）
- 症状：Windows 选工作区目录报 `win32 folder dialog worker exited before reporting a result (exit=4294930435 / 0xFFFF7003)` + crashpad `not connected`。
- 根因：worker `readUtf16` 用 `koffi.decode(addr,'str16')`——**koffi 3.1.6 的 `str16` 解码对合法 NUL 终止字符串也原生崩溃**（node 下 0xC0000005 / Electron RUN_AS_NODE 下 0xFFFF7003）。
- 修复：改用官方 API **`koffi.decode.string16(addr)`**（`str16` ≠ `string16`）。
- 涉及文件：
  - `dsh-z-gui/app/dsh-runtime/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs`
  - 同包 `lib/index.js`：spawn worker 显式 `ELECTRON_RUN_AS_NODE: "1"`（防御）
  - 官方源码同步：`deepseek-harness/packages/host/directory-picker-native/src/win32-dialog-bindings.ts` + `lib/worker.cjs` + `lib/types/win32-dialog-bindings.js`
- 官方仓库（master + npm 全部版本）**仍是原始 buggy 实现**——升级 dsh-runtime 时注意别把补丁覆盖回去。
- 已在打包产物 `DSH Desktop.exe` 上验证（真实 IShellItem+GetDisplayName 链路 PASS）。

### 5.2 网络/打包经验
- github.com git 主站常不可达（codeload/raw 可达）；electron-builder 二进制需 npmmirror 镜像。
- 沙箱会导致 electron-builder 收尾写 Windows Recent 报退出码 1（产物已生成，非关键）。
- 打包偶发 `__uninstaller.exe failed opening file`：清理 release 中间产物重试即可。

### 5.3 Git 仓库状态
- 已推送到私有仓库 `zhoubh1983/DSH-Z-Desktop`（main = beb22b9，9663 文件）。
- 排除项：`node_modules`、`release/`、`.tools/`、`*.zip`、`bak/`、`**/models/**/*.onnx`、三个独立插件目录（dsh-dafeiyu / dsh-skills-mcp-manager / dsh-whale-musume，各有 upstream）。
- 模型 onnx（90MB+22MB）如需版本化 → Git LFS。
- GitHub 连接不稳定：推送失败时重试（间歇性 `Connection was reset`）；仓库级已设 `http.postBuffer=500MB`。

---

## 6. 验证与测试方法

- 启动打包应用：加 `--remote-debugging-port=9222`，用 CDP（`/json` + WebSocket `Runtime.evaluate` / `Page.captureScreenshot`）验证 UI。
- 首次启动 onboarding 用「稍后配置」跳过 → 打开设置面板验证菜单。
- 目录选择器回归：任意需要选目录的入口（如新建工作区）。
- 技能市场全量测试参考：API（list/config/detail/install/uninstall 正反向 + 目录穿越）+ UI（菜单/面板/搜索/分类/排序/详情懒加载/安装卸载/弹窗/空状态）。
- browser 工具 `browser_snapshot` 对含 Windows 反斜杠路径文本会报 hex escape 解析 bug——含路径区域改用 API 层验证。

---

## 7. 插件开发约定（重要）

1. 改 `plugins/<name>/` 源码后，**必须同步到 `dsh-z-gui/app/builtin-plugins/<name>/` 副本**——GUI 启动 `ensureBuiltinPlugins` 按指纹比对的是 builtin 副本，只改源码不触发 profile 刷新。
2. 插件安装：用 `dsh plugin --profile web add <name>`（profile 在 `C:\Users\fate\.dsh\profiles\web\`），**不要手动拷 node_modules**（会 ERR_MODULE_NOT_FOUND）。
3. `cordis.patch.yml`：顶层数组 + `{ insert: [...] }`；Windows 用包名而非绝对路径；避免重复 loader id。
4. 客户端 UI：`window.__ModuleLoader__.load({ id, factory })` + `ctx.slots` 注入 `settings.section`；API 走 Host 侧 webServer（`/plugins/<name>/api` 子路径，避免劫持 `/plugins/<name>/client.js`）。
5. 依赖闭包：dsh-runtime node_modules 由 `@deepseek-ai/dsh-mcp-client` 等提供（向上解析）。

---

## 8. 当前状态与建议的下一步

**已完成**：GUI 骨架、7 个内置插件、技能市场完整闭环、Webhook、记忆库、桌面伴侣、浏览器控制 daemon 服务、目录选择器修复、图标更换、Windows 打包、Git 私有仓库交付。

**已知待办/可选方向**：
1. 浏览器控制扩展缺闭环（官方未发布；自研已叫停）——需重新决策。
2. ONNX 模型是否纳入版本控制（建议 Git LFS）。
3. 技能市场/记忆插件的更多测试与体验优化。
4. 跨平台（macOS/Linux）打包验证（config 已有 linux 目标但未验证）。

**最安全的下一步**：在新机器 clone 仓库 → 按第 4 节构建一次 → 用第 6 节方法验证目录选择器与技能市场 → 再进入功能迭代。

---

## 9. 常用路径速查

| 用途 | 路径 |
|---|---|
| profile | `C:\Users\fate\.dsh\profiles\web\` |
| 用户设置 | `~/.dsh/settings.yaml` |
| 技能市场源 | `~/.dsh/skills-market`（内置：`dsh-z-gui/app/skills-market`） |
| 已装技能 | `~/.dsh/skills/` |
| 打包日志 | `dsh-z-gui/app/release/build-*.log` |
| 目录选择器包 | `dsh-runtime/node_modules/@deepseek-ai/dsh-host-directory-picker-native/` |

---

## 9. 浏览器集成版（分支 `feat/browser-integration`）

> 在私有仓库开启独立分支专供浏览器集成开发（main 保持既有发行线）。本段为 MVP 现状与架构。

- 目标：像 trae 一样——GUI 内嵌一个浏览器窗格（Dock），对话 agent 按对话在其中导航/点击/输入/截图/读快照，用户实时看页面。
- 架构：`主进程(WebContentsView) ←MCP(streamable-http)→ @deepseek-ai/dsh-mcp-client → agent(mcp__browser__*)`，前端开关走 preload+IPC。
  - 拥有者：`dsh-z-gui/app/main/browser-bridge.js`（New）——持有一个 `WebContentsView` 叠加窗口右侧（宽 420，resize 同步），9 个动作原语（navigate/back/forward/reload/click/type/snapshot/screenshot/show），并当其 MCP **server**（`/mcp`，用官方 `@modelcontextprotocol/sdk` 服务端）。
  - 注入：`main/index.js` 启动时 `startBrowserBridge()`，把端点 URL 传给 `startBackend(bridgeUrl)`；`main/backend.js` spawn env 加 `DSH_BROWSER_BRIDGE_URL`，`BUILTIN_PLUGINS` 增加 `dsh-browser-control`。
  - 接入：内置插件 `dsh-browser-control`（`plugins/` + `builtin-plugins/`）server 端 `process.env.DSH_BROWSER_BRIDGE_URL` → `ctx.plugin(McpClient,{transport:'streamable-http',serverName:'browser',url,failOnStartupError:false})` → 工具 `mcp__browser__*`；`lib/client.js` 注入右上角「🌐 浏览器」开关按钮（调 `window.dshGui.browser.toggle`）。
  - preload：`dsh-z-gui/app/preload/index.js` 由只暴露 versions 扩为 `dshGui.browser.toggle`（ipcRenderer→主进程 `ipcMain.on('browser:toggle')`）。
- 关键依赖：主进程新增 `@modelcontextprotocol/sdk`（装于 `dsh-z-gui/app/node_modules`，打包自动进 asar，无需 extraResources）。
- 取舍：dsh 对话渲染未内置 data-URI 图，MVP 不在对话气泡内嵌截图；agent 的 `screenshot` 返回本地 PNG 路径 + dataUrl，用户实时看的是 Dock；「对话内嵌图片」列为 P1。
- 验证方式：起 dev Electron → 日志见 `browser bridge MCP ready: http://127.0.0.1:<port>/mcp`；`curl -X POST http://127.0.0.1:<port>/mcp`（MCP JSON-RPC initialize/tools/list/tools/call）定位工具；前端点「浏览器」按钮显隐；让 agent 调用 `mcp__browser__navigate` 等观察 Dock。
- 注意：`@modelcontextprotocol/sdk` 主进程用动态 import（main 是 CommonJS）；MCP 端点需两端同用 SDK 协议（勿改为普通 REST，dsh-mcp-client 用的是 SDK StreamableHTTPClientTransport）。

*交接日期：2026-09-04。原交接账号：zhoubh1983（GitHub）。如遇本文件未覆盖的问题，先查 `~/.dsh/` 与 `dsh-gui.log`，再查 `docs/`。*
> 已升级为三标签右侧面板（浏览器/资源管理器/文件预览，全 native WebContentsView，桥增加 /panel /fs /action /ws 路由，显示 IPC browser:showtab）。
