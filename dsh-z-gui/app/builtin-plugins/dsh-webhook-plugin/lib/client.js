/**
 * dsh-webhook-plugin 客户端：在 DSH Web UI 的「设置」里注册一个一级菜单「Webhook 告警」配置页。
 *
 * 与 dafeiyu 一致的零构建模式：
 *  - 通过 window.__ModuleLoader__.load 注册浏览器插件包；
 *  - 经 ctx.slots 注入 settings.section（由 @deepseek-ai/dsh-client-ui-settings 声明）注册一级设置菜单；
 *  - 卡片直接 GET/PATCH /plugins/dsh-webhook-plugin/config（Host 侧由 webServer 提供）。
 */
window.__ModuleLoader__.load({ id: 'dsh-webhook-plugin', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useRef, useState } = React
  const CONFIG_ENDPOINT = '/plugins/dsh-webhook-plugin/config'

  const cardStyle = {
    listStyle: 'none', border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 12,
    padding: 16, background: 'var(--surface-color, transparent)', display: 'grid', gap: 14,
  }
  const fieldStyle = { display: 'grid', gap: 4 }
  const labelStyle = { fontWeight: 600, fontSize: 13 }
  const hintStyle = { fontSize: 12, opacity: 0.65, margin: 0 }
  const inputStyle = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-color, #d8d8d8)',
    background: 'var(--field-color, transparent)', color: 'inherit', width: '100%', boxSizing: 'border-box',
  }
  const selectStyle = { ...inputStyle, minWidth: 140, width: 'auto' }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }
  const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }
  const skillStyle = {
    border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 8, padding: 10,
    display: 'grid', gap: 8,
  }
  const buttonStyle = {
    padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-color, #d8d8d8)',
    background: 'var(--field-color, transparent)', color: 'inherit', cursor: 'pointer', fontWeight: 600,
  }

  function Field({ label, hint, children }) {
    return React.createElement('div', { style: fieldStyle },
      React.createElement('span', { style: labelStyle }, label),
      hint ? React.createElement('p', { style: hintStyle }, hint) : null,
      children,
    )
  }

  /** 单行文本输入。 */
  function TextInput({ value, placeholder, disabled, onChange, type }) {
    return React.createElement('input', {
      type: type || 'text', value: value ?? '', placeholder,
      disabled, style: inputStyle,
      onChange: (event) => onChange(event.target.value),
    })
  }

  /** 数字输入。 */
  function NumberInput({ value, placeholder, disabled, onChange }) {
    return React.createElement('input', {
      type: 'number', value: value ?? '', placeholder,
      disabled, style: inputStyle,
      onChange: (event) => onChange(event.target.value === '' ? undefined : Number(event.target.value)),
    })
  }

  function WebhookCard() {
    const [status, setStatus] = useState('loading')
    const [form, setForm] = useState({})
    const [busy, setBusy] = useState(false)
    const [saved, setSaved] = useState(false)
    const mounted = useRef(true)

    useEffect(() => {
      mounted.current = true
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`settings request failed: ${response.status}`)
          return response.json()
        })
        .then((next) => {
          if (!mounted.current) return
          setForm(next)
          setStatus('ready')
        })
        .catch(() => { if (mounted.current) setStatus('unavailable') })
      return () => { mounted.current = false }
    }, [])

    const setField = (key, value) => {
      setSaved(false)
      setForm((prev) => ({ ...prev, [key]: value }))
    }

    const save = async () => {
      setBusy(true)
      setSaved(false)
      try {
        const response = await fetch(CONFIG_ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(form),
        })
        if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
        const updated = await response.json()
        if (!mounted.current) return
        setForm(updated)
        setStatus('ready')
        setSaved(true)
      } catch (error) {
        if (mounted.current) setStatus('unavailable')
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-webhook-plugin] 保存配置失败:', error)
        }
      } finally {
        if (mounted.current) setBusy(false)
      }
    }

    const skills = (form.skills && typeof form.skills === 'object' && !Array.isArray(form.skills)) ? form.skills : {}
    const skillEntries = Object.entries(skills)

    const setSkillKey = (oldKey, nextKey) => {
      const next = {}
      for (const [key, value] of skillEntries) next[key === oldKey ? nextKey : key] = value
      setField('skills', next)
    }
    const setSkillField = (key, field, value) => {
      setField('skills', { ...skills, [key]: { ...(skills[key] || {}), [field]: value } })
    }
    const removeSkill = (key) => {
      const next = {}
      for (const [entryKey, value] of skillEntries) if (entryKey !== key) next[entryKey] = value
      setField('skills', next)
    }
    const addSkill = () => {
      let index = skillEntries.length + 1
      let key = `新技能${index}`
      while (Object.prototype.hasOwnProperty.call(skills, key)) { index += 1; key = `新技能${index}` }
      setField('skills', { ...skills, [key]: { prompt: '' } })
    }

    const writable = status === 'ready' && !busy

    return React.createElement('li', { style: cardStyle, 'data-testid': 'dsh-webhook-plugin-settings' },
      React.createElement('div', null,
        React.createElement('strong', { style: { fontSize: 16 } }, 'Webhook 告警接入'),
        React.createElement('p', { style: { margin: '5px 0 0', opacity: 0.72 } },
          '接收三方系统推送的 JSON 告警，并按预设技能分派给指定会话处理。修改「监听」相关参数需重启 DSH 后生效。'),
      ),
      status === 'unavailable'
        ? React.createElement('span', { role: 'status' }, 'Webhook 设置尚未连接到 DSH Host。')
        : status === 'loading'
        ? React.createElement('span', null, '正在读取设置…')
        : React.createElement(React.Fragment, null,
          React.createElement('div', { style: gridStyle },
            React.createElement(Field, { label: '监听地址', hint: '0.0.0.0 表示所有网卡可访问。' },
              React.createElement(TextInput, { value: form.host, disabled: !writable, onChange: (v) => setField('host', v) })),
            React.createElement(Field, { label: '监听端口', hint: '三方系统推送的端口。' },
              React.createElement(NumberInput, { value: form.port, disabled: !writable, onChange: (v) => setField('port', v) })),
            React.createElement(Field, { label: '接收路径', hint: '仅 POST 该路径才被处理。' },
              React.createElement(TextInput, { value: form.path, disabled: !writable, onChange: (v) => setField('path', v) })),
            React.createElement(Field, { label: '鉴权 Token', hint: '留空则不鉴权；配置后要求 Authorization: Bearer <token>。' },
              React.createElement(TextInput, { type: 'password', value: form.authToken, disabled: !writable, onChange: (v) => setField('authToken', v) })),
            React.createElement(Field, { label: '目标会话', hint: '告警默认投递到的会话 id。' },
              React.createElement(TextInput, { value: form.sessionId, disabled: !writable, onChange: (v) => setField('sessionId', v) })),
            React.createElement(Field, { label: '默认技能', hint: '推送 skill 未命中 skills 时的回退技能名。' },
              React.createElement(TextInput, { value: form.defaultSkill, disabled: !writable, onChange: (v) => setField('defaultSkill', v) })),
            React.createElement(Field, { label: '消息来源', hint: '投递给 Agent 的 source 类型。' },
              React.createElement('select', {
                style: selectStyle, value: form.sourceKind ?? 'user', disabled: !writable,
                onChange: (event) => setField('sourceKind', event.target.value),
              },
              React.createElement('option', { value: 'user' }, '用户消息 (user)'),
              React.createElement('option', { value: 'cron' }, '定时任务 (cron)')),
            ),
          ),
          React.createElement('div', { style: rowStyle },
            React.createElement('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
              React.createElement('input', {
                type: 'checkbox', checked: form.autoCreate === true, disabled: !writable,
                onChange: (event) => setField('autoCreate', event.target.checked),
              }),
              React.createElement('span', { style: labelStyle }, '目标会话未激活时自动创建'),
            ),
          ),
          form.autoCreate === true
            ? React.createElement('div', { style: gridStyle },
                React.createElement(Field, { label: 'Provider', hint: '自动创建时的初始 provider 路由。' },
                  React.createElement(TextInput, { value: form.provider, disabled: !writable, onChange: (v) => setField('provider', v) })),
                React.createElement(Field, { label: '模型', hint: '自动创建时的初始模型 id。' },
                  React.createElement(TextInput, { value: form.model, disabled: !writable, onChange: (v) => setField('model', v) })),
                React.createElement(Field, { label: '最大输出 Token' },
                  React.createElement(NumberInput, { value: form.maxTokens, disabled: !writable, onChange: (v) => setField('maxTokens', v) })),
                React.createElement(Field, { label: '工作目录', hint: '自动创建会话的 meta.cwd，默认取进程 cwd。' },
                  React.createElement(TextInput, { value: form.cwd, disabled: !writable, onChange: (v) => setField('cwd', v) })),
              )
            : null,
          React.createElement('div', null,
            React.createElement('div', { style: rowStyle },
              React.createElement('span', { style: labelStyle }, '预设技能'),
              React.createElement('button', { type: 'button', style: buttonStyle, disabled: !writable, onClick: addSkill },
                '+ 新增技能'),
            ),
            React.createElement('p', { style: hintStyle }, '推送告警中的 skill 字段会匹配这里的 key；占位符 {system}/{time}/{skill}/{message} 会被告警内容替换。'),
            skillEntries.length === 0
              ? React.createElement('p', { style: hintStyle }, '尚未配置预设技能。')
              : React.createElement('div', { style: { display: 'grid', gap: 10 } },
                  ...skillEntries.map(([key, preset]) =>
                    React.createElement('div', { key, style: skillStyle },
                      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 } },
                        React.createElement(Field, { label: '技能名（告警中的 skill 值）' },
                          React.createElement(TextInput, { value: key, disabled: !writable, onChange: (v) => setSkillKey(key, v) })),
                        React.createElement('button', {
                          type: 'button', style: { ...buttonStyle, alignSelf: 'end' },
                          disabled: !writable,
                          onClick: () => removeSkill(key),
                        }, '删除'),
                      ),
                      React.createElement(Field, { label: '处理模板（prompt）' },
                        React.createElement('textarea', {
                          rows: 3, value: (preset && preset.prompt) || '', disabled: !writable,
                          style: { ...inputStyle, resize: 'vertical', fontFamily: 'inherit' },
                          onChange: (event) => setSkillField(key, 'prompt', event.target.value),
                        }),
                      ),
                      React.createElement(Field, { label: '覆盖会话（留空用全局目标会话）' },
                        React.createElement(TextInput, { value: (preset && preset.sessionId) || '', disabled: !writable, onChange: (v) => setSkillField(key, 'sessionId', v) })),
                    ),
                  ),
                ),
          ),
          React.createElement('div', { style: rowStyle },
            React.createElement('div', null,
              React.createElement('button', {
                type: 'button', style: { ...buttonStyle, borderColor: 'var(--accent-color, #4a6cf7)', color: 'var(--accent-color, #4a6cf7)' },
                disabled: !writable,
                onClick: () => void save(),
              }, busy ? '正在保存…' : '保存配置'),
              saved ? React.createElement('span', { style: { ...hintStyle, marginLeft: 10, color: '#2e9e5b' } }, '已保存 ✓（重启后生效监听参数）') : null,
            ),
          ),
        ),
    )
  }

  function apply(ctx) {
    const registerCard = () => {
      try {
        ctx.slots.register({
          name: 'settings.section', id: 'dsh-webhook-plugin', order: 17,
          label: () => 'Webhook 告警',
          inject: () => ({}),
        }, WebhookCard)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-webhook-plugin] failed to register settings card:', error)
        }
      }
    }
    try {
      ctx.slots.inject('settings.section', registerCard)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dsh-webhook-plugin] failed to inject settings slot:', error)
      }
    }
  }

  module.exports = {
    name: 'dsh-webhook-plugin-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
