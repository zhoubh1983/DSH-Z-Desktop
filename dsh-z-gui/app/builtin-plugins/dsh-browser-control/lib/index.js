/**
 * dsh-browser-control 服务端：把主进程「GUI 内嵌浏览器」桥（MCP streamable-http）
 * 接入对话 agent，暴露 mcp__browser__* 工具。
 *
 * 依赖主进程通过后端启动 env 注入的 DSH_BROWSER_BRIDGE_URL（= http://127.0.0.1:<port>/mcp）。
 * 该插件自身不新建 HTTP server——能力全在主进程 browser-bridge.js；这里只是以
 * @deepseek-ai/dsh-mcp-client 的 McpClient 连接它（与 dsh-chrome-control 同款接法），
 * 让模型能看到 browser_navigate/click/type/snapshot/screenshot 等工具。
 */

import * as McpClient from '@deepseek-ai/dsh-mcp-client'

export const name = 'dsh-browser-control'
// 本插件不依赖任何 cordis 服务；McpClient 是插件（经 ctx.plugin 加载），不是服务名，故 inject 置空。
export const inject = []

/** apply 必须拿到 McpClient 插件可用的 ctx。 */
export function apply(ctx) {
  const bridgeUrl = process.env.DSH_BROWSER_BRIDGE_URL
  if (typeof bridgeUrl !== 'string' || bridgeUrl.length === 0) {
    ctx.logger?.warn?.('[dsh-browser-control] 未检测到 DSH_BROWSER_BRIDGE_URL，跳过注册 mcp__browser__*')
    return
  }
  ctx.plugin(McpClient, {
    transport: 'streamable-http',
    serverName: 'browser',
    url: bridgeUrl,
    failOnStartupError: false,
  })
}