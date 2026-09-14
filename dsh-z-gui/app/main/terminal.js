/**
 * 终端动作：拉起系统终端并注入 dsh 环境（参考 dsh-desktop 的 desktop-terminal）。
 *
 * 机制：
 *  - 在 $DSH_HOME/gui/terminal 生成 dsh/node 命令 shim 与欢迎脚本
 *  - shim 复用当前 Electron 二进制以 ELECTRON_RUN_AS_NODE 模式运行 dsh CLI
 *    （与 backend.js 相同，无需任何外部 Node 依赖）
 *  - Windows 优先 Windows Terminal，回退 cmd.exe；macOS 用 Terminal.app
 * @module dsh-gui/main/terminal
 */

const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const { resolveDshHome, resolveDshRuntime, resolveDshBin } = require('./paths')

/** 终端 state 目录（$DSH_HOME/gui/terminal）。 */
function stateDirectory() {
  return path.join(resolveDshHome(), 'gui', 'terminal')
}

/** 转义 batch 文本中的 cmd 特殊字符（欢迎脚本 echo 内容用）。 */
function escapeBatchText(value) {
  return String(value)
    .replaceAll('^', '^^')
    .replaceAll('%', '%%')
    .replaceAll('&', '^&')
    .replaceAll('|', '^|')
    .replaceAll('<', '^<')
    .replaceAll('>', '^>')
    .replaceAll('(', '^(')
    .replaceAll(')', '^)')
}

/** 转义写入 shim 的路径值（cmd 引号内出现 % 需加倍）。 */
function escapeBatchPath(value) {
  return String(value).replaceAll('%', '%%')
}

/** 原子写文件（先写临时文件再重命名，避免并发终端同时写坏）。 */
function replaceFile(filename, contents) {
  const tmp = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', flag: 'wx' })
  try {
    fs.renameSync(tmp, filename)
  } catch (error) {
    try { fs.unlinkSync(tmp) } catch { /* noop */ }
    throw error
  }
}

/** 生成 shim 与欢迎脚本；返回 { shimDir, welcomePath, welcomePsPath }。 */
function prepareFiles() {
  const stateDir = stateDirectory()
  const shimDir = path.join(stateDir, 'bin')
  fs.mkdirSync(shimDir, { recursive: true })

  const execPath = process.execPath
  const dshBin = resolveDshBin(resolveDshRuntime())
  const dshHome = resolveDshHome()
  const profileDir = path.join(dshHome, 'profiles', 'web')
  const productVersion = process.env.npm_package_version || require('../package.json').version

  // dsh 命令 shim：Electron 二进制以 Node 模式运行 dsh CLI（--expose-internals 与后端一致）。
  const dshShim = [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${escapeBatchPath(execPath)}" --expose-internals "${escapeBatchPath(dshBin)}" %*`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n')
  // node 命令 shim：Electron 二进制作为普通 Node 运行时。
  const nodeShim = [
    '@echo off',
    'setlocal DisableDelayedExpansion',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${escapeBatchPath(execPath)}" %*`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n')

  replaceFile(path.join(shimDir, 'dsh.cmd'), dshShim)
  replaceFile(path.join(shimDir, 'node.cmd'), nodeShim)

  const welcomePath = path.join(stateDir, 'welcome.cmd')
  const welcome = [
    '@echo off',
    'setlocal EnableDelayedExpansion',
    `cd /d "${escapeBatchText(profileDir)}"`,
    'echo(',
    `echo(DSH Desktop ${escapeBatchText(productVersion)} terminal`,
    `echo(DSH_HOME: !DSH_HOME!`,
    'echo(Profile: web',
    'echo(Commands:',
    'echo(  dsh --dump-config',
    'echo(  dsh web --port 8899 --no-open',
    'echo(',
    'echo(Restart DSH Desktop after plugin changes.',
    'endlocal',
    '',
  ].join('\r\n')
  replaceFile(welcomePath, welcome)

  // pwsh 欢迎脚本（DSH_TERMINAL=pwsh / wt 时使用）。
  const welcomePsPath = path.join(stateDir, 'welcome.ps1')
  const welcomePs = [
    '# DSH Desktop terminal',
    `$env:DSH_HOME = '${escapePsPath(dshHome)}'`,
    `Set-Location -LiteralPath '${escapePsPath(profileDir)}'`,
    `Write-Host ('DSH Desktop {0} terminal' -f '${escapePsPath(productVersion)}')`,
    'Write-Host ("DSH_HOME: {0}" -f $env:DSH_HOME)',
    'Write-Host "Profile: web"',
    'Write-Host "Commands: dsh --dump-config / dsh web --port 8899 --no-open"',
    'Write-Host "Restart DSH Desktop after plugin changes."',
    '',
  ].join('\r\n')
  replaceFile(welcomePsPath, welcomePs)

  return { shimDir, welcomePath, welcomePsPath, profileDir, dshHome, productVersion }
}

/** 转义写入 PowerShell 脚本的单引号字符串（路径含反引号/单引号时）。 */
function escapePsPath(value) {
  return String(value).replaceAll("'", "''").replaceAll('`', '``').replaceAll('$', '`$')
}

/** Windows 回退 shell：cmd.exe（解析 ComSpec，几乎必然存在）。 */
function resolveCmd() {
  return process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
}

/** 用 where.exe 解析可执行文件路径（不存在返回 null）。 */
function whichExecutable(name) {
  try {
    const r = spawnSync('where.exe', [name], { stdio: 'pipe', windowsHide: true, timeout: 5000 })
    if (r.status === 0) {
      const first = r.stdout.toString().split(/\r?\n/).map((s) => s.trim()).find(Boolean)
      if (first && fs.existsSync(first)) return first
    }
  } catch { /* 探测失败视为不存在 */ }
  return null
}

/** 解析 PowerShell（pwsh 优先，回退 powershell）。 */
function resolvePwsh() {
  return whichExecutable('pwsh.exe') || whichExecutable('powershell.exe')
}

/** 解析 Windows Terminal。 */
function resolveWt() {
  return whichExecutable('wt.exe')
}

/** 拉起系统终端（win32：cmd 默认稳定 / wt·pwsh 可选；darwin 用 Terminal.app；linux 不支持）。 */
function openTerminal() {
  const { shimDir, welcomePath, welcomePsPath, profileDir, dshHome, productVersion } = prepareFiles()

  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_DESKTOP_VERSION: productVersion,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH || ''}`,
  }

  if (process.platform === 'win32') {
    const cmd = resolveCmd()
    const cmdLaunch = () => {
      // 默认普通控制台（cmd /K 欢迎脚本）：远程控制/虚拟显示环境下
      // wt 的 ConPTY 创建可能失败（0xD0000008），故默认不启用 wt。
      spawn(cmd, ['/K', welcomePath], { env, cwd: profileDir, windowsHide: false, detached: false })
        .on('error', (error) => { console.error('[dsh-gui] 终端启动失败:', error.message) })
    }
    const override = (process.env.DSH_TERMINAL || '').toLowerCase()
    if (override === 'wt') {
      const wt = resolveWt()
      if (wt) {
        spawn(wt, ['new-tab', '--title', 'DSH Desktop', '-d', profileDir, cmd, '/K', welcomePath],
          { env, cwd: profileDir, windowsHide: false, detached: false })
          .on('error', (error) => { console.warn('[dsh-gui] wt 启动失败，降级 cmd:', error.message); cmdLaunch() })
        return
      }
      console.warn('[dsh-gui] wt.exe 不可用，降级 cmd')
      cmdLaunch()
      return
    }
    if (override === 'pwsh') {
      const pwsh = resolvePwsh()
      if (pwsh) {
        spawn(pwsh, ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', welcomePsPath],
          { env, cwd: profileDir, windowsHide: false, detached: false })
          .on('error', (error) => { console.warn('[dsh-gui] pwsh 启动失败，降级 cmd:', error.message); cmdLaunch() })
        return
      }
      console.warn('[dsh-gui] pwsh 不可用，降级 cmd')
      cmdLaunch()
      return
    }
    cmdLaunch()
    return
  }
  if (process.platform === 'darwin') {
    // Terminal.app 打开欢迎脚本（脚本内 exec 交互 shell）。
    const welcomeSh = path.join(stateDirectory(), 'welcome.command')
    const shimDsh = path.join(shimDir, 'dsh')
    replaceFile(shimDsh, [
      '#!/bin/sh',
      `export ELECTRON_RUN_AS_NODE=1`,
      `exec "${process.execPath}" --expose-internals "${resolveDshBin(resolveDshRuntime())}" "$@"`,
      '',
    ].join('\n'))
    fs.chmodSync(shimDsh, 0o700)
    replaceFile(welcomeSh, [
      '#!/bin/sh',
      `export DSH_HOME="${dshHome}"`,
      `export PATH="${shimDir}:$PATH"`,
      `cd "${profileDir}"`,
      `echo "DSH Desktop ${productVersion} terminal"`,
      `echo "DSH_HOME: $DSH_HOME"`,
      `echo "Profile: web"`,
      `echo "Commands: dsh --dump-config / dsh web --port 8899 --no-open"`,
      `echo "Restart DSH Desktop after plugin changes."`,
      `exec "$SHELL" -l`,
      '',
    ].join('\n'))
    fs.chmodSync(welcomeSh, 0o700)
    spawn('open', ['-a', 'Terminal', welcomeSh], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  console.warn('[dsh-gui] 当前平台暂不支持终端动作:', process.platform)
}

module.exports = { openTerminal, stateDirectory }
