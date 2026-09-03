/**
 * dsh-gui 主进程入口：单实例，启动 dsh 后端，创建主窗口，管理生命周期。
 * @module dsh-gui/main/index
 */

const path = require('node:path')
const { app, dialog, Menu } = require('electron')
const { startBackend, stopBackend } = require('./backend')
const { createWindow, focusWindow, getWindow, consumeRecentAbnormal } = require('./window')
const { resolveDshHome } = require('./paths')

// 应用数据（缓存/日志等）统一放到 $DSH_HOME/gui，与 dsh 用户数据集中管理。
app.setPath('userData', path.join(resolveDshHome(), 'gui'))

// 受限桌面/虚拟化环境下 GPU 不稳定会导致渲染进程崩溃、窗口偶发消失。
// 本应用是纯 Web UI，禁用硬件加速改用软件渲染以提升稳定性。
app.disableHardwareAcceleration()

// 后端地址（startBackend 后缓存，供窗口因渲染异常被销毁后重建时复用）。
let appUrl = ''

/** 重建主窗口：仅当窗口因渲染异常被销毁时调用。 */
function reopenWindow() {
  if (!appUrl || getWindow()) return
  setTimeout(() => {
    if (getWindow()) return
    console.log('[dsh-gui] 窗口因渲染异常被销毁，自动重建…')
    try {
      createWindow(appUrl)
    } catch (error) {
      console.error('[dsh-gui] 重建窗口失败:', error)
    }
  }, 500)
}

// 单实例：避免多个 dsh 后端同时占用端口/写入 $DSH_HOME。
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    focusWindow()
  })

  app.whenReady().then(async () => {
    try {
      // 提供显式退出入口（文件 → 退出 / Ctrl+Q）。
      Menu.setApplicationMenu(Menu.buildFromTemplate([
        {
          label: '文件',
          submenu: [
            { label: '退出 DSH Desktop', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
          ],
        },
      ]))

      const { url } = await startBackend()
      appUrl = url
      createWindow(url)
    } catch (error) {
      console.error('[dsh-gui] 启动失败:', error)
      dialog.showErrorBox(
        'DSH Desktop 启动失败',
        error instanceof Error ? error.message : String(error),
      )
      app.quit()
    }
  })

  // 窗口全部关闭：默认正常退出（与用户关闭窗口语义一致）；
  // 仅当刚发生过渲染异常（崩溃/卡死导致窗口被销毁）时自动重建窗口。
  app.on('window-all-closed', () => {
    if (consumeRecentAbnormal()) {
      reopenWindow()
    } else {
      app.quit()
    }
  })

  app.on('before-quit', () => {
    stopBackend()
  })

  app.on('activate', () => {
    if (getWindow()) focusWindow()
  })
}
