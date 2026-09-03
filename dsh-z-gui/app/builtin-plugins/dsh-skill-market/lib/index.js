// src/index.ts
import Schema from "@deepseek-ai/schemastery";

// src/market.ts
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
var NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
var MARKET_MARKER = ".dsh-market-installed.json";
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
function userSkillsDir() {
  return join(dshHome(), "skills");
}
function defaultMarketDir() {
  return join(dshHome(), "skills-market");
}
var MarketEngine = class _MarketEngine {
  marketDir;
  constructor(marketDir = defaultMarketDir()) {
    this.marketDir = marketDir || defaultMarketDir();
  }
  /** 变更市场目录（marketUrl 配置变化时调用）。 */
  setMarketDir(dir) {
    this.marketDir = dir || defaultMarketDir();
  }
  getMarketDir() {
    return this.marketDir;
  }
  /** 校验技能名（防目录穿越）。 */
  static validName(name2) {
    return NAME_RE.test(name2);
  }
  /** 读取市场清单；目录/文件缺失或解析失败返回 null。 */
  loadManifest() {
    if (!existsSync(this.marketDir)) return null;
    const file = join(this.marketDir, "manifest.json");
    if (!existsSync(file)) return null;
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (data && Array.isArray(data.skills)) return data;
    } catch {
    }
    return null;
  }
  /** 市场内技能包目录。 */
  skillSourceDir(name2) {
    return join(this.marketDir, "skills", name2);
  }
  /** 已安装技能目录（~/.dsh/skills/<name>）。 */
  installedDir(name2) {
    return join(userSkillsDir(), name2);
  }
  isInstalled(name2) {
    return existsSync(this.installedDir(name2)) && existsSync(join(this.installedDir(name2), "SKILL.md"));
  }
  /** 该技能是否由市场安装（有来源标记），决定是否允许卸载。 */
  isMarketManaged(name2) {
    return existsSync(join(this.installedDir(name2), MARKET_MARKER));
  }
  /** 安装（覆盖更新）：市场包 → ~/.dsh/skills/<name>，并写入来源标记。 */
  install(name2) {
    if (!_MarketEngine.validName(name2)) return { ok: false, reason: "invalid skill name" };
    const src = this.skillSourceDir(name2);
    if (!existsSync(src)) return { ok: false, reason: "skill not found in market" };
    const dest = this.installedDir(name2);
    mkdirSync(userSkillsDir(), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
    cpSync(src, dest, { recursive: true });
    writeFileSync(
      join(dest, MARKET_MARKER),
      JSON.stringify({ market: this.marketDir, name: name2, installedAt: Date.now() }, null, 2),
      "utf8"
    );
    return { ok: true };
  }
  /** 卸载：仅允许移除由市场安装的技能（防误删用户自建技能）。 */
  uninstall(name2) {
    if (!_MarketEngine.validName(name2)) return { ok: false, reason: "invalid skill name" };
    const dest = this.installedDir(name2);
    if (!existsSync(dest)) return { ok: false, reason: "not installed" };
    if (!this.isMarketManaged(name2)) return { ok: false, reason: "skill not managed by market" };
    rmSync(dest, { recursive: true, force: true });
    return { ok: true };
  }
  /** 市场技能列表（附已安装/可卸载状态）。 */
  list() {
    const manifest = this.loadManifest();
    if (!manifest) return [];
    return manifest.skills.map((skill) => {
      const installed = this.isInstalled(skill.name);
      return {
        ...skill,
        installed,
        managed: installed && this.isMarketManaged(skill.name),
        exists: existsSync(this.skillSourceDir(skill.name))
      };
    });
  }
  /** 市场头部信息 + 统计。 */
  info() {
    const manifest = this.loadManifest();
    if (!manifest) return null;
    return {
      name: manifest.name,
      displayName: manifest.displayName,
      version: manifest.version,
      description: manifest.description,
      updatedAt: manifest.updatedAt,
      skillCount: manifest.skills.length,
      dir: this.marketDir
    };
  }
  /**
   * 技能详情（懒加载）：读取市场技能包内 SKILL.md，解析完整 frontmatter
   * 与正文，返回比 manifest 更全的字段（补全 description/whenToUse 等残缺项）。
   */
  skillDetail(name2) {
    if (!_MarketEngine.validName(name2)) return { ok: false, error: "invalid skill name" };
    const src = this.skillSourceDir(name2);
    const mdFile = join(src, "SKILL.md");
    if (!existsSync(mdFile)) return { ok: false, error: "skill not found in market" };
    const raw = readFileSync(mdFile, "utf8");
    const { frontmatter, body } = parseSkillMd(raw);
    return {
      ok: true,
      skill: { name: name2, ...frontmatter },
      detail: {
        name: name2,
        description: frontmatter.description,
        whenToUse: frontmatter.whenToUse,
        author: frontmatter.author,
        version: frontmatter.version,
        license: frontmatter.license,
        homepage: frontmatter.homepage,
        tags: frontmatter.tags,
        body
      }
    };
  }
};
function parseSkillMd(raw) {
  const trimmed = raw.replace(/^\uFEFF/, "");
  if (!trimmed.startsWith("---")) return { frontmatter: {}, body: trimmed.trim() };
  const end = trimmed.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: {}, body: trimmed.trim() };
  return { frontmatter: parseFrontmatter(trimmed.slice(3, end)), body: trimmed.slice(end + 4).trim() };
}
function parseFrontmatter(raw) {
  const out = {};
  const lines = raw.split("\n");
  let key = null;
  let block = null;
  let blockStyle = null;
  const flush = () => {
    if (key && block) out[key] = blockStyle === "|" ? block.join("\n") : block.join(" ");
    key = null;
    block = null;
    blockStyle = null;
  };
  for (const line of lines) {
    if (key && block) {
      const indented = /^\s+/.test(line);
      if (indented) {
        block.push(line.trim());
        continue;
      }
      if (/^\s*$/.test(line)) continue;
      flush();
    }
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    key = m[1];
    const val = m[2].trim();
    if (val === ">") {
      block = [];
      blockStyle = ">";
      continue;
    }
    if (val === "|") {
      block = [];
      blockStyle = "|";
      continue;
    }
    out[key] = parseScalar(val);
    key = null;
  }
  flush();
  return out;
}
function parseScalar(val) {
  if (val.startsWith("[") && val.endsWith("]")) {
    return val.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  const un = val.replace(/^['"]|['"]$/g, "");
  if (un === "true") return true;
  if (un === "false") return false;
  return un;
}

// src/index.ts
var name = "dsh-skill-market";
var inject = ["settings", "webServer"];
var Config = Schema.object({
  enabled: Schema.boolean().default(true),
  marketUrl: Schema.string().default("")
});
var MARKET_API = "/plugins/dsh-skill-market/api";
function localSettingsScope(value) {
  return {
    get: () => value,
    update: async () => {
    },
    replace: async () => {
    },
    watch: () => () => {
    }
  };
}
function apiJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}
function isLoopback(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
async function readJsonBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 1024 * 1024) throw new Error("request body is too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function createMarketApi(engine, settings) {
  return async (req, res) => {
    if (!isLoopback(req.socket?.remoteAddress)) {
      apiJson(res, 403, { ok: false, error: "local access only" });
      return;
    }
    const origin = req.headers?.origin;
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch {
      }
      if (!originHost || originHost !== req.headers.host) {
        apiJson(res, 403, { ok: false, error: "origin mismatch" });
        return;
      }
    }
    if (req.method === "OPTIONS") {
      apiJson(res, 204, {});
      return;
    }
    const urlPath = (req.url ?? "/").split("?")[0];
    try {
      if (urlPath === `${MARKET_API}/list` && req.method === "GET") {
        const info = engine.info();
        const skills = engine.list();
        if (!info) return apiJson(res, 200, { ok: false, error: "market not found (set a valid marketUrl in settings)", skills: [], market: null });
        return apiJson(res, 200, { ok: true, market: info, skills });
      }
      if (urlPath === `${MARKET_API}/detail` && req.method === "GET") {
        const name2 = new URL(req.url ?? "/", "http://local").searchParams.get("name") ?? "";
        const result = engine.skillDetail(name2);
        return apiJson(res, result.ok ? 200 : 400, result.ok ? { ok: true, skill: result.skill, detail: result.detail } : { ok: false, error: result.error });
      }
      if (urlPath === `${MARKET_API}/config`) {
        if (req.method === "GET") return apiJson(res, 200, settings.get());
        if (req.method !== "PATCH") return apiJson(res, 405, { ok: false, error: "method not allowed" });
        const body = await readJsonBody(req);
        if (body === null || typeof body !== "object" || Array.isArray(body)) {
          return apiJson(res, 400, { ok: false, error: "patch must be an object" });
        }
        if (typeof settings.replace === "function") await settings.replace(body);
        else if (typeof settings.update === "function") await settings.update(body);
        return apiJson(res, 200, { ok: true, config: settings.get() });
      }
      if (urlPath === `${MARKET_API}/install` && req.method === "POST") {
        const body = await readJsonBody(req);
        if (typeof body?.name !== "string") return apiJson(res, 400, { ok: false, error: "name is required" });
        const result = engine.install(body.name);
        return apiJson(res, result.ok ? 200 : 400, { ok: result.ok, error: result.reason, name: body.name });
      }
      if (urlPath === `${MARKET_API}/uninstall` && req.method === "POST") {
        const body = await readJsonBody(req);
        if (typeof body?.name !== "string") return apiJson(res, 400, { ok: false, error: "name is required" });
        const result = engine.uninstall(body.name);
        return apiJson(res, result.ok ? 200 : 400, { ok: result.ok, error: result.reason, name: body.name });
      }
      return apiJson(res, 404, { ok: false, error: "not found" });
    } catch (error) {
      return apiJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
}
function mount(ctx, config) {
  const settings = ctx.settings?.register?.("dsh-skill-market", Config, { base: config, applies: "live" });
  const effective = { ...config, ...settings ? settings.get() : {} };
  if (typeof effective.marketUrl !== "string") effective.marketUrl = "";
  const engine = new MarketEngine(effective.marketUrl);
  const scope = settings ?? localSettingsScope(effective);
  if (settings) {
    settings.watch((next) => {
      Object.assign(effective, next);
      if (typeof effective.marketUrl !== "string") effective.marketUrl = "";
      engine.setMarketDir(effective.marketUrl);
    });
  }
  if (typeof ctx.inject === "function") {
    ctx.inject(["webServer"], (httpCtx) => {
      httpCtx.effect(
        () => httpCtx.webServer.register({
          kind: "prefix",
          path: MARKET_API,
          handler: createMarketApi(engine, scope)
        }),
        "dsh-skill-market: api"
      );
    });
  }
  ctx.logger.info("[dsh-skill-market] \u6280\u80FD\u5E02\u573A\u5DF2\u542F\u7528\uFF08marketUrl=%s\uFF09", engine.getMarketDir());
}
function apply(ctx, config = {}) {
  if (typeof ctx.inject === "function") {
    ctx.inject(["settings"], (settingsCtx) => mount(settingsCtx, config));
    return;
  }
  mount(ctx, config);
}
export {
  Config,
  MARKET_API,
  MARKET_MARKER,
  apply,
  inject,
  name
};
