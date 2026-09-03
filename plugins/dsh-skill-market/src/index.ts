/**
 * dsh-skill-market —— 技能市场（宿主半边）。
 *
 * 在 DSH Web GUI「设置」注册一级菜单「技能市场」（settings.section，与
 * 模型/插件等并列），提供：
 *  - 可配置市场地址（默认 ~/.dsh/skills-market，随应用内置技能集合同步）；
 *  - 浏览市场技能（解析 manifest.json，Anthropic/OpenAI/Vercel 官方技能）；
 *  - 一键安装/覆盖更新到 ~/.dsh/skills；
 *  - 卸载（仅限市场来源安装的技能，防误删用户自建技能）。
 *
 * 依赖 external：@deepseek-ai/cordis、@deepseek-ai/schemastery、@deepseek-ai/dsh-settings
 * （均由 dsh runtime 提供）。零第三方运行时依赖。
 */

import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defaultMarketDir, MarketEngine, type MarketSkill } from './market'

export const name = 'dsh-skill-market'

/** 依赖的服务：设置（持久化 marketUrl）、webServer（管理 API）。 */
export const inject = ['settings', 'webServer']

/** 用户可配置项。 */
export interface Config {
  /** 市场总开关。 */
  enabled: boolean
  /** 市场地址（空 = 默认 ~/.dsh/skills-market；可指向任意本地目录）。 */
  marketUrl: string
}

export const Config: Schema<Config> = Schema.object({
  enabled: Schema.boolean().default(true),
  marketUrl: Schema.string().default(''),
})

/**
 * 管理 API 前缀（浏览器端 client 用同值 fetch）。
 * 注意：不能占用 /plugins/dsh-skill-market 根前缀 —— dsh web 用
 * /plugins/<name>/client.js 服务插件客户端 bundle，根前缀会被本 API 劫持。
 */
export const MARKET_API = '/plugins/dsh-skill-market/api'

/** 无 settings 服务时的内存兜底作用域。 */
interface SettingsLike {
  get(): unknown
  update?(patch: object): Promise<void>
  replace?(section: object): Promise<void>
  watch?(_cb: (next: Config) => void): () => void
}

function localSettingsScope<T>(value: T): SettingsLike & { get(): T } {
  return {
    get: () => value,
    update: async () => {},
    replace: async () => {},
    watch: () => () => {},
  }
}

function apiJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    bytes += chunk.length
    if (bytes > 1024 * 1024) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** 管理 API 处理器：列表/信息/配置/安装/卸载。仅允许本机回环访问。 */
function createMarketApi(
  engine: MarketEngine,
  settings: SettingsLike,
): (req: IncomingMessage, res: ServerResponse) => void | Promise<void> {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      apiJson(res, 403, { ok: false, error: 'local access only' })
      return
    }
    const origin = req.headers?.origin
    if (origin) {
      let originHost: string | undefined
      try { originHost = new URL(origin).host } catch { /* ignore */ }
      if (!originHost || originHost !== req.headers.host) {
        apiJson(res, 403, { ok: false, error: 'origin mismatch' })
        return
      }
    }
    if (req.method === 'OPTIONS') {
      apiJson(res, 204, {})
      return
    }

    const urlPath = (req.url ?? '/').split('?')[0]
    try {
      // 市场信息 + 技能列表
      if (urlPath === `${MARKET_API}/list` && req.method === 'GET') {
        const info = engine.info()
        const skills = engine.list()
        if (!info) return apiJson(res, 200, { ok: false, error: 'market not found (set a valid marketUrl in settings)', skills: [], market: null })
        return apiJson(res, 200, { ok: true, market: info, skills })
      }
      // 技能详情（懒加载：读取 SKILL.md 完整 frontmatter + 正文）
      if (urlPath === `${MARKET_API}/detail` && req.method === 'GET') {
        const name = new URL(req.url ?? '/', 'http://local').searchParams.get('name') ?? ''
        const result = engine.skillDetail(name)
        return apiJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, skill: result.skill, detail: result.detail } : { ok: false, error: result.error })
      }
      // 配置读写
      if (urlPath === `${MARKET_API}/config`) {
        if (req.method === 'GET') return apiJson(res, 200, settings.get())
        if (req.method !== 'PATCH') return apiJson(res, 405, { ok: false, error: 'method not allowed' })
        const body = (await readJsonBody(req)) as Record<string, unknown>
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return apiJson(res, 400, { ok: false, error: 'patch must be an object' })
        }
        if (typeof settings.replace === 'function') await settings.replace(body)
        else if (typeof settings.update === 'function') await settings.update(body)
        return apiJson(res, 200, { ok: true, config: settings.get() })
      }
      // 安装（覆盖更新）
      if (urlPath === `${MARKET_API}/install` && req.method === 'POST') {
        const body = (await readJsonBody(req)) as { name?: string }
        if (typeof body?.name !== 'string') return apiJson(res, 400, { ok: false, error: 'name is required' })
        const result = engine.install(body.name)
        return apiJson(res, result.ok ? 200 : 400, { ok: result.ok, error: result.reason, name: body.name })
      }
      // 卸载
      if (urlPath === `${MARKET_API}/uninstall` && req.method === 'POST') {
        const body = (await readJsonBody(req)) as { name?: string }
        if (typeof body?.name !== 'string') return apiJson(res, 400, { ok: false, error: 'name is required' })
        const result = engine.uninstall(body.name)
        return apiJson(res, result.ok ? 200 : 400, { ok: result.ok, error: result.reason, name: body.name })
      }
      return apiJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      return apiJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  }
}

/** 挂载逻辑：配置作用域 + 管理 API。 */
function mount(ctx: Context, config: Config): void {
  const settings = (ctx.settings as unknown as {
    register?(ns: string, schema: unknown, opts: { base: Config; applies: string }): SettingsLike
  })?.register?.('dsh-skill-market', Config, { base: config, applies: 'live' })

  const effective: Config = { ...config, ...(settings ? (settings.get() as Config) : {}) }
  if (typeof effective.marketUrl !== 'string') effective.marketUrl = ''

  const engine = new MarketEngine(effective.marketUrl)
  const scope = settings ?? localSettingsScope(effective)

  // 配置变更 → 就地更新生效配置 + 市场目录。
  if (settings) {
    settings.watch((next) => {
      Object.assign(effective, next)
      if (typeof effective.marketUrl !== 'string') effective.marketUrl = ''
      engine.setMarketDir(effective.marketUrl)
    })
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: 'prefix',
          path: MARKET_API,
          handler: createMarketApi(engine, scope),
        }),
        'dsh-skill-market: api',
      )
    })
  }

  ctx.logger.info('[dsh-skill-market] 技能市场已启用（marketUrl=%s）', engine.getMarketDir())
}

/** 应用入口：settings 服务就绪后挂载（与 dsh-memory 一致的可选服务注入模式）。 */
export function apply(ctx: Context, config: Config = {}) {
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (settingsCtx) => mount(settingsCtx, config))
    return
  }
  mount(ctx, config)
}

// 类型再导出（供测试/复用）。
export type { MarketSkill } from './market'
export { MARKET_MARKER } from './market'
