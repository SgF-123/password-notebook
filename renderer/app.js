// ============ 全局状态 ============
const state = {
  payload: null,       // { settings, items, _verify }
  editingId: null,     // 编辑面板里正在改的条目 id
  draftId: null,       // 「写一条」刚建出来、还没保存的空条目
  bookMounted: false,
  bookDirty: true,
  autoLockTimer: null
};

// ============ 分类（编辑面板的分类按钮用） ============
const CATEGORIES = ['全部', '网站', '社交', '邮箱', '银行', '工作', '其他'];
const CAT_KEYS = ['all', 'web', 'social', 'email', 'bank', 'work', 'other'];
const CAT_COLOR = { web: '#4b7bec', social: '#5d9cec', email: '#eb4d4b', bank: '#f7b731', work: '#a55eea', other: '#8f959e' };

function catColor(key) {
  return CAT_COLOR[key] || CAT_COLOR.other;
}

function catKeyToName(key) {
  const idx = CAT_KEYS.indexOf(key);
  return idx >= 0 ? CATEGORIES[idx] : '其他';
}

// ============ DOM ============
function byId(id) {
  if (typeof id === 'string' && id.startsWith('#')) id = id.slice(1);
  return document.getElementById(id);
}
const allOf = (sel) => Array.from(document.querySelectorAll(sel));
const qs = (sel) => document.querySelector(sel);

// ============ 工具函数 ============
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
  if (d.toDateString() === now.toDateString()) return '今天';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function generatePassword(length, opts) {
  const sets = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnopqrstuvwxyz',
    digit: '23456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.<>?'
  };
  let pool = '';
  Object.keys(opts).forEach((k) => { if (opts[k]) pool += sets[k]; });
  if (!pool) pool = sets.lower + sets.digit;
  let result = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) result += pool[arr[i] % pool.length];
  return result;
}

async function copyText(text, msg) {
  await window.vaultAPI.copy(text || '');
  toast(msg || '已复制');
}

// 页面自己的提示条（app 的 #toast 会浮在标题栏下方）
let toastTimer = null;
function toast(msg) {
  let el = byId('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;top:64px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:999;pointer-events:none;transition:opacity .25s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
}

function currentItem() {
  if (!state.payload || !state.editingId) return null;
  return state.payload.items.find((x) => x.id === state.editingId) || null;
}

function itemIconText(it) {
  if (it.title) return it.title.trim().charAt(0).toUpperCase();
  if (it.username) return it.username.trim().charAt(0).toUpperCase();
  return '#';
}

function normalizeUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  return /^https?:\/\//i.test(u) ? u : 'https://' + u;
}

function openItemUrl(url) {
  const u = normalizeUrl(url);
  if (!u) { toast('这条还没填网址'); return; }
  window.vaultAPI.openExternal(u);
}

function bookOwner() {
  return state.payload?.settings?.owner || '本子主人';
}

// ============ 自动锁定 ============
function resetAutoLock() {
  clearTimeout(state.autoLockTimer);
  const minutes = Number(state.payload?.settings?.autoLockMinutes ?? 5);
  if (!minutes) return;
  state.autoLockTimer = setTimeout(() => { lockVault(); }, minutes * 60 * 1000);
}

['click', 'keydown', 'mousemove'].forEach((evt) => {
  document.addEventListener(evt, () => resetAutoLock(), { passive: true });
});

// ============ 窗口控制（无边框窗口的自绘标题栏） ============
const WIN_ICON_MAX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="1.8"/></svg>';
const WIN_ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.6" y="9.4" width="9.6" height="9.6" rx="1.6"/><path d="M8.4 7.4h6.4a2 2 0 0 1 2 2v6.4"/></svg>';

async function refreshMaxIcon() {
  if (!window.winAPI) return;
  let isMax = false;
  try { isMax = await window.winAPI.isMaximized(); } catch (e) { /* 忽略 */ }
  allOf('[data-win="max"]').forEach((btn) => {
    btn.innerHTML = isMax ? WIN_ICON_RESTORE : WIN_ICON_MAX;
    btn.title = isMax ? '向下还原' : '最大化';
  });
}

function bindWindowControls() {
  if (!window.winAPI) return;
  // macOS：标题栏用系统原生红黄绿灯，自绘窗口按钮交给 CSS 藏掉
  if (window.winAPI.platform === 'darwin') document.documentElement.classList.add('is-mac');
  allOf('[data-win]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.win;
      if (act === 'min') window.winAPI.minimize();
      else if (act === 'max') window.winAPI.toggleMaximize();
      else if (act === 'close') window.winAPI.close();
    });
  });
  if (window.winAPI.onState) window.winAPI.onState(() => refreshMaxIcon());
  refreshMaxIcon();
}

// ============ 本子：挂载 / 重挂 ============
function mountBook(jumpToId) {
  if (typeof window.__mountNotebook !== 'function' || !state.payload) return null;
  const res = window.__mountNotebook({ owner: bookOwner(), items: state.payload.items });
  state.bookMounted = true;
  state.bookDirty = false;
  if (jumpToId && window.__nb) {
    const page = res.pageOf(jumpToId);
    if (page) setTimeout(() => { if (window.__nb) window.__nb.gotoPage(page); }, 120);
  }
  return res;
}

// 数据变了：本子正翻开就重挂一本（顺便翻到刚写的那条），没翻开就等下次进本子
function afterDataChange(jumpToId) {
  state.bookDirty = true;
  const app = byId('#screen-app');
  if (!app || app.classList.contains('hidden')) return;
  mountBook(jumpToId);
}

// 现在翻到的这一对开页上写的是哪一条（左页 cur-1、右页 cur）
function entryOnCurrentPage() {
  if (!window.__nb) return null;
  const pages = window.__nb.pages || [];
  const cur = window.__nb.currentPage();
  const cands = [pages[cur - 1], pages[cur]].filter((p) => p && p.type === 'entries' && p.items && p.items.length);
  return cands.length ? cands[0].items[0].id : null;
}

// ============ 解锁 / 创建流程 ============
async function applyLockMode() {
  const exists = await window.vaultAPI.exists();
  if (!exists) {
    byId('#lock-title').textContent = '创建密码本';
    byId('#lock-subtitle').textContent = '首次使用，请设置你的主密码';
    byId('#lock-confirm-wrap').classList.remove('hidden');
    byId('#lock-submit').textContent = '创建密码本';
    byId('#lock-tip').textContent = '请牢记主密码，忘记后无法找回。数据仅加密保存在本地。';
  } else {
    byId('#lock-title').textContent = '欢迎回来';
    byId('#lock-subtitle').textContent = '请输入主密码，翻开你的本子';
    byId('#lock-confirm-wrap').classList.add('hidden');
    byId('#lock-submit').textContent = '翻开密码本';
    byId('#lock-tip').textContent = '数据仅加密存储在本地，不会上传到任何服务器。';
  }
  byId('#lock-error').textContent = '';
  return exists;
}

async function init() {
  updateCharState();
  await showLock();
}

async function handleUnlock() {
  const pw = byId('#lock-password').value;
  if (!pw) { showLockError('请输入主密码'); return; }
  const exists = await window.vaultAPI.exists();
  if (!exists) {
    const confirm = byId('#lock-confirm').value;
    if (!confirm) { showLockError('请再次输入主密码'); return; }
    if (pw !== confirm) { showLockError('两次输入不一致'); return; }
    if (pw.length < 6) { showLockError('主密码至少 6 位'); return; }
    const res = await window.vaultAPI.create(pw);
    if (!res.ok) { showLockError(res.error); return; }
    byId('#lock-password').value = '';
    byId('#lock-confirm').value = '';
    updateCharState();
    await enterMain(res.payload);
    return;
  }
  const res = await window.vaultAPI.unlock(pw);
  if (!res.ok) {
    showLockError(res.error);
    byId('#lock-password').value = '';
    byId('#lock-password').focus();
    updateCharState();
    return;
  }
  byId('#lock-password').value = '';
  updateCharState();
  await enterMain(res.payload);
}

function showLockError(msg) {
  byId('#lock-error').textContent = msg;
  if (chars && typeof chars.react === 'function') chars.react('deny');
}

// 回到解锁屏（合上本子）：本子收起来，解锁屏淡进来
async function showLock() {
  const app = byId('#screen-app');
  const lock = byId('#screen-lock');
  app.classList.add('hidden');
  app.classList.remove('app-entering');
  lock.classList.remove('hidden', 'lock-leaving');
  lock.classList.add('lock-entering');
  state.bookMounted = false;
  state.bookDirty = true;
  await applyLockMode();
  byId('#lock-password').focus();
  updateCharState();
  setTimeout(() => lock.classList.remove('lock-entering'), 420);
}

// 解锁 → 翻开本子：解锁屏淡出 + 整张书桌淡入 + 本子轻轻"落"到桌面上
const ENTER_MS = 900;

async function enterMain(payload) {
  state.payload = payload;
  state.editingId = null;
  state.draftId = null;
  state.bookMounted = false;
  state.bookDirty = true;

  const lock = byId('#screen-lock');
  const app = byId('#screen-app');

  app.classList.add('app-entering');
  app.classList.remove('hidden');
  mountBook();                                  // 先挂上，跟着过渡动画一起出现
  lock.classList.add('lock-leaving');            // 解锁屏固定成浮层淡出，底下的本子露出来

  resetAutoLock();
  refreshMaxIcon();

  setTimeout(() => {
    lock.classList.add('hidden');
    lock.classList.remove('lock-leaving');
    app.classList.remove('app-entering');
    if (window.__nb) window.__nb.fit();          // 布局变化后再量一次，保证排版严丝合缝
  }, ENTER_MS);

  if (payload.settings?.showPasswords) {
    setTimeout(() => { if (window.__nb) window.__nb.setMasked(false); }, 60);
  } else if (window.__nb) {
    setTimeout(() => { if (window.__nb) window.__nb.setMasked(true); }, 60);
  }
}

async function lockVault() {
  await window.vaultAPI.lock();
  state.payload = null;
  closeEditor();
  await showLock();
}

// ============ 数据保存 ============
async function savePayload() {
  const res = await window.vaultAPI.save(state.payload);
  if (!res.ok) {
    toast('保存失败：' + res.error);
    return false;
  }
  return true;
}

// ============ 写一条 / 改一条 ============
function newItem() {
  // 上一次「写一条」还没保存就又点了一次：先把那个空条目扔掉，别攒一堆"未命名"
  if (state.draftId) {
    state.payload.items = state.payload.items.filter((x) => x.id !== state.draftId);
    state.draftId = null;
  }
  const item = {
    id: uid(),
    title: '',
    username: '',
    password: generatePassword(20, { upper: true, lower: true, digit: true, symbol: true }),
    url: '',
    notes: '',
    category: 'web',
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.payload.items.unshift(item);
  state.draftId = item.id;
  openEditor(item.id);
  byId('#drawer-title').textContent = '写一条';
}

function openEditor(id) {
  state.editingId = id;
  const it = state.payload.items.find((x) => x.id === id);
  if (!it) return;

  byId('#drawer').classList.remove('hidden');
  byId('#drawer-backdrop').classList.remove('hidden');
  byId('#drawer-title').textContent = state.draftId === id ? '写一条' : '改这一条';
  byId('#btn-save').classList.remove('hidden');
  byId('#btn-delete').classList.remove('hidden');

  byId('#drawer-body').innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
      <div class="avatar-sq" style="background:${catColor(it.category)}">${escapeHtml(itemIconText(it))}</div>
      <div style="min-width:0;">
        <div style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(it.title || '还没写标题')}</div>
        <div style="color:var(--text-3);font-size:12px;margin-top:2px;">${escapeHtml(catKeyToName(it.category))} · ${escapeHtml(it.createdAt ? '创建于 ' + formatTime(it.createdAt) : '')}</div>
      </div>
    </div>

    <div class="detail-field">
      <label>标题</label>
      <input class="detail-input" id="edit-title" value="${escapeHtml(it.title || '')}" placeholder="例如：GitHub" />
    </div>

    <div class="detail-field">
      <label>用户名 / 账号</label>
      <input class="detail-input" id="edit-username" value="${escapeHtml(it.username || '')}" placeholder="邮箱或用户名" />
    </div>

    <div class="detail-field">
      <label>密码</label>
      <div class="gen-row">
        <input class="detail-input" id="edit-password" value="${escapeHtml(it.password || '')}" type="text" />
        <button class="row-action" id="edit-copy" title="复制密码">复制</button>
        <button class="row-action" id="edit-gen" title="生成一个强密码">⚡</button>
      </div>
    </div>

    <div class="detail-field">
      <label>网址</label>
      <div class="gen-row">
        <input class="detail-input" id="edit-url" value="${escapeHtml(it.url || '')}" placeholder="https://" />
        <button class="row-action" id="edit-open" title="用浏览器打开">打开</button>
      </div>
    </div>

    <div class="detail-field">
      <label>备注</label>
      <textarea class="detail-input" id="edit-notes" placeholder="可选备注">${escapeHtml(it.notes || '')}</textarea>
    </div>

    <div class="detail-field">
      <label>分类</label>
      <div class="detail-cats">
        ${CATEGORIES.slice(1).map((name, i) => {
          const key = CAT_KEYS[i + 1];
          return `<button class="cat-chip${it.category === key ? ' active' : ''}" data-cat="${key}">${name}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="detail-field">
      <label class="gen-check" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);">
        <input type="checkbox" id="edit-fav" ${it.favorite ? 'checked' : ''} style="accent-color:var(--primary);width:15px;height:15px;" />
        标记为常用（★ 会写在本子上）
      </label>
    </div>
  `;

  byId('#edit-gen').addEventListener('click', () => {
    byId('#edit-password').value = generatePassword(20, { upper: true, lower: true, digit: true, symbol: true });
    toast('已生成新密码，记得保存');
  });
  byId('#edit-copy').addEventListener('click', () => copyText(byId('#edit-password').value, '密码已复制'));
  byId('#edit-open').addEventListener('click', () => openItemUrl(byId('#edit-url').value));

  allOf('.cat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      allOf('.cat-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  byId('#btn-save').onclick = async () => {
    const title = byId('#edit-title').value.trim();
    if (!title) { toast('给它起个标题吧'); return; }
    it.title = title;
    it.username = byId('#edit-username').value.trim();
    it.password = byId('#edit-password').value;
    it.url = byId('#edit-url').value.trim();
    it.notes = byId('#edit-notes').value.trim();
    it.category = qs('.cat-chip.active')?.dataset.cat || 'other';
    it.favorite = byId('#edit-fav').checked;
    it.updatedAt = Date.now();
    await savePayload();
    state.editingId = null;
    state.draftId = null;
    closeEditor();
    afterDataChange(it.id);
    toast('已经写进本子');
  };

  byId('#btn-delete').onclick = async () => {
    if (!confirm('确定撕掉这一页吗？')) return;
    state.payload.items = state.payload.items.filter((x) => x.id !== id);
    state.editingId = null;
    state.draftId = null;
    await savePayload();
    closeEditor();
    afterDataChange();
    toast('已撕掉');
  };

  setTimeout(() => { const t = byId('#edit-title'); if (t) t.focus(); }, 60);
}

function closeEditor() {
  const wasDraft = !!state.draftId && state.editingId === state.draftId;
  byId('#drawer').classList.add('hidden');
  byId('#drawer-backdrop').classList.add('hidden');
  state.editingId = null;
  // 点了「写一条」又没保存就关掉：这个空条目别留在本子上
  if (wasDraft && state.payload) {
    state.payload.items = state.payload.items.filter((x) => x.id !== state.draftId);
    state.draftId = null;
    afterDataChange();
  }
}

// ============ 设置 ============
function openSettings() {
  byId('#setting-owner').value = state.payload.settings.owner || '';
  byId('#setting-autolock').value = String(state.payload.settings.autoLockMinutes ?? 5);
  byId('#setting-showpwd').checked = !!state.payload.settings.showPasswords;
  byId('#set-oldpw').value = '';
  byId('#set-newpw').value = '';
  byId('#set-newpw2').value = '';
  byId('#settings-error').textContent = '';
  byId('#settings-modal').classList.remove('hidden');
  byId('#modal-backdrop').classList.remove('hidden');
}

function closeSettings() {
  byId('#settings-modal').classList.add('hidden');
  byId('#modal-backdrop').classList.add('hidden');
}

// ============ 密码生成器 ============
let genTarget = null;
function openGenerator(targetInput) {
  genTarget = targetInput || null;
  byId('#gen-modal').classList.remove('hidden');
  byId('#gen-backdrop').classList.remove('hidden');
  regenPassword();
}

function closeGenerator() {
  byId('#gen-modal').classList.add('hidden');
  byId('#gen-backdrop').classList.add('hidden');
}

function regenPassword() {
  const len = Number(byId('#gen-length').value);
  byId('#gen-length-val').textContent = len;
  byId('#gen-password').value = generatePassword(len, {
    upper: byId('#gen-upper').checked,
    lower: byId('#gen-lower').checked,
    digit: byId('#gen-digit').checked,
    symbol: byId('#gen-symbol').checked
  });
}

// ============ 事件绑定 ============
function bindEvents() {
  // 解锁表单：阻止默认提交（否则会重载页面丢状态）
  byId('#lock-form').addEventListener('submit', (e) => { e.preventDefault(); handleUnlock(); });
  byId('#lock-submit').addEventListener('click', (e) => { e.preventDefault(); handleUnlock(); });

  // 标题栏上的三个工具
  byId('#btn-generator').addEventListener('click', () => openGenerator(null));
  byId('#btn-settings').addEventListener('click', openSettings);
  byId('#btn-lock').addEventListener('click', () => lockVault());

  // 本子底部控制条（btnPrev/btnNext/btnToc/btnMask/btnSound 由 notebook.js 接管）
  byId('#btnWriteNew').addEventListener('click', newItem);
  byId('#btnWriteEdit').addEventListener('click', () => {
    const id = entryOnCurrentPage();
    if (!id) { toast('这一页还没有条目，点「＋ 写一条」'); return; }
    openEditor(id);
  });

  // 本子上双击某一条 → 改它
  byId('#screen-book').addEventListener('dblclick', (e) => {
    const el = e.target.closest('[data-entry-id]');
    if (el && el.dataset.entryId) openEditor(el.dataset.entryId);
  });

  // 编辑面板
  byId('#drawer-close').addEventListener('click', closeEditor);
  byId('#drawer-backdrop').addEventListener('click', closeEditor);

  // 设置
  byId('#settings-close').addEventListener('click', closeSettings);
  byId('#modal-backdrop').addEventListener('click', closeSettings);

  byId('#setting-owner').addEventListener('change', async (e) => {
    state.payload.settings.owner = e.target.value.trim();
    await savePayload();
    afterDataChange();
    toast('已保存');
  });

  byId('#setting-autolock').addEventListener('change', async (e) => {
    state.payload.settings.autoLockMinutes = Number(e.target.value);
    await savePayload();
    resetAutoLock();
    toast('已保存');
  });

  byId('#setting-showpwd').addEventListener('change', async (e) => {
    state.payload.settings.showPasswords = e.target.checked;
    await savePayload();
    if (window.__nb) window.__nb.setMasked(!e.target.checked);
    toast('已保存');
  });

  byId('#btn-change-master').addEventListener('click', async () => {
    const oldPw = byId('#set-oldpw').value;
    const newPw = byId('#set-newpw').value;
    const newPw2 = byId('#set-newpw2').value;
    if (!oldPw) { byId('#settings-error').textContent = '请输入当前主密码'; return; }
    if (!newPw || newPw.length < 6) { byId('#settings-error').textContent = '新主密码至少 6 位'; return; }
    if (newPw !== newPw2) { byId('#settings-error').textContent = '两次新密码不一致'; return; }
    const res = await window.vaultAPI.changeMaster(oldPw, newPw);
    if (!res.ok) { byId('#settings-error').textContent = res.error; return; }
    byId('#set-oldpw').value = '';
    byId('#set-newpw').value = '';
    byId('#set-newpw2').value = '';
    byId('#settings-error').textContent = '';
    closeSettings();
    toast('主密码已更新');
  });

  // 生成器
  byId('#gen-refresh').addEventListener('click', regenPassword);
  byId('#gen-copy').addEventListener('click', () => copyText(byId('#gen-password').value));
  byId('#gen-length').addEventListener('input', regenPassword);
  ['gen-upper', 'gen-lower', 'gen-digit', 'gen-symbol'].forEach((id) => {
    byId('#' + id).addEventListener('change', regenPassword);
  });
  byId('#gen-use').addEventListener('click', async () => {
    const pwd = byId('#gen-password').value;
    if (genTarget) {
      genTarget.value = pwd;
      closeGenerator();
      toast('已填入密码');
      return;
    }
    closeGenerator();
    await copyText(pwd, '新密码已复制');
  });
  byId('#gen-close').addEventListener('click', closeGenerator);
  byId('#gen-backdrop').addEventListener('click', closeGenerator);

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!byId('#gen-modal').classList.contains('hidden')) { closeGenerator(); return; }
      if (!byId('#settings-modal').classList.contains('hidden')) { closeSettings(); return; }
      if (!byId('#drawer').classList.contains('hidden')) { closeEditor(); }
      return;
    }
    const locked = byId('#screen-app').classList.contains('hidden');
    const mod = e.ctrlKey || e.metaKey;          // macOS 上按 ⌘，Windows 上按 Ctrl
    if (mod && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (!locked) newItem();
    }
    if (mod && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (!locked) lockVault();
    }
    if (mod && e.key.toLowerCase() === 's') {
      // Ctrl+S 保存当前编辑
      if (!byId('#drawer').classList.contains('hidden')) { e.preventDefault(); byId('#btn-save').click(); }
    }
  });
}

// ============ 启动 ============
let chars = null;
let eyeShowing = false;

function updateCharState() {
  if (!chars) return;
  const pwLen = (byId('#lock-password').value || '').length;
  chars.setPasswordLength(pwLen, eyeShowing);
}

function setupLockCharacters() {
  const stage = byId('#chars-stage');
  if (stage && typeof window.mountAnimatedCharacters === 'function') {
    chars = window.mountAnimatedCharacters(stage);
  }
  const pw = byId('#lock-password');
  const confirm = byId('#lock-confirm');
  [pw, confirm].forEach((el) => {
    el.addEventListener('focus', () => { if (chars) chars.setTyping(true); });
    el.addEventListener('blur', () => { if (chars) chars.setTyping(false); });
  });
  pw.addEventListener('input', updateCharState);

  const eyeBtn = byId('#lock-eye');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', () => {
      eyeShowing = !eyeShowing;
      pw.type = eyeShowing ? 'text' : 'password';
      eyeBtn.classList.toggle('showing', eyeShowing);
      updateCharState();
    });
  }
}

function boot() {
  setupLockCharacters();
  bindWindowControls();
  if (document.documentElement.classList.contains('is-mac')) {
    const hint = (id, text) => { const el = byId('#' + id); if (el) el.title = text; };
    hint('btnWriteNew', '在新的一页写一条（⌘N）');
    hint('btn-lock', '合上本子（锁定，⌘L）');
  }
  bindEvents();
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
