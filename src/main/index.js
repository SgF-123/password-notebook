'use strict';
/**
 * 主进程入口：只管生命周期（单实例 / 菜单 / 开窗 / 收尾）。
 * 加密存储在 src/core，通道装配在 src/main/ipc，路径规则在 src/main/paths.js。
 */

const { app, BrowserWindow, ipcMain, Menu, clipboard, shell } = require('electron');
const paths = require('./paths');
const { createMainWindow } = require('./window');
const { registerIpc } = require('./ipc');

const isMac = process.platform === 'darwin';

// Electron 的缓存别往 C 盘 AppData 写：开发时 data\userdata，安装版 exe 同级 data\userdata
// （macOS 例外：.app 内部只读，走系统默认的 ~/Library/Application Support/密码本）
function usePortableUserData() {
  const dir = paths.getUserDataDir();
  if (!dir) return;
  try {
    paths.ensureDir(dir);
    app.setPath('userData', dir);
  } catch (e) { /* 写不进去就用系统默认的，别影响启动 */ }
}
usePortableUserData();

// macOS 上必须留一份最小菜单：不然 ⌘Q 退出、输入框里的 ⌘C / ⌘V 这些系统快捷键都会失效
function setupMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]));
}

let mainWindow = null;
let vault = null;

function openWindow() {
  mainWindow = createMainWindow({ onClosed: () => { mainWindow = null; } });
  return mainWindow;
}

// 单实例：再双击一次只把已有窗口叫到前面来
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    setupMenu();
    paths.ensureDir(paths.getDataDir());
    ({ vault } = registerIpc(ipcMain, { clipboard, shell }));
    openWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) openWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (vault) vault.lock();
  if (!isMac) app.quit();
});
