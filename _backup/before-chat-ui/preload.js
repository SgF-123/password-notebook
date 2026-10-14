const { contextBridge, ipcRenderer } = require('electron');

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
