'use strict'

const $ = (id) => document.getElementById(id)

function init() {
  chrome.storage.local.get(['enabled', 'serverUrl']).then((s) => {
    $('toggle').checked = !!s.enabled
    $('server').value = s.serverUrl || ''
    refreshStatus()
  })
}

function refreshStatus() {
  const enabled = $('toggle').checked
  const st = $('status')
  st.className = 'status ' + (enabled ? 'on' : 'off')
  $('statusText').textContent = enabled ? '已允许 AI 控制浏览器' : '已关闭（AI 不可操作）'
}

$('toggle').addEventListener('change', () => {
  chrome.storage.local.set({ enabled: $('toggle').checked })
  refreshStatus()
})

$('save').addEventListener('click', () => {
  const url = $('server').value.trim().replace(/\/+$/, '')
  chrome.storage.local.set({ serverUrl: url })
  $('server').value = url
})

init()
