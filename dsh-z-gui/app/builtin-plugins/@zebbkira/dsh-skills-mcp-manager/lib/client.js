window.__ModuleLoader__.load({
	id: "@zebbkira/dsh-skills-mcp-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var __css = ".ODe1JW_card {\n  background: #8080800d;\n  border: 1px solid #80808047;\n  border-radius: 8px;\n  list-style: none;\n  overflow: hidden;\n}\n\n.ODe1JW_header {\n  width: 100%;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  cursor: pointer;\n  background: none;\n  border: 0;\n  justify-content: space-between;\n  align-items: center;\n  gap: 10px;\n  padding: 12px 14px;\n  display: flex;\n}\n\n.ODe1JW_header:hover {\n  background: #80808014;\n}\n\n.ODe1JW_headText {\n  flex-direction: column;\n  gap: 3px;\n  min-width: 0;\n  display: flex;\n}\n\n.ODe1JW_name {\n  color: inherit;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-weight: 600;\n  overflow: hidden;\n}\n\n.ODe1JW_description {\n  color: gray;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 12px;\n  line-height: 1.35;\n  overflow: hidden;\n}\n\n.ODe1JW_chevron, .ODe1JW_chevronOpen {\n  color: gray;\n  flex: none;\n  font-size: 13px;\n  transition: transform .12s;\n}\n\n.ODe1JW_chevronOpen {\n  transform: rotate(180deg);\n}\n\n.ODe1JW_body {\n  border-top: 1px solid #80808033;\n  flex-direction: column;\n  gap: 16px;\n  padding: 14px;\n  display: flex;\n}\n\n.ODe1JW_notExposed, .ODe1JW_readOnly, .ODe1JW_note {\n  color: gray;\n  font-size: 12px;\n}\n\n.ODe1JW_error {\n  color: #e5534b;\n  font-size: 12px;\n}\n\n.ODe1JW_config {\n  flex-direction: column;\n  gap: 10px;\n  display: flex;\n}\n\n.ODe1JW_field {\n  flex-direction: column;\n  gap: 3px;\n  display: flex;\n}\n\n.ODe1JW_toggle {\n  cursor: pointer;\n  align-items: center;\n  gap: 8px;\n  display: flex;\n}\n\n.ODe1JW_toggle input {\n  cursor: pointer;\n}\n\n.ODe1JW_toggleLabel {\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.ODe1JW_hint {\n  color: gray;\n  margin: 0;\n  font-size: 12px;\n}\n\n.ODe1JW_sectionPage {\n  flex-direction: column;\n  gap: 12px;\n  display: flex;\n}\n\n.ODe1JW_pageHeading {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n}\n\n.ODe1JW_pageIntro {\n  color: gray;\n  margin: 0;\n  font-size: 13px;\n}\n\n.ODe1JW_manager {\n  flex-direction: column;\n  gap: 14px;\n  display: flex;\n}\n\n.ODe1JW_tabs {\n  border-bottom: 1px solid #80808040;\n  gap: 4px;\n  display: flex;\n}\n\n.ODe1JW_tab, .ODe1JW_tabActive {\n  cursor: pointer;\n  font: inherit;\n  color: inherit;\n  opacity: .7;\n  background: none;\n  border: none;\n  border-bottom: 2px solid #0000;\n  padding: 8px 14px;\n}\n\n.ODe1JW_tabActive {\n  opacity: 1;\n  border-bottom-color: currentColor;\n  font-weight: 600;\n}\n\n.ODe1JW_disabledBanner {\n  color: #e5534b;\n  border: 1px solid #e5534b66;\n  border-radius: 8px;\n  margin: 0;\n  padding: 8px 10px;\n  font-size: 12px;\n}\n\n.ODe1JW_panel {\n  flex-direction: column;\n  gap: 20px;\n  display: flex;\n}\n\n.ODe1JW_section {\n  flex-direction: column;\n  gap: 10px;\n  display: flex;\n}\n\n.ODe1JW_h {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.ODe1JW_hGrow {\n  flex: auto;\n  margin: 0;\n  font-size: 14px;\n  font-weight: 600;\n}\n\n.ODe1JW_groupH {\n  margin: 10px 0 0;\n  font-size: 13px;\n  font-weight: 600;\n}\n\n.ODe1JW_inline {\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n  display: flex;\n}\n\n.ODe1JW_row {\n  border: 1px solid #80808033;\n  border-radius: 8px;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 10px;\n  display: flex;\n}\n\n.ODe1JW_main {\n  flex: auto;\n  min-width: 0;\n}\n\n.ODe1JW_desc {\n  color: gray;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  margin-top: 2px;\n  font-size: 12px;\n  overflow: hidden;\n}\n\n.ODe1JW_badge {\n  white-space: nowrap;\n  background: #80808026;\n  border-radius: 999px;\n  padding: 1px 8px;\n  font-size: 11px;\n}\n\n.ODe1JW_status {\n  color: gray;\n  font-size: 11px;\n}\n\n.ODe1JW_switch {\n  white-space: nowrap;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  display: flex;\n}\n\n.ODe1JW_switch input {\n  cursor: pointer;\n}\n\n.ODe1JW_btn {\n  font: inherit;\n  color: inherit;\n  cursor: pointer;\n  white-space: nowrap;\n  background: none;\n  border: 1px solid #80808059;\n  border-radius: 6px;\n  padding: 4px 10px;\n  font-size: 12px;\n}\n\n.ODe1JW_btn:hover {\n  background: #8080801a;\n}\n\n.ODe1JW_btn:disabled {\n  opacity: .5;\n  cursor: default;\n}\n\n.ODe1JW_btnActive {\n  background: #80808026;\n}\n\n.ODe1JW_btnPrimary {\n  border-color: currentColor;\n  font-weight: 600;\n}\n\n.ODe1JW_btnDanger {\n  color: #e5534b;\n  border-color: #e5534b66;\n}\n\n.ODe1JW_detail {\n  background: #8080800a;\n  border: 1px solid #80808026;\n  border-radius: 8px;\n  margin: 4px 0 0;\n  padding: 10px;\n}\n\n.ODe1JW_pre {\n  white-space: pre-wrap;\n  word-break: break-word;\n  background: #80808014;\n  border-radius: 6px;\n  max-height: 320px;\n  margin: 8px 0 0;\n  padding: 8px;\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n  font-size: 12px;\n  overflow: auto;\n}\n\n.ODe1JW_scanList {\n  flex-direction: column;\n  gap: 8px;\n  display: flex;\n}\n\n.ODe1JW_input, .ODe1JW_inputGrow, .ODe1JW_inputMono {\n  font: inherit;\n  color: inherit;\n  box-sizing: border-box;\n  background: none;\n  border: 1px solid #80808059;\n  border-radius: 6px;\n  width: 100%;\n  padding: 6px 8px;\n  font-size: 13px;\n}\n\n.ODe1JW_inputGrow {\n  flex: auto;\n  width: auto;\n  min-width: 240px;\n}\n\n.ODe1JW_inputMono {\n  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;\n}\n\n.ODe1JW_filterSelect {\n  font: inherit;\n  color: inherit;\n  background: none;\n  border: 1px solid #80808059;\n  border-radius: 6px;\n  flex: none;\n  width: auto;\n  padding: 6px 8px;\n  font-size: 13px;\n}\n\ntextarea.ODe1JW_input {\n  resize: vertical;\n}\n\n.ODe1JW_form {\n  flex-direction: column;\n  gap: 10px;\n  display: flex;\n}\n\n.ODe1JW_fieldLabel {\n  flex-direction: column;\n  gap: 4px;\n  display: flex;\n}\n\n.ODe1JW_fieldName {\n  color: gray;\n  font-size: 12px;\n}\n";
		var __cssTagId = "@zebbkira/dsh-skills-mcp-manager/style.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(__cssTagId) + "]") === null) {
		  var __cssTag = document.createElement("style");
		  __cssTag.dataset.plugin = "@zebbkira/dsh-skills-mcp-manager";
		  __cssTag.dataset.pluginCss = __cssTagId;
		  __cssTag.textContent = __css;
		  document.head.appendChild(__cssTag);
		}
		
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			title: "技能与 MCP",
			description: "管理技能与 MCP 服务器（MCP 为真实连接）。",
			expand: "展开",
			collapse: "收起",
			notExposed: "当前部署未向此客户端提供该插件的设置命名空间。",
			readOnly: "设置文档为只读，无法保存更改。",
			unsaved: "未保存",
			discard: "放弃更改",
			save: "保存",
			saving: "保存中…",
			saveFailed: "保存未成功，请重试。",
			inherit: "继承",
			overridden: "已覆盖",
			reset: "重置",
			invalid: "输入无效",
			enabled: "启用插件",
			enabledHint: "关闭后，路由与 MCP 连接会全部停止。",
			announce: "向 Agent 公告",
			announceHint: "在系统提示中向每个 Agent 说明本插件的存在与能力。",
			on: "开",
			off: "关"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			title: "Skills & MCP",
			description: "Manage skills and MCP servers (MCP connects for real).",
			expand: "Show",
			collapse: "Hide",
			notExposed: "This deployment does not expose the plugin settings namespace to this client.",
			readOnly: "The settings document is read-only; changes cannot be saved.",
			unsaved: "Unsaved",
			discard: "Discard",
			save: "Save",
			saving: "Saving…",
			saveFailed: "The save did not land; please retry.",
			inherit: "Inherit",
			overridden: "Overridden",
			reset: "Reset",
			invalid: "Invalid",
			enabled: "Enable plugin",
			enabledHint: "When off, routes and MCP connections all stop.",
			announce: "Announce to agent",
			announceHint: "Describe this plugin and its capabilities in every agent system prompt.",
			on: "On",
			off: "Off"
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
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/dsh-skills-mcp route family. The only
		* data path the card components use — plain fetch, same origin.
		*/
		/** Error carrying the route's JSON error message. */
		var SkillsMcpApiError = class extends Error {
			constructor(message) {
				super(message);
				this.name = "SkillsMcpApiError";
			}
		};
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new SkillsMcpApiError("HTTP " + response.status + ": invalid JSON response");
			}
			if (!response.ok) throw new SkillsMcpApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : "HTTP " + response.status);
			return body;
		}
		async function post(path, payload) {
			return readJson(await fetch(path, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			}));
		}
		async function get(path) {
			return readJson(await fetch(path));
		}
		/** The browser half's only data entry point. */
		var SkillsMcpApi = class {
			async listSkills(cwd) {
				const q = cwd ? "?cwd=" + encodeURIComponent(cwd) : "";
				return (await get(SKILLS_MCP_API.skills + q)).items;
			}
			async readSkill(path) {
				return (await post(SKILLS_MCP_API.skillRead, { path })).skill;
			}
			async toggleSkill(path, enabled) {
				await post(SKILLS_MCP_API.skillToggle, {
					path,
					enabled
				});
			}
			async deleteSkill(path, kind) {
				await post(SKILLS_MCP_API.skillDelete, {
					path,
					kind
				});
			}
			async scanSkills(dir) {
				return (await post(SKILLS_MCP_API.skillScan, { dir })).items;
			}
			async importSkills(items) {
				return (await post(SKILLS_MCP_API.skillImport, { items })).results;
			}
			async listMcp() {
				return (await get(SKILLS_MCP_API.mcp)).servers;
			}
			async saveMcp(server) {
				await post(SKILLS_MCP_API.mcpSave, { server });
			}
			async setMcpEnabled(name, enabled) {
				await post(SKILLS_MCP_API.mcpEnabled, {
					name,
					enabled
				});
			}
			async deleteMcp(name) {
				await post(SKILLS_MCP_API.mcpDelete, { name });
			}
			async testMcp(server) {
				return (await post(SKILLS_MCP_API.mcpTest, { server })).test;
			}
		};
		//#endregion
		//#region src/client/settings-card.module.css
		var settings_card_module_default = {
			"badge": "ODe1JW_badge",
			"body": "ODe1JW_body",
			"btn": "ODe1JW_btn",
			"btnActive": "ODe1JW_btnActive",
			"btnDanger": "ODe1JW_btnDanger",
			"btnPrimary": "ODe1JW_btnPrimary",
			"card": "ODe1JW_card",
			"chevron": "ODe1JW_chevron",
			"chevronOpen": "ODe1JW_chevronOpen",
			"config": "ODe1JW_config",
			"desc": "ODe1JW_desc",
			"description": "ODe1JW_description",
			"detail": "ODe1JW_detail",
			"disabledBanner": "ODe1JW_disabledBanner",
			"error": "ODe1JW_error",
			"field": "ODe1JW_field",
			"fieldLabel": "ODe1JW_fieldLabel",
			"fieldName": "ODe1JW_fieldName",
			"filterSelect": "ODe1JW_filterSelect",
			"form": "ODe1JW_form",
			"groupH": "ODe1JW_groupH",
			"h": "ODe1JW_h",
			"header": "ODe1JW_header",
			"headText": "ODe1JW_headText",
			"hGrow": "ODe1JW_hGrow",
			"hint": "ODe1JW_hint",
			"inline": "ODe1JW_inline",
			"input": "ODe1JW_input",
			"inputGrow": "ODe1JW_inputGrow",
			"inputMono": "ODe1JW_inputMono",
			"main": "ODe1JW_main",
			"manager": "ODe1JW_manager",
			"name": "ODe1JW_name",
			"note": "ODe1JW_note",
			"notExposed": "ODe1JW_notExposed",
			"pageHeading": "ODe1JW_pageHeading",
			"pageIntro": "ODe1JW_pageIntro",
			"panel": "ODe1JW_panel",
			"pre": "ODe1JW_pre",
			"readOnly": "ODe1JW_readOnly",
			"row": "ODe1JW_row",
			"scanList": "ODe1JW_scanList",
			"section": "ODe1JW_section",
			"sectionPage": "ODe1JW_sectionPage",
			"status": "ODe1JW_status",
			"switch": "ODe1JW_switch",
			"tab": "ODe1JW_tab",
			"tabActive": "ODe1JW_tabActive",
			"tabs": "ODe1JW_tabs",
			"toggle": "ODe1JW_toggle",
			"toggleLabel": "ODe1JW_toggleLabel"
		};
		//#endregion
		//#region src/client/manager.tsx
		/**
		* The skills + MCP management UI rendered inside the settings card. Pure
		* React (no framework services): every data access goes through SkillsMcpApi,
		* which fetches the /api/dsh-skills-mcp routes. Inline Chinese copy mirrors
		* the original dynamic plugin; the card chrome above stays bilingual.
		*/
		/** Stateless fetch client (created once per module). */
		const api = new SkillsMcpApi();
		function sourceLabel(source) {
			if (source === "project-dsh") return ".dsh/skills";
			if (source === "project-agents") return ".agents/skills";
			if (source === "user-dsh") return "~/.dsh/skills";
			if (source === "user-agents") return "~/.agents/skills";
			return source;
		}
		function parseKv(text) {
			const obj = {};
			if (!text) return obj;
			text.split(/\n/).forEach((line) => {
				const t = line.trim();
				if (!t) return;
				const i = t.indexOf("=");
				if (i < 0) return;
				obj[t.slice(0, i).trim()] = t.slice(i + 1).trim();
			});
			return obj;
		}
		function kvText(obj) {
			return Object.keys(obj || {}).map((k) => k + "=" + (obj || {})[k]).join("\n");
		}
		const EMPTY_FORM = {
			name: "",
			transport: "stdio",
			command: "",
			args: "",
			env: "",
			cwd: "",
			url: "",
			headers: "",
			mode: "form",
			json: ""
		};
		/** Top-level manager with the Skills / MCP tabs. */
		function SkillsMcpManager(props) {
			const [tab, setTab] = (0, react.useState)("skills");
			const [refreshKey, setRefreshKey] = (0, react.useState)(0);
			const bump = () => {
				setRefreshKey((k) => k + 1);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_default.manager,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_default.tabs,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: tab === "skills" ? settings_card_module_default.tabActive : settings_card_module_default.tab,
							onClick: () => {
								setTab("skills");
							},
							children: "Skills 技能"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: tab === "mcp" ? settings_card_module_default.tabActive : settings_card_module_default.tab,
							onClick: () => {
								setTab("mcp");
							},
							children: "MCP 服务"
						})]
					}),
					props.enabled ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_default.disabledBanner,
						role: "status",
						children: "插件已禁用：路由与 MCP 连接均已停止，重新启用后刷新即可恢复。"
					}),
					tab === "skills" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsPanel, {
						cwd: props.cwd,
						refreshKey,
						onChanged: bump,
						pickDirectory: props.pickDirectory
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpPanel, {
						refreshKey,
						onChanged: bump
					})
				]
			});
		}
		function SkillsPanel(props) {
			const [list, setList] = (0, react.useState)({
				loading: true,
				items: [],
				error: ""
			});
			const [detailName, setDetailName] = (0, react.useState)(null);
			const [detail, setDetail] = (0, react.useState)(null);
			const [scan, setScan] = (0, react.useState)({
				dir: "",
				busy: false,
				items: [],
				selected: {},
				error: "",
				note: ""
			});
			const [busy, setBusy] = (0, react.useState)("");
			const [msg, setMsg] = (0, react.useState)("");
			const [confirmDel, setConfirmDel] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const [enabledFilter, setEnabledFilter] = (0, react.useState)("all");
			const load = () => {
				setList({
					loading: true,
					items: [],
					error: ""
				});
				api.listSkills(props.cwd).then((items) => {
					setList({
						loading: false,
						items,
						error: ""
					});
				}).catch((e) => {
					setList({
						loading: false,
						items: [],
						error: String(e?.message || e)
					});
				});
			};
			(0, react.useEffect)(() => {
				load();
			}, [props.cwd, props.refreshKey]);
			const toggle = (skill) => {
				setBusy(skill.path);
				setMsg("");
				api.toggleSkill(skill.path, !skill.enabled).then(() => {
					setBusy("");
					load();
				}).catch((e) => {
					setBusy("");
					setMsg(String(e?.message || e));
				});
			};
			const remove = (skill) => {
				if (confirmDel !== skill.path) {
					setConfirmDel(skill.path);
					return;
				}
				setConfirmDel(null);
				setBusy(skill.path);
				setMsg("");
				api.deleteSkill(skill.path, skill.kind).then(() => {
					setBusy("");
					load();
				}).catch((e) => {
					setBusy("");
					setMsg(String(e?.message || e));
				});
			};
			const view = (skill) => {
				if (detailName === skill.path) {
					setDetailName(null);
					setDetail(null);
					return;
				}
				setDetailName(skill.path);
				setDetail(null);
				api.readSkill(skill.path).then((data) => {
					setDetail({
						path: skill.path,
						data
					});
				}).catch((e) => {
					setDetail({
						path: skill.path,
						data: { error: String(e?.message || e) }
					});
				});
			};
			const chooseDir = () => {
				props.pickDirectory().then((path) => {
					if (path) setScan((prev) => ({
						...prev,
						dir: path,
						error: ""
					}));
				}).catch((e) => {
					setScan((prev) => ({
						...prev,
						error: String(e?.message || e)
					}));
				});
			};
			const doScan = () => {
				const dir = scan.dir.trim();
				if (!dir) {
					setScan((prev) => ({
						...prev,
						error: "请输入目录路径"
					}));
					return;
				}
				setScan((prev) => ({
					...prev,
					busy: true,
					items: [],
					error: "",
					note: ""
				}));
				api.scanSkills(dir).then((items) => {
					setScan((prev) => ({
						...prev,
						busy: false,
						items,
						selected: {},
						note: items.length === 0 ? "未发现可导入的技能" : ""
					}));
				}).catch((e) => {
					setScan((prev) => ({
						...prev,
						busy: false,
						items: [],
						error: String(e?.message || e)
					}));
				});
			};
			const toggleSelect = (sourcePath) => {
				setScan((prev) => {
					const selected = { ...prev.selected };
					if (selected[sourcePath]) delete selected[sourcePath];
					else selected[sourcePath] = true;
					return {
						...prev,
						selected
					};
				});
			};
			const doImport = () => {
				const chosen = scan.items.filter((it) => scan.selected[it.sourcePath]);
				if (chosen.length === 0) {
					setScan((prev) => ({
						...prev,
						error: "请先勾选要导入的技能"
					}));
					return;
				}
				setScan((prev) => ({
					...prev,
					busy: true,
					error: ""
				}));
				api.importSkills(chosen.map((it) => ({
					sourcePath: it.sourcePath,
					kind: it.kind
				}))).then((results) => {
					const imported = results.filter((x) => x.ok).length;
					setScan((prev) => ({
						...prev,
						busy: false,
						selected: {},
						note: "已导入 " + imported + " 个技能"
					}));
					load();
				}).catch((e) => {
					setScan((prev) => ({
						...prev,
						busy: false,
						error: String(e?.message || e)
					}));
				});
			};
			const q = query.trim().toLowerCase();
			const filtered = list.items.filter((it) => {
				if (q !== "" && !it.name.toLowerCase().includes(q)) return false;
				if (enabledFilter === "enabled" && !it.enabled) return false;
				if (enabledFilter === "disabled" && it.enabled) return false;
				return true;
			});
			const byLevel = {};
			filtered.forEach((it) => {
				(byLevel[it.level] = byLevel[it.level] || []).push(it);
			});
			const rows = [];
			[["project", "项目级"], ["user", "用户级"]].forEach(([level, label]) => {
				const gs = byLevel[level] || [];
				if (gs.length === 0) return;
				rows.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_default.groupH,
					children: [
						label,
						" (",
						gs.length,
						")"
					]
				}, "g-" + level));
				gs.forEach((skill) => {
					const isBusy = busy === skill.path;
					rows.push(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_default.row,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: settings_card_module_default.main,
								style: { cursor: "pointer" },
								onClick: () => {
									view(skill);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: settings_card_module_default.name,
									children: [skill.name, skill.enabled ? "" : " （已禁用）"]
								}), skill.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: settings_card_module_default.desc,
									children: skill.description
								}) : null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: settings_card_module_default.badge,
								children: sourceLabel(skill.source)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: settings_card_module_default.switch,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: skill.enabled,
									disabled: isBusy,
									onChange: () => {
										toggle(skill);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: skill.enabled ? "启用" : "禁用" })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_default.btn,
								onClick: () => {
									view(skill);
								},
								children: detailName === skill.path ? "收起" : "详情"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_default.btnDanger,
								disabled: isBusy,
								onClick: () => {
									remove(skill);
								},
								children: confirmDel === skill.path ? "确认删除?" : "删除"
							})
						]
					}, skill.path));
					if (detailName === skill.path) {
						const entry = detail;
						const d = entry && entry.path === skill.path ? entry.data : null;
						rows.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.detail,
							children: d === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "加载中…" }) : d && d.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: d.error }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: settings_card_module_default.name,
									children: d.description || skill.description
								}),
								d.whenToUse ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: settings_card_module_default.desc,
									children: ["When to use: ", d.whenToUse]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
									className: settings_card_module_default.pre,
									children: d.content || ""
								})
							] })
						}, skill.path + "-detail"));
					}
				});
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_default.panel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.h,
							children: "导入技能"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.inline,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: settings_card_module_default.inputGrow,
									placeholder: "目录路径（含 SKILL.md 的技能目录或平铺 .md）",
									value: scan.dir,
									onChange: (e) => {
										setScan((prev) => ({
											...prev,
											dir: e.target.value
										}));
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_default.btn,
									onClick: chooseDir,
									children: "选择文件夹"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_default.btn,
									disabled: scan.busy,
									onClick: doScan,
									children: scan.busy ? "扫描中…" : "扫描目录"
								})
							]
						}),
						scan.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.error,
							children: scan.error
						}) : null,
						scan.items.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.scanList,
							children: [scan.items.map((it) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: settings_card_module_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: !!scan.selected[it.sourcePath],
									onChange: () => {
										toggleSelect(it.sourcePath);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: settings_card_module_default.main,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: settings_card_module_default.name,
										children: [it.name, it.kind === "bundle" ? " (目录)" : " (文件)"]
									}), it.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: settings_card_module_default.desc,
										children: it.description
									}) : null]
								})]
							}, it.sourcePath)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: settings_card_module_default.btn,
								disabled: scan.busy,
								onClick: doImport,
								children: [
									"导入选中 (",
									Object.keys(scan.selected).length,
									")"
								]
							})]
						}) : null,
						scan.note ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.note,
							children: scan.note
						}) : null
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.inline,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: settings_card_module_default.hGrow,
								children: "技能列表"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_default.btn,
								onClick: load,
								children: "刷新"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.inline,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: settings_card_module_default.inputGrow,
								placeholder: "搜索技能名称…",
								value: query,
								onChange: (e) => {
									setQuery(e.target.value);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: settings_card_module_default.filterSelect,
								value: enabledFilter,
								onChange: (e) => {
									setEnabledFilter(e.target.value);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "all",
										children: "全部"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "enabled",
										children: "已启用"
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "disabled",
										children: "未启用"
									})
								]
							})]
						}),
						msg ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.error,
							children: msg
						}) : null,
						list.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.error,
							children: list.error
						}) : null,
						list.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "加载中…" }) : filtered.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: list.items.length === 0 ? "没有发现技能" : "没有匹配的技能" }) : rows
					]
				})]
			});
		}
		function McpPanel(props) {
			const [list, setList] = (0, react.useState)({
				loading: true,
				servers: [],
				error: ""
			});
			const [form, setForm] = (0, react.useState)(EMPTY_FORM);
			const [busy, setBusy] = (0, react.useState)("");
			const [msg, setMsg] = (0, react.useState)("");
			const [confirmDel, setConfirmDel] = (0, react.useState)(null);
			const [query, setQuery] = (0, react.useState)("");
			const load = () => {
				setList({
					loading: true,
					servers: [],
					error: ""
				});
				api.listMcp().then((servers) => {
					setList({
						loading: false,
						servers,
						error: ""
					});
				}).catch((e) => {
					setList({
						loading: false,
						servers: [],
						error: String(e?.message || e)
					});
				});
			};
			(0, react.useEffect)(() => {
				load();
			}, [props.refreshKey]);
			const patch = (p) => {
				setForm((prev) => ({
					...prev,
					...p
				}));
			};
			const buildServer = () => {
				if (form.mode === "json") try {
					return JSON.parse(form.json);
				} catch (e) {
					setMsg("JSON 解析失败：" + String(e?.message || e));
					return null;
				}
				const server = {
					name: form.name.trim(),
					transport: form.transport,
					enabled: true
				};
				if (form.transport === "stdio") {
					server.command = form.command.trim();
					server.args = form.args.split(/\n/).map((l) => l.trim()).filter((l) => l !== "");
					server.cwd = form.cwd.trim();
					server.env = parseKv(form.env);
				} else {
					server.url = form.url.trim();
					server.headers = parseKv(form.headers);
				}
				return server;
			};
			const save = (server) => {
				if (!server) return;
				setBusy("save");
				setMsg("");
				api.saveMcp(server).then(() => {
					setBusy("");
					setMsg("已保存 " + server.name);
					setForm(EMPTY_FORM);
					load();
				}).catch((e) => {
					setBusy("");
					setMsg(String(e?.message || e));
				});
			};
			const toggle = (s) => {
				setMsg("");
				api.setMcpEnabled(s.name, !s.enabled).then(() => {
					load();
				}).catch((e) => {
					setMsg(String(e?.message || e));
				});
			};
			const remove = (s) => {
				if (confirmDel !== s.name) {
					setConfirmDel(s.name);
					return;
				}
				setConfirmDel(null);
				setMsg("");
				api.deleteMcp(s.name).then(() => {
					load();
				}).catch((e) => {
					setMsg(String(e?.message || e));
				});
			};
			const edit = (s) => {
				setForm({
					name: s.name,
					transport: s.transport || "stdio",
					command: s.command || "",
					args: (s.args || []).join("\n"),
					env: kvText(s.env),
					cwd: s.cwd || "",
					url: s.url || "",
					headers: kvText(s.headers),
					mode: "form",
					json: JSON.stringify(s, null, 2)
				});
				setConfirmDel(null);
			};
			const test = (server) => {
				if (!server) return;
				setBusy("test");
				setMsg("");
				api.testMcp(server).then((r) => {
					setBusy("");
					setMsg(r.ok ? "连接成功" : "连接失败：" + (r.error || "unknown error"));
				}).catch((e) => {
					setBusy("");
					setMsg(String(e?.message || e));
				});
			};
			const statusLabel = {
				connecting: "连接中",
				running: "运行中",
				failed: "失败",
				stopped: "已停止"
			};
			const mq = query.trim().toLowerCase();
			const filteredServers = list.servers.filter((s) => mq === "" || s.name.toLowerCase().includes(mq));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_default.panel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.inline,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: settings_card_module_default.hGrow,
								children: "MCP 服务器"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: settings_card_module_default.inputGrow,
								placeholder: "搜索服务器名称…",
								value: query,
								onChange: (e) => {
									setQuery(e.target.value);
								}
							})]
						}),
						msg ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.error,
							children: msg
						}) : null,
						list.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.error,
							children: list.error
						}) : null,
						list.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: "加载中…" }) : filteredServers.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: list.servers.length === 0 ? "尚未配置任何 MCP 服务器" : "没有匹配的服务器" }) : filteredServers.map((s) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.row,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: settings_card_module_default.main,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: settings_card_module_default.name,
											children: [
												s.name,
												s.enabled ? "" : " （已禁用）",
												" ",
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: settings_card_module_default.status,
													children: statusLabel[s.status] || s.status
												})
											]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: settings_card_module_default.desc,
											children: [s.transport, s.transport === "stdio" ? " · " + (s.command || "") : " · " + (s.url || "")]
										}),
										s.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: settings_card_module_default.error,
											children: s.error
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: settings_card_module_default.switch,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										type: "checkbox",
										checked: s.enabled,
										onChange: () => {
											toggle(s);
										}
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: s.enabled ? "启用" : "禁用" })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_default.btn,
									onClick: () => {
										edit(s);
									},
									children: "编辑"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_default.btnDanger,
									onClick: () => {
										remove(s);
									},
									children: confirmDel === s.name ? "确认删除?" : "删除"
								})
							]
						}, s.name))
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.h,
							children: "新建 / 编辑服务器"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.inline,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: form.mode === "form" ? settings_card_module_default.btnActive : settings_card_module_default.btn,
								onClick: () => {
									patch({ mode: "form" });
								},
								children: "表单"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: form.mode === "json" ? settings_card_module_default.btnActive : settings_card_module_default.btn,
								onClick: () => {
									patch({ mode: "json" });
								},
								children: "JSON"
							})]
						}),
						form.mode === "form" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.form,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "名称 name",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: settings_card_module_default.input,
										value: form.name,
										placeholder: "例如 github",
										onChange: (e) => {
											patch({ name: e.target.value });
										}
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "传输 transport",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: settings_card_module_default.input,
										value: form.transport,
										onChange: (e) => {
											patch({ transport: e.target.value });
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "stdio",
											children: "stdio"
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "streamable-http",
											children: "streamable-http"
										})]
									})
								}),
								form.transport === "stdio" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "命令 command",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: settings_card_module_default.input,
											value: form.command,
											placeholder: "npx",
											onChange: (e) => {
												patch({ command: e.target.value });
											}
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "参数 args（每行一个）",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: settings_card_module_default.input,
											rows: 2,
											value: form.args,
											placeholder: "-y\n@modelcontextprotocol/server-github",
											onChange: (e) => {
												patch({ args: e.target.value });
											}
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "环境变量 env（KEY=VALUE 每行一个）",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
											className: settings_card_module_default.input,
											rows: 2,
											value: form.env,
											onChange: (e) => {
												patch({ env: e.target.value });
											}
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
										label: "工作目录 cwd",
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											className: settings_card_module_default.input,
											value: form.cwd,
											onChange: (e) => {
												patch({ cwd: e.target.value });
											}
										})
									})
								] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "URL",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
										className: settings_card_module_default.input,
										value: form.url,
										placeholder: "http://localhost:3000/mcp",
										onChange: (e) => {
											patch({ url: e.target.value });
										}
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Field, {
									label: "请求头 headers（KEY=VALUE 每行一个）",
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										className: settings_card_module_default.input,
										rows: 2,
										value: form.headers,
										onChange: (e) => {
											patch({ headers: e.target.value });
										}
									})
								})] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: settings_card_module_default.inline,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: settings_card_module_default.btnPrimary,
										disabled: busy === "save",
										onClick: () => {
											save(buildServer());
										},
										children: busy === "save" ? "保存中…" : "保存"
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: settings_card_module_default.btn,
										disabled: busy === "test",
										onClick: () => {
											test(buildServer());
										},
										children: busy === "test" ? "测试中…" : "测试连接"
									})]
								})
							]
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_default.form,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: settings_card_module_default.inputMono,
								rows: 12,
								value: form.json,
								placeholder: "{\n  \"name\": \"github\",\n  \"transport\": \"stdio\",\n  \"command\": \"npx\",\n  \"args\": [\"-y\", \"@modelcontextprotocol/server-github\"],\n  \"enabled\": true\n}",
								onChange: (e) => {
									patch({ json: e.target.value });
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: settings_card_module_default.btnPrimary,
								disabled: busy === "save",
								onClick: () => {
									save(buildServer());
								},
								children: busy === "save" ? "保存中…" : "保存"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: settings_card_module_default.desc,
							children: "配置持久化到 ~/.dsh/mcp.json；启用的服务器经 @deepseek-ai/dsh-mcp-client 真实连接并把工具注册为 mcp__<server>__<tool>。"
						})
					]
				})]
			});
		}
		function Field(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
				className: settings_card_module_default.fieldLabel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: settings_card_module_default.fieldName,
					children: props.label
				}), props.children]
			});
		}
		//#endregion
		//#region src/client/SettingsCard.tsx
		/**
		* Render the settings section content.
		* @param props - locale copy, the shell's close action, and the picker helper.
		* @returns the section page.
		*/
		function SkillsMcpSection(props) {
			const { t } = props;
			const cwd = props.useWorkspaces((s) => {
				const items = s && s.items || [];
				const ws = items.find((w) => w.workspaceId === s.recentWorkspaceId) || items[0];
				return ws ? ws.path : "";
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_default.sectionPage,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
						className: settings_card_module_default.pageHeading,
						children: t("title")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_default.pageIntro,
						children: t("description")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillsMcpManager, {
						cwd,
						enabled: true,
						pickDirectory: props.pickDirectory
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Locale namespace this plugin owns. */
		const NS = "skills-mcp-manager";
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = [
			"slots",
			"workspaces",
			"locale"
		];
		/**
		* Mount the settings page.
		* @param ctx - client root context (slots, workspaces, locale).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "skills-mcp-manager: dictionaries");
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skills-mcp",
				order: 20,
				label: () => ctx.locale.bind(NS)("title"),
				locale: NS,
				inject: () => ({ pickDirectory: () => ctx.workspaces.pickDirectory() })
			}, SkillsMcpSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		
		return module.exports;
	}
});
