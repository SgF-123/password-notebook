const { app, BrowserWindow, ipcMain, clipboard, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpc, ensureDataDir } = require('./vault-core');

const isMac = process.platform === 'darwin';

// ============ 数据 / 缓存都放程序自己旁边（别往 C 盘 AppData 写） ============
// 开发时 = 项目根 data\userdata；安装版 = exe 同级 data\userdata（跟 vault.dat 同一个 data\）。
// 这里放的是 Electron 自己的缓存，删掉不影响密码；密码始终在 data\vault.dat。
// macOS 例外：.app 内部是只读的，走系统默认的 ~/Library/Application Support/密码本
// （密码库也跟着放那儿，见 vault-core.js 的 getDataDir）。
(function usePortableUserData() {
  if (isMac) return;
  try {
    const base = app.isPackaged ? path.dirname(app.getPath('exe')) : __dirname;
    const dir = path.join(base, 'data', 'userdata');
    fs.mkdirSync(dir, { recursive: true });
    app.setPath('userData', dir);
  } catch (e) { /* 写不进去就用系统默认的，别影响启动 */ }
})();

// macOS 上必须留一份最小菜单：不然 ⌘Q 退出、输入框里的 ⌘C / ⌘V 这些系统快捷键都会失效
function setupMenu() {
  if (!isMac) { Menu.setApplicationMenu(null); return; }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]));
}

// ============ 窗口（无边框 + 自绘标题栏，像 QQ / 微信 那样的一体式窗口） ============
let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    // Windows / Linux：无边框 + 自绘标题栏；macOS：用系统原生红黄绿灯（自绘按钮在 CSS 里藏掉）
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f7',
    title: '密码本',
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

  // 最大化状态回传，渲染层好换图标
  const pushState = () => {
    if (!win.isDestroyed()) win.webContents.send('win:state', win.isMaximized());
  };
  win.on('maximize', pushState);
  win.on('unmaximize', pushState);
  win.on('resize', pushState);
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });

  mainWindow = win;
  return win;
}

// ============ 窗口控制（渲染层标题栏上的按钮） ============
function registerWindowIpc() {
  const from = (e) => BrowserWindow.fromWebContents(e.sender);
  ipcMain.on('win:minimize', (e) => { const w = from(e); if (w) w.minimize(); });
  ipcMain.on('win:toggleMaximize', (e) => {
    const w = from(e);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize(); else w.maximize();
  });
  ipcMain.on('win:close', (e) => { const w = from(e); if (w) w.close(); });
  ipcMain.handle('win:isMaximized', (e) => { const w = from(e); return !!(w && w.isMaximized()); });
}

// ============ 单实例：再双击一次只把已有窗口叫到前面来 ============
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupMenu();
    ensureDataDir();
    registerWindowIpc();
    registerIpc(ipcMain, { clipboard, shell });
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  global.__vaultKey = undefined;
  if (process.platform !== 'darwin') app.quit();
});
