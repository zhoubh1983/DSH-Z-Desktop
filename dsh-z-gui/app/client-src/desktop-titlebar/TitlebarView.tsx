/**
 * 桌面标题栏视图（React 版，参考官方 DesktopFrameTitlebarView）。
 * 仅依赖 react/react-dom（运行时从 profile 解析）；图标用文本符号（免 lucide）。
 * 动作经 preload 暴露的 window.dshGui.desktop.action 送达主进程。
 *
 * 事件绑定说明：在 dsh 客户端宿主中，插件内 React 合成事件的委托分发不可靠
 * （同页另一 React 根正常、本根合成 onClick 不触发），因此全部交互按钮改用
 * 原生 addEventListener（经 ref 回调挂载），状态仍由 React 管理。
 */

import { useEffect, useRef, useState } from 'react'

/** 主进程返回的桌面状态快照。 */
export interface FrameState {
  mode: string
  material: string
  platform: string
  version: string
}

const MODE_LABEL: Record<string, string> = {
  compatibility: '兼容模式',
  extended: '扩展模式',
  advanced: '增强模式',
}

const MODE_OPTS = [
  { m: 'compatibility', title: '兼容', body: '保留原生系统标题栏' },
  { m: 'extended', title: '扩展', body: '36px 桌面标题栏 + 三栏布局' },
  { m: 'advanced', title: '增强', body: '32px 紧凑标题栏' },
]

/** 桌面动作（经 preload IPC → 主进程）。 */
function desktopAction(cmd: string, payload?: Record<string, unknown>): void {
  window.dshGui?.desktop?.action(cmd, payload || {})
}

/** 渲染标题栏（身份区 + 模式切换 + 动作区）。 */
export function TitlebarView({ state }: { state: FrameState }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const modeWrapRef = useRef<HTMLDivElement>(null)

  // 点击别处关闭模式菜单（原生监听，宿主下可靠）。
  useEffect(() => {
    const onDown = (ev: MouseEvent): void => {
      if (modeWrapRef.current !== null && !modeWrapRef.current.contains(ev.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const mode = (state.mode === 'advanced' || state.mode === 'extended') ? state.mode : 'compatibility'

  // 原生点击绑定（ref 回调在 commit 后挂载 DOM 节点）。
  const bindModeToggle = (el: HTMLButtonElement | null): void => {
    if (!el) return
    el.addEventListener('click', () => setMenuOpen((open) => !open))
  }
  const bindModeOpt = (m: string) => (el: HTMLButtonElement | null): void => {
    if (!el) return
    el.addEventListener('click', () => {
      setMenuOpen(false)
      desktopAction('mode', { mode: m })
    })
  }
  const bindAction = (cmd: string) => (el: HTMLButtonElement | null): void => {
    if (!el) return
    el.addEventListener('click', () => desktopAction(cmd))
  }

  return (
    <header
      className="dshDesktopFrameTitlebar"
      data-platform={state.platform || 'win32'}
      data-mode={mode}
      data-material={state.material || 'off'}
    >
      <div className="dshDesktopFrameIdentity">
        <span className="dshDesktopFrameProduct">DSH Desktop</span>
        <span className="dshDesktopFrameVersion" title={`DSH Desktop ${state.version || ''}`}>
          {`v${state.version || '0.1.0'}`}
        </span>
        <div className="dshDesktopFrameModeWrap" ref={modeWrapRef}>
          <button
            type="button"
            className="dshDesktopFrameMode"
            aria-haspopup="menu"
            ref={bindModeToggle}
          >
            {MODE_LABEL[mode] || mode}
          </button>
          {menuOpen && (
            <div className="dshDesktopModeMenu" role="menu">
              <div className="dshDesktopModeMenuHead">切换呈现模式</div>
              {MODE_OPTS.filter((o) => o.m !== mode).map((o) => (
                <button
                  key={o.m}
                  type="button"
                  className="dshDesktopModeOpt"
                  ref={bindModeOpt(o.m)}
                >
                  <strong>{o.title}</strong>
                  <small>{o.body}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="dshDesktopFrameActions">
        <button type="button" className="dshDesktopTitlebarIconButton" title="打开 DSH 终端" aria-label="打开 DSH 终端" ref={bindAction('terminal')}>
          ❯_
        </button>
        <button type="button" className="dshDesktopTitlebarIconButton" title="重启后端" aria-label="重启后端" ref={bindAction('restart')}>
          ⟳
        </button>
        <button type="button" className="dshDesktopTitlebarIconButton" title="开发者工具" aria-label="开发者工具" ref={bindAction('devtools')}>
          ⚙
        </button>
      </div>
    </header>
  )
}
