/**
 * dsh-gui 主进程入口：单实例，启动 dsh 后端，创建主窗口，管理生命周期。
 * @module dsh-gui/main/index
 */

const path = require('node:path')
const { app, dialog, Menu, ipcMain } = require('electron')
const { startBackend, stopBackend, restartBackend } = require('./backend')
const { createWindow, focusWindow, getWindow, consumeRecentAbnormal } = require('./window')
const { resolveDshHome } = require('./paths')
const { loadSettings, saveSettings } = require('./settings')
const browser = require('./browser-bridge')
const chromeBar = require('./chrome-bar')
const { createTray, destroyTray } = require('./tray')
const { openTerminal } = require('./terminal')

// 应用数据（缓存/日志等）统一放到 $DSH_HOME/gui，与 dsh 用户数据集中管理。
app.setPath('userData', path.join(resolveDshHome(), 'gui'))

// 受限桌面/虚拟化环境下 GPU 不稳定会导致渲染进程崩溃、窗口偶发消失。
// 本应用是纯 Web UI，禁用硬件加速改用软件渲染以提升稳定性。
app.disableHardwareAcceleration()

// 后端地址（startBackend 后缓存，供窗口因渲染异常被销毁后重建时复用）。
let appUrl = ''
// 当前设置快照（createWindow/操作栏/面板共用）。
let settings = null
// 托盘是否可用（创建失败则窗口关闭照常退出）。
let trayActive = false
// 重启/退出标志：托盘模式下窗口关闭不退出。
let quitting = false

/** 切换模式/材质：落盘后提示并重启（titleBarStyle 创建后不可改）。 */
function requestRelaunchForSettings(patch, description) {
  saveSettings(patch)
  const next = { ...settings, ...patch }
  dialog.showMessageBox({
    type: 'info',
    title: 'DSH Desktop',
    message: `已切换到${description}`,
    detail: '需要重启应用以应用窗口外观设置。',
    buttons: ['立即重启', '稍后'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      app.relaunch()
      app.exit(0)
    }
  }).catch(() => {})
}

/** 桌面动作表（chrome-bar 按钮 / client 标题栏 / IPC 共用分发）。 */
let desktopActions = null

/** 注册桌面动作（chrome-bar 按钮经 bridge /action/desktop、页面标题栏经 IPC desktop:action 分发）。 */
function registerDesktopActions() {
  desktopActions = {
    terminal: () => {
      openTerminal()
    },
    restart: () => {
      console.log('[dsh-gui] 桌面动作 restart：重启后端…')
      restartBackend(browser.getBridgeUrl())
        .then(({ url }) => { appUrl = url; if (getWindow()) getWindow().reload() })
        .catch((e) => console.error('[dsh-gui] 重启后端失败:', e))
    },
    devtools: () => {
      const win = getWindow()
      if (win && !win.isDestroyed()) win.webContents.openDevTools({ mode: 'detach' })
    },
    panel: () => {
      browser.toggleVisible()
    },
    mode: (body) => {
      // 支持目标模式参数（{cmd:'mode', mode:'advanced'}）；无参时循环切换（兼容旧按钮）。
      const target = body && ['compatibility', 'extended', 'advanced'].includes(body.mode) ? body.mode : null
      const next = target || (
        settings.presentationMode === 'compatibility'
          ? 'extended'
          : settings.presentationMode === 'extended'
            ? 'advanced'
            : 'compatibility'
      )
      requestRelaunchForSettings({ presentationMode: next }, next === 'extended' ? '扩展模式' : next === 'advanced' ? '增强模式' : '兼容模式')
    },
    // 模式 pill：原生三模式菜单（仿官方 mode popover）。
    'mode-menu': () => {
      const current = settings.presentationMode
      const menu = Menu.buildFromTemplate([
        { label: '切换呈现模式', enabled: false },
        { type: 'separator' },
        { label: '兼容 · 原生标题栏', type: 'radio', checked: current === 'compatibility', click: () => requestRelaunchForSettings({ presentationMode: 'compatibility' }, '兼容模式') },
        { label: '扩展 · 36px 桌面操作栏', type: 'radio', checked: current === 'extended', click: () => requestRelaunchForSettings({ presentationMode: 'extended' }, '扩展模式') },
        { label: '增强 · 32px 紧凑标题栏', type: 'radio', checked: current === 'advanced', click: () => requestRelaunchForSettings({ presentationMode: 'advanced' }, '增强模式') },
      ])
      Menu.popup({ window: getWindow() || undefined, callback: () => menu })
    },
    // 「更多」动作菜单（仿官方 native actions 下拉）。
    'actions-menu': () => {
      const menu = Menu.buildFromTemplate([
        { label: '重启后端', click: () => { restartBackend(browser.getBridgeUrl()).then(({ url }) => { appUrl = url; if (getWindow()) getWindow().reload() }).catch((e) => console.error('[dsh-gui] 重启后端失败:', e)) } },
        { label: '开发者工具', click: () => { const w = getWindow(); if (w && !w.isDestroyed()) w.webContents.openDevTools({ mode: 'detach' }) } },
        { label: '浏览器面板', click: () => browser.toggleVisible() },
        { type: 'separator' },
        { label: '退出 DSH Desktop', click: () => { quitting = true; app.quit() } },
      ])
      Menu.popup({ window: getWindow() || undefined, callback: () => menu })
    },
  }
  browser.setDesktopActions(desktopActions)

  // 页面标题栏（dsh-desktop-frame client）动作与状态。
  ipcMain.on('desktop:action', (_event, cmd, payload) => {
    const fn = desktopActions && desktopActions[cmd]
    if (typeof fn === 'function') {
      try { fn(payload || {}) } catch (e) { console.error('[dsh-gui] 桌面动作失败:', e) }
    }
  })
  ipcMain.handle('desktop:getState', () => ({
    mode: settings.presentationMode,
    material: settings.material,
    platform: process.platform,
    version: require('../package.json').version,
  }))
}

// 单实例：避免多个 dsh 后端同时占用端口/写入 $DSH_HOME。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const win = getWindow()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      settings = loadSettings()
      const mode = settings.presentationMode
      const material = settings.material

      // 菜单：文件（退出）、视图（面板/呈现模式/窗口材质）。
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
          label: '文件',
          submenu: [
            { label: '退出 DSH Desktop', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit() } },
          ],
        },
        {
          label: '视图',
          submenu: [
            { label: '浏览器面板', accelerator: 'CmdOrCtrl+Shift+B', click: () => browser.toggleVisible() },
            { type: 'separator' },
            {
              label: '呈现模式',
              submenu: [
                { label: '兼容（原生标题栏）', type: 'radio', checked: mode === 'compatibility', click: () => requestRelaunchForSettings({ presentationMode: 'compatibility' }, '兼容模式') },
                { label: '扩展（桌面操作栏）', type: 'radio', checked: mode === 'extended', click: () => requestRelaunchForSettings({ presentationMode: 'extended' }, '扩展模式') },
                { label: '增强（紧凑标题栏）', type: 'radio', checked: mode === 'advanced', click: () => requestRelaunchForSettings({ presentationMode: 'advanced' }, '增强模式') },
              ],
            },
            {
              label: '窗口材质',
              submenu: [
                { label: '关闭', type: 'radio', checked: material === 'off', click: () => requestRelaunchForSettings({ material: 'off' }, '关闭材质') },
                { label: 'Mica（Windows 11）', type: 'radio', checked: material === 'mica', click: () => requestRelaunchForSettings({ material: 'mica' }, 'Mica 材质') },
                { label: '透明（macOS）', type: 'radio', checked: material === 'transparent', click: () => requestRelaunchForSettings({ material: 'transparent' }, '透明材质') },
              ],
            },
          ],
        },
      ]))

      // IPC：面板显隐/切标签、呈现模式设置（preload/插件可调用）。
      ipcMain.on('browser:toggle', () => browser.toggleVisible())
      ipcMain.on('browser:showtab', (_e, id) => browser.showTab(String(id || 'browser')))
      ipcMain.on('mode:set', (_e, m) => { if (m) requestRelaunchForSettings({ presentationMode: String(m) }, '呈现模式') })

      // 启动内嵌浏览器桥（MCP server），再把其端点地址传给 dsh 后端注入 env，
      // 供 dsh-browser-control 插件用 McpClient(streamable-http) 连接，注册 mcp__browser__*。
      let bridgeUrl = ''
      try {
        bridgeUrl = (await browser.startBrowserBridge()).url
      } catch (bridgeError) {
        console.error('[dsh-gui] 启动浏览器桥失败:', bridgeError)
      }
      const bridgeBase = bridgeUrl.replace(/\/mcp$/, '')
      chromeBar.setPanelBaseUrl(bridgeBase)
      registerDesktopActions()

      const { url } = await startBackend(bridgeUrl)
      appUrl = url
      browser.setBackendUrl(url)

      const win = createWindow(url, settings)
      win.on('resize', () => { browser.layoutPanel(); chromeBar.layoutChromeBar() })
      win.on('closed', () => browser.layoutPanel())
      win.webContents.on('did-finish-load', () => browser.layoutPanel())

      // 托盘驻留：关闭窗口时隐藏到托盘（退出走托盘/菜单显式退出）。
      try {
        createTray({
          onShow: () => { if (win.isMinimized()) win.restore(); win.show(); win.focus() },
          onTerminal: () => { openTerminal() },
          onRestart: () => { void restartBackend(bridgeUrl).then(({ url: u }) => { appUrl = u; win.reload() }).catch((e) => console.error('[dsh-gui] 托盘重启后端失败:', e)) },
          onQuit: () => { quitting = true; app.quit() },
        })
        trayActive = true
        win.on('close', (e) => {
          if (!quitting && trayActive) { e.preventDefault(); win.hide() }
        })
      } catch (e) {
        trayActive = false
        console.warn('[dsh-gui] 托盘不可用，关闭窗口将退出:', e)
      }

      // 呈现模式：extended/advanced 由页面内标题栏（dsh-desktop-frame client）渲染，
      // 不再挂载 WebContentsView 操作栏（完全参考官方 dsh-desktop 的页面内 titlebar）。
      browser.setDockWidth(settings.dockWidth || browser.DOCK_WIDTH)
    } catch (error) {
      console.error('[dsh-gui] 启动失败:', error)
      dialog.showErrorBox(
        'DSH Desktop 启动失败',
        error instanceof Error ? error.message : String(error),
      )
      app.quit()
    }
  })

  // 窗口全部关闭：默认正常退出；仅渲染异常销毁后自动重建；托盘模式下保持驻留。
  app.on('window-all-closed', () => {
    if (consumeRecentAbnormal()) {
      reopenWindow()
    } else if (!quitting && trayActive) {
      if (getWindow()) getWindow().show()
    } else {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    quitting = true
    stopBackend()
    browser.disposeBrowserBridge()
    chromeBar.disposeChromeBar()
    destroyTray()
  })

  app.on('activate', () => {
    if (getWindow()) focusWindow()
  })
}

/** 重建主窗口：仅当窗口因渲染异常被销毁时调用（用最新设置，避免模式回退）。 */
function reopenWindow() {
  if (!appUrl || getWindow()) return
  setTimeout(() => {
    if (getWindow()) return
    console.log('[dsh-gui] 窗口因渲染异常被销毁，自动重建…')
    try {
      const win = createWindow(appUrl, settings)
      win.on('resize', () => { browser.layoutPanel(); chromeBar.layoutChromeBar() })
      win.on('closed', () => browser.layoutPanel())
      chromeBar.setMode(settings.presentationMode, settings.material)
      browser.setDockWidth(settings.dockWidth || browser.DOCK_WIDTH)
    } catch (error) {
      console.error('[dsh-gui] 重建窗口失败:', error)
    }
  }, 500)
}
