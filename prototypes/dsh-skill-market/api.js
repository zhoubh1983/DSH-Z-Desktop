/**
 * api.js —— API 桩（stub）：签名、延迟与返回结构与真实后端一致。
 * 未来接入真实后端时，仅需替换每个函数的实现为对应 fetch，形状保持不变。
 *
 * 真实后端契约（dsh-skill-market 插件）：
 *   GET   /plugins/dsh-skill-market/api/list            → { ok, market, skills }
 *   GET   /plugins/dsh-skill-market/api/config          → { enabled, marketUrl }
 *   PATCH /plugins/dsh-skill-market/api/config          → { ok, config }
 *   POST  /plugins/dsh-skill-market/api/install {name}  → { ok, error?, name }
 *   POST  /plugins/dsh-skill-market/api/uninstall {name}→ { ok, error?, name }
 *   GET   /plugins/dsh-skill-market/api/detail?name=    → { ok, skill, detail }
 */
window.API = (function () {
  // 模拟网络延迟，让 loading 态可见
  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** GET /api/list —— 市场信息 + 技能列表（含 installed/managed 状态）。 */
  async function fetchList() {
    await delay(420);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/list')
    return {
      ok: true,
      market: clone(DB.market),
      skills: clone(DB.skills),
    };
  }

  /** GET /api/config —— 读取市场配置。 */
  async function fetchConfig() {
    await delay(180);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/config')
    return { enabled: true, marketUrl: DB.market.dir };
  }

  /** PATCH /api/config —— 保存市场地址（空 = 内置）。 */
  async function saveConfig(patch) {
    await delay(360);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/config', { method: 'PATCH', body: JSON.stringify(patch) })
    DB.market.dir = (patch.marketUrl && patch.marketUrl.trim()) ? patch.marketUrl.trim() : '默认 ~/.dsh/skills-market';
    return { ok: true, config: { enabled: true, marketUrl: DB.market.dir } };
  }

  /** POST /api/install —— 安装（覆盖更新），写入来源标记。 */
  async function installSkill(name) {
    await delay(650);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/install', { method: 'POST', body: JSON.stringify({ name }) })
    const skill = DB.skills.find(function (s) { return s.name === name; });
    if (!skill) return { ok: false, error: 'skill not found in market', name };
    skill.installed = true;
    skill.managed = true;
    return { ok: true, name };
  }

  /** POST /api/uninstall —— 卸载（仅限市场来源安装的技能）。 */
  async function uninstallSkill(name) {
    await delay(520);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/uninstall', { method: 'POST', body: JSON.stringify({ name }) })
    const skill = DB.skills.find(function (s) { return s.name === name; });
    if (!skill) return { ok: false, error: 'not installed', name };
    if (!skill.managed) return { ok: false, error: 'skill not managed by market', name };
    skill.installed = false;
    skill.managed = false;
    return { ok: true, name };
  }

  /** GET /api/detail?name= —— 懒加载技能详情（完整 frontmatter + 正文）。 */
  async function fetchDetail(name) {
    await delay(260);
    // TODO: replace with fetch('/plugins/dsh-skill-market/api/detail?name=' + encodeURIComponent(name))
    const skill = DB.skills.find(function (s) { return s.name === name; });
    if (!skill) return { ok: false, error: 'skill not found' };
    return {
      ok: true,
      skill: clone(skill),
      detail: DB.details[name] || {
        description: skill.description,
        whenToUse: '完整使用说明随安装包提供（SKILL.md）。',
        author: skill.author,
        version: skill.version,
        license: skill.license,
        homepage: skill.homepage,
        body: '',
      },
    };
  }

  return { fetchList, fetchConfig, saveConfig, installSkill, uninstallSkill, fetchDetail };
})();
