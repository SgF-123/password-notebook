const { app, BrowserWindow, ipcMain, clipboard, shell, Menu } = require('electron');
const path = require('path');
const { registerIpc, ensureDataDir } = require('./vault-core');

// ============ 窗口 ============
function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f2f4f7',
    title: '密匣 VaultChat',
    icon: path.join(__dirname, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ensureDataDir();
  registerIpc(ipcMain, { clipboard, shell });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  global.__vaultKey = undefined;
  if (process.platform !== 'darwin') app.quit();
});
