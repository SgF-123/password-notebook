/* turn.js 翻页帧时序：连翻多页，统计每页动画期间的帧间隔，找出 >32ms 的卡帧 */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = path.join(__dirname, '..', 'renderer', 'notebook', 'index.html');
const TAG = process.argv[2] || 'perf';

const MON = `
(() => {
  window.__f = [];
  let on = false;
  const tick = (t) => { if (on) window.__f.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__start = () => { window.__f = []; on = true; };
  window.__stop = () => { on = false; return window.__f.slice(); };
  return true;
})()
`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 860, show: false, backgroundColor: '#0c0d10' });
  win.webContents.setBackgroundThrottling(false);
  win.showInactive();
  await win.loadFile(FILE);
  await wait(1800);
  await win.webContents.executeJavaScript(MON);
  const q = (js) => win.webContents.executeJavaScript(js);
  // 预热：先翻一页再复位，摊掉首帧的懒初始化开销
  await q('window.__nb.next(); true'); await wait(1200);
  await q('window.__nb.gotoPage(1); true'); await wait(600);

  const rows = [];
  // 从封面往内翻 6 页
  for (let k = 0; k < 6; k++) {
    await q('window.__start(); window.__nb.next(); true');
    await wait(1150);
    const frames = JSON.parse(await q('JSON.stringify(window.__stop())'));
    const gaps = [];
    for (let i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1]);
    rows.push(gaps);
    const sorted = gaps.slice().sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0;
    const worst = sorted[sorted.length - 1] || 0;
    const over32 = gaps.filter((g) => g > 32).length;
    console.log(`turn ${k}: frames=${gaps.length} median=${med.toFixed(1)}ms worst=${worst.toFixed(1)}ms >32ms:${over32}`);
    await q(`window.__nb.gotoPage(${k + 2}); true`);   // 复位进度，保证每次都是完整翻页
    await wait(500);
  }
  const all = [].concat(...rows).sort((a, b) => a - b);
  const P = (qq) => all[Math.min(all.length - 1, Math.floor(all.length * qq))];
  console.log('ALL gaps: n=' + all.length, 'median', P(0.5).toFixed(1), 'p90', P(0.9).toFixed(1), 'p99', P(0.99).toFixed(1), 'max', all[all.length - 1].toFixed(1), '>32ms:', all.filter((v) => v > 32).length);
  app.quit();
});
