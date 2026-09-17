/**
 * 设置向导（单 profile 版）：首次启动（web profile 未初始化）时引导用户完成
 * 呈现模式 / 窗口材质选择，完成后创建 Profile 并重启进入正常启动。
 * 单 profile 版不提供数据目录/多 profile 切换。
 * @module dsh-gui/main/wizard
 */

const fs = require('node:fs')
const path = require('node:path')
const { app, ipcMain } = require('electron')
const { resolveDshHome } = require('./paths')
const { loadSettings, saveSettings } = require('./settings')
const { ensureBuiltinPlugins } = require('./backend')
const { createNativeWindow } = require('./native-window')

let wizardWin = null

/** 首次运行判定：web profile 的 package.json 缺失 → 需要设置向导。 */
function needsSetup() {
  return !fs.existsSync(path.join(resolveDshHome(), 'profiles', 'web', 'package.json'))
}

/** 打开设置向导窗口（幂等）。 */
function openWizardWindow() {
  if (wizardWin && !wizardWin.isDestroyed()) {
    wizardWin.focus()
    return wizardWin
  }
  wizardWin = createNativeWindow('wizard.html', {
    title: '设置 DSH Desktop',
    width: 720,
    height: 580,
    minWidth: 640,
    minHeight: 520,
  })
  wizardWin.on('closed', () => { wizardWin = null })
  return wizardWin
}

/** 校验并归一化向导选择。 */
function normalizeSelection(selection) {
  const mode = ['compatibility', 'extended', 'advanced'].includes(selection?.presentationMode)
    ? selection.presentationMode
    : 'compatibility'
  const material = ['off', 'mica', 'transparent'].includes(selection?.material)
    ? selection.material
    : 'off'
  return { presentationMode: mode, material }
}

/** 注册向导 IPC（由 index 在 whenReady 调用一次）。 */
function registerWizardIpc({ onRelaunch }) {
  ipcMain.handle('native:info', () => ({
    platform: process.platform,
    version: require('../package.json').version,
    locale: app.getLocale(),
    dataDir: resolveDshHome(),
    profileDir: path.join(resolveDshHome(), 'profiles', 'web'),
    settings: loadSettings(),
    defaults: {
      presentationMode: 'compatibility',
      material: process.platform === 'darwin' ? 'off' : process.platform === 'win32' ? 'mica' : 'off',
    },
  }))

  ipcMain.handle('wizard:complete', async (_event, selection) => {
    const normalized = normalizeSelection(selection)
    // 1) 持久化呈现模式/材质（窗口 chrome 重启后生效）
    saveSettings(normalized)
    // 2) 初始化 web profile（内置插件 + bundle 列表 + 技能市场）
    ensureBuiltinPlugins()
    console.log('[dsh-gui] 设置向导完成：', JSON.stringify(normalized))
    // 3) 重启应用以应用窗口外观设置
    if (typeof onRelaunch === 'function') onRelaunch()
    return { ok: true }
  })

  ipcMain.handle('wizard:cancel', () => {
    // 「跳过设置」：用平台默认配置初始化 profile 并重启进入应用（而非直接退出）。
    // 与 wizard:complete 相同流程，仅使用默认选择。
    const defaults = {
      presentationMode: 'compatibility',
      material: process.platform === 'win32' ? 'mica' : 'off',
    }
    const normalized = normalizeSelection(defaults)
    saveSettings(normalized)
    ensureBuiltinPlugins()
    console.log('[dsh-gui] 设置向导跳过：使用默认配置', JSON.stringify(normalized))
    if (typeof onRelaunch === 'function') onRelaunch()
    return { ok: true }
  })
}

/** 设置向导窗口是否打开中。 */
function isWizardOpen() {
  return wizardWin !== null && !wizardWin.isDestroyed()
}

module.exports = { needsSetup, openWizardWindow, registerWizardIpc, isWizardOpen }
