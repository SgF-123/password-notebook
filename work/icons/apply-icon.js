/* 把选定的图标稿写进项目：
     build/icon.png   1024  （electron-builder / macOS 主图）
     build/icon.ico   多尺寸（Windows 安装包/exe）
     build/icon.icns  多尺寸（macOS）
     renderer/assets/icon.png 256（窗口图标）
   用法：node_modules\.bin\electron.cmd work\icons\apply-icon.js [设计名] [--preview]
        --preview 只出预览 PNG（work/icons/preview-*.png），不改 build/ 里的图标
   设计名：book-lock(默认) | notebook-keyhole | notebook-gold | open-book
          | notebook-pen | paper | char
*/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();

const DIR = __dirname;
const ROOT = path.join(DIR, '..', '..');
const DESIGN = (process.argv.find((a) => a.startsWith('--design=')) || '').split('=')[1]
  || process.argv.slice(2).find((a) => !a.startsWith('-'))
  || 'book-lock';

function inner(svgFile) {
  let t = fs.readFileSync(path.join(DIR, svgFile), 'utf8');
  t = t.replace(/<!--[\s\S]*?-->/g, '').trim();
  const a = t.indexOf('>', t.indexOf('<svg'));
  const b = t.lastIndexOf('</svg>');
  return t.slice(a + 1, b).trim();
}
const wrap = (i, stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${i}</svg>`;

const BOOK_LOCK = wrap(inner('lucide-book-lock.svg'), 1.75);
const NOTEBOOK_PEN = wrap(inner('lucide-notebook-pen.svg'), 1.75);
const BOOK_OPEN = wrap(inner('lucide-f-book-open.svg'), 1.65);

const CODE = `(async () => {
  const S = 1024;
  const design = ${JSON.stringify(DESIGN)};
  const svgs = ${JSON.stringify({ 'book-lock': BOOK_LOCK, 'notebook-pen': NOTEBOOK_PEN, 'open-book': BOOK_OPEN })};

  function squircle(g, r) {
    g.beginPath();
    g.moveTo(r, 0);
    g.lineTo(S - r, 0); g.quadraticCurveTo(S, 0, S, r);
    g.lineTo(S, S - r); g.quadraticCurveTo(S, S, S - r, S);
    g.lineTo(r, S); g.quadraticCurveTo(0, S, 0, S - r);
    g.lineTo(0, r); g.quadraticCurveTo(0, 0, r, 0);
    g.closePath();
  }
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }
  function greenBase(g) {
    const r = S * 0.224;
    const grad = g.createLinearGradient(S * 0.1, 0, S * 0.95, S);
    grad.addColorStop(0, '#19d675');
    grad.addColorStop(0.5, '#07c160');
    grad.addColorStop(1, '#03914c');
    g.clearRect(0, 0, S, S);
    g.fillStyle = grad;
    squircle(g, r); g.fill();
    g.save();
    squircle(g, r); g.clip();
    const hl = g.createLinearGradient(0, 0, 0, S);
    hl.addColorStop(0, 'rgba(255,255,255,.30)');
    hl.addColorStop(0.42, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, S, S);
    const sh = g.createLinearGradient(0, S * 0.55, 0, S);
    sh.addColorStop(0, 'rgba(0,60,30,0)');
    sh.addColorStop(1, 'rgba(0,60,30,.18)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    g.restore();
  }
  function keyhole(g, cx, cy, r, color) {
    g.fillStyle = color;
    g.beginPath(); g.arc(cx, cy - r * 0.70, r, 0, Math.PI * 2); g.fill();
    g.beginPath();
    g.moveTo(cx - r * 0.50, cy - r * 0.32);
    g.lineTo(cx + r * 0.50, cy - r * 0.32);
    g.lineTo(cx + r * 1.05, cy + r * 1.75);
    g.lineTo(cx - r * 1.05, cy + r * 1.75);
    g.closePath(); g.fill();
  }
  async function glyphImage(svg) {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    return img;
  }
  function coverShape(g) {
    const x = S * 0.185, y = S * 0.135, w = S * 0.63, h = S * 0.73, r = S * 0.07;
    g.save();
    g.shadowColor = 'rgba(0,50,25,.32)';
    g.shadowBlur = S * 0.05;
    g.shadowOffsetY = S * 0.018;
    g.fillStyle = '#ffffff';
    roundRect(g, x, y, w, h, r); g.fill();
    g.restore();
    return { x, y, w, h };
  }
  function notebookBook(g, gold) {
    const b = coverShape(g);
    g.fillStyle = gold ? 'rgba(120,86,40,.20)' : 'rgba(7,193,96,.18)';
    g.fillRect(b.x + b.w * 0.135, b.y + S * 0.03, S * 0.011, b.h - S * 0.06);
    g.fillStyle = gold ? 'rgba(120,86,40,.16)' : 'rgba(7,193,96,.16)';
    g.fillRect(b.x + b.w - S * 0.021, b.y + b.h * 0.10, S * 0.008, b.h * 0.80);
    const cx = b.x + b.w * 0.60, cy = b.y + b.h * 0.50;
    if (gold) {
      g.save();
      g.shadowColor = 'rgba(90,60,15,.35)';
      g.shadowBlur = S * 0.02;
      g.shadowOffsetY = S * 0.008;
      const ring = g.createRadialGradient(cx - S * 0.03, cy - S * 0.04, S * 0.01, cx, cy, S * 0.19);
      ring.addColorStop(0, '#f8e2a8');
      ring.addColorStop(0.55, '#d9ae55');
      ring.addColorStop(1, '#a9762a');
      g.fillStyle = ring;
      g.beginPath(); g.arc(cx, cy, S * 0.145, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(90,60,15,.28)'; g.lineWidth = S * 0.004;
      g.beginPath(); g.arc(cx, cy, S * 0.145, 0, Math.PI * 2); g.stroke();
      keyhole(g, cx, cy - S * 0.008, S * 0.042, '#3a240b');
    } else {
      keyhole(g, cx, cy, S * 0.105, 'rgba(3,120,64,.95)');
    }
  }
  async function openBook(g) {
    const img = await glyphImage(svgs['open-book']);
    const w = S * 0.80;
    g.drawImage(img, (S - w) / 2, (S - w) / 2 + S * 0.02, w, w);
    keyhole(g, S * 0.5 + S * 0.152, S * 0.5 + S * 0.025, S * 0.058, '#ffffff');
  }
  function paper(g) {
    const r = S * 0.224;
    g.clearRect(0, 0, S, S);
    const grad = g.createLinearGradient(S * 0.2, 0, S, S * 0.9);
    grad.addColorStop(0, '#fffdf6');
    grad.addColorStop(0.6, '#f8eeda');
    grad.addColorStop(1, '#e9dabc');
    g.fillStyle = grad;
    squircle(g, r); g.fill();
    g.save();
    squircle(g, r); g.clip();
    const sp = g.createLinearGradient(0, 0, S * 0.29, 0);
    sp.addColorStop(0, '#8a5a2b');
    sp.addColorStop(1, '#6a3f19');
    g.fillStyle = sp;
    g.fillRect(0, 0, S * 0.21, S);
    g.fillStyle = 'rgba(0,0,0,.15)';
    g.fillRect(S * 0.21, 0, S * 0.010, S);
    g.strokeStyle = 'rgba(255,236,205,.40)';
    g.lineWidth = S * 0.009;
    g.beginPath(); g.moveTo(S * 0.048, S * 0.10); g.lineTo(S * 0.048, S * 0.90); g.stroke();
    const hl = g.createLinearGradient(S * 0.25, 0, S, S);
    hl.addColorStop(0, 'rgba(255,255,255,.45)');
    hl.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.fillStyle = hl; g.fillRect(0, 0, S, S);
    const sh = g.createLinearGradient(0, S * 0.62, 0, S);
    sh.addColorStop(0, 'rgba(120,86,40,0)');
    sh.addColorStop(1, 'rgba(120,86,40,.18)');
    g.fillStyle = sh; g.fillRect(0, 0, S, S);
    g.restore();
    const rx = S * 0.325, rw = S * 0.062, rh = S * 0.235;
    g.fillStyle = '#d7493b';
    g.fillRect(rx, 0, rw, rh);
    g.beginPath();
    g.moveTo(rx, rh); g.lineTo(rx + rw / 2, rh - rw * 0.70); g.lineTo(rx + rw, rh);
    g.closePath(); g.fill();
    const cx = S * 0.605, cy = S * 0.53;
    g.save();
    g.shadowColor = 'rgba(90,60,15,.32)';
    g.shadowBlur = S * 0.028;
    g.shadowOffsetY = S * 0.012;
    const ring = g.createRadialGradient(cx - S * 0.03, cy - S * 0.045, S * 0.01, cx, cy, S * 0.19);
    ring.addColorStop(0, '#f8e2a8');
    ring.addColorStop(0.55, '#d9ae55');
    ring.addColorStop(1, '#a9762a');
    g.fillStyle = ring;
    g.beginPath(); g.arc(cx, cy, S * 0.160, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(90,60,15,.28)'; g.lineWidth = S * 0.004;
    g.beginPath(); g.arc(cx, cy, S * 0.160, 0, Math.PI * 2); g.stroke();
    keyhole(g, cx, cy - S * 0.006, S * 0.046, '#3a240b');
  }

  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (design === 'paper') paper(g);
  else {
    greenBase(g);
    if (design === 'notebook-keyhole') notebookBook(g, false);
    else if (design === 'notebook-gold') notebookBook(g, true);
    else if (design === 'open-book') await openBook(g);
    else if (design === 'char') {
      g.fillStyle = '#fff';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '700 ' + S * 0.547 + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
      g.fillText('本', S / 2, S / 2 + S * 0.026);
    } else {
      const im = await glyphImage(svgs[design] || svgs['book-lock']);
      const w = S * 0.70;
      g.drawImage(im, (S - w) / 2, (S - w) / 2, w, w);
    }
  }

  // 各尺寸重采样
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const png = {};
  for (const s of sizes) {
    const cc = document.createElement('canvas');
    cc.width = cc.height = s;
    const gg = cc.getContext('2d');
    gg.imageSmoothingEnabled = true;
    gg.imageSmoothingQuality = 'high';
    gg.drawImage(c, 0, 0, s, s);
    png[s] = cc.toDataURL('image/png').split(',')[1];
  }
  return png;
})()`;

function makeIco(pngs) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const entries = [];
  let offset = 6 + 16 * sizes.length;
  const parts = [];
  for (const s of sizes) {
    const data = Buffer.from(pngs[s], 'base64');
    const e = Buffer.alloc(16);
    e.writeUInt8(s >= 256 ? 0 : s, 0);
    e.writeUInt8(s >= 256 ? 0 : s, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    parts.push(data);
    offset += data.length;
  }
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  return Buffer.concat([head, ...entries, ...parts]);
}

function makeIcns(pngs) {
  const map = [[16, 'icp4'], [32, 'icp5'], [64, 'icp6'], [128, 'ic07'], [256, 'ic08'], [512, 'ic09'], [1024, 'ic10']];
  const parts = [];
  for (const [s, type] of map) {
    const data = Buffer.from(pngs[s], 'base64');
    const head = Buffer.alloc(8);
    head.write(type, 0, 4, 'latin1');
    head.writeUInt32BE(8 + data.length, 4);
    parts.push(head, data);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write('icns', 0, 4, 'latin1');
  head.writeUInt32BE(8 + body.length, 4);
  return Buffer.concat([head, body]);
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html,<html><body style="margin:0"></body></html>');
  const pngs = await win.webContents.executeJavaScript(CODE);
  const previewOnly = process.argv.includes('--preview');
  const writes = previewOnly ? [] : [
    [path.join(ROOT, 'build', 'icon.png'), Buffer.from(pngs[1024], 'base64')],
    [path.join(ROOT, 'build', 'icon.ico'), makeIco(pngs)],
    [path.join(ROOT, 'build', 'icon.icns'), makeIcns(pngs)],
    [path.join(ROOT, 'renderer', 'assets', 'icon.png'), Buffer.from(pngs[256], 'base64')],
  ];
  writes.push([path.join(DIR, 'preview-' + DESIGN + '.png'), Buffer.from(pngs[1024], 'base64')]);
  for (const [p, buf] of writes) {
    fs.writeFileSync(p, buf);
    console.log('written', p, buf.length);
  }
  console.log('design:', DESIGN);
  app.exit(0);
}).catch((e) => { console.error('FAILED', (e && e.stack) || e); app.exit(1); });
