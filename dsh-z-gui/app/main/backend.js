/**
 * dsh 后端进程管理。
 *
 * 核心机制：以 ELECTRON_RUN_AS_NODE=1 模式用当前 Electron 二进制（process.execPath）
 * 作为纯 Node 运行时启动 dsh CLI（内置 Node 运行时，无需任何外部依赖）。
 * 后端启动后动态分配本地端口，等待 HTTP 就绪后交由窗口加载。
 * @module dsh-gui/main/backend
 */

const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const path = require('node:path')

const {
  resolveDshHome,
  resolveDshRuntime,
  resolveDshBin,
  resolveBuiltinPluginsDir,
  resolveBuiltinSkillsMarketDir,
  resolveLogFile,
} = require('./paths')

/** 后端进程崩溃后的自动重启次数上限。 */
const MAX_RESTARTS = 3
/** 等待后端 HTTP 就绪的超时（毫秒）。 */
const READY_TIMEOUT_MS = 60_000
/** 健康探测间隔（毫秒）。 */
const READY_POLL_MS = 500
/** 后端确认死亡（耗尽重启次数）后，探测提前失败的最大等待。 */
const READY_FAIL_FAST_MS = 2000

let child = null
let stopping = false
let restartCount = 0
let logStream = null
/** v0.1.2+ dsh web 输出的带 token 完整 URL（`dsh web: http://host:port/?token=...`）。 */
let webUrl = ''
/** 后端耗尽重启次数后的失败记录（供恢复体系判断）。 */
let bootFailure = null

/** 找到本机一个空闲端口（绑定 0 让 OS 分配后释放）。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/** 轮询探测本地 HTTP 服务是否就绪。后端确认死亡时提前失败，避免拖满 60s。 */
function waitForReady(port, timeoutMs = READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  const failFastAt = Date.now() + READY_FAIL_FAST_MS
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (bootFailure) {
        reject(bootFailure)
        return
      }
      const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
        res.resume()
        resolve()
      })
      req.on('error', () => {
        if (bootFailure && Date.now() > failFastAt) {
          reject(bootFailure)
        } else if (Date.now() > deadline) {
          reject(new Error('等待 dsh 后端就绪超时'))
        } else {
          setTimeout(attempt, READY_POLL_MS)
        }
      })
      req.on('timeout', () => req.destroy())
    }
    attempt()
  })
}

/** 读取并消费后端启动失败记录（无则返回 null）。 */
function consumeBootFailure() {
  const failure = bootFailure
  bootFailure = null
  return failure
}

/**
 * 随 dsh-gui 分发的内置插件（包名；scoped 包含其目录）。
 * 每个插件都是自包含 bundle：GUI 启动时复制到 web profile 的 node_modules，
 * 并确保其出现在 profile 的 dsh.profile.bundles 列表（插件自带的
 * cordis.patch.yml 会作为 bundle patch 自动插入加载行）。
 */
const BUILTIN_PLUGINS = [
  'dsh-webhook-plugin',
  'dsh-dafeiyu',
  'dsh-whale-musume',
  '@zebbkira/dsh-skills-mcp-manager',
  'dsh-memory-plugin',
  'dsh-skill-market',
  'dsh-chrome-control',
  'dsh-conversation-tools',
  'dsh-desktop-frame',
  'dsh-context',
]

/**
 * web profile 的基础 bundle（提供 agents/sessions/settings/webServer/tools
 * 等核心服务；全新 profile 时与内置插件一起写入 bundle 列表）。
 */
const BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']

/**
 * 计算内置插件「代码指纹」：对影响行为的文件做内容哈希
 * （package.json / cordis.patch.yml / lib/** / src/**），用于判断 profile
 * 中的插件副本是否需要随源码刷新。assets / models 等大目录不参与指纹，
 * 避免每次启动扫描大体积资源。
 */
function hashPluginCode(dir) {
  const hash = crypto.createHash('sha1')
  const targets = ['package.json', 'cordis.patch.yml', 'lib', 'src']
  for (const target of targets) {
    const p = path.join(dir, target)
    if (!fs.existsSync(p)) continue
    hash.update(target)
    if (fs.statSync(p).isDirectory()) {
      const files = []
      const stack = [p]
      while (stack.length) {
        const current = stack.pop()
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name)
          if (entry.isDirectory()) stack.push(full)
          else if (entry.isFile()) files.push(full)
        }
      }
      files.sort()
      for (const file of files) {
        hash.update(path.relative(dir, file))
        hash.update(fs.readFileSync(file))
      }
    } else {
      hash.update(fs.readFileSync(p))
    }
  }
  return hash.digest('hex')
}

/** 覆盖式同步一个内置插件包到 profile，并写入代码指纹标记。 */
function syncPluginDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
  fs.writeFileSync(path.join(to, '.dsh-builtin-fingerprint'), hashPluginCode(from), 'utf8')
  console.log(`[dsh-gui] 已同步内置插件 -> ${to}`)
}

/**
 * 安装内置插件到 web profile 并确保 bundle 列表包含它们（幂等）。
 */
function ensureBuiltinPlugins() {
  const src = resolveBuiltinPluginsDir()
  const profileDir = path.join(resolveDshHome(), 'profiles', 'web')
  const profileNm = path.join(profileDir, 'node_modules')

  if (!fs.existsSync(src)) {
    console.error('[dsh-gui] 内置插件目录缺失，跳过安装:', src)
    return
  }

  // 1) 安装/刷新内置插件：缺失时复制；已存在但源码指纹变化时刷新，
  //    避免 dev 模式下 profile 残留旧副本（此前只做「缺失才复制」）
  for (const name of BUILTIN_PLUGINS) {
    const from = path.join(src, name)
    const to = path.join(profileNm, name)
    if (!fs.existsSync(from)) continue
    if (!fs.existsSync(to)) {
      syncPluginDir(from, to)
      continue
    }
    const fingerprint = hashPluginCode(from)
    let stored = ''
    try {
      stored = fs.readFileSync(path.join(to, '.dsh-builtin-fingerprint'), 'utf8').trim()
    } catch { /* 旧副本无指纹标记，视为需要刷新 */ }
    if (stored !== fingerprint) {
      syncPluginDir(from, to)
    }
  }

  // 2) 确保 bundle 列表包含：基础 bundle + 内置插件
  const pkgPath = path.join(profileDir, 'package.json')
  let pkg = {}
  try {
    if (fs.existsSync(pkgPath)) {
      let raw = fs.readFileSync(pkgPath, 'utf8')
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1) // 容忍 UTF-8 BOM
      pkg = JSON.parse(raw)
    }
  } catch { /* 忽略损坏的 manifest */ }
  pkg.dsh ??= {}
  pkg.dsh.profile ??= {}
  const bundles = Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : []
  let changed = false
  for (const name of [...BASE_BUNDLES, ...BUILTIN_PLUGINS]) {
    if (!bundles.includes(name)) {
      bundles.push(name)
      changed = true
    }
  }
  if (changed) {
    pkg.dsh.profile.bundles = bundles
    fs.mkdirSync(profileDir, { recursive: true })
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2))
    console.log('[dsh-gui] 已更新 profile bundle 列表:', bundles.join(', '))
  }

  // 3) dsh-memory embedding 模型自举：随包模型 → $DSH_HOME/dsh-memory/models（缺失时）
  const modelSrc = path.join(src, 'dsh-memory-plugin', 'models')
  const modelDestRoot = path.join(resolveDshHome(), 'dsh-memory', 'models')
  if (fs.existsSync(modelSrc)) {
    fs.mkdirSync(modelDestRoot, { recursive: true })
    for (const modelName of fs.readdirSync(modelSrc)) {
      const from = path.join(modelSrc, modelName)
      const to = path.join(modelDestRoot, modelName)
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true })
        console.log(`[dsh-gui] 已安装 embedding 模型 -> ${to}`)
      }
    }
  }
}

/**
 * 计算内置技能市场「结构指纹」：清单 manifest.json + 每个技能目录的 SKILL.md
 * 内容哈希。技能包内的大文件（pdf 脚本等）不参与指纹，避免每次启动扫描大体积
 * 资源；任何技能增删改（SKILL.md 变化）都会触发指纹变化。
 */
function hashMarketCode(dir) {
  const hash = crypto.createHash('sha1')
  const manifest = path.join(dir, 'manifest.json')
  if (fs.existsSync(manifest)) {
    hash.update('manifest')
    hash.update(fs.readFileSync(manifest))
  }
  const skillsRoot = path.join(dir, 'skills')
  if (fs.existsSync(skillsRoot)) {
    const names = fs.readdirSync(skillsRoot).filter((n) => !n.startsWith('.')).sort()
    for (const name of names) {
      const md = path.join(skillsRoot, name, 'SKILL.md')
      if (fs.existsSync(md)) {
        hash.update(name)
        hash.update(fs.readFileSync(md))
      }
    }
  }
  return hash.digest('hex')
}

/** 覆盖式同步内置技能市场到 $DSH_HOME/skills-market，并写入指纹标记。 */
function syncSkillsMarket(from, to) {
  fs.rmSync(to, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.cpSync(from, to, { recursive: true })
  fs.writeFileSync(path.join(to, '.dsh-market-fingerprint'), hashMarketCode(from), 'utf8')
  console.log(`[dsh-gui] 已同步内置技能市场 -> ${to}`)
}

/**
 * 安装内置技能市场到 $DSH_HOME/skills-market（技能市场插件的默认 marketUrl）：
 * 缺失时全量同步；已存在但结构指纹变化时刷新，保持与源码一致。
 */
function ensureBuiltinSkillsMarket() {
  const src = resolveBuiltinSkillsMarketDir()
  const destRoot = path.join(resolveDshHome(), 'skills-market')
  if (!fs.existsSync(src)) {
    console.error('[dsh-gui] 内置技能市场目录缺失，跳过同步:', src)
    return
  }
  if (!fs.existsSync(destRoot)) {
    syncSkillsMarket(src, destRoot)
    return
  }
  const fingerprint = hashMarketCode(src)
  let stored = ''
  try {
    stored = fs.readFileSync(path.join(destRoot, '.dsh-market-fingerprint'), 'utf8').trim()
  } catch { /* 旧副本无指纹标记，视为需要刷新 */ }
  if (stored !== fingerprint) {
    syncSkillsMarket(src, destRoot)
  }
}

/** 启动 dsh web 后端子进程，返回 { url, port }。 */
async function startBackend() {
  const dshRuntime = resolveDshRuntime()
  const dshBin = resolveDshBin(dshRuntime)
  if (!fs.existsSync(dshBin)) {
    throw new Error(`dsh 运行时缺失：${dshBin}\n请先运行构建脚本生成 dsh-runtime。`)
  }

  ensureBuiltinPlugins()
  ensureBuiltinSkillsMarket()

  const port = await findFreePort()
  logStream = fs.createWriteStream(resolveLogFile(), { flags: 'a' })

  // dsh 的 Cordis 加载器/HMR 需要访问 Node 内部模块（--expose-internals）
  const args = [
    '--expose-internals',
    dshBin,
    'web',
    '--port', String(port),
    '--no-open',
  ]

  const spawnOnce = () => spawn(process.execPath, args, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  /** 等待 forward 捕获到 `dsh web:` 输出的带 token URL（HTTP 就绪可能早于该行输出到达，故竞态保护）。 */
function waitForWebUrl(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs
    const check = () => {
      if (webUrl) return resolve(webUrl)
      if (Date.now() > deadline) return resolve('')
      setTimeout(check, 100)
    }
    check()
  })
}

/** 转发后端输出到控制台/日志，并按行解析 `dsh web:` 的带 token URL（行缓冲防 chunk 切断）。 */
const forward = (stream, label) => {
  let pending = ''
  stream.on('data', (chunk) => {
    pending += chunk.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() || ''
    for (const raw of lines) {
      const text = raw.trimEnd()
      const line = `[${label}] ${text}`
      console.log(line)
      if (logStream) logStream.write(line + '\n')
      // v0.1.2+ 的 dsh web 默认带 token 认证（`dsh web: http://host:port/?token=...`）。
      // 窗口必须加载带 token 的完整 URL，否则 401 黑屏。
      const match = /dsh web:\s*(https?:\/\/\S+)/.exec(text)
      if (match) webUrl = match[1].trim()
    }
  })
}

  const boot = async () => {
    stopping = false
    child = spawnOnce()
    forward(child.stdout, 'dsh')
    forward(child.stderr, 'dsh:err')

    child.on('exit', (code, signal) => {
      console.log(`[dsh-gui] dsh 后端退出 code=${code} signal=${signal}`)
      if (logStream) logStream.write(`[dsh-gui] dsh 后端退出 code=${code} signal=${signal}\n`)
      child = null
      if (!stopping && restartCount < MAX_RESTARTS) {
        restartCount += 1
        console.log(`[dsh-gui] 尝试重启后端 (${restartCount}/${MAX_RESTARTS})...`)
        setTimeout(() => void boot(), 1000)
      } else if (!stopping) {
        bootFailure = Object.assign(
          new Error(`dsh 后端连续退出（已尝试 ${MAX_RESTARTS} 次），最近一次 code=${code} signal=${signal}`),
          { stage: 'host-boot', code, signal },
        )
        console.error('[dsh-gui] 后端启动失败：', bootFailure.message)
      }
    })
    child.on('error', (err) => {
      console.error('[dsh-gui] 后端进程错误:', err)
    })

    await waitForReady(port)
  }

  await boot()
  // HTTP 就绪探测可能早于 `dsh web:` 输出到达（500ms 轮询 vs 输出缓冲），
  // 再等待捕获带 token 的完整 URL；超时（后端无 token 输出）则回退裸地址。
  const url = (await waitForWebUrl()) || `http://127.0.0.1:${port}`
  return { url, port }
}

/** 停止后端子进程（幂等）。 */
function stopBackend() {
  stopping = true
  if (child && !child.killed) {
    try {
      child.kill()
    } catch {
      /* 已退出 */
    }
  }
  child = null
  if (logStream) {
    logStream.end()
    logStream = null
  }
}

/**
 * 重启后端子进程（操作栏/托盘「重启」用）：停止当前进程、重置重启计数后重新 boot，
 * 返回新的 { url, port }。
 */
async function restartBackend() {
  stopBackend()
  restartCount = 0
  bootFailure = null
  webUrl = ''
  return startBackend()
}

module.exports = {
  startBackend,
  stopBackend,
  restartBackend,
  consumeBootFailure,
  ensureBuiltinPlugins,
  BUILTIN_PLUGINS,
  BASE_BUNDLES,
}
