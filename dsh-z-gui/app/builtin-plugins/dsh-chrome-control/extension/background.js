/**
 * DSH Chrome Control - background service worker
 *
 * 把扩展做成「dsh web /chrome/ws 的客户端 + Chrome 的 CDP 执行器」：
 *   - DSHClient：WebSocket 连 dsh web（帧协议 hello/pong/tool_request/tool_result）
 *   - CDPBridge：chrome.debugger 封装（attach/command/事件）
 *   - ToolExecutor：把 25 个 mcp__chrome__* 工具翻译成 CDP 命令
 *   - Sessions：任务会话 → 标签页集合（可选标签组）
 *
 * 安全：popup 的 Allow agent control 开关（state.enabled）是总闸，关闭即断开 WS。
 */
'use strict'

const EXT_VERSION = '0.4.0'
const DEFAULT_SERVER = 'http://127.0.0.1:3080'
const WS_PATH = '/chrome/ws'
const CDP_VERSION = '1.3'
const TOOL_HARD_LIMIT_MS = 120e3 // 单工具执行硬上限（防止对话框等永久阻塞）
const MAX_WAIT_FOR_SELECTOR_MS = 15e3
const SNAPSHOT_TEXT_CAP = 40
const SNAPSHOT_VALUE_CAP = 60

/**
 * 页面级 alert/confirm/prompt 拦截器。
 * chrome.debugger 在原生 JS 对话框打开时会让该 tab 的所有命令挂起（架构限制），
 * 因此在页面 realm 直接替换原生对话框：不弹模态框、不阻塞页面，
 * 记录到 window.__dshDialogRec 供 dialog 工具读取。
 */
const DIALOG_HOOK = `(() => {
  if (window.__dshDialogHooked) return;
  window.__dshDialogHooked = true;
  const rec = { type: null, message: '', promptResult: null };
  Object.defineProperty(window, '__dshDialogRec', { value: rec, writable: true, configurable: true });
  const alert = window.alert, confirm = window.confirm, prompt = window.prompt;
  window.alert = (m) => { rec.type = 'alert'; rec.message = String(m); };
  window.confirm = (m) => { rec.type = 'confirm'; rec.message = String(m); return true; };
  window.prompt = (m, d) => { rec.type = 'prompt'; rec.message = String(m); return rec.promptResult; };
})()`

const state = {
  enabled: false,
  serverUrl: '',
  ws: null,
  reconnectTimer: null,
  reconnectDelay: 1000,
  pending: new Map(), // requestId -> { resolve, reject }
  sessions: new Map(), // session name -> { tabs: number[], current: number|null, groupId: number|null }
  refs: new Map(), // tabId -> Array<{ ref: string, path: number[] }>
  lastOutline: new Map(), // tabId -> string[] (lines of last snapshot, for diff)
  netLogs: new Map(), // tabId -> request records
  netTabs: new Set(), // tabs with Network.enable on
  dialogs: new Map(), // tabId -> { message, type }
}

// ---------------------------------------------------------------- helpers

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function sendFrame(frame) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(frame))
    return true
  }
  return false
}

function cdp(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (res) => {
      const e = chrome.runtime.lastError
      if (e) reject(new Error(e.message))
      else resolve(res || {})
    })
  })
}

function attachDebugger(tabId) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach({ tabId }, CDP_VERSION, () => {
      const e = chrome.runtime.lastError
      if (e && !/already attached/i.test(e.message)) {
        reject(new Error(e.message))
        return
      }
      // 启用事件域：Page（dialog 拦截）与 Network（请求记录），attach 后即开始记录
      Promise.all([
        cdp(tabId, 'Page.enable').catch(() => undefined),
        cdp(tabId, 'Network.enable').catch(() => undefined),
        cdp(tabId, 'Page.addScriptToEvaluateOnNewDocument', { source: DIALOG_HOOK }).catch(() => undefined),
      ]).then(() => {
        state.netTabs.add(tabId)
        // 当前已加载的文档立即注入一次（新导航由 addScriptToEvaluateOnNewDocument 覆盖）
        pageEval(tabId, DIALOG_HOOK).catch(() => undefined)
        resolve()
      }).catch((err) => reject(err))
    })
  })
}

function detachDebugger(tabId) {
  chrome.debugger.detach({ tabId }, () => { /* ignore */ })
}

// 在页面 realm 执行表达式，返回 value（awaitPromise + returnByValue）
async function pageEval(tabId, expression) {
  const r = await cdp(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) {
    throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'page eval error'))
  }
  return r.result?.value
}

// 等待页面 load（document.readyState === 'complete'）
async function waitForLoad(tabId, timeoutMs = 15e3) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const ready = await pageEval(tabId, 'document.readyState')
      if (ready === 'complete') return
    } catch { /* navigation in flight */ }
    if (Date.now() > deadline) return
    await sleep(200)
  }
}

// 把 @eN ref（或 CSS selector）解析成元素路径（children 索引序列）
async function resolvePath(tabId, refOrSelector) {
  if (typeof refOrSelector === 'string' && refOrSelector.startsWith('@e')) {
    const list = state.refs.get(tabId) || []
    const hit = list.find((r) => r.ref === refOrSelector)
    if (!hit) throw new Error('stale ref — take a new snapshot')
    return hit.path
  }
  // CSS selector：在同一次注入里返回路径
  return pageEval(tabId, `(() => {
    const el = document.querySelector(${JSON.stringify(refOrSelector)});
    if (!el) return null;
    const path = [];
    for (let n = el; n && n.parentElement; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n));
    return path;
  })()`)
}

// 按路径取元素中心点（scrollIntoView 后），供 trusted 输入
async function elementCenter(tabId, path) {
  const v = await pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) {
      if (!n || !n.children || i >= n.children.length) return null;
      n = n.children[i];
    }
    if (!n) return null;
    n.scrollIntoView({ block: 'center', inline: 'center' });
    const r = n.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return { error: 'zero-size' };
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), tag: n.tagName };
  })()`)
  return v
}

// ---------------------------------------------------------------- DSHClient

function wsUrl() {
  const base = String(state.serverUrl || DEFAULT_SERVER).replace(/\/+$/, '')
  const qIndex = base.indexOf('?')
  const clean = (qIndex === -1 ? base : base.slice(0, qIndex)).replace(/\/+$/, '')
  const query = qIndex === -1 ? '' : base.slice(qIndex + 1)
  return clean.replace(/^http/, 'ws') + WS_PATH + (query ? '?' + query : '')
}

function connect() {
  if (!state.enabled) return
  if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return
  let ws
  try {
    ws = new WebSocket(wsUrl())
  } catch {
    scheduleReconnect()
    return
  }
  state.ws = ws
  ws.onopen = () => {
    state.reconnectDelay = 1000
    sendFrame({ type: 'hello', payload: { extensionVersion: EXT_VERSION } })
  }
  ws.onerror = () => { try { ws.close() } catch { /* noop */ } }
  ws.onmessage = (ev) => {
    let frame
    try { frame = JSON.parse(String(ev.data)) } catch { return }
    if (frame.type === 'ping') { sendFrame({ type: 'pong' }); return }
    if (frame.type === 'tool_request') {
      const reqId = frame.requestId
      const { tool, params } = frame.payload || {}
      const timer = setTimeout(() => {
        state.pending.delete(reqId)
        sendFrame({ type: 'tool_result', responseToRequestId: reqId, payload: { error: `tool "${tool}" exceeded ${TOOL_HARD_LIMIT_MS}ms` } })
      }, TOOL_HARD_LIMIT_MS)
      Promise.resolve()
        .then(() => executeTool(tool, params || {}))
        .then((data) => {
          clearTimeout(timer)
          sendFrame({ type: 'tool_result', responseToRequestId: reqId, payload: { data } })
        })
        .catch((error) => {
          clearTimeout(timer)
          sendFrame({ type: 'tool_result', responseToRequestId: reqId, payload: { error: error instanceof Error ? error.message : String(error) } })
        })
    }
  }
  ws.onclose = () => {
    if (state.ws === ws) state.ws = null
    scheduleReconnect()
  }
  ws.onerror = () => { try { ws.close() } catch { /* noop */ } }
}

function scheduleReconnect() {
  if (!state.enabled) return
  if (state.reconnectTimer) clearTimeout(state.reconnectTimer)
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30e3)
    connect()
  }, state.reconnectDelay)
}

// ---------------------------------------------------------------- Sessions

function getSession(name) {
  let s = state.sessions.get(name)
  if (!s) {
    s = { tabs: [], current: null, groupId: null }
    state.sessions.set(name, s)
  }
  return s
}

function sessionByTab(tabId) {
  for (const [name, s] of state.sessions) {
    if (s.tabs.includes(tabId)) return { name, s }
  }
  return null
}

async function groupTabs(session, title) {
  if (session.groupId === null) {
    try {
      const gid = await chrome.tabs.group({ tabIds: session.tabs })
      session.groupId = gid
      await chrome.tabGroups.update(gid, { title: title || 'dsh' })
    } catch { session.groupId = null }
  }
}

function forgetTab(tabId) {
  state.refs.delete(tabId)
  state.lastOutline.delete(tabId)
  state.netLogs.delete(tabId)
  state.netTabs.delete(tabId)
  state.dialogs.delete(tabId)
  const hit = sessionByTab(tabId)
  if (hit) {
    hit.s.tabs = hit.s.tabs.filter((t) => t !== tabId)
    if (hit.s.current === tabId) hit.s.current = hit.s.tabs[0] || null
    if (hit.s.tabs.length === 0) state.sessions.delete(hit.name)
  }
}

// 会话内的当前标签页；不存在则用第一个
async function currentTab(session) {
  if (session.current !== null && session.tabs.includes(session.current)) return session.current
  const t = session.tabs[0]
  if (t !== void 0) { session.current = t; return t }
  throw new Error('no tab in session; call navigate first')
}

// 确保 debugger 已 attach（页面工具需要）
async function ensureDebugger(tabId) {
  await attachDebugger(tabId)
}

// ---------------------------------------------------------------- Outline 注入脚本

const OUTLINE_SNIPPET = `(() => {
  const MODE = __MODE__;
  const MAXD = __MAXD__;
  const SEL = __SEL__;
  const root = SEL ? document.querySelector(SEL) : document.body;
  if (!root) return { error: 'root not found' };
  const lines = [];
  const refs = [];
  const cap = (s, n) => { s = String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  const roleOf = (el) => {
    const aria = el.getAttribute('role');
    if (aria) return aria;
    const t = el.tagName;
    if (t === 'A' && el.href) return 'link';
    if (t === 'BUTTON' || t === 'SELECT') return t.toLowerCase();
    if (t === 'INPUT') return el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : el.type === 'file' ? 'file' : 'textbox';
    if (t === 'TEXTAREA') return 'textbox';
    if (el.isContentEditable) return 'textbox';
    if (el.hasAttribute('tabindex')) return 'button';
    return t.toLowerCase();
  };
  const interactive = (el) => ['button','a','input','textarea','select','checkbox','radio','combobox','textbox','file','link','summary','option'].includes(roleOf(el)) || el.isContentEditable || el.hasAttribute('role');
  const visible = (el) => {
    if (!el.getClientRects().length) return false;
    const st = getComputedStyle(el);
    return st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0';
  };
  const walk = (el, depth, path) => {
    if (MAXD >= 0 && depth > MAXD) return;
    if (el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') return;
    const role = roleOf(el);
    const isInter = interactive(el);
    if (MODE !== 'text' && (isInter || role === 'heading' || tag === 'img' || tag === 'td' || tag === 'th' || tag === 'li')) {
      if (MODE === 'interactive' && !(isInter || ['heading','img','td','th','li'].includes(role)) && tag !== 'li') return;
      const visibleFlag = visible(el);
      if (!visibleFlag && !isInter) return;
      let line = '';
      let ref = null;
      if (isInter) {
        ref = '@e' + refs.length;
        refs.push({ ref, path });
        line += ref + ' ';
      }
      line += role;
      const label = el.getAttribute('aria-label') || el.title || (el.tagName === 'IMG' ? el.alt : '') || (el.closest('label') ? el.closest('label').innerText : '') || el.textContent;
      const txt = cap(label, ${SNAPSHOT_TEXT_CAP});
      if (txt) line += ' ' + JSON.stringify(txt);
      if ((tag === 'input' || tag === 'textarea') && el.value) line += ' val=' + JSON.stringify(cap(el.value, ${SNAPSHOT_VALUE_CAP}));
      if (el.type === 'checkbox' || el.type === 'radio') line += ' [' + (el.checked ? 'x' : ' ') + ']';
      if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') line += ' -';
      if (document.activeElement === el) line += ' *';
      lines.push(' '.repeat(depth * 2) + line);
    } else if (MODE === 'text' && role === 'heading') {
      lines.push(' '.repeat(depth * 2) + role + ' ' + JSON.stringify(cap(el.textContent, ${SNAPSHOT_TEXT_CAP})));
    }
    for (let i = 0; i < el.children.length; i++) walk(el.children[i], depth + 1, path.concat(i));
  };
  walk(root, 0, []);
  return { lines, refs, count: refs.length };
})()`

async function doSnapshot(tabId, params) {
  const mode = params.mode || 'interactive'
  const maxDepth = typeof params.maxDepth === 'number' ? params.maxDepth : -1
  const selector = params.selector || ''
  const expr = OUTLINE_SNIPPET
    .replace('__MODE__', JSON.stringify(mode))
    .replace('__MAXD__', String(maxDepth))
    .replace('__SEL__', JSON.stringify(selector))
  const r = await pageEval(tabId, expr)
  if (!r || r.error) throw new Error(r?.error || 'snapshot failed')
  // 新 refs 表（selector 作用域内重建；diff 模式也发布全量 refs）
  const list = state.refs.get(tabId) || []
  if (selector) {
    list.length = 0
    list.push(...(r.refs || []))
  } else {
    state.refs.set(tabId, r.refs || [])
  }
  let lines = r.lines || []
  if (params.diff) {
    const prev = state.lastOutline.get(tabId)
    state.lastOutline.set(tabId, lines)
    if (prev) {
      const out = []
      for (const l of lines) {
        if (!prev.includes(l)) out.push('[+] ' + l)
        else out.push('    ' + l)
      }
      const removed = prev.filter((l) => !lines.includes(l)).length
      if (removed) out.push('# removed: ' + removed)
      lines = out
    } else {
      lines = lines.map((l) => '[+] ' + l)
    }
  } else {
    state.lastOutline.set(tabId, lines)
  }
  return { outline: lines.join('\n'), refs: r.count }
}

// ---------------------------------------------------------------- ToolExecutor

async function navigateTool(session, p) {
  let tabId
  const reuse = !p.newTab && session.current !== null && session.tabs.includes(session.current)
  if (reuse) {
    tabId = session.current
    await chrome.tabs.update(tabId, { url: p.url })
  } else {
    // 先建空白标签并挂接 debugger（Network.enable 生效）再导航，确保能记录页面早期请求
    const t = await chrome.tabs.create({ url: 'about:blank' })
    tabId = t.id
    session.tabs.push(tabId)
    session.current = tabId
    await ensureDebugger(tabId)
    await chrome.tabs.update(tabId, { url: p.url })
  }
  await waitForLoad(tabId)
  if (p.group_title) await groupTabs(session, p.group_title)
  return { tabId, url: p.url }
}

async function snapshotTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  return doSnapshot(tabId, p)
}

async function findTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const q = p.query
  const expr = `(() => {
    const q = ${JSON.stringify(q)}.toLowerCase();
    const cands = [...document.querySelectorAll('button,a[href],input,textarea,select,[role=button],[role=combobox],[contenteditable],[aria-label],[placeholder]')]
      .filter((el) => {
        const t = ((el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') + ' ' + (el.value || '')).toLowerCase();
        return t.includes(q);
      })
      .slice(0, 8);
    return cands.map((el) => {
      const path = [];
      for (let n = el; n && n.parentElement; n = n.parentElement) path.unshift([...n.parentElement.children].indexOf(n));
      return path;
    });
  })()`
  const paths = (await pageEval(tabId, expr)) || []
  const list = state.refs.get(tabId) || []
  const out = []
  for (const path of paths) {
    const existing = list.find((r) => JSON.stringify(r.path) === JSON.stringify(path))
    const ref = existing ? existing.ref : '@e' + list.length
    if (!existing) {
      list.push({ ref, path })
      state.refs.set(tabId, list)
    }
    out.push(ref)
  }
  return { refs: out }
}

async function clickTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('click needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  if (p.trusted) {
    const c = await elementCenter(tabId, path)
    if (c && c.error) throw new Error('not safely clickable: ' + c.error)
    if (!c) throw new Error('stale ref — take a new snapshot')
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 })
    await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 })
    return { trusted: true }
  }
  // 合成完整 pointer stroke（多数框架接受）
  const ok = await pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return false; n = n.children[i]; }
    if (!n) return false;
    const opts = { bubbles: true, cancelable: true, composed: true };
    const seq = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    for (const type of seq) n.dispatchEvent(new (type.startsWith('mouse') ? MouseEvent : PointerEvent)(type, opts));
    return true;
  })()`)
  if (!ok) throw new Error('stale ref — take a new snapshot')
  return { synthetic: true }
}

async function fillTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('fill needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  const value = String(p.value)
  // 1) 页面 realm：定位元素并聚焦（内容由 CDP trusted 输入写入，兼容 React/Vue/AI 融合输入框）
  const info = await pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return { error: 'stale' }; n = n.children[i]; }
    if (!n) return { error: 'stale' };
    if (n.readOnly) return { error: 'readonly — use select for dropdowns' };
    if (n.tagName === 'SELECT') return { error: 'use select for dropdowns' };
    n.focus();
    if (n.isContentEditable) n.focus();
    return { ok: true, editable: n.isContentEditable, tag: n.tagName };
  })()`)
  if (!info) throw new Error('element not found: ' + target)
  if (info.error) throw new Error(info.error)
  // 2) trusted 输入：Ctrl+A 全选后插入新值
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
  await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2, windowsVirtualKeyCode: 65 })
  await cdp(tabId, 'Input.insertText', { text: value })
  // 3) 验证（优先用 CSS selector 重定位，AI 融合输入框会在输入后重构 DOM 使 path 失效）
  const v = await pageEval(tabId, `(() => {
    const sel = ${JSON.stringify(p.selector || null)};
    let n = sel ? document.querySelector(sel) : null;
    if (!n) {
      let c = document.documentElement;
      for (const i of ${JSON.stringify(path)}) { if (!c || !c.children || i >= c.children.length) return null; c = c.children[i]; }
      n = c;
    }
    if (!n) return null;
    const got = n.value !== undefined ? n.value : n.textContent;
    return { verified: got === ${JSON.stringify(value)}, value: got };
  })()`)
  if (v && v.error) throw new Error(v.error)
  return v
}

async function selectTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('select needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  return pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return { error: 'stale' }; n = n.children[i]; }
    if (!n) return { error: 'stale' };
    const wantValue = ${JSON.stringify(p.value || '')};
    const wantText = ${JSON.stringify(p.text || '')};
    if (n.tagName === 'SELECT') {
      let chosen = null;
      for (const o of n.options) {
        if (wantValue && o.value === wantValue) { chosen = o; break; }
        if (wantText && (o.text === wantText || o.text.includes(wantText))) { chosen = o; break; }
      }
      if (!chosen) return { error: 'no matching option; options: ' + [...n.options].map((o) => o.text).join(', ') };
      n.value = chosen.value;
      n.dispatchEvent(new Event('input', { bubbles: true }));
      n.dispatchEvent(new Event('change', { bubbles: true }));
      return { verified: n.value === chosen.value, value: n.value };
    }
    // ARIA combobox：找到 option 容器
    const popup = n.getAttribute('aria-expanded') === 'true'
      ? document.querySelector('[role=listbox]')
      : null;
    const listbox = popup || (n.closest('[role=combobox]') ? document.querySelector('[role=listbox]') : null);
    const targets = listbox ? [...listbox.querySelectorAll('[role=option]')] : [];
    const opt = targets.find((o) => (wantValue && o.value === wantValue) || (wantText && (o.textContent === wantText || o.textContent.includes(wantText)))) || null;
    if (!opt) return { error: 'no matching option' };
    opt.click();
    return { verified: true };
  })()`)
}

async function evaluateTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const r = await cdp(tabId, 'Runtime.evaluate', {
    expression: p.expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) {
    throw new Error(String(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate error'))
  }
  return { value: r.result?.value }
}

async function screenshotTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const params = { format: p.format === 'jpeg' ? 'jpeg' : 'png' }
  if (p.format === 'jpeg' && p.quality) params.quality = p.quality
  const r = await cdp(tabId, 'Page.captureScreenshot', params)
  return { data: r.data || '', mime: params.format === 'jpeg' ? 'image/jpeg' : 'image/png' }
}

async function saveAsPdfTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const r = await cdp(tabId, 'Page.printToPDF', {})
  return { data: r.data || '', mime: 'application/pdf' }
}

async function getTextTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const raw = !!p.raw
  const maxChars = typeof p.maxChars === 'number' ? p.maxChars : 20000
  let text = await pageEval(tabId, `(() => {
    if (${raw}) return document.body ? document.body.innerText : '';
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,nav,header,footer,aside,[role=banner],[role=navigation],[aria-label*=cookie i],[id*=cookie i]').forEach((el) => el.remove());
    return clone.innerText;
  })()`)
  text = String(text || '')
  const truncated = text.length > maxChars
  if (truncated) text = text.slice(0, maxChars)
  return { text, truncated }
}

async function scrollTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const expr = p.selector
    ? `(() => {
        const el = document.querySelector(${JSON.stringify(p.selector)});
        if (!el) return { error: 'not found' };
        const px = ${Number(p.pixels) || 0} || ${p.direction === 'up' ? -1 : 1} * Math.round(el.clientHeight * 0.8);
        el.scrollBy({ top: ${Number(p.deltaY) || 0} || px, behavior: 'instant' });
        const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
        return { moved: true, atEnd };
      })()`
    : `(() => {
        const px = ${Number(p.pixels) || 0} || ${p.direction === 'up' ? -1 : 1} * Math.round(window.innerHeight * 0.8);
        window.scrollBy({ top: ${Number(p.deltaY) || 0} || px, behavior: 'instant' });
        const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2;
        return { moved: true, atEnd };
      })()`
  const r = await pageEval(tabId, expr)
  if (r && r.error) throw new Error(r.error)
  return r
}

async function scrollIntoViewTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('scroll_into_view needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  return pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return null; n = n.children[i]; }
    if (!n) return null;
    n.scrollIntoView({ block: 'center', inline: 'center' });
    const r = n.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  })()`)
}

async function focusTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('focus needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  await pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return false; n = n.children[i]; }
    if (!n) return false;
    n.focus();
    return true;
  })()`)
  return { focused: true }
}

async function hoverTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('hover needs a ref or selector')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  const c = await elementCenter(tabId, path)
  if (!c) throw new Error('stale ref — take a new snapshot')
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y })
  return { hovered: true }
}

async function mouseClickTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  let x = p.x
  let y = p.y
  if (p.selector) {
    const path = await resolvePath(tabId, p.selector)
    const c = await elementCenter(tabId, path)
    if (!c) throw new Error('element not found: ' + p.selector)
    x = c.x; y = c.y
  }
  if (typeof x !== 'number' || typeof y !== 'number') throw new Error('mouse_click needs selector or x/y')
  const button = p.button === 'right' ? 'right' : p.button === 'middle' ? 'middle' : 'left'
  const clickCount = p.clickCount || 1
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount })
  await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount })
  return { x, y, button }
}

async function keyTypeTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  await cdp(tabId, 'Input.insertText', { text: String(p.text) })
  return { typed: String(p.text).length }
}

const KEY_MAP = {
  enter: 'Enter', escape: 'Escape', tab: 'Tab', backspace: 'Backspace', delete: 'Delete',
  space: ' ', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
}
const MODS = ['Control', 'Alt', 'Shift', 'Meta']
// CDP Input.dispatchKeyEvent 的 modifiers 是 int32 位掩码（Alt=1 Ctrl=2 Meta=4 Shift=8）
const MOD_MASK = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }

async function sendKeysTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const parts = String(p.keys || '').split('+').map((s) => s.trim())
  const mods = []
  let key = null
  for (const part of parts) {
    const m = MODS.find((x) => x.toLowerCase() === part.toLowerCase())
    if (m) { mods.push(m); continue }
    key = KEY_MAP[part.toLowerCase()] || part
  }
  const k = key || 'Enter'
  const modMask = mods.reduce((acc, m) => acc | (MOD_MASK[m] || 0), 0)
  const code = k.length === 1 ? 'Key' + k.toUpperCase() : k
  const base = { key: k, code, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : 13 }
  for (const m of mods) {
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', key: m, code: m, modifiers: modMask })
  }
  await cdp(tabId, 'Input.dispatchKeyEvent', { ...base, type: 'keyDown', modifiers: modMask })
  await cdp(tabId, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp', modifiers: modMask })
  for (const m of [...mods].reverse()) {
    await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', key: m, code: m, modifiers: modMask })
  }
  return { key: k, modifiers: mods }
}

async function waitTool(session, p) {
  const ms = Math.max(0, Math.min(Number(p.ms) || 0, 3000))
  await sleep(ms)
  return { waitedMs: ms }
}

async function waitForSelectorTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const hidden = p.state === 'hidden'
  const timeout = Math.min(Number(p.timeout) || MAX_WAIT_FOR_SELECTOR_MS, MAX_WAIT_FOR_SELECTOR_MS)
  const deadline = Date.now() + timeout
  for (;;) {
    const found = await pageEval(tabId, `(() => {
      const el = document.querySelector(${JSON.stringify(p.selector)});
      if (!el) return false;
      return !!(el.getClientRects().length && getComputedStyle(el).display !== 'none');
    })()`)
    if (hidden ? !found : found) return { found: true, state: hidden ? 'hidden' : 'visible' }
    if (Date.now() > deadline) throw new Error(hidden ? `element still visible after ${timeout}ms` : `selector not found within ${timeout}ms: ${p.selector}`)
    await sleep(250)
  }
}

async function networkTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const records = state.netLogs.get(tabId) || []
  const filtered = records.filter((r) => {
    if (p.method && r.method !== p.method) return false
    if (p.status && r.status !== p.status) return false
    if (p.url && !r.url.includes(p.url)) return false
    return true
  })
  return { requests: filtered }
}

async function networkDetailTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const records = state.netLogs.get(tabId) || []
  const rec = records.find((r) => r.requestId === p.requestId)
  if (!rec) throw new Error('requestId not found: ' + p.requestId)
  const out = { requestId: rec.requestId, method: rec.method, url: rec.url, status: rec.status, headers: rec.requestHeaders || {} }
  if (p.body) {
    try {
      const b = await cdp(tabId, 'Network.getResponseBody', { requestId: rec.requestId })
      out.body = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body
    } catch { out.body = null }
  }
  return out
}

async function dialogTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  // 对话框已被页面级拦截器捕获，读取记录（不弹原生框、不阻塞页面）
  const rec = await pageEval(tabId, `(() => {
    const r = window.__dshDialogRec;
    if (!r || !r.type) return null;
    const out = { type: r.type, message: r.message };
    r.type = null; r.message = '';
    return out;
  })()`)
  if (!rec) throw new Error('no dialog is open on this tab')
  // confirm 默认 accept（拦截器返回 true）；prompt 需要文本时无法重放，返回其当前结果
  return { action: p.action, type: rec.type, message: rec.message, autoHandled: true }
}

async function listTabsTool(session) {
  const out = []
  for (const t of session.tabs) {
    const tab = await chrome.tabs.get(t).catch(() => null)
    if (tab) out.push({ tabId: t, url: tab.url, title: tab.title, current: session.current === t })
  }
  return { tabs: out }
}

async function findTabTool(session, p) {
  if (p.active) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab || tab.id === void 0) throw new Error('no active tab')
    if (!session.tabs.includes(tab.id)) session.tabs.push(tab.id)
    session.current = tab.id
    await ensureDebugger(tab.id)
    return { tabId: tab.id, url: tab.url, borrowed: true }
  }
  if (p.url) {
    const found = session.tabs.find((t) => t !== session.current)
    for (const t of session.tabs) {
      const tab = await chrome.tabs.get(t).catch(() => null)
      if (tab && tab.url && tab.url.includes(p.url)) {
        session.current = t
        return { tabId: t, url: tab.url }
      }
    }
    throw new Error('no tab matching url in session: ' + p.url)
  }
  return { tabs: (await listTabsTool(session)).tabs }
}

async function closeTabTool(session, p) {
  let target = null
  if (p.tab_id) target = session.tabs.find((t) => String(t) === String(p.tab_id))
  else if (p.url) {
    for (const t of session.tabs) {
      const tab = await chrome.tabs.get(t).catch(() => null)
      if (tab && tab.url && tab.url.includes(p.url)) { target = t; break }
    }
  }
  if (target === null) throw new Error('no matching tab in session')
  await chrome.tabs.remove(target).catch(() => { /* already closed */ })
  return { closed: target }
}

async function closeSessionTool(session) {
  const tabs = [...session.tabs]
  for (const t of tabs) {
    detachDebugger(t)
    await chrome.tabs.remove(t).catch(() => { /* already closed */ })
  }
  state.sessions.delete(session.name)
  return { closed: tabs.length }
}

async function uploadTool(session, p) {
  const tabId = await currentTab(session)
  await ensureDebugger(tabId)
  const target = p.ref || p.selector
  if (!target) throw new Error('upload needs a ref or selector')
  const files = (Array.isArray(p.paths) ? p.paths : [p.paths]).filter((f) => typeof f === 'string')
  if (!files.length) throw new Error('upload needs paths')
  const path = await resolvePath(tabId, target)
  if (!path) throw new Error('element not found: ' + target)
  // 标记文件输入（支持 ref 指向可见 trigger：沿 label/表单关联查找）
  const marked = await pageEval(tabId, `(() => {
    let n = document.documentElement;
    for (const i of ${JSON.stringify(path)}) { if (!n || !n.children || i >= n.children.length) return false; n = n.children[i]; }
    if (!n) return false;
    const input = (n.tagName === 'INPUT' && n.type === 'file') ? n
      : n.querySelector('input[type=file]')
        || (n.closest('form') ? n.closest('form').querySelector('input[type=file]') : null)
        || (n.id ? document.querySelector('label[for="' + n.id + '"] ~ input[type=file], input[type=file]#' + n.id) : null);
    if (!input) return false;
    input.setAttribute('data-dsh-upload', '1');
    return true;
  })()`)
  if (!marked) throw new Error('no file input associated with ' + target)
  const doc = await cdp(tabId, 'DOM.getDocument', { depth: -1 })
  const q = await cdp(tabId, 'DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[data-dsh-upload]' })
  if (!q.nodeId) throw new Error('file input not found')
  await cdp(tabId, 'DOM.setFileInputFiles', { nodeId: q.nodeId, files })
  await cdp(tabId, 'DOM.setAttributeValue', { nodeId: q.nodeId, name: 'data-dsh-upload', value: '' })
  return { uploaded: files.length }
}

const HANDLERS = {
  navigate: navigateTool,
  snapshot: snapshotTool,
  click: clickTool,
  fill: fillTool,
  upload: uploadTool,
  evaluate: evaluateTool,
  screenshot: screenshotTool,
  save_as_pdf: saveAsPdfTool,
  mouse_click: mouseClickTool,
  key_type: keyTypeTool,
  send_keys: sendKeysTool,
  hover: hoverTool,
  focus: focusTool,
  select: selectTool,
  scroll: scrollTool,
  scroll_into_view: scrollIntoViewTool,
  find: findTool,
  get_text: getTextTool,
  wait: waitTool,
  wait_for_selector: waitForSelectorTool,
  network: networkTool,
  network_detail: networkDetailTool,
  dialog: dialogTool,
  list_tabs: listTabsTool,
  find_tab: findTabTool,
  close_tab: closeTabTool,
  close_session: closeSessionTool,
}

async function executeTool(tool, params) {
  const handler = HANDLERS[tool]
  if (!handler) throw new Error('unknown tool: ' + tool)
  const session = getSession(String(params.session || 'default'))
  const rest = { ...params }
  delete rest.session
  return handler(session, rest)
}

// ---------------------------------------------------------------- CDP 事件

chrome.debugger.onEvent.addListener((source, method, params) => {
  const tabId = source.tabId
  if (tabId === void 0) return
  if (method === 'Page.javascriptDialogOpening') {
    state.dialogs.set(tabId, { message: params.message || '', type: params.type || '' })
    return
  }
  if (method === 'Page.javascriptDialogClosed') {
    state.dialogs.delete(tabId)
    return
  }
  if (method === 'Network.requestWillBeSent') {
    const list = state.netLogs.get(tabId) || []
    list.push({ requestId: params.requestId, method: params.request.method, url: params.request.url, status: null, requestHeaders: params.request.headers })
    state.netLogs.set(tabId, list)
    return
  }
  if (method === 'Network.responseReceived') {
    const list = state.netLogs.get(tabId) || []
    const rec = list.find((r) => r.requestId === params.requestId)
    if (rec) rec.status = params.response.status
    return
  }
})

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== void 0) {
    state.netTabs.delete(source.tabId)
    state.dialogs.delete(source.tabId)
  }
})

// 标签页关闭时清理会话/引用
chrome.tabs.onRemoved.addListener((tabId) => forgetTab(tabId))

// ---------------------------------------------------------------- 保活与启动

chrome.alarms.create('dsh-chrome-keepalive', { periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dsh-chrome-keepalive') {
    if (state.enabled && state.ws && state.ws.readyState !== WebSocket.OPEN) connect()
  }
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes.enabled) state.enabled = !!changes.enabled.newValue
  if (changes.serverUrl) state.serverUrl = String(changes.serverUrl.newValue || '')
  if (changes.enabled || changes.serverUrl) {
    if (state.ws) { try { state.ws.close() } catch { /* noop */ } }
    state.reconnectDelay = 1000
    connect()
  }
})

async function init() {
  const stored = await chrome.storage.local.get(['enabled', 'serverUrl'])
  state.enabled = !!stored.enabled
  state.serverUrl = String(stored.serverUrl || '')
  connect()
}

init()
