/* 卡顿检测 v2：零开销采样（只读内联值，不触发样式重算），连翻 6 页，输出每页帧间隔分布 */
const { app, BrowserWindow } = require('electron');
const path = require('path');

const FILE = path.join(__dirname, '..', 'renderer', 'notebook', 'index.html');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const START = `
(() => {
  window.__log = [];
  const castR = document.getElementById('castRight');
  const rig = document.getElementById('curler');
  const leaves = [...document.querySelectorAll('.leaf')];
  window.__mark = (k) => window.__log.push({ mark: k, t: performance.now() });
  window.__on = true;
  const tick = () => {
    const i = window.__nb.state.active;
    const leaf = i === null ? leaves[0] : leaves[i];
    window.__log.push({
      t: performance.now(),
      p: +(parseFloat(leaf.style.getPropertyValue('--p')) || 0).toFixed(3),
      op: +(parseFloat(castR.style.opacity) || 0).toFixed(3),
      rig: rig.style.display === 'block' ? 1 : 0,
      act: i
    });
    if (window.__on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return true;
})()
`;

async function main() {
  const win = new BrowserWindow({
    width: 1200, height: 860, show: true, backgroundColor: '#16171b',
    webPreferences: { contextIsolation: true }
  });
  win.showInactive();
  await win.loadFile(FILE);
  await wait(1800);

  await win.webContents.executeJavaScript(START);
  const TURNS = 6;
  for (let k = 0; k < TURNS; k++) {
    await win.webContents.executeJavaScript(`window.__mark(${k}); window.__nb.next(); true`);
    await wait(1100);
  }
  await win.webContents.executeJavaScript('window.__on = false; true');
  const log = JSON.parse(await win.webContents.executeJavaScript('JSON.stringify(window.__log)'));

  const turns = [];
  let cur = null;
  log.forEach((e) => {
    if (e.mark !== undefined) { cur = { k: e.mark, f: [] }; turns.push(cur); return; }
    if (cur) cur.f.push(e);
  });

  const all = [];
  turns.forEach((tn) => {
    const f = tn.f;
    const gaps = [];
    for (let i = 1; i < f.length; i++) gaps.push({ ms: f[i].t - f[i - 1].t, p: f[i].p });
    const moving = gaps.filter((g, i) => f[i + 1].rig || f[i].rig).filter((g) => g.p > 0 && g.p < 1);
    const sorted = moving.slice().sort((a, b) => b.ms - a.ms);
    const worst = sorted[0] || { ms: 0, p: 0 };
    const over30 = moving.filter((g) => g.ms > 30).length;
    const head = moving.slice(0, 4).map((g) => Math.round(g.ms)).join('/');
    const med = moving.length ? Math.round(moving.slice().sort((a, b) => a.ms - b.ms)[Math.floor(moving.length / 2)].ms) : 0;
    moving.forEach((g) => all.push(Math.round(g.ms)));
    console.log(`turn ${tn.k}: frames=${f.length} moving=${moving.length} median=${med}ms worst=${Math.round(worst.ms)}ms@p=${worst.p} >30ms:${over30} 头4帧:${head}`);
  });
  all.sort((a, b) => a - b);
  const p = (q) => all[Math.min(all.length - 1, Math.floor(all.length * q))];
  console.log('ALL moving-frame gaps: n=' + all.length, 'median', p(0.5), 'p90', p(0.9), 'p99', p(0.99), 'max', all[all.length - 1], '| >30ms:', all.filter((v) => v > 30).length);
  app.quit();
}

app.whenReady().then(() => { main().catch((e) => { console.error('FAIL', e); app.exit(1); }); });
app.on('window-all-closed', () => app.quit());
