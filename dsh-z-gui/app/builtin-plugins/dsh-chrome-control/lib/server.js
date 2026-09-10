/**
 * dsh-chrome-control server（v0.4.0）：把用户真实 Chrome 以 mcp__chrome__* 工具暴露给 agent。
 *
 * 架构（无 daemon 进程，全部挂在 dsh web 自己的 webServer 上）：
 *   agent ──MCP──▶ dsh web（webServer）
 *                    ├─ /chrome/mcp     MCP Streamable HTTP server（工具的代理）
 *                    ├─ /chrome/ws  ────WebSocket──▶ 浏览器扩展 ──CDP──▶ Chrome 页面
 *                    └─ /chrome/status  liveness probe
 *
 * 帧协议（JSON text frame，`{type, ...}`）：
 *   扩展 → 服务端：hello{payload:{extensionVersion}} / pong /
 *                  tool_result{responseToRequestId, payload:{data|error}}
 *   服务端 → 扩展：hello_ack{payload:{serverVersion}} / ping /
 *                  tool_request{requestId, payload:{tool, params}}
 *
 * 工具调用路径：MCP CallTool → 生成 requestId → 发 tool_request → 等 tool_result → 返回 MCP。
 * @module dsh-chrome/server
 */

import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";

/** Stable Cordis plugin name. */
const name = "chrome-server";
/** The bridge cannot mount routes before the web server exists. */
const inject = ["webServer"];
/** MCP Streamable HTTP endpoint on the shared web server. */
const MCP_PATH = "/chrome/mcp";
/** WebSocket endpoint the browser extension attaches to. */
const WS_PATH = "/chrome/ws";
/** Liveness probe path. */
const STATUS_PATH = "/chrome/status";
/** How long a tool call may wait for the extension before it fails. */
const TOOL_TIMEOUT_MS = 35e3;
/** Heartbeat interval: the server pings an attached extension so it can detect a dead peer. */
const HEARTBEAT_MS = 25e3;
/** Connection state: the one attached extension socket and in-flight tool calls. */
const state = { ext: null, pending: new Map() };

function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse one raw text frame from the extension.
 * @param text - the socket message body.
 * @returns the typed frame, or `undefined` when the frame is not one of ours.
 */
function parseClientFrame(text) {
	let raw;
	try {
		raw = JSON.parse(text);
	} catch {
		return;
	}
	if (!isRecord(raw)) return void 0;
	switch (raw.type) {
		case "hello": {
			const payload = isRecord(raw.payload) ? raw.payload : {};
			return {
				type: "hello",
				extensionVersion: typeof payload.extensionVersion === "string" ? payload.extensionVersion : ""
			};
		}
		case "pong": return { type: "pong" };
		case "tool_result": {
			if (typeof raw.responseToRequestId !== "string") return void 0;
			const payload = isRecord(raw.payload) ? raw.payload : {};
			const frame = {
				type: "tool_result",
				responseToRequestId: raw.responseToRequestId
			};
			if ("data" in payload && payload.data !== void 0) frame.data = payload.data;
			if (typeof payload.error === "string") frame.error = payload.error;
			return frame;
		}
		default: return;
	}
}

/**
 * Build one server-to-extension frame.
 * @param type - frame kind (`hello_ack` | `ping` | `tool_request`).
 * @param payload - frame payload (the tool call for `tool_request`).
 * @param requestId - correlation id used by `tool_request`.
 */
function buildServerFrame(type, payload, requestId) {
	const frame = { type };
	if (payload !== void 0) frame.payload = payload;
	if (requestId !== void 0) frame.requestId = requestId;
	return JSON.stringify(frame);
}

/** Send a raw text frame to the attached extension, if any. */
function sendToExtension(text) {
	const socket = state.ext;
	if (socket === null || socket.readyState !== socket.OPEN) return false;
	socket.send(text);
	return true;
}

/**
 * Resolve the WebSocket hub the extension attaches to. Origin is restricted to
 * `chrome-extension://` pages (or absent, for local probes); a web page that
 * finds the endpoint cannot attach.
 */
function createWsHub(log) {
	const wss = new WebSocketServer({ noServer: true });
	wss.on("connection", (socket, req) => {
		if (state.ext !== null && state.ext !== socket) {
			socket.close(4001, "another extension is attached");
			return;
		}
		state.ext = socket;
		log?.info("chrome extension attached");
		socket.send(buildServerFrame("hello_ack", { serverVersion: "0.4.0" }));
		socket.on("message", (data) => {
			const frame = parseClientFrame(String(data));
			if (frame === void 0) return;
			switch (frame.type) {
				case "hello": {
					log?.info(`chrome extension hello v${frame.extensionVersion}`);
					socket.send(buildServerFrame("hello_ack", { serverVersion: "0.4.0" }));
					break;
				}
				case "tool_result": {
					const pending = state.pending.get(frame.responseToRequestId);
					if (pending === void 0) return;
					state.pending.delete(frame.responseToRequestId);
					clearTimeout(pending.timer);
					if (frame.error !== void 0) pending.reject(new Error(frame.error));
					else pending.resolve(frame.data);
					break;
				}
				default: break;
			}
		});
		socket.on("close", () => {
			if (state.ext === socket) {
				state.ext = null;
				log?.info("chrome extension detached");
			}
			for (const [id, pending] of state.pending) {
				if (pending.timer !== void 0) clearTimeout(pending.timer);
				pending.reject(new Error("chrome extension disconnected mid-call"));
				state.pending.delete(id);
			}
		});
		socket.on("error", (error) => {
			log?.warn(`chrome ws error: ${error instanceof Error ? error.message : String(error)}`);
		});
	});
	const heartbeat = setInterval(() => {
		if (state.ext !== null) {
			try {
				sendToExtension(buildServerFrame("ping"));
			} catch { /* peer may be gone; close() will clear it */ }
		}
	}, HEARTBEAT_MS);
	heartbeat.unref?.();
	return wss;
}

/** The extension's connection liveness, for `/chrome/status`. */
function extensionConnected() {
	return state.ext !== null;
}

/** Dispatch one tool call to the extension and await its result. */
function dispatchTool(tool, params) {
	if (!extensionConnected()) {
		throw new Error(
			"No Chrome extension is attached. Open Chrome, load the extension at chrome://extensions (Developer mode → Load unpacked), and check the toggle in its popup."
		);
	}
	const requestId = randomUUID();
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			state.pending.delete(requestId);
			reject(new Error(`chrome tool "${tool}" timed out after ${TOOL_TIMEOUT_MS}ms`));
		}, TOOL_TIMEOUT_MS);
		state.pending.set(requestId, { resolve, reject, timer });
		if (!sendToExtension(buildServerFrame("tool_request", { tool, params }, requestId))) {
			clearTimeout(timer);
			state.pending.delete(requestId);
			reject(new Error("No Chrome extension is attached."));
		}
	});
}

// ---- MCP tool catalog（对齐 skills/chrome/SKILL.md 的 25 个工具） ----
const TOOL_DEFS = [
	{ name: "navigate", description: "Open a URL in the session's tab group. First call of a task must pass group_title; newTab:true keeps the previous tab.", inputSchema: { type: "object", properties: { session: { type: "string" }, url: { type: "string" }, newTab: { type: "boolean" }, group_title: { type: "string" } }, required: ["session", "url"] } },
	{ name: "find_tab", description: "Find a tab in the session: by URL substring, or active:true to borrow the user's current tab.", inputSchema: { type: "object", properties: { session: { type: "string" }, url: { type: "string" }, active: { type: "boolean" } }, required: ["session"] } },
	{ name: "list_tabs", description: "List every tab in the session's group; current:true flags the active tool tab.", inputSchema: { type: "object", properties: { session: { type: "string" } }, required: ["session"] } },
	{ name: "close_tab", description: "Close one tab of the session by tab_id or url.", inputSchema: { type: "object", properties: { session: { type: "string" }, tab_id: { type: "string" }, url: { type: "string" } }, required: ["session"] } },
	{ name: "close_session", description: "Close all tabs of the session. Call only when the user asks.", inputSchema: { type: "object", properties: { session: { type: "string" } }, required: ["session"] } },
	{ name: "snapshot", description: "Return an accessibility outline of the page with @eN refs for interactive elements. mode: interactive|full|text; selector scopes to a subtree; diff:true returns only changes.", inputSchema: { type: "object", properties: { session: { type: "string" }, mode: { type: "string" }, selector: { type: "string" }, maxDepth: { type: "integer" }, diff: { type: "boolean" } }, required: ["session"] } },
	{ name: "click", description: "Click an element by @e ref or CSS selector. trusted:true sends real browser input.", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" }, trusted: { type: "boolean" } }, required: ["session"] } },
	{ name: "fill", description: "Replace the value of an input/textarea/contenteditable (fires the events frameworks listen for).", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" }, value: { type: "string" } }, required: ["session", "value"] } },
	{ name: "upload", description: "Upload local files to a file input (or its visible trigger). paths may be a string or array; multiple for several files.", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" }, paths: { type: "array", items: { type: "string" } }, multiple: { type: "boolean" } }, required: ["session", "paths"] } },
	{ name: "evaluate", description: "Run JavaScript in the page realm and return JSON.stringify-able data. Wrap bodies in an IIFE.", inputSchema: { type: "object", properties: { session: { type: "string" }, expression: { type: "string" } }, required: ["session", "expression"] } },
	{ name: "screenshot", description: "Capture the page (or one selector) as base64 image. format: png|jpeg with quality.", inputSchema: { type: "object", properties: { session: { type: "string" }, selector: { type: "string" }, format: { type: "string" }, quality: { type: "integer" } }, required: ["session"] } },
	{ name: "save_as_pdf", description: "Save the current page as PDF (base64).", inputSchema: { type: "object", properties: { session: { type: "string" } }, required: ["session"] } },
	{ name: "mouse_click", description: "Trusted click at an element (selector) or raw x/y. button: left|right|middle, clickCount.", inputSchema: { type: "object", properties: { session: { type: "string" }, selector: { type: "string" }, x: { type: "integer" }, y: { type: "integer" }, button: { type: "string" }, clickCount: { type: "integer" } }, required: ["session"] } },
	{ name: "key_type", description: "Type text into the focused element with trusted input.", inputSchema: { type: "object", properties: { session: { type: "string" }, text: { type: "string" } }, required: ["session", "text"] } },
	{ name: "send_keys", description: "Press a key or chord (Enter, Escape, Control+A).", inputSchema: { type: "object", properties: { session: { type: "string" }, keys: { type: "string" } }, required: ["session", "keys"] } },
	{ name: "hover", description: "Trusted hover over an element (opens menus/tooltips).", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" } }, required: ["session"] } },
	{ name: "focus", description: "Give an element keyboard focus without clicking it.", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" } }, required: ["session"] } },
	{ name: "select", description: "Choose an option in a native select or ARIA combobox; matches value, then exact text, then substring.", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" }, value: { type: "string" }, text: { type: "string" } }, required: ["session"] } },
	{ name: "scroll", description: "Scroll the page or one pane. direction: down|up, optional pixels or deltaY.", inputSchema: { type: "object", properties: { session: { type: "string" }, direction: { type: "string" }, pixels: { type: "integer" }, deltaY: { type: "integer" }, selector: { type: "string" } }, required: ["session"] } },
	{ name: "scroll_into_view", description: "Scroll an element into view and return its geometry.", inputSchema: { type: "object", properties: { session: { type: "string" }, ref: { type: "string" }, selector: { type: "string" } }, required: ["session"] } },
	{ name: "find", description: "Find elements by plain-language query and return best-matching @e refs.", inputSchema: { type: "object", properties: { session: { type: "string" }, query: { type: "string" } }, required: ["session", "query"] } },
	{ name: "wait", description: "Fixed sleep, capped at 3000ms.", inputSchema: { type: "object", properties: { session: { type: "string" }, ms: { type: "integer" } }, required: ["session", "ms"] } },
	{ name: "wait_for_selector", description: "Poll until a selector is visible, or hidden with state:hidden.", inputSchema: { type: "object", properties: { session: { type: "string" }, selector: { type: "string" }, state: { type: "string" }, timeout: { type: "integer" } }, required: ["session", "selector"] } },
	{ name: "network", description: "List the tab's recorded requests; filter by method, status, or URL substring.", inputSchema: { type: "object", properties: { session: { type: "string" }, method: { type: "string" }, status: { type: "integer" }, url: { type: "string" } }, required: ["session"] } },
	{ name: "network_detail", description: "Return one request's headers, with body:true its response body.", inputSchema: { type: "object", properties: { session: { type: "string" }, requestId: { type: "string" }, body: { type: "boolean" } }, required: ["session", "requestId"] } },
	{ name: "dialog", description: "Answer a native alert/confirm/prompt. action: accept|dismiss, text for prompts.", inputSchema: { type: "object", properties: { session: { type: "string" }, action: { type: "string" }, text: { type: "string" } }, required: ["session", "action"] } }
];

function resultOk(text) {
	return { content: [{ type: "text", text }] };
}
function resultErr(message) {
	return { isError: true, content: [{ type: "text", text: message }] };
}

// ---- MCP server（每个逻辑会话一个 SDK Server，共用工具目录与分派） ----
async function createMcpHandler(log) {
	const mcp = await import("@modelcontextprotocol/sdk/server/index.js");
	const sdkHttp = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
	const { ListToolsRequestSchema, CallToolRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

	const Server = mcp.Server;
	const StreamableHTTPServerTransport = sdkHttp.StreamableHTTPServerTransport;

	function makeMCPServer() {
		const s = new Server({ name: "dsh-chrome", version: "0.4.0" }, { capabilities: { tools: { listChanged: false } } });
		s.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));
		s.setRequestHandler(CallToolRequestSchema, async (req) => {
			const tool = req.params.name;
			const args = req.params.arguments ?? {};
			try {
				const r = await dispatchTool(tool, args);
				return resultOk(JSON.stringify(r));
			} catch (error) {
				return resultErr(error instanceof Error ? error.message : String(error));
			}
		});
		return s;
	}

	const sessions = new Map();
	let sessionSeq = 0;
	return async function mcpHandler(req, res) {
		const incoming = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : "";
		const existing = incoming ? sessions.get(incoming) : undefined;
		if (existing) {
			await existing.transport.handleRequest(req, res);
			return;
		}
		const id = `ch-${++sessionSeq}`;
		const srv = makeMCPServer();
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => id,
			onsessioninitialized: () => { sessions.set(id, { transport, server: srv }); }
		});
		sessions.set(id, { transport, server: srv });
		try {
			await srv.connect(transport);
		} catch (connectError) {
			log?.warn(`chrome MCP connect: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
			sessions.delete(id);
			if (!res.headersSent) res.statusCode = 500;
			res.end();
			return;
		}
		await transport.handleRequest(req, res);
	};
}

/** The MCP bridge config: our own Streamable HTTP endpoint on the shared web server. */
function bridgeConfig(ctx) {
	const port = ctx.webServer.port;
	return {
		serverName: "chrome",
		transport: "streamable-http",
		url: `http://127.0.0.1:${port}${MCP_PATH}`,
		headers: {},
		toolCallTimeoutMs: TOOL_TIMEOUT_MS,
		failOnStartupError: false
	};
}

/** The `/chrome/status` liveness handler. */
function createStatusHandler(log) {
	return async (_req, res) => {
		res.writeHead(200, { "content-type": "application/json" });
		res.end(JSON.stringify({
			ok: true,
			build: "0.4.0",
			extensionConnected: extensionConnected()
		}));
	};
}

/** Register routes and the MCP bridge on the shared web server. */
function apply(ctx) {
	const log = ctx.logger;
	const wss = createWsHub(log);
	ctx.effect(() => {
		const disposeWs = ctx.webServer.registerUpgrade({
			path: WS_PATH,
			handler: (req, socket, head) => {
				const origin = req.headers.origin;
				if (origin !== void 0 && !origin.startsWith("chrome-extension://")) {
					log?.warn(`chrome ws rejected origin ${origin}`);
					socket.destroy();
					return;
				}
				wss.handleUpgrade(req, socket, head, (ws) => {
					wss.emit("connection", ws, req);
				});
			}
		});
		const disposeMcp = ctx.webServer.register({
			kind: "exact",
			path: MCP_PATH,
			handler: mcpHandlerRef
		});
		const disposeStatus = ctx.webServer.register({
			kind: "exact",
			path: STATUS_PATH,
			handler: createStatusHandler(log)
		});
		return () => {
			disposeWs();
			disposeMcp();
			disposeStatus();
		};
	});
	ctx.plugin(McpClient, bridgeConfig(ctx));
}

/** Async handler placeholder; initialized lazily so the SDK import never blocks boot. */
let mcpHandlerRef = async (req, res) => {
	res.writeHead(503, { "content-type": "application/json" });
	res.end(JSON.stringify({ ok: false, error: "chrome mcp not ready" }));
};
createMcpHandler(undefined).then((handler) => {
	mcpHandlerRef = handler;
}).catch((error) => {
	console.error(`[dsh-chrome] failed to init MCP server: ${error instanceof Error ? error.message : String(error)}`);
});

export {
	MCP_PATH, STATUS_PATH, TOOL_DEFS, WS_PATH,
	apply, bridgeConfig, buildServerFrame, dispatchTool, extensionConnected,
	inject, name, parseClientFrame
};
