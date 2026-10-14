/* 外观截图：解锁屏 / 翻本过渡 / 封面 / 内容对开页 / 写一条 / 设置 / 生成器 */
const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// 用独立数据目录，别碰真的 vault.dat
process.env.VAULT_DATA_DIR = path.join(__dirname, '..', 'data-test');

app.setPath('userData', path.join(process.env.VAULT_DATA_DIR, 'userdata'));

const { registerIpc, ensureDataDir, getVaultFile } = require('../vault-core');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, 'shots', 'client');
fs.mkdirSync(OUT, { recursive: true });

app.whenReady().then(async () => {
  if (fs.existsSync(getVaultFile())) fs.unlinkSync(getVaultFile());
  ensureDataDir();
  registerIpc(ipcMain, { clipboard, shell });
  ipcMain.on('win:minimize', () => {});
  ipcMain.on('win:toggleMaximize', () => {});
  ipcMain.on('win:close', () => {});
  ipcMain.handle('win:isMaximized', () => false);

  const win = new BrowserWindow({
    width: 1280, height: 850, frame: false, show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  win.webContents.setBackgroundThrottling(false);
  const errs = [];
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2 && !/Insecure Content-Security-Policy/.test(m)) errs.push(m); });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  await wait(1500);
  win.showInactive();
  await wait(400);

  const q = (js) => win.webContents.executeJavaScript(js, true);
  const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); console.log('shot', n); };

  await shot('1-lock');

  // 解锁（第一次会建档）
  const waitFor = async (code, timeout = 8000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await q(code)) return true;
      await wait(80);
    }
    return false;
  };

  await q(`byId('lock-password').value = 'demo123456';
    byId('lock-confirm').value = 'demo123456';
    byId('lock-submit').click(); true`);
  await waitFor(`!byId('screen-app').classList.contains('hidden')`);
  await wait(1600);
  await shot('3-book-cover');

  // 过渡那一帧：本子已经翻开，再把过渡重放一次并停在 260ms 处截图（同一套 CSS 动画）
  await q(`(() => {
    const lock = byId('screen-lock'), app = byId('screen-app');
    lock.classList.remove('hidden');
    lock.classList.add('lock-leaving');
    app.classList.add('app-entering');
    const list = document.getAnimations();
    list.forEach((a) => { try { a.currentTime = 260; a.pause(); } catch (e) {} });
    return list.length;
  })()`);
  await wait(350);   // 等一帧真的画出来再截，否则 capturePage 拿到的是上一帧
  await shot('2-enter-transition');
  await q(`(() => {
    const lock = byId('screen-lock'), app = byId('screen-app');
    document.getAnimations().forEach((a) => { try { a.play(); } catch (e) {} });
    lock.classList.add('hidden');
    lock.classList.remove('lock-leaving');
    app.classList.remove('app-entering');
    return true;
  })()`);
  await wait(400);

  // 灌点真实感数据 + 重新挂一本
  const info = await q(`(() => {
    const now = Date.now();
    const t = ['淘宝','GitHub','微信','QQ 邮箱','招商银行','公司 VPN','B 站','路由器管理'];
    const u = ['free_shopper@163.com','free-dev','138****6688','668899@qq.com','6214********3721','free.zhao','free_bili','admin'];
    const l = ['taobao.com','github.com','','mail.qq.com','cmbchina.com','vpn.company.cn','bilibili.com','192.168.1.1'];
    const c = ['web','work','social','email','bank','work','social','other'];
    const fav = [true, true, false, false, true, false, false, false];
    state.payload.items = t.map((x, i) => ({ id: 'demo' + i, title: x, username: u[i], password: 'Tb#8kLm2Qv!',
      url: l[i], notes: i === 0 ? '主账号，绑了支付宝' : '', category: c[i], favorite: fav[i], createdAt: now, updatedAt: now }));
    state.payload.settings.owner = 'FRee';
    mountBook();
    return { pages: window.__nb.pageCount, first: window.__nb.pageOf('demo0') };
  })()`);
  console.log('seeded:', JSON.stringify(info));
  await wait(900);

  await q(`window.__nb.gotoPage(${JSON.stringify(info.first)}); true`);
  await wait(2300);
  await shot('4-book-spread');

  await q(`openEditor('demo0'); true`);
  await wait(700);
  await shot('5-write-drawer');
  await q(`closeEditor(); true`);
  await wait(400);

  await q(`openSettings(); true`);
  await wait(600);
  await shot('6-settings');
  await q(`closeSettings(); openGenerator(null); true`);
  await wait(600);
  await shot('7-generator');
  await q(`closeGenerator(); true`);

  console.log('errors:', errs.length ? JSON.stringify(errs.slice(0, 5)) : 'none');
  app.exit(0);
});
