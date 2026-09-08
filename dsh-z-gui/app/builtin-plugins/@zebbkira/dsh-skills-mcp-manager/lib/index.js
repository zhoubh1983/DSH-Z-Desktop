import z from "schemastery";
import * as mcpClient from "@deepseek-ai/dsh-mcp-client";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
//#region src/mcp.ts
/** Defaults for the mcp-client connection (per-call timeout + reconnect policy). */
const TOOL_CALL_TIMEOUT_MS = 6e4;
const RECONNECT = {
	enabled: true,
	initialDelayMs: 500,
	maxDelayMs: 3e4,
	maxAttempts: 10
};
/** The ~/.dsh/mcp.json path this manager owns. */
function mcpConfigPath() {
	return join(process.env.DSH_HOME || join(homedir(), ".dsh"), "mcp.json");
}
/** Read the persisted servers document (never throws). */
function readMcpConfig() {
	const target = mcpConfigPath();
	try {
		if (!existsSync(target)) return { servers: [] };
		const raw = readFileSync(target, "utf8");
		if (!raw || raw.trim() === "") return { servers: [] };
		const data = JSON.parse(raw);
		return { servers: Array.isArray(data.servers) ? data.servers : [] };
	} catch {
		return { servers: [] };
	}
}
/** Persist the servers document (creating the directory when needed). */
function writeMcpConfig(data) {
	const target = mcpConfigPath();
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, JSON.stringify(data, null, 2), "utf8");
}
/** Validate one server definition; returns an error string, or null when valid. */
function validateMcpServer(server) {
	if (!server || typeof server !== "object") return "server must be an object";
	const s = server;
	const name = s.name;
	if (typeof name !== "string" || !/^[A-Za-z0-9_-]{1,32}$/.test(name)) return "invalid name (1-32 chars of A-Za-z0-9_-)";
	if (s.transport !== "stdio" && s.transport !== "streamable-http") return "transport must be 'stdio' or 'streamable-http'";
	if (s.transport === "stdio" && (typeof s.command !== "string" || s.command.trim() === "")) return "stdio transport requires command";
	if (s.transport === "streamable-http" && (typeof s.url !== "string" || s.url.trim() === "")) return "streamable-http transport requires url";
	return null;
}
/** Normalize a server into its persisted shape (drop transport-irrelevant fields). */
function normalizeMcpServer(server) {
	const normalized = {
		name: server.name,
		transport: server.transport,
		enabled: server.enabled !== false
	};
	if (server.transport === "stdio") {
		normalized.command = server.command;
		normalized.args = Array.isArray(server.args) ? server.args : [];
		normalized.env = server.env && typeof server.env === "object" && !Array.isArray(server.env) ? server.env : {};
		normalized.cwd = server.cwd || "";
	} else {
		normalized.url = server.url;
		normalized.headers = server.headers && typeof server.headers === "object" && !Array.isArray(server.headers) ? server.headers : {};
	}
	return normalized;
}
/** Map a persisted server definition to the mcp-client plugin Config. */
function toMcpClientConfig(s) {
	const base = {
		serverName: s.name,
		toolCallTimeoutMs: TOOL_CALL_TIMEOUT_MS,
		failOnStartupError: true,
		reconnect: RECONNECT
	};
	if (s.transport === "stdio") return {
		...base,
		transport: "stdio",
		command: s.command ?? "",
		args: s.args ?? [],
		env: s.env ?? {},
		cwd: s.cwd ?? ""
	};
	return {
		...base,
		transport: "streamable-http",
		url: s.url ?? "",
		headers: s.headers ?? {}
	};
}
/** Equality for re-connect decisions (config-relevant fields only). */
function configChanged(a, b) {
	return JSON.stringify(normalizeMcpServer(a)) !== JSON.stringify(normalizeMcpServer(b));
}
/**
* Owns the live mcp-client fibers keyed by server name. Loading/disposal is
* effect-safe: dispose() tears every fiber down (disconnect + tool unregister).
*/
var McpManager = class {
	ctx;
	live = /* @__PURE__ */ new Map();
	statuses = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
	}
	/** Re-read the persisted document and converge the live fiber set onto it. */
	async reload() {
		await this.sync(readMcpConfig().servers);
	}
	/**
	* Converge the live fiber set onto the given enabled server list: dispose
	* removed/changed/disabled servers, then connect newly-enabled ones.
	* @param servers - the complete next server list (enabled flag respected).
	*/
	async sync(servers) {
		const next = /* @__PURE__ */ new Map();
		for (const s of servers) if (s.enabled !== false) next.set(s.name, s);
		for (const [name, entry] of [...this.live]) {
			const target = next.get(name);
			if (target === void 0 || configChanged(entry.config, target)) {
				this.live.delete(name);
				this.statuses.delete(name);
				try {
					await entry.fiber.dispose();
				} catch {}
			}
		}
		for (const [name, cfg] of next) {
			if (this.live.has(name)) continue;
			this.statuses.set(name, { status: "connecting" });
			let fiber;
			try {
				fiber = this.ctx.plugin(mcpClient, toMcpClientConfig(cfg));
			} catch (e) {
				this.statuses.set(name, {
					status: "failed",
					error: String(e?.message ?? e)
				});
				continue;
			}
			this.live.set(name, {
				config: normalizeMcpServer(cfg),
				fiber
			});
			fiber.then(() => {
				this.statuses.set(name, { status: "running" });
			}, (e) => {
				this.live.delete(name);
				this.statuses.set(name, {
					status: "failed",
					error: String(e?.message ?? e)
				});
			});
		}
	}
	/** Stop and dispose every live connection (plugin teardown). */
	async dispose() {
		for (const [name, entry] of [...this.live]) {
			this.live.delete(name);
			this.statuses.delete(name);
			try {
				await entry.fiber.dispose();
			} catch {}
		}
	}
	/**
	* One-shot connection probe for the test button: connect with
	* failOnStartupError so a failure rejects, then always dispose. A server
	* that is already live answers ok immediately — re-testing would collide on
	* its reserved serverName namespace.
	*/
	async testConnect(server) {
		const normalized = normalizeMcpServer(server);
		if (this.live.has(normalized.name)) return { ok: true };
		const fiber = this.ctx.plugin(mcpClient, toMcpClientConfig(normalized));
		try {
			await fiber;
			return { ok: true };
		} catch (e) {
			return {
				ok: false,
				error: String(e?.message ?? e)
			};
		} finally {
			try {
				await fiber.dispose();
			} catch {}
		}
	}
	/** Build the UI summary list (persisted config + live status). */
	summarize(servers) {
		return servers.map((s) => {
			const st = this.statuses.get(s.name);
			const enabled = s.enabled !== false;
			const status = !enabled ? "stopped" : st?.status ?? "connecting";
			return {
				...s,
				enabled,
				status,
				error: st?.error
			};
		});
	}
};
//#endregion
//#region src/protocol.ts
/** API paths shared by the host routes and the browser api client. */
const SKILLS_MCP_API = {
	skills: "/api/dsh-skills-mcp/skills",
	skillRead: "/api/dsh-skills-mcp/skills/read",
	skillToggle: "/api/dsh-skills-mcp/skills/toggle",
	skillDelete: "/api/dsh-skills-mcp/skills/delete",
	skillScan: "/api/dsh-skills-mcp/skills/scan",
	skillImport: "/api/dsh-skills-mcp/skills/import",
	mcp: "/api/dsh-skills-mcp/mcp",
	mcpSave: "/api/dsh-skills-mcp/mcp/save",
	mcpEnabled: "/api/dsh-skills-mcp/mcp/enabled",
	mcpDelete: "/api/dsh-skills-mcp/mcp/delete",
	mcpTest: "/api/dsh-skills-mcp/mcp/test"
};
//#endregion
//#region src/routes.ts
/** Cap on JSON request bodies (server definitions and import lists are small). */
const MAX_JSON_BODY_BYTES = 1024 * 1024;
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") return false;
	const host = request.headers.host;
	if (typeof host !== "string") return false;
	let hostUrl;
	try {
		hostUrl = new URL("http://" + host);
	} catch {
		return false;
	}
	if (hostUrl.hostname !== "127.0.0.1" && hostUrl.hostname !== "localhost" && hostUrl.hostname !== "[::1]") return false;
	if (request.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = request.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === hostUrl.host;
	} catch {
		return false;
	}
}
function writeJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"referrer-policy": "no-referrer"
	});
	res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_JSON_BODY_BYTES) return void 0;
		chunks.push(buffer);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return typeof parsed === "object" && parsed !== null ? parsed : void 0;
	} catch {
		return;
	}
}
function queryParam(url, name) {
	const value = url.searchParams.get(name);
	return value === null ? void 0 : value;
}
/**
* Build every /api/dsh-skills-mcp route (exact paths).
* @param deps - skills engine and MCP connection manager.
* @returns the route registrations.
*/
function makeRoutes(deps) {
	const { skills, mcp } = deps;
	const guard = (req, res, method) => {
		if (!isLoopbackRequest(req)) {
			writeJson(res, 403, {
				ok: false,
				error: "forbidden: loopback-only"
			});
			return false;
		}
		if (req.method !== method) {
			writeJson(res, 405, {
				ok: false,
				error: "method not allowed"
			});
			return false;
		}
		return true;
	};
	const handle = (method, path, fn) => ({
		kind: "exact",
		path,
		handler: async (req, res) => {
			if (!guard(req, res, method)) return;
			let body = {};
			if (method === "POST") {
				const parsed = await readJsonBody(req);
				if (parsed === void 0) {
					writeJson(res, 400, {
						ok: false,
						error: "invalid or oversized JSON body"
					});
					return;
				}
				body = parsed;
			}
			try {
				await fn(req, res, body, new URL(req.url ?? "/", "http://localhost"));
			} catch (e) {
				writeJson(res, 500, {
					ok: false,
					error: String(e?.message ?? e)
				});
			}
		}
	});
	const ok = (data = {}) => ({
		ok: true,
		...data
	});
	return { routes: [
		handle("GET", SKILLS_MCP_API.skills, async (_req, res, _body, url) => {
			writeJson(res, 200, ok({ items: skills.listSkills(queryParam(url, "cwd")) }));
		}),
		handle("POST", SKILLS_MCP_API.skillRead, async (_req, res, body, _url) => {
			const path = typeof body?.path === "string" ? body.path : "";
			if (!path) {
				writeJson(res, 400, {
					ok: false,
					error: "path required"
				});
				return;
			}
			const skill = skills.readSkill(path);
			if (skill === null) {
				writeJson(res, 404, {
					ok: false,
					error: "not a valid skill file: " + path
				});
				return;
			}
			writeJson(res, 200, ok({ skill }));
		}),
		handle("POST", SKILLS_MCP_API.skillToggle, async (_req, res, body, _url) => {
			const path = typeof body?.path === "string" ? body.path : "";
			if (!path) {
				writeJson(res, 400, {
					ok: false,
					error: "path required"
				});
				return;
			}
			const enabled = body.enabled === true;
			skills.setSkillEnabled(path, enabled);
			writeJson(res, 200, ok({
				path,
				enabled
			}));
		}),
		handle("POST", SKILLS_MCP_API.skillDelete, async (_req, res, body, _url) => {
			const path = typeof body?.path === "string" ? body.path : "";
			if (!path) {
				writeJson(res, 400, {
					ok: false,
					error: "path required"
				});
				return;
			}
			const kind = body.kind === "bundle" ? "bundle" : "file";
			const removed = skills.deleteSkill(path, kind);
			writeJson(res, 200, ok({
				path,
				removed
			}));
		}),
		handle("POST", SKILLS_MCP_API.skillScan, async (_req, res, body, _url) => {
			const dir = typeof body?.dir === "string" ? body.dir : "";
			if (!dir) {
				writeJson(res, 400, {
					ok: false,
					error: "directory is required"
				});
				return;
			}
			writeJson(res, 200, ok({ items: skills.scanSkills(dir) }));
		}),
		handle("POST", SKILLS_MCP_API.skillImport, async (_req, res, body, _url) => {
			const items = Array.isArray(body?.items) ? body.items : [];
			if (items.length === 0) {
				writeJson(res, 400, {
					ok: false,
					error: "nothing selected"
				});
				return;
			}
			const results = skills.importSkills(items.map((it) => ({
				sourcePath: typeof it.sourcePath === "string" ? it.sourcePath : "",
				kind: it.kind === "bundle" ? "bundle" : "file"
			})));
			writeJson(res, 200, ok({ results }));
		}),
		handle("GET", SKILLS_MCP_API.mcp, async (_req, res, _body, _url) => {
			const { servers } = readMcpConfig();
			writeJson(res, 200, ok({ servers: mcp.summarize(servers) }));
		}),
		handle("POST", SKILLS_MCP_API.mcpSave, async (_req, res, body, _url) => {
			const server = body?.server;
			const err = validateMcpServer(server);
			if (err) {
				writeJson(res, 400, {
					ok: false,
					error: err
				});
				return;
			}
			const normalized = normalizeMcpServer(server);
			const data = readMcpConfig();
			const idx = data.servers.findIndex((s) => s.name === normalized.name);
			if (idx >= 0) data.servers[idx] = normalized;
			else data.servers.push(normalized);
			writeMcpConfig(data);
			await mcp.sync(data.servers);
			writeJson(res, 200, ok({ server: normalized }));
		}),
		handle("POST", SKILLS_MCP_API.mcpEnabled, async (_req, res, body, _url) => {
			const name = typeof body?.name === "string" ? body.name : "";
			const enabled = body.enabled === true;
			if (!name) {
				writeJson(res, 400, {
					ok: false,
					error: "name required"
				});
				return;
			}
			const data = readMcpConfig();
			const s = data.servers.find((x) => x.name === name);
			if (s === void 0) {
				writeJson(res, 404, {
					ok: false,
					error: "server not found: " + name
				});
				return;
			}
			s.enabled = enabled;
			writeMcpConfig(data);
			await mcp.sync(data.servers);
			writeJson(res, 200, ok({
				name,
				enabled
			}));
		}),
		handle("POST", SKILLS_MCP_API.mcpDelete, async (_req, res, body, _url) => {
			const name = typeof body?.name === "string" ? body.name : "";
			if (!name) {
				writeJson(res, 400, {
					ok: false,
					error: "name required"
				});
				return;
			}
			const data = readMcpConfig();
			data.servers = data.servers.filter((x) => x.name !== name);
			writeMcpConfig(data);
			await mcp.sync(data.servers);
			writeJson(res, 200, ok({ name }));
		}),
		handle("POST", SKILLS_MCP_API.mcpTest, async (_req, res, body, _url) => {
			const server = body?.server;
			const err = validateMcpServer(server);
			if (err) {
				writeJson(res, 400, {
					ok: false,
					error: err
				});
				return;
			}
			const result = await mcp.testConnect(server);
			writeJson(res, 200, ok({ test: result }));
		})
	] };
}
//#endregion
//#region src/skills.ts
/**
* Skills filesystem engine — scans the four manageable skill roots, parses
* SKILL.md frontmatter, and performs enable/disable (frontmatter rewrite),
* delete, scan-for-import, and import. Runs in the Host process with direct
* node:fs access (a real npm package no longer needs the shell+node hack the
* dynamic plugin used).
* @module
*/
function dshHomeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function agentsHomeDir() {
	return process.env.DSH_AGENTS_HOME || join(homedir(), ".agents");
}
/** Resolve (and materialize) the user-level skill roots. */
function getRoots() {
	const home = homedir();
	const dshHome = dshHomeDir();
	const agentsHome = agentsHomeDir();
	const userSkillsDir = join(dshHome, "skills");
	mkdirSync(userSkillsDir, { recursive: true });
	return {
		home,
		dshHome,
		agentsHome,
		userSkillsDir,
		agentsSkillsDir: join(agentsHome, "skills")
	};
}
/** Walk up from cwd to the nearest .git directory (the project root). */
function findProjectRoot(cwd) {
	let dir = resolve(cwd ?? process.cwd());
	for (let i = 0; i < 100; i++) {
		if (existsSync(join(dir, ".git"))) break;
		const parent = dirname(dir);
		if (parent === dir) break;
		dir = parent;
	}
	return dir;
}
function levelOf(source) {
	return source === "project-dsh" || source === "project-agents" ? "project" : "user";
}
function scalarValue(v) {
	if (v === "true" || v === "True" || v === "TRUE") return true;
	if (v === "false" || v === "False" || v === "FALSE") return false;
	if (v === "null" || v === "~") return null;
	if (/^-?\d+$/.test(v)) return parseInt(v, 10);
	return v;
}
function parseBool(v) {
	if (v === true || v === 1 || v === "1") return true;
	if (v === false || v === 0 || v === "0") return false;
	if (typeof v === "string") {
		const s = v.toLowerCase();
		if (s === "true" || s === "yes" || s === "on") return true;
		if (s === "false" || s === "no" || s === "off") return false;
	}
}
/** Parse a YAML-style frontmatter block; null when absent or malformed. */
function parseFrontmatter(raw) {
	const lines = raw.split(/\r?\n/);
	if (lines.length === 0 || lines[0].trim() !== "---") return null;
	let closeIdx = -1;
	for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") {
		closeIdx = i;
		break;
	}
	if (closeIdx < 0) return null;
	const data = {};
	for (let i = 1; i < closeIdx; i++) {
		const line = lines[i];
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const key = line.slice(0, colon).trim();
		let val = line.slice(colon + 1).trim();
		if (val.length >= 2 && (val[0] === "\"" && val[val.length - 1] === "\"" || val[0] === "'" && val[val.length - 1] === "'")) val = val.slice(1, -1);
		data[key] = scalarValue(val);
	}
	return {
		data,
		body: lines.slice(closeIdx + 1).join("\n")
	};
}
/** Parse one skill document; null when it lacks a name/description. */
function parseSkillFile(raw) {
	const fm = parseFrontmatter(raw);
	if (fm === null) return null;
	const name = typeof fm.data.name === "string" ? fm.data.name : "";
	const description = typeof fm.data.description === "string" ? fm.data.description : "";
	if (name === "" || description === "") return null;
	const whenToUse = typeof fm.data.whenToUse === "string" ? fm.data.whenToUse : "";
	const disableModel = parseBool(fm.data["disable-model-invocation"]);
	const userInvocable = parseBool(fm.data["user-invocable"]);
	return {
		name,
		description,
		whenToUse,
		enabled: disableModel !== true || userInvocable !== false,
		content: fm.body.trim()
	};
}
/** Rewrite the frontmatter to add/remove the disable-model-invocation pair. */
function toggleInvocation(raw, enabled) {
	const lines = raw.split(/\r?\n/);
	if (lines.length === 0 || lines[0].trim() !== "---") return raw;
	let closeIdx = -1;
	for (let i = 1; i < lines.length; i++) if (lines[i].trim() === "---") {
		closeIdx = i;
		break;
	}
	if (closeIdx < 0) return raw;
	const kept = lines.slice(1, closeIdx).filter((l) => {
		return !/^\s*(disable-model-invocation|disableModelInvocation|modelInvocable|user-invocable|userInvocable)\s*:/.test(l);
	});
	if (!enabled) {
		kept.push("disable-model-invocation: true");
		kept.push("user-invocable: false");
	}
	return [lines[0]].concat(kept, lines.slice(closeIdx)).join("\n");
}
var SkillsManager = class {
	/** Scan one skill root directory into SkillSummary records. */
	scanRoot(dir, source) {
		const items = [];
		if (!existsSync(dir)) return items;
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return items;
		}
		for (const entry of entries) {
			const name = entry.name;
			if (!name || name === ".system" || name[0] === ".") continue;
			if (entry.isDirectory()) {
				const mdPath = join(dir, name, "SKILL.md");
				if (!existsSync(mdPath)) continue;
				let raw;
				try {
					raw = readFileSync(mdPath, "utf8");
				} catch {
					continue;
				}
				const parsed = parseSkillFile(raw);
				if (parsed === null) continue;
				items.push({
					...parsed,
					source,
					level: levelOf(source),
					kind: "bundle",
					path: mdPath
				});
			} else if (entry.isFile() && name.endsWith(".md")) {
				const filePath = join(dir, name);
				let raw;
				try {
					raw = readFileSync(filePath, "utf8");
				} catch {
					continue;
				}
				const parsed = parseSkillFile(raw);
				if (parsed === null) continue;
				items.push({
					...parsed,
					source,
					level: levelOf(source),
					kind: "file",
					path: filePath
				});
			}
		}
		return items;
	}
	/** List skills across project and/or user roots, de-duplicated by path. */
	listSkills(cwd) {
		const roots = getRoots();
		const scans = [];
		if (cwd) {
			const projectRoot = findProjectRoot(cwd);
			scans.push({
				path: join(projectRoot, ".dsh", "skills"),
				source: "project-dsh"
			}, {
				path: join(projectRoot, ".agents", "skills"),
				source: "project-agents"
			}, {
				path: roots.userSkillsDir,
				source: "user-dsh"
			}, {
				path: roots.agentsSkillsDir,
				source: "user-agents"
			});
		} else scans.push({
			path: roots.userSkillsDir,
			source: "user-dsh"
		}, {
			path: roots.agentsSkillsDir,
			source: "user-agents"
		});
		const seen = /* @__PURE__ */ new Set();
		const items = [];
		for (const s of scans) for (const it of this.scanRoot(s.path, s.source)) {
			if (seen.has(it.path)) continue;
			seen.add(it.path);
			items.push(it);
		}
		items.sort((a, b) => {
			if (a.level !== b.level) return a.level === "project" ? -1 : 1;
			return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
		});
		return items;
	}
	/** Read one skill document (body included). */
	readSkill(path) {
		if (!existsSync(path)) return null;
		const parsed = parseSkillFile(readFileSync(path, "utf8"));
		if (parsed === null) return null;
		return {
			...parsed,
			path
		};
	}
	/** Enable/disable a skill by rewriting its frontmatter invocation flags. */
	setSkillEnabled(path, enabled) {
		writeFileSync(path, toggleInvocation(readFileSync(path, "utf8"), enabled), "utf8");
	}
	/** Delete a skill (the whole bundle directory, or the flat .md file). */
	deleteSkill(path, kind) {
		const target = kind === "bundle" ? dirname(path) : path;
		rmSync(target, {
			recursive: true,
			force: true
		});
		return target;
	}
	/** Scan an arbitrary directory for importable skills. */
	scanSkills(dir) {
		if (!existsSync(dir)) throw new Error("directory not found: " + dir);
		const entries = readdirSync(dir, { withFileTypes: true });
		const items = [];
		for (const entry of entries) {
			const name = entry.name;
			if (!name || name[0] === ".") continue;
			if (entry.isDirectory()) {
				const mdPath = join(dir, name, "SKILL.md");
				if (!existsSync(mdPath)) continue;
				let raw;
				try {
					raw = readFileSync(mdPath, "utf8");
				} catch {
					continue;
				}
				const parsed = parseSkillFile(raw);
				if (parsed !== null) items.push({
					name: parsed.name,
					description: parsed.description,
					sourcePath: join(dir, name),
					kind: "bundle"
				});
			} else if (entry.isFile() && name.endsWith(".md") && name !== "SKILL.md") {
				let raw;
				try {
					raw = readFileSync(join(dir, name), "utf8");
				} catch {
					continue;
				}
				const parsed = parseSkillFile(raw);
				if (parsed !== null) items.push({
					name: parsed.name,
					description: parsed.description,
					sourcePath: join(dir, name),
					kind: "file"
				});
			}
		}
		return items;
	}
	/** Import selected skills into ~/.dsh/skills (skip names that already exist). */
	importSkills(items) {
		const destDir = getRoots().userSkillsDir;
		mkdirSync(destDir, { recursive: true });
		const results = [];
		for (const it of items) {
			const base = join(destDir, it.sourcePath.split(/[\\/]/).pop() || "");
			if (existsSync(base)) {
				results.push({
					name: base,
					ok: false,
					reason: "already exists"
				});
				continue;
			}
			try {
				if (it.kind === "bundle") cpSync(it.sourcePath, base, { recursive: true });
				else copyFileSync(it.sourcePath, base);
				results.push({
					name: base,
					ok: true
				});
			} catch (e) {
				results.push({
					name: base,
					ok: false,
					reason: String(e?.message ?? e)
				});
			}
		}
		return results;
	}
};
//#endregion
//#region src/index.ts
/** Stable cordis plugin name. */
const name = "skills-mcp-manager";
/** Services required before the surfaces can mount. `settings` is a global
* Service in the v0.1.2 harness and must be declared here for `ctx.settings`
* to be reachable. */
const inject = [
	"webServer",
	"tools",
	"systemPrompt",
	"settings"
];
/**
* Settings namespace this plugin's config lives under. Spelled here rather
* than imported: the browser half spells the same value and must not depend
* on a Host package.
*/
const SKILLS_MCP_NAMESPACE = "skills-mcp-manager";
const Config = z.object({
	enabled: z.boolean().default(true),
	announceToAgent: z.boolean().default(true)
});
const DEFAULT_ENABLED = true;
const DEFAULT_ANNOUNCE = true;
/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 160;
/** Model-facing announcement: plugin presence, capabilities, and limits. */
const SKILLS_MCP_GUIDANCE = "本机已安装 dsh-skills-mcp-manager 插件（技能与 MCP 管理器）：设置页「Web UI 插件 → 技能与 MCP」。能力：浏览/启用/禁用/删除/导入技能（项目级 .dsh/skills、.agents/skills 与用户级 ~/.dsh/skills、~/.agents/skills）；管理 MCP 服务器（stdio 与 streamable-http）。MCP 是真实连接：启用的服务器经 @deepseek-ai/dsh-mcp-client 真正连接并把工具注册为 mcp__<server>__<tool>，启用/禁用会实际连接/断开。限制：MCP 服务器配置存 ~/.dsh/mcp.json（密码/env 明文、权限 0600 由用户自行保证）；技能启用/禁用通过改写 SKILL.md 前言实现；删除为物理删除，不可恢复。用户提到「技能管理 / 技能导入 / MCP 服务器 / MCP 连接」时即指本插件，请据此协作。";
/**
* Mount the skills engine, MCP manager, routes, and announcement.
* @param ctx - host plugin context carrying settings/webServer/tools/systemPrompt.
* @param config - resolved plugin config (schema defaults applied by the loader).
*/
function apply(ctx, config) {
	let current = () => config ?? {};
	const resolve = () => ({
		enabled: current().enabled ?? DEFAULT_ENABLED,
		announceToAgent: current().announceToAgent ?? DEFAULT_ANNOUNCE
	});
	const skills = new SkillsManager();
	const mcp = new McpManager(ctx);
	const { routes } = makeRoutes({
		skills,
		mcp
	});
	let disposeSection;
	let disposeRoutes;
	const sync = () => {
		const value = resolve();
		if (disposeSection !== void 0) {
			disposeSection();
			disposeSection = void 0;
		}
		if (disposeRoutes !== void 0) {
			disposeRoutes();
			disposeRoutes = void 0;
		}
		if (!value.enabled) {
			mcp.dispose();
			return;
		}
		if (value.announceToAgent) disposeSection = ctx.systemPrompt.section({
			name: "plugin:skills-mcp-manager",
			order: SECTION_ORDER,
			text: SKILLS_MCP_GUIDANCE
		});
		disposeRoutes = ctx.effect(() => {
			const disposers = routes.map((route) => ctx.webServer.register(route));
			return () => {
				for (const dispose of disposers) dispose();
			};
		}, "skills-mcp-manager: routes");
		mcp.reload();
	};
	// v0.1.2 harness: `installSettingsSection` was removed from @deepseek-ai/dsh-settings;
	// namespace schema registration now goes through the global `ctx.settings.register`,
	// and the resolved value + change observation come from the returned scope.
	const scope = ctx.settings.register(SKILLS_MCP_NAMESPACE, Config, {});
	current = () => scope.get();
	scope.watch(() => {
		sync();
	});
	ctx.effect(() => () => {
		mcp.dispose();
	}, "skills-mcp-manager: mcp");
	sync();
}
//#endregion
export { Config, SKILLS_MCP_GUIDANCE, SKILLS_MCP_NAMESPACE, apply, inject, name };
