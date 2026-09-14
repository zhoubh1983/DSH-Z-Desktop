/* 设置向导客户端（零构建，原生 DOM）。步骤：欢迎 → 呈现模式 → 窗口材质 → 完成。 */
'use strict'

const COPY = {
  zh: {
    welcomeTitle: '设置 DSH Desktop',
    welcomeBody: '首次使用需要先完成基本设置。向导只会出现一次，之后随时可以在「视图」菜单中调整。',
    profile: '要创建的 Profile',
    firstProfileSetup: '将创建并初始化 web Profile（内置插件、技能市场与基础服务），大约需要几秒钟。',
    skip: '跳过',
    startSetup: '开始设置',
    modeTitle: '选择呈现模式',
    modeBody: '决定窗口标题栏的显示方式。',
    modeCompatibility: '兼容模式',
    modeCompatibilityBody: '保留原生系统标题栏',
    modeExtended: '扩展模式',
    modeExtendedBody: '36px 桌面标题栏 + 三栏布局',
    modeAdvanced: '增强模式',
    modeAdvancedBody: '32px 紧凑标题栏',
    materialTitle: '选择窗口材质',
    materialBody: '为窗口背景应用系统材质。',
    materialOff: '关闭',
    materialOffBody: '使用纯色背景，兼容性最好',
    materialMica: 'Mica',
    materialMicaBody: 'Windows 11 半透明云母材质',
    materialTransparent: '透明',
    materialTransparentBody: 'macOS 侧边栏半透明材质',
    back: '上一步',
    next: '下一步',
    successTitle: '设置完成',
    successBody: '正在创建 Profile 并应用所选设置，应用将自动重启。',
    startUsing: '开始使用',
    working: '正在创建 Profile…',
  },
  en: {
    welcomeTitle: 'Set up DSH Desktop',
    welcomeBody: 'A few basic settings are needed before first use. This wizard appears only once; you can adjust these later in the View menu.',
    profile: 'Profile to create',
    firstProfileSetup: 'A web Profile with built-in plugins, skills market and core services will be created and initialized. This takes a few seconds.',
    skip: 'Skip',
    startSetup: 'Start setup',
    modeTitle: 'Choose presentation mode',
    modeBody: 'Controls how the window titlebar is displayed.',
    modeCompatibility: 'Compatibility',
    modeCompatibilityBody: 'Keep the native system titlebar',
    modeExtended: 'Extended',
    modeExtendedBody: '36px desktop titlebar + three-column layout',
    modeAdvanced: 'Advanced',
    modeAdvancedBody: '32px compact titlebar',
    materialTitle: 'Choose window material',
    materialBody: 'Apply a system material to the window background.',
    materialOff: 'Off',
    materialOffBody: 'Solid background, best compatibility',
    materialMica: 'Mica',
    materialMicaBody: 'Windows 11 translucent mica material',
    materialTransparent: 'Transparent',
    materialTransparentBody: 'macOS sidebar translucent material',
    back: 'Back',
    next: 'Next',
    successTitle: 'All set',
    successBody: 'Creating the Profile and applying your choices. The app will restart automatically.',
    startUsing: 'Start using',
    working: 'Creating Profile…',
  },
}

const el = (id) => document.getElementById(id)
let info = null
let selection = { presentationMode: 'compatibility', material: 'off' }
let step = 'welcome'
const c = () => COPY[info && info.locale && info.locale.startsWith('zh') ? 'zh' : 'en']

function applyCopy() {
  const copy = c()
  document.documentElement.lang = info && info.locale && info.locale.startsWith('zh') ? 'zh-CN' : 'en'
  document.querySelectorAll('[data-copy]').forEach((node) => {
    const key = node.dataset.copy
    if (copy[key] !== undefined) node.textContent = copy[key]
  })
}

function renderOptions(containerId, options, selected, onPick) {
  const box = el(containerId)
  box.innerHTML = ''
  for (const opt of options) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'option'
    btn.dataset.value = opt.value
    btn.dataset.selected = String(opt.value === selected)
    btn.innerHTML = `<span class="dot"></span><span class="body"><strong>${opt.title}</strong><small>${opt.body}</small></span>`
    btn.addEventListener('click', () => {
      onPick(opt.value)
      box.querySelectorAll('.option').forEach((n) => { n.dataset.selected = String(n.dataset.value === opt.value) })
    })
    box.appendChild(btn)
  }
}

function renderStep(next) {
  document.body.dataset.step = next
  document.querySelectorAll('.page').forEach((p) => { p.hidden = p.dataset.page !== next })
  document.querySelectorAll('.wizard-progress span').forEach((dot) => {
    const order = { welcome: 1, mode: 2, material: 3, success: 4 }
    const current = order[next]
    const index = order[dot.dataset.pt]
    dot.dataset.done = String(index <= current)
  })
  step = next
}

function finish() {
  const btn = el('btn-finish')
  btn.disabled = true
  btn.textContent = c().working
  window.dshNative.wizard.complete(selection).then(() => {
    // 主进程负责 relaunch；这里保持窗口打开等待退出
  }).catch((err) => {
    btn.disabled = false
    btn.textContent = c().startUsing
    // eslint-disable-next-line no-console
    console.error('wizard complete failed', err)
  })
}

function boot() {
  window.dshNative.info().then((value) => {
    info = value
    const s = value.settings || {}
    selection.presentationMode = ['compatibility', 'extended', 'advanced'].includes(s.presentationMode) ? s.presentationMode : 'compatibility'
    selection.material = ['off', 'mica', 'transparent'].includes(s.material) ? s.material : 'off'
    applyCopy()

    const modes = [
      { value: 'compatibility', title: c().modeCompatibility, body: c().modeCompatibilityBody },
      { value: 'extended', title: c().modeExtended, body: info.platform === 'linux' ? c().modeCompatibilityBody : c().modeExtendedBody },
      { value: 'advanced', title: c().modeAdvanced, body: info.platform === 'linux' ? c().modeCompatibilityBody : c().modeAdvancedBody },
    ]
    const materials = []
    materials.push({ value: 'off', title: c().materialOff, body: c().materialOffBody })
    if (info.platform === 'win32') materials.push({ value: 'mica', title: c().materialMica, body: c().materialMicaBody })
    if (info.platform === 'darwin') materials.push({ value: 'transparent', title: c().materialTransparent, body: c().materialTransparentBody })

    renderOptions('mode-options', modes, selection.presentationMode, (v) => { selection.presentationMode = v })
    renderOptions('material-options', materials, selection.material, (v) => { selection.material = v })
    renderStep('welcome')
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('wizard info failed', err)
  })
}

el('btn-skip').addEventListener('click', () => window.dshNative.wizard.cancel())
el('btn-start').addEventListener('click', () => renderStep('mode'))
el('btn-back-mode').addEventListener('click', () => renderStep('welcome'))
el('btn-next-mode').addEventListener('click', () => renderStep('material'))
el('btn-back-material').addEventListener('click', () => renderStep('mode'))
el('btn-next-material').addEventListener('click', () => renderStep('success'))
el('btn-finish').addEventListener('click', finish)

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
