# DSH-Z Desktop 项目交接文档（CODEX_HANDOFF）

> 本文件供**其他账号 / 新开发者 / 新 AI 会话**接手本仓库继续开发时阅读。
> 目标：让接手者在 15 分钟内了解项目全貌、能独立构建与打包、知道关键约定与易踩坑点。

---

## 0. 新 AI 会话 5 分钟上手（先读这里）

**这是什么**：DSH Desktop —— Electron 外壳 + dsh web 后端（内置 Node 运行时闭包）+ 10 个内置插件 + 技能市场/记忆库/浏览器控制等。仓库：`zhoubh1983/DSH-Z-Desktop`（私有）。

**当前状态（2026-09-14）**：
- 活跃分支 **`dev/0.1.0`**（已推送，`main`=0.0.9 正式发行线，勿乱动）。
- dsh-runtime 闭包 **v0.1.5-rc.2**（`deepseek-harness/` 快照不在 git，新 clone 需先 `node scripts/update-dsh.mjs` 才能构建）。
- 最新会话工作见 **第 12 节**（呈现模式三栏/React 标题栏/恢复体系/设置向导/dsh-context 内置）。

**快速跑起来（开发模式）**：
```powershell
cd dsh-z-gui/app
node_modules\electron\dist\electron.exe . --remote-debugging-port=9222   # 起 GUI
# 验证：CDP http://127.0.0.1:9222/json → Runtime.evaluate；或直接看窗口
```
- profile 在 `~/.dsh/profiles/web/`，设置 `~/.dsh/gui/settings.json`，日志 `~/.dsh/logs/dsh-gui.log`。
- 首启无 profile 会弹设置向导（native 窗口）；后端连退 3 次会进恢复助手——都是正常流程。

**必读顺序**：`4.4`（dsh 升级快照+补丁）→ `11.1`（闭包重建全流程）→ `12`（最新会话）→ `7`（插件开发约定）→ `6`（验证方法）。

**四大坑速览**（详见 5.1 / 12.7）：
1. PowerShell `Set-Content -Encoding UTF8` 写 profile JSON 会带 BOM → dsh 后端解析崩溃。改 profile 一律 `[System.IO.File]::WriteAllText(path, json, UTF8Encoding($false))`。
2. 插件内 React 合成事件委托失效 → 交互用原生 `addEventListener`（见 12.3）。
3. `git add` 会静默漏掉 vendored `builtin-plugins/dsh-context/node_modules`（`**/node_modules/` 忽略）→ 必须 `git add -f`。
4. 目录选择器补丁（patch 0002 `koffi.decode.string16`）官方至今未修，升级 dsh-runtime 必被覆盖，需重新应用。

---

## 1. 项目是什么

**DSH Desktop**：基于 DeepSeek Harness（dsh）的 Windows 桌面 GUI 应用（Electron 外壳 + dsh web 后端），集成多个自研插件（技能市场、记忆知识库、Webhook 告警、桌面伴侣、浏览器控制）。

- 仓库：https://github.com/zhoubh1983/DSH-Z-Desktop.git（**私有**，活跃分支 **dev/0.1.0**；main=0.0.9 正式发行线）
- 交付形态：`dsh-gui-0.1.0-win-x64-setup.exe`（NSIS 安装器）+ `dsh-gui-0.1.0-win-x64-portable.exe`
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

### 3.2 内置插件（builtin-plugins/，共 10 个）
| 插件 | 作用 | 备注 |
|---|---|---|
| `dsh-skill-market` | 技能市场：市场地址/安装/卸载/搜索/分类/排序 UI | API 前缀必须 `/plugins/dsh-skill-market/api`（子路径），不能占根前缀 |
| `dsh-memory-plugin` | 记忆知识库（本地向量化，bge-small-zh 模型） | 模型 onnx 已从 git 排除（用 LFS 或运行时获取） |
| `dsh-webhook-plugin` | Webhook 告警（独立 HTTP :8787） | 配置持久化于 `~/.dsh/settings.yaml` 的 `dsh-webhook-plugin` |
| `dsh-whale-musume` | 桌面伴侣（动画 overlay） | `reconcile()` 渲染循环，报错会移除 DOM |
| `dsh-chrome-control` | 浏览器控制（daemon 架构） | 见 3.4 |
| `@zebbkira/dsh-skills-mcp-manager` | 技能与 MCP 管理页 | 独立系统，扫描 `~/.dsh/skills` |
| `dsh-dafeiyu` | 第三方插件 | 独立 upstream 仓库 |
| `dsh-desktop-frame` | 页面内桌面标题栏（extended/advanced 呈现模式） | React 构建产物，改源码走 `scripts/build-titlebar.mjs`；交互用原生事件（见 12.3） |
| `dsh-conversation-tools` | 对话区便捷工具（精简历史 /compact、定位工作区） | 纯 JS 零构建 |
| `dsh-context` | 上下文仪表盘（Context tab，npm dsh-context 0.52.0 内置） | 含嵌套 zod（git 需 `add -f`），升级见 12.6 |

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
> **当前版本**：`v0.1.5-rc.2`（2026-09 升级，见第 12 节；旧记录 v0.1.2-rc.1 属历史）。
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
- 已推送到私有仓库 `zhoubh1983/DSH-Z-Desktop`（活跃分支 `dev/0.1.0`，2026-09-14 同步至 `988389b`；`main`=0.0.9 正式发行线）。
- 排除项：`node_modules`（**注意 vendored 插件依赖需 `git add -f`**，见 12.6）、`release/`、`.tools/`、`*.zip`、`bak/`、`**/models/**/*.onnx`、三个独立插件目录（dsh-dafeiyu / dsh-skills-mcp-manager / dsh-whale-musume，各有 upstream）、`deepseek-harness/` 快照。
- 模型 onnx（90MB+22MB）如需版本化 → Git LFS。
- GitHub 连接不稳定：推送失败时重试（间歇性 `Connection was reset` / `SSL_ERROR_SYSCALL`）；仓库级已设 `http.postBuffer=500MB`。

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

> 本节约略（历史记录）；**最新状态见第 0 节速览与第 12 节**（2026-09-14：v0.1.5-rc.2 / dev/0.1.0 / 呈现模式 / 恢复体系 / dsh-context）。

**已完成**：GUI 骨架、10 个内置插件、技能市场完整闭环、Webhook、记忆库、桌面伴侣、浏览器控制 daemon 服务、目录选择器修复、图标更换、Windows 打包、三栏呈现模式（compatibility/extended/advanced）、页面内 React 标题栏、恢复体系（恢复助手/安全模式/恢复出厂）、设置向导、自更新流水线、dsh-context 上下文仪表盘。

**已知待办/可选方向**（详见 12.8）：
1. 恢复体系**多 profile 版**（Profile 切换 + 启动检查点回滚）。
2. 设置向导扩展（插件市场/通知/浏览器访问等官方步骤）。
3. 浏览器控制扩展缺闭环（官方未发布；自研已叫停）——需重新决策。
4. 跨平台（macOS/Linux）打包验证（config 已有目标但未验证）。

**最安全的下一步**：在新机器 clone 仓库 → 按第 4 节构建一次（先 `node scripts/update-dsh.mjs` 拉 harness 快照）→ 用第 6 节方法验证目录选择器与技能市场 → 再进入功能迭代。

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

---

## 10. 本次会话交接（2026-09：模型配置修复 + dsh 升级治理）

> 交接日期：2026-09-08。分支 `feat/browser-integration`。供后续 AI/开发者快速了解最近的模型配置修复与 dsh 升级体系。

### 10.1 模型配置页面（Models 设置页）两个 bug 及修复
DSH 的「模型配置」页实为 harness 的 `ui-settings-models` 包（前端 React + 后端 `llm-deepseek` 适配器），`dsh-runtime` 闭包就是从这个 `deepseek-harness` 源码 build 出来的，**改动会进安装包**。

Bug 1「填 key 显示绿灯但运行时 "API key is invalid"」根因是 **ref 错位**：
- 编辑器 `ProviderEditor.refFor()` 在 deepseek 整节 profile 无 `apiKeyEnv` 时，用 `deriveKeyRef('deepseek-official')` = `DEEPSEEK_OFFICIAL_API_KEY` 存 key；
- 但 deepseek 运行时 `llm-deepseek/src/index.ts` 的 `resolveAdapterOptions`/`resolveApiKey` 默认读 `DEEPSEEK_API_KEY`（profile 没写 `apiKeyEnv` 就永远用它）。
- 两者不一致 → UI 存的 key 落在运行时永远不读的 ref 上 → 会话失败。
- 绿点语义：`credentials-local` 的 `describe()` 只看该 ref 下是否有非空值（`configured`），**不校验正确性**。

修复（补丁 `patch/dsh/0001`）：
- `ProviderEditor.applyOnce` 的 guard 从 `layout === 'pi-ai'` 扩为 `(pi-ai || deepseek)`，使 deepseek 保存时也写 `apiKeyEnv`（profile 自描述，ref 对齐运行时）。
- `apply()` 保存成功后对 deepseek 调 `operations.discoverModels` 真实验证 key+baseURL；失败则卡片停留 + 红灯 + 错误信息（不回撤已存 settings/credential），成功才 `onClose(true)`。
- 后端：新增 `llm/src/discovery.ts`（共享 OpenAI-compatible `GET /models` wire 列表，401/403→`INVALID_CREDENTIAL_CODE`）+ `llm-deepseek/src/discovery.ts`（`probeDeepSeek`，无 catalog 短路）+ 注册 `registerModelDiscovery(NS, …)`。

Bug 2「再次编辑不反向加载」：
- **key 从不回显是写保护设计**（非 bug），占位显示「已配置/请输入新值」。
- baseURL 实际会从 user 层回填，只是藏在折叠的「自定义设置」`<details>` 里，用户没看到（非 bug）。

### 10.2 dsh 升级治理（快照+补丁批，harness 已移出 git）
> 详见 4.4。要点：`deepseek-harness/` **已在 git `.gitignore`（不在仓库）**，升级/接入全靠两个脚本 + patches。

- **升级**：`node scripts/update-dsh.mjs [新tag]`（codeload 下载官方 zip → **Python zipfile 解压** → 覆盖 harness → 自动跑 apply-dsh-patches）。默认 tag = `dsh-v<deepseek-harness/package.json version>`。
- **补丁**：`node scripts/apply-dsh-patches.mjs`（幂等；已应用→跳过、未应用→apply、冲突→非零退出停表）。4 个补丁在 `patches/dsh/`：
  1. `0001` 模型配置 ref+验证（10.1）
  2. `0002` 目录选择器 `koffi.decode.string16`（官方至今未修，升级必被覆盖）
  3. `0003` 设置页自定义导航图标（dafeiyu/webhook/memory/skill-market）
  4. `0004` credentials-local 凭据文档损坏容错降级
- **新 clone 必须先跑 `update-dsh.mjs` 拉 v0.1.2-rc.1 快照才能构建/打包**（harness 不在 git）。

### 10.3 本次踩坑（后续接手必看）
- `git apply` 在**无 `.git` 的目录**会「Skipped patch」并**静默 exit 0**（什么都没改）。`apply-dsh-patches.mjs` 已内置「harness 缺 `.git` 先 `git init`」守卫。若看到 "✓ applied" 但文件没变 → 先查 harness 是否是 git repo。
- Windows `bsdtar` 不能解压含 `.claude/`/`.agents/` 等**点目录**的 zip（报 `Invalid argument`），必须用 **Python `zipfile`**（`update-dsh.mjs` 已用 python 解压）。
- 补丁升级后若官方改同名文件/API（如 v0.1.1→v0.1.2 把 `api.settings.mutate` 改为 `operations.writeSettings`），补丁冲突是**预期现象**——需按新 base 重新生成补丁，而非硬改 apply 脚本。
- 新增本地定制时，把 harness 改动固化为 `patches/dsh/000N-*.patch`（diff 基准 = 官方 clean 版，路径前缀 `packages/...`），并在 `apply-dsh-patches.mjs` 的 `PATCHES` 数组加一条。

### 10.4 当前状态
- `deepseek-harness` 版本：`v0.1.2-rc.1`（含 4 补丁），**已从 git 移除跟踪**。
- 分支 `feat/browser-integration` 与远程同步（最新 `62f9122`）。

---

## 11. 本次会话交接（2026-09：dsh-runtime 闭包升级到 v0.1.2-rc.1 + 重新打包）

> 交接日期：2026-09-08。分支 `feat/browser-integration`。**重要**：此前打包产物（setup/portable）一直跑的是 **v0.1.1-rc.2** 闭包——4 个补丁（模型 ref+验证、picker string16、导航图标、credentials 容错）**此前从未真正进包**。本轮完成闭包重建并重新打包。

### 11.1 dsh-runtime 闭包重建完整流程（关键，旧 4.2 流程缺 build 步骤）
deploy 前**必须先 build harness 源码**，否则 workspace 包复制进闭包是空壳（主包无 bin、无 lib）。完整流程：

```bash
cd deepseek-harness
pnpm install --config.strictDepBuilds=false              # 装 dev 工具（tsx/tsdown/typescript）
node .tools/node-v24.20.0-win-x64/node.exe node_modules/typescript/bin/tsc -b tsconfig.host.json
node .tools/node-v24.20.0-win-x64/node.exe node_modules/tsdown/dist/run.mjs --env.DSH_BUILD_FACE host
node .tools/node-v24.20.0-win-x64/node.exe --max-old-space-size=4096 node_modules/typescript/bin/tsc -b tsconfig.client.json
node .tools/node-v24.20.0-win-x64/node.exe node_modules/tsdown/dist/run.mjs --env.DSH_BUILD_FACE client
cd apps/web && node ..\..\node_modules\vite\bin\vite.js build       # web-frontend dist
cd ../.. && pnpm --config.verify-deps-before-run=false --filter @deepseek-ai/dsh deploy <dsh-runtime> --prod --legacy --ignore-scripts --config.node-linker=hoisted
python dsh-z-gui/scripts/ensure-portable-closure.py .
# ⚠️ 闭包内残留 junction 必须实体化：遍历 dsh-runtime/node_modules 找 LinkType=Junction 的目录，
#   用 [System.IO.Directory]::Delete($path,$false) 删链接（PowerShell Remove-Item 删 junction 会失败）再 Copy-Item 实体复制
```

**铁律：全部构建步骤用项目自带 Node 24**（`.tools/node-v24.20.0-win-x64/node.exe`）。系统 node v22 的 `globSync`（experimental）会让 tsdown workspace 扫描报 `no packages/*/*/package.json declares the name @deepseek-ai/dsh-api-remotes`；系统 node v22 还缺 `createZstdDecompress` 无法起 dsh web。

### 11.2 补丁 0001 类型修复（已同步进补丁文件）
`patches/dsh/0001` 的 `llm/src/discovery.ts` 引用了 `./error.ts` 不存在的 `LlmError`（真身在 `src/index.ts`：`export class LlmError extends HarnessError`）且 `probeDeepSeek` 传了 `LlmModelDiscoveryRequest` 没有的 `signal` 字段 → **编译不过**。修复：
- `import { LlmError } from './error.ts'` → `import { HarnessError } from './error.ts'`（构造签名 `(message, code, options?)` 一致，功能等效；调用方 ProviderEditor 只读 `error.message` 不依赖 instanceof）
- 删除 `...request.signal === undefined ? {} : { signal: request.signal },`
- **补丁文件本身必须同步修复**（已在 2026-09-08 提交 dc995ee），否则下次 `update-dsh.mjs` 重打补丁即编译失败。

### 11.3 沙箱/pnpm 环境坑（本轮实测）
- `pnpm install` 在后台 job 会卡死：stdout 管道未被及时消费阻塞 pnpm + 并发 install 互相破坏 node_modules。**终极绕过**：手动建 workspace junction（`node_modules/@deepseek-ai/*` → 源码目录，Node `symlinkSync(target, path, 'junction')`）+ 从 `.pnpm`/store/`npm pack` 补齐缺失包（tsdown 可选 peer `unrun`、残缺 `shiki` 主包、rolldown binding 1.0.3→1.1.1 错版）+ 删除 `packages/*/*/node_modules` 空壳（hoisted 布局不需要本地 node_modules）。
- 打包沙箱间歇失败 `__uninstaller.exe failed opening file`（makensis macroline 91）：清理 `release` 中间产物（win-unpacked/.nsis.7z/__uninstaller/blockmap）重试即成功。
- dsh-runtime 的 `config/agent-presets` 在 v0.1.2 被官方移除（结构变化，deploy 产物为准，属正常）。

### 11.4 本轮交付
- **Git LFS**：`.gitattributes` 路由 `*.onnx`/`*.bin`；`dsh-memory-plugin/models/bge-small-zh-v1.5/onnx/` 2 个模型（90.5MB+22.9MB）入库（提交 a39bd7f / 43a4bef）。
- **dsh-runtime 升级**：闭包 v0.1.2-rc.1 + 4 补丁全入包 + web-frontend dist（提交 dc995ee）。
- **产物**：`release/dsh-gui-0.1.0-win-x64-setup.exe`（328.4MB）+ `portable.exe`（303.8MB），2026-09-08 16:29 生成。闭包内验证：版本 0.1.2-rc.1、picker `string16` ✓、models `pi-ai || deepseek` guard ✓、settings 图标 ✓、credentials 容错 ✓、0 残留 junction；`dsh-runtime/node_modules/@deepseek-ai/dsh/bin/dsh --version` 输出 `0.1.2-rc.1`。
- 推送：`feat/browser-integration` 已同步（含 3 个提交；GitHub 443 间歇断连，重试即成功）。

### 11.5 第三方插件适配：@zebbkira/dsh-skills-mcp-manager（v0.1.2 settings API）
**v0.1.2 的 `@deepseek-ai/dsh-settings` 删除了 `installSettingsSection`/`settingsNamespace` 导出**（v0.1.x UI 设置注册 API），改由全局 `SettingsProvider.register(ns, schema, options)`（返回 `SettingsScope`：`get()`/`watch()`/`update()`/`replace()`）承担。**内置第三方插件 @zebbkira/dsh-skills-mcp-manager（npm 最新 0.2.0 仍是旧 API）升级后插件树加载失败 → dsh web 后端退出 code=1**（报错：`does not provide an export named 'installSettingsSection'`）。
适配（改 `builtin-plugins/@zebbkira/dsh-skills-mcp-manager/lib/index.js`，提交 4803e14）：
- 删 `import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings"`
- `settingsNamespace("skills-mcp-manager")` → 字面量 `"skills-mcp-manager"`（其实现就是返回原字符串）
- `installSettingsSection(ctx, ns, Config, cfg, {setSource, onChange})` → `const scope = ctx.settings.register(ns, Config, {}); current = () => scope.get(); scope.watch(() => sync())`
- **必须把 `settings` 加入插件 `inject` 数组**（cordis 属性代理：未声明 inject 的服务访问 `ctx.settings` 抛「cannot get property without inject」）
- 同步 profile 副本 + **重新打包**（win-unpacked/setup/portable 的 builtin-plugins 是打包时复制的旧版，不改装包即崩）
- 冒烟验证（win-unpacked 实机）：dsh web 启动（日志 `dsh web: http://127.0.0.1:8885/?token=...`）、webhook 8787、`/chrome/status` 200 `running:true`（chrome-control daemon 正常）。最终产物 setup 328.4MB / portable 303.8MB（17:07）。

---

## 12. 本次会话交接（2026-09：0.1.5-rc.2 闭包 + 呈现模式框架 + 恢复体系 + 设置向导 + dsh-context 内置）

> 交接日期：2026-09-14。分支 **`dev/0.1.0`**（0.1.0 开发线；`main` 保持 0.0.9 正式发行线）。本段覆盖：dsh-runtime 升级到 **v0.1.5-rc.2**、三栏呈现模式、页面内 React 标题栏、恢复体系、设置向导、终端/托盘补短板、dsh-context 内置化。8 个提交已推送 `origin/dev/0.1.0`。

### 12.1 版本与分支
- dsh-runtime 闭包：**v0.1.5-rc.2**（提交 d0e3153；`dsh --version` = `0.1.5-rc.2`）。升级流程沿用 4.4/11.1（`update-dsh.mjs` + `upgrade-dsh.mjs`）。
- 分支：`dev/0.1.0`（version 0.1.0，`feat/browser-integration` 已并回/收敛，勿再往旧特性分支开发）。
- 关键提交（本次推送 8 个）：`6ca2057` React 标题栏、`420a4f9` 自更新流水线+终端回退、`a4636df` 恢复体系+设置向导+dsh-context、`df19216` zod 补提交、另含 `d0e3153`/`6e636e1`/`bf4de87`/`ed0b63a`（0.1.5 闭包/三栏框架/移除自定义浮动面板/chrome-control v0.4.0）。

### 12.2 呈现模式三栏框架（compatibility / extended / advanced）
- `main/window-chrome.js`：三种模式的 BrowserWindow 选项（extended 36px / advanced 32px，win32 `titleBarStyle:hidden`+`titleBarOverlay`，darwin `hiddenInset`+红绿灯，mica 需 Win11 22621+）。
- 设置持久化：`~/.dsh/gui/settings.json` 的 `presentationMode` / `material`（`main/settings.js`，含 UTF-8 BOM 容忍）。
- 标题栏由内置插件 `dsh-desktop-frame` 渲染（页面内 `position:fixed`），模式/材质切换需重启生效（titleBarStyle 创建后不可改）。

### 12.3 页面内 React 标题栏（重点坑）
- 源码 `app/client-src/desktop-titlebar/`（TitlebarView.tsx + index.tsx），`app/scripts/build-titlebar.mjs` 用 **esbuild** 打成 CommonJS，再包 `window.__ModuleLoader__.load({ id:'dsh-desktop-frame', factory })` 写回 `builtin-plugins/dsh-desktop-frame/lib/client.js`。改标题栏后必须 `node app/scripts/build-titlebar.mjs` 重建。
- ⚠️ **宿主内插件加载的 React 根，其合成事件委托失效**（同页 `#root` 的 React 正常、插件根的 `onClick` 完全不触发，手动 `dispatchEvent` 也不触发，但原生事件全链路正常；定位见 12.7）。**交互全部改用 ref 回调 + 原生 `addEventListener`**，状态仍由 React 管理。新增按钮照此模式写。
- 动作经 preload `window.dshGui.desktop.action(cmd)` → 主进程 `desktop:action`。

### 12.4 恢复体系（单 profile 版）
- `main/recovery.js` + `native-ui/recovery.html`（零构建 vanilla JS，preload `native.js` 暴露 `dshNative.recovery.*`）。
- **触发点**：①后端连续退出 3 次（`backend.js` 记录 `bootFailure`，`waitForReady` 快速失败）自动进入；②引导页 "Failed to load plugins" 时 `window.js` 注入「打开恢复模式」按钮（MutationObserver，调 `dshGui.desktop.action('recovery-open')`）；③托盘/操作栏「进入恢复模式」。
- 能力：**安全模式**（备份 `package.json` 的 bundles/deps 到 `.dsh-safe-backup.json`，只留内置 bundle；退出恢复）｜**插件卸载**（非内置 bundle：删 bundle 项 + 依赖 + node_modules 目录）｜**恢复出厂**（profile 移到 `web.trash-<ts>` 不删，重建全新 profile + 重置设置）｜诊断导出（复用 `diagnostics.js`）｜重启/退出。
- 判定内置：`BASE_BUNDLES` + `BUILTIN_PLUGINS`（后端导出），恢复助手内不可卸载。

### 12.5 设置向导（首次启动）
- `main/wizard.js`：`needsSetup()` = `profiles/web/package.json` 缺失 → 弹 `native-ui/wizard.html`（欢迎 → 呈现模式 → 窗口材质 → 完成）。
- 完成：`saveSettings` + `ensureBuiltinPlugins()` 建 profile → `app.relaunch()` 重启生效。跳过=退出。
- 单 profile 版不做数据目录/多 profile 切换（多 profile 后续按官方 `desktop-data-directory.ts` 的 `state.json` 定位器做）。

### 12.6 内置 dsh-context（上下文仪表盘）
- 来源：npm `dsh-context@0.52.0`（Apache-2.0），随包 vendored 到 `builtin-plugins/dsh-context/`（含嵌套 `node_modules/zod`，**自包含**）。
- 接入：`BUILTIN_PLUGINS` 加 `'dsh-context'`（`backend.js`）；`ensureBuiltinPlugins` 自动同步 profile + 写 bundle 列表。启动后任意会话出现「上下文」tab（上下文统计/Token/耗时/当前上下文构成条/趋势/浏览器）。
- ⚠️ **gitignore 陷阱**：`.gitignore` 有 `**/node_modules/`，`git add` 会**静默漏掉** vendored 的 zod——必须 `git add -f builtin-plugins/dsh-context/node_modules` 强制加入（提交 df19216）。
- 升级：替换 `builtin-plugins/dsh-context/`（lib + cordis.patch.yml + package.json + node_modules/zod）即可，指纹机制自动刷新 profile。版本兼容矩阵：官方声明支持到 dsh 0.1.5-rc.1+（0.1.5-rc.2 实测 OK）。
- 已验证：一次性 DSH_HOME + 复制真实 profile/凭据，真实会话发消息后 Context tab 图表完整渲染（331 图表元素）；与 11 个内置插件共存无报错。

### 12.7 踩坑清单（接手必看）
- **PowerShell `Set-Content -Encoding UTF8` 会写 BOM**：`dsh` 后端的 `readProfileManifest` 不认 BOM → 解析崩溃 → 后端连续退出触发恢复助手。改 profile `package.json` 一律用 `[System.IO.File]::WriteAllText(path, json, UTF8Encoding($false))`（无 BOM）。`recovery.js`/`backend.js` 读取已做 BOM 容忍（`\uFEFF` 剥离）。
- **复制整个 profile 会破坏 `.dsh-module-fallback` 符号链接**：该目录是 dsh 管理的 module proxy（schemastery 等），`Copy-Item` 复制成实体目录后 boot 报 `exists and is not a symlink or dsh-managed module proxy`——删除该目录让 dsh 自愈重建即可。
- **React 合成事件委托失效定位法**：`getEventListeners` 看根容器只有少数事件、`__reactContainer$<hash>` 相同但 onClick 不触发、手动 `dispatchEvent` 也不触发、原生监听正常 → 结论=合成委托失效，改用原生绑定（勿再深挖原因）。
- **CDP 输入会卡死**：`Input.dispatchMouseEvent` 在 drag region 或窗口拖拽状态异常后可能整页收不到事件，重启应用进程可恢复（测试时先 kill 旧实例）。
- dsh-context 需会话有**真实消息**才挂载 Context tab（空会话右侧栏为空，非故障）。

### 12.8 待办/可选
- 恢复体系**多 profile 版**（Profile 切换 + 启动检查点回滚，官方 `profile-manager.ts`/`profile-checkpoint.ts`）。
- 设置向导扩展（插件市场/通知/浏览器访问等官方步骤）。
- 目录选择器补丁（4.4 patch 0002）在升级 dsh-runtime 时仍会被覆盖，需重新应用验证。
- GitHub 443 不稳定：推送失败重试（本次即首次失败、重试成功）。
