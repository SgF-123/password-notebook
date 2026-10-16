'use strict';
/**
 * 主窗口：一个窗口，无边框 + 自绘标题栏（像 QQ / 微信 那样的一体式）。
 * macOS 用系统原生红黄绿灯（自绘按钮在 CSS 里藏掉）。
 */

const path = require('path');
const { BrowserWindow } = require('electron');
const { bindWindowState } = require('./ipc/window-ipc');

const RENDERER_DIR = path.join(__dirname, '..', '..', 'renderer');   // src/main -> 仓库根 -> renderer
const PRELOAD = path.join(__dirname, '..', 'preload.js');

function createMainWindow(options) {
  const opts = options || {};
  const isMac = process.platform === 'darwin';

  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    show: false,
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#f5f6f7',
    title: '密码本',
    icon: path.join(RENDERER_DIR, 'assets', 'icon.png'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.setMenu(null);
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(RENDERER_DIR, 'index.html'));
  bindWindowState(win);

  if (typeof opts.onClosed === 'function') win.on('closed', opts.onClosed);
  return win;
}

module.exports = { createMainWindow, RENDERER_DIR, PRELOAD };
