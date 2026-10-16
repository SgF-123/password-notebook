'use strict';
/**
 * 安全桥接层：主进程和界面之间唯一的门。
 *
 * ⚠️ 这里是沙箱环境（webPreferences.sandbox = true），只能 require('electron')，
 *    不能 require 本地文件 —— 所以通道名在这里内联一份；
 *    与 src/shared/channels.js 的一致性由 tests/unit/channels.test.js 校验。
 *
 * 对外只暴露两个门面（界面只认这两个，不看通道名）：
 *   window.vaultAPI —— 保险库读写 / 复制到剪贴板 / 用浏览器打开
 *   window.winAPI   —— 无边框窗口的最小化 / 最大化 / 关闭 / 最大化状态
 */

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const send = (channel, ...args) => ipcRenderer.send(channel, ...args);

contextBridge.exposeInMainWorld('vaultAPI', {
  exists: () => invoke('vault:exists'),
  create: (masterPassword) => invoke('vault:create', masterPassword),
  unlock: (masterPassword) => invoke('vault:unlock', masterPassword),
  verifyMaster: (masterPassword) => invoke('vault:verify', masterPassword),
  load: () => invoke('vault:load'),
  save: (payload) => invoke('vault:save', payload),
  changeMaster: (oldPw, newPw) => invoke('vault:changeMaster', oldPw, newPw),
  lock: () => invoke('vault:lock'),
  copy: (text) => invoke('clip:write', text),
  openExternal: (url) => invoke('shell:openExternal', url)
});

contextBridge.exposeInMainWorld('winAPI', {
  platform: process.platform,
  minimize: () => send('win:minimize'),
  toggleMaximize: () => send('win:toggleMaximize'),
  close: () => send('win:close'),
  isMaximized: () => invoke('win:isMaximized'),
  onState: (cb) => ipcRenderer.on('win:state', (_e, isMax) => cb(isMax))
});
