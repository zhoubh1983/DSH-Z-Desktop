/**
 * 预加载脚本：在 contextIsolation 下向渲染进程暴露最小桥接信息。
 * dsh Web 界面本身运行在自己的渲染环境，这里仅提供无害的版本元数据。
 * @module dsh-gui/preload
 */

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('dshGui', {
  versions: {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
  },
  platform: process.platform,
})
