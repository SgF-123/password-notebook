// 端到端功能测试：登录 → 翻开密码本 → 在本子上写密码
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// 测试用独立数据目录：绝不碰你自己的 data\vault.dat
process.env.VAULT_DATA_DIR = path.join(__dirname, 'data-test');

app.setPath('userData', path.join(process.env.VAULT_DATA_DIR, 'userdata'));

const { registerIpc, getVaultFile } = require('./vault-core');

function log(step, ok, extra) {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${step}${extra ? ' | ' + extra : ''}`);
}

async function main() {
  if (fs.existsSync(getVaultFile())) fs.unlinkSync(getVaultFile());
  console.log('VAULT_FILE:', getVaultFile());
  console.log('vault exists after cleanup:', fs.existsSync(getVaultFile()));
  registerIpc(ipcMain, { clipboard: null, shell: null });

  // 窗口控制通道：测试环境给个最小实现，免得渲染层报「没有注册处理程序」
  ipcMain.on('win:minimize', () => {});
  ipcMain.on('win:toggleMaximize', () => {});
  ipcMain.on('win:close', () => {});
  ipcMain.handle('win:isMaximized', () => false);

  const win = new BrowserWindow({
    width: 1180, height: 800, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });

  win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) console.log(`[renderer ${level}] ${message} (${sourceId}:${line})`);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.log('[renderer-gone]', JSON.stringify(d)));
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const run = (code) => win.webContents.executeJavaScript(code, true);
  const waitFor = async (code, timeout = 6000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const ok = await run(code);
      if (ok) return true;
      await new Promise((res) => setTimeout(res, 100));
    }
    return false;
  };
  const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

  // ---------- 诊断 ----------
  let r = await run(`(async () => ({ exists: await window.vaultAPI.exists(),
    apiOk: typeof window.vaultAPI.exists === 'function',
    winApiOk: typeof window.winAPI.toggleMaximize === 'function',
    nbApi: typeof window.__mountNotebook === 'function' }))()`);
  log('诊断：vaultAPI / winAPI / 翻页本接口', r.apiOk && r.winApiOk && r.nbApi, JSON.stringify(r));

  r = await run(`({
    readyState: document.readyState,
    title: document.title,
    hasLock: !!document.getElementById('lock-submit'),
    hasApp: !!document.getElementById('screen-app'),
    hasBook: !!document.getElementById('book'),
    hasWrite: !!document.getElementById('btnWriteNew'),
    winBtns: document.querySelectorAll('[data-win]').length,
    noList: !document.getElementById('screen-main') && !document.querySelector('.rail') && !document.querySelector('.conv-list'),
    appHidden: document.getElementById('screen-app').classList.contains('hidden'),
    pagesBeforeLogin: document.querySelectorAll('#book .nb-page').length
  })`);
  log('诊断：DOM 完整性（列表界面已移除，登录前本子是空的）',
    r.title === '密码本' && r.hasLock && r.hasApp && r.hasBook && r.hasWrite && r.winBtns === 6 && r.noList && r.appHidden && r.pagesBeforeLogin === 0,
    JSON.stringify(r));

  r = await run(`({
    jqIntact: typeof window.jQuery === 'function' && typeof window.jQuery.extend === 'function' && window.$ === window.jQuery,
    helperOk: typeof byId === 'function' && !!byId('lock-submit'),
    stagePos: getComputedStyle(document.getElementById('stage')).position,
    bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0],
    bodyBg: getComputedStyle(document.body).backgroundColor
  })`);
  log('诊断：jQuery 完好 / notebook.css 没污染外壳',
    r.jqIntact && r.helperOk && r.stagePos === 'absolute' && /Segoe UI/.test(r.bodyFont), JSON.stringify(r));

  r = await run(`(() => {
    try {
      const mounted = typeof window.mountAnimatedCharacters === 'function';
      const chars = document.querySelectorAll('#chars-stage > div > div').length;
      const p = document.getElementById('lock-password');
      p.focus(); p.value = 'abc'; p.dispatchEvent(new Event('input'));
      document.getElementById('lock-eye').click();
      document.getElementById('lock-eye').click();
      p.value = ''; p.dispatchEvent(new Event('input'));
      p.blur();
      return { ok: true, mounted, chars };
    } catch (e) { return { ok: false, err: e.message }; }
  })()`);
  log('动画小人挂载与交互', r.ok === true && r.mounted === true && r.chars === 4, JSON.stringify(r));

  log('等待 init() 完成', await waitFor(`document.getElementById('lock-subtitle').textContent.includes('首次使用')`));
  r = await run(`({ lockVisible: !document.getElementById('screen-lock').classList.contains('hidden'),
    title: document.getElementById('lock-title').textContent,
    btn: document.getElementById('lock-submit').textContent })`);
  log('解锁屏初始显示（首次创建文案）',
    r.lockVisible && r.title === '创建密码本' && r.btn === '创建密码本', JSON.stringify(r));

  // ---------- 1. 创建 → 过渡动画 → 翻开本子 ----------
  await run(`document.getElementById('lock-password').value = 'test123456';
    document.getElementById('lock-confirm').value = 'test123456';
    document.getElementById('lock-submit').click(); true`);
  await waitFor(`!document.getElementById('screen-app').classList.contains('hidden')`);
  r = await run(`({
    entering: document.getElementById('screen-app').classList.contains('app-entering'),
    leaving: document.getElementById('screen-lock').classList.contains('lock-leaving'),
    hasDesk: !!document.querySelector('.desk'),
    deskOpacity: getComputedStyle(document.querySelector('.desk')).opacity,
    stageAnim: getComputedStyle(document.getElementById('stage')).animationName,
    hudAnim: getComputedStyle(document.querySelector('.hud')).animationName
  })`);
  log('登录 → 密码本有过渡动画（桌面淡入 / 本子落桌 / 控制条上滑）',
    r.entering && r.leaving && r.hasDesk && r.stageAnim === 'bookSettle' && r.hudAnim === 'hudUp', JSON.stringify(r));

  await waitFor(`!document.getElementById('screen-app').classList.contains('app-entering')`, 4000);
  await waitFor(`document.querySelectorAll('#book .nb-page').length > 0`);
  await sleep(500);
  r = await run(`({
    appVisible: !document.getElementById('screen-app').classList.contains('hidden'),
    lockHidden: document.getElementById('screen-lock').classList.contains('hidden'),
    pageAnimGone: getComputedStyle(document.getElementById('stage')).animationName,
    pages: window.__nb.pageCount,
    domPages: document.querySelectorAll('#book .nb-page').length,
    current: window.__nb.currentPage(),
    label: document.getElementById('pageLabel').textContent,
    cover: !!document.querySelector('.page.cover'),
    stageW: document.getElementById('stage').clientWidth
  })`);
  log('过渡结束：本子挂上、封面朝上', r.appVisible && r.lockHidden && r.pageAnimGone === 'none' && r.pages === r.domPages && r.pages > 5 && r.cover && r.current === 1,
    JSON.stringify(r));
  log('书本按窗口尺寸铺开', r.stageW > 800, `stageW=${r.stageW}`);

  // ---------- 2. 翻页 / 目录 / 遮住密码 ----------
  await run(`document.getElementById('btnNext').click(); true`);
  await sleep(1000);
  r = await run(`({ page: window.__nb.currentPage(), label: document.getElementById('pageLabel').textContent })`);
  log('「下一页」翻页', r.page >= 2 && r.page <= 3, JSON.stringify(r));

  await run(`document.getElementById('btnToc').click(); true`);
  await sleep(1200);
  r = await run(`window.__nb.currentPage()`);
  log('「目录」跳到目录页', r === 3, `page=${r}`);

  const maskBefore = await run(`document.body.classList.contains('masked')`);
  await run(`document.getElementById('btnMask').click(); true`);
  r = await run(`({ masked: document.body.classList.contains('masked'), btn: document.getElementById('btnMask').textContent })`);
  log('「遮住密码」开关生效', r.masked === !maskBefore, JSON.stringify(Object.assign({ before: maskBefore }, r)));
  await run(`document.getElementById('btnMask').click(); true`);
  await sleep(150);
  r = await run(`document.body.classList.contains('masked')`);
  log('再点一次切回来', r === maskBefore, `masked=${r}`);

  // ---------- 3. 在本子上写一条 ----------
  await run(`document.getElementById('btnWriteNew').click();`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  r = await run(`({ title: document.getElementById('drawer-title').textContent,
    hasCopyPwd: !!document.getElementById('edit-copy'), hasOpenUrl: !!document.getElementById('edit-open') })`);
  log('「＋ 写一条」打开编辑面板（带复制密码 / 打开网址）', r.hasCopyPwd && r.hasOpenUrl, JSON.stringify(r.title));

  await run(`document.getElementById('edit-title').value = '淘宝';
    document.getElementById('edit-username').value = 'free_taobao';
    document.getElementById('edit-password').value = 'Tb#8kLm2Qv';
    document.getElementById('edit-url').value = 'https://taobao.com';
    document.getElementById('edit-notes').value = '主账号，绑了支付宝';
    document.querySelector('.cat-chip[data-cat="web"]').click();
    document.getElementById('btn-save').click();`);
  await waitFor(`document.getElementById('drawer').classList.contains('hidden')`);
  await sleep(700);
  r = await run(`(() => {
    const it = state.payload.items[0];
    return { title: it.title, page: window.__nb.currentPage(), want: window.__nb.pageOf(it.id),
      onPage: !!document.querySelector('.entry[data-entry-id="' + it.id + '"]'),
      inToc: !!document.querySelector('.toc-row[data-entry-id="' + it.id + '"]'),
      maskedNow: document.body.classList.contains('masked') };
  })()`);
  log('写完自动翻到新写的那一页（也在目录里）', r.title === '淘宝' && r.onPage && r.inToc && r.page === r.want && r.want > 3, JSON.stringify(r));

  // 遮住密码时本子上的真密码确实不显示
  await run(`window.__nb.setMasked(true); true`);
  r = await run(`({
    realHidden: getComputedStyle(document.querySelector('.entry .pw-real')).display === 'none',
    titleInked: document.querySelector('.entry .e-title').textContent.includes('淘宝')
  })`);
  log('遮住密码：真密码藏起来，手写标题还在', r.realHidden && r.titleInked, JSON.stringify(r));
  await run(`window.__nb.setMasked(false); true`);

  // ---------- 3.5 目录点击跳页 / 点密码复制（重挂一本之后也要管用）----------
  await run(`window.__nb.gotoPage(3); true`);
  await sleep(1300);
  r = await run(`(() => {
    const row = document.querySelector('.toc-row[data-entry-id]');
    const want = row ? parseInt(row.dataset.page, 10) : 0;
    if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { want, rows: document.querySelectorAll('.toc-row').length };
  })()`);
  await sleep(1400);
  const gotPage = await run(`window.__nb.currentPage()`);
  log('目录点一行 → 跳到那一页（重挂后仍有效）',
    r.rows === 1 && r.want > 3 && gotPage === r.want, `want=${r.want} got=${gotPage}`);

  r = await run(`(() => {
    const pw = document.querySelector('.entry .e-val.pw');
    pw.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const t = document.getElementById('nb-toast');
    return { text: t.textContent, shown: t.classList.contains('show') };
  })()`);
  log('点本子上的密码 → 复制并弹提示', r.shown && /已复制/.test(r.text), JSON.stringify(r));

  // ---------- 4. 本子上双击一条 → 改它 ----------
  await run(`(() => {
    const el = document.querySelector('.entry[data-entry-id]');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  })()`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  await sleep(200);
  r = await run(`({ title: document.getElementById('edit-title').value,
    user: document.getElementById('edit-username').value,
    notes: document.getElementById('edit-notes').value,
    drawerTitle: document.getElementById('drawer-title').textContent })`);
  log('本子上双击条目 → 打开「改这一条」并回填',
    r.title === '淘宝' && r.user === 'free_taobao' && r.notes === '主账号，绑了支付宝' && r.drawerTitle === '改这一条',
    JSON.stringify(r));

  const beforePages = await run(`window.__nb.pageCount`);
  await run(`document.getElementById('edit-title').value = '淘宝主号';
    document.getElementById('edit-password').value = 'Tb#8kLm2Qv!9';
    document.getElementById('btn-save').click();`);
  await waitFor(`document.getElementById('drawer').classList.contains('hidden')`);
  await sleep(700);
  r = await run(`({ title: state.payload.items[0].title, pages: window.__nb.pageCount,
    onBook: document.body.innerText.includes('淘宝主号') })`);
  log('改完本子上就是新内容（页数不变）', r.title === '淘宝主号' && r.onBook && r.pages === beforePages, JSON.stringify(r));

  // ---------- 5.「改这条」按钮 ----------
  await run(`document.getElementById('btnWriteEdit').click();`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  r = await run(`document.getElementById('edit-title').value`);
  log('「改这条」打开当前这页那一条', r === '淘宝主号', JSON.stringify(r));
  await run(`document.getElementById('drawer-close').click();`);
  await sleep(300);

  // ---------- 6. 标题栏工具：生成器 / 设置 / 署名 ----------
  await run(`document.getElementById('btn-generator').click();`);
  await waitFor(`!document.getElementById('gen-modal').classList.contains('hidden')`);
  r = await run(`({ pwdLen: document.getElementById('gen-password').value.length,
    hasSlider: !!document.getElementById('gen-length') })`);
  log('标题栏「生成器」弹窗', r.pwdLen === 20 && r.hasSlider, JSON.stringify(r));
  await run(`document.getElementById('gen-use').click();`);
  await waitFor(`document.getElementById('gen-modal').classList.contains('hidden')`);
  log('生成器「使用此密码」后关闭（无编辑框时复制到剪贴板）', true);

  await run(`document.getElementById('btn-settings').click();`);
  await waitFor(`!document.getElementById('settings-modal').classList.contains('hidden')`);
  await run(`(function(){ const o = document.getElementById('setting-owner');
    o.value = 'FRee'; o.dispatchEvent(new Event('change')); })();`);
  await sleep(800);
  r = await run(`({ owner: state.payload.settings.owner,
    coverText: document.querySelector('.page.cover .cover-owner').textContent })`);
  log('设置「本子署名」→ 封面跟着变', r.owner === 'FRee' && r.coverText.includes('FRee'), JSON.stringify(r));
  await run(`document.getElementById('settings-close').click();`);
  await sleep(200);

  // ---------- 7. 锁定 → 错密码 → 正确密码 ----------
  await run(`document.getElementById('btn-lock').click();`);
  await waitFor(`!document.getElementById('screen-lock').classList.contains('hidden')`);
  r = await run(`({ locked: !document.getElementById('screen-lock').classList.contains('hidden'),
    appHidden: document.getElementById('screen-app').classList.contains('hidden'),
    entering: document.getElementById('screen-lock').classList.contains('lock-entering'),
    title: document.getElementById('lock-title').textContent })`);
  log('合上本子 → 回到解锁屏（淡入）', r.locked && r.appHidden && r.entering && r.title === '欢迎回来', JSON.stringify(r));

  await run(`document.getElementById('lock-password').value = 'wrongpass';
    document.getElementById('lock-submit').click();`);
  await waitFor(`document.getElementById('lock-error').textContent.includes('主密码错误')`);
  log('错误密码被拒绝', true);

  await run(`document.getElementById('lock-password').value = 'test123456';
    document.getElementById('lock-submit').click();`);
  await waitFor(`!document.getElementById('screen-app').classList.contains('hidden')`);
  await waitFor(`document.getElementById('screen-lock').classList.contains('hidden')`, 4000);
  await sleep(500);
  r = await run(`({ appVisible: !document.getElementById('screen-app').classList.contains('hidden'),
    items: state.payload.items.length, pages: window.__nb.pageCount,
    onBook: !!document.querySelector('.entry[data-entry-id]'),
    maskedDefault: document.body.classList.contains('masked') })`);
  log('重新解锁 → 直接翻开本子，数据都在（默认遮住密码）',
    r.appVisible && r.items === 1 && r.onBook && r.maskedDefault, JSON.stringify(r));

  // ---------- 8. 快捷键 + 空条目 ----------
  await run(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  await run(`document.getElementById('edit-title').value = '快捷键写的一条';
    document.getElementById('edit-username').value = 'kbd';
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));`);
  await waitFor(`document.getElementById('drawer').classList.contains('hidden')`);
  await sleep(600);
  r = await run(`({ items: state.payload.items.length,
    has: state.payload.items.some((x) => x.title === '快捷键写的一条') })`);
  log('Ctrl+N 写一条 + Ctrl+S 保存', r.items === 2 && r.has, JSON.stringify(r));

  await run(`document.getElementById('btnWriteNew').click();`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  const beforeDraft = await run(`state.payload.items.length`);
  await run(`document.getElementById('drawer-close').click();`);
  await sleep(400);
  r = await run(`({ items: state.payload.items.length,
    unnamed: state.payload.items.filter((x) => !x.title).length })`);
  log('「写一条」不保存就关掉（不留空条目）', r.items === beforeDraft - 1 && r.unnamed === 0, JSON.stringify(r));

  // ---------- 9. 撕掉一页 ----------
  await run(`(() => {
    const el = document.querySelector('.entry[data-entry-id]');
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  })()`);
  await waitFor(`!document.getElementById('drawer').classList.contains('hidden')`);
  await run(`window.confirm = () => true; document.getElementById('btn-delete').click();`);
  await waitFor(`state.payload.items.length === 1`);
  await sleep(500);
  r = await run(`({ items: state.payload.items.length, pages: window.__nb.pageCount })`);
  log('撕掉一条后本子重排', r.items === 1, JSON.stringify(r));

  if (fs.existsSync(getVaultFile())) fs.unlinkSync(getVaultFile());
  console.log('\n=== 测试完成 ===');
  app.exit(0);
}

app.whenReady().then(main).catch((e) => {
  console.error('TEST ERROR:', e);
  app.exit(1);
});
