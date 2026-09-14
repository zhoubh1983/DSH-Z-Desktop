/**
 * 系统托盘：显示/隐藏窗口、重启后端、退出。
 * @module dsh-gui/main/tray
 */

const path = require('node:path')
const fs = require('node:fs')
const { Tray, Menu, nativeImage } = require('electron')

let tray = null

/** 创建托盘（应用启动时）。 */
function createTray({ onShow, onTerminal, onRestart, onQuit }) {
  const iconPath = path.join(__dirname, '..', 'resources', 'icon.png')
  let icon
  try {
    icon = fs.existsSync(iconPath)
      ? nativeImage.createFromPath(iconPath)
      : nativeImage.createEmpty()
    if (icon.isEmpty()) {
      icon = nativeImage.createFromDataURL(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      )
    }
  } catch {
    icon = nativeImage.createEmpty()
  }
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('DSH Desktop')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示 DSH Desktop', click: () => onShow() },
    { label: '打开 DSH 终端', click: () => onTerminal && onTerminal() },
    { type: 'separator' },
    { label: '重启后端', click: () => onRestart() },
    { type: 'separator' },
    { label: '退出', click: () => onQuit() },
  ]))
  tray.on('click', () => onShow())
  return tray
}

/** 销毁托盘（应用退出时）。 */
function destroyTray() {
  try { if (tray) { tray.destroy(); tray = null } } catch { /* noop */ }
}

module.exports = { createTray, destroyTray }
