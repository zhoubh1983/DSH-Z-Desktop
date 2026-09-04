/**
 * dsh-conversation-tools 客户端：在 dsh web 对话界面输入区上方（conversation.composer.dock）
 * 注入一条便捷工具行：
 *   - 「精简历史」：通过会话通道 send('/compact') 触发 dsh 内置的历史压缩；
 *   - 「定位工作区文件夹」：拉取 /api/workspaces 列出全部工作区，点击调用 /api/open
 *     在本地资源管理器定位/打开对应目录。
 * 零构建（与 dsh-skill-market / dsh-memory-plugin 一致的 ModuleLoader + slots 注入模式）。
 */
window.__ModuleLoader__.load({ id: 'dsh-conversation-tools', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useState } = React
  const el = React.createElement
  const API = '/plugins/dsh-conversation-tools/api'

  // 运行时缓存：apply(ctx) 里写入，组件通过闭包访问（拿 ctx.conversation 发 /compact）。
  let actx = null

  // ---------- 样式注入（一次性） ----------
  let styleInjected = false
  function ensureStyles() {
    if (styleInjected) return
    styleInjected = true
    if (document.getElementById('dsh-conversation-tools-style')) return
    const style = document.createElement('style')
    style.id = 'dsh-conversation-tools-style'
    style.textContent = `
.dctg-wrap {
  display:flex; align-items:center; gap:8px; padding:4px 2px 0;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size:12px; color:#667085;
}
.dctg-btn {
  font: inherit; font-size:12px; font-weight:500; color:#667085;
  background: transparent; border:1px solid transparent; border-radius:8px; padding:4px 10px;
  cursor: pointer; display:inline-flex; align-items:center; gap:5px; white-space:nowrap;
}
.dctg-btn:hover { color:#5B5BD6; background:rgba(91,91,214,.08); }
.dctg-btn:disabled { opacity:.5; cursor:not-allowed; }
.dctg-pop {
  position:relative; display:flex; flex-wrap:wrap; gap:6px; align-items:center;
  background:var(--ds-bg,#F5F6FA); border:1px solid #E4E7EF; border-radius:10px; padding:6px 8px;
}
.dctg-row {
  display:flex; align-items:center; gap:6px; max-width:300px;
  background:#fff; border:1px solid #E4E7EF; border-radius:999px; padding:3px 6px 3px 10px;
}
.dctg-row:hover { border-color:#D4D8E4; }
.dctg-path {
  font-family: ui-monospace, Consolas, monospace; font-size:11px; color:#1F2933;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:220px; display:inline-block;
}
.dctg-open { font:inherit; font-size:11px; color:#5B5BD6; background:transparent; border:none; cursor:pointer; padding:4px 6px; white-space:nowrap; }
.dctg-open:hover { text-decoration:underline; }
.dctg-msg { color:#12B76A; font-size:12px; }
.dctg-msg.err { color:#E5484D; }
@media (prefers-color-scheme: dark) {
  .dctg-wrap { color:#A1A1AC; }
  .dctg-btn { color:#A1A1AC; }
  .dctg-btn:hover { color:#8F8FEE; background:rgba(143,143,238,.1); }
  .dctg-pop { background:#1B1B21; border-color:#3A3A44; }
  .dctg-row { background:#232329; border-color:#3A3A44; }
  .dctg-path { color:#E6E6EB; }
  .dctg-open { color:#8F8FEE; }
}
.dctg-ctx {
  position:fixed; z-index:20000; min-width:220px; max-width:320px; box-sizing:border-box;
  background:#fff; border:1px solid #E4E7EF; border-radius:10px; box-shadow:0 10px 30px rgba(16,24,40,.16);
  padding:6px; font-family: ui-sans-serif, system-ui, sans-serif;
}
.dctg-ctx-lbl {
  font-size:11px; color:#98A2B3; padding:4px 10px; overflow:hidden; text-overflow:ellipsis;
  white-space:nowrap; font-family: ui-monospace, Consolas, monospace;
}
.dctg-ctx-it {
  display:flex; align-items:center; width:100%; text-align:left; font:inherit; font-size:13px; font-weight:500;
  color:#1F2933; background:none; border:none; border-radius:7px; padding:8px 10px; cursor:pointer;
}
.dctg-ctx-it:hover { background:rgba(91,91,214,.12); color:#4B4FD1; }
.dctg-ctx-hr { height:1px; background:#E4E7EF; margin:6px; border:0; }
.dctg-ctx-toast {
  position:fixed; left:50%; bottom:32px; transform:translateX(-50%); color:#fff; font-size:13px;
  padding:9px 16px; border-radius:999px; z-index:30000; box-shadow:0 8px 24px rgba(16,24,40,.24);
  font-family: ui-sans-serif, system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) {
  .dctg-ctx { background:#232329; border-color:#3A3A44; }
  .dctg-ctx-lbl { color:#6E6E7A; }
  .dctg-ctx-it { color:#E6E6EB; }
  .dctg-ctx-it:hover { color:#8F8FEE; background:rgba(143,143,238,.14); }
  .dctg-ctx-hr { background:#3A3A44; }
}
`
    document.head.appendChild(style)
  }

  // ---------- API ----------
  async function fetchJson(url, options) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: options && options.body ? { 'content-type': 'application/json' } : {},
      ...options,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  }

  // ---------- 左侧工作区行：右键菜单（原生 DOM，不依赖 React 挂载，欢迎页也生效）----------
  let ctxInstalled = false
  let ctxMenu = null
  let ctxToastTimer = null
  function closeCtxMenu() {
    if (ctxMenu) { ctxMenu.remove(); ctxMenu = null }
    document.removeEventListener('click', onDocClickCapture, true)
    document.removeEventListener('scroll', closeCtxMenu, true)
    document.removeEventListener('keydown', onCtxKeydown, true)
  }
  function onCtxKeydown(e) { if (e.key === 'Escape') closeCtxMenu() }
  function onDocClickCapture(e) { if (ctxMenu && ctxMenu.contains(e.target)) return; closeCtxMenu() }
  function showCtxToast(text, err) {
    let t = document.querySelector('.dctg-ctx-toast')
    if (!t) { t = document.createElement('div'); t.className = 'dctg-ctx-toast'; document.body.appendChild(t) }
    t.textContent = text
    t.style.background = err ? '#E5484D' : '#1F2933'
    clearTimeout(ctxToastTimer)
    ctxToastTimer = setTimeout(() => { if (t && t.isConnected) t.remove() }, 2400)
  }
  async function openWorkspaceExplorer(path) {
    try {
      await fetchJson(`${API}/open`, { method: 'POST', body: JSON.stringify({ path }) })
      showCtxToast('已在资源管理器中打开')
    } catch (error) {
      showCtxToast(error instanceof Error ? error.message : String(error), true)
    }
  }
  async function onWorkspaceContextMenu(event) {
    const target = event.target
    const row = target && target.closest ? target.closest('[role="treeitem"]') : null
    // 仅处理左侧「工作区分组头行」：role=treeitem + aria-expanded（会话行无 aria-expanded，不劫持）
    if (!row || !row.hasAttribute('aria-expanded')) return
    event.preventDefault()
    const title = (row.textContent || '').trim()
    let path = null
    try {
      const data = await fetchJson(`${API}/workspaces`)
      const list = data && data.ok ? data.workspaces : []
      const hit = list.find(w => w.title === title || w.path === title)
      if (hit) path = hit.path
    } catch { path = null }
    if (!path) return
    closeCtxMenu()
    ctxMenu = document.createElement('div')
    ctxMenu.className = 'dctg-ctx'
    ctxMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 300)}px`
    ctxMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 150)}px`
    const label = document.createElement('div'); label.className = 'dctg-ctx-lbl'; label.textContent = path; label.title = path
    const openBtn = document.createElement('button'); openBtn.type = 'button'; openBtn.className = 'dctg-ctx-it'; openBtn.textContent = '在资源管理器中打开'
    openBtn.addEventListener('click', () => { const p = path; closeCtxMenu(); openWorkspaceExplorer(p) })
    const copyBtn = document.createElement('button'); copyBtn.type = 'button'; copyBtn.className = 'dctg-ctx-it'; copyBtn.textContent = '复制路径'
    copyBtn.addEventListener('click', () => {
      const p = path; closeCtxMenu()
      try { navigator.clipboard.writeText(p).then(() => showCtxToast('路径已复制')).catch(() => showCtxToast('复制失败', true)) }
      catch { showCtxToast('复制失败', true) }
    })
    const hr = document.createElement('div'); hr.className = 'dctg-ctx-hr'
    ctxMenu.appendChild(label); ctxMenu.appendChild(hr); ctxMenu.appendChild(openBtn); ctxMenu.appendChild(copyBtn)
    document.body.appendChild(ctxMenu)
    document.addEventListener('click', onDocClickCapture, true)
    document.addEventListener('scroll', closeCtxMenu, true)
    document.addEventListener('keydown', onCtxKeydown, true)
  }
  function installContextMenu() {
    if (ctxInstalled) return
    ctxInstalled = true
    document.addEventListener('contextmenu', onWorkspaceContextMenu, true)
  }

  // ---------- 工具行组件 ----------
  function Icon({ name, size = 13 }) {
    const paths = {
      compress: '<path d="m16 3 4 4-4 4"/><path d="M20 7H9"/><path d="m8 13-4 4 4 4"/><path d="M4 17h11"/>',
      folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    }
    return el('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
      dangerouslySetInnerHTML: { __html: paths[name] || '' },
    })
  }

  function ConversationToolsBar(_props) {
    const [listing, setListing] = useState(false)
    const [workspaces, setWorkspaces] = useState(null) // null=未拉取 / array=已拉取
    const [busy, setBusy] = useState(false)
    const [msg, setMsg] = useState(null) // { text, err }
    const [loading, setLoading] = useState(false)

    const notify = (text, err) => setMsg({ text, err: !!err })

    const compactHistory = async () => {
      if (busy) return
      setBusy(true)
      setMsg(null)
      try {
        const convo = actx && (actx.conversation || actx.get?.('conversation'))
        if (!convo || typeof convo.send !== 'function') {
          notify('会话通道不可用，可直接输入 /compact', true)
          return
        }
        await convo.send('/compact')
        notify('已触发 /compact 历史压缩')
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), true)
      } finally {
        setBusy(false)
      }
    }

    const toggleList = async () => {
      if (listing && workspaces) { setListing(false); return }
      setListing(true)
      setMsg(null)
      if (workspaces === null) {
        setLoading(true)
        try {
          const data = await fetchJson(`${API}/workspaces`)
          setWorkspaces(data && data.ok ? data.workspaces : [])
        } catch (error) {
          notify(error instanceof Error ? error.message : String(error), true)
          setWorkspaces([])
        } finally {
          setLoading(false)
        }
      }
    }

    const openPath = async (p) => {
      setMsg(null)
      try {
        await fetchJson(`${API}/open`, { method: 'POST', body: JSON.stringify({ path: p }) })
        notify('已在资源管理器中打开')
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), true)
      }
    }

    return el('div', { className: 'dctg-wrap' },
      el('button', { type: 'button', className: 'dctg-btn', disabled: busy, title: '触发 /compact，把较早的历史对话压缩成摘要', onClick: compactHistory },
        el(Icon, { name: 'compress' }), '精简历史'),
      el('button', { type: 'button', className: 'dctg-btn', title: '列出工作区并在文件资源管理器中定位', onClick: toggleList },
        el(Icon, { name: 'folder' }), '定位工作区文件夹'),
      listing && el('div', { className: 'dctg-pop' },
        loading
          ? el('span', null, '加载中…')
          : workspaces.length === 0
            ? el('span', null, '暂无工作区')
            : workspaces.map((w) => el('span', { key: w.id, className: 'dctg-row' },
                el('span', { className: 'dctg-path', title: w.path }, w.path),
                el('button', { type: 'button', className: 'dctg-open', onClick: () => openPath(w.path) }, '打开'),
              )),
      ),
      msg ? el('span', { className: msg.err ? 'dctg-msg err' : 'dctg-msg' }, msg.text) : null,
    )
  }

  // ---------- 组件 ----------
  function apply(ctx) {
    actx = ctx
    const registerTools = () => {
      try {
        ctx.slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-conversation-tools',
          order: 10,
          inject: () => ({}),
        }, ConversationToolsBar)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) console.error('[dsh-conversation-tools] failed to register composer.dock:', error)
      }
    }
    try {
      ctx.slots.inject('conversation.composer.dock', registerTools)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) console.error('[dsh-conversation-tools] failed to inject conversation slot:', error)
    }
    ensureStyles()
    installContextMenu()
  }

  module.exports = {
    name: 'dsh-conversation-tools-client',
    inject: ['slots', 'conversation'],
    apply,
  }
  return module.exports
} })