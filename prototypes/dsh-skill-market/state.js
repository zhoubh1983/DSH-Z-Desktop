/**
 * state.js —— 技能市场原型：渲染 + 交互。
 * 数据源：mock.js（DB）；API 桩：api.js（与真实后端同形，可替换为真实 fetch）。
 * 交互：搜索 / 分类 chips / 排序 / 卡片展开懒加载详情 / 安装卸载 / 市场设置弹窗 / toast。
 */
(function () {
  const CATEGORY_NAMES = { document: '文档', development: '开发', creative: '创意', communication: '沟通', other: '其他' }
  const CATEGORY_ORDER = ['document', 'development', 'creative', 'communication', 'other']
  const SOURCE_NAMES = { anthropic: 'Anthropic', openai: 'OpenAI', vercel: 'Vercel' }
  const SOURCE_CLS = { anthropic: 'a', openai: 'o', vercel: 'v' }
  const ICON = {
    search: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
    download: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    external: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
    spinner: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>',
    folder: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    emptySearch: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
  }

  const root = document.getElementById('app-root')
  const state = {
    status: 'loading',
    market: null,
    skills: [],
    config: { marketUrl: '' },
    search: '', category: 'all', sort: 'recent',
    expanded: {}, details: {}, busyName: null,
  }
  let toastTimer = null

  function showToast(msg, ok) {
    const t = document.getElementById('toast')
    t.innerHTML = (ok ? '<span class="ok">' + ICON.check + '</span>' : '') + msg
    t.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { t.hidden = true }, 2600)
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  async function load() {
    try {
      const [list, cfg] = await Promise.all([API.fetchList(), API.fetchConfig()])
      if (!list.ok) { state.status = 'unavailable'; return }
      state.market = list.market
      state.skills = list.skills
      state.config = cfg
      state.status = 'ready'
    } catch (e) { state.status = 'unavailable' }
  }

  function statsHtml() {
    const installed = state.skills.filter(function (s) { return s.installed }).length
    const cats = Object.keys(state.skills.reduce(function (a, s) { a[s.category || 'other'] = 1; return a }, {}))
    return '<div class="stats">' +
      '<div class="stat"><div class="n brand">' + state.market.skillCount + '</div><div class="l">市场技能</div></div>' +
      '<div class="stat"><div class="n">' + installed + '</div><div class="l">已安装</div></div>' +
      '<div class="stat"><div class="n">' + cats.length + '</div><div class="l">分类</div></div>' +
      '<div class="stat"><div class="n">' + (state.market.updatedAt || '-') + '</div><div class="l">更新</div></div>' +
      '</div>'
  }

  function catCount(name) {
    return state.skills.filter(function (s) { return s.category === name }).length
  }

  function chipsHtml() {
    let html = '<div class="chips" role="group" aria-label="分类筛选">'
    html += '<button type="button" class="chip' + (state.category === 'all' ? ' active' : '') + '" data-chip="all">全部</button>'
    CATEGORY_ORDER.forEach(function (cat) {
      html += '<button type="button" class="chip' + (state.category === cat ? ' active' : '') + '" data-chip="' + cat + '">' +
        CATEGORY_NAMES[cat] + ' ' + catCount(cat) + '</button>'
    })
    return html + '</div>'
  }

  function filteredSkills() {
    const q = state.search.trim().toLowerCase()
    let list = state.skills.filter(function (s) {
      if (state.category !== 'all' && s.category !== state.category) return false
      if (!q) return true
      return (s.name || '').toLowerCase().indexOf(q) >= 0 || (s.description || '').toLowerCase().indexOf(q) >= 0
    })
    if (state.sort === 'name') list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name) })
    else if (state.sort === 'category') list = list.slice().sort(function (a, b) { return (a.category + a.name).localeCompare(b.category + b.name) })
    return list
  }

  function actionButtons(s) {
    const busy = state.busyName === s.name
    if (s.installed) {
      return '<div class="actions">' +
        '<button type="button" class="btn danger" data-act="uninstall" data-name="' + s.name + '"' + (s.managed ? '' : ' title="该技能非市场安装，无法卸载"') + (s.managed ? '' : ' disabled') + '>' + ICON.trash + '卸载</button>' +
        '<button type="button" class="btn" data-act="update" data-name="' + s.name + '">' + ICON.refresh + '更新</button>' +
        '</div>'
    }
    return '<div class="actions">' +
      '<button type="button" class="btn primary" data-act="install" data-name="' + s.name + '"' + (busy ? ' disabled' : '') + '>' +
      (busy ? ICON.spinner + '安装中…' : ICON.download + '安装') + '</button>' +
      '</div>'
  }

  function detailHtml(s) {
    const d = state.details[s.name]
    let inner
    if (!d || d.loading) inner = '<div class="loading">' + ICON.spinner + '正在读取详情…</div>'
    else if (d.error) inner = '<p class="when">详情读取失败：' + esc(d.error) + '</p>'
    else {
      let meta = ''
      if (d.data.version) meta += '<span class="tag">v' + esc(d.data.version) + '</span>'
      if (d.data.author) meta += '<span class="tag">' + esc(d.data.author) + '</span>'
      if (d.data.license) meta += '<span class="tag">' + esc(d.data.license) + '</span>'
      if (d.data.homepage) meta += '<a href="' + esc(d.data.homepage) + '" target="_blank" rel="noopener noreferrer">主页' + ICON.external + '</a>'
      inner = ''
      if (d.data.whenToUse) inner += '<p class="when">适用：' + esc(d.data.whenToUse) + '</p>'
      if (d.data.body) inner += '<p class="when">' + esc(d.data.body.slice(0, 220)) + (d.data.body.length > 220 ? '…' : '') + '</p>'
      if (meta) inner += '<div class="meta">' + meta + '</div>'
      if (!inner) inner = '<p class="when">该技能未提供额外说明。</p>'
    }
    return '<div class="detail-in"><div class="detail-box">' + inner + '</div></div>'
  }

  function skillHtml(s) {
    const cls = SOURCE_CLS[s.source] || 'a'
    const sn = s.source || '?'
    return '<div class="skill' + (s.installed ? ' installed' : '') + (state.expanded[s.name] ? ' expanded' : '') + '" data-skill="' + s.name + '">' +
      '<div class="skill-row">' +
      '<div class="av ' + cls + '">' + sn.slice(0, 1).toUpperCase() + '</div>' +
      '<div class="skill-main">' +
      '<div class="name-row">' +
      '<span class="name">' + esc(s.name) + '</span>' +
      (s.installed ? '<span class="tag inst">' + ICON.check + '已安装</span>' : '') +
      '<span class="tag s' + (cls === 'a' ? 1 : cls === 'o' ? 2 : 3) + '"><span class="pd"></span>' + (SOURCE_NAMES[s.source] || sn) + '</span>' +
      '<span class="tag">' + (CATEGORY_NAMES[s.category] || s.category) + '</span>' +
      '</div>' +
      '<p class="desc">' + esc(s.description || '') + '</p>' +
      '<div class="detail">' + detailHtml(s) + '</div>' +
      '</div>' +
      actionButtons(s) +
      '</div>' +
      '</div>'
  }

  function render() {
    if (state.status === 'loading') {
      root.innerHTML = '<div class="panel"><div class="loading">' + ICON.spinner + '正在读取市场…</div></div>'
      return
    }
    if (state.status === 'unavailable') {
      root.innerHTML = '<div class="panel"><div class="empty">' + ICON.folder +
        '<div>技能市场未就绪</div><p class="when">请检查市场地址配置是否正确（目录需包含 manifest.json）。</p>' +
        '<button type="button" class="btn" id="btn-open-modal">' + ICON.sliders + '打开市场设置</button></div></div>'
      return
    }
    const list = filteredSkills()
    let listHtml
    if (list.length === 0) {
      listHtml = '<div class="empty">' + ICON.emptySearch + '<div>没有匹配的技能</div><p class="when">换个关键词或分类试试。</p></div>'
    } else {
      listHtml = '<div class="grid">' + list.map(skillHtml).join('') + '</div>'
    }
    root.innerHTML =
      '<div class="panel">' +
      '<div class="panel-head"><h2 class="panel-title">技能市场</h2>' +
      '<p class="panel-sub">浏览并安装官方技能（Anthropic / OpenAI / Vercel）。安装到 ~/.dsh/skills，重启会话后生效。</p></div>' +
      statsHtml() +
      '<div class="toolbar">' +
      '<div class="search"><span class="ic">' + ICON.search + '</span><input class="input" id="search" placeholder="搜索技能名称或描述…" value="' + esc(state.search) + '" /></div>' +
      '<select class="sort" id="sort" aria-label="排序">' +
      '<option value="recent"' + (state.sort === 'recent' ? ' selected' : '') + '>综合排序</option>' +
      '<option value="name"' + (state.sort === 'name' ? ' selected' : '') + '>名称 A–Z</option>' +
      '<option value="category"' + (state.sort === 'category' ? ' selected' : '') + '>按分类</option>' +
      '</select>' +
      '<button type="button" class="settings-btn" id="btn-open-modal">' + ICON.sliders + '市场设置</button>' +
      '</div>' +
      chipsHtml() +
      listHtml +
      '<p class="foot"><span class="tag inst">' + ICON.check + '已安装</span>提示：安装的技能写入 ~/.dsh/skills，可在「技能与 MCP」页统一管理；同名安装会覆盖更新。</p>' +
      '</div>'
  }

  async function loadDetail(name) {
    if (state.details[name] && !state.details[name].loading) return
    state.details[name] = { loading: true }
    render()
    try {
      const res = await API.fetchDetail(name)
      state.details[name] = res.ok ? { loading: false, data: res.detail } : { loading: false, error: res.error }
    } catch (e) { state.details[name] = { loading: false, error: e.message } }
    render()
  }

  async function install(name) {
    state.busyName = name; render()
    try {
      const res = await API.installSkill(name)
      if (!res.ok) throw new Error(res.error || '安装失败')
      showToast('已安装 ' + name + ' ✓（重启会话后生效）', true)
      await load()
    } catch (e) { showToast('安装失败：' + e.message, false) }
    state.busyName = null; render()
  }

  async function uninstall(name) {
    try {
      const res = await API.uninstallSkill(name)
      if (!res.ok) throw new Error(res.error || '卸载失败')
      showToast('已卸载 ' + name, true)
      await load()
    } catch (e) { showToast('卸载失败：' + e.message, false) }
    render()
  }

  async function updateSkill(name) {
    state.busyName = name; render()
    try {
      const res = await API.installSkill(name)
      if (!res.ok) throw new Error(res.error || '更新失败')
      showToast('已更新 ' + name + ' ✓', true)
      await load()
    } catch (e) { showToast('更新失败：' + e.message, false) }
    state.busyName = null; render()
  }

  // ---- 弹窗 ----
  function openModal() {
    document.getElementById('market-url').value = state.config.marketUrl || ''
    document.getElementById('current-dir').textContent = state.config.marketUrl || '默认 ~/.dsh/skills-market'
    document.getElementById('modal').hidden = false
    document.getElementById('modal-mask').hidden = false
  }
  function closeModal() {
    document.getElementById('modal').hidden = true
    document.getElementById('modal-mask').hidden = true
  }
  async function saveModal() {
    const v = document.getElementById('market-url').value.trim()
    try {
      const res = await API.saveConfig({ marketUrl: v })
      if (!res.ok) throw new Error(res.error || '保存失败')
      state.config.marketUrl = v
      closeModal()
      await load()
      showToast('市场地址已保存 ✓（已即时生效）', true)
    } catch (e) { showToast('保存失败：' + e.message, false) }
    render()
  }

  // ---- 事件绑定 ----
  document.addEventListener('click', function (e) {
    const skillEl = e.target.closest('[data-skill]')
    if (skillEl && !e.target.closest('[data-act]')) {
      const name = skillEl.getAttribute('data-skill')
      state.expanded[name] = !state.expanded[name]
      render()
      if (state.expanded[name]) void loadDetail(name)
      return
    }
    const act = e.target.closest('[data-act]')
    if (act) {
      const name = act.getAttribute('data-name')
      const a = act.getAttribute('data-act')
      if (a === 'install') void install(name)
      else if (a === 'uninstall') void uninstall(name)
      else if (a === 'update') void updateSkill(name)
      return
    }
    const chip = e.target.closest('[data-chip]')
    if (chip) {
      state.category = chip.getAttribute('data-chip')
      render()
      return
    }
    if (e.target.closest('#btn-open-modal')) openModal()
    if (e.target.closest('#btn-close-modal') || e.target.closest('#btn-cancel-modal') || e.target.id === 'modal-mask') closeModal()
    if (e.target.closest('#btn-save-modal')) void saveModal()
  })

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'search') { state.search = e.target.value; render() }
  })

  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'sort') { state.sort = e.target.value; render() }
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('modal').hidden) closeModal()
  })

  // ---- 启动 ----
  load().then(render)
})()
