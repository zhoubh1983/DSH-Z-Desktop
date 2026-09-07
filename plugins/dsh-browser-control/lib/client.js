/**
 * dsh-browser-control 客户端：在 dsh web 界面注入一个极小的悬浮触发条（右下角），
 * 点击通过 preload 暴露的 window.dshGui.browser.toggle 切换右侧面板显隐（Browser 标签）。
 * 零构建、原生 DOM（与 dsh-conversation-tools 一致），任意页面可见。
 */
window.__ModuleLoader__.load({ id: 'dsh-browser-control', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports

  function togglePanel() {
    if (window.dshGui && window.dshGui.browser && typeof window.dshGui.browser.toggle === 'function') {
      window.dshGui.browser.toggle()
    }
  }

  const ID = 'dbc-toggle-bar'

  function ensureToggleBar() {
    if (document.getElementById(ID)) return
    const btn = document.createElement('button')
    btn.id = ID
    btn.type = 'button'
    btn.textContent = '🧭 面板'
    btn.setAttribute('aria-label', '浏览器面板开关')
    btn.setAttribute('title', '浏览器面板 (Cmd/Ctrl+Shift+B)')
    btn.addEventListener('click', (ev) => {
      ev.preventDefault()
      togglePanel()
    })
    document.body.appendChild(btn)
    Object.assign(btn.style, {
      position: 'fixed', top: '52px', right: '18px', zIndex: '999999',
      display: 'inline-block', whiteSpace: 'nowrap',
      font: '500 12px/1 ui-sans-serif, system-ui, sans-serif', cursor: 'pointer',
      color: '#4A4A55', background: 'rgba(255,255,255,.92)', border: '1px solid #D4D8E4',
      borderRadius: '999px', padding: '6px 12px', boxShadow: '0 2px 10px rgba(16,24,40,.14)',
      opacity: '.92', userSelect: 'none',
    })
  }

  function apply() {
    ensureToggleBar()
  }

  module.exports = { name: 'dsh-browser-control-client', inject: ['slots'], apply }
  return module.exports
} })