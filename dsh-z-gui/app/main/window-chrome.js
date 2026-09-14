/**
 * 窗口 chrome：三种呈现模式的 BrowserWindow 选项。
 * 完全参考 dsh-desktop 的 window-options.ts / window-chrome.ts：
 *   - compatibility：原生标题栏（回退）
 *   - extended：自定义标题栏 36px（Windows titleBarOverlay / macOS hiddenInset）+ 可选系统材质
 *   - advanced（增强）：同自定义 chrome 但更紧凑（32px caption、红绿灯更低）
 * @module dsh-gui/main/window-chrome
 */

/** 扩展/兼容模式标题栏高度（px）。 */
const FRAME_H = 36
/** 增强模式标题栏高度（px）。 */
const ADVANCED_H = 32
/** macOS 红绿灯 top（扩展模式）。 */
const MACOS_TL_TOP_EXT = 12
/** macOS 红绿灯 top（增强模式）。 */
const MACOS_TL_TOP_ADV = 16
/** Windows 自绘标题栏右侧预留的原生 caption 宽度（px）。 */
const WINDOWS_CAPTION_WIDTH = 138
/** Windows 11 Mica 材质所需 build 号下限。 */
const WIN11_MICA_MIN_BUILD = 22621

function windowsSupportsSystemBackdrop(build) {
  return typeof build === 'number' && build >= WIN11_MICA_MIN_BUILD
}

/**
 * 按呈现模式/材质/平台构造 BrowserWindow 选项。
 * @param mode - 'compatibility' | 'extended' | 'advanced'
 * @param material - 'off' | 'mica' | 'transparent'
 * @param platform - process.platform
 * @param windowsBuild - win32 版本号（windowsSupportsMica 已测，传入 undefined 则回退）
 * @returns Electron BrowserWindow 构造选项（浅拷贝扩展）。
 */
function buildWindowOptions(mode, material, platform, windowsBuild) {
  const base = {
    autoHideMenuBar: true,
    hasShadow: true,
    thickFrame: true,
    roundedCorners: true,
  }
  if (mode === 'compatibility' || platform === 'linux') {
    // 原生标题栏（Linux 不支持自定义 chrome）。
    return base
  }
  if (platform === 'darwin') {
    const titleBarHeight = mode === 'advanced' ? ADVANCED_H : FRAME_H
    const tlTop = mode === 'advanced' ? MACOS_TL_TOP_ADV : MACOS_TL_TOP_EXT
    const custom = {
      ...base,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: tlTop },
    }
    if (material === 'transparent') {
      return {
        ...custom,
        transparent: true,
        backgroundColor: '#00000000',
        vibrancy: 'sidebar',
        visualEffectState: 'followWindow',
      }
    }
    return custom
  }
  if (platform === 'win32') {
    const titlebarHeight = mode === 'advanced' ? ADVANCED_H : FRAME_H
    const useMica = material === 'mica' && windowsSupportsSystemBackdrop(windowsBuild)
    return {
      ...base,
      titleBarStyle: 'hidden',
      titleBarOverlay: {
        color: '#00000000',
        symbolColor: '#7f858f',
        height: titlebarHeight,
      },
      ...(useMica ? { backgroundColor: '#00000000', backgroundMaterial: 'mica' } : {}),
    }
  }
  return base
}

/** 按模式返回标题栏高度（页面 paddingTop 用；compat=0）。 */
function chromeHeight(mode, platform) {
  if (mode === 'compatibility' || platform === 'linux') return 0
  return mode === 'advanced' ? ADVANCED_H : FRAME_H
}

module.exports = {
  FRAME_H,
  ADVANCED_H,
  MACOS_TL_TOP_EXT,
  MACOS_TL_TOP_ADV,
  WINDOWS_CAPTION_WIDTH,
  buildWindowOptions,
  chromeHeight,
}
