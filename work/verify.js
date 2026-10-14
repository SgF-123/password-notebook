/* 现况核验：动态找到"内容页"，切到该对开页，量纸面亮度（判断纸纹是否压暗/Dirty），并截图 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OUT = path.join(__dirname, 'look');
fs.mkdirSync(OUT, { recursive: true });

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1520, height: 780, show: false });
  win.webContents.setBackgroundThrottling(false);
  win.showInactive();
  const errs = [];
  win.webContents.on('console-message', (e, l, m) => { if (l >= 2 && !/Insecure Content-Security-Policy/.test(m)) errs.push(m); });
  await win.loadFile(path.join(__dirname, '..', 'renderer', 'notebook', 'index.html'));
  await wait(1800);
  const q = (js) => win.webContents.executeJavaScript(js);

  const info = await q(`(() => {
    const pages = window.__nb.pages;
    const map = pages.map((p, i) => (p.type === 'entries' ? 'entries#' + i : p.type));
    const firstEntries = pages.findIndex((p) => p.type === 'entries');
    const firstToc = pages.findIndex((p) => p.type === 'toc');
    return { count: pages.length, firstEntries, firstToc, map };
  })()`);
  console.log('pages(' + info.count + '):', info.map.join(' '));
  console.log('firstToc(pg)=' + (info.firstToc + 1), 'firstEntries(pg)=' + (info.firstEntries + 1));

  const shot = async (n) => { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, n + '.png'), img.toPNG()); };
  const idle = async () => {
    let last = null, s = 0;
    for (let i = 0; i < 80; i++) {
      const v = await q(`(() => { const mv = [...document.querySelectorAll('.nb-page')].some((el) => { const t = el.style.transform || ''; return !!t && t !== 'translate3d(0px, 0px, 0px)'; }); return JSON.stringify({ p: window.__nb.currentPage(), mv }); })()`);
      if (v === last) { s++; if (s >= 3 && !JSON.parse(v).mv) return v; } else { s = 0; last = v; }
      await wait(140);
    }
  };

  // 内容页：找到"偶数页在左"的对开（取 firstEntries 之后的对子，保证左右都是内容）
  let target = (info.firstEntries + 1) % 2 === 0 ? info.firstEntries + 1 : info.firstEntries + 2;
  if (target > info.count) target = info.firstEntries + 1;
  await q(`window.__nb.gotoPage(${target}); true`);
  await idle();
  console.log('spread page=' + (await q('window.__nb.currentPage()')));
  await shot('content-spread');

  // 量纸面：取右上内容页中心的纯纸区域亮度（避开文字/横线的整块采样）
  const paper = await q(`(() => {
    const holders = [...document.querySelectorAll('.nb-page')].filter((h) => {
      const p = h.querySelector('.page'); if (!p) return false;
      return getComputedStyle(h).display !== 'none' && h.getBoundingClientRect().width > 50 &&
        !/cover|flyleaf|blank/.test(p.className);
    });
    const b = holders[0].getBoundingClientRect();
    return { x: Math.round(b.left + 24), y: Math.round(b.top + 24), w: Math.round(b.width - 48), h: Math.round(b.height - 48), which: holders[0].querySelector('.page').className };
  })()`);
  const img = await win.webContents.capturePage(paper);
  const bmp = img.getBitmap();
  let sum = 0, n = 0, dark = 0, minL = 255, maxL = 0;
  for (let i = 0; i < bmp.length; i += 4) {
    const lum = bmp[i + 2] * 0.299 + bmp[i + 1] * 0.587 + bmp[i] * 0.114;
    sum += lum; n++; if (lum < 60) dark++; if (lum < minL) minL = lum; if (lum > maxL) maxL = lum;
  }
  console.log('paper box', paper.w + 'x' + paper.h, '(' + paper.which + ')', 'avgLum=' + (sum / n).toFixed(1), 'dark<60=' + (100 * dark / n).toFixed(2) + '%', 'lumMin=' + minL.toFixed(1), 'lumMax=' + maxL.toFixed(1));
  console.log('errors:', errs.length ? JSON.stringify(errs.slice(0, 4)) : 'none');
  app.quit();
});
