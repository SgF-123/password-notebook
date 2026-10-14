// ============ 全局状态 ============
const state = {
  payload: null,        // { settings, items, _verify }
  activeCategory: 'all',
  search: '',
  selectedId: null,
  editingId: null,      // 抽屉当前编辑的条目 id
  autoLockTimer: null
};

const CATEGORIES = ['全部', '网站', '社交', '邮箱', '银行', '工作', '其他'];
const CAT_KEYS = ['all', 'web', 'social', 'email', 'bank', 'work', 'other'];
const CAT_ICON_COLORS = ['#07c160', '#4b7bec', '#5d9cec', '#eb4d4b', '#f7b731', '#a55eea', '#8f959e'];

function catKeyToName(key) {
  const idx = CAT_KEYS.indexOf(key);
  return idx >= 0 ? CATEGORIES[idx] : '其他';
}

function catNameToKey(name) {
  const idx = CATEGORIES.indexOf(name);
  return idx >= 0 ? CAT_KEYS[idx] : 'other';
}

// ============ DOM ============
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function $(id) {
  if (typeof id === 'string' && id.startsWith('#')) id = id.slice(1);
  return document.getElementById(id);
}
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
  for (let i = 0; i < length; i++) {
    result += pool[arr[i] % pool.length];
  }
  return result;
}

async function copyText(text) {
  await window.vaultAPI.copy(text || '');
  toast('已复制');
}

let toastTimer = null;
function toast(msg) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:9px 18px;border-radius:20px;font-size:13px;z-index:999;pointer-events:none;transition:opacity .25s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1600);
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

// ============ 解锁 / 创建流程 ============
// 按保险库是否存在，切换解锁屏的文案与「确认主密码」字段
async function applyLockMode() {
  const exists = await window.vaultAPI.exists();
  if (!exists) {
    $('#lock-title').textContent = '创建保险库';
    $('#lock-subtitle').textContent = '首次使用，请设置你的主密码';
    $('#lock-confirm-wrap').classList.remove('hidden');
    $('#lock-submit').textContent = '创建保险库';
    $('#lock-tip').textContent = '请牢记主密码，忘记后无法找回。数据仅加密保存在本地。';
  } else {
    $('#lock-title').textContent = '欢迎回来';
    $('#lock-subtitle').textContent = '请输入主密码解锁';
    $('#lock-confirm-wrap').classList.add('hidden');
    $('#lock-submit').textContent = '解锁';
    $('#lock-tip').textContent = '数据仅加密存储在本地，不会上传到任何服务器。';
  }
  $('#lock-error').textContent = '';
  return exists;
}

async function init() {
  updateCharState();
  await showLock();
}

async function handleUnlock() {
  const pw = $('#lock-password').value;
  if (!pw) { showLockError('请输入主密码'); return; }
  const exists = await window.vaultAPI.exists();
  if (!exists) {
    const confirm = $('#lock-confirm').value;
    if (!confirm) { showLockError('请再次输入主密码'); return; }
    if (pw !== confirm) { showLockError('两次输入不一致'); return; }
    if (pw.length < 6) { showLockError('主密码至少 6 位'); return; }
    const res = await window.vaultAPI.create(pw);
    if (!res.ok) { showLockError(res.error); return; }
    $('#lock-password').value = '';
    $('#lock-confirm').value = '';
    updateCharState();
    await enterMain(res.payload);
    return;
  }
  const res = await window.vaultAPI.unlock(pw);
  if (!res.ok) {
    showLockError(res.error);
    $('#lock-password').value = '';
    $('#lock-password').focus();
    updateCharState();
    return;
  }
  $('#lock-password').value = '';
  updateCharState();
  await enterMain(res.payload);
}

function showLockError(msg) {
  $('#lock-error').textContent = msg;
  if (chars && typeof chars.react === 'function') chars.react('deny');
}

async function showLock() {
  $('#screen-main').classList.add('hidden');
  $('#screen-lock').classList.remove('hidden');
  await applyLockMode();
  $('#lock-password').focus();
  updateCharState();
}

async function enterMain(payload) {
  state.payload = payload;
  state.selectedId = null;
  state.editingId = null;
  state.activeCategory = 'all';
  state.search = '';
  $('#search-input').value = '';
  $('#screen-lock').classList.add('hidden');
  $('#screen-main').classList.remove('hidden');
  renderCategoryTabs();
  renderGrid();
  resetAutoLock();
  toast('保险库已解锁');
}

async function lockVault() {
  await window.vaultAPI.lock();
  state.payload = null;
  closeDrawer();
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

// ============ 分类标签 ============
function renderCategoryTabs() {
  const container = $('#category-tabs');
  container.innerHTML = '';
  CATEGORIES.forEach((name, idx) => {
    const key = CAT_KEYS[idx];
    const count = state.payload.items.filter((it) =>
      (key === 'all' ? true : (it.category || 'other') === key)
    ).length;
    const btn = document.createElement('button');
    btn.className = 'cat-tab' + (state.activeCategory === key ? ' active' : '');
    btn.textContent = name + (count > 0 ? ' ' + count : '');
    btn.addEventListener('click', () => {
      state.activeCategory = key;
      renderCategoryTabs();
      renderGrid();
    });
    container.appendChild(btn);
  });
}

// ============ 卡片网格 ============
function filteredItems() {
  const q = state.search.trim().toLowerCase();
  return state.payload.items.filter((it) => {
    if (state.activeCategory !== 'all' && (it.category || 'other') !== state.activeCategory) return false;
    if (!q) return true;
    return [it.title, it.username, it.url, it.notes].some((v) =>
      (v || '').toString().toLowerCase().includes(q)
    );
  });
}

function itemIconText(it) {
  if (it.title) return it.title.trim().charAt(0).toUpperCase();
  if (it.username) return it.username.trim().charAt(0).toUpperCase();
  return '?';
}

function renderGrid() {
  const grid = $('#grid');
  const empty = $('#empty-state');
  const items = filteredItems();

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    const hasAny = state.payload.items.length > 0;
    $('#empty-title').textContent = hasAny ? '没有匹配的条目' : '还没有密码条目';
    $('#empty-desc').textContent = hasAny ? '换个关键词或分类试试' : '点击右上角「新建」开始添加';
    $('#btn-empty-new').classList.toggle('hidden', hasAny);
    return;
  }

  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  items.forEach((it) => {
    const catKey = it.category || 'other';
    const catIdx = Math.max(0, CAT_KEYS.indexOf(catKey));
    const color = CAT_ICON_COLORS[catIdx] || CAT_ICON_COLORS[6];

    const card = document.createElement('div');
    card.className = 'card' + (state.selectedId === it.id ? ' selected' : '');
    card.innerHTML = `
      <div class="card-top">
        <div class="card-icon" style="background:${color}">${escapeHtml(itemIconText(it))}</div>
        <div class="card-title" title="${escapeHtml(it.title || '未命名')}">${escapeHtml(it.title || '未命名')}</div>
        ${it.favorite ? '<div class="card-fav">★</div>' : ''}
      </div>
      <div class="card-meta">
        <div class="meta-line"><span class="meta-label">账号</span><span>${escapeHtml(it.username || '—')}</span></div>
        <div class="meta-line"><span class="meta-label">密码</span><span>••••••••</span></div>
        <div class="meta-line"><span class="meta-label">网址</span><span>${escapeHtml(it.url || '—')}</span></div>
      </div>
      <div class="card-bottom">
        <span class="card-cat">${catKeyToName(catKey)}</span>
        <span class="card-time">${formatTime(it.updatedAt || it.createdAt)}</span>
      </div>
    `;
    card.addEventListener('click', () => openDrawer(it.id));
    card.addEventListener('dblclick', () => { openDrawer(it.id); enableEdit(it.id); });
    grid.appendChild(card);
  });
}

// ============ 新建 ============
function newItem() {
  const item = {
    id: uid(),
    title: '',
    username: '',
    password: generatePassword(20, { upper: true, lower: true, digit: true, symbol: true }),
    url: '',
    notes: '',
    category: state.activeCategory === 'all' ? 'web' : state.activeCategory,
    favorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.payload.items.unshift(item);
  state.selectedId = item.id;
  renderGrid();
  openDrawer(item.id);
  enableEdit(item.id);
  $('#drawer-title').textContent = '新建条目';
}

// ============ 抽屉 ============
function openDrawer(id) {
  state.selectedId = id;
  renderGrid();
  const it = state.payload.items.find((x) => x.id === id);
  if (!it) return;
  $('#drawer').classList.remove('hidden');
  $('#drawer-backdrop').classList.remove('hidden');
  renderDrawerDetail(it);
}

function renderDrawerDetail(it) {
  const body = $('#drawer-body');
  const showPwd = state.payload.settings.showPasswords;
  const catIdx = Math.max(0, CAT_KEYS.indexOf(it.category || 'other'));
  const color = CAT_ICON_COLORS[catIdx] || CAT_ICON_COLORS[6];

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
      <div class="card-icon" style="width:54px;height:54px;font-size:24px;background:${color}">${escapeHtml(itemIconText(it))}</div>
      <div style="flex:1;">
        <div style="font-size:18px;font-weight:700;margin-bottom:2px;">${escapeHtml(it.title || '未命名')}</div>
        <div style="color:var(--text-3);font-size:12.5px;">${escapeHtml(it.url || '')}</div>
      </div>
      ${it.favorite ? '<div style="color:#f7ba1e;font-size:20px;">★</div>' : ''}
    </div>

    <div class="detail-field">
      <label>用户名 / 账号</label>
      <div class="detail-value-row">
        <div class="value plain">${escapeHtml(it.username || '（空）')}</div>
        ${it.username ? `<button class="row-action" data-copy="${escapeHtml(it.username)}">复制</button>` : ''}
      </div>
    </div>

    <div class="detail-field">
      <label>密码</label>
      <div class="detail-value-row">
        <div class="value">${escapeHtml(showPwd ? it.password : '••••••••••••')}</div>
        <button class="row-action" id="pwd-visibility">${showPwd ? '隐藏' : '显示'}</button>
        <button class="row-action" data-copy="${escapeHtml(it.password)}">复制</button>
      </div>
    </div>

    <div class="detail-field">
      <label>网址</label>
      <div class="detail-value-row">
        <div class="value plain">${escapeHtml(it.url || '（空）')}</div>
        ${it.url ? `<button class="row-action" id="open-url">打开</button>` : ''}
      </div>
    </div>

    <div class="detail-field">
      <label>备注</label>
      <div class="detail-value-row" style="align-items:flex-start;">
        <div class="value plain">${escapeHtml(it.notes || '（空）')}</div>
      </div>
    </div>

    <div class="detail-field">
      <label>分类</label>
      <div class="detail-value-row">
        <div class="value plain">${catKeyToName(it.category || 'other')}</div>
      </div>
    </div>

    <div class="detail-field" style="color:var(--text-3);font-size:12px;">
      创建于 ${formatTime(it.createdAt)} · 更新于 ${formatTime(it.updatedAt)}
    </div>
  `;

  $('#drawer-footer').querySelector('#btn-save').classList.add('hidden');
  $('#drawer-footer').querySelector('#btn-delete').classList.add('hidden');

  // 复制
  $$('.row-action[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => copyText(btn.dataset.copy));
  });

  // 显示/隐藏密码
  const pwdBtn = $('#pwd-visibility');
  if (pwdBtn) {
    pwdBtn.addEventListener('click', async () => {
      state.payload.settings.showPasswords = !state.payload.settings.showPasswords;
      await savePayload();
      renderDrawerDetail(it);
    });
  }

  // 打开网址
  const openBtn = $('#open-url');
  if (openBtn) {
    openBtn.addEventListener('click', () => {
      let url = it.url;
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      window.vaultAPI.openExternal(url);
    });
  }
}

function enableEdit(id) {
  state.editingId = id;
  const it = state.payload.items.find((x) => x.id === id);
  if (!it) return;
  const body = $('#drawer-body');
  const catIdx = Math.max(0, CAT_KEYS.indexOf(it.category || 'other'));
  const color = CAT_ICON_COLORS[catIdx] || CAT_ICON_COLORS[6];

  $('#drawer-title').textContent = '编辑条目';
  $('#btn-save').classList.remove('hidden');
  $('#btn-delete').classList.remove('hidden');

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;margin-bottom:22px;">
      <div class="card-icon" style="width:54px;height:54px;font-size:24px;background:${color}">${escapeHtml(itemIconText(it))}</div>
      <div style="font-size:15px;font-weight:600;">编辑条目</div>
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
        <button class="row-action" id="edit-gen" title="生成强密码">⚡</button>
      </div>
    </div>

    <div class="detail-field">
      <label>网址</label>
      <input class="detail-input" id="edit-url" value="${escapeHtml(it.url || '')}" placeholder="https://" />
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
          return `<button class="cat-chip${(it.category || 'other') === key ? ' active' : ''}" data-cat="${key}">${name}</button>`;
        }).join('')}
      </div>
    </div>

    <div class="detail-field">
      <label class="gen-check" style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-2);">
        <input type="checkbox" id="edit-fav" ${it.favorite ? 'checked' : ''} style="accent-color:var(--primary);width:15px;height:15px;" />
        标记为收藏
      </label>
    </div>
  `;

  // 生成密码按钮
  $('#edit-gen').addEventListener('click', () => {
    $('#edit-password').value = generatePassword(20, { upper: true, lower: true, digit: true, symbol: true });
  });

  // 分类选择
  $$('.cat-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.cat-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
    });
  });

  // 保存
  $('#btn-save').onclick = async () => {
    const title = $('#edit-title').value.trim();
    if (!title) { toast('请输入标题'); return; }
    it.title = title;
    it.username = $('#edit-username').value.trim();
    it.password = $('#edit-password').value;
    it.url = $('#edit-url').value.trim();
    it.notes = $('#edit-notes').value.trim();
    it.category = qs('.cat-chip.active')?.dataset.cat || 'other';
    it.favorite = $('#edit-fav').checked;
    it.updatedAt = Date.now();
    await savePayload();
    state.editingId = null;
    renderCategoryTabs();
    renderGrid();
    openDrawer(it.id);
    toast('已保存');
  };

  // 删除
  $('#btn-delete').onclick = async () => {
    if (!confirm('确定删除这个条目吗？')) return;
    state.payload.items = state.payload.items.filter((x) => x.id !== id);
    state.selectedId = null;
    state.editingId = null;
    await savePayload();
    closeDrawer();
    renderCategoryTabs();
    renderGrid();
    toast('已删除');
  };
}

function closeDrawer() {
  $('#drawer').classList.add('hidden');
  $('#drawer-backdrop').classList.add('hidden');
  state.editingId = null;
}

// ============ 设置 ============
function openSettings() {
  $('#setting-autolock').value = String(state.payload.settings.autoLockMinutes ?? 5);
  $('#setting-showpwd').checked = !!state.payload.settings.showPasswords;
  $('#set-oldpw').value = '';
  $('#set-newpw').value = '';
  $('#set-newpw2').value = '';
  $('#settings-error').textContent = '';
  $('#settings-modal').classList.remove('hidden');
  $('#modal-backdrop').classList.remove('hidden');
}

function closeSettings() {
  $('#settings-modal').classList.add('hidden');
  $('#modal-backdrop').classList.add('hidden');
}

// ============ 密码生成器弹窗 ============
let genTarget = null;
function openGenerator(targetInput) {
  genTarget = targetInput;
  $('#gen-modal').classList.remove('hidden');
  $('#gen-backdrop').classList.remove('hidden');
  regenPassword();
}

function closeGenerator() {
  $('#gen-modal').classList.add('hidden');
  $('#gen-backdrop').classList.add('hidden');
}

function regenPassword() {
  const len = Number($('#gen-length').value);
  $('#gen-length-val').textContent = len;
  const pwd = generatePassword(len, {
    upper: $('#gen-upper').checked,
    lower: $('#gen-lower').checked,
    digit: $('#gen-digit').checked,
    symbol: $('#gen-symbol').checked
  });
  $('#gen-password').value = pwd;
}

// ============ 事件绑定 ============
function bindEvents() {
  // 解锁表单：阻止默认提交（否则会重载页面丢失状态）
  $('#lock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleUnlock();
  });
  $('#lock-submit').addEventListener('click', (e) => {
    e.preventDefault();
    handleUnlock();
  });

  $('#btn-new').addEventListener('click', newItem);
  $('#btn-empty-new').addEventListener('click', newItem);
  $('#btn-lock').addEventListener('click', () => lockVault());
  $('#btn-settings').addEventListener('click', openSettings);

  $('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderGrid();
  });

  $('#drawer-close').addEventListener('click', closeDrawer);
  $('#drawer-backdrop').addEventListener('click', closeDrawer);

  $('#settings-close').addEventListener('click', closeSettings);
  $('#modal-backdrop').addEventListener('click', closeSettings);

  // 设置：自动锁定
  $('#setting-autolock').addEventListener('change', async (e) => {
    state.payload.settings.autoLockMinutes = Number(e.target.value);
    await savePayload();
    resetAutoLock();
    toast('已保存');
  });

  // 设置：默认显示密码
  $('#setting-showpwd').addEventListener('change', async (e) => {
    state.payload.settings.showPasswords = e.target.checked;
    await savePayload();
    toast('已保存');
  });

  // 设置：修改主密码
  $('#btn-change-master').addEventListener('click', async () => {
    const oldPw = $('#set-oldpw').value;
    const newPw = $('#set-newpw').value;
    const newPw2 = $('#set-newpw2').value;
    if (!oldPw) { $('#settings-error').textContent = '请输入当前主密码'; return; }
    if (!newPw || newPw.length < 6) { $('#settings-error').textContent = '新主密码至少 6 位'; return; }
    if (newPw !== newPw2) { $('#settings-error').textContent = '两次新密码不一致'; return; }
    const res = await window.vaultAPI.changeMaster(oldPw, newPw);
    if (!res.ok) { $('#settings-error').textContent = res.error; return; }
    $('#set-oldpw').value = '';
    $('#set-newpw').value = '';
    $('#set-newpw2').value = '';
    $('#settings-error').textContent = '';
    closeSettings();
    toast('主密码已更新');
  });

  // 密码生成器
  $('#gen-refresh').addEventListener('click', regenPassword);
  $('#gen-copy').addEventListener('click', () => copyText($('#gen-password').value));
  $('#gen-length').addEventListener('input', regenPassword);
  ['gen-upper', 'gen-lower', 'gen-digit', 'gen-symbol'].forEach((id) => {
    $(id).addEventListener('change', regenPassword);
  });
  $('#gen-use').addEventListener('click', () => {
    if (genTarget) genTarget.value = $('#gen-password').value;
    closeGenerator();
    toast('已填入密码');
  });
  $('#gen-close').addEventListener('click', closeGenerator);
  $('#gen-backdrop').addEventListener('click', closeGenerator);

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#gen-modal').classList.contains('hidden')) { closeGenerator(); return; }
      if (!$('#settings-modal').classList.contains('hidden')) { closeSettings(); return; }
      if (!$('#drawer').classList.contains('hidden') && !state.editingId) { closeDrawer(); }
    }
    // Ctrl+N 新建
    if (e.ctrlKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (!$('#screen-main').classList.contains('hidden')) newItem();
    }
    // Ctrl+F 聚焦搜索
    if (e.ctrlKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      $('#search-input').focus();
    }
    // Ctrl+L 锁定
    if (e.ctrlKey && e.key.toLowerCase() === 'l') {
      e.preventDefault();
      if (!$('#screen-main').classList.contains('hidden')) lockVault();
    }
  });
}

// ============ 启动 ============
let chars = null;
let eyeShowing = false;

function updateCharState() {
  if (!chars) return;
  const pwLen = ($('#lock-password').value || '').length;
  chars.setPasswordLength(pwLen, eyeShowing);
}

function setupLockCharacters() {
  const stage = $('#chars-stage');
  if (stage && typeof window.mountAnimatedCharacters === 'function') {
    chars = window.mountAnimatedCharacters(stage);
  }
  const pw = $('#lock-password');
  const confirm = $('#lock-confirm');
  [pw, confirm].forEach((el) => {
    el.addEventListener('focus', () => { if (chars) chars.setTyping(true); });
    el.addEventListener('blur', () => { if (chars) chars.setTyping(false); });
  });
  pw.addEventListener('input', updateCharState);

  const eyeBtn = $('#lock-eye');
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
  bindEvents();
  init();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
