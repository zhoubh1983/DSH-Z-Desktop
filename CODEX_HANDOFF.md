# DSH-Z Desktop 项目交接文档（CODEX_HANDOFF）

> 本文件供**其他账号 / 新开发者 / 新 AI 会话**接手本仓库继续开发时阅读。
> 目标：让接手者在 15 分钟内了解项目全貌、能独立构建与打包、知道关键约定与易踩坑点。

---

## 0. 新 AI 会话 5 分钟上手（先读这里）

**这是什么**：DSH Desktop —— Electron 外壳 + dsh web 后端（内置 Node 运行时闭包）+ 10 个内置插件 + 技能市场/记忆库/浏览器控制等。仓库：`zhoubh1983/DSH-Z-Desktop`（私有）。

**当前状态（2026-09-15）**：
- 活跃分支 **`dev/0.1.0`**（已推送，`main`=0.0.9 正式发行线，勿乱动）。
- dsh-runtime 闭包 **v0.1.5-rc.2**（`deepseek-harness/` 快照不在 git，新 clone 需先 `node scripts/update-dsh.mjs` 才能构建）。
- 最新会话工作见 **第 12 节**（呈现模式三栏/React 标题栏/恢复体系/设置向导/dsh-context 内置）；悬浮面板清理与重打包见 **12.9**。
- 打包产物（2026-09-15）：`release/dsh-gui-0.1.0-win-x64-setup.exe`（327.9MB）+ `portable.exe`（303.4MB）。

**快速跑起来（开发模式）**：
```powershell
cd dsh-z-gui/app
node_modules\electron\dist\electron.exe . --remote-debugging-port=9222   # 起 GUI
# 验证：CDP http://127.0.0.1:9222/json → Runtime.evaluate；或直接看窗口
```
- profile 在 `~/.dsh/profiles/web/`，设置 `~/.dsh/gui/settings.json`，日志 `~/.dsh/logs/dsh-gui.log`。
- 首启无 profile 会弹设置向导（native 窗口）；后端连退 3 次会进恢复助手——都是正常流程。

**必读顺序**：`4.4`（dsh 升级快照+补丁）→ `11.1`（闭包重建全流程）→ `12`（最新会话）→ `7`（插件开发约定）→ `6`（验证方法）。

**四大坑速览**（详见 5.1 / 12.7 / 12.9）：
1. PowerShell `Set-Content -Encoding UTF8` 写 profile JSON 会带 BOM → dsh 后端解析崩溃。改 profile 一律 `[System.IO.File]::WriteAllText(path, json, UTF8Encoding($false))`。
2. 插件内 React 合成事件委托失效 → 交互用原生 `addEventListener`（见 12.3）。
3. `git add` 会静默漏掉 vendored `builtin-plugins/dsh-context/node_modules`（`**/node_modules/` 忽略）→ 必须 `git add -f`。
4. 目录选择器补丁（patch 0002 `koffi.decode.string16`）官方至今未修，升级 dsh-runtime 必被覆盖，需重新应用。
5. **从内置列表移除插件后，旧 profile 副本不会自动消失**（会继续注入旧 UI，如 `🧭 面板` 悬浮按钮）。`ensureBuiltinPlugins` 已内置残留清理（按 `.dsh-builtin-fingerprint` 标记），但改 `BUILTIN_PLUGINS` 时记得同步清本机 profile 或重启应用触发。

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
- 当前内置 **v0.4.0 = 无 daemon 架构**：不再 spawn Rust `chrome-daemon`（旧 0.3.2 daemon 及端口 37086 已废弃）。路由直接挂在 dsh web 的 `webServer` 上：`/chrome/mcp`（MCP Streamable HTTP）、`/chrome/ws`（扩展 WebSocket）、`/chrome/status`（liveness）。
- 闭环依赖 **内置 MV3 扩展**（`builtin-plugins/dsh-chrome-control/extension/`，`manifest_version:3`，service worker 连 `ws://<server>/chrome/ws`）——**扩展必须由用户手动加载**（chrome://extensions → 开发者模式 → 加载已解压的扩展程序 → 选该 `extension/` 目录；popup 里设 DSH server 地址 = 当前 dsh web 地址，并打开 "Allow agent control" 总闸）。未加载扩展时 `/chrome/status` 返回 503、所有 `mcp__chrome__*` 工具报 "No Chrome extension is attached"——**正常现象，非故障**。
- **使用前提（接手者按序核对，四条缺一不可）**：① 用户**自己打开 Chrome 并保持运行**（agent/脚本 spawn 的 Chrome 会被 Windows Job 对象回收杀掉，正确姿势是"用户开着 Chrome + 扩展已连接"）；② **手动加载扩展**——chrome-control **不会自动给浏览器装扩展**：Chrome 对"加载未打包扩展"没有任何静默安装 API，只能由浏览器所有者本人在 chrome://extensions 里操作，装完是持久生效的；③ 扩展 popup 设 DSH server 地址 = dsh web 地址（默认 `http://127.0.0.1:3080`，因 dsh web 端口已固定，**配一次即可**）；④ popup 打开 "Allow agent control" 总闸。四条就绪后 `/chrome/status` 返回 `extensionConnected:true`，工具才可用。
- dsh web 端口**已固定**（2026-09-15 实现）：默认绑定 **3080**（与扩展默认地址一致）；首次发现被占用时自动切换到空闲端口，并持久化到 `~/.dsh/gui/settings.json` 的 `dshPort`，之后每次启动都绑定该固定端口（再次被占才再切换）。扩展 server 地址配一次即可，无需每次启动改。
- 协议/工具集：扩展经 CDP 驱动用户真实 Chrome（登录态/标签/Cookie 全在），25 个工具（navigate/snapshot/click/fill/…/get_text）；Agent 用 shell 命令拉起 Chrome 会被子进程回收（Windows Job 内含）杀进程，**正确用法是用户自己开着 Chrome + 扩展已连接**。
- 与 harness 内置 `browser_*` 工具（独立 WebKit 面板、无登录态）区分；skill `chrome` 教 agent 何时用哪个。

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

### 5.4 pnpm 弹窗修复（dsh-runtime 内，重建必被覆盖）
- 症状：Windows 上 `dsh plugin`（装/卸/更新插件）时 **cmd 窗口一闪而过**。
- 根因：`dsh-runtime/lib/plugin-Ddi42qoW.js` 的 `spawnSync("pnpm", …, { shell: process.platform === "win32" })` **未设 `windowsHide`**。dsh web 父进程本身无控制台，Windows 为 `cmd.exe /c` 分配新控制台窗口 → 一闪。
- 修复：给该 `spawnSync` 补 `windowsHide: true`（2026-09-15 已改，重新打包后对新安装生效）。
- ⚠️ **该文件是 dsh-runtime 构建产物，升级/重建 dsh-runtime（见 4.4 / 11.1 流程）必然覆盖此改动，需重新应用**——与 5.1 目录选择器补丁同理，勿在后续重建后忽略。
- 对话期间 AI 调用的工具子进程（bash/pwsh、ripgrep、子代理 CLI、MCP 服务器等）均已带 `windowsHide`，不会弹窗；此弹窗仅插件管理路径触发。

### 5.3 Git 仓库状态
- 已推送到私有仓库 `zhoubh1983/DSH-Z-Desktop`（活跃分支 `dev/0.1.0`，2026-09-15 同步至 `77e54af`；`main`=0.0.9 正式发行线）。
- 排除项：`node_modules`（**注意 vendored 插件依赖需 `git add -f`**，见 12.6）、`release/`、`.tools/`、`*.zip`、`bak/`、`**/models/**/*.onnx`、三个独立插件目录（dsh-dafeiyu / dsh-skills-mcp-manager / dsh-whale-musume，各有 upstream）、`deepseek-harness/` 快照。
- 模型 onnx（90MB+22MB）如需版本化 → Git LFS。
- GitHub 连接不稳定：推送失败时重试（间歇性 `Connection was reset` / `SSL_ERROR_SYSCALL`）；仓库级已设 `http.postBuffer=500MB`。

### 5.5 dev/打包版共享 `~/.dsh` 的 junction 冲突（EPERM 启动失败）
- 症状：**开发版（`npm start`）或打包版在另一端启动过之后，dsh 后端连续退出 code=1**，日志报 `EPERM: unlink 'C:\Users\fate\.dsh\profiles\node_modules\@deepseek-ai\dsh'`。
- 根因：`dsh-app-boot` 把各安装的依赖闭包镜像到共享 `~/.dsh/profiles/node_modules`（Windows 下用 **junction**）。切换 dev/打包版后，残留 junction 指向另一套 runtime；下次 boot 的 heal（`ensureSymlink`）想用 `unlinkSync` 替换它——**Node 的 `unlinkSync` 删不掉 Windows 目录 junction（EPERM）**，于是 boot 崩溃。
- 判定：`Get-ChildItem "$env:USERPROFILE\.dsh\profiles\node_modules" -Force -Recurse | Where-Object { (Get-Item $_.FullName -Force).LinkType -eq 'Junction' }` 有输出，且 Target 指向非当前 runtime。注意 `@deepseek-ai\dsh` 是**嵌套** junction，须 `-Recurse`。
- 一键清理：**`dsh-z-gui/scripts/clean-profiles-junctions.ps1`**（先 `-DryRun` 预览，再实删；只删链接本身，不进入目标目录）。清理后任一端下次启动会按自身 runtime 自动重建，自愈。
  ```powershell
  powershell -ExecutionPolicy Bypass -File dsh-z-gui/scripts/clean-profiles-junctions.ps1 -DryRun
  powershell -ExecutionPolicy Bypass -File dsh-z-gui/scripts/clean-profiles-junctions.ps1
  ```
- 与 11.1 的 `rewrite-junctions.ps1` 分工：后者是**构建期**迁移 dsh-runtime 目录时重写 junction 目标；本脚本是**运行期**清理共享 profile 目录的残留 junction，两者场景不同。
- 避免反复踩：开发与打包共用同一 `~/.dsh` 时，切换运行端后如遇启动失败先跑本脚本。

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
- **关窗/退出期 console.* 抛 EPIPE 崩溃主进程**：启动应用的终端/脚本关闭后 stdout 管道断裂，任何 `console.log` 都会以 `Uncaught Exception: EPIPE: broken pipe` 崩溃（实测触发点 window.js close 处理器、backend.js 后端退出日志）。修复：主进程 `index.js` 加 `process.on('uncaughtException')` 忽略 EPIPE；**关键回调内**（如后端退出后要执行重启逻辑的 handler）必须**本地 try/catch 包住 console 调用**——uncaughtException 处理器会丢弃抛出点之后的代码，本地兜底才能保住后续逻辑（safeLog 模式见 window.js/backend.js）。
- dsh-context 需会话有**真实消息**才挂载 Context tab（空会话右侧栏为空，非故障）。

### 12.8 待办/可选
- 恢复体系**多 profile 版**（Profile 切换 + 启动检查点回滚，官方 `profile-manager.ts`/`profile-checkpoint.ts`）。
- 设置向导扩展（插件市场/通知/浏览器访问等官方步骤）。
- 目录选择器补丁（4.4 patch 0002）在升级 dsh-runtime 时仍会被覆盖，需重新应用验证。
- GitHub 443 不稳定：推送失败重试（本次即首次失败、重试成功）。

### 12.9 悬浮面板清理与重打包（2026-09-15）
- **现象**：打包版页面右上出现 `🧭 面板` 悬浮按钮（`id="dbc-toggle-bar"`，z-index 999999）。
- **根因**：`dsh-browser-control` 插件曾在 `BUILTIN_PLUGINS`（旧版同步过 profile），bf4de87 从源码/列表移除后，**profile 的 node_modules 副本与 bundle 项未清**，其 client.js 仍注入悬浮按钮。
- **修复**（提交 `77e54af`）：`ensureBuiltinPlugins` 新增第 2.5 步——扫描 profile bundles，凡带 `.dsh-builtin-fingerprint` 标记但不在当前 `BASE_BUNDLES+BUILTIN_PLUGINS` 的旧插件，自动从 bundle 列表/依赖/node_modules 移除（覆盖未来升级场景）。本机 profile 重启即清。
- **保留**：鲸鱼娘看板娘（dsh-whale-musume，桌面伴侣）是有意保留的悬浮 overlay，勿误删。
- **重打包**：`release/` 2026-09-15 重新生成（setup 327.9MB / portable 303.4MB），验证 `dbc-toggle-bar` 消失、标题栏/看板娘/dsh-context 正常。

### 12.10 右侧内嵌浏览器（webview 方案，2026-09-16）
- **方案**：右侧面板用 Electron `<webview>` 标签（非旧 WebContentsView+MCP 方案）。`main/window.js` webPreferences 加 `webviewTag: true`；`main/browser-bridge.js` 起本地 REST 桥（仅 127.0.0.1，动态端口），实时从 `webContents.getAllWebContents()` 找 `getType()==='webview'` 的 guest 驱动导航/后退/前进/刷新/截图。
- **桥端点**：`GET /status|/url`、`POST /navigate|/back|/forward|/reload|/screenshot`（非法 URL/file:// 拒绝 400，未知端点 404，webview 未开 409）。
- **插件**：`dsh-embedded-browser`（host 侧注册 `webview_navigate/url/back/forward/reload/screenshot` 6 工具，桥地址经 `DSH_BROWSER_BRIDGE_URL` env 注入；client 侧 `sidebarRightTabs.register` 注入右侧「浏览器」tab + 地址栏 UI，首次导航前 webview 不挂载——占位提示）。
- **两个截图坑（模型平台行为，非本地代码）**：
  1. 工具结果回 **data URL** → 平台当视觉输入解析失败报 `UnknownVizError`。
  2. 工具结果回 **含 `*.png` 的完整路径** → 平台仍识别为图片引用，照样 `UnknownVizError`（`webview_url`/`navigate` 纯文本正常，唯截图失败，即此因）。
  - **最终格式**：`已截图保存（W×H），文件 <去扩展名文件名>，位于 <目录>`——不含任何图片扩展名字样即可。`/screenshot` 端点仍把 PNG 存 `~/.dsh/gui/screenshots/` 并回 path（供人找文件），只是工具透出给模型的文案去掉 `.png`。
- **Agent 端到端验证**：`webview_navigate` 打开百度 → `webview_screenshot` 返回「已截图保存（713×872）…」，轨迹无 UnknownVizError。桥全部端点 + 非法输入健壮性回归通过。
- 其余坑：agent 用内置 `read_image` 读本地 PNG 报 `Unable to persist attachment`（harness 附件持久化限制，与 webview 无关，未修）。

### 12.11 关窗 EPIPE 崩溃修复 + 桌面伴侣最小化调整（2026-09-16）

**1) EPIPE 崩溃（用户上报，已修复验证）**
- **现象**：关闭应用时主进程弹 `Uncaught Exception: Error: EPIPE: broken pipe`（`console.log` 写已断 stdout 管道同步抛出），崩溃点 `main/window.js:135` close 处理器。
- **根因**：从终端/脚本启动应用后关闭该终端，stdout 管道断裂；之后任何 `console.*` 写 stdout 都同步抛 EPIPE。
- **修复（三层）**：
  1. `main/index.js` 第 21-28 行（`app.setPath('userData', ...)` 之后）加全局兜底：`process.on('uncaughtException', (e) => { if (e && e.code === 'EPIPE') return; throw e })`。
  2. **关键**：Node 语义下 `uncaughtException` 处理器存在时进程不崩，但**会跳过抛出点之后的代码**。`main/backend.js` 后端退出回调（`child.on('exit')`）里有 `child=null` + 自动重启逻辑，若不用本地 try/catch 包住其 `console.*`，重启逻辑会被跳过。→ 新增 `safeLog(fn, ...args)`（内部 try/catch），替换 3 处退出敏感 console：`forward` 的 `console.log(line)`、`child.on('exit')` 退出/重启/失败日志、`child.on('error')`。
  3. `main/window.js` 同样加 `safeLog`，替换 `render-process-gone` / `unresponsive` / `close` 3 处 console（`close` 即崩溃点）。
- **验证（忠实复现）**：① 断 stdout 管道 + 外部 WM_CLOSE → 无 `Uncaught Exception`；② 断管道 + 强杀后端进程 → 无崩溃且后端**自动重启成功**（新 PID 接管 3080），证明本地 safeLog 保住了重启逻辑。
- **注意**：仅靠全局兜底不够——退出回调里抛点之后的逻辑会被跳过，必须本地 catch。

**2) 桌面伴侣（鲸鱼娘）最小化调整**
- **需求**：最小化形态在当前基础上再缩小 50%（64→32px），且启动默认即最小化。随后应要求放大 25%（32→40px），最终调整为右下角显示 60px。
- **改动**（`builtin-plugins/dsh-whale-musume/`）：
  - `assets/dsh-whale-moe.js`：`readMode()` 无存储/非法值时默认返回 `"mini"`（3 处 float→mini）；mini 形态尺寸 `mw/mh` 64→32→40→60。
  - `assets/dsh-whale-moe.css`：`[data-dsh-whale-dense]` 规则 `frame 64px !important` → `60px !important`（否则 root 缩放但 frame 仍被 CSS 钉死）。
  - `lib/client.js`：资源路由带 `max-age=3600`，boot fetch 需加版本号 `?v=` 击穿缓存（当前 `20260916-5`），否则改动不即时生效。
- **验证**：CDP（9222）确认 `mode=mini`、root/frame 实际渲染 60×60、位于右下角。
- **后续增强（同日，用户报「无法拖拽、无法设置大小」）**：mini 形态补上拖拽 + 可调大小。
  - `assets/dsh-whale-moe.js`：
    - 新增大小档位 `SIZE_STEPS=[48,60,80,100,120]` + `readSize()`（无存储默认 60，合法域 32–200）+ `nextSize()`（循环下一档并持久化 `whale-moe:size`）；mini/float 共用。
    - `pointerdown` 拖拽条件放宽为 `float || mini`（原仅 float），拖拽结束时照旧写 `floatX/floatY`；`resolveLayout` mini 分支改用 `readSize()` 并支持 saved 位置 + `dragState` 实时位置（与 float 分支同构，clamp 到视口）。
    - 右键菜单新增「调整大小（当前px → 下一档）」（调 `nextSize()+reconcile`）与「回到原位」（清 `floatX/floatY` 回默认右下角）。
  - `assets/dsh-whale-moe.css`：删除 dense 规则对 frame 的 `60px !important` 钉死（改由 JS inline 控制），dense 仅保留隐藏气泡/偏好面板。
  - **验证（CDP 9222 合成指针事件）**：mini 下 pointerdown→5 步 move(+120,+80)→up，位置随动且 `floatX/floatY` 写入（右缘 clamp 生效：1266 视口、100px 时 1218→1158）；随后模拟点击触发 reconcile 循环，位置保持不 snap 回角落；右键「调整大小」60→80→100 持久化 `whale-moe:size`；「回到原位」清空 floatX/floatY 回到右下角 (vw-mw-14, vh-mh-14)。

### 12.12 全功能测试：遮挡窗口截图挂起与超时保护（2026-09-16）

**现象**：webview 挂载后桥 `/screenshot` 无限挂起（原始 `capturePage()` 不 resolve），桥请求超时。
**根因（Electron Windows 已知行为）**：**主窗口被其他窗口完全遮挡（occluded）时 `webContents.capturePage()` 挂起**。判定辅助：遮挡时页面 `document.visibilityState==='hidden'` 且 `hasFocus` 可为 true；`IsWindowVisible` 仍为 true（非最小化）。最小化（`visibilityState=hidden`）反而**不**挂起——仅「被覆盖」触发。
- 排查过程留档：外部 9222 CDP 对 webview `Page.captureScreenshot` **成功**（渲染层正常）；`webContents.debugger.attach('1.3')` + `Page.captureScreenshot` 对 **webview guest 挂起（无效路径，已删）**；`SetForegroundWindow`/置顶/AttachThreadInput 均无法解除 occluded；**最小化→恢复（ShowWindow 6→9）可强制恢复 visible**（测试恢复手段）。
- **修复**（`main/browser-bridge.js` `/screenshot`）：`capturePage()` 包 `Promise.race` 15s 超时，超时返回 500 + 明确错误「截图超时：DSH 窗口被其他窗口遮挡时无法截取内嵌浏览器画面，请将 DSH 窗口置于前台后重试」，不再无限挂死。宽高改从 PNG 头（IHDR，字节 16-19 宽 / 20-23 高，大端）解析。
- **回归结果**：`/status` `/url` `/navigate` `/back` `/forward` `/reload` `/screenshot` 全通（截图 713×872）；非法 URL（含 `ftp://`、`file://`）400、未知端点 404、webview 未开 409。Agent 端到端链路（工具→桥）不变。

### 12.13 智能体命令窗口"一闪而过" + 精简历史 scope 报错（2026-09-17）
**A. 命令子进程弹出 cmd/powershell 窗口闪一下（CREATE_NO_WINDOW 补丁）**
- 根因：智能体每条命令都是新起的子进程（pwsh/cmd/py/pnpm…），后端走原生 Win32 `CreateProcess`（`@deepseek-ai/dsh-win32-process`），三处创建点（`spawnPipedProcess` / `spawnInheritedJobProcess` / `spawnCurrentTokenJobProcess`）的 `dwCreationFlags` 均未带 `CREATE_NO_WINDOW`(0x08000000)，只配了 `STARTF_USESTDHANDLES`。对控制台子系统的程序，Windows 会新建控制台窗口，进程秒退 → 窗口一闪而过。
- 修复：`dsh-runtime/node_modules/@deepseek-ai/dsh-win32-process/lib/index.js` 顶部加常量 `CREATE_NO_WINDOW = 0x08000000`，并合入三处创建标志（0→`CREATE_NO_WINDOW`、4→`|4`、1028→`|1028`）。
- ⚠️ **dsh-win32-process 是 dsh-runtime 内置依赖，升级/重建 dsh-runtime（4.4 / 11.1）必覆盖此补丁，需重新应用**（与 5.1 / 5.4 同理）。
- 修正 5.4 的旧结论：此前记录"工具子进程均已带 windowsHide"不完整——Node `spawn` 路径是带了的，但 harness 的原生 `CreateProcess` 路径（dsh-subprocess-local → dsh-win32-process）缺隐藏标志。

**B. 「精简历史」按钮报 "conversation.send requires a session scope"**
- 根因：`builtin-plugins/dsh-conversation-tools/lib/client.js` 的 `compactHistory` 用插件根 ctx 的 `conversation.send('/compact')`；根 ctx 无会话标签，`conversation.scopeId()` 抛错。
- 修复：点击时经 `ctx.get('sessions').scope(currentId).conversation.send('/compact')`——`currentId = sessions.list.getSnapshot().current`（当前激活会话）；无会话/不可用则提示"当前会话不可用，可直接输入 /compact"。lib 变更随内置插件指纹同步进 profile。

### 12.14 内嵌浏览器移除"手动输网址点火" + 能力边界澄清（2026-09-17）
- 能力边界（再确认）：内嵌浏览器工具（`webview_navigate/url/back/forward/reload/screenshot`）只覆盖「URL 输入 + 导航/刷新/截图」，**不支持页内点击/表单输入/滚动/读取 DOM/执行 JS**（桥仅 6 端点，见 12.10）。
- "点火"限制：原 `builtin-plugins/dsh-embedded-browser/lib/client.js` 的 `EmbeddedBrowser` 用 `started` 状态门控 webview——只有手动输过网址才创建 `<webview>`（guest 不存在时桥 `findWebview()` 为 null，Agent 一律 409）。
- 修复：webview **常驻**（默认 `src="about:blank"`，React 里 `urlInput || 'about:blank'`），标签页一挂载 guest 即存在，Agent 可直接 `webview_navigate`，无需用户先输网址；引导提示改为覆盖层，仅在未导航真实 http(s) 页面时显示。包装层需 `display:flex` 让 webview 撑满。
- 注意：仍要求右侧「浏览器」标签页至少打开过一次（webview 在该槽渲染后才存在）；截图在面板可见时进行（隐藏时 capturePage 受 12.12 超时保护）。
- 追加修复：地址栏输入与加载地址**分离成受控输入**（`typed`/`target` 两个 state）——原实现 webview `src` 直接绑输入框，每次敲键 React 重设 `src` 导致 webview 逐键跳转、用户无法正常输入 URL；现仅回车/点「打开」时 `navigate()` 更新 `target`，`did-navigate` 再回填输入框。
