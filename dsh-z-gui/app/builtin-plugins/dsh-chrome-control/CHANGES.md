# dsh-chrome-control 修复变更摘要

> 范围：浏览器扩展（`extension/`）与技能文档（`skills/chrome/SKILL.md`）
> 版本：0.4.0（代码有实质变更，建议后续 bump 补丁版本号）
> 时间：2026-09-10

## 背景

对浏览器扩展做端到端功能实测（真实 Chrome + 百度搜索场景 + 本地可控测试页），过程中发现并修复了 6 处缺陷。修复前扩展「能加载但不可用」：WebSocket 连不上（1006）、按键崩溃、输入框填不进现代页面、对话框死锁整个工具链。

## 修复项

### 1. WebSocket 连接失败（1006）— `extension/background.js` `wsUrl()`

- **症状**：扩展始终连不上 `/chrome/ws`，服务端 `extensionConnected` 恒为 `false`
- **根因**：`serverUrl` 带 token 查询参数（`http://127.0.0.1:3080/?token=...`）时，`clean` 保留了尾部斜杠，拼出 **`ws://127.0.0.1:3080//chrome/ws`**（双斜杠），路径解析错误导致连接异常关闭（code 1006）
- **修复**：对 `clean` 再次执行 `replace(/\/+$/, '')`，消除双斜杠

### 2. 按键事件崩溃 — `sendKeysTool()` modifiers 掩码

- **症状**：`send_keys Enter` 报 `Failed to deserialize params.modifiers - int32 value expected`
- **根因**：CDP `Input.dispatchKeyEvent` 的 `modifiers` 要求 **int32 位掩码**（Alt=1/Ctrl=2/Meta=4/Shift=8），代码却传了字符串数组
- **修复**：新增 `MOD_MASK` 映射，`mods` 数组转换为 `modMask` 后传入；修饰键按下/释放也带上掩码

### 3. 现代输入框填不进内容 — `fillTool()` 改 trusted 输入

- **症状**：`fill` 返回 `verified:true` 但页面不响应（百度 AI 融合搜索框 `#chat-textarea` 尤其明显），搜索触发时用的是旧词
- **根因**：JS setter 写入属于**非 trusted 输入**，React/Vue/AI 融合输入框的受控组件不认可
- **修复**：改为 trusted 输入路径——`focus()` → CDP `Ctrl+A` 全选 → `Input.insertText` 写入；验证阶段优先用 CSS selector 重定位（AI 输入框输入后会重构 DOM 使 path 失效）

### 4. 网络请求记录缺失 — `navigateTool()` 时序

- **症状**：页面早期请求（如 fetch）未被 `network` 工具记录
- **根因**：`chrome.tabs.create({url})` 先导航、后 attach，`Network.enable` 生效晚于页面请求
- **修复**：先建 `about:blank` 空白标签 → `ensureDebugger`（含 `Network.enable`）→ 再 `tabs.update` 导航

### 5. 对话框死锁（关键架构问题）— 页面级拦截器

- **症状**：页面弹出原生 `alert` 后，**该 tab 的所有 CDP 命令挂起超时**（含 `handleJavaScriptDialog`），`mouse_click`、`dialog` 相继 35s 超时，工具链整体卡死
- **根因**：`chrome.debugger` 在页面 JS 被原生对话框阻塞时，命令响应路由到渲染进程而无法返回（架构限制，区别于 Puppeteer 的 browser-level CDP）
- **修复**：注入页面级拦截器 `DIALOG_HOOK`——替换 `window.alert/confirm/prompt`，不弹模态框、不阻塞页面，记录到 `window.__dshDialogRec`；attach 时通过 `Page.addScriptToEvaluateOnNewDocument`（覆盖新导航）+ 当前文档立即注入；`dialog` 工具改为读取拦截记录并清空

### 6. 对话框状态残留 — `Page.javascriptDialogClosed` 监听

- **补充**：监听 `Page.javascriptDialogClosed` 清除 `state.dialogs`，避免原生对话框自动关闭后状态残留（兜底）

## 文档同步

- `skills/chrome/SKILL.md`：`dialog` 工具描述改为拦截器语义（confirm 默认 `true`、prompt 默认 `null`、永不阻塞），并移除「对话框阻塞所有工具」的旧说明

## 测试验证

| 场景 | 结果 |
|---|---|
| 百度搜索：navigate → fill `#chat-textarea` → send_keys Enter | `title: "dsh_百度搜索"`，URL `wd=dsh` ✓ |
| 综合工具测试（本地测试页） | **21/21 PASS** |
| 对话框拦截 | `{"type":"alert","message":"hello-dsh"}`，页面不阻塞 ✓ |
| network 记录 /api/ping + network_detail | 请求详情完整 ✓ |
| 标签页管理 / 上传 / PDF / 截图 | 全部正常 ✓ |

## 已知限制

- `dialog` 拦截后 `confirm` 自动返回 `true`、`prompt` 返回 `null`，AI 无法再选择 accept/dismiss 分支——换来的是永不阻塞
- `network` 记录从 attach 时刻开始，导航前的请求仍可能缺失（SKILL.md 已说明）

## 附：环境相关发现（非代码修改）

- Chrome 137+ 移除 `--load-extension`；Chrome 152 对未打包扩展有「来源验证」，自动加载需 `--disable-features=ExtensionSourceVerification`，手动加载则在 chrome://extensions 点「保留此扩展程序」
- 百度新版首页可见搜索框为 `#chat-textarea`（AI 融合框），`#kw` 是隐藏同步框——调用时需用正确选择器
