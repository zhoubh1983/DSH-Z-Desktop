/**
 * 桌面操作栏（extended/advanced 呈现模式）：窗口顶部自绘标题栏 WebContentsView。
 * 参考 dsh-desktop 扩展模式：36px（advanced 32px）操作栏 + 原生 caption overlay；
 * 操作栏横条与 dsh 页面左侧 sidebar 构成倒 L。
 *  - 左侧：产品名 + 版本号
 *  - 中间：模式 pill（点击弹原生三模式菜单，仿官方 mode popover）
 *  - 右侧：终端按钮 + 「更多」动作菜单（重启/开发者/面板/退出，仿官方 native actions）
 * titleBarStyle hidden 下由本栏提供窗口拖拽区（drag），按钮区 no-drag。
 * 弹层统一走主进程原生 Menu（WebContentsView 高度 36px，HTML 内 popover 会被裁切）。
 * @module dsh-gui/main/chrome-bar
 */

const { WebContentsView } = require('electron')
const { getWindow } = require('./window')
const { FRAME_H, ADVANCED_H, WINDOWS_CAPTION_WIDTH } = require('./window-chrome')
const { version } = require('../package.json')

let desktopBar = null
let loaded = false
let panelBaseUrl = ''
let mode = 'compatibility'
let material = 'off'

/** 操作栏 HTML：drag 整条、按钮 no-drag；macOS 左留红绿灯安全区、Windows 右留原生 caption。
 * 背景跟随材质：material off 不透明深色（与窗口背景一致，任何页面主题下可读）；
 * mica/transparent 半透明深色，透出系统材质。 */
const TOOLBAR_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>操作栏</title><style>
html,body{margin:0;height:100%;overflow:hidden}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC",sans-serif;color:#e5e7eb;user-select:none;background:#0f1117}
#bar{display:flex;align-items:center;gap:8px;height:100%;padding:0 8px;box-sizing:border-box;-webkit-app-region:drag}
#brand{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#a5b4fc;white-space:nowrap}
#version{font-size:11px;color:#9ca3af;white-space:nowrap;border:1px solid rgba(255,255,255,.12);border-radius:6px;padding:1px 6px;background:rgba(255,255,255,.05)}
#spacer{flex:1 1 auto}
#mode-pill{-webkit-app-region:no-drag;flex:0 0 auto;white-space:nowrap;height:22px;padding:0 9px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.08);font-size:11px;color:#cbd5e1;cursor:pointer}
#mode-pill:hover{background:rgba(255,255,255,.16)}
.btn{-webkit-app-region:no-drag;flex:0 0 auto;white-space:nowrap;height:26px;padding:0 10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);border-radius:6px;font-size:12px;color:#e5e7eb;cursor:pointer}
.btn:hover{background:rgba(255,255,255,.14)}
.btn:active{background:rgba(255,255,255,.2)}
</style></head><body>
<div id="bar">
  <span id="brand">DSH Desktop</span>
  <span id="version">v0.1.0</span>
  <span id="spacer"></span>
  <button id="mode-pill" title="切换呈现模式">扩展模式</button>
  <button class="btn" data-cmd="terminal" title="打开 DSH 终端">终端</button>
  <button class="btn" data-cmd="actions-menu" title="更多操作">更多 ▾</button>
</div>
<script>
(function(){
  var pill=document.getElementById('mode-pill');
  document.querySelectorAll('.btn').forEach(function(b){
    b.addEventListener('click',function(){
      fetch('/action/desktop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cmd:b.getAttribute('data-cmd')})}).catch(function(){});
    });
  });
  pill.addEventListener('click',function(){
    fetch('/action/desktop',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cmd:'mode-menu'})}).catch(function(){});
  });
  window.__setMode=function(m){ pill.textContent=(m==='compatibility')?'兼容模式':(m==='advanced'?'增强模式':'扩展模式'); };
  window.__setVersion=function(v){ document.getElementById('version').textContent='v'+v; };
  window.__setMaterial=function(mat){
    document.body.style.background=(mat==='mica'||mat==='transparent')?'rgba(15,17,23,0.65)':'#0f1117';
  };
})();
</script></body></html>`

function ensureBar() {
  const win = getWindow()
  if (!win || win.isDestroyed()) return null
  if (!desktopBar) {
    desktopBar = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } })
    // 半透明背景：mica/transparent 材质下透出系统玻璃。
    desktopBar.setBackgroundColor('#00000000')
  }
  return win
}

function removeIfAdded(view) {
  if (!view) return
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  if (win.contentView.children.includes(view)) win.contentView.removeChildView(view)
}

function heightFor(m) {
  return m === 'advanced' ? ADVANCED_H : FRAME_H
}

/** 摆放操作栏到窗口顶部全宽（resize 时由 layoutPanel 调用）。 */
function layoutChromeBar() {
  const win = getWindow()
  if (!win || win.isDestroyed() || !desktopBar) return
  const b = win.getContentBounds()
  desktopBar.setBounds({ x: 0, y: 0, width: b.width, height: heightFor(mode) })
}

/** 应用呈现模式：挂载/卸载操作栏，注入模式与版本元数据。 */
function setMode(nextMode, nextMaterial) {
  mode = nextMode === 'advanced' ? 'advanced' : nextMode === 'extended' ? 'extended' : 'compatibility'
  if (typeof nextMaterial === 'string') material = nextMaterial
  if (mode === 'compatibility') {
    removeIfAdded(desktopBar)
    return
  }
  const win = ensureBar()
  if (!win) return
  if (!loaded) {
    loaded = true
    desktopBar.webContents.loadURL(panelBaseUrl + '/panel/desktop-toolbar')
  }
  if (!win.contentView.children.includes(desktopBar)) win.contentView.addChildView(desktopBar)
  layoutChromeBar()
  const script = `window.__setMode&&window.__setMode(${JSON.stringify(mode)});window.__setVersion&&window.__setVersion(${JSON.stringify(version)});window.__setMaterial&&window.__setMaterial(${JSON.stringify(material)});`
  try {
    desktopBar.webContents.executeJavaScript(script).catch(() => {})
  } catch { /* 未加载完成忽略 */ }
}

/** 面板桥就绪后注入 base URL。 */
function setPanelBaseUrl(url) {
  panelBaseUrl = String(url || '')
}

/** 当前操作栏高度（px）。 */
function getHeight() {
  return heightFor(mode)
}

/** Windows caption 预留宽度（供 HTML 布局参考，本实现由原生 overlay 占用右侧，无需注入）。 */
function captionWidth() {
  return WINDOWS_CAPTION_WIDTH
}

/** 卸载并释放操作栏视图。 */
function disposeChromeBar() {
  removeIfAdded(desktopBar)
  try { if (desktopBar) { desktopBar.webContents?.close?.(); desktopBar = null } } catch { /* noop */ }
  loaded = false
}

/** 返回操作栏 HTML（供 browser-bridge /panel/desktop-toolbar 路由）。 */
function desktopToolbarHtml() {
  return TOOLBAR_HTML
}

module.exports = {
  setMode,
  setPanelBaseUrl,
  layoutChromeBar,
  disposeChromeBar,
  desktopToolbarHtml,
  getHeight,
  captionWidth,
}
