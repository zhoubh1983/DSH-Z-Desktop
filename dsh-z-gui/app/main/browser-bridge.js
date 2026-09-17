/**
 * dsh-gui 浏览器桥：主进程内的本地 REST 服务（仅监听 127.0.0.1）。
 *
 * 作用：让 dsh web 后端的 Agent 工具（dsh-embedded-browser 插件）能驱动
 * 右侧面板里的 <webview> 访客页面。桥本身不持有窗口状态，每次请求实时
 * 从 webContents.getAllWebContents() 中找出 getType() === 'webview' 的访客
 * webContents（与渲染层 <webview> 元素指向同一个 guest），直接调用其导航 API。
 *
 * 端点（全部 JSON）：
 *   GET  /status      -> { ok, webview: bool, url }
 *   POST /navigate    -> { url } 打开新地址（仅 http/https）
 *   POST /back        -> 后退
 *   POST /forward     -> 前进
 *   POST /reload      -> 刷新
 *   GET  /url         -> { ok, url }
 *   POST /screenshot  -> { ok, width, height, path }（PNG 存到 ~/.dsh/gui/screenshots/，
 *                        只回文件路径，避免把超大 data URL 塞进模型上下文）
 */

const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { webContents } = require('electron')
const { resolveDshHome } = require('./paths')

const HOST = '127.0.0.1'
const MAX_BODY = 1024 * 1024 // 1MB

let server = null
let port = 0

/** 当前存在的 webview 访客 webContents（无则 null）。 */
function findWebview() {
  return webContents.getAllWebContents().find((wc) => wc.getType() === 'webview' && !wc.isDestroyed()) || null
}

/** 仅允许环回地址访问（桥无鉴权，只绑本机）。 */
function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** 校验 url 只允许 http/https，返回规范化地址或抛错。 */
function validateHttpUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('url 不能为空')
  const url = new URL(raw.trim())
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('仅支持 http/https 地址')
  return url.toString()
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', (chunk) => {
      bytes += chunk.length
      if (bytes > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve(text ? JSON.parse(text) : {})
      } catch {
        reject(new Error('invalid json body'))
      }
    })
    req.on('error', reject)
  })
}

async function handleRequest(req, res) {
  if (!isLoopback(req.socket?.remoteAddress)) {
    json(res, 403, { ok: false, error: 'local access only' })
    return
  }
  if (req.method === 'OPTIONS') {
    json(res, 204, { ok: true })
    return
  }
  const urlPath = (req.url || '/').split('?')[0]
  const method = req.method || 'GET'
  try {
    if (method === 'GET' && urlPath === '/status') {
      const wc = findWebview()
      json(res, 200, { ok: true, webview: !!wc, url: wc ? wc.getURL() : null })
      return
    }
    if (method === 'GET' && urlPath === '/url') {
      const wc = findWebview()
      if (!wc) { json(res, 409, { ok: false, error: 'webview 未打开（请先打开右侧「浏览器」标签页）' }); return }
      json(res, 200, { ok: true, url: wc.getURL() })
      return
    }
    if (method === 'POST' && urlPath === '/navigate') {
      const body = await readJsonBody(req)
      const wc = findWebview()
      if (!wc) { json(res, 409, { ok: false, error: 'webview 未打开（请先打开右侧「浏览器」标签页）' }); return }
      const url = validateHttpUrl(body.url)
      try {
        await wc.loadURL(url)
      } catch (error) {
        // 站点重定向/主框架被后续导航替换时，loadURL 会以 ERR_ABORTED(-3)
        // reject，但导航其实已生效（实测 bing→cn.bing 即此路径）。
        if (error && error.errno === -3) {
          const actual = wc.getURL() || ''
          json(res, 200, { ok: true, url: actual || url })
          return
        }
        throw error
      }
      json(res, 200, { ok: true, url })
      return
    }
    if (method === 'POST' && ['/back', '/forward', '/reload'].includes(urlPath)) {
      const wc = findWebview()
      if (!wc) { json(res, 409, { ok: false, error: 'webview 未打开（请先打开右侧「浏览器」标签页）' }); return }
      if (urlPath === '/back') wc.navigationHistory.goBack()
      else if (urlPath === '/forward') wc.navigationHistory.goForward()
      else wc.reload()
      json(res, 200, { ok: true })
      return
    }
    if (method === 'POST' && urlPath === '/screenshot') {
      const wc = findWebview()
      if (!wc) { json(res, 409, { ok: false, error: 'webview 未打开（请先打开右侧「浏览器」标签页）' }); return }
      // capturePage 在窗口被其他窗口完全遮挡（occluded）时会一直挂起不 resolve
      // （Electron Windows 已知行为，实测 15s+ 无响应）。带超时保护，超时给出
      // 明确错误提示，避免桥请求无限挂死。
      const withTimeout = (promise, ms) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ])
      let png = null
      try {
        const image = await withTimeout(wc.capturePage(), 15000)
        png = image.toPNG()
      } catch {
        json(res, 500, {
          ok: false,
          error: '截图超时：DSH 窗口被其他窗口遮挡时无法截取内嵌浏览器画面，请将 DSH 窗口置于前台后重试',
        })
        return
      }
      // 从 PNG 头（IHDR）解析宽高：字节 16-19 宽、20-23 高（大端）。
      const width = png.readUInt32BE(16)
      const height = png.readUInt32BE(20)
      // 存盘并只回路径：data URL 动辄几十万字符，塞回模型上下文既撑爆 tokens，
      // 又可能触发模型平台把它当视觉输入解析而报错（实测 UnknownVizError）。
      const dir = path.join(resolveDshHome(), 'gui', 'screenshots')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, `webview-${Date.now()}.png`)
      fs.writeFileSync(file, png)
      json(res, 200, { ok: true, width, height, path: file })
      return
    }
    json(res, 404, { ok: false, error: 'not found' })
  } catch (error) {
    json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}

/** 启动浏览器桥（幂等），返回基地址 http://127.0.0.1:<port>。 */
function startBrowserBridge() {
  if (server) return Promise.resolve(`http://${HOST}:${port}`)
  return new Promise((resolve, reject) => {
    server = http.createServer(handleRequest)
    server.once('error', (error) => {
      server = null
      reject(error)
    })
    server.listen(0, HOST, () => {
      port = server.address().port
      console.log(`[dsh-gui] 浏览器桥已启动 ${HOST}:${port}`)
      resolve(`http://${HOST}:${port}`)
    })
  })
}

module.exports = { startBrowserBridge }
