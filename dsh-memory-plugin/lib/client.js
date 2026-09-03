/**
 * dsh-memory-plugin 客户端：在 DSH Web UI「设置」注册一级菜单「记忆与知识库」控制面板。
 *
 * 零构建模式（与 dsh-webhook-plugin / dafeiyu 一致）：
 *  - window.__ModuleLoader__.load 注册浏览器插件包；
 *  - ctx.slots 注入 settings.section 注册一级设置菜单；
 *  - 通过 /plugins/dsh-memory/* 管理 API 读写（Host 侧 webServer 提供）。
 */
window.__ModuleLoader__.load({ id: 'dsh-memory-plugin', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useState } = React
  const API = '/plugins/dsh-memory'

  const s = {
    card: { listStyle: 'none', border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 12, padding: 16, background: 'var(--surface-color, transparent)', display: 'grid', gap: 14 },
    field: { display: 'grid', gap: 4 },
    label: { fontWeight: 600, fontSize: 13 },
    hint: { fontSize: 12, opacity: 0.65, margin: 0 },
    input: { padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color, #d8d8d8)', background: 'var(--field-color, transparent)', color: 'inherit', width: '100%', boxSizing: 'border-box' },
    btn: { padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color, #d8d8d8)', background: 'var(--field-color, transparent)', color: 'inherit', cursor: 'pointer', fontWeight: 600 },
    row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    block: { border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 8, padding: 12, display: 'grid', gap: 8 },
  }

  function Field({ label, hint, children }) {
    return React.createElement('div', { style: s.field },
      React.createElement('span', { style: s.label }, label),
      hint ? React.createElement('p', { style: s.hint }, hint) : null,
      children)
  }

  async function fetchJson(url, options) {
    const res = await fetch(url, {
      cache: 'no-store',
      headers: options && options.body ? { 'content-type': 'application/json' } : {},
      ...options,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  }

  function MemoryCard() {
    const [status, setStatus] = useState('loading')
    const [stats, setStats] = useState(null)
    const [facts, setFacts] = useState([])
    const [documents, setDocuments] = useState([])
    const [config, setConfig] = useState({})
    const [busy, setBusy] = useState(false)
    const [notice, setNotice] = useState('')

    // 事实新增
    const [newContent, setNewContent] = useState('')
    const [newCategory, setNewCategory] = useState('other')
    const [newImportance, setNewImportance] = useState(0.5)
    // 知识库导入 + 检索
    const [importPathValue, setImportPathValue] = useState('')
    const [searchQuery, setSearchQuery] = useState('')
    const [searchHits, setSearchHits] = useState([])

    const show = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 4000) }

    const refresh = async () => {
      try {
        const [st, ft, dc, cfg] = await Promise.all([
          fetchJson(`${API}/stats`),
          fetchJson(`${API}/facts`),
          fetchJson(`${API}/documents`),
          fetchJson(`${API}/config`),
        ])
        setStats(st); setFacts(ft.facts || []); setDocuments(dc.documents || []); setConfig(cfg)
        setStatus('ready')
      } catch (error) {
        setStatus('unavailable')
      }
    }
    useEffect(() => { void refresh() }, [])

    const setCfg = (key, value) => { setNotice(''); setConfig((prev) => ({ ...prev, [key]: value })) }

    const saveConfig = async () => {
      setBusy(true)
      try {
        const next = await fetchJson(`${API}/config`, { method: 'PATCH', body: JSON.stringify(config) })
        setConfig(next.config || config)
        show('配置已保存 ✓')
      } catch (error) {
        show('保存失败：' + error.message)
      } finally { setBusy(false) }
    }

    const addFact = async () => {
      if (!newContent.trim()) return
      setBusy(true)
      try {
        await fetchJson(`${API}/facts`, { method: 'POST', body: JSON.stringify({ content: newContent, category: newCategory, importance: newImportance }) })
        setNewContent(''); setNewCategory('other'); setNewImportance(0.5)
        await refresh(); show('事实已添加 ✓')
      } catch (error) { show('添加失败：' + error.message) } finally { setBusy(false) }
    }

    const updateFact = async (id, patch) => {
      try { await fetchJson(`${API}/facts?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }); await refresh() }
      catch (error) { show('更新失败：' + error.message) }
    }
    const deleteFact = async (id) => {
      try { await fetchJson(`${API}/facts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh() }
      catch (error) { show('删除失败：' + error.message) }
    }
    const deleteDocument = async (id) => {
      try { await fetchJson(`${API}/documents?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); await refresh() }
      catch (error) { show('删除失败：' + error.message) }
    }
    const importDocs = async () => {
      if (!importPathValue.trim()) return
      setBusy(true)
      try {
        const r = await fetchJson(`${API}/documents/import`, { method: 'POST', body: JSON.stringify({ path: importPathValue }) })
        await refresh(); show(`导入完成：${r.documents || 0} 个文档，${r.chunks || 0} 个分块 ✓`)
      } catch (error) { show('导入失败：' + error.message) } finally { setBusy(false) }
    }
    const runSearch = async () => {
      if (!searchQuery.trim()) return
      setBusy(true)
      try {
        const r = await fetchJson(`${API}/search`, { method: 'POST', body: JSON.stringify({ query: searchQuery, k: 3 }) })
        setSearchHits(r.hits || [])
      } catch (error) { show('检索失败：' + error.message) } finally { setBusy(false) }
    }

    const writable = status === 'ready' && !busy
    const categoryNames = { preference: '偏好', identity: '身份', project: '项目', work: '工作', other: '其他' }

    return React.createElement('li', { style: s.card, 'data-testid': 'dsh-memory-plugin-settings' },
      React.createElement('div', null,
        React.createElement('strong', { style: { fontSize: 16 } }, '记忆与知识库'),
        React.createElement('p', { style: { margin: '5px 0 0', opacity: 0.72 } },
          '永久记忆（跨会话事实与摘要）+ 本地知识库 RAG。数据全部存储在本地 SQLite，完全离线。'),
      ),
      notice ? React.createElement('span', { role: 'status', style: { color: '#2e9e5b', fontSize: 12 } }, notice) : null,
      status === 'unavailable'
        ? React.createElement('span', { role: 'status' }, '记忆系统尚未连接到 DSH Host。')
        : status === 'loading'
        ? React.createElement('span', null, '正在读取…')
        : React.createElement(React.Fragment, null,
          // 概览
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 } },
            ...[['事实', stats ? stats.facts : 0], ['对话摘要', stats ? stats.summaries : 0], ['知识库文档', stats ? stats.documents : 0], ['分块', stats ? stats.chunks : 0]].map(([k, v]) =>
              React.createElement('div', { key: k, style: { ...s.block, textAlign: 'center', padding: 10 } },
                React.createElement('div', { style: { fontSize: 22, fontWeight: 700 } }, v),
                React.createElement('div', { style: { fontSize: 12, opacity: 0.7 } }, k))),
          ),
          // 事实管理
          React.createElement('div', { style: s.block },
            React.createElement('div', { style: s.row },
              React.createElement('span', { style: s.label }, '永久事实'),
              React.createElement('span', { style: s.hint }, '跨会话长期记忆；钉住的事实不随时间衰减。')),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px 90px auto', gap: 8 } },
              React.createElement('input', { style: s.input, placeholder: '新增事实，如：用户是 Go 开发者', value: newContent, disabled: !writable, onChange: (e) => setNewContent(e.target.value) }),
              React.createElement('select', { style: s.input, value: newCategory, disabled: !writable, onChange: (e) => setNewCategory(e.target.value) },
                Object.entries(categoryNames).map(([k, v]) => React.createElement('option', { key: k, value: k }, v))),
              React.createElement('input', { style: s.input, type: 'number', min: 0, max: 1, step: 0.1, value: newImportance, disabled: !writable, onChange: (e) => setNewImportance(Number(e.target.value)) }),
              React.createElement('button', { type: 'button', style: s.btn, disabled: !writable, onClick: () => void addFact() }, '添加'),
            ),
            facts.length === 0
              ? React.createElement('p', { style: s.hint }, '暂无事实。对话结束时会自动提取，也可手动添加。')
              : React.createElement('div', { style: { display: 'grid', gap: 6 } },
                  ...facts.map((f) =>
                    React.createElement('div', { key: f.id, style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' } },
                      React.createElement('div', null,
                        React.createElement('div', null, f.content),
                        React.createElement('span', { style: s.hint },
                          `${categoryNames[f.category] || f.category} · 重要度 ${f.importance.toFixed(1)} · 访问 ${f.access_count}${f.pinned === 1 ? ' · 📌 已钉住' : ''}`)),
                      React.createElement('div', { style: { display: 'flex', gap: 6 } },
                        React.createElement('button', { type: 'button', style: s.btn, disabled: !writable, onClick: () => void updateFact(f.id, { pinned: f.pinned !== 1 }) },
                          f.pinned === 1 ? '取消钉住' : '钉住'),
                        React.createElement('button', { type: 'button', style: { ...s.btn, color: '#d64545' }, disabled: !writable, onClick: () => void deleteFact(f.id) }, '删除'),
                      ),
                    ),
                  ),
                ),
          ),
          // 知识库
          React.createElement('div', { style: s.block },
            React.createElement('span', { style: s.label }, '本地知识库（RAG）'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 } },
              React.createElement('input', { style: s.input, placeholder: '输入要导入的文件或文件夹路径（如 D:/docs）', value: importPathValue, disabled: !writable, onChange: (e) => setImportPathValue(e.target.value) }),
              React.createElement('button', { type: 'button', style: s.btn, disabled: !writable || !importPathValue.trim(), onClick: () => void importDocs() }, '导入'),
            ),
            React.createElement('p', { style: s.hint }, '支持 txt/md/code/json/yaml/log 等纯文本；会自动分块并本地向量化（bge-small-zh-v1.5）。'),
            documents.length === 0
              ? React.createElement('p', { style: s.hint }, '暂无文档。导入后 Agent 可通过 knowledge_search 检索。')
              : React.createElement('div', { style: { display: 'grid', gap: 6 } },
                  ...documents.map((d) =>
                    React.createElement('div', { key: d.id, style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' } },
                      React.createElement('div', null,
                        React.createElement('div', null, d.title),
                        React.createElement('span', { style: s.hint }, `${d.path} · ${d.chunk_count} 分块`)),
                      React.createElement('button', { type: 'button', style: { ...s.btn, color: '#d64545' }, disabled: !writable, onClick: () => void deleteDocument(d.id) }, '删除'),
                    ),
                  ),
                ),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 } },
              React.createElement('input', { style: s.input, placeholder: '检索测试：输入一句话，预览命中片段', value: searchQuery, disabled: !writable, onChange: (e) => setSearchQuery(e.target.value) }),
              React.createElement('button', { type: 'button', style: s.btn, disabled: !writable || !searchQuery.trim(), onClick: () => void runSearch() }, '检索'),
            ),
            searchHits.length > 0
              ? React.createElement('div', { style: { display: 'grid', gap: 6 } },
                  ...searchHits.map((h, i) =>
                    React.createElement('div', { key: i, style: { ...s.block, padding: 8, background: 'transparent' } },
                      React.createElement('div', { style: s.hint }, `《${h.title}》 相似度 ${h.score.toFixed(3)}`),
                      React.createElement('div', { style: { fontSize: 12, opacity: 0.85 } }, h.text.slice(0, 180))),
                  ),
                )
              : null,
          ),
          // 设置
          React.createElement('div', { style: s.block },
            React.createElement('span', { style: s.label }, '设置'),
            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 } },
              React.createElement(Field, { label: '记忆系统开关' },
                React.createElement('input', { type: 'checkbox', checked: config.enabled === true, disabled: !writable, onChange: (e) => setCfg('enabled', e.target.checked) })),
              React.createElement(Field, { label: '自动提取', hint: '对话结束后自动提取事实与摘要。' },
                React.createElement('input', { type: 'checkbox', checked: config.autoExtract === true, disabled: !writable, onChange: (e) => setCfg('autoExtract', e.target.checked) })),
              React.createElement(Field, { label: '本地 RAG', hint: '启用 knowledge_search 工具。' },
                React.createElement('input', { type: 'checkbox', checked: config.ragEnabled === true, disabled: !writable, onChange: (e) => setCfg('ragEnabled', e.target.checked) })),
              React.createElement(Field, { label: '生成摘要', hint: '保存对话摘要用于跨会话回顾。' },
                React.createElement('input', { type: 'checkbox', checked: config.summarize === true, disabled: !writable, onChange: (e) => setCfg('summarize', e.target.checked) })),
              React.createElement(Field, { label: 'Provider（提取 LLM）', hint: '留空用 deepseek。' },
                React.createElement('input', { style: s.input, value: config.provider || '', disabled: !writable, onChange: (e) => setCfg('provider', e.target.value) })),
              React.createElement(Field, { label: '模型', hint: '留空由 provider 解析默认。' },
                React.createElement('input', { style: s.input, value: config.model || '', disabled: !writable, onChange: (e) => setCfg('model', e.target.value) })),
              React.createElement(Field, { label: '提取阈值（消息数）' },
                React.createElement('input', { style: s.input, type: 'number', min: 1, value: config.minMessages ?? 3, disabled: !writable, onChange: (e) => setCfg('minMessages', Number(e.target.value)) })),
              React.createElement(Field, { label: '注入事实条数' },
                React.createElement('input', { style: s.input, type: 'number', min: 1, max: 20, value: config.injectTopK ?? 8, disabled: !writable, onChange: (e) => setCfg('injectTopK', Number(e.target.value)) })),
              React.createElement(Field, { label: '衰减半衰期（天）' },
                React.createElement('input', { style: s.input, type: 'number', min: 1, value: config.decayDays ?? 30, disabled: !writable, onChange: (e) => setCfg('decayDays', Number(e.target.value)) })),
            ),
            React.createElement('button', { type: 'button', style: { ...s.btn, borderColor: 'var(--accent-color, #4a6cf7)', color: 'var(--accent-color, #4a6cf7)', alignSelf: 'start' }, disabled: !writable, onClick: () => void saveConfig() },
              busy ? '处理中…' : '保存配置'),
          ),
        ),
    )
  }

  function apply(ctx) {
    const registerCard = () => {
      try {
        ctx.slots.register({
          name: 'settings.section', id: 'dsh-memory-plugin', order: 18,
          label: () => '记忆与知识库',
          inject: () => ({}),
        }, MemoryCard)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) console.error('[dsh-memory-plugin] failed to register settings card:', error)
      }
    }
    try {
      ctx.slots.inject('settings.section', registerCard)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) console.error('[dsh-memory-plugin] failed to inject settings slot:', error)
    }
  }

  module.exports = {
    name: 'dsh-memory-plugin-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
