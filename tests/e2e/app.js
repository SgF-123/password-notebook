/* 端到端冒烟测试：创建密码本 → 写一条 → 翻页/目录 → 改 → 设置 → 改主密码 → 撕掉
 *
 * 跑法：npm run test:e2e      （= npx electron tests/e2e/app.js）
 * 用独立数据目录 data-test/，绝不碰你自己的 data/vault.dat。
 * 走的是真身同一套 IPC 装配（src/main/ipc）和同一个 preload，只少了窗口生命周期。
 */

const { app, BrowserWindow, ipcMain, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.VAULT_DATA_DIR = path.join(ROOT, 'data-test');
app.setPath('userData', path.join(process.env.VAULT_DATA_DIR, 'userdata'));

const { registerIpc } = require(path.join(ROOT, 'src', 'main', 'ipc'));

const PW_OLD = 'demo123456';
const PW_NEW = 'new-master-654321';

let passed = 0;
let failed = 0;

function check(step, ok, extra) {
  if (ok) passed++; else failed++;
  const tail = extra === undefined ? '' : ' | ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step}${tail}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** console-message 事件在新老 Electron 上签名不一样，这里两种都认 */
function readConsoleMessage(args) {
  const e = args[0];
  if (e && typeof e.level === 'string') {
    const level = { debug: 0, info: 1, warning: 2, error: 3 }[e.level] || 0;
    return { level, message: e.message, source: e.sourceId, line: e.lineNumber };
  }
  if (e && typeof e.level === 'number') return { level: e.level, message: e.message, source: e.sourceId, line: e.lineNumber };
  return { level: args[1] || 0, message: args[2], source: args[4], line: args[3] };
}

async function main() {
  const vaultFile = path.join(process.env.VAULT_DATA_DIR, 'vault.dat');
  if (fs.existsSync(vaultFile)) fs.unlinkSync(vaultFile);
  console.log('VAULT_FILE:', vaultFile);

  registerIpc(ipcMain, { clipboard, shell });

  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const rendererErrors = [];
  win.webContents.on('console-message', (...args) => {
    const m = readConsoleMessage(args);
    if (m.level >= 2) {
      rendererErrors.push(`${m.message} (${m.source}:${m.line})`);
      console.log(`[renderer] ${m.message} (${m.source}:${m.line})`);   // 立刻打出来，出错时才好定位
    }
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer-gone]', JSON.stringify(d)));

  await win.loadFile(path.join(ROOT, 'renderer', 'index.html'));

  const q = (js) => win.webContents.executeJavaScript(js, true);
  const waitFor = async (js, timeout) => {
    const limit = timeout || 6000;
    const start = Date.now();
    while (Date.now() - start < limit) {
      if (await q(js)) return true;
      await wait(100);
    }
    return false;
  };

  // ---------- 1. 桥接层 + DOM ----------
  let r = await q(`({
    vault: typeof window.vaultAPI === 'object' && typeof window.vaultAPI.unlock === 'function',
    win: typeof window.winAPI === 'object' && typeof window.winAPI.toggleMaximize === 'function',
    nb: typeof window.__mountNotebook === 'function' && typeof window.__nb === 'object',
    fns: ['exists','create','unlock','load','save','changeMaster','lock','copy','openExternal'].every((k) => typeof window.vaultAPI[k] === 'function')
  })`);
  check('preload 桥接：vaultAPI 九个门面齐全 / winAPI / 翻页本', r.vault && r.win && r.nb && r.fns, r);

  r = await q(`({
    title: document.title,
    lock: !!__app.byId('lock-submit'), app: !!__app.byId('screen-app'), book: !!__app.byId('book'),
    write: !!__app.byId('btn-write-new'), winBtns: document.querySelectorAll('[data-win]').length,
    pagesBeforeLogin: document.querySelectorAll('#book .nb-page').length,
    appHidden: __app.byId('screen-app').classList.contains('hidden')
  })`);
  check('界面结构完整，登录前本子是空的',
    r.title === '密码本' && r.lock && r.app && r.book && r.write && r.winBtns === 6 && r.pagesBeforeLogin === 0 && r.appHidden, r);

  // ---------- 2. 首次启动是「创建密码本」 ----------
  await waitFor(`__app.byId('lock-subtitle') && __app.byId('lock-submit').textContent.indexOf('创建') === 0`);
  r = await q(`({
    title: __app.byId('lock-title').textContent,
    btn: __app.byId('lock-submit').textContent,
    confirm: !__app.byId('lock-confirm-wrap').classList.contains('hidden'),
    chars: document.querySelectorAll('#chars-stage > div > div').length
  })`);
  check('首次启动：解锁屏切到「创建密码本」+ 动画小人挂上',
    r.title.indexOf('创建') === 0 && r.confirm && r.chars === 4, r);

  // 两次密码不一致要拦住
  await q(`__app.byId('lock-password').value='${PW_OLD}'; __app.byId('lock-confirm').value='${PW_OLD}x'; __app.byId('lock-submit').click(); true`);
  check('两次主密码不一致 -> 有提示', await waitFor(`__app.byId('lock-error').textContent.indexOf('不一致') >= 0`, 3000),
    await q(`__app.byId('lock-error').textContent`));

  // ---------- 3. 创建 ----------
  await q(`__app.byId('lock-confirm').value='${PW_OLD}'; __app.byId('lock-submit').click(); true`);
  const entered = await waitFor(`!__app.byId('screen-app').classList.contains('hidden') && window.__nb.pageCount > 0`, 9000);
  await waitFor(`__app.byId('screen-lock').classList.contains('hidden')`, 6000);   // 等过渡真的跑完（锁屏收起）
  await wait(400);
  r = await q(`({
    items: __app.state.payload.items.length,
    pages: window.__nb.pageCount,
    cover: !!document.querySelector('.cover'),
    coverOwner: (document.querySelector('.cover-owner') || {}).textContent,
    lockHidden: __app.byId('screen-lock').classList.contains('hidden')
  })`);
  check('创建密码本 -> 翻开一本空本子（封面 + 目录 + 空白页）',
    entered && r.items === 0 && r.pages >= 3 && r.cover && r.lockHidden, r);

  // ---------- 4. 写一条 ----------
  await q(`__app.byId('btn-write-new').click(); true`);
  const sheetUp = await waitFor(`!!document.querySelector('.es')`, 5000);
  r = await q(`({ sheet: !!document.querySelector('.es'), rows: document.querySelectorAll('.es-row').length,
    labels: [...document.querySelectorAll('.es-label')].map((x) => x.textContent).join('/') })`);
  check('「＋」写一条：翻到一张能直接写的表格页',
    sheetUp && r.sheet && r.rows >= 6 && /标题/.test(r.labels) && /密码/.test(r.labels), r);

  // ---------- 4b. 👁 看密码要过主密码 ----------
  r = await q(`({
    type: __app.byId('es-password').type,
    eye: !!__app.byId('es-eye'),
    len: __app.byId('es-password').value.length
  })`);
  check('编辑页：密码默认遮住（type=password），👁 就在旁边',
    r.type === 'password' && r.eye && r.len === 20, r);

  await q(`__app.byId('es-eye').click(); true`);
  check('点 👁 弹出主密码框', await waitFor(`!!document.querySelector('.ask-input')`, 4000));

  await q(`(() => { document.querySelector('.ask-input').value = 'wrong-password';
    document.querySelector('.ask-btn--ok').click(); return true; })()`);
  check('主密码不对 -> 拦下并原地提示',
    await waitFor(`((document.querySelector('.ask-err') || {}).textContent || '').length > 0`, 5000),
    await q(`(document.querySelector('.ask-err') || {}).textContent`));
  r = await q(`({ stillMasked: __app.byId('es-password').type === 'password', boxOpen: !!document.querySelector('.ask-input') })`);
  check('不对就不给看，框还留着让人再试', r.stillMasked && r.boxOpen, r);

  await q(`(() => { document.querySelector('.ask-input').value = '${PW_OLD}';
    document.querySelector('.ask-btn--ok').click(); return true; })()`);
  const revealed = await waitFor(`!document.querySelector('.ask-input')`, 6000);
  r = await q(`({ type: __app.byId('es-password').type, on: __app.byId('es-eye').classList.contains('on'),
    mono: /Mono|Consolas|monospace|Courier/i.test(getComputedStyle(__app.byId('es-password')).fontFamily) })`);
  check('主密码对了 -> 显示出来，👁 亮起，且换成了等宽阅读字体',
    revealed && r.type === 'text' && r.on && r.mono, r);

  await q(`__app.byId('es-eye').click(); true`);
  await wait(400);
  r = await q(`({ type: __app.byId('es-password').type, on: __app.byId('es-eye').classList.contains('on') })`);
  check('再点一下 -> 收回去（不用再验）', r.type === 'password' && r.on === false, r);

  await q(`(() => {
    __app.byId('es-title').value = 'GitHub';
    __app.byId('es-username').value = 'free-dev';
    __app.byId('es-password').value = 'Tb#8kLm2Qv!';
    __app.byId('es-url').value = 'github.com';
    __app.byId('es-notes').value = '主账号';
    document.querySelector('.es-cat[data-cat="work"]').click();
    __app.byId('es-fav').checked = true;
    __app.byId('es-save').click();
    return true;
  })()`);
  const saved = await waitFor(`__app.state.payload.items.length === 1`, 5000);
  await wait(900);
  r = await q(`({
    items: __app.state.payload.items.length,
    title: __app.state.payload.items[0] && __app.state.payload.items[0].title,
    cat: __app.state.payload.items[0] && __app.state.payload.items[0].category,
    fav: __app.state.payload.items[0] && __app.state.payload.items[0].favorite,
    onPage: !!document.querySelector('.entry[data-entry-id]'),
    sheetGone: !document.querySelector('.es'),
    masked: document.body.classList.contains('masked')
  })`);
  check('写进本子：条目上纸、分类/常用都对、密码默认遮住',
    saved && r.items === 1 && r.title === 'GitHub' && r.cat === 'work' && r.fav === true && r.onPage && r.sheetGone && r.masked, r);

  // ---------- 4c. 本子页面上也能验密看一眼 ----------
  await wait(600);
  r = await q(`({ eye: !!document.querySelector('.entry .e-eye'),
    masked: document.body.classList.contains('masked'),
    read: !!document.querySelector('.pw-read') })`);
  check('本子页面：密码行有 👁，此刻还没有明文读出来', r.eye && r.masked && r.read === false, r);

  await q(`document.querySelector('.entry .e-eye').click(); true`);
  check('页面上点 👁 也要输主密码', await waitFor(`!!document.querySelector('.ask-input')`, 4000));
  await q(`(() => { document.querySelector('.ask-input').value = '${PW_OLD}';
    document.querySelector('.ask-btn--ok').click(); return true; })()`);
  const pageRevealed = await waitFor(`!!document.querySelector('.pw-read')`, 6000);
  r = await q(`({ shown: !!document.querySelector('.e-val.pw.pw-shown'),
    text: (document.querySelector('.pw-read') || {}).textContent,
    mono: /Mono|Consolas|monospace|Courier/i.test(getComputedStyle(document.querySelector('.pw-read')).fontFamily) })`);
  check('主密码对了 -> 这条读出来（等宽字体）', pageRevealed && r.shown && r.text === 'Tb#8kLm2Qv!' && r.mono, r);

  await q(`document.querySelector('.entry .e-eye').click(); true`);
  await wait(400);
  r = await q(`({ read: !!document.querySelector('.pw-read'), shown: !!document.querySelector('.e-val.pw.pw-shown') })`);
  check('收起来之后页面上不留明文', r.read === false && r.shown === false, r);

  // ---------- 5. 磁盘上是密文 v2 ----------
  const onDisk = JSON.parse(fs.readFileSync(vaultFile, 'utf8'));
  const diskText = JSON.stringify(onDisk);
  check('磁盘上加密落盘：v2 文件 + kdf 参数，明文/主密码都不在文件里',
    onDisk.version === 2 && onDisk.kdf && onDisk.kdf.name === 'scrypt' &&
    !diskText.includes('GitHub') && !diskText.includes(PW_OLD),
    { version: onDisk.version, kdf: onDisk.kdf && onDisk.kdf.name });

  // ---------- 6. 翻页 / 目录 ----------
  await q(`window.__nb.gotoPage(1); true`);
  await wait(500);
  await q(`window.__nb.next(); true`);
  await wait(700);
  const afterNext = await q(`window.__nb.currentPage()`);
  await q(`window.__nb.prev(); true`);
  await wait(700);
  const afterPrev = await q(`window.__nb.currentPage()`);
  check('翻页：下一页 / 上一页 都动得起来', afterNext === 2 && afterPrev === 1, { afterNext, afterPrev });

  await q(`document.getElementById('ribbon').click(); true`);
  await wait(900);
  check('书签带（目录）能跳页', (await q(`window.__nb.currentPage()`)) >= 2, await q(`window.__nb.currentPage()`));

  // 翻页不能被吞：慢慢翻三页，每页都要真的往前走
  r = await q(`(async () => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      const before = window.__nb.currentPage();
      window.__nb.next();
      await new Promise((res) => setTimeout(res, 1000));
      out.push(before + '>' + window.__nb.currentPage());
    }
    return out.join(' ');
  })()`);
  check('慢慢翻三页：每次都真的往前走', r.split(' ').every((p) => p.split('>')[0] !== p.split('>')[1]), r);

  // 连按也不能丢：连点 4 次，最终要往前走 4 页（允许动画慢慢追上）
  r = await q(`(async () => {
    window.__nb.gotoPage(1);                       // 先回到第 1 页，不然已经到最后一页了
    await new Promise((res) => setTimeout(res, 1400));
    const before = window.__nb.currentPage();
    for (let i = 0; i < 4; i++) { window.__nb.next(); await new Promise((res) => setTimeout(res, 40)); }
    await new Promise((res) => setTimeout(res, 4000));
    return { before, after: window.__nb.wantPage, turnReport: window.__nb.currentPage(), total: window.__nb.pageCount };
  })()`);
  check('连按 4 次下一页：一次都不丢（累计前进）', r.after - r.before === 4, r);

  // 每一行目录点过去，那一页都要真的出现在视野里
  r = await q(`(async () => {
    const rows = [...document.querySelectorAll('.toc-row')];
    const stage = document.getElementById('stage').getBoundingClientRect();
    const bad = [];
    for (const row of rows) {
      const want = Number(row.dataset.page);
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((res) => setTimeout(res, 850));
      const els = [...document.querySelectorAll('#book .nb-page .page-no')];
      const hit = els.find((e) => Number(e.textContent) === want);
      if (!hit) { bad.push(want + '不在DOM'); continue; }
      const rr = hit.closest('.nb-page').getBoundingClientRect();
      if (!(rr.left < stage.right - 4 && rr.right > stage.left + 4)) bad.push(want + '不在视野');
    }
    return { rows: rows.length, bad: bad.join(',') };
  })()`);
  check('目录每一行点完，那一页真的在视野里', r.bad === '', r);

  // ---------- 7. 改这条 ----------
  await q(`__app.editItem(__app.state.payload.items[0].id); true`);
  const editUp = await waitFor(`!!document.querySelector('.es')`, 5000);
  await wait(600);
  r = await q(`({ sheet: !!document.querySelector('.es'), title: (__app.byId('es-title') || {}).value,
    del: !!__app.byId('es-delete'), saveText: (__app.byId('es-save') || {}).textContent })`);
  check('双击「改这条」：表格里带出原文，且有「撕掉这页」',
    editUp && r.sheet && r.title === 'GitHub' && r.del && r.saveText === '改好了', r);

  await q(`__app.byId('es-title').value = 'GitHub（改过）'; __app.byId('es-save').click(); true`);
  await waitFor(`__app.state.payload.items[0] && __app.state.payload.items[0].title === 'GitHub（改过）'`, 5000);
  await wait(900);
  r = await q(`({ title: __app.state.payload.items[0].title, sheetGone: !document.querySelector('.es'),
    onPage: !!document.querySelector('.entry') })`);
  check('改好了：改动落进本子并重新排版', r.title === 'GitHub（改过）' && r.sheetGone && r.onPage, r);

  // ---------- 8. 设置 ----------
  await q(`__app.byId('btn-settings').click(); true`);
  await waitFor(`!__app.byId('settings-modal').classList.contains('hidden')`);
  await q(`(() => { const o = __app.byId('setting-owner'); o.value = 'FRee'; o.dispatchEvent(new Event('change')); 
    const s = __app.byId('setting-showpwd'); s.checked = true; s.dispatchEvent(new Event('change'));
    const a = __app.byId('setting-autolock'); a.value = '15'; a.dispatchEvent(new Event('change'));
    return true; })()`);
  await wait(1200);
  r = await q(`({
    owner: __app.state.payload.settings.owner,
    cover: (document.querySelector('.cover-owner') || {}).textContent,
    masked: document.body.classList.contains('masked'),
    autoLock: __app.state.payload.settings.autoLockMinutes
  })`);
  check('设置：署名上封面、显示密码开关、自动锁定存下来',
    r.owner === 'FRee' && r.cover.indexOf('FRee') >= 0 && r.masked === false && r.autoLock === 15, r);
  await q(`__app.byId('settings-close').click(); true`);
  await wait(300);

  // ---------- 9. 密码生成器 ----------
  await q(`__app.byId('btn-generator').click(); true`);
  await waitFor(`!__app.byId('gen-modal').classList.contains('hidden')`);
  r = await q(`({ pw: __app.byId('gen-password').value, len: __app.byId('gen-password').value.length, val: __app.byId('gen-length-val').textContent })`);
  check('密码生成器：一打开就有 20 位强密码', r.len === 20 && r.val === '20', r);
  await q(`__app.byId('gen-close').click(); true`);
  await wait(300);

  // ---------- 10. 改主密码 -> 锁定 -> 新密码进 ----------
  await q(`__app.byId('btn-settings').click(); true`);
  await waitFor(`!__app.byId('settings-modal').classList.contains('hidden')`);
  await q(`(() => { __app.byId('set-oldpw').value = '${PW_OLD}'; __app.byId('set-newpw').value = '${PW_NEW}';
    __app.byId('set-newpw2').value = '${PW_NEW}'; __app.byId('btn-change-master').click(); return true; })()`);
  await waitFor(`__app.byId('settings-modal').classList.contains('hidden')`, 6000);
  check('改主密码：当前密码对，弹窗关掉', await q(`__app.byId('settings-modal').classList.contains('hidden')`));

  await q(`__app.byId('btn-lock').click(); true`);
  await waitFor(`!__app.byId('screen-lock').classList.contains('hidden')`, 4000);
  check('合上本子（锁定）：回到解锁屏', await q(`!__app.byId('screen-lock').classList.contains('hidden') && __app.byId('screen-app').classList.contains('hidden')`));

  await q(`__app.byId('lock-password').value = '${PW_OLD}'; __app.byId('lock-submit').click(); true`);
  check('旧主密码已经作废', await waitFor(`__app.byId('lock-error').textContent.indexOf('主密码错误') >= 0`, 5000),
    await q(`__app.byId('lock-error').textContent`));

  await q(`__app.byId('lock-password').value = '${PW_NEW}'; __app.byId('lock-submit').click(); true`);
  const backIn = await waitFor(`!__app.byId('screen-app').classList.contains('hidden')`, 9000);
  await wait(1400);
  r = await q(`({ items: __app.state.payload.items.length, title: __app.state.payload.items[0] && __app.state.payload.items[0].title,
    owner: __app.state.payload.settings.owner, onPage: !!document.querySelector('.entry[data-entry-id]') })`);
  check('新主密码进得来，数据都在（署名也还在）',
    backIn && r.items === 1 && r.title === 'GitHub（改过）' && r.owner === 'FRee' && r.onPage, r);

  // ---------- 11. 撕掉一页 ----------
  await q(`__app.editItem(__app.state.payload.items[0].id); true`);
  await waitFor(`!!document.querySelector('.es')`, 5000);
  await wait(600);
  await q(`(() => { window.confirm = () => true; __app.byId('es-delete').click(); return true; })()`);
  const deleted = await waitFor(`__app.state.payload.items.length === 0`, 5000);
  await wait(900);
  r = await q(`({ items: __app.state.payload.items.length, sheetGone: !document.querySelector('.es'),
    entries: document.querySelectorAll('.entry[data-entry-id]').length })`);
  check('撕掉这页：条目从本子上去掉，本子重排', deleted && r.items === 0 && r.sheetGone && r.entries === 0, r);

  // ---------- 12. 渲染层没有报错 ----------
  check('整个流程里渲染层没有报错', rendererErrors.length === 0, rendererErrors.slice(0, 5));

  if (fs.existsSync(vaultFile)) fs.unlinkSync(vaultFile);
  console.log(`\n=== 测试完成：PASS ${passed} / FAIL ${failed} ===`);
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(main).catch((e) => {
  console.error('TEST ERROR:', e);
  app.exit(1);
});
