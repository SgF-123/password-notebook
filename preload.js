const { contextBridge, ipcRenderer } = require('electron');

// 保险库（后端加密引擎）桥接
contextBridge.exposeInMainWorld('vaultAPI', {
  exists: () => ipcRenderer.invoke('vault:exists'),
  create: (masterPassword) => ipcRenderer.invoke('vault:create', masterPassword),
  unlock: (masterPassword) => ipcRenderer.invoke('vault:unlock', masterPassword),
  load: () => ipcRenderer.invoke('vault:load'),
  save: (payload) => ipcRenderer.invoke('vault:save', payload),
  changeMaster: (oldPw, newPw) => ipcRenderer.invoke('vault:changeMaster', oldPw, newPw),
  lock: () => ipcRenderer.invoke('vault:lock'),
  copy: (text) => ipcRenderer.invoke('clip:write', text),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
});

// 窗口控制（自绘标题栏：最小化 / 最大化 / 关闭）
contextBridge.exposeInMainWorld('winAPI', {
  platform: process.platform,
  minimize: () => ipcRenderer.send('win:minimize'),
  toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
  close: () => ipcRenderer.send('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onState: (cb) => ipcRenderer.on('win:state', (_e, isMax) => cb(isMax))
});
