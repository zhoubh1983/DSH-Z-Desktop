/**
 * 诊断导出：收集日志/配置/系统信息，打包 zip 供排障（参考官方 diagnostic-export）。
 * @module dsh-gui/main/diagnostics
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { dialog, app } = require('electron')
const { resolveDshHome, resolveLogFile } = require('./paths')

/** 系统与应用信息快照。 */
function collectSystemInfo() {
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    osVersion: os.version ? os.version() : undefined,
    hostname: os.hostname(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
    dshHome: resolveDshHome(),
  }
}

/** 收集关键文件到导出目录（日志 / dsh 设置 / gui 设置 / profile 清单）。 */
function collectFiles(exportDir) {
  const sources = [
    { label: 'dsh-gui.log', file: resolveLogFile() },
    { label: 'settings.yaml', file: path.join(resolveDshHome(), 'settings.yaml') },
    { label: 'gui-settings.json', file: path.join(app.getPath('userData'), 'settings.json') },
    { label: 'profile-package.json', file: path.join(resolveDshHome(), 'profiles', 'web', 'package.json') },
  ]
  const copied = []
  for (const entry of sources) {
    if (!fs.existsSync(entry.file)) continue
    try {
      fs.copyFileSync(entry.file, path.join(exportDir, entry.label))
      copied.push(entry.label)
    } catch (error) {
      console.warn('[dsh-gui] 诊断导出跳过', entry.label, error instanceof Error ? error.message : String(error))
    }
  }
  // 日志只保留最近 N 行，避免诊断包过大。
  const logTarget = path.join(exportDir, 'dsh-gui.log')
  if (fs.existsSync(logTarget)) {
    try {
      const raw = fs.readFileSync(logTarget, 'utf8')
      const tail = raw.split(/\r?\n/).slice(-4000).join('\n')
      fs.writeFileSync(logTarget, tail, 'utf8')
    } catch { /* 忽略 */ }
  }
  return copied
}

/** 用系统 tar.exe（bsdtar）打包 zip；失败回退纯目录。 */
function zipDirectory(dir, zipPath) {
  try {
    const result = spawnSync('tar.exe', ['-a', '-c', '-f', zipPath, '-C', dir, '.'], {
      stdio: 'pipe', timeout: 30_000, windowsHide: true,
    })
    if (result.status === 0 && fs.existsSync(zipPath)) return true
    console.warn('[dsh-gui] tar 打包失败，回退目录模式:', result.stderr ? result.stderr.toString().slice(0, 200) : '')
  } catch (error) {
    console.warn('[dsh-gui] tar 打包异常，回退目录模式:', error.message)
  }
  return false
}

/**
 * 导出诊断包：弹保存对话框，收集信息并打包。
 * @param win - 父窗口（对话框模态归属）。
 * @returns 保存路径或 null（用户取消/失败）。
 */
async function exportDiagnostics(win) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const defaultName = `dsh-desktop-diagnostics-${stamp}.zip`
  const { canceled, filePath } = await dialog.showSaveDialog(win || undefined, {
    title: '导出诊断信息',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }],
  })
  if (canceled || !filePath) return null

  const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-diagnostics-'))
  try {
    fs.writeFileSync(
      path.join(exportDir, 'system-info.json'),
      JSON.stringify(collectSystemInfo(), null, 2),
      'utf8',
    )
    const copied = collectFiles(exportDir)
    if (fs.existsSync(path.join(exportDir, 'system-info.json')) && copied.length === 0
      && !fs.existsSync(path.join(exportDir, 'dsh-gui.log'))) {
      throw new Error('未收集到任何诊断文件')
    }
    if (!zipDirectory(exportDir, filePath)) {
      // 回退：把目录留在临时位置并提示。
      const fallback = path.join(app.getPath('temp'), defaultName.replace('.zip', ''))
      fs.cpSync(exportDir, fallback, { recursive: true })
      await dialog.showMessageBox(win || undefined, {
        type: 'info', title: 'DSH Desktop',
        message: '打包 zip 失败，已导出为文件夹',
        detail: fallback,
      })
      return fallback
    }
    return filePath
  } finally {
    fs.rmSync(exportDir, { recursive: true, force: true })
  }
}

module.exports = { exportDiagnostics, collectSystemInfo }
