/* 恢复助手客户端（零构建，原生 DOM）：快速恢复 / 插件管理 / 安全模式 / 数据与重置 / 诊断。 */
'use strict'

const COPY = {
  zh: {
    title: 'DSH Desktop 恢复助手',
    version: (v) => `v${v}`,
    subtitle: '正常启动已暂停，当前 Profile 与插件未加载。选择一个恢复方式继续。',
    reason: '进入恢复模式的原因',
    requestedStage: '手动进入恢复模式',
    failedStage: '启动停止位置',
    tabs: { quick: '快速恢复', plugins: '插件管理', safe: '安全模式', data: '数据与重置', diagnostics: '诊断' },
    pluginGuideTitle: '插件管理',
    pluginGuideBody: '安装或更新插件后出现问题？查看当前 Profile 的插件，卸载可能引发问题的第三方插件。',
    safeModeTitle: '安全模式',
    safeModeBody: '以仅内置插件的方式启动，暂时排除第三方插件的影响。原有数据保留，退出后恢复。',
    dataGuideTitle: '数据与重置',
    dataGuideBody: '查看数据目录，或恢复出厂设置（旧 Profile 会保留为 .trash 目录）。建议先尝试其他恢复方式。',
    diagnosticsGuideTitle: '诊断',
    diagnosticsGuideBody: '导出诊断包（日志、配置与系统信息）以排查问题。',
    pluginsTitle: '插件管理',
    pluginsBody: '以下为当前 Profile 加载的 bundle。内置 bundle 不可卸载。',
    pluginsEmpty: '当前 Profile 没有可卸载的插件。',
    uninstall: '卸载',
    builtinTag: '内置',
    externalTag: '可卸载',
    uninstallConfirmTitle: '卸载这个插件？',
    uninstallConfirmBody: (name) => `将从当前 Profile 卸载 ${name}，并移除其 node_modules 目录。重启后生效。`,
    safeModeDetail: '安全模式仅加载内置 bundle，不读取第三方插件；原有数据不会删除。',
    safeActive: '安全模式已启用',
    enterSafe: '进入安全模式',
    exitSafe: '退出安全模式（恢复完整插件）',
    safeConfirmTitle: '进入安全模式？',
    safeConfirmBody: '将备份当前 bundle 清单，仅保留内置 bundle，然后重启。退出安全模式时恢复。',
    exitSafeConfirmTitle: '退出安全模式？',
    exitSafeConfirmBody: '将从备份恢复完整 bundle 清单，然后重启。',
    dataTitle: '数据与重置',
    dataBody: '恢复出厂会将当前 Profile 移入 .trash-<时间> 目录（不删除），重建全新 Profile 并重置设置。',
    dataDirLabel: '数据目录',
    profileDirLabel: 'Profile 目录',
    openDataDir: '打开数据目录',
    factoryReset: '恢复出厂设置',
    resetConfirmTitle: '恢复出厂设置？',
    resetConfirmBody: '当前 Profile 将移动到 .trash-<时间> 目录（可手动找回），随后重建全新 Profile、重置呈现模式与材质，并重启。',
    resetDone: '已重建全新 Profile，点击「重启」开始使用。',
    diagnosticsTitle: '诊断',
    diagnosticsBody: '导出包含日志、配置与系统信息的诊断包；分享前请先检查其中的内容。',
    exportDiag: '导出诊断信息',
    openProfileDir: '打开 Profile 目录',
    diagDone: (p) => `诊断包已保存：${p}`,
    diagFailed: '导出诊断失败，请重试。',
    restart: '重启 DSH Desktop',
    quit: '退出',
    modalCancel: '取消',
    modalConfirm: '确认',
    working: '正在执行…',
    actionOk: '操作成功，点击「重启」生效。',
    actionFailed: '操作失败：',
    openFailed: '打开失败：',
  },
  en: {
    title: 'DSH Desktop Recovery Assistant',
    version: (v) => `v${v}`,
    subtitle: 'Normal startup is paused. The current Profile and plugins have not loaded. Choose a recovery option to continue.',
    reason: 'Why Recovery Mode opened',
    requestedStage: 'Recovery Mode opened manually',
    failedStage: 'Startup stopped at',
    tabs: { quick: 'Quick recovery', plugins: 'Plugins', safe: 'Safe Mode', data: 'Reset & data', diagnostics: 'Diagnostics' },
    pluginGuideTitle: 'Plugin management',
    pluginGuideBody: 'Problems after installing or updating a plugin? Review plugins in the current Profile and uninstall third-party plugins that may be involved.',
    safeModeTitle: 'Safe Mode',
    safeModeBody: 'Start with built-in plugins only, excluding third-party plugins. Your data is kept; it is restored when you leave Safe Mode.',
    dataGuideTitle: 'Reset & data',
    dataGuideBody: 'View the data directory, or factory reset (the old Profile is kept as a .trash folder). Try other recovery options first.',
    diagnosticsGuideTitle: 'Diagnostics',
    diagnosticsGuideBody: 'Export a diagnostic archive (logs, configuration and system info) for investigation.',
    pluginsTitle: 'Plugin management',
    pluginsBody: 'Bundles loaded by the current Profile. Built-in bundles cannot be uninstalled.',
    pluginsEmpty: 'No removable plugins in the current Profile.',
    uninstall: 'Uninstall',
    builtinTag: 'Built-in',
    externalTag: 'Removable',
    uninstallConfirmTitle: 'Uninstall this plugin?',
    uninstallConfirmBody: (name) => `${name} will be removed from the current Profile and its node_modules directory deleted. Effective after restart.`,
    safeModeDetail: 'Safe Mode loads built-in bundles only and does not read third-party plugins. Existing data is not deleted.',
    safeActive: 'Safe Mode is active',
    enterSafe: 'Enter Safe Mode',
    exitSafe: 'Exit Safe Mode (restore full plugins)',
    safeConfirmTitle: 'Enter Safe Mode?',
    safeConfirmBody: 'The current bundle list will be backed up, only built-in bundles kept, then the app restarts. Exiting Safe Mode restores it.',
    exitSafeConfirmTitle: 'Exit Safe Mode?',
    exitSafeConfirmBody: 'The full bundle list will be restored from backup, then the app restarts.',
    dataTitle: 'Reset & data',
    dataBody: 'Factory reset moves the current Profile into a .trash-<time> folder (not deleted), recreates a fresh Profile and resets settings.',
    dataDirLabel: 'Data directory',
    profileDirLabel: 'Profile directory',
    openDataDir: 'Open data directory',
    factoryReset: 'Factory reset',
    resetConfirmTitle: 'Factory reset?',
    resetConfirmBody: 'The current Profile will be moved to a .trash-<time> folder (recoverable), then a fresh Profile is created, presentation settings reset, and the app restarts.',
    resetDone: 'A fresh Profile was created. Click Restart to start using it.',
    diagnosticsTitle: 'Diagnostics',
    diagnosticsBody: 'Export an archive with logs, configuration and system information. Review it before sharing.',
    exportDiag: 'Export diagnostics',
    openProfileDir: 'Open Profile folder',
    diagDone: (p) => `Diagnostics saved: ${p}`,
    diagFailed: 'Failed to export diagnostics. Try again.',
    restart: 'Restart DSH Desktop',
    quit: 'Quit',
    modalCancel: 'Cancel',
    modalConfirm: 'Confirm',
    working: 'Working…',
    actionOk: 'Done. Click Restart to apply.',
    actionFailed: 'Action failed: ',
    openFailed: 'Failed to open: ',
  },
}

const el = (id) => document.getElementById(id)
let snap = null
const c = () => COPY[snap && snap.locale && snap.locale.startsWith('zh') ? 'zh' : 'en']

function setCopy() {
  const copy = c()
  document.documentElement.lang = snap && snap.locale && snap.locale.startsWith('zh') ? 'zh-CN' : 'en'
  document.querySelectorAll('[data-copy]').forEach((node) => {
    const key = node.dataset.copy
    if (typeof copy[key] === 'string') node.textContent = copy[key]
  })
  el('quick-safe-badge').textContent = copy.safeActive
  el('safe-badge').textContent = copy.safeActive
  el('btn-safe-mode').textContent = snap.safeModeActive ? copy.exitSafe : copy.enterSafe
  el('btn-open-data-dir').textContent = copy.openDataDir
  el('btn-factory-reset').textContent = copy.factoryReset
  el('btn-export-diag').textContent = copy.exportDiag
  el('btn-open-profile-dir').textContent = copy.openProfileDir
  el('btn-restart').textContent = copy.restart
  el('btn-quit').textContent = copy.quit
  el('modal-cancel').textContent = copy.modalCancel
  el('modal-confirm').textContent = copy.modalConfirm
}

function renderReason() {
  const r = snap.reason || {}
  const copy = c()
  el('reason-stage').textContent = r.requested ? copy.requestedStage : `${copy.failedStage}${r.stage ? ' · ' + r.stage : ''}`
  const detail = r.detail || ''
  el('reason-detail').textContent = detail
  el('reason-detail').hidden = !detail
}

function renderTabs() {
  const copy = c()
  const order = ['quick', 'plugins', 'safe', 'data', 'diagnostics']
  const box = el('tabs')
  box.innerHTML = ''
  for (const key of order) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.dataset.tab = key
    btn.textContent = copy.tabs[key]
    btn.addEventListener('click', () => switchTab(key))
    box.appendChild(btn)
  }
  switchTab('quick')
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach((sec) => {
    sec.hidden = sec.dataset.tab !== tab
  })
  document.querySelectorAll('.tabs button').forEach((btn) => {
    btn.dataset.active = String(btn.dataset.tab === tab)
  })
  if (tab === 'plugins') refreshPlugins()
}

function renderSafe() {
  const copy = c()
  el('safe-badge').hidden = !snap.safeModeActive
  el('quick-safe-badge').hidden = !snap.safeModeActive
  el('btn-safe-mode').textContent = snap.safeModeActive ? copy.exitSafe : copy.enterSafe
}

function refreshPlugins() {
  const copy = c()
  const list = el('plugin-list')
  list.innerHTML = ''
  const removable = snap.plugins.filter((p) => p.removable)
  if (removable.length === 0) {
    list.innerHTML = `<p class="desc">${copy.pluginsEmpty}</p>`
    return
  }
  for (const p of removable) {
    const row = document.createElement('div')
    row.className = 'row'
    row.innerHTML = `<div><div class="name">${p.name}</div><div class="meta">${p.exists ? copy.externalTag : copy.externalTag + '（目录缺失）'}</div></div>`
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn danger'
    btn.textContent = copy.uninstall
    btn.addEventListener('click', () => confirmModal(
      copy.uninstallConfirmTitle,
      copy.uninstallConfirmBody(p.name),
      async () => {
        await runAction(() => window.dshNative.recovery.uninstallPlugin(p.name), 'plugin-status')
        refreshPlugins()
      },
    ))
    row.appendChild(btn)
    list.appendChild(row)
  }
}

function confirmModal(title, body, onConfirm) {
  const backdrop = el('modal-backdrop')
  el('modal-title').textContent = title
  el('modal-body').textContent = body
  el('modal-confirm').onclick = async () => {
    el('modal-confirm').disabled = true
    try {
      await onConfirm()
    } finally {
      el('modal-confirm').disabled = false
      backdrop.hidden = true
    }
  }
  backdrop.hidden = false
}
el('modal-cancel').addEventListener('click', () => { el('modal-backdrop').hidden = true })

async function runAction(fn, statusId) {
  const status = el(statusId)
  status.dataset.error = 'false'
  status.textContent = c().working
  try {
    const result = await fn()
    status.textContent = c().actionOk
    return result
  } catch (err) {
    status.dataset.error = 'true'
    status.textContent = c().actionFailed + (err && err.message ? err.message : String(err))
    return null
  }
}

el('btn-safe-mode').addEventListener('click', () => {
  const copy = c()
  const enter = !snap.safeModeActive
  confirmModal(
    enter ? copy.safeConfirmTitle : copy.exitSafeConfirmTitle,
    enter ? copy.safeConfirmBody : copy.exitSafeConfirmBody,
    async () => {
      const r = await runAction(
        () => window.dshNative.recovery[enter ? 'enterSafeMode' : 'exitSafeMode'](),
        'safe-status',
      )
      if (r) { snap.safeModeActive = !enter; renderSafe(); setCopy() }
    },
  )
})

el('btn-factory-reset').addEventListener('click', () => {
  const copy = c()
  confirmModal(copy.resetConfirmTitle, copy.resetConfirmBody, async () => {
    await runAction(() => window.dshNative.recovery.factoryReset(), 'data-status')
    el('data-status').textContent = copy.resetDone
    el('data-status').dataset.error = 'false'
  })
})

el('btn-export-diag').addEventListener('click', async () => {
  const r = await runAction(() => window.dshNative.recovery.exportDiagnostics(), 'diag-status')
  if (r && r.ok && r.path) el('diag-status').textContent = c().diagDone(r.path)
  else if (r && !r.ok) { el('diag-status').textContent = c().diagFailed; el('diag-status').dataset.error = 'true' }
})

el('btn-open-data-dir').addEventListener('click', () => {
  window.dshNative.recovery.openPath(snap.dataDir).catch((e) => {
    el('data-status').textContent = c().openFailed + e.message
    el('data-status').dataset.error = 'true'
  })
})
el('btn-open-profile-dir').addEventListener('click', () => {
  window.dshNative.recovery.openPath(snap.profileDir).catch((e) => {
    el('diag-status').textContent = c().openFailed + e.message
    el('diag-status').dataset.error = 'true'
  })
})

el('btn-restart').addEventListener('click', () => { el('btn-restart').disabled = true; window.dshNative.recovery.restart() })
el('btn-quit').addEventListener('click', () => window.dshNative.recovery.quit())

document.querySelectorAll('.quick-grid .card').forEach((card) => {
  card.addEventListener('click', () => switchTab(card.dataset.go))
})

function boot() {
  window.dshNative.recovery.snapshot().then((value) => {
    snap = value
    el('data-dir-path').textContent = snap.dataDir
    el('profile-dir-path').textContent = snap.profileDir
    setCopy()
    renderReason()
    renderSafe()
    renderTabs()
  }).catch((err) => {
    el('reason-detail').textContent = String(err)
    el('reason-detail').hidden = false
  })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
