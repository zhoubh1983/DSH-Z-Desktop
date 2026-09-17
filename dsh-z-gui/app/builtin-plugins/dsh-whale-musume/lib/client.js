/**
 * dsh-whale-musume 客户端插件:把鲸鱼娘桌宠注入 DSH Web UI(纯 DOM 注入)。
 *
 * 零侵入:不改任何内置包文件、不读业务 DOM、无外部请求。
 * 资源经宿主路由 /api/dsh-whale-musume/assets?f=<path> 加载,
 * 注入顺序:样式 → 状态机(whale-moe-core)→ 表现层(dsh-whale-moe),
 * 表现层的资源根与校准表路径会被改写为宿主路由。
 */
window.__ModuleLoader__.load({
  id: "dsh-whale-musume",
  factory: () => {
    var module = { exports: {} };
    var exports = module.exports;

    const BASE = "/api/dsh-whale-musume/assets?f=";
    const BOOT_FLAG = "__dshWhaleMusumeBooted";
    /* 表现层改动后加版本尾巴绕过浏览器缓存（服务端会剥掉 ?v= 再取文件） */
    const SHELL_VERSION = "v=20260916-2";
    const URL_ = (f) => BASE + f + "?" + SHELL_VERSION;

    function injectStyle(text) {
      const el = document.createElement("style");
      el.setAttribute("data-dsh-whale-musume", "css");
      el.textContent = text;
      document.head.appendChild(el);
    }

    function injectScript(text) {
      const el = document.createElement("script");
      el.setAttribute("data-dsh-whale-musume", "js");
      el.textContent = text;
      document.body.appendChild(el);
    }

    async function boot() {
      if (window[BOOT_FLAG]) return;
      window[BOOT_FLAG] = true;
      try {
        // 幂等防护：同一页面即使被注入两次（升级迁移/插件重复加载），
        // 也只保留最新一份样式/脚本/根节点，避免出现两只鲸鱼娘。
        for (const el of document.querySelectorAll(
          'script[data-dsh-whale-musume], style[data-dsh-whale-musume], [data-dsh-whale-root]'
        )) {
          el.remove()
        }
        const css = await (await fetch(URL_("dsh-whale-moe.css"))).text();
        injectStyle(css);
        const core = await (await fetch(URL_("whale-moe-core.js"))).text();
        injectScript(core);
        const raw = await (await fetch(URL_("dsh-whale-moe.js"))).text();
        const presenter = raw
          .replace('var ASSET_ROOT = "/assets/generated/";', 'var ASSET_ROOT = "' + BASE + 'generated/";')
          .replace('fetch("/assets/peek-calibration.json")', 'fetch("' + BASE + 'peek-calibration.json")');
        injectScript(presenter);
      } catch (error) {
        console.warn("[dsh-whale-musume] 资源加载失败:", error);
      }
    }

    const inject = [];

    function apply() {
      boot();
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
