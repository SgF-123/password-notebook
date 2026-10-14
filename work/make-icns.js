/* 生成 build/icon.icns（macOS 图标）：把 1024 的 icon.png 缩成 128/256/512/1024 塞进 icns 容器 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();

const SRC = path.join(__dirname, '..', 'build', 'icon.png');
const OUT = path.join(__dirname, '..', 'build', 'icon.icns');

function icns(chunks) {           // chunks: [{type, data:Buffer}]
  const parts = [];
  for (const c of chunks) {
    const head = Buffer.alloc(8);
    head.write(c.type, 0, 4, 'latin1');
    head.writeUInt32BE(8 + c.data.length, 4);
    parts.push(head, c.data);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'latin1');
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  const src64 = fs.readFileSync(SRC).toString('base64');
  await win.loadURL('data:text/html,<html><body style="margin:0"></body></html>');
  const out = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/png;base64,${src64}';
    await img.decode();
    const sizes = [128, 256, 512, 1024];
    const res = {};
    for (const s of sizes) {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, s, s);
      res[s] = c.toDataURL('image/png').split(',')[1];
    }
    return res;
  })()`);
  const map = { 128: 'ic07', 256: 'ic08', 512: 'ic09', 1024: 'ic10' };
  const chunks = Object.keys(out).map((s) => ({ type: map[s], data: Buffer.from(out[s], 'base64') }));
  const buf = icns(chunks);
  fs.writeFileSync(OUT, buf);
  console.log('written', OUT, buf.length, 'bytes / chunks:', chunks.map((c) => c.type + ':' + c.data.length).join(' '));
  app.exit(0);
});