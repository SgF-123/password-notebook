/* 临时预览/自检脚本：Electron 打开手写密码本 → 截图 + 几何校验（收尾会删）
   用法： electron work/shot-notebook.js [目标 html] [输出前缀]                */
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const FILE = process.argv[2] || path.join(__dirname, '..', 'renderer', 'notebook', 'index.html');
const PREFIX = process.argv[3] || '';
const OUT = path.join(__dirname, 'shots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 关掉过渡动画后再量尺寸，避免量到动画中间值
const FREEZE = `
  (() => {
    if (!document.getElementById('noanim')) {
      const s = document.createElement('style');
      s.id = 'noanim';
      s.textContent = '*{transition:none !important}';
      document.head.appendChild(s);
    }
    return true;
  })()
`;

const SETSTATE = (turned, partial) => `(() => {
  const nb = window.__nb;
  nb.state.turned = ${turned};
  for (let i = 0; i < nb.leafCount; i++) nb.setP(i, i < ${turned} ? 1 : 0, false);
  nb.state.active = null;
  const partial = ${JSON.stringify(partial || null)};
  if (partial) { nb.state.active = partial.i; nb.setP(partial.i, partial.p, false); }
  nb.layout();
  return true;
})()`;

const CHECKS = `
(async () => {
  const nb = window.__nb;
  const out = { leafCount: nb.leafCount, pages: nb.pages.length, problems: [], info: {} };
  const setState = (turned) => {
    nb.state.turned = turned;
    for (let i = 0; i < nb.leafCount; i++) nb.setP(i, i < turned ? 1 : 0, false);
    nb.state.active = null; nb.layout();
  };
  // 书本会随开合左右平移，所以每次都要重新量
  const rectOf = (sel) => document.querySelector(sel).getBoundingClientRect();
  const bookNow = () => document.getElementById('book').getBoundingClientRect();
  const stage = document.getElementById('stage').getBoundingClientRect();

  // 1) 内容溢出
  document.querySelectorAll('.page').forEach((pg, i) => {
    const over = pg.scrollHeight - pg.clientHeight;
    if (over > 1) out.problems.push('overflow page#' + i + ' +' + over + 'px');
  });
  // 页面元素是否超出页框
  document.querySelectorAll('.page').forEach((pg, i) => {
    const pr = pg.getBoundingClientRect();
    pg.querySelectorAll('.entry,.toc-row,.stat-row').forEach((c) => {
      const cr = c.getBoundingClientRect();
      if (cr.bottom > pr.bottom + 1 || cr.right > pr.right + 1) out.problems.push('child out of page#' + i + ' (' + c.className + ')');
    });
  });

  // 2) 背面(左页)排版方向：左页页码应贴书本最左，右页页码贴书本最右
  setState(1);
  const book1 = bookNow();
  const lr = document.querySelectorAll('.leaf')[0].querySelector('.leaf-face.back .page-no').getBoundingClientRect();
  const rr = document.querySelectorAll('.leaf')[1].querySelector('.leaf-face.front .page-no').getBoundingClientRect();
  out.info.leftPageNoX = Math.round(lr.left);
  out.info.rightPageNoRight = Math.round(rr.right);
  out.info.book1 = [Math.round(book1.left), Math.round(book1.right)];
  if (Math.abs(lr.left - book1.left) > 90) out.problems.push('left page mirrored/misplaced x=' + Math.round(lr.left) + ' bookLeft=' + Math.round(book1.left));
  if (Math.abs(rr.right - book1.right) > 90) out.problems.push('right page misplaced x=' + Math.round(rr.right) + ' bookRight=' + Math.round(book1.right));

  // 3) 合上时封面居中
  setState(0);
  const cover = document.querySelector('.leaf .leaf-face.front').getBoundingClientRect();
  out.info.coverOffset = Math.round((cover.left + cover.right) / 2 - (stage.left + stage.width / 2));
  if (Math.abs(out.info.coverOffset) > stage.width * 0.05) out.problems.push('cover not centered offset=' + out.info.coverOffset);
  out.info.coverWidth = Math.round(cover.width);

  // 4) 翻到 1/4 时：前脸应还在书脊右侧附近（左边缘≈书脊）
  const book0 = bookNow();
  nb.state.active = 0; nb.setP(0, 0.25, false);
  const q = document.querySelector('.leaf .leaf-face.front').getBoundingClientRect();
  out.info.quarterLeft = Math.round(q.left);
  out.info.spineX = Math.round(book0.left + book0.width / 2);
  if (Math.abs(q.left - out.info.spineX) > 40) out.problems.push('turning leaf hinge off spine (' + out.info.quarterLeft + ' vs ' + out.info.spineX + ')');
  // 5) 翻到底：该页应落到左边
  nb.setP(0, 1, false);
  const done = document.querySelector('.leaf .leaf-face.back').getBoundingClientRect();
  out.info.turnedLeft = Math.round(done.left);
  if (done.left > book0.left + book0.width * 0.35) out.problems.push('turned leaf did not land on the left x=' + Math.round(done.left));

  // 5b) 弧面：翻页中应该真的弯了（投影宽度明显小于平放）
  if (nb.curlMode) {
    // 卷曲模式：翻页中应该由 canvas 接管、DOM 页隐藏、画面有内容
    nb.setP(0, 0.5, false);
    await new Promise((r) => setTimeout(r, 400));      // 等贴图（异步栅格化）就位
    const cv = document.querySelector('.curl-canvas');
    const shown = getComputedStyle(cv).display !== 'none';
    const hidden = getComputedStyle(document.querySelector('.spread')).visibility === 'hidden';
    out.info.curl = { shown, domHidden: hidden, canvas: [cv.width, cv.height] };
    if (!shown) out.problems.push('curl canvas not shown while turning');
    if (!hidden) out.problems.push('DOM spread still visible while turning');
    const g = cv.getContext('2d');
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    let min = 255, max = 0, sum = 0, n = 0;
    for (let i = 0; i + 3 < d.length; i += 16) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v < min) min = v; if (v > max) max = v; sum += v; n++;
    }
    out.info.curlPixels = { min: Math.round(min), max: Math.round(max), mean: Math.round(sum / n) };
    if (max - min < 60) out.problems.push('curl canvas looks flat/blank (range ' + Math.round(max - min) + ')');
    nb.setP(0, 1, false);
  }
  if (!nb.curlMode) {
  const flatW = book0.width / 2;
  const bendAt = (p) => {
    nb.setP(0, p, false);
    const rig = document.getElementById('curler');
    if (getComputedStyle(rig).display === 'none') return null;
    const rr = rig.getBoundingClientRect();
    const segs = [...rig.querySelectorAll('.seg')];
    const lr = segs[segs.length - 1].getBoundingClientRect();
    return Math.round(lr.right - rr.left);
  };
  out.info.flatHalfWidth = Math.round(flatW);
  out.info.projected25 = bendAt(0.25);
  out.info.projected50 = bendAt(0.5);
  out.info.projected75 = bendAt(0.75);
  if (out.info.projected50 === null) out.problems.push('curler not used while turning');
  else if (out.info.projected50 > flatW * 0.9) out.problems.push('page still looks flat at p=0.5 (' + out.info.projected50 + '/' + Math.round(flatW) + ')');
  if (out.info.projected75 !== null && out.info.projected75 > flatW * 0.98) out.problems.push('no bend near the end');
  const segW = document.querySelector('#curler .seg') ? document.querySelector('#curler .seg').offsetWidth : 0;
  if (segW && (segW < 20 || segW > flatW)) out.problems.push('segment width odd: ' + Math.round(segW));

  // 5d) 书本平移 & 右页位置（确认翻页时底下的页确实在书的右半边）
  const stateInfo = (p) => {
    nb.setP(0, p, false);
    const b = document.getElementById('book').getBoundingClientRect();
    const wr = document.getElementById('bookWrap');
    const l1 = document.querySelectorAll('.leaf')[1].querySelector('.leaf-face.front').getBoundingClientRect();
    return {
      p,
      shift: getComputedStyle(wr).getPropertyValue('--shift').trim(),
      book: [Math.round(b.left), Math.round(b.right)],
      spine: Math.round(b.left + b.width / 2),
      tocPage: [Math.round(l1.left), Math.round(l1.right)]
    };
  };
  out.info.states = [stateInfo(0), stateInfo(0.3), stateInfo(0.55)];
  out.info.states.forEach((s) => {
    if (Math.abs(s.tocPage[0] - s.spine) > 12) out.problems.push('bottom page not attached to spine at p=' + s.p + ' (' + s.tocPage[0] + ' vs ' + s.spine + ')');
  });

  // 5c) 沿页面中线逐点命中测试：弧面必须是“一整段连续”的，中间不能漏出背景（接缝/空洞）
  const scan = (p) => {
    nb.setP(0, p, false);
    const rig = document.getElementById('curler');
    rig.style.pointerEvents = 'auto';
    const rr = rig.getBoundingClientRect();
    const y = Math.round(rr.top + rr.height * 0.5);
    const x0 = Math.round(rr.left - flatW);
    const x1 = Math.round(rr.left + flatW);
    const bits = [];
    for (let x = x0; x <= x1; x += 2) {
      const hit = document.elementsFromPoint(x, y).some((e) => e.classList && e.classList.contains('seg-face'));
      bits.push(hit ? 1 : 0);
    }
    rig.style.pointerEvents = 'none';
    const first = bits.indexOf(1);
    const last = bits.lastIndexOf(1);
    if (first < 0) return { p, covered: 0 };
    const runLen = last - first + 1;
    const filled = bits.slice(first, last + 1).reduce((a, b) => a + b, 0);
    return {
      p,
      startOffset: x0 + first * 2 - Math.round(rr.left),   // 起点相对书脊的偏移（应≈0）
      width: runLen * 2,
      holes: runLen - filled                               // 连续区域内漏点的个数（接缝）
    };
  };
  out.info.scan25 = scan(0.25);
  out.info.scan50 = scan(0.5);
  out.info.scan75 = scan(0.75);
  [['scan25', out.info.scan25], ['scan50', out.info.scan50], ['scan75', out.info.scan75]].forEach(([n, s]) => {
    if (!s || !s.width) { out.problems.push(n + ': curve shows nothing'); return; }
    if (s.holes > 3) out.problems.push(n + ': seams/holes in the curved page (' + s.holes + ')');
    // 前半程：纸应还挂在书脊上；后半程：重心应该已经跑到左边去了
    if (n !== 'scan75' && Math.abs(s.startOffset) > 12) out.problems.push(n + ': page not attached to the spine (offset ' + s.startOffset + ')');
    if (n === 'scan75' && s.startOffset > -20) out.problems.push(n + ': page has not crossed to the left (offset ' + s.startOffset + ')');
  });
  nb.setP(0, 1, false);
  }   // end if (!nb.curlMode)

  // 6b) 静止时卷角必须看不见（之前封面上漏出一个米白三角）
  setState(0);
  const curlEl = document.querySelector('.leaf .leaf-face.front .curl');
  const curlCs = getComputedStyle(curlEl);
  const curlRect = curlEl.getBoundingClientRect();
  out.info.curlAtRest = { opacity: curlCs.opacity, width: Math.round(curlRect.width) };
  if (parseFloat(curlCs.opacity) > 0.05 || curlRect.width > 6) {
    out.problems.push('curl visible at rest (opacity ' + curlCs.opacity + ', w=' + Math.round(curlRect.width) + ')');
  }
  // 封面右下角那块米白三角到底是谁画的？
  const covRect = document.querySelector('.leaf .leaf-face.front .page.cover').getBoundingClientRect();
  const probePts = [[-24, -24], [-48, -48], [-70, -70], [-100, -100]];
  out.info.cornerStack = probePts.map(([dx, dy]) => {
    const x = Math.round(covRect.right + dx);
    const y = Math.round(covRect.bottom + dy);
    return { at: [x, y], els: document.elementsFromPoint(x, y).slice(0, 4).map((e) => (e.tagName + '.' + (e.className || '')).slice(0, 60)) };
  });

  // 6) 内容抽查
  const anyVal = document.querySelector('.e-val');
  out.info.valFont = anyVal ? getComputedStyle(anyVal).fontFamily : null;
  out.info.pwSample = document.querySelector('.e-val.pw') ? document.querySelector('.e-val.pw').textContent.trim().slice(0, 12) : null;
  out.info.entries = document.querySelectorAll('.e-head').length;
  out.info.tocRows = document.querySelectorAll('.toc-row').length;
  out.info.tocHeads = [...document.querySelectorAll('.toc-head')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
  out.info.tocFirst = document.querySelector('.toc-row') ? document.querySelector('.toc-row').textContent.replace(/\\s+/g, ' ').trim() : null;
  out.info.pageNumbers = [...document.querySelectorAll('.page-no')].map((e) => e.textContent).join(',');
  out.info.rowsPerContentPage = [...document.querySelectorAll('.page')]
    .map((pg) => pg.querySelectorAll('.e-head,.e-sep,.e-line').length)
    .filter((n) => n > 0);

  setState(1);
  return JSON.stringify(out, null, 1);
})()
`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: 1360, height: 920, show: true, backgroundColor: '#16171b',
    webPreferences: { paintWhenInitiallyHidden: true, contextIsolation: true }
  });
  win.showInactive();
  const errors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) errors.push(level + ': ' + msg); });

  await win.loadFile(FILE);
  await wait(2000);
  await win.webContents.executeJavaScript(FREEZE);   // 关掉过渡，保证抓到的是确定状态
  await wait(200);

  const shot = async (name, turned, partial) => {
    await win.webContents.executeJavaScript(SETSTATE(turned, partial));
    await wait(600);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, PREFIX + name + '.png'), img.toPNG());
    console.log('shot:', PREFIX + name);
  };

  // 局部放大：抓某个元素所在区域的裁切图（避免整屏被缩放看不清）
  const crop = async (name, turned, partial, sel, hFrac) => {
    try {
      await win.webContents.executeJavaScript(SETSTATE(turned, partial));
      await wait(500);
      const js = 'JSON.stringify((() => { const e = document.querySelector(' + JSON.stringify(sel) + ');' +
        'if (!e) return null; const b = e.getBoundingClientRect();' +
        'return { x: b.left, y: b.top, width: b.width, height: b.height }; })())';
      const raw = await win.webContents.executeJavaScript(js);
      const r = raw ? JSON.parse(raw) : null;
      if (!r) { console.log('crop: no element', sel); return; }
      const rect = {
        x: Math.round(r.x) + 4, y: Math.round(r.y) + 4,
        width: Math.max(80, Math.round(r.width * 0.58)),
        height: Math.round(r.height * (hFrac || 0.6))
      };
      const img = await win.webContents.capturePage(rect);
      const png = img.toPNG();
      fs.writeFileSync(path.join(OUT, PREFIX + name + '.png'), png);
      console.log('crop:', PREFIX + name, JSON.stringify(rect), png.length + 'B');
    } catch (e) {
      console.log('crop FAILED', name, sel, e && e.message);
    }
  };

  await shot('01-cover', 0);
  await shot('02-quarter', 0, { i: 0, p: 0.25 });
  await shot('03-half', 0, { i: 0, p: 0.6 });
  await shot('03b-bend30', 0, { i: 0, p: 0.3 });
  await shot('03c-bend55', 0, { i: 0, p: 0.55 });
  await shot('03d-bend80', 0, { i: 0, p: 0.8 });
  await shot('04-spread1', 1);
  await shot('05-spread2', 2);
  await shot('06-spread3', 3);
  await shot('07-turning', 4, { i: 4, p: 0.35 });
  await shot('08-tail', 4);
  await shot('09-backcover', 99);

  // 局部细节
  // 封面右下角放大（找那块神秘米白三角）
  await win.webContents.executeJavaScript(SETSTATE(0, null));
  await wait(400);
  const cornerRaw = await win.webContents.executeJavaScript(`(() => {
    const c = document.querySelector('.leaf .leaf-face.front .page.cover').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(c.right - 230), y: Math.round(c.bottom - 230), width: 300, height: 300 });
  })()`);
  const cornerRect = JSON.parse(cornerRaw);
  const cornerImg = await win.webContents.capturePage(cornerRect);
  fs.writeFileSync(path.join(OUT, PREFIX + 'c0-cover-corner.png'), cornerImg.toPNG());
  console.log('corner crop:', JSON.stringify(cornerRect));

  await crop('c1-left-page-top', 3, null, '.leaf:nth-child(3) .leaf-face.back .page', 0.62);
  await crop('c2-right-page-top', 3, null, '.leaf:nth-child(4) .leaf-face.front .page', 0.62);
  await crop('c3-cover-center', 0, { i: 0, p: 0 }, '.leaf:nth-child(1) .leaf-face.front .page', 0.75);
  await crop('c4-toc', 1, null, '.leaf:nth-child(2) .leaf-face.front .page', 0.62);
  await crop('c5-mid-turn', 0, { i: 0, p: 0.3 }, '.leaf:nth-child(1) .leaf-face.front .page', 1);
  console.log('--- checks ---');
  console.log(await win.webContents.executeJavaScript(CHECKS));
  console.log('--- page errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none') + ' ---');
  app.quit();
}

app.whenReady().then(() => { main().catch((e) => { console.error('FAIL', e); app.exit(1); }); });
app.on('window-all-closed', () => app.quit());
