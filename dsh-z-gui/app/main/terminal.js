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

const { spawn } = require('node:child_process')
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

  return { shimDir, welcomePath, profileDir, dshHome, productVersion }
}

/** Windows 回退 shell：cmd.exe（解析 ComSpec，几乎必然存在）。 */
function resolveCmd() {
  return process.env.ComSpec || path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
}

/** 拉起系统终端（win32 普通控制台；darwin 用 Terminal.app；linux 不支持）。 */
function openTerminal() {
  const { shimDir, welcomePath, profileDir, dshHome, productVersion } = prepareFiles()

  const env = {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_DESKTOP_VERSION: productVersion,
    PATH: `${shimDir}${path.delimiter}${process.env.PATH || ''}`,
  }

  if (process.platform === 'win32') {
    const cmd = resolveCmd()
    // 直接拉起普通控制台窗口（cmd /K 欢迎脚本）。wt.exe 在远程控制/虚拟显示
    // 环境下 ConPTY 创建可能失败（0xD0000008），故不再优先尝试 Windows Terminal。
    spawn(cmd, ['/K', welcomePath], { env, cwd: profileDir, windowsHide: false, detached: false })
      .on('error', (error) => {
        console.error('[dsh-gui] 终端启动失败:', error.message)
      })
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
