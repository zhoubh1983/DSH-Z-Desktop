/**
 * 桌面端本地设置（呈现模式、窗口材质、面板宽度）持久化。
 * 存于 $DSH_HOME/gui/settings.json（与 dsh CLI 的 settings.yaml 隔离）。
 * @module dsh-gui/main/settings
 */

const fs = require('node:fs')
const path = require('node:path')
const { app } = require('electron')

/** 设置默认值（默认兼容模式，保证零回归）。 */
const DEFAULTS = {
  /** 呈现模式：'compatibility' | 'extended' | 'advanced'（增强）。 */
  presentationMode: 'compatibility',
  /** 窗口材质：'off' | 'mica'（Windows）| 'transparent'（macOS）。 */
  material: 'off',
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

/** 读取设置（缺失/损坏回退默认值；容忍 UTF-8 BOM）。 */
function loadSettings() {
  try {
    let raw = fs.readFileSync(settingsFile(), 'utf8')
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

/** 合并保存设置，返回新值。 */
function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true })
    fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf8')
  } catch (error) {
    console.error('[dsh-gui] 保存设置失败:', error instanceof Error ? error.message : String(error))
  }
  return next
}

module.exports = { loadSettings, saveSettings, DEFAULTS }
