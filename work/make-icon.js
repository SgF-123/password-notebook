/* 【旧版】生成 macOS/Windows 都能用的应用图标：build/icon.png（1024×1024）
   画法和界面里的 logo 一致：绿色圆角方块 + 白色「本」 */
/* 现在的图标改用 work/icons/apply-icon.js（一次出 png/ico/icns + 窗口图标），
   想要回「本」字版可以跑：node_modules\.bin\electron.cmd work\icons\apply-icon.js char */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body style="margin:0"><canvas id="c" width="1024" height="1024"></canvas></body></html>');
  const dataUrl = await win.webContents.executeJavaScript(`(() => {
    const c = document.getElementById('c');
    const g = c.getContext('2d');
    const S = 1024;
    // 圆角外框（macOS 风格圆角比例）
    const r = S * 0.22;
    g.clearRect(0, 0, S, S);
    const grad = g.createLinearGradient(0, 0, S, S);
    grad.addColorStop(0, '#12d16b');
    grad.addColorStop(0.55, '#07c160');
    grad.addColorStop(1, '#048f4a');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(S - r, 0); g.quadraticCurveTo(S, 0, S, r);
    g.lineTo(S, S - r); g.quadraticCurveTo(S, S, S - r, S);
    g.lineTo(r, S); g.quadraticCurveTo(0, S, 0, S - r);
    g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.closePath();
    g.fill();
    // 顶部高光
    const hl = g.createLinearGradient(0, 0, 0, S);
    hl.addColorStop(0, 'rgba(255,255,255,.28)');
    hl.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fill();
    // 「本」字
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 560px "Microsoft YaHei", "PingFang SC", "Heiti SC", sans-serif';
    g.fillText('本', S / 2, S / 2 + 26);
    return c.toDataURL('image/png');
  })()`);
  const buf = Buffer.from(String(dataUrl).split(',')[1], 'base64');
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.writeFileSync(out, buf);
  console.log('written', out, buf.length, 'bytes');
  app.exit(0);
});
