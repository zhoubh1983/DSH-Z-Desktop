/**
 * dsh-desktop-frame 客户端入口（React 版）。
 * 用 esbuild 打包成 IIFE（external react/react-dom），产出的 lib/client.js
 * 在 dsh web 页面加载时经 window.__ModuleLoader__.load 注册，渲染页面内标题栏。
 */

import { createRoot } from 'react-dom/client'
import { TitlebarView, type FrameState } from './TitlebarView'

declare global {
  interface Window {
    dshGui?: {
      desktop?: {
        action(cmd: string, payload?: Record<string, unknown>): void
        getState(): Promise<FrameState>
      }
    }
    __ModuleLoader__: {
      load(def: { id: string; factory: (require: (id: string) => unknown) => unknown }): void
    }
  }
}

const TITLEBAR_HEIGHT = 36
const ADVANCED_HEIGHT = 32
const CSS_ID = 'dsh-desktop-frame-css'
const ROOT_ID = 'dsh-desktop-frame-root'

/** 标题栏样式（含内容让位：box-sizing 修复滚动条溢出、body 禁全局滚动）。 */
const TITLEBAR_CSS = `
.dshDesktopFrameTitlebar{position:fixed;z-index:2147483647;top:0;right:0;left:0;display:flex;align-items:center;box-sizing:border-box;height:${TITLEBAR_HEIGHT}px;background:#0f1117;color:#e5e7eb;user-select:none;-webkit-app-region:drag;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC",sans-serif}
.dshDesktopFrameTitlebar[data-platform="win32"]{padding:0 142px 0 10px}
.dshDesktopFrameTitlebar[data-platform="darwin"]{padding:0 10px 0 88px}
.dshDesktopFrameTitlebar[data-material="mica"],.dshDesktopFrameTitlebar[data-material="transparent"]{background:rgba(15,17,23,.66)}
.dshDesktopFrameIdentity{display:flex;align-items:center;gap:9px;min-width:0;margin-right:auto;pointer-events:none}
.dshDesktopFrameProduct{font-size:13px;font-weight:600;white-space:nowrap;color:#a5b4fc}
.dshDesktopFrameVersion{min-height:22px;padding:2px 6px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.05);color:#9ca3af;font:inherit;font-size:11px;white-space:nowrap;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopFrameMode{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.08);color:#cbd5e1;cursor:pointer;font:inherit;font-size:11px;white-space:nowrap;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopFrameMode:hover{background:rgba(255,255,255,.16);color:#e5e7eb}
.dshDesktopFrameModeWrap{position:relative;pointer-events:auto}
.dshDesktopModeMenu{position:absolute;z-index:2147483647;top:calc(100% + 5px);left:0;min-width:230px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#1b1f27;box-shadow:0 12px 32px rgba(0,0,0,.4);display:grid;gap:3px;-webkit-app-region:no-drag}
.dshDesktopModeMenuHead{color:#9ca3af;font-size:11px;font-weight:600;padding:4px 8px 6px}
.dshDesktopModeOpt{display:grid;gap:2px;width:100%;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:#e5e7eb;cursor:pointer;text-align:left;font:inherit}
.dshDesktopModeOpt:hover{background:rgba(255,255,255,.1)}
.dshDesktopModeOpt strong{font-size:12px;font-weight:600}
.dshDesktopModeOpt small{color:#9ca3af;font-size:10px;line-height:1.35}
.dshDesktopFrameActions{display:flex;align-items:center;gap:4px;pointer-events:none}
.dshDesktopTitlebarIconButton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:rgba(255,255,255,.06);color:#cbd5e1;cursor:pointer;font-size:13px;line-height:1;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopTitlebarIconButton:hover{background:rgba(255,255,255,.14);color:#e5e7eb}
body[data-dsh-desktop-frame="on"]{overflow:hidden}
body[data-dsh-desktop-frame="on"] #root{box-sizing:border-box;height:100%;overflow:hidden;padding-top:${TITLEBAR_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] #root{padding-top:${ADVANCED_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] .dshDesktopFrameTitlebar{height:${ADVANCED_HEIGHT}px}
`

/** 幂等注入样式。 */
function injectCss(): void {
  if (document.getElementById(CSS_ID)) return
  const style = document.createElement('style')
  style.id = CSS_ID
  style.textContent = TITLEBAR_CSS
  document.head.appendChild(style)
}

/** 挂载容器（body 下，跟随官方 createPortal 到 body 的定位）。 */
function ensureRoot(): HTMLDivElement {
  let el = document.getElementById(ROOT_ID) as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = ROOT_ID
    document.body.appendChild(el)
  }
  return el
}

let rootInstance: ReturnType<typeof createRoot> | null = null

export const name = 'dsh-desktop-frame-client'

export function apply(): void {
  injectCss()

  const boot = (): void => {
    const get = window.dshGui?.desktop?.getState
    const promise = get ? get() : Promise.resolve({ mode: 'compatibility', material: 'off', platform: 'win32', version: '0.1.0' } as FrameState)
    promise.then((state) => {
      const mode = (state && (state.mode === 'advanced' || state.mode === 'extended')) ? state.mode : 'compatibility'
      document.body.dataset.dshDesktopFrame = mode === 'compatibility' ? 'off' : 'on'
      document.body.dataset.dshDesktopHeight = mode === 'advanced' ? 'advanced' : 'extended'
      if (mode === 'compatibility') {
        if (rootInstance) { rootInstance.unmount(); rootInstance = null }
        return
      }
      if (!rootInstance) rootInstance = createRoot(ensureRoot())
      rootInstance.render(<TitlebarView state={state} />)
    }).catch(() => { /* 静默降级为兼容模式 */ })
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
}
