/* 单独预览"手写密码本"（开发/看效果用）：npm run notebook */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    show: false,
    backgroundColor: '#16171b',
    autoHideMenuBar: true,
    title: '密码本 · 手写本子',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false }
  });

  // 彻底拿掉菜单栏：不然按一下 Alt 就会冒出 File/Edit/View… 那排系统菜单
  win.setMenu(null);
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'renderer', 'notebook', 'index.html'));

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());