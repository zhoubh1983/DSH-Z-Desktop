/**
 * dsh-desktop-frame 客户端：在 dsh web 页面渲染官方同款桌面标题栏（extended/advanced 模式）。
 * 零构建、原生 DOM（与 dsh-browser-control 一致）。
 *
 * 标题栏结构（对齐官方 DesktopFrameTitlebarView）：
 *   - 身份区（居中）：产品名 + 版本号 + 模式 pill（点击弹三模式选择）
 *   - 动作区：终端 / 重启 / 开发者工具
 * 动作经 preload 暴露的 window.dshGui.desktop.action(cmd) → 主进程执行。
 * extended/advanced 时注入标题栏 + 内容 top inset；compatibility 不注入。
 */
window.__ModuleLoader__.load({ id: 'dsh-desktop-frame', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports

  const TITLEBAR_HEIGHT = 36
  const ADVANCED_HEIGHT = 32
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
.dshDesktopModeMenu{position:absolute;z-index:2147483647;top:calc(100% + 5px);left:0;display:none;min-width:230px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#1b1f27;box-shadow:0 12px 32px rgba(0,0,0,.4);-webkit-app-region:no-drag}
.dshDesktopModeMenu[data-open="true"]{display:grid;gap:3px}
.dshDesktopModeMenuHead{color:#9ca3af;font-size:11px;font-weight:600;padding:4px 8px 6px}
.dshDesktopModeOpt{display:grid;gap:2px;width:100%;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:#e5e7eb;cursor:pointer;text-align:left;font:inherit}
.dshDesktopModeOpt:hover{background:rgba(255,255,255,.1)}
.dshDesktopModeOpt[data-current="true"]{background:rgba(255,255,255,.08)}
.dshDesktopModeOpt strong{font-size:12px;font-weight:600}
.dshDesktopModeOpt small{color:#9ca3af;font-size:10px;line-height:1.35}
.dshDesktopFrameActions{display:flex;align-items:center;gap:4px;pointer-events:none}
.dshDesktopTitlebarIconButton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:rgba(255,255,255,.06);color:#cbd5e1;cursor:pointer;font-size:13px;line-height:1;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopTitlebarIconButton:hover{background:rgba(255,255,255,.14);color:#e5e7eb}
body[data-dsh-desktop-frame="on"] #root{padding-top:${TITLEBAR_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] #root{padding-top:${ADVANCED_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] .dshDesktopFrameTitlebar{height:${ADVANCED_HEIGHT}px}
@media (prefers-color-scheme: dark){}
`

  let titlebar = null
  let mode = 'compatibility'

  /** 向主进程发动作（经 preload IPC）。 */
  function action(cmd, payload) {
    if (window.dshGui && window.dshGui.desktop && typeof window.dshGui.desktop.action === 'function') {
      window.dshGui.desktop.action(cmd, payload || {})
    }
  }

  /** 模式中文名。 */
  function modeLabel(m) {
    return m === 'advanced' ? '增强模式' : m === 'extended' ? '扩展模式' : '兼容模式'
  }

  /** 构建标题栏 DOM（仿官方 DesktopFrameTitlebarView）。 */
  function buildTitlebar(state) {
    const header = document.createElement('header')
    header.className = 'dshDesktopFrameTitlebar'
    header.dataset.platform = state.platform || 'win32'
    header.dataset.mode = mode
    header.dataset.material = state.material || 'off'

    const identity = document.createElement('div')
    identity.className = 'dshDesktopFrameIdentity'
    const product = document.createElement('span')
    product.className = 'dshDesktopFrameProduct'
    product.textContent = 'DSH Desktop'
    const version = document.createElement('span')
    version.className = 'dshDesktopFrameVersion'
    version.textContent = 'v' + (state.version || '0.1.0')
    version.title = 'DSH Desktop ' + (state.version || '0.1.0')
    identity.appendChild(product)
    identity.appendChild(version)

    // 模式 pill + 三模式菜单（仿官方 DesktopModeControl）。
    const modeWrap = document.createElement('div')
    modeWrap.className = 'dshDesktopFrameModeWrap'
    const pill = document.createElement('button')
    pill.type = 'button'
    pill.className = 'dshDesktopFrameMode'
    pill.textContent = modeLabel(mode)
    pill.setAttribute('aria-haspopup', 'menu')
    pill.addEventListener('click', (ev) => {
      ev.stopPropagation()
      menu.dataset.open = menu.dataset.open === 'true' ? 'false' : 'true'
    })
    const menu = document.createElement('div')
    menu.className = 'dshDesktopModeMenu'
    menu.dataset.open = 'false'
    menu.setAttribute('role', 'menu')
    const head = document.createElement('div')
    head.className = 'dshDesktopModeMenuHead'
    head.textContent = '切换呈现模式'
    menu.appendChild(head)
    const opts = [
      { m: 'compatibility', title: '兼容', body: '保留原生系统标题栏' },
      { m: 'extended', title: '扩展', body: '36px 桌面标题栏 + 三栏布局' },
      { m: 'advanced', title: '增强', body: '32px 紧凑标题栏' },
    ]
    for (const o of opts) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'dshDesktopModeOpt'
      btn.dataset.mode = o.m
      btn.dataset.current = o.m === mode ? 'true' : 'false'
      const strong = document.createElement('strong')
      strong.textContent = o.title
      const small = document.createElement('small')
      small.textContent = o.body
      btn.appendChild(strong)
      btn.appendChild(small)
      btn.addEventListener('click', () => {
        if (o.m !== mode) action('mode', { mode: o.m })
        menu.dataset.open = 'false'
      })
      menu.appendChild(btn)
    }
    modeWrap.appendChild(pill)
    modeWrap.appendChild(menu)
    // 点击别处关闭菜单。
    document.addEventListener('mousedown', (ev) => {
      if (!modeWrap.contains(ev.target)) menu.dataset.open = 'false'
    })
    identity.appendChild(modeWrap)

    // 动作区（仿官方 DesktopNativeActions 标题栏版）。
    const actions = document.createElement('div')
    actions.className = 'dshDesktopFrameActions'
    const mkBtn = (title, label, cmd) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dshDesktopTitlebarIconButton'
      b.title = title
      b.setAttribute('aria-label', title)
      b.textContent = label
      b.addEventListener('click', () => action(cmd))
      return b
    }
    actions.appendChild(mkBtn('打开 DSH 终端', '❯_', 'terminal'))
    actions.appendChild(mkBtn('重启后端', '⟳', 'restart'))
    actions.appendChild(mkBtn('开发者工具', '⚙', 'devtools'))

    header.appendChild(identity)
    header.appendChild(actions)
    return header
  }

  /** 应用标题栏：按模式注入 DOM + 样式 + 内容 inset。 */
  function applyFrame(state) {
    mode = state.mode === 'advanced' ? 'advanced' : state.mode === 'extended' ? 'extended' : 'compatibility'
    // 样式一次性注入。
    if (!document.getElementById('dsh-desktop-frame-css')) {
      const style = document.createElement('style')
      style.id = 'dsh-desktop-frame-css'
      style.textContent = TITLEBAR_CSS
      document.head.appendChild(style)
    }
    document.body.dataset.dshDesktopFrame = mode === 'compatibility' ? 'off' : 'on'
    document.body.dataset.dshDesktopHeight = mode === 'advanced' ? 'advanced' : 'extended'
    if (mode === 'compatibility') {
      if (titlebar) { titlebar.remove(); titlebar = null }
      return
    }
    if (!titlebar) {
      titlebar = buildTitlebar(state)
      document.body.appendChild(titlebar)
    } else {
      // 更新 pill 文案（模式在重启前不变，此处兜底）。
      const pill = titlebar.querySelector('.dshDesktopFrameMode')
      if (pill) pill.textContent = modeLabel(mode)
    }
  }

  /** 客户端插件入口：读主进程状态后应用标题栏。 */
  function apply(ctx) {
    const readState = () => {
      if (window.dshGui && window.dshGui.desktop && typeof window.dshGui.desktop.getState === 'function') {
        return Promise.resolve(window.dshGui.desktop.getState())
      }
      return Promise.resolve({ mode: 'compatibility', material: 'off', platform: 'win32', version: '0.1.0' })
    }
    const boot = () => {
      readState().then((state) => {
        applyFrame(state || {})
      }).catch(() => { /* 静默降级为兼容模式 */ })
    }
    // 页面 ready 后挂载（AppFrame 可能晚于本插件 apply，但 titlebar 是 fixed 不受影响）。
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot)
    } else {
      boot()
    }
  }

  module.exports = { name: 'dsh-desktop-frame-client', apply }
  return module.exports
} })
