/**
 * 原生窗口（设置向导 / 恢复助手）公共工厂。
 * 与主窗口分离：独立 preload（native.js），标准系统标题栏，避免自绘 chrome 复杂度。
 * @module dsh-gui/main/native-window
 */

const path = require('node:path')
const { BrowserWindow } = require('electron')

/**
 * 创建并加载 native-ui 下的本地页面窗口。
 * @param file - native-ui 下的 html 文件名（如 'wizard.html'）。
 * @param opts - { width, height, minWidth, minHeight, title, parent }
 */
function createNativeWindow(file, opts = {}) {
  const win = new BrowserWindow({
    width: opts.width || 720,
    height: opts.height || 560,
    minWidth: opts.minWidth || 600,
    minHeight: opts.minHeight || 480,
    title: opts.title || 'DSH Desktop',
    autoHideMenuBar: true,
    backgroundColor: '#0f1117',
    show: false,
    parent: opts.parent,
    ...(opts.modal ? { modal: true } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, '..', 'preload', 'native.js'),
    },
  })
  win.loadFile(path.join(__dirname, '..', 'native-ui', file))
  win.once('ready-to-show', () => win.show())
  return win
}

module.exports = { createNativeWindow }
