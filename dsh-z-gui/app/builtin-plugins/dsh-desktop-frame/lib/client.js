window.__ModuleLoader__.load({
  id: 'dsh-desktop-frame',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// dsh-z-gui/app/client-src/desktop-titlebar/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(index_exports);
var import_client = require("react-dom/client");

// dsh-z-gui/app/client-src/desktop-titlebar/TitlebarView.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var MODE_LABEL = {
  compatibility: "\u517C\u5BB9\u6A21\u5F0F",
  extended: "\u6269\u5C55\u6A21\u5F0F",
  advanced: "\u589E\u5F3A\u6A21\u5F0F"
};
var MODE_OPTS = [
  { m: "compatibility", title: "\u517C\u5BB9", body: "\u4FDD\u7559\u539F\u751F\u7CFB\u7EDF\u6807\u9898\u680F" },
  { m: "extended", title: "\u6269\u5C55", body: "36px \u684C\u9762\u6807\u9898\u680F + \u4E09\u680F\u5E03\u5C40" },
  { m: "advanced", title: "\u589E\u5F3A", body: "32px \u7D27\u51D1\u6807\u9898\u680F" }
];
function desktopAction(cmd, payload) {
  window.dshGui?.desktop?.action(cmd, payload || {});
}
function TitlebarView({ state }) {
  const [menuOpen, setMenuOpen] = (0, import_react.useState)(false);
  const modeWrapRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const onDown = (ev) => {
      if (modeWrapRef.current !== null && !modeWrapRef.current.contains(ev.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  const mode = state.mode === "advanced" || state.mode === "extended" ? state.mode : "compatibility";
  const bindModeToggle = (el) => {
    if (!el) return;
    el.addEventListener("click", () => setMenuOpen((open) => !open));
  };
  const bindModeOpt = (m) => (el) => {
    if (!el) return;
    el.addEventListener("click", () => {
      setMenuOpen(false);
      desktopAction("mode", { mode: m });
    });
  };
  const bindAction = (cmd) => (el) => {
    if (!el) return;
    el.addEventListener("click", () => desktopAction(cmd));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "header",
    {
      className: "dshDesktopFrameTitlebar",
      "data-platform": state.platform || "win32",
      "data-mode": mode,
      "data-material": state.material || "off",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopFrameIdentity", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshDesktopFrameProduct", children: "DSH Desktop" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dshDesktopFrameVersion", title: `DSH Desktop ${state.version || ""}`, children: `v${state.version || "0.1.0"}` }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopFrameModeWrap", ref: modeWrapRef, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "dshDesktopFrameMode",
                "aria-haspopup": "menu",
                ref: bindModeToggle,
                children: MODE_LABEL[mode] || mode
              }
            ),
            menuOpen && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopModeMenu", role: "menu", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dshDesktopModeMenuHead", children: "\u5207\u6362\u5448\u73B0\u6A21\u5F0F" }),
              MODE_OPTS.filter((o) => o.m !== mode).map((o) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "button",
                {
                  type: "button",
                  className: "dshDesktopModeOpt",
                  ref: bindModeOpt(o.m),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: o.title }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("small", { children: o.body })
                  ]
                },
                o.m
              ))
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dshDesktopFrameActions", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopTitlebarIconButton", title: "\u6253\u5F00 DSH \u7EC8\u7AEF", "aria-label": "\u6253\u5F00 DSH \u7EC8\u7AEF", ref: bindAction("terminal"), children: "\u276F_" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopTitlebarIconButton", title: "\u91CD\u542F\u540E\u7AEF", "aria-label": "\u91CD\u542F\u540E\u7AEF", ref: bindAction("restart"), children: "\u27F3" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dshDesktopTitlebarIconButton", title: "\u5F00\u53D1\u8005\u5DE5\u5177", "aria-label": "\u5F00\u53D1\u8005\u5DE5\u5177", ref: bindAction("devtools"), children: "\u2699" })
        ] })
      ]
    }
  );
}

// dsh-z-gui/app/client-src/desktop-titlebar/index.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var TITLEBAR_HEIGHT = 36;
var ADVANCED_HEIGHT = 32;
var CSS_ID = "dsh-desktop-frame-css";
var ROOT_ID = "dsh-desktop-frame-root";
var TITLEBAR_CSS = `
.dshDesktopFrameTitlebar{position:fixed;z-index:2147483647;top:0;right:0;left:0;display:flex;align-items:center;box-sizing:border-box;height:${TITLEBAR_HEIGHT}px;background:#0f1117;color:#e5e7eb;user-select:none;-webkit-app-region:drag;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI","PingFang SC",sans-serif}
.dshDesktopFrameTitlebar[data-platform="win32"]{padding:0 142px 0 10px}
.dshDesktopFrameTitlebar[data-platform="darwin"]{padding:0 10px 0 88px}
.dshDesktopFrameTitlebar[data-material="mica"],.dshDesktopFrameTitlebar[data-material="transparent"]{background:rgba(15,17,23,.66)}
.dshDesktopFrameIdentity{display:flex;align-items:center;gap:9px;min-width:0;margin-right:auto;pointer-events:none}
.dshDesktopFrameProduct{font-size:13px;font-weight:600;white-space:nowrap;color:#a5b4fc}
.dshDesktopFrameVersion{min-height:22px;padding:2px 6px;border:1px solid rgba(255,255,255,.12);border-radius:6px;background:rgba(255,255,255,.05);color:#9ca3af;font:inherit;font-size:11px;white-space:nowrap;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopFrameMode{display:inline-flex;align-items:center;min-height:22px;padding:2px 8px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(255,255,255,.08);color:#cbd5e1;cursor:pointer;font:inherit;font-size:11px;white-space:nowrap;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopFrameMode:hover{background:rgba(255,255,255,.16);color:#e5e7eb}
.dshDesktopFrameModeWrap{position:relative;pointer-events:auto}
.dshDesktopModeMenu{position:absolute;z-index:2147483647;top:calc(100% + 5px);left:0;min-width:230px;padding:5px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:#1b1f27;box-shadow:0 12px 32px rgba(0,0,0,.4);display:grid;gap:3px;-webkit-app-region:no-drag}
.dshDesktopModeMenuHead{color:#9ca3af;font-size:11px;font-weight:600;padding:4px 8px 6px}
.dshDesktopModeOpt{display:grid;gap:2px;width:100%;padding:7px 9px;border:0;border-radius:7px;background:transparent;color:#e5e7eb;cursor:pointer;text-align:left;font:inherit}
.dshDesktopModeOpt:hover{background:rgba(255,255,255,.1)}
.dshDesktopModeOpt strong{font-size:12px;font-weight:600}
.dshDesktopModeOpt small{color:#9ca3af;font-size:10px;line-height:1.35}
.dshDesktopFrameActions{display:flex;align-items:center;gap:4px;pointer-events:none}
.dshDesktopTitlebarIconButton{display:inline-flex;align-items:center;justify-content:center;width:28px;height:26px;padding:0;border:1px solid transparent;border-radius:7px;background:rgba(255,255,255,.06);color:#cbd5e1;cursor:pointer;font-size:13px;line-height:1;pointer-events:auto;-webkit-app-region:no-drag}
.dshDesktopTitlebarIconButton:hover{background:rgba(255,255,255,.14);color:#e5e7eb}
body[data-dsh-desktop-frame="on"]{overflow:hidden}
body[data-dsh-desktop-frame="on"] #root{box-sizing:border-box;height:100%;overflow:hidden;padding-top:${TITLEBAR_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] #root{padding-top:${ADVANCED_HEIGHT}px}
body[data-dsh-desktop-frame="on"][data-dsh-desktop-height="advanced"] .dshDesktopFrameTitlebar{height:${ADVANCED_HEIGHT}px}
`;
function injectCss() {
  if (document.getElementById(CSS_ID)) return;
  const style = document.createElement("style");
  style.id = CSS_ID;
  style.textContent = TITLEBAR_CSS;
  document.head.appendChild(style);
}
function ensureRoot() {
  let el = document.getElementById(ROOT_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = ROOT_ID;
    document.body.appendChild(el);
  }
  return el;
}
var rootInstance = null;
var name = "dsh-desktop-frame-client";
function apply() {
  injectCss();
  const boot = () => {
    const get = window.dshGui?.desktop?.getState;
    const promise = get ? get() : Promise.resolve({ mode: "compatibility", material: "off", platform: "win32", version: "0.1.0" });
    promise.then((state) => {
      const mode = state && (state.mode === "advanced" || state.mode === "extended") ? state.mode : "compatibility";
      document.body.dataset.dshDesktopFrame = mode === "compatibility" ? "off" : "on";
      document.body.dataset.dshDesktopHeight = mode === "advanced" ? "advanced" : "extended";
      if (mode === "compatibility") {
        if (rootInstance) {
          rootInstance.unmount();
          rootInstance = null;
        }
        return;
      }
      if (!rootInstance) rootInstance = (0, import_client.createRoot)(ensureRoot());
      rootInstance.render(/* @__PURE__ */ (0, import_jsx_runtime2.jsx)(TitlebarView, { state }));
    }).catch(() => {
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
}

    return module.exports
  },
})
