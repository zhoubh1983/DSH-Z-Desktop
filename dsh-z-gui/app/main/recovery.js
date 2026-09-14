/**
 * 恢复体系（单 profile 版）：后端/插件启动失败或用户主动进入时，打开原生「恢复助手」窗口。
 * 提供：安全模式（仅内置 bundle）、插件管理（卸载非内置）、恢复出厂、诊断导出、重启/退出。
 * 单 profile 版不包含多 profile 切换与数据目录迁移。
 * @module dsh-gui/main/recovery
 */

const fs = require('node:fs')
const path = require('node:path')
const { app, ipcMain, shell } = require('electron')
const { resolveDshHome } = require('./paths')
const { loadSettings, saveSettings } = require('./settings')
const { BUILTIN_PLUGINS, BASE_BUNDLES, ensureBuiltinPlugins } = require('./backend')
const { exportDiagnostics } = require('./diagnostics')
const { createNativeWindow } = require('./native-window')

/** 安全模式 bundle 备份文件名（位于 profile 目录内）。 */
const SAFE_BACKUP = '.dsh-safe-backup.json'
/** 恢复出厂时旧 profile 的保留后缀。 */
const TRASH_PREFIX = '.trash-'

let recoveryWin = null
/** 进入恢复模式的原因（后端失败/引导页插件失败/用户手动）。 */
let recoveryReason = null

function profileDir() {
  return path.join(resolveDshHome(), 'profiles', 'web')
}
function profilePackagePath() {
  return path.join(profileDir(), 'package.json')
}
function readProfilePkg() {
  try {
    let raw = fs.readFileSync(profilePackagePath(), 'utf8')
    // 容忍 UTF-8 BOM（PowerShell 等编辑器写入可能带 BOM）。
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1)
    return JSON.parse(raw)
  } catch {
    return {}
  }
}
function writeProfilePkg(pkg) {
  fs.mkdirSync(profileDir(), { recursive: true })
  fs.writeFileSync(profilePackagePath(), JSON.stringify(pkg, null, 2))
}

function isBuiltinBundle(name) {
  return BASE_BUNDLES.includes(name) || BUILTIN_PLUGINS.includes(name)
}

function bundleDir(name) {
  const base = path.join(profileDir(), 'node_modules')
  return name.startsWith('@') ? path.join(base, ...name.split('/')) : path.join(base, name)
}

/** 当前 profile 的 bundle 列表（package.json dsh.profile.bundles）。 */
function listPlugins() {
  const pkg = readProfilePkg()
  const bundles = Array.isArray(pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles)
    ? pkg.dsh.profile.bundles
    : []
  return bundles.map((name) => ({
    name,
    removable: !isBuiltinBundle(name),
    exists: fs.existsSync(bundleDir(name)),
  }))
}

/** 安全模式状态。 */
function safeModeInfo() {
  const s = loadSettings()
  return {
    active: s.safeMode === true,
    backupExists: fs.existsSync(path.join(profileDir(), SAFE_BACKUP)),
  }
}

/** 进入安全模式：备份 bundle/依赖清单，仅保留内置 bundle。 */
function enterSafeMode() {
  const pkg = readProfilePkg()
  const bundles = Array.isArray(pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles)
    ? pkg.dsh.profile.bundles
    : []
  const backupPath = path.join(profileDir(), SAFE_BACKUP)
  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(profileDir(), { recursive: true })
    fs.writeFileSync(
      backupPath,
      JSON.stringify({ bundles, dependencies: pkg.dependencies || {}, devDependencies: pkg.devDependencies || {} }, null, 2),
    )
  }
  const safe = [...BASE_BUNDLES, ...BUILTIN_PLUGINS].filter((b, i, arr) => arr.indexOf(b) === i)
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = safe
  writeProfilePkg(pkg)
  saveSettings({ safeMode: true })
  console.log('[dsh-gui] 已进入安全模式（仅内置 bundle）')
}

/** 退出安全模式：从备份恢复完整 bundle/依赖清单。 */
function exitSafeMode() {
  const backupPath = path.join(profileDir(), SAFE_BACKUP)
  if (fs.existsSync(backupPath)) {
    try {
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
      const pkg = readProfilePkg()
      pkg.dsh = pkg.dsh || {}
      pkg.dsh.profile = pkg.dsh.profile || {}
      pkg.dsh.profile.bundles = Array.isArray(backup.bundles) ? backup.bundles : []
      if (backup.dependencies) pkg.dependencies = backup.dependencies
      if (backup.devDependencies) pkg.devDependencies = backup.devDependencies
      writeProfilePkg(pkg)
      fs.rmSync(backupPath, { force: true })
    } catch (e) {
      console.error('[dsh-gui] 退出安全模式恢复 bundle 清单失败:', e)
    }
  }
  saveSettings({ safeMode: false })
  console.log('[dsh-gui] 已退出安全模式')
}

/** 卸载一个非内置 bundle：从 bundle 清单/依赖移除并删除 node_modules 目录。 */
function uninstallPlugin(name) {
  if (isBuiltinBundle(name)) {
    throw new Error(`内置 bundle 不可卸载：${name}`)
  }
  const pkg = readProfilePkg()
  const bundles = Array.isArray(pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles)
    ? pkg.dsh.profile.bundles
    : []
  pkg.dsh = pkg.dsh || {}
  pkg.dsh.profile = pkg.dsh.profile || {}
  pkg.dsh.profile.bundles = bundles.filter((b) => b !== name)
  if (pkg.dependencies && pkg.dependencies[name]) delete pkg.dependencies[name]
  if (pkg.devDependencies && pkg.devDependencies[name]) delete pkg.devDependencies[name]
  writeProfilePkg(pkg)
  const dir = bundleDir(name)
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  console.log(`[dsh-gui] 已卸载插件：${name}`)
}

/** 恢复出厂（单 profile）：保留旧 profile 为 .trash-<时间>，重建全新 profile 并重置设置。 */
function factoryReset() {
  const pd = profileDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const trash = path.join(path.dirname(pd), `${path.basename(pd)}${TRASH_PREFIX}${stamp}`)
  if (fs.existsSync(pd)) {
    fs.renameSync(pd, trash)
    console.log(`[dsh-gui] 恢复出厂：旧 profile 已保留为 ${trash}`)
  }
  ensureBuiltinPlugins()
  saveSettings({ presentationMode: 'compatibility', material: 'off', safeMode: false })
}

/** 打开恢复助手窗口（幂等）。reason: { requested, stage, detail }。 */
function openRecoveryWindow(reason) {
  recoveryReason = reason || { requested: true, stage: '', detail: '' }
  if (recoveryWin && !recoveryWin.isDestroyed()) {
    recoveryWin.focus()
    return recoveryWin
  }
  recoveryWin = createNativeWindow('recovery.html', {
    title: 'DSH Desktop 恢复助手',
    width: 860,
    height: 620,
    minWidth: 720,
    minHeight: 520,
  })
  recoveryWin.on('closed', () => { recoveryWin = null })
  return recoveryWin
}

/** 恢复窗口快照（渲染端首次加载 + 刷新用）。 */
function snapshot() {
  const s = loadSettings()
  return {
    reason: recoveryReason || { requested: true, stage: '', detail: '' },
    safeModeActive: s.safeMode === true,
    plugins: listPlugins(),
    profileDir: profileDir(),
    dataDir: resolveDshHome(),
    appVersion: require('../package.json').version,
    locale: app.getLocale(),
  }
}

/** 校验渲染端请求打开的路径仅限数据目录/Profile 目录及其中文件。 */
function assertOpenablePath(p) {
  if (typeof p !== 'string' || p.length === 0) throw new Error('无效路径')
  const resolved = path.resolve(p)
  const dataDir = resolveDshHome()
  const pd = profileDir()
  const allowed = [dataDir, pd]
  const inside = (root, child) => child === root || child.startsWith(root + path.sep)
  if (!allowed.some((root) => inside(root, resolved))) {
    throw new Error('不允许打开该路径')
  }
  return resolved
}

/** 注册恢复 IPC（由 index 在 whenReady 调用一次）。 */
function registerRecoveryIpc() {
  ipcMain.handle('recovery:snapshot', () => snapshot())
  ipcMain.handle('recovery:enter-safe-mode', () => {
    enterSafeMode()
    return { ok: true }
  })
  ipcMain.handle('recovery:exit-safe-mode', () => {
    exitSafeMode()
    return { ok: true }
  })
  ipcMain.handle('recovery:uninstall-plugin', (_e, name) => {
    if (typeof name !== 'string' || name.length === 0) throw new Error('无效的插件名')
    uninstallPlugin(name)
    return { ok: true }
  })
  ipcMain.handle('recovery:factory-reset', () => {
    factoryReset()
    return { ok: true }
  })
  ipcMain.handle('recovery:export-diagnostics', async () => {
    const win = recoveryWin && !recoveryWin.isDestroyed() ? recoveryWin : null
    const saved = await exportDiagnostics(win)
    return { ok: saved !== null && saved !== undefined, path: saved || '' }
  })
  ipcMain.handle('recovery:open-path', (_e, p) => {
    const target = assertOpenablePath(p)
    return { ok: !shell.openPath(target) }
  })
  ipcMain.handle('recovery:restart', () => {
    app.relaunch()
    app.exit(0)
    return { ok: true }
  })
  ipcMain.handle('recovery:quit', () => {
    app.quit()
    return { ok: true }
  })
}

/** 恢复助手窗口是否打开中。 */
function isRecoveryOpen() {
  return recoveryWin !== null && !recoveryWin.isDestroyed()
}

module.exports = {
  openRecoveryWindow,
  registerRecoveryIpc,
  isRecoveryOpen,
  safeModeInfo,
  snapshot,
  enterSafeMode,
  exitSafeMode,
  uninstallPlugin,
  factoryReset,
}
