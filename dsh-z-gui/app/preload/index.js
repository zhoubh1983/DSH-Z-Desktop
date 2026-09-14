/**
 * 预加载脚本：在 contextIsolation 下向渲染进程暴露最小桥接信息。
 * dsh Web 界面本身运行在自己的渲染环境，这里仅提供无害的版本元数据。
 * @module dsh-gui/preload
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshGui', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  platform: process.platform,
  // 桌面标题栏（dsh-desktop-frame 插件）：动作执行 + 状态读取。
  desktop: {
    action: (cmd, payload) => ipcRenderer.send('desktop:action', cmd, payload),
    getState: () => ipcRenderer.invoke('desktop:getState'),
  },
})
