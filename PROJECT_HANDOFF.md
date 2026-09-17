# DSH Desktop 项目交接文档（新会话快速接管用）

> 生成日期：2026-09-16。本文档是**新 AI 会话的入口**，先读它建立现状，再按需深入
> [CODEX_HANDOFF.md](./CODEX_HANDOFF.md)（项目全貌、构建打包、dsh 升级补丁、历史踩坑）。
> 目标：新会话在 5 分钟内知道「项目是什么、当前在哪、改了什么、下一步做什么」。

---

## 0. 一分钟上手

**这是什么**：DSH Desktop —— Electron 外壳 + dsh web 后端（内置 Node 运行时闭包）+ 10 个内置插件 + 技能市场 / 记忆库 / 内嵌浏览器 / 桌面伴侣。私有仓库 `zhoubh1983/DSH-Z-Desktop`。

**当前基线（2026-09-16）**：
- 分支 **`dev/0.1.0`**，HEAD=`3cab1eb`（`main`=0.0.9 正式发行线，勿乱动）。
- dsh-runtime 闭包 **v0.1.5-rc.2**（`deepseek-harness/` 快照不在 git，新 clone 先跑 `node scripts/update-dsh.mjs`）。
- 打包产物仍为 2026-09-15 的 `release/dsh-gui-0.1.0-win-x64-setup.exe`（327.9MB）——**不含** 9-16 的 webview / EPIPE / dafeiyu 改动。

**快速跑起来（开发模式）**：
```powershell
cd dsh-z-gui/app
node_modules\electron\dist\electron.exe . --remote-debugging-port=9222
```
- 后端端口 **3080**（固定，被占自动切空闲端口并持久化 `~/.dsh/gui/settings.json` 的 `dshPort`）。
- profile `~/.dsh/profiles/web/`、用户设置 `~/.dsh/gui/settings.json`、日志 `~/.dsh/logs/dsh-gui.log`。
- 首启无 profile 弹设置向导；后端连退 3 次进恢复助手——都是正常流程。
- 启动后等 60s+ 后端初始化（先加载页 spinner，再进 `http://127.0.0.1:3080/`）。

**四大坑速览**（详见 CODEX_HANDOFF 5.1/12.7/12.9）：
1. PowerShell `Set-Content -Encoding UTF8` 写 profile JSON 带 BOM → dsh 崩溃。一律 `[System.IO.File]::WriteAllText(path, json, UTF8Encoding($false))`。
2. 插件内 React 合成事件委托失效 → 交互用原生 `addEventListener`。
3. `git add` 静默漏掉 vendored `dsh-context/node_modules` → 需 `git add -f`。
4. dev/打包版切换后启动若 EPERM 崩 → 先跑 `dsh-z-gui/scripts/clean-profiles-junctions.ps1`。

---

## 1. 当前 git 状态（重点：大量工作未提交）

分支 `dev/0.1.0`，HEAD=`3cab1eb docs: 交接文档补充 12.9`。工作区有 **18 个已改文件 + 3 个未跟踪项**：

| 文件 | 内容 | 状态 |
|---|---|---|
| `builtin-plugins/dsh-dafeiyu/src/index.js`、`lib/client.js`、`runtime/helper.py`、`runtime/layout_store.py`、`runtime/tests/test_layout_store.py` | **角色大小最小值 0.55→0.4**（7 处约束链同步） | 未提交 |
| `builtin-plugins/dsh-conversation-tools/lib/client.js`、`package.json` | 对话区去掉「定位工作区文件夹」按钮，改为左侧工作区分组行**右键菜单**（资源管理器中打开 / 复制路径） | 未提交 |
| `builtin-plugins/dsh-memory-plugin/lib/index.js` | `knowledge_search`/`memory_search` 工具参数补 `type:"object"`（DeepSeek API 校验，裸 object 会报错） | 未提交 |
| `dsh-runtime/lib/plugin-Ddi42qoW.js` | pnpm spawn `windowsHide:true`（**重建 dsh-runtime 必被覆盖，需重打**） | 未提交 |
| `main/backend.js`、`window.js`、`index.js`、`tray.js`、`settings.js`、`wizard.js` | EPIPE 崩溃修复（safeLog 模式）+ webview 相关接线 + 其他 | 未提交 |
| `electron-builder.yml`、`scripts/after-pack.js` | native-ui/`**/*`、app-icon.png 入包；after-pack 清理 debug.log | 未提交 |
| `CODEX_HANDOFF.md` | 已追加 12.10/12.11/12.12（未提交） | 未提交 |
| `builtin-plugins/dsh-embedded-browser/`（4 文件）、`main/browser-bridge.js` | **右侧内嵌浏览器（webview 方案）** | **未跟踪** |
| `scripts/clean-profiles-junctions.ps1` | junction 清理脚本 | **未跟踪** |

**下一手必做**：确认这些改动后统一提交推送（GitHub 443 不稳定，失败重试）。

---

## 2. 最近工作（2026-09-16，均未打包）

### 2.1 右侧内嵌浏览器（webview 方案，新）
- `main/browser-bridge.js`：本地 REST 桥（仅 127.0.0.1，动态端口），找 `getType()==='webview'` 的 guest 驱动导航。端点：`GET /status|/url`、`POST /navigate|/back|/forward|/reload|/screenshot`；非法 URL/file:// 400、未知端点 404、webview 未开 409。
- 插件 `dsh-embedded-browser`（host 工具 `webview_navigate/url/back/forward/reload/screenshot`；client 注入右侧「浏览器」tab）。
- **截图坑（模型平台行为，勿再踩）**：工具结果回 data URL 或含 `*.png` 的路径 → `UnknownVizError`。最终格式必须为 `已截图保存（W×H），文件 <去扩展名文件名>，位于 <目录>`。
- **遮挡挂起**：主窗口被完全遮挡时 `capturePage()` 永不 resolve → 已加 15s 超时返回 500，提示「请将 DSH 窗口置于前台后重试」。

### 2.2 EPIPE 崩溃修复
- 现象：关闭应用弹 `Uncaught Exception: EPIPE: broken pipe`（stdout 管道断裂后 `console.*` 同步抛）。
- 修复三层：`main/index.js` 全局 `uncaughtException` 忽略 EPIPE；`backend.js`/`window.js` 退出敏感回调内用 `safeLog` 本地 try/catch（仅靠全局兜底会跳过抛出点后的重启逻辑）。

### 2.3 鲸鱼娘桌宠（dsh-whale-musume）——已整体回退
- 曾加拖拽/可调大小/最小化（记录在 CODEX_HANDOFF 12.11），**用户要求「恢复到最初的样子」→ `git checkout HEAD` 回退全部 3 个文件**。现状=HEAD 原版：float 形态+悬浮齿轮、右键菜单 8 项（无调整大小）、mini 形态隐藏齿轮。
- ⚠️ CODEX_HANDOFF 12.11 第 2 节内容已过时，改时以当前代码为准。

### 2.4 大肥鱼桌宠（dsh-dafeiyu）角色大小
- 「角色大小」最小值 55%→**40%**。前端滑块 `min:0.4`，schema `min(0.4)`，后端/helper/layout_store 全部 clamp `min(1.4,max(0.4,...))`，测试断言 `0.1→0.4`。
- **再改此值必须同步 7 处**（schema、onSettingsChange、client.js 滑块、helper.py×2、layout_store.py、test_layout_store.py），否则前端能滑但后端拒绝。

---

## 3. 验证方法（本会话实测有效）

- **CDP 验证 UI**：dev 实例加 `--remote-debugging-port=9222`，`http://127.0.0.1:9222/json` 拿 target，`Runtime.evaluate` 执行 JS；`Page.captureScreenshot` 截图。
- ⚠️ **PowerShell 5.1 剥命令行内嵌引号** → 表达式一律写进 `.mjs` 文件再 `Runtime.evaluate`（本会话用 `cdp-eval.mjs eval-file <file>` 模式，用完即删）。
- 长异步 eval（循环+sleep）会挂后台数分钟 → 用「触发后立即返回 + 分步轮询」。
- 会话惯例：临时验证脚本用完删除，不留仓库。

---

## 4. 建议下一步

1. **提交推送未提交改动**（第 1 节全部），补一个涵盖 webview/EPIPE/dafeiyu/conversation-tools 的提交。
2. 更新 CODEX_HANDOFF.md：12.11 鲸鱼娘部分标注已回退；补 dafeiyu scale 0.4 记录；12 节状态同步。
3. **重新打包**（`cd dsh-z-gui/app && npx electron-builder --win --x64`，先设 `ELECTRON_BUILDER_BINARIES_MIRROR`）让 setup/portable 含 9-16 改动。
4. 回归：webview 端到端（Agent 调 `webview_navigate`→`webview_screenshot`）、dafeiyu 滑块 40%、桌宠浮动静默、EPIPE 关窗不崩。

---

## 5. 深度资料索引（CODEX_HANDOFF.md）

| 话题 | 章节 |
|---|---|
| 项目全貌/目录/关键子系统 | §1–§3 |
| 构建打包/dsh-runtime 闭包重建 | §4 / §11.1 |
| dsh 升级流程（快照+补丁批） | §4.4 |
| 目录选择器补丁 / pnpm 弹窗修复 | §5.1 / §5.4 |
| junction 冲突 EPERM | §5.5 |
| 呈现模式 / React 标题栏 / 恢复体系 / 设置向导 / dsh-context | §12 |
| 浏览器控制 chrome-control v0.4.0 | §3.4 |
