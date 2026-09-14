/**
 * dsh-desktop-frame Host 端：占位（桌面标题栏由 client 渲染）。
 * 注册空 apply 以满足 Cordis bundle 契约。
 */
export const name = 'dsh-desktop-frame'

export function apply() {
  // 标题栏渲染、模式控制与窗口 chrome 动作均由 client 经 preload IPC 完成。
}
