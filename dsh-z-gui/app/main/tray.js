/**
 * 系统托盘：显示/隐藏窗口、打开终端、导出诊断、重启后端、退出。
 * 菜单文案按系统 locale 中/英切换（参考官方 tray-locale）。
 * @module dsh-gui/main/tray
 */

const path = require('node:path')
const fs = require('node:fs')
const { app, Tray, Menu, nativeImage } = require('electron')

let tray = null

/** 按系统 locale 解析菜单文案。 */
function labels() {
  const zh = app.getLocale().toLowerCase().startsWith('zh')
  return {
    show: zh ? '显示 DSH Desktop' : 'Show DSH Desktop',
    terminal: zh ? '打开 DSH 终端' : 'Open DSH Terminal',
    recovery: zh ? '进入恢复模式' : 'Open Recovery Mode',
    diagnostics: zh ? '导出诊断信息' : 'Export Diagnostics',
    restart: zh ? '重启后端' : 'Restart Backend',
    quit: zh ? '退出' : 'Quit',
    tooltip: 'DSH Desktop',
  }
}

/** 创建托盘（应用启动时）。 */
function createTray({ onShow, onTerminal, onRecovery, onDiagnostics, onRestart, onQuit }) {
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
  const t = labels()
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip(t.tooltip)
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: t.show, click: () => onShow() },
    { label: t.terminal, click: () => onTerminal && onTerminal() },
    { label: t.recovery, click: () => onRecovery && onRecovery() },
    { label: t.diagnostics, click: () => onDiagnostics && onDiagnostics() },
    { type: 'separator' },
    { label: t.restart, click: () => onRestart() },
    { type: 'separator' },
    { label: t.quit, click: () => onQuit() },
  ]))
  tray.on('click', () => onShow())
  return tray
}

/** 销毁托盘（应用退出时）。 */
function destroyTray() {
  try { if (tray) { tray.destroy(); tray = null } } catch { /* noop */ }
}

module.exports = { createTray, destroyTray }
