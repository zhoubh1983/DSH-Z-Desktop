/**
 * dsh-embedded-browser 客户端：在右侧边栏注册「浏览器」标签页。
 *
 * 零构建模式（与 dsh-memory-plugin / dsh-webhook-plugin 一致）：
 *  - window.__ModuleLoader__.load 注册浏览器插件包；
 *  - 经 sidebarRightTabs 注册 tab 类型（id/kind = 'embedded-browser'）；
 *  - 向 keyed seat `sidebar.right.pane.tab` / `.tab.title` 注入面板体与芯片标题；
 *  - 面板体 = 地址栏 + <webview>（依赖主窗口 webviewTag: true）。
 *
 * Agent 侧的 webview_* 工具不经过这里：它们由主进程浏览器桥
 * （DSH_BROWSER_BRIDGE_URL）驱动同一个 webview 访客页面，两边看到的
 * 是同一个 guest，导航事件互相可见。
 */
window.__ModuleLoader__.load({ id: 'dsh-embedded-browser', factory: (require) => {
  const module = { exports: {} }
  const React = require('react')
  const { useEffect, useRef, useState } = React

  const SIDEBAR_BROWSER_ID = 'embedded-browser'
  const SIDEBAR_BROWSER_KIND = 'embedded-browser'
  const GUIDE_ORDER = 30

  const s = {
    root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
    bar: { display: 'flex', gap: 6, padding: '8px', alignItems: 'center', flexShrink: 0, borderBottom: '1px solid var(--border-color, #e4e4e7)' },
    btn: { flexShrink: 0, width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-color, #e4e4e7)', background: 'var(--surface-color, transparent)', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1 },
    input: { flex: 1, minWidth: 0, height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-color, #e4e4e7)', background: 'var(--field-color, transparent)', color: 'inherit', fontSize: 12, outline: 'none', boxSizing: 'border-box' },
    go: { flexShrink: 0, height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid var(--border-color, #e4e4e7)', background: 'var(--field-color, transparent)', color: 'inherit', cursor: 'pointer', fontSize: 12, fontWeight: 600 },
    view: { flex: 1, minHeight: 0, width: '100%', border: 'none', background: '#ffffff' },
    hint: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 24, textAlign: 'center' },
    hintTitle: { margin: 0, fontSize: 14, fontWeight: 600, opacity: 0.9 },
    hintText: { margin: 0, fontSize: 12, opacity: 0.6, lineHeight: 1.6 },
    titleLabel: { marginLeft: 6, fontSize: 12 },
  }

  /** 无协议时补 https://。 */
  function normalizeUrl(raw) {
    const value = (raw || '').trim()
    if (!value) return ''
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`
  }

  /** 地球图标（芯片与 guide 胶囊共用）。 */
  function BrowserIcon({ size = 16, className }) {
    return React.createElement('svg', {
      width: size, height: size, viewBox: '0 0 16 16', className,
      'aria-hidden': 'true', xmlns: 'http://www.w3.org/2000/svg', fill: 'none',
    },
      React.createElement('circle', { cx: 8, cy: 8, r: 6.5, stroke: 'currentColor', strokeWidth: 1.2 }),
      React.createElement('path', {
        d: 'M1.8 8h12.4M8 1.6c1.9 1.9 2.9 4 2.9 6.4S9.9 12.5 8 14.4M8 1.6C6.1 3.5 5.1 5.6 5.1 8s1 4.5 2.9 6.4',
        stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round',
      }))
  }

  /** 面板体：地址栏 + <webview>（webview 常驻，默认 about:blank，无需手动“点火”）。 */
  function EmbeddedBrowser() {
    const webviewRef = useRef(null)
    // 输入框文本与 webview 实际加载地址分离：输入不触发导航，回车/点“打开”才导航。
    const [typed, setTyped] = useState('')
    const [target, setTarget] = useState('about:blank')

    // webview 挂载后跟随导航事件，把真实地址回填到输入框（也同步 target，避免反向漂移）。
    useEffect(() => {
      const el = webviewRef.current
      if (!el) return
      const onNavigate = (e) => { const u = e && e.url; if (u) { setTyped(u); setTarget(u) } }
      el.addEventListener('did-navigate', onNavigate)
      el.addEventListener('did-navigate-in-page', onNavigate)
      return () => {
        el.removeEventListener('did-navigate', onNavigate)
        el.removeEventListener('did-navigate-in-page', onNavigate)
      }
    }, [])

    const navigate = (raw) => {
      const url = normalizeUrl(raw)
      if (!url) return
      setTyped(url)
      setTarget(url)
    }
    const goBack = () => { const el = webviewRef.current; if (el) el.goBack() }
    const goForward = () => { const el = webviewRef.current; if (el) el.goForward() }
    const reload = () => { const el = webviewRef.current; if (el) el.reload() }

    // 引导提示：仅当尚未导航过真实 http(s) 页面时显示（覆盖在 webview 之上）。
    const blank = !target || /^(about|chrome):/.test(target)

    return React.createElement('div', { style: s.root },
      React.createElement('div', { style: s.bar },
        React.createElement('button', { style: s.btn, onClick: goBack, title: '后退' }, '\u2190'),
        React.createElement('button', { style: s.btn, onClick: goForward, title: '前进' }, '\u2192'),
        React.createElement('button', { style: s.btn, onClick: reload, title: '刷新' }, '\u21BB'),
        React.createElement('input', {
          style: s.input,
          value: typed,
          placeholder: '输入网址，如 https://www.baidu.com',
          spellCheck: false,
          onChange: (e) => setTyped(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Enter') navigate(typed) },
        }),
        React.createElement('button', { style: s.go, onClick: () => navigate(typed) }, '打开'),
      ),
      React.createElement('div', { style: { flex: 1, minHeight: 0, position: 'relative', display: 'flex' } },
        React.createElement('webview', { ref: webviewRef, src: target, allowpopups: 'true', style: s.view }),
        blank
          ? React.createElement('div', { style: Object.assign({}, s.hint, { position: 'absolute', inset: 0 }) },
            React.createElement('p', { style: s.hintTitle }, '内嵌浏览器'),
            React.createElement('p', { style: s.hintText }, '在上方输入网址打开网页，或直接让 DSH 用「打开网站」类工具为你导航。'))
          : null))
  }

  /** 芯片标题：图标 + 浏览器。 */
  function BrowserTabTitle() {
    return React.createElement(React.Fragment, null,
      React.createElement(BrowserIcon, { size: 16 }),
      React.createElement('span', { style: s.titleLabel }, '\u6D4F\u89C8\u5668'))
  }

  /**
   * 注册 tab 类型 + 面板体 + 芯片标题。
   * sidebarRightTabs 是 ui-sidebar-right 的 reflect 服务，用 ctx.inject 懒取；
   * 在该服务不可用的 harness 上回调不触发、注册整体跳过。
   */
  function watchSidebarBrowserTab(ctx) {
    if (typeof ctx.inject !== 'function') return null
    const handle = ctx.inject(['sidebarRightTabs'], (raw) => {
      const injected = raw
      const disposers = []
      const own = (result) => { if (typeof result === 'function') disposers.push(result) }
      try {
        const tabs = injected.sidebarRightTabs
        if (tabs === undefined || typeof tabs.register !== 'function') return
        own(tabs.register({
          id: SIDEBAR_BROWSER_ID,
          kind: SIDEBAR_BROWSER_KIND,
          title: () => '\u6D4F\u89C8\u5668',
          guide: [{
            order: GUIDE_ORDER,
            title: () => '\u6D4F\u89C8\u5668',
            description: () => '\u5728\u53F3\u4FA7\u6253\u5F00\u4E00\u4E2A\u5185\u5D4C\u6D4F\u89C8\u5668\uFF0C\u53EF\u6D4F\u89C8\u7F51\u9875\u3002',
            icon: BrowserIcon,
          }],
        }))
        own(injected.slots.inject('sidebar.right.pane.tab', () => injected.slots.register({
          name: 'sidebar.right.pane.tab',
          key: SIDEBAR_BROWSER_ID,
        }, EmbeddedBrowser)))
        own(injected.slots.inject('sidebar.right.pane.tab.title', () => injected.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: SIDEBAR_BROWSER_ID,
        }, BrowserTabTitle)))
      } catch {
        for (const d of disposers) d()
        return
      }
      return () => { for (const d of disposers) d() }
    })
    return handle
  }

  function apply(ctx) {
    const handle = watchSidebarBrowserTab(ctx)
    return () => { if (handle && typeof handle.dispose === 'function') handle.dispose() }
  }

  module.exports = { name: 'dsh-embedded-browser', inject: ['slots'], apply }
  return module.exports
} })
