/**
 * dsh-skill-market 客户端：在 DSH Web UI「设置」注册一级菜单「技能市场」控制面板。
 *
 * 零构建模式（与 dsh-memory-plugin / dafeiyu 一致）：
 *  - window.__ModuleLoader__.load 注册浏览器插件包；
 *  - ctx.slots 注入 settings.section 注册一级设置菜单；
 *  - 通过 /plugins/dsh-skill-market/* 管理 API 读写（Host 侧 webServer 提供）。
 *
 * UI 为「原型 v3」落地：卡片化技能列表 + 来源/分类视觉编码 + 搜索/分类/排序、
 * 卡片展开懒加载详情（GET /api/detail）、市场设置弹窗、安装/卸载/更新 + loading/toast。
 */
window.__ModuleLoader__.load({ id: 'dsh-skill-market', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useState, useMemo, useRef, useCallback } = React
  const el = React.createElement
  const API = '/plugins/dsh-skill-market/api'

  // ---------- 常量 ----------
  const CATEGORY_NAMES = { document: '文档', development: '开发', creative: '创意', communication: '沟通', other: '其他' }
  const CATEGORY_ORDER = ['document', 'development', 'creative', 'communication', 'other']
  const SOURCE_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', vercel: 'Vercel' }
  const SOURCE_CLS = { anthropic: 'a', openai: 'o', vercel: 'v' }

  const ICON_PATHS = {
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  }

  function Icon({ name, size = 16 }) {
    return el('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      dangerouslySetInnerHTML: { __html: ICON_PATHS[name] || '' },
    })
  }

  // ---------- 样式注入（一次性） ----------
  let styleInjected = false
  function ensureStyles() {
    if (styleInjected) return
    styleInjected = true
    const style = document.createElement('style')
    style.id = 'dsh-skill-market-style'
    style.textContent = `
:root {
  --dsm-primary: #5B5BD6; --dsm-primary-hover: #4B4FD1; --dsm-primary-soft: #EFEFFF;
  --dsm-bg: #F5F6FA; --dsm-surface: #FFFFFF; --dsm-border: #E4E7EF; --dsm-border-strong: #D4D8E4;
  --dsm-text: #1F2933; --dsm-text-sub: #667085; --dsm-text-faint: #98A2B3;
  --dsm-success: #12B76A; --dsm-danger: #E5484D;
  --dsm-a: #C2703D; --dsm-o: #0E9E9B; --dsm-v: #2E5BFF;
}
@media (prefers-color-scheme: dark) {
  :root { --dsm-bg: #1B1B21; --dsm-surface: #232329; --dsm-border: #3A3A44; --dsm-border-strong: #4A4A56;
    --dsm-text: #E6E6EB; --dsm-text-sub: #A1A1AC; --dsm-text-faint: #6E6E7A; --dsm-primary-soft: #2E2A5E; }
}
.dsm-wrap { list-style: none; padding: 0; margin: 0; }
.dsm-card { background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 12px; padding: 16px; display: grid; gap: 14px; }
.dsm-head { display: grid; gap: 4px; }
.dsm-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 16px; font-weight: 600; color: var(--dsm-text, #1f2933); }
.dsm-title::before { content: ""; width: 8px; height: 8px; border-radius: 999px; background: var(--dsm-primary, #5b5bd6); }
.dsm-sub { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsm-text-sub, #667085); }
.dsm-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.dsm-stat { background: var(--dsm-bg, #f5f6fa); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 8px; padding: 10px 12px; display: grid; gap: 2px; }
.dsm-stat .n { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--dsm-text, #1f2933); }
.dsm-stat .n.brand { color: var(--dsm-primary, #5b5bd6); }
.dsm-stat .l { font-size: 12px; color: var(--dsm-text-sub, #667085); }
.dsm-toolbar { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; }
.dsm-search { position: relative; }
.dsm-search .i { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--dsm-text-faint, #98a2b3); pointer-events: none; }
.dsm-input { font: inherit; font-size: 13px; color: var(--dsm-text, #1f2933); background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 8px; padding: 7px 10px; width: 100%; box-sizing: border-box; }
.dsm-input::placeholder { color: var(--dsm-text-faint, #98a2b3); }
.dsm-input:focus { outline: none; border-color: var(--dsm-primary, #5b5bd6); box-shadow: 0 0 0 2px var(--dsm-primary-soft, #efefff); }
.dsm-search .dsm-input { padding-left: 32px; }
.dsm-sort { font: inherit; font-size: 12px; color: var(--dsm-text, #1f2933); background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 8px; padding: 0 8px; height: 32px; }
.dsm-settings-btn { font: inherit; font-size: 12px; font-weight: 500; color: var(--dsm-text-sub, #667085); background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 8px; padding: 0 12px; height: 32px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.dsm-settings-btn:hover { color: var(--dsm-primary, #5b5bd6); border-color: var(--dsm-primary, #5b5bd6); }
.dsm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.dsm-chip { font: inherit; font-size: 12px; font-weight: 500; color: var(--dsm-text-sub, #667085); background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 999px; padding: 4px 12px; cursor: pointer; }
.dsm-chip:hover { border-color: var(--dsm-border-strong, #d4d8e4); }
.dsm-chip[data-active="true"] { color: #4B4FD1; background: var(--dsm-primary-soft, #efefff); border-color: var(--dsm-primary, #5b5bd6); }
.dsm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
.dsm-skill { background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 12px; padding: 14px; display: grid; gap: 8px; cursor: pointer; }
.dsm-skill:hover { border-color: var(--dsm-primary, #5b5bd6); box-shadow: 0 1px 0 rgba(16,24,40,.04); }
.dsm-skill[data-installed="true"] { border-color: color-mix(in srgb, var(--dsm-success, #12b76a) 45%, var(--dsm-border, #e4e7ef)); }
.dsm-skill-row { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: start; }
.dsm-av { width: 38px; height: 38px; border-radius: 8px; display: grid; place-items: center; font-size: 15px; font-weight: 700; font-family: ui-monospace, Consolas, monospace; color: #fff; flex-shrink: 0; }
.dsm-av.a { background: var(--dsm-a, #c2703d); }
.dsm-av.o { background: var(--dsm-o, #0e9e9b); }
.dsm-av.v { background: var(--dsm-v, #2e5bff); }
.dsm-main { display: grid; gap: 4px; min-width: 0; }
.dsm-name-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.dsm-name { margin: 0; font-size: 14px; font-weight: 600; font-family: ui-monospace, Consolas, monospace; color: var(--dsm-text, #1f2933); }
.dsm-tag { font-size: 11px; font-weight: 500; color: var(--dsm-text-sub, #667085); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 999px; padding: 1px 7px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.dsm-tag .pd { width: 6px; height: 6px; border-radius: 999px; }
.dsm-tag.s1 .pd { background: var(--dsm-a, #c2703d); }
.dsm-tag.s2 .pd { background: var(--dsm-o, #0e9e9b); }
.dsm-tag.s3 .pd { background: var(--dsm-v, #2e5bff); }
.dsm-tag.inst { color: var(--dsm-success, #12b76a); border-color: color-mix(in srgb, var(--dsm-success, #12b76a) 50%, transparent); background: color-mix(in srgb, var(--dsm-success, #12b76a) 10%, transparent); }
.dsm-desc { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsm-text-sub, #667085); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.dsm-detail { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 160ms ease; }
.dsm-skill[data-expanded="true"] .dsm-detail { grid-template-rows: 1fr; }
.dsm-detail-in { overflow: hidden; }
.dsm-detail-box { border-top: 1px dashed var(--dsm-border, #e4e7ef); margin-top: 8px; padding-top: 8px; display: grid; gap: 6px; }
.dsm-when { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsm-text-sub, #667085); }
.dsm-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.dsm-meta a { color: var(--dsm-primary, #5b5bd6); text-decoration: none; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
.dsm-meta a:hover { text-decoration: underline; }
.dsm-detail-loading { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--dsm-text-faint, #98a2b3); }
.dsm-spin { animation: dsm-rot .8s linear infinite; }
@keyframes dsm-rot { to { transform: rotate(360deg); } }
.dsm-actions { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
.dsm-btn { font: inherit; font-size: 12px; font-weight: 500; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid var(--dsm-border, #e4e7ef); background: var(--dsm-surface, #fff); color: var(--dsm-text, #1f2933); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.dsm-btn:hover { border-color: var(--dsm-border-strong, #d4d8e4); }
.dsm-btn.primary { background: var(--dsm-primary, #5b5bd6); border-color: var(--dsm-primary, #5b5bd6); color: #fff; }
.dsm-btn.primary:hover { background: var(--dsm-primary-hover, #4b4fd1); }
.dsm-btn.danger { color: var(--dsm-danger, #e5484d); border-color: color-mix(in srgb, var(--dsm-danger, #e5484d) 45%, var(--dsm-border, #e4e7ef)); }
.dsm-btn.danger:hover { background: color-mix(in srgb, var(--dsm-danger, #e5484d) 8%, transparent); }
.dsm-btn:disabled { opacity: .55; cursor: not-allowed; }
.dsm-foot { margin: 0; font-size: 12px; color: var(--dsm-text-sub, #667085); display: flex; align-items: center; gap: 8px; }
.dsm-empty { color: var(--dsm-text-sub, #667085); font-size: 13px; text-align: center; padding: 28px 16px; border: 1px dashed var(--dsm-border-strong, #d4d8e4); border-radius: 12px; display: grid; gap: 8px; justify-items: center; }
.dsm-empty svg { color: var(--dsm-text-faint, #98a2b3); }
.dsm-mask { position: fixed; inset: 0; background: rgba(16,24,40,.4); z-index: 9998; }
.dsm-modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100vw - 40px)); background: var(--dsm-surface, #fff); border: 1px solid var(--dsm-border, #e4e7ef); border-radius: 12px; padding: 20px; display: grid; gap: 14px; z-index: 9999; box-shadow: 0 12px 40px rgba(16,24,40,.14); }
.dsm-modal-head { display: flex; align-items: center; justify-content: space-between; }
.dsm-modal-title { margin: 0; font-size: 16px; font-weight: 600; color: var(--dsm-text, #1f2933); }
.dsm-modal-x { background: none; border: none; cursor: pointer; color: var(--dsm-text-faint, #98a2b3); padding: 4px; border-radius: 6px; }
.dsm-modal-x:hover { color: var(--dsm-text, #1f2933); background: var(--dsm-bg, #f5f6fa); }
.dsm-modal-sub { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsm-text-sub, #667085); }
.dsm-current { font-size: 12px; color: var(--dsm-text-sub, #667085); display: flex; gap: 6px; align-items: center; }
.dsm-current code { font-family: ui-monospace, Consolas, monospace; color: var(--dsm-text, #1f2933); background: var(--dsm-bg, #f5f6fa); border-radius: 6px; padding: 2px 6px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsm-field { display: grid; gap: 4px; }
.dsm-field label { font-size: 12px; font-weight: 500; color: var(--dsm-text-sub, #667085); }
.dsm-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dsm-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #1F2933; color: #fff; font-size: 13px; padding: 9px 16px; border-radius: 999px; box-shadow: 0 8px 24px rgba(16,24,40,.22); z-index: 10000; display: flex; align-items: center; gap: 7px; animation: dsm-toast-in .18s ease; }
.dsm-toast .ok { color: #34D399; }
@keyframes dsm-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@media (max-width: 560px) {
  .dsm-stats { grid-template-columns: repeat(2, 1fr); }
  .dsm-toolbar { grid-template-columns: 1fr; }
  .dsm-skill-row { grid-template-columns: auto 1fr; }
  .dsm-actions { grid-column: 1 / -1; }
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

  // ---------- 组件 ----------
  function MarketCard() {
    ensureStyles()
    const [status, setStatus] = useState('loading')
    const [market, setMarket] = useState(null)
    const [skills, setSkills] = useState([])
    const [config, setConfig] = useState({ marketUrl: '' })
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('all')
    const [sort, setSort] = useState('recent')
    const [busyName, setBusyName] = useState(null)
    const [toast, setToast] = useState(null)
    const [showSettings, setShowSettings] = useState(false)
    const [marketInput, setMarketInput] = useState('')
    const [saving, setSaving] = useState(false)
    const [expanded, setExpanded] = useState({})
    const [details, setDetails] = useState({})
    const toastTimer = useRef(null)

    const showToast = useCallback((msg, ok = true) => {
      setToast({ msg, ok })
      clearTimeout(toastTimer.current)
      toastTimer.current = setTimeout(() => setToast(null), 2600)
    }, [])

    const refresh = useCallback(async () => {
      try {
        const [list, cfg] = await Promise.all([fetchJson(`${API}/list`), fetchJson(`${API}/config`)])
        if (!list.ok) { setMarket(null); setSkills([]); setStatus('unavailable'); return }
        setMarket(list.market)
        setSkills(list.skills || [])
        setConfig({ ...cfg })
        setStatus('ready')
      } catch (error) { setStatus('unavailable') }
    }, [])

    useEffect(() => { void refresh() }, [refresh])

    const loadDetail = useCallback(async (name) => {
      if (details[name]) return
      setDetails((d) => ({ ...d, [name]: { loading: true } }))
      try {
        const res = await fetchJson(`${API}/detail?name=${encodeURIComponent(name)}`)
        setDetails((d) => ({ ...d, [name]: { loading: false, data: res.detail, error: null } }))
      } catch (error) {
        setDetails((d) => ({ ...d, [name]: { loading: false, data: null, error: error.message } }))
      }
    }, [details])

    const toggleExpand = useCallback((name) => {
      setExpanded((e) => {
        const next = { ...e, [name]: !e[name] }
        if (next[name]) void loadDetail(name)
        return next
      })
    }, [loadDetail])

    const runInstall = useCallback(async (name) => {
      setBusyName(name)
      try {
        const res = await fetchJson(`${API}/install`, { method: 'POST', body: JSON.stringify({ name }) })
        if (!res.ok) throw new Error(res.error || '安装失败')
        await refresh()
        showToast(`已安装 ${name} ✓（重启会话后生效）`)
      } catch (error) { showToast('安装失败：' + error.message, false) } finally { setBusyName(null) }
    }, [refresh, showToast])

    const runUninstall = useCallback(async (name) => {
      setBusyName(name)
      try {
        const res = await fetchJson(`${API}/uninstall`, { method: 'POST', body: JSON.stringify({ name }) })
        if (!res.ok) throw new Error(res.error || '卸载失败')
        await refresh()
        showToast(`已卸载 ${name}`)
      } catch (error) { showToast('卸载失败：' + error.message, false) } finally { setBusyName(null) }
    }, [refresh, showToast])

    const runUpdate = useCallback(async (name) => {
      setBusyName(name)
      try {
        const res = await fetchJson(`${API}/install`, { method: 'POST', body: JSON.stringify({ name }) })
        if (!res.ok) throw new Error(res.error || '更新失败')
        await refresh()
        showToast(`已更新 ${name} ✓`)
      } catch (error) { showToast('更新失败：' + error.message, false) } finally { setBusyName(null) }
    }, [refresh, showToast])

    const saveMarketUrl = useCallback(async () => {
      setSaving(true)
      try {
        const res = await fetchJson(`${API}/config`, { method: 'PATCH', body: JSON.stringify({ marketUrl: marketInput }) })
        if (!res.ok) throw new Error(res.error || '保存失败')
        setConfig((c) => ({ ...c, marketUrl: marketInput }))
        setShowSettings(false)
        await refresh()
        showToast('市场地址已保存 ✓（已即时生效）')
      } catch (error) { showToast('保存失败：' + error.message, false) } finally { setSaving(false) }
    }, [marketInput, refresh, showToast])

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase()
      let list = skills.filter((sk) => {
        if (category !== 'all' && sk.category !== category) return false
        if (!q) return true
        return (sk.name || '').toLowerCase().includes(q) || (sk.description || '').toLowerCase().includes(q)
      })
      if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name))
      else if (sort === 'category') list = [...list].sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name))
      return list
    }, [skills, search, category, sort])

    const installedCount = skills.filter((k) => k.installed).length
    const categoryCounts = useMemo(() => {
      const counts = {}
      for (const sk of skills) counts[sk.category || 'other'] = (counts[sk.category || 'other'] || 0) + 1
      return counts
    }, [skills])
    const busy = status !== 'ready'

    const renderStat = (key, value, brand) =>
      el('div', { key, className: 'dsm-stat' },
        el('div', { className: 'n' + (brand ? ' brand' : '') }, value),
        el('div', { className: 'l' }, key))

    const renderChip = (cat, label, count) =>
      el('button', {
        key: cat, type: 'button', className: 'dsm-chip', 'data-active': String(category === cat),
        disabled: busy, onClick: () => setCategory(cat),
      }, cat === 'all' ? label : `${label} ${count}`)

    const renderActions = (sk) => {
      if (sk.installed) {
        return el('div', { className: 'dsm-actions' },
          el('button', {
            type: 'button', className: 'dsm-btn danger', title: sk.managed ? '卸载该技能' : '该技能非市场安装，无法卸载',
            disabled: busy || busyName === sk.name || !sk.managed, onClick: (e) => { e.stopPropagation(); void runUninstall(sk.name) },
          }, el(Icon, { name: 'trash', size: 14 }), '卸载'),
          el('button', {
            type: 'button', className: 'dsm-btn', disabled: busy || busyName === sk.name,
            onClick: (e) => { e.stopPropagation(); void runUpdate(sk.name) },
          }, el(Icon, { name: 'refresh', size: 14 }), '更新'),
        )
      }
      return el('div', { className: 'dsm-actions' },
        el('button', {
          type: 'button', className: 'dsm-btn primary', disabled: busy || busyName === sk.name,
          onClick: (e) => { e.stopPropagation(); void runInstall(sk.name) },
        }, busyName === sk.name
          ? el('span', { className: 'dsm-spin' }, el(Icon, { name: 'spinner', size: 13 }))
          : el(Icon, { name: 'download', size: 14 }),
        busyName === sk.name ? '安装中…' : '安装'),
      )
    }

    const renderDetail = (sk) => {
      const d = details[sk.name]
      const inner = d
        ? (d.loading
            ? el('div', { className: 'dsm-detail-loading' }, el('span', { className: 'dsm-spin' }, el(Icon, { name: 'spinner', size: 13 })), '正在读取详情…')
            : d.error
              ? el('p', { className: 'dsm-when' }, '详情读取失败：' + d.error)
              : el(React.Fragment, null,
                  d.data && d.data.whenToUse ? el('p', { className: 'dsm-when' }, '适用：' + d.data.whenToUse) : null,
                  d.data && d.data.body ? el('p', { className: 'dsm-when' }, d.data.body.slice(0, 220) + (d.data.body.length > 220 ? '…' : '')) : null,
                  el('div', { className: 'dsm-meta' },
                    d.data && d.data.version ? el('span', { className: 'dsm-tag' }, 'v' + d.data.version) : null,
                    d.data && d.data.author ? el('span', { className: 'dsm-tag' }, d.data.author) : null,
                    d.data && d.data.license ? el('span', { className: 'dsm-tag' }, d.data.license) : null,
                    d.data && d.data.homepage ? el('a', { href: d.data.homepage, target: '_blank', rel: 'noopener noreferrer', onClick: (e) => e.stopPropagation() }, '主页', el(Icon, { name: 'external', size: 12 })) : null,
                  ),
                )
              )
          : el('div', { className: 'dsm-detail-loading' }, el('span', { className: 'dsm-spin' }, el(Icon, { name: 'spinner', size: 13 })), '正在读取详情…')
      return el('div', { className: 'dsm-detail-in' }, el('div', { className: 'dsm-detail-box' }, inner))
    }

    const renderSkill = (sk) => {
      const srcCls = SOURCE_CLS[sk.source] || 'a'
      return el('div', {
        key: sk.name, className: 'dsm-skill', 'data-installed': String(!!sk.installed),
        'data-expanded': String(!!expanded[sk.name]), onClick: () => toggleExpand(sk.name),
      },
        el('div', { className: 'dsm-skill-row' },
          el('div', { className: 'dsm-av ' + srcCls }, (sk.source || '?').slice(0, 1).toUpperCase()),
          el('div', { className: 'dsm-main' },
            el('div', { className: 'dsm-name-row' },
              el('span', { className: 'dsm-name' }, sk.name),
              sk.installed ? el('span', { className: 'dsm-tag inst' }, el(Icon, { name: 'check', size: 11 }), '已安装') : null,
              el('span', { className: 'dsm-tag s' + (srcCls === 'a' ? 1 : srcCls === 'o' ? 2 : 3) }, el('span', { className: 'pd' }), SOURCE_NAMES[sk.source] || sk.source),
              el('span', { className: 'dsm-tag' }, CATEGORY_NAMES[sk.category] || sk.category),
            ),
            el('p', { className: 'dsm-desc' }, sk.description || ''),
            el('div', { className: 'dsm-detail' }, renderDetail(sk)),
          ),
          renderActions(sk),
        ),
      )
    }

    const renderModal = () => el(React.Fragment, null,
      el('div', { className: 'dsm-mask', onClick: () => setShowSettings(false) }),
      el('div', { className: 'dsm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dsm-modal-title' },
        el('div', { className: 'dsm-modal-head' },
          el('h3', { id: 'dsm-modal-title', className: 'dsm-modal-title' }, '市场设置'),
          el('button', { type: 'button', className: 'dsm-modal-x', onClick: () => setShowSettings(false), 'aria-label': '关闭' }, el(Icon, { name: 'x', size: 16 })),
        ),
        el('p', { className: 'dsm-modal-sub' }, '配置技能市场来源。留空使用内置市场；可指向任意本地目录（含 manifest.json 与 skills/ 子目录）。'),
        el('div', { className: 'dsm-current' }, '当前：', el('code', null, config.marketUrl || '默认 ~/.dsh/skills-market')),
        el('div', { className: 'dsm-field' },
          el('label', { htmlFor: 'dsm-market-url' }, '市场地址'),
          el('input', { id: 'dsm-market-url', className: 'dsm-input', placeholder: '默认 ~/.dsh/skills-market', value: marketInput, onChange: (e) => setMarketInput(e.target.value) }),
        ),
        el('div', { className: 'dsm-modal-actions' },
          el('button', { type: 'button', className: 'dsm-btn', disabled: saving, onClick: () => setShowSettings(false) }, '取消'),
          el('button', { type: 'button', className: 'dsm-btn primary', disabled: saving, onClick: () => void saveMarketUrl() }, saving ? '保存中…' : '保存'),
        ),
      ),
    )

    const openSettings = () => { setMarketInput(config.marketUrl || ''); setShowSettings(true) }

    return el('li', { className: 'dsm-wrap', 'data-testid': 'dsh-skill-market-settings' },
      el('div', { className: 'dsm-card' },
        el('div', { className: 'dsm-head' },
          el('h3', { className: 'dsm-title' }, '技能市场'),
          el('p', { className: 'dsm-sub' }, '浏览并安装官方技能（Anthropic / OpenAI / Vercel）。安装到 ~/.dsh/skills，重启会话后生效。'),
        ),

        status === 'loading'
          ? el('div', { className: 'dsm-detail-loading' }, el('span', { className: 'dsm-spin' }, el(Icon, { name: 'spinner', size: 14 })), '正在读取市场…')
          : status === 'unavailable'
            ? el('div', { className: 'dsm-empty' },
                el(Icon, { name: 'folder', size: 22 }),
                el('div', null, '技能市场未就绪'),
                el('p', { className: 'dsm-when' }, '请检查市场地址配置是否正确（目录需包含 manifest.json）。'),
                el('button', { type: 'button', className: 'dsm-btn', style: { marginTop: 4 }, onClick: openSettings }, el(Icon, { name: 'sliders', size: 14 }), '打开市场设置'),
              )
            : el(React.Fragment, null,
                el('div', { className: 'dsm-stats' },
                  renderStat('市场技能', market ? market.skillCount : 0, true),
                  renderStat('已安装', installedCount),
                  renderStat('分类', Object.keys(categoryCounts).length),
                  renderStat('更新', market && market.updatedAt ? market.updatedAt : '-'),
                ),
                el('div', { className: 'dsm-toolbar' },
                  el('div', { className: 'dsm-search' },
                    el('span', { className: 'i' }, el(Icon, { name: 'search', size: 14 })),
                    el('input', { className: 'dsm-input', placeholder: '搜索技能名称或描述…', value: search, disabled: busy, onChange: (e) => setSearch(e.target.value) }),
                  ),
                  el('select', { className: 'dsm-sort', value: sort, disabled: busy, onChange: (e) => setSort(e.target.value), 'aria-label': '排序' },
                    el('option', { value: 'recent' }, '综合排序'),
                    el('option', { value: 'name' }, '名称 A–Z'),
                    el('option', { value: 'category' }, '按分类'),
                  ),
                  el('button', { type: 'button', className: 'dsm-settings-btn', onClick: openSettings }, el(Icon, { name: 'sliders', size: 14 }), '市场设置'),
                ),
                el('div', { className: 'dsm-chips', role: 'group', 'aria-label': '分类筛选' },
                  renderChip('all', '全部', ''),
                  CATEGORY_ORDER.map((cat) => renderChip(cat, CATEGORY_NAMES[cat], categoryCounts[cat] || 0)),
                ),
                filtered.length === 0
                  ? el('div', { className: 'dsm-empty' },
                      el(Icon, { name: 'search', size: 22 }),
                      el('div', null, '没有匹配的技能'),
                      el('p', { className: 'dsm-when' }, '换个关键词或分类试试。'),
                    )
                  : el('div', { className: 'dsm-grid' }, ...filtered.map(renderSkill)),
                el('p', { className: 'dsm-foot' },
                  el('span', { className: 'dsm-tag inst' }, el(Icon, { name: 'check', size: 11 }), '已安装'),
                  '提示：安装的技能写入 ~/.dsh/skills，可在「技能与 MCP」页统一管理；同名安装会覆盖更新。',
                ),
              ),

        showSettings ? renderModal() : null,
        toast ? el('div', { className: 'dsm-toast', role: 'status' },
            toast.ok ? el('span', { className: 'ok' }, el(Icon, { name: 'check', size: 14 })) : null,
            toast.msg,
          ) : null,
      ),
    )
  }

  function apply(ctx) {
    const registerSection = () => {
      try {
        ctx.slots.register({
          name: 'settings.section', id: 'dsh-skill-market', order: 21,
          label: () => '技能市场',
          inject: () => ({}),
        }, MarketCard)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) console.error('[dsh-skill-market] failed to register settings section:', error)
      }
    }
    try {
      ctx.slots.inject('settings.section', registerSection)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) console.error('[dsh-skill-market] failed to inject settings slot:', error)
    }
  }

  module.exports = {
    name: 'dsh-skill-market-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
