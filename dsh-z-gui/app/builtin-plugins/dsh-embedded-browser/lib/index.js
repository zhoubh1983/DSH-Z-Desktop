/**
 * dsh-embedded-browser（Host 侧）：向 Agent 注册 webview_* 工具。
 *
 * 工具本身不直接接触渲染层：dsh web 后端进程启动时由 dsh-gui 注入
 * DSH_BROWSER_BRIDGE_URL（主进程浏览器桥，仅监听 127.0.0.1），
 * 工具通过 fetch 调用桥端点，由桥实时查找右侧 <webview> 的访客 webContents
 * 并执行导航/截图。右侧面板未打开时桥返回明确错误，工具原样透出。
 */

const name = 'dsh-embedded-browser'
const inject = ['tools']

/** dsh-gui 注入的浏览器桥基地址（http://127.0.0.1:<port>）。 */
const BRIDGE_URL = process.env.DSH_BROWSER_BRIDGE_URL || ''

/** 调用浏览器桥，返回 { ok, status, ...body }；网络异常时给可读错误。 */
async function bridgeFetch(method, path, body) {
  if (!BRIDGE_URL) {
    return { ok: false, status: 0, error: '浏览器桥未就绪（缺少 DSH_BROWSER_BRIDGE_URL）' }
  }
  try {
    const res = await fetch(BRIDGE_URL + path, {
      method,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, ...data }
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

const WEBVIEW_OFFLINE = 'webview 未打开（请先打开右侧「浏览器」标签页）'

function registerWebviewTools(ctx) {
  ctx.tools.register({
    name: 'webview_navigate',
    description:
      '在 DSH 右侧的内嵌浏览器面板中打开指定网址。当用户要求「打开某个网站/网页/链接」时调用。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要打开的完整网址，如 https://www.baidu.com' },
      },
      required: ['url'],
    },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const url = (args && args.url) || ''
      if (!/^https?:\/\//i.test(url.trim())) {
        return 'url 参数必须以 http:// 或 https:// 开头'
      }
      const r = await bridgeFetch('POST', '/navigate', { url: url.trim() })
      if (r.ok) return `已在右侧浏览器面板打开 ${url.trim()}`
      return `打开失败：${r.error || (r.status ? `HTTP ${r.status}` : '未知错误')}`
    },
  })

  ctx.tools.register({
    name: 'webview_url',
    description: '查看右侧内嵌浏览器当前打开的网址。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute() {
      const r = await bridgeFetch('GET', '/url')
      if (r.ok) return `当前网址：${r.url || '（空白页）'}`
      return r.error || WEBVIEW_OFFLINE
    },
  })

  ctx.tools.register({
    name: 'webview_back',
    description: '在右侧内嵌浏览器中后退一页。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute() {
      const r = await bridgeFetch('POST', '/back')
      return r.ok ? '已后退' : (r.error || WEBVIEW_OFFLINE)
    },
  })

  ctx.tools.register({
    name: 'webview_forward',
    description: '在右侧内嵌浏览器中前进一页。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute() {
      const r = await bridgeFetch('POST', '/forward')
      return r.ok ? '已前进' : (r.error || WEBVIEW_OFFLINE)
    },
  })

  ctx.tools.register({
    name: 'webview_reload',
    description: '刷新右侧内嵌浏览器的当前页面。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute() {
      const r = await bridgeFetch('POST', '/reload')
      return r.ok ? '已刷新' : (r.error || WEBVIEW_OFFLINE)
    },
  })

  ctx.tools.register({
    name: 'webview_screenshot',
    description:
      '对右侧内嵌浏览器的当前页面截图并保存为 PNG 文件，返回文件路径。当用户想「看网页长什么样」时调用。',
    parameters: { type: 'object', properties: {} },
    output: { schema: { type: 'string' }, render: (_a, value) => [{ type: 'text', text: value }] },
    async execute() {
      const r = await bridgeFetch('POST', '/screenshot')
      if (!r.ok) return r.error || WEBVIEW_OFFLINE
      // 只回「文件名（去扩展名）+ 目录」：模型平台会把工具结果里的图片引用
      // （data URL 或 *.png 路径）当视觉输入解析，失败时报 UnknownVizError。
      const raw = (r.path || '').replace(/\\/g, '/')
      const dir = raw.slice(0, raw.lastIndexOf('/'))
      const base = raw.slice(raw.lastIndexOf('/') + 1).replace(/\.png$/i, '')
      return `已截图保存（${r.width}×${r.height}），文件 ${base}，位于 ${dir}`
    },
  })
}

function apply(ctx, config = {}) {
  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (toolsCtx) => {
      if (toolsCtx.tools && typeof toolsCtx.tools.register === 'function') {
        registerWebviewTools(toolsCtx)
        toolsCtx.logger?.info?.('[dsh-embedded-browser] webview 工具已注册（桥 %s）', BRIDGE_URL || '未注入')
      }
    })
    return
  }
  if (ctx.tools && typeof ctx.tools.register === 'function') registerWebviewTools(ctx)
}

export { name, inject, apply }
