/**
 * 主窗口管理。
 * @module dsh-gui/main/window
 */

const path = require('node:path')
const fs = require('node:fs')
const { BrowserWindow } = require('electron')
const { buildWindowOptions, chromeHeight } = require('./window-chrome')

/**
 * 关窗/退出阶段 stdout 管道可能已被父进程关闭，console.* 直接抛 EPIPE 未捕获异常
 * （实测关窗触发 "Uncaught Exception: EPIPE: broken pipe"）。统一兜底，静默忽略。
 */
function safeLog(fn, ...args) {
  try {
    fn(...args)
  } catch {
    /* 进程退出期管道断裂属预期，忽略 */
  }
}

let win = null
// 当前呈现模式/材质（createWindow 时记录，供 getChromeHeight 与页面 inset 使用）。
let currentMode = 'compatibility'
let currentMaterial = 'off'

/** 主界面目标地址（后端就绪前为空；渲染异常重载/窗口重建时作为导航目标）。 */
let targetUrl = ''

/**
 * 启动 loading 页（data URL 内联，零构建）。
 * 后端初始化（复制插件/模型 + 插件树加载）可能耗时 20~30 秒，窗口先行加载本页，
 * 避免这段时间无窗口/白屏；后端就绪后由主进程导航到真实界面。
 */
const LOADING_URL = 'data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0f1117;color:#9aa1ad;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;gap:14px}
  .spinner{width:34px;height:34px;border:3px solid #262b36;border-top-color:#4b7bec;border-radius:50%;animation:spin .9s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .title{color:#e6e8eb;font-size:15px;font-weight:600}
  .hint{font-size:12px;color:#6b7280}
</style>
</head>
<body>
  <div class="spinner"></div>
  <div class="title">正在启动 DSH Desktop…</div>
  <div class="hint">正在初始化内置插件与本地模型，请稍候</div>
</body>
</html>`)

// 渲染进程最近一次异常（崩溃/卡死）的时间戳，用于区分「异常关闭→重建窗口」
// 与「用户正常关闭窗口→退出应用」：异常后短时间内窗口被销毁视为异常场景。
let abnormalAt = 0

/** 标记渲染进程异常时刻。 */
function markAbnormal() {
  abnormalAt = Date.now()
}

/**
 * 判定并消费「最近是否发生过渲染异常」。
 * @param maxAgeMs - 异常距今多久内仍视为近期（默认 5s）。
 * @returns 近期内发生过异常则为 true（同时清空标记）。
 */
function consumeRecentAbnormal(maxAgeMs = 5000) {
  const recent = abnormalAt !== 0 && Date.now() - abnormalAt <= maxAgeMs
  abnormalAt = 0
  return recent
}

/** 解析 Windows build 号（供 mica 材质判定）。 */
function windowsBuildNumber() {
  try {
    const v = process.getSystemVersion?.() || ''
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(v)
    return m ? Number(m[3]) : undefined
  } catch {
    return undefined
  }
}

/** 创建并加载 dsh Web 界面的主窗口。url 为空时先加载启动 loading 页（后端就绪后导航）。 */
function createWindow(url, settings = {}) {
  targetUrl = url || ''
  currentMode = settings.presentationMode === 'advanced'
    ? 'advanced'
    : settings.presentationMode === 'extended'
      ? 'extended'
      : 'compatibility'
  currentMaterial = settings.material === 'mica' ? 'mica'
    : settings.material === 'transparent' ? 'transparent'
      : 'off'
  // 打包后 Windows 用 exe 自带图标；开发模式用 resources/icon.png（文件不存在时忽略）
  const icon = path.join(__dirname, '..', 'resources', 'icon.png')
  win = new BrowserWindow({
    ...buildWindowOptions(currentMode, currentMaterial, process.platform, windowsBuildNumber()),
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'DSH Desktop',
    backgroundColor: '#0f1117',
    icon: fs.existsSync(icon) ? icon : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 允许 <webview> 标签：右侧内嵌浏览器面板（dsh-embedded-browser）依赖它。
      webviewTag: true,
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  })

  win.loadURL(targetUrl || LOADING_URL)

  // 引导页插件加载失败（Failed to load plugins）时注入「打开恢复模式」按钮。
  win.webContents.on('did-finish-load', () => {
    injectBootRecoveryButton(win)
  })

  // 渲染进程异常（GPU/内存/崩溃）时：标记异常并自动重载；
  // 若窗口因此被销毁，由 index 侧 window-all-closed 判定为异常场景并重建。
  win.webContents.on('render-process-gone', (_event, details) => {
    safeLog(console.error, `[dsh-gui] 渲染进程异常退出 (${details.reason})，自动恢复中…`)
    if (details.reason !== 'clean-exit') {
      markAbnormal()
      setTimeout(() => {
        if (!win || win.isDestroyed()) return
        win.loadURL(targetUrl || LOADING_URL)
      }, 500)
    }
  })

  // 页面长时间无响应时强制恢复渲染进程（触发 render-process-gone 走上面的恢复）。
  win.webContents.on('unresponsive', () => {
    safeLog(console.warn, '[dsh-gui] 页面无响应，强制恢复渲染进程…')
    markAbnormal()
    win.webContents.forcefullyCrashRenderer()
  })

  // 记录窗口关闭事件，便于排查偶发退出（配合 dsh-gui.log）。
  win.on('close', () => {
    safeLog(console.log, '[dsh-gui] 主窗口关闭')
  })

  win.on('closed', () => {
    win = null
  })
  return win
}

/** 聚焦已存在的主窗口（单实例二次启动时使用）。 */
function focusWindow() {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
}

/** 当前窗口（可能为 null）。 */
function getWindow() {
  return win
}

/** 当前标题栏高度（px，compat/Linux=0；供页面 paddingTop 与操作栏布局）。 */
function getChromeHeight() {
  return chromeHeight(currentMode, process.platform)
}

/** 设置主界面目标地址（后端就绪后由 index 调用，供渲染异常重载导航到真实界面）。 */
function setTargetUrl(url) {
  targetUrl = url
}

/**
 * 引导页插件失败注入：dsh web 引导页出现 "Failed to load plugins" 报告时，
 * 追加「打开恢复模式」按钮（点击经 preload 的 dshGui.desktop.action 送达主进程）。
 * 与官方 desktop-boot-recovery 同思路；使用 MutationObserver 等待失败报告渲染。
 */
function injectBootRecoveryButton(win) {
  const script = `(() => {
    const endpointLabel = '打开恢复模式';
    const style = document.createElement('style');
    style.textContent = '[data-dsh-desktop-recovery]{margin-top:12px;display:flex;flex-direction:column;gap:10px;align-items:flex-start;max-width:480px;color:#cfd3d6;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}[data-dsh-desktop-recovery] p{margin:0;font-size:12px;line-height:18px}[data-dsh-desktop-recovery] button{min-height:38px;padding:0 18px;border:0;border-radius:20px;background:#f9fafb;color:#151517;cursor:pointer;font:600 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}';
    document.head.appendChild(style);
    const attach = () => {
      const root = document.querySelector('[data-dsh-boot]');
      if (!root || root.querySelector('[data-dsh-desktop-recovery]')) return;
      const title = Array.from(root.querySelectorAll('div')).find((node) => node.childElementCount === 0 && node.textContent && node.textContent.trim() === 'Failed to load plugins');
      const report = title && title.parentElement;
      if (!report) return;
      const panel = document.createElement('section');
      panel.setAttribute('data-dsh-desktop-recovery', '');
      const p = document.createElement('p');
      p.textContent = '部分插件加载失败，可能与当前 DSH 版本不兼容。你可以进入恢复模式卸载有问题的插件，或恢复出厂设置后重新启动。';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = endpointLabel;
      btn.addEventListener('click', () => {
        btn.disabled = true;
        if (window.dshGui && window.dshGui.desktop && window.dshGui.desktop.action) {
          window.dshGui.desktop.action('recovery-open', { reason: 'boot-failure' });
        } else {
          btn.disabled = false;
        }
      });
      panel.append(p, btn);
      report.append(panel);
    };
    attach();
    new MutationObserver(attach).observe(document.documentElement, { childList: true, subtree: true });
  })();`
  win.webContents.executeJavaScript(script).catch(() => { /* 非引导页/SPA 正常加载时静默 */ })
}

module.exports = { createWindow, focusWindow, getWindow, consumeRecentAbnormal, getChromeHeight, setTargetUrl }
