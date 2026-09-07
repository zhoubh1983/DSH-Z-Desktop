/**
 * 浏览器桥（主进程）：在窗口右侧维护一个「三标签面板」（宽 420，全 native WebContentsView）：
 *   - browser：顶部 toolbarView（地址栏 + 后退/前进/刷新）+ 下方 contentView（原浏览器页面）
 *   - fs     ：fsView（工作区目录树面板）
 *   - prev   ：prevView（文件预览面板）
 * 并把浏览器的控制能力以一个「MCP Streamable HTTP server」暴露出去（默认 /mcp）。
 * agent 侧用 @deepseek-ai/dsh-mcp-client 连本桥（mcp__browser__*），从而对话能
 * 按用户意图在这个 GUI 内嵌浏览器里导航/点击/输入/截图/读快照。
 * 除 /mcp 外，同一个 http server 还提供普通 REST 路由（/panel、/fs、/action、/ws）供面板页面取数/动作。
 *
 * 依赖：@modelcontextprotocol/sdk（两端同 SDK 保证协议兼容）。
 * 该文件是 CommonJS，内部用动态 import 加载 SDK（Electron main 主进程）。
 * @module dsh-gui/main/browser-bridge
 */

const path = require('node:path')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const { WebContentsView } = require('electron')
const { getWindow } = require('./window')

/** 内嵌 Dock 在窗口右侧占据的宽度。 */
const DOCK_WIDTH = 420
/** 通用页签栏高度（px，常驻面板顶部）。 */
const TAB_BAR_H = 40
/** browser 标签地址栏高度（px，位于页签栏下方）。 */
const TOOLBAR_H = 44
/** MCP 端点路径。 */
const MCP_PATH = '/mcp'
/** 截图保存根目录。 */
const SCREENSHOT_DIR = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'browser-screenshots')

// ---- 面板 HTML（三条内联字符串，供 /panel/<name> 返回） ----
// 统一浅色样式，id 用 rpn_ 前缀防冲突；脚本避免实验性语法（不用 ?. 等），fetch 均带错误显示。
// 这些页面对脚本内 `<` 等 HTML 转义没有硬性要求。

// 通用「页签栏」：常驻面板顶部，三页签 + 关闭 ✕，当前页签高亮。
// 支持 ?active=<tab> 查询参数（首次加载用），切换后由主进程 executeJavaScript 刷新高亮。
const TABBAR_HTML = `
<!doctype html><html><head><meta charset="utf-8"><title>面板</title><style>
html,body{margin:0;height:100%;overflow:hidden}
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f7f8fa}
#rpn_tabs{display:flex;align-items:center;gap:4px;white-space:nowrap;height:40px;padding:0 6px;background:#f7f8fa;border-bottom:1px solid #d4d8e4;box-sizing:border-box}
.rpn_tab{flex:0 0 auto;white-space:nowrap;display:flex;align-items:center;justify-content:center;height:40px;padding:0 10px;border:none;background:transparent;font-size:11px;color:#57606a;cursor:pointer;border-bottom:2px solid transparent}
.rpn_tab:hover{background:#eef1f6;color:#24292f}
.rpn_tab.active{color:#5B5BD6;font-weight:600;border-bottom-color:#5B5BD6;background:#fff}
#rpn_close{margin-left:auto;flex:0 0 auto;width:32px;height:40px;padding:0;border:none;background:transparent;font-size:15px;color:#57606a;cursor:pointer;border-bottom:2px solid transparent}
#rpn_close:hover{background:#fdecec;color:#c0392b}
</style></head><body>
<div id="rpn_tabs">
  <button class="rpn_tab" data-tab="browser" title="浏览器标签">浏览器</button>
  <button class="rpn_tab" data-tab="fs" title="目录标签">目录</button>
  <button class="rpn_tab" data-tab="prev" title="预览标签">预览</button>
  <button id="rpn_close" title="关闭面板">✕</button>
</div>
<script>
(function(){
  var m=new RegExp('[?&]active=([^&]*)').exec(location.search);
  var active=m?decodeURIComponent(m[1]):'';
  var tabs=document.querySelectorAll('.rpn_tab');
  tabs.forEach(function(b){
    if(b.getAttribute('data-tab')===active){ b.classList.add('active'); }
    b.addEventListener('click',function(){
      fetch('/action/tab',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tab:b.getAttribute('data-tab')})}).catch(function(){});
    });
  });
  document.getElementById('rpn_close').addEventListener('click',function(){
    fetch('/action/close',{method:'POST'}).catch(function(){});
  });
})();
</script></body></html>`

const TOOLBAR_HTML = `
<!doctype html><html><head><meta charset="utf-8"><title>导航</title><style>
html,body{margin:0;height:100%;overflow-y:auto}
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f2f3f5}
#rpn_bar{display:flex;align-items:center;gap:4px;white-space:nowrap;flex-wrap:nowrap;height:44px;padding:0 8px;background:#f2f3f5;border-bottom:1px solid #d4d8e4;box-sizing:border-box}
#rpn_bar button{flex:0 0 auto;white-space:nowrap;width:30px;height:28px;border:1px solid #d4d8e4;background:#fff;border-radius:6px;cursor:pointer;font-size:15px;line-height:1;color:#333}
#rpn_bar button:hover{background:#e8ecf3}
#rpn_u{flex:1 1 auto;min-width:0;height:28px;padding:0 8px;border:1px solid #d4d8e4;border-radius:6px;font-size:12px;outline:none}
#rpn_err{color:#c0392b;font-size:11px;padding:2px 8px;height:14px}
</style></head><body>
<div id="rpn_bar">
  <button id="rpn_back" title="后退">←</button>
  <button id="rpn_fwd" title="前进">→</button>
  <button id="rpn_reload" title="刷新">↻</button>
  <input id="rpn_u" type="text" placeholder="输入网址，回车跳转">
</div>
<div id="rpn_err"></div>
<script>
(function(){
  var u=document.getElementById('rpn_u');
  var err=document.getElementById('rpn_err');
  function show(m){ err.textContent=m||''; }
  function go(v){
    fetch('/action/navigate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:v})})
      .then(function(r){return r.json();})
      .then(function(d){ if(d && d.ok===false){ show(d.error||'导航失败'); } else { show(''); } })
      .catch(function(e){ show('导航出错: '+e.message); });
  }
  document.getElementById('rpn_back').addEventListener('click',function(){ go('#back'); });
  document.getElementById('rpn_fwd').addEventListener('click',function(){ go('#forward'); });
  document.getElementById('rpn_reload').addEventListener('click',function(){ go('#reload'); });
  u.addEventListener('keydown',function(e){
    if(e.key==='Enter'){ var v=u.value.trim(); if(v){ show(''); go(v); u.value=''; } }
  });
})();
</script></body></html>`

const FS_HTML = `
<!doctype html><html><head><meta charset="utf-8"><title>文件</title><style>
html,body{margin:0;height:100%}
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f7f8fa;color:#1f2328;font-size:12px;overflow-y:auto}
#rpn_hdr{padding:8px;background:#fff;border-bottom:1px solid #e3e6ec}
#rpn_ws{width:100%;height:30px;border:1px solid #d4d8e4;border-radius:6px;background:#fff;padding:0 6px;font-size:12px;outline:none}
#rpn_tree{overflow:auto;height:calc(100% - 48px);padding:6px}
.rpn_row{padding:4px 6px;border-radius:5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rpn_row:hover{background:#eef1f6}
.rpn_dir{color:#5B5BD6}
.rpn_file{color:#24292f}
#rpn_err{color:#c0392b;font-size:11px;padding:4px 8px}
</style></head><body>
<div id="rpn_hdr"><select id="rpn_ws"></select></div>
<div id="rpn_tree"></div>
<div id="rpn_err"></div>
<script>
(function(){
  var wsSel=document.getElementById('rpn_ws');
  var tree=document.getElementById('rpn_tree');
  var err=document.getElementById('rpn_err');
  function show(m){ err.textContent=m||''; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function previewFile(p){
    fetch('/action/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:p})})
      .then(function(r){return r.json();})
      .then(function(d){ if(d && d.ok===false){ show(d.error||'预览失败'); } })
      .catch(function(e){ show('预览出错: '+e.message); });
  }
  function fileRow(en){
    var row=document.createElement('div');
    row.className='rpn_row rpn_file';
    row.textContent=esc(en.name);
    row.title=esc(en.path);
    row.addEventListener('click',function(){ previewFile(en.path); });
    return row;
  }
  function dirRow(en){
    var row=document.createElement('div');
    row.className='rpn_row rpn_dir';
    var span=document.createElement('span');
    span.textContent='▶ '+esc(en.name);
    row.appendChild(span);
    var box=document.createElement('div');
    box.style.marginLeft='14px';
    box.style.display='none';
    row.appendChild(box);
    var open=false;
    row.addEventListener('click',function(){
      open=!open;
      span.textContent=(open?'▼ ':'▶ ')+esc(en.name);
      if(open){
        if(box.childNodes.length===0){ loadInto(en.path,box,function(){ box.style.display='block'; }); }
        else { box.style.display='block'; }
      } else { box.style.display='none'; }
    });
    return row;
  }
  function loadInto(dir,container,cb){
    fetch('/fs/tree?path='+encodeURIComponent(dir))
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d || d.ok===false){ show((d&&d.error)||('读取目录失败: '+dir)); if(cb)cb(); return; }
        (d.entries||[]).forEach(function(en){ container.appendChild(en.isDir?dirRow(en):fileRow(en)); });
        if(cb)cb();
      })
      .catch(function(e){ show('读取目录出错: '+e.message); if(cb)cb(); });
  }
  function selectWs(p){ loadInto(p,tree,null); }
  function loadWs(){
    fetch('/ws')
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d || d.ok===false){ show((d&&d.error)||'无法获取工作区'); return; }
        var ws=d.workspaces||[];
        ws.forEach(function(w){
          var opt=document.createElement('option');
          opt.value=w.path; opt.textContent=w.title;
          wsSel.appendChild(opt);
        });
        if(ws.length>0){ selectWs(ws[0].path); }
      })
      .catch(function(e){ show('获取工作区出错: '+e.message); });
  }
  wsSel.addEventListener('change',function(){ tree.innerHTML=''; show(''); selectWs(wsSel.value); });
  loadWs();
})();
</script></body></html>`

const PREV_HTML = `
<!doctype html><html><head><meta charset="utf-8"><title>预览</title><style>
html,body{margin:0;height:100%}
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f7f8fa;color:#1f2328;font-size:12px;display:flex;flex-direction:column;height:100%;box-sizing:border-box}
#rpn_hdr{padding:8px;background:#fff;border-bottom:1px solid #e3e6ec;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#rpn_content{flex:1;overflow:auto;margin:0;padding:10px;background:#fff;white-space:pre-wrap;word-break:break-all;font:12px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
#rpn_err{color:#c0392b;font-size:11px;padding:4px 8px}
</style></head><body>
<div id="rpn_hdr">文件预览</div>
<pre id="rpn_content">点文件预览</pre>
<div id="rpn_err"></div>
<script>
(function(){
  var content=document.getElementById('rpn_content');
  var hdr=document.getElementById('rpn_hdr');
  var err=document.getElementById('rpn_err');
  function show(m){ err.textContent=m||''; }
  function qs(name){
    var m=new RegExp('[?&]'+name+'=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\\+/g,' ')) : '';
  }
  function basename(s){
    var i=Math.max(String(s).lastIndexOf('/'), String(s).lastIndexOf('\\\\'));
    return i<0 ? String(s) : String(s).slice(i+1);
  }
  var p=qs('path');
  if(!p){
    content.textContent='点文件预览';
    hdr.textContent='文件预览';
    show('');
    return;
  }
  hdr.textContent=basename(p);
  fetch('/fs/file?path='+encodeURIComponent(p))
    .then(function(r){return r.json();})
    .then(function(d){
      if(!d || d.ok===false){ show((d&&d.error)||'读取失败'); return; }
      content.textContent=d.content;
    })
    .catch(function(e){ show('读取文件出错: '+e.message); });
})();
</script></body></html>`

const START_HTML = `
<!doctype html><html><head><meta charset="utf-8"><title>浏览器</title><style>
html,body{margin:0;height:100%}
body{font-family:ui-sans-serif,system-ui,sans-serif;background:#f7f8fa;color:#1f2328;display:flex;align-items:center;justify-content:center;height:100%;box-sizing:border-box}
#rpn_start{width:calc(100% - 40px);max-width:340px;padding:22px;background:#fff;border:1px solid #e3e6ec;border-radius:10px;box-sizing:border-box}
#rpn_start h1{margin:0 0 10px;font-size:16px;color:#24292f}
#rpn_start p{margin:0 0 16px;font-size:12px;line-height:1.6;color:#57606a}
#rpn_ph{height:120px;border:1px dashed #c9cedb;border-radius:8px;background:#f2f3f5;display:flex;align-items:center;justify-content:center;color:#8a91a0;font-size:12px}
</style></head><body>
<div id="rpn_start">
  <h1>浏览器</h1>
  <p>在地址栏输入网址，或让智能体（mcp__browser__*）导航。</p>
  <div id="rpn_ph">页面占位</div>
</div>
</body></html>`

// ---- 状态 ----
let view = null // browser contentView（底部内容区）
let toolbarView = null // browser 标签地址栏（页签栏下方）
let tabbarView = null // 通用页签栏（常驻面板顶部）
let fsView = null // fs 标签目录树面板
let prevView = null // prev 标签文件预览面板
let server = null // http.Server
let bridgePort = 0
let bridgeUrl = ''
let panelBaseUrl = ''
let backendUrl = ''
let currentTab = null // 'browser' | 'fs' | 'prev' | null（null=面板整体隐藏）
let visible = false
let toolbarLoaded = false
let tabbarLoaded = false
let fsLoaded = false
let viewLoaded = false

let lastInset = '' // 最近一次写入 dsh 页面的 paddingRight，仅值变化时写入一次。
let tabAnim = null // 标签切换过渡进行中标记：{ targetTab: string }

/** 确保窗口与四个 WebContentsView 都存在（惰性创建，不加入 contentView）。 */
function ensureViews() {
  const win = getWindow()
  if (!win || win.isDestroyed()) return null
  if (!view) view = new WebContentsView({ webPreferences: { sandbox: false } })
  if (!toolbarView) toolbarView = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } })
  if (!tabbarView) tabbarView = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } })
  if (!fsView) fsView = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } })
  if (!prevView) prevView = new WebContentsView({ webPreferences: { sandbox: false, contextIsolation: true } })
  return win
}

/** 从 contentView 移除某个已加入的子视图（空安全）。 */
function removeIfAdded(childView) {
  if (!childView) return
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  if (win.contentView.children.includes(childView)) win.contentView.removeChildView(childView)
}

/** 移除当前展示的所有视图（面板整体隐藏）。 */
function hidePanelViews() {
  removeIfAdded(tabbarView)
  removeIfAdded(toolbarView)
  removeIfAdded(view)
  removeIfAdded(fsView)
  removeIfAdded(prevView)
}

/** [1] 布局补偿：面板任一标签可见时，让 dsh 主页面在右侧让出 DOCK 宽度。仅值变化时写入一次。 */
async function applyPageInset(anyVisible) {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  const value = anyVisible ? `${DOCK_WIDTH}px` : '0px'
  if (!win.webContents || typeof win.webContents.executeJavaScript !== 'function') return
  if (value === lastInset) return
  lastInset = value
  try {
    await win.webContents.executeJavaScript(
      `(() => { if (document && document.documentElement) document.documentElement.style.paddingRight = ${JSON.stringify(value)}; })()`
    )
  } catch (e) {
    lastInset = '' // 写入失败则允许下次重试
  }
}

/** [3] 简单透明度过渡：约 5 步、每 30ms 一步，to 达到后回调 done。 */
function animateFade(wcView, from, to, done) {
  if (!wcView || typeof wcView.setOpacity !== 'function') {
    if (typeof done === 'function') done()
    return
  }
  let t = from
  const steps = 5
  const step = Math.abs(to - from) / steps
  wcView.setOpacity(from)
  const timer = setInterval(() => {
    t = to > from ? Math.min(to, t + step) : Math.max(to, t - step)
    wcView.setOpacity(t)
    if (t === to) {
      clearInterval(timer)
      if (typeof done === 'function') done()
    }
  }, 30)
}

/** 返回某标签应展示的视图组（页签栏常驻所有标签）。 */
function tabViewsFor(id) {
  if (id === 'browser') return [tabbarView, toolbarView, view]
  if (id === 'fs') return [tabbarView, fsView]
  if (id === 'prev') return [tabbarView, prevView]
  return []
}

/** 摆放当前标签到窗口右侧（resize 时调用）。 */
function layoutPanel() {
  const win = getWindow()
  if (!win || win.isDestroyed()) return
  const b = win.getContentBounds()
  const right = Math.max(0, b.width - DOCK_WIDTH)
  const width = DOCK_WIDTH
  const height = b.height
  if (currentTab === 'browser') {
    // 顶部页签栏 40，其下地址栏 44，再下为浏览器内容区。
    tabbarView.setBounds({ x: right, y: 0, width, height: TAB_BAR_H })
    toolbarView.setBounds({ x: right, y: TAB_BAR_H, width, height: TOOLBAR_H })
    view.setBounds({ x: right, y: TAB_BAR_H + TOOLBAR_H, width, height: Math.max(0, height - TAB_BAR_H - TOOLBAR_H) })
  } else if (currentTab === 'fs') {
    tabbarView.setBounds({ x: right, y: 0, width, height: TAB_BAR_H })
    fsView.setBounds({ x: right, y: TAB_BAR_H, width, height: Math.max(0, height - TAB_BAR_H) })
  } else if (currentTab === 'prev') {
    tabbarView.setBounds({ x: right, y: 0, width, height: TAB_BAR_H })
    prevView.setBounds({ x: right, y: TAB_BAR_H, width, height: Math.max(0, height - TAB_BAR_H) })
  }
}

/** 页签切换后刷新页签栏高亮（executeJavaScript 设 active 类，避免重载闪烁）。 */
function refreshTabbarHighlight(tab) {
  if (!tabbarView || !tabbarView.webContents) return
  const valid = (['browser', 'fs', 'prev'].indexOf(tab) !== -1) ? tab : 'browser'
  try {
    tabbarView.webContents.executeJavaScript(
      `(function(){document.querySelectorAll('.rpn_tab').forEach(function(b){b.classList.toggle('active', b.getAttribute('data-tab')===${JSON.stringify(valid)});});})()`
    ).catch(function(){})
  } catch (e) { /* 页面可能尚未加载完成，忽略 */ }
}

/** 切换到指定标签（'browser' | 'fs' | 'prev'）：平滑过渡，当前可见标签淡出后再切、新标签淡入。 */
function showTab(id) {
  const win = ensureViews()
  if (!win) return
  const tab = String(id || 'browser')
  // 无效标签：等价于整体隐藏。
  if (['browser', 'fs', 'prev'].indexOf(tab) === -1) { setVisible(false); return }
  // 已在目标标签且面板可见，且无进行中的切换 → 无操作。
  if (currentTab === tab && visible && !tabAnim) return
  // 记录目标；若已有切换进行中则按新目标继续（淡出完成后重算）。
  tabAnim = { targetTab: tab }
  runTabTransition(win)
}

function runTabTransition(win) {
  if (!tabAnim) return
  const own = [tabbarView, toolbarView, view, fsView, prevView]
  const cur = win.contentView.children.filter((c) => own.indexOf(c) !== -1)
  const onDone = () => {
    if (!tabAnim) return // 期间已被 setVisible(false) 取消
    // 先移除已淡出的旧视图。
    cur.forEach((c) => { if (win.contentView.children.indexOf(c) !== -1) win.contentView.removeChildView(c) })
    const focus = tabAnim.targetTab
    tabAnim = null
    if (['browser', 'fs', 'prev'].indexOf(focus) === -1) {
      currentTab = null
      visible = false
      applyPageInset(false)
      console.log('[dsh-gui] browser panel HIDE')
      return
    }
    currentTab = focus
    visible = true
    // 页签栏首次载入（带当前页签的 active 参数，保证首帧高亮）。
    if (!tabbarLoaded) { tabbarLoaded = true; tabbarView.webContents.loadURL(panelBaseUrl + '/panel/tabbar?active=' + focus) }
    win.contentView.addChildView(tabbarView)
    if (focus === 'browser') {
      if (!toolbarLoaded) { toolbarLoaded = true; toolbarView.webContents.loadURL(panelBaseUrl + '/panel/toolbar') }
      if (!viewLoaded) { viewLoaded = true; view.webContents.loadURL(panelBaseUrl + '/panel/start') }
      win.contentView.addChildView(toolbarView)
      win.contentView.addChildView(view)
    } else if (focus === 'fs') {
      if (!fsLoaded) { fsLoaded = true; fsView.webContents.loadURL(panelBaseUrl + '/panel/fs') }
      win.contentView.addChildView(fsView)
    } else if (focus === 'prev') {
      win.contentView.addChildView(prevView)
    }
    layoutPanel()
    applyPageInset(true)
    // 刷新页签栏高亮，跟随当前标签。
    refreshTabbarHighlight(focus)
    // 新标签淡入（第一次从全隐藏显示也用淡入）。
    tabViewsFor(focus).forEach((v) => animateFade(v, 0, 1, null))
    console.log(`[dsh-gui] browser panel show tab: ${focus}`)
  }
  if (cur.length === 0) { onDone(); return }
  // 当前可见标签淡出到 0 后再处理。
  let pending = cur.length
  cur.forEach((v) => animateFade(v, 1, 0, () => { if (--pending === 0) onDone() }))
}

/** 显示 / 隐藏面板（显示即切到浏览器标签）。 */
function setVisible(on) {
  const win = ensureViews()
  if (!win) return
  if (on) {
    showTab('browser')
  } else {
    tabAnim = null // 取消进行中的切换
    hidePanelViews()
    currentTab = null
    visible = false
    applyPageInset(false)
    console.log('[dsh-gui] browser panel HIDE')
  }
}

// ---- 浏览器动作 ----

function ensureLoadedView() {
  const win = ensureViews()
  if (!win) throw new Error('主窗口不可用')
  if (currentTab !== 'browser') showTab('browser')
  return view.webContents
}

async function navigate(urlString) {
  const wc = ensureLoadedView()
  let url = String(urlString || '').trim()
  if (!/^[a-z][a-z0-9+.-]*:/.test(url)) url = 'https://' + url
  viewLoaded = true // 已导航到真实页面，后续切回 browser 标签不再加载占位页
  await wc.loadURL(url)
  await wc.executeJavaScript('true', true)
  return { url: wc.getURL() }
}

async function snapshot() {
  const wc = ensureLoadedView()
  const text = await wc.executeJavaScript('(function(){ if(!document.body) return ""; var t=document.body.innerText||""; return t.slice(0,30000); })()', true)
  return { url: wc.getURL(), text }
}

async function screenshot() {
  const wc = ensureLoadedView()
  const image = await wc.capturePage()
  const png = image.toPNG()
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  const file = path.join(SCREENSHOT_DIR, `browser-${Date.now()}.png`)
  fs.writeFileSync(file, png)
  return { path: file, dataUrl: `data:image/png;base64,${Buffer.from(png).toString('base64')}` }
}

async function click(x, y) {
  const wc = ensureLoadedView()
  const px = Number(x); const py = Number(y)
  wc.sendInputEvent({ type: 'mouseDown', x: px, y: py, button: 'left', clickCount: 1 })
  wc.sendInputEvent({ type: 'mouseUp', x: px, y: py, button: 'left', clickCount: 1 })
  return { x: px, y: py }
}

async function typeText(text) {
  const wc = ensureLoadedView()
  wc.focus()
  wc.insertText(String(text || ''))
  return { inserted: String(text || '').length }
}

async function navigateBack() { ensureLoadedView().goBack(); return {} }
async function navigateForward() { ensureLoadedView().goForward(); return {} }
async function reload() { ensureLoadedView().reload(); return {} }

async function dispatchTool(name, args) {
  switch (name) {
    case 'navigate': return await navigate(args?.url)
    case 'back': return await navigateBack()
    case 'forward': return await navigateForward()
    case 'reload': return await reload()
    case 'click': return await click(args?.x, args?.y)
    case 'type': return await typeText(args?.text)
    case 'snapshot': return await snapshot()
    case 'screenshot': return await screenshot()
    case 'show': { setVisible(args?.visible !== false); return { visible } }
    default: throw new Error(`unknown tool: ${name}`)
  }
}

const TOOL_DEFS = [
  { name: 'navigate', description: '在 GUI 内嵌浏览器中打开/导航到 URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } },
  { name: 'back', description: '内嵌浏览器后退一页', inputSchema: { type: 'object', properties: {} } },
  { name: 'forward', description: '内嵌浏览器前进一页', inputSchema: { type: 'object', properties: {} } },
  { name: 'reload', description: '刷新内嵌浏览器当前页', inputSchema: { type: 'object', properties: {} } },
  { name: 'click', description: '在页面内按坐标单击（x,y 像素）', inputSchema: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] } },
  { name: 'type', description: '向当前聚焦输入框输入文本', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'snapshot', description: '抓取当前页可读文本（供 agent 判断页面内容）', inputSchema: { type: 'object', properties: {} } },
  { name: 'screenshot', description: '截图当前页，返回本地 PNG 路径与 dataUrl', inputSchema: { type: 'object', properties: {} } },
  { name: 'show', description: '显示/隐藏内嵌浏览器 Dock', inputSchema: { type: 'object', properties: { visible: { type: 'boolean' } } } },
]

// ---- MCP server ----

function resultOk(text) {
  return { content: [{ type: 'text', text }] }
}
function resultErr(message) {
  return { content: [{ type: 'text', text: String(message) }], isError: true }
}

// ---- REST 路由（/mcp 之外都走这里，不做 MCP 握手） ----

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}
function sendJson(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}
function sendHtml(res, code, html) {
  res.statusCode = code
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(html)
}

function handleRest(req, res) {
  let parsed
  try { parsed = new URL(req.url, 'http://127.0.0.1') } catch { sendJson(res, 400, { ok: false, error: 'bad url' }); return }
  const pathname = parsed.pathname
  const method = (req.method || 'GET').toUpperCase()

  // GET /panel/<name>（name ∈ fs|prev|toolbar|start）
  const panelMatch = /^\/panel\/([A-Za-z0-9]+?)(?:\.html)?$/.exec(pathname)
  if (panelMatch) {
    const name = panelMatch[1]
    if (name === 'toolbar') return sendHtml(res, 200, TOOLBAR_HTML)
    if (name === 'tabbar') return sendHtml(res, 200, TABBAR_HTML)
    if (name === 'fs') return sendHtml(res, 200, FS_HTML)
    if (name === 'prev') return sendHtml(res, 200, PREV_HTML)
    if (name === 'start') return sendHtml(res, 200, START_HTML)
    return sendJson(res, 404, { ok: false, error: 'unknown panel' })
  }

  // GET /fs/tree?path=<absDir>
  if (pathname === '/fs/tree' && method === 'GET') {
    const dir = parsed.searchParams.get('path')
    if (!dir) return sendJson(res, 400, { ok: false, error: 'path required' })
    fs.readdir(dir, { withFileTypes: true }, (err, children) => {
      if (err) return sendJson(res, 200, { ok: false, error: err.message })
      sendJson(res, 200, {
        ok: true,
        entries: children.map((c) => ({ name: c.name, path: path.join(dir, c.name), isDir: c.isDirectory() })),
      })
    })
    return
  }

  // GET /fs/file?path=<absFile>
  if (pathname === '/fs/file' && method === 'GET') {
    const file = parsed.searchParams.get('path')
    if (!file) return sendJson(res, 400, { ok: false, error: 'path required' })
    fs.readFile(file, 'utf8', (err, content) => {
      if (err) return sendJson(res, 200, { ok: false, error: err.message })
      sendJson(res, 200, { ok: true, content })
    })
    return
  }

  // POST /action/navigate body {url}
  if (pathname === '/action/navigate' && method === 'POST') {
    readBody(req).then(async (body) => {
      const u = String((body && body.url) || '').trim()
      if (!u) return sendJson(res, 400, { ok: false, error: 'url required' })
      try {
        // 工具条按钮使用的哨兵动作（复用 navigate 路径，避免为后退/前进/刷新另开路由）。
        if (u === '#back') { ensureLoadedView().goBack() }
        else if (u === '#forward') { ensureLoadedView().goForward() }
        else if (u === '#reload') { ensureLoadedView().reload() }
        else { await navigate(u) }
        sendJson(res, 200, { ok: true })
      } catch (e) {
        sendJson(res, 200, { ok: false, error: e.message })
      }
    })
    return
  }

  // POST /action/preview body {path}：fs 面板点文件 → 让 prevView 加载该文件预览页。
  if (pathname === '/action/preview' && method === 'POST') {
    readBody(req).then(async (body) => {
      const fp = String((body && body.path) || '').trim()
      if (!fp) return sendJson(res, 400, { ok: false, error: 'path required' })
      try {
        ensureViews()
        if (!prevView) return sendJson(res, 500, { ok: false, error: 'prev view unavailable' })
        prevView.webContents.loadURL(`${panelBaseUrl}/panel/prev.html?path=${encodeURIComponent(fp)}`)
        sendJson(res, 200, { ok: true })
      } catch (e) {
        sendJson(res, 200, { ok: false, error: e.message })
      }
    })
    return
  }

  // POST /action/tab body {tab}：工具条标签按钮切换面板标签。
  if (pathname === '/action/tab' && method === 'POST') {
    readBody(req).then((body) => {
      const tab = String((body && body.tab) || '')
      if (['browser', 'fs', 'prev'].indexOf(tab) !== -1) showTab(tab)
      sendJson(res, 200, { ok: true })
    })
    return
  }

  // POST /action/close：工具条关闭按钮隐藏整个面板。
  if (pathname === '/action/close' && method === 'POST') {
    setVisible(false)
    sendJson(res, 200, { ok: true })
    return
  }

  // GET /ws：从后端拉工作区列表，透传给面板。
  if (pathname === '/ws' && method === 'GET') {
    if (!backendUrl) return sendJson(res, 200, { ok: false, error: 'backend not set' })
    fetch(`${backendUrl}/plugins/dsh-conversation-tools/api/workspaces`)
      .then((r) => r.json())
      .then((data) => sendJson(res, 200, data))
      .catch((e) => sendJson(res, 200, { ok: false, error: e.message }))
    return
  }

  sendJson(res, 404, { ok: false, error: 'not found' })
}

async function startBrowserBridge() {
  if (bridgePort !== 0) return { url: bridgeUrl }
  const mcp = await import('@modelcontextprotocol/sdk/server/index.js')
  const sdkHttp = await import('@modelcontextprotocol/sdk/server/streamableHttp.js')

  const Server = mcp.Server
  const StreamableHTTPServerTransport = sdkHttp.StreamableHTTPServerTransport

  const { ListToolsRequestSchema, CallToolRequestSchema } = await import('@modelcontextprotocol/sdk/types.js')

  // 每个 MCP「逻辑会话」都建一个独立的 SDK Server（Server 实例只能 connect 到
  // 单个 transport；多会话必须各自独立），共用同一份工具定义与动作分派。
  function makeMCPServer() {
    const s = new Server({ name: 'dsh-browser', version: '0.1.0' }, { capabilities: { tools: { listChanged: false } } })
    s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }))
    s.setRequestHandler(CallToolRequestSchema, async (req) => {
      const name = req.params.name
      const args = req.params.arguments ?? {}
      try {
        const r = await dispatchTool(name, args)
        return resultOk(JSON.stringify(r))
      } catch (error) {
        return resultErr(error instanceof Error ? error.message : String(error))
      }
    })
    return s
  }

  // 一个 MCP「逻辑会话」持有一个 transport+server（各自独立、只 connect 一次）；跨多个 HTTP 请求复用。
  // 客户端会带 mcp-session-id 头复用会话；未带则视为新会话。
  const sessions = new Map()
  let sessionSeq = 0
  server = http.createServer(async (req, res) => {
    if (req.url === MCP_PATH) {
      // ---- MCP（保持原生 streamable-http 处理，不做任何改动）----
      const incoming = typeof req.headers['mcp-session-id'] === 'string' ? req.headers['mcp-session-id'] : ''
      const existing = incoming ? sessions.get(incoming) : undefined
      if (existing) {
        await existing.transport.handleRequest(req, res)
        return
      }
      // 新逻辑会话：预生成 id，transport 用该 id 生成 sessionId，客户端 header 复用它。
      const id = `db-${++sessionSeq}`
      const srv = makeMCPServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => id,
        onsessioninitialized: () => { sessions.set(id, { transport, server: srv }) },
      })
      sessions.set(id, { transport, server: srv })
      try {
        await srv.connect(transport)
      } catch (connectError) {
        console.error('[dsh-gui] browser bridge MCP connect:', connectError)
        sessions.delete(id)
        if (!res.headersSent) res.statusCode = 500
        res.end()
        return
      }
      await transport.handleRequest(req, res)
      return
    }
    // ---- 其余路径一律走 REST，不做 MCP 握手 ----
    handleRest(req, res)
  })

  bridgePort = await new Promise((resolvePort) => {
    server.listen(0, '127.0.0.1', () => resolvePort(server.address().port))
  })
  bridgeUrl = `http://127.0.0.1:${bridgePort}${MCP_PATH}`
  panelBaseUrl = `http://127.0.0.1:${bridgePort}`
  console.log(`[dsh-gui] browser bridge MCP ready: ${bridgeUrl}`)
  return { url: bridgeUrl }
}

function getBridgeUrl() {
  return bridgeUrl
}

/** 让桥知道后端 base URL（index.js 在 startBackend 后调用），供 /ws 拉取工作区。 */
function setBackendUrl(baseUrl) {
  backendUrl = String(baseUrl || '').replace(/\/+$/, '')
}

/** 释放所有视图与 HTTP 服务（应用退出/窗口关闭时）。 */
function disposeBrowserBridge() {
  try { if (view) { view.webContents?.close?.(); view = null } } catch { /* noop */ }
  try { if (toolbarView) { toolbarView.webContents?.close?.(); toolbarView = null } } catch { /* noop */ }
  try { if (tabbarView) { tabbarView.webContents?.close?.(); tabbarView = null } } catch { /* noop */ }
  try { if (fsView) { fsView.webContents?.close?.(); fsView = null } } catch { /* noop */ }
  try { if (prevView) { prevView.webContents?.close?.(); prevView = null } } catch { /* noop */ }
  try { if (server) { server.close(); server = null } } catch { /* noop */ }
}

/** 前端开关：切换面板显隐，返回新状态。 */
function toggleVisible() {
  if (currentTab) setVisible(false)
  else setVisible(true)
  return { visible: !!currentTab }
}

module.exports = {
  startBrowserBridge,
  getBridgeUrl,
  setVisible,
  toggleVisible,
  setBackendUrl,
  showTab,
  layoutPanel,
  disposeBrowserBridge,
  DOCK_WIDTH,
}