/**
 * 原生窗口（设置向导 / 恢复助手）预加载桥。
 * 通过 contextBridge 暴露 dshNative：向导（wizard）与恢复（recovery）两组 IPC。
 * @module dsh-gui/preload/native
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshNative', {
  /** 平台/版本/目录等只读信息。 */
  info: () => ipcRenderer.invoke('native:info'),
  /** 设置向导。 */
  wizard: {
    complete: (selection) => ipcRenderer.invoke('wizard:complete', selection),
    cancel: () => ipcRenderer.invoke('wizard:cancel'),
  },
  /** 恢复助手。 */
  recovery: {
    snapshot: () => ipcRenderer.invoke('recovery:snapshot'),
    enterSafeMode: () => ipcRenderer.invoke('recovery:enter-safe-mode'),
    exitSafeMode: () => ipcRenderer.invoke('recovery:exit-safe-mode'),
    uninstallPlugin: (name) => ipcRenderer.invoke('recovery:uninstall-plugin', name),
    factoryReset: () => ipcRenderer.invoke('recovery:factory-reset'),
    exportDiagnostics: () => ipcRenderer.invoke('recovery:export-diagnostics'),
    openPath: (p) => ipcRenderer.invoke('recovery:open-path', p),
    restart: () => ipcRenderer.invoke('recovery:restart'),
    quit: () => ipcRenderer.invoke('recovery:quit'),
  },
})
