/* 把 work/icons/preview-*.png 拼成「候选图标对照表」sheet-options.png + sheet-small-sizes.png
   运行：node_modules\.bin\electron.cmd work\icons\make-sheet.js */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();

const ITEMS = [
  ['book-lock', '书+锁（已应用）'],
  ['notebook-gold', '白本+金锁扣'],
  ['notebook-keyhole', '合着的密码书'],
  ['open-book', '翻开的密码本'],
  ['notebook-pen', '笔记本+笔'],
  ['paper', '皮面本+钥匙孔'],
  ['char', '现在（本）'],
];

const DATA = {};
for (const [k] of ITEMS) {
  const p = path.join(__dirname, 'preview-' + k + '.png');
  if (!fs.existsSync(p)) continue;
  DATA[k] = fs.readFileSync(p).toString('base64');
}

const CODE = `(async () => {
  const items = ${JSON.stringify(ITEMS.filter((i) => DATA[i[0]]))};
  const data = ${JSON.stringify(DATA)};
  const CELL = 236, PAD = 18, GAP = 16;
  const c = document.createElement('canvas');
  c.width = items.length * (CELL + GAP) + GAP;
  c.height = CELL + 88;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f3f5';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < items.length; i++) {
    const im = new Image();
    im.src = 'data:image/png;base64,' + data[items[i][0]];
    await im.decode();
    const x = GAP + i * (CELL + GAP);
    g.drawImage(im, x, PAD, CELL, CELL);
    g.fillStyle = '#1f2329';
    g.font = '600 17px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText(items[i][1], x + CELL / 2, PAD + CELL + 26);
    g.drawImage(im, x + CELL / 2 - 24, PAD + CELL + 40, 48, 48);
  }
  return c.toDataURL('image/png').split(',')[1];
})()`;

const CODE2 = `(async () => {
  const items = ${JSON.stringify(ITEMS.filter((i) => DATA[i[0]]))};
  const data = ${JSON.stringify(DATA)};
  const sizes = [128, 64, 48, 32, 24, 16];
  const ROW = 128, COL = 150, PAD = 16, GAP = 10, LEAD = 205;
  const c = document.createElement('canvas');
  c.width = PAD * 2 + LEAD + sizes.length * (COL + GAP);
  c.height = PAD * 2 + 20 + items.length * ROW;
  const g = c.getContext('2d');
  g.fillStyle = '#f2f3f5';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1f2329';
  g.font = '600 15px "Microsoft YaHei", sans-serif';
  g.textAlign = 'center';
  sizes.forEach((s, i) => g.fillText(s + 'px', PAD + LEAD + i * (COL + GAP) + COL / 2, PAD + 14));
  for (let r = 0; r < items.length; r++) {
    const im = new Image();
    im.src = 'data:image/png;base64,' + data[items[r][0]];
    await im.decode();
    const y = PAD + 20 + r * ROW;
    g.drawImage(im, PAD, y, 112, 112);
    g.fillStyle = '#1f2329';
    g.font = '600 16px "Microsoft YaHei", sans-serif';
    g.textAlign = 'left';
    g.fillText(items[r][1], PAD + 118, y + 60);
    sizes.forEach((s, i) => {
      const x = PAD + LEAD + i * (COL + GAP) + COL / 2;
      g.drawImage(im, x - s / 2, y + 56 - s / 2, s, s);
    });
  }
  return c.toDataURL('image/png').split(',')[1];
})()`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body style="margin:0"></body></html>');
  const b64 = await win.webContents.executeJavaScript(CODE);
  const out = path.join(__dirname, 'sheet-options.png');
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log('written', out, fs.statSync(out).size);
  const b64b = await win.webContents.executeJavaScript(CODE2);
  const out2 = path.join(__dirname, 'sheet-small-sizes.png');
  fs.writeFileSync(out2, Buffer.from(b64b, 'base64'));
  console.log('written', out2, fs.statSync(out2).size);
  app.exit(0);
}).catch((e) => { console.error('FAILED', (e && e.stack) || e); app.exit(1); });
