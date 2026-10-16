'use strict';
/**
 * 窗口控制通道：自绘标题栏上的最小化 / 最大化 / 关闭 + 最大化状态回传。
 */

const { BrowserWindow } = require('electron');
const { WIN } = require('../../shared/channels');

function registerWindowIpc(ipcMain) {
  const from = (e) => BrowserWindow.fromWebContents(e.sender);

  ipcMain.on(WIN.minimize, (e) => {
    const w = from(e);
    if (w) w.minimize();
  });
  ipcMain.on(WIN.toggleMaximize, (e) => {
    const w = from(e);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on(WIN.close, (e) => {
    const w = from(e);
    if (w) w.close();
  });
  ipcMain.handle(WIN.isMaximized, (e) => {
    const w = from(e);
    return !!(w && w.isMaximized());
  });
}

/** 最大化状态推给渲染层（好换图标） */
function bindWindowState(win) {
  const push = () => {
    if (!win.isDestroyed()) win.webContents.send(WIN.state, win.isMaximized());
  };
  win.on('maximize', push);
  win.on('unmaximize', push);
  win.on('resize', push);
}

module.exports = { registerWindowIpc, bindWindowState };
