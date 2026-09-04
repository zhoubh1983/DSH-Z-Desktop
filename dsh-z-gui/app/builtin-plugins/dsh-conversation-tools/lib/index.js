/**
 * dsh-conversation-tools —— Host 侧服务：在 dsh web 自带的 webServer 上挂
 * /plugins/dsh-conversation-tools/api/* 路由。
 *
 * 提供：
 *  - GET  /api/workspaces  列出全部工作区（id/title/path），供前端弹层选择；
 *  - POST /api/open        用系统默认方式在本地资源管理器定位/打开指定目录。
 *
 * 「精简历史（压缩对话）」不在服务端实现——dsh 已内置 /compact 命令，
 * 由前端通过会话通道 send('/compact') 触发，这里只负责工作区相关能力。
 * 与 dsh-skill-market / dsh-memory-plugin 同一套零构建、webServer prefix 挂载模式。
 */

import { spawn } from 'node:child_process'

export const name = 'dsh-conversation-tools'
export const inject = ['webServer']

/** 管理 API 前缀（子路径，避免劫持 /plugins/<name>/client.js 客户端 bundle 路由）。 */
const API_PREFIX = '/plugins/dsh-conversation-tools/api'

const isWindows = process.platform === 'win32'
/** 处理本地回环连接。 */
function isLoopback(remoteAddress) {
  if (remoteAddress === undefined || remoteAddress === null) return true
  const addr = String(remoteAddress)
  return addr === '::1' || addr === '127.0.0.1' || addr.startsWith('::ffff:127.')
}
/** 写 JSON 响应。 */
function apiJson(res, status, obj) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}
/** 读取 JSON 请求体；失败返回 null。 */
async function readJsonBody(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (raw.length === 0) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
/** Windows 定位到文件夹并选中（explorer /select,"path"）；其它平台用 xdg-open 打开目录。 */
function openInExplorer(objectPath) {
  const args = isWindows ? ['/select,' + objectPath] : [objectPath]
  const command = isWindows ? 'explorer.exe' : 'xdg-open'
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}

/** 校验路径形如 Windows / POSIX 绝对路径，防御无意义或探测性输入。 */
function isAbsoluteish(p) {
  return /^[A-Za-z]:[\\/]/.test(p)      // C:\ or C:/
    || /^\\\\.*\\/.test(p)              // UNC
    || /^[\\/]/.test(p)                 // POSIX 根
}

/** 构造 API handler。 */
function createApi(ctx) {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      apiJson(res, 403, { ok: false, error: 'local access only' })
      return
    }
    const origin = req.headers?.origin
    if (origin) {
      let originHost
      try { originHost = new URL(origin).host } catch { /* keep undefined */ }
      if (!originHost || originHost !== req.headers?.host) {
        apiJson(res, 403, { ok: false, error: 'origin mismatch' })
        return
      }
    }
    if (req.method === 'OPTIONS') { apiJson(res, 204, {}); return }

    const urlPath = (req.url ?? '/').split('?')[0]
    try {
      if (urlPath === `${API_PREFIX}/workspaces` && req.method === 'GET') {
        let list = []
        const registry = ctx.get('workspaceRegistry')
        if (registry && typeof registry.list === 'function') {
          try {
            list = registry.list().map((w) => ({
              id: String(w.id),
              title: typeof w.title === 'string' ? w.title : w.path,
              path: typeof w.path === 'string' ? w.path : '',
            })).filter((w) => w.path !== '')
          } catch (error) {
            ctx?.logger?.warn?.(`listing workspaces failed: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        return apiJson(res, 200, { ok: true, workspaces: list })
      }

      if (urlPath === `${API_PREFIX}/open` && req.method === 'POST') {
        const body = await readJsonBody(req)
        const p = typeof body?.path === 'string' ? body.path.trim() : ''
        if (!isAbsoluteish(p)) return apiJson(res, 400, { ok: false, error: 'invalid path' })
        try {
          openInExplorer(p)
        } catch (error) {
          return apiJson(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
        return apiJson(res, 200, { ok: true })
      }

      return apiJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return apiJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** 应用入口：webServer 就绪后挂载路由（与 dsh-skill-market 相同的可选服务注入模式）。 */
function apply(ctx) {
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: createApi(httpCtx) }),
        'dsh-conversation-tools: api',
      )
    })
    return
  }
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PREFIX, handler: createApi(ctx) }),
    'dsh-conversation-tools: api',
  )
}

export { apply }