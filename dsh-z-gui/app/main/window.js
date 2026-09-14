/**
 * 主窗口管理。
 * @module dsh-gui/main/window
 */

const path = require('node:path')
const fs = require('node:fs')
const { BrowserWindow } = require('electron')
const { buildWindowOptions, chromeHeight } = require('./window-chrome')

let win = null
// 当前呈现模式/材质（createWindow 时记录，供 getChromeHeight 与页面 inset 使用）。
let currentMode = 'compatibility'
let currentMaterial = 'off'

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

/** 创建并加载 dsh Web 界面的主窗口。 */
function createWindow(url, settings = {}) {
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
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
    },
  })

  win.loadURL(url)

  // 渲染进程异常（GPU/内存/崩溃）时：标记异常并自动重载；
  // 若窗口因此被销毁，由 index 侧 window-all-closed 判定为异常场景并重建。
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[dsh-gui] 渲染进程异常退出 (${details.reason})，自动恢复中…`)
    if (details.reason !== 'clean-exit') {
      markAbnormal()
      setTimeout(() => {
        if (!win || win.isDestroyed()) return
        win.loadURL(url)
      }, 500)
    }
  })

  // 页面长时间无响应时强制恢复渲染进程（触发 render-process-gone 走上面的恢复）。
  win.webContents.on('unresponsive', () => {
    console.warn('[dsh-gui] 页面无响应，强制恢复渲染进程…')
    markAbnormal()
    win.webContents.forcefullyCrashRenderer()
  })

  // 记录窗口关闭事件，便于排查偶发退出（配合 dsh-gui.log）。
  win.on('close', () => {
    console.log('[dsh-gui] 主窗口关闭')
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

module.exports = { createWindow, focusWindow, getWindow, consumeRecentAbnormal, getChromeHeight }
