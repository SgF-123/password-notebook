/* ==========================================================
   渲染层入口：把各模块接起来、绑事件、启动。

   界面结构      → index.html
   手写本子      → notebook/（model 排版 / ink 字迹 / page 整页 / sheet 编辑页 / notebook 引擎接线）
   数据与界面态  → app/（store 会话数据 / items 写改撕 / book 本子桥 / ui/* 各弹窗与解锁屏）

   这个文件只做三件事：注册回调、绑 DOM 事件、boot()。
   ========================================================== */

import { byId } from './app/lib.js';
import { state } from './app/store.js';
import { setItemHooks, mountBook, afterDataChange } from './app/book.js';
import { newItem, editItem, cancelEdit, commitEdit, deleteItem } from './app/items.js';
import { bindWindowControls } from './app/ui/titlebar.js';
import { init, handleUnlock, lockVault, setupLockCharacters } from './app/ui/lock.js';
import { openSettings, closeSettings, bindSettingsEvents } from './app/ui/settings.js';
import { openGenerator, closeGenerator, bindGeneratorEvents } from './app/ui/generator.js';
import { submitEdit } from './notebook/notebook.js';

function bindEvents() {
  // 解锁表单：阻止默认提交（否则会重载页面丢状态）
  byId('#lock-form').addEventListener('submit', (e) => { e.preventDefault(); handleUnlock(); });
  byId('#lock-submit').addEventListener('click', (e) => { e.preventDefault(); handleUnlock(); });

  // 标题栏：写一条（常驻入口）+ 三个工具
  byId('#btn-write-new').addEventListener('click', newItem);
  byId('#btn-generator').addEventListener('click', () => openGenerator(null));
  byId('#btn-settings').addEventListener('click', openSettings);
  byId('#btn-lock').addEventListener('click', () => lockVault());

  // 尾页上那行「点这里开一页新的」：点一下就开写
  byId('#screen-book').addEventListener('click', (e) => {
    if (e.target.closest('[data-write]')) newItem();
  });

  // 本子上双击：某一条 → 改它；「留白」那一页 → 在那儿写一条
  byId('#screen-book').addEventListener('dblclick', (e) => {
    const it = e.target.closest('[data-entry-id]');
    if (it && it.dataset.entryId) { editItem(it.dataset.entryId); return; }
    if (e.target.closest('[data-new]')) newItem();
  });

  bindSettingsEvents();
  bindGeneratorEvents();

  // 键盘快捷键
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!byId('#gen-modal').classList.contains('hidden')) { closeGenerator(); return; }
      if (!byId('#settings-modal').classList.contains('hidden')) { closeSettings(); return; }
      if (state.editingId) { cancelEdit(); return; }
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
      // Ctrl+S：把写在纸上的这一条收进本子
      if (state.editingId) { e.preventDefault(); submitEdit(); }
    }
  });
}

function boot() {
  setItemHooks({ onSubmit: commitEdit, onCancel: cancelEdit, onDelete: deleteItem });
  setupLockCharacters();
  bindWindowControls();
  if (document.documentElement.classList.contains('is-mac')) {
    const hint = (id, text) => { const el = byId('#' + id); if (el) el.title = text; };
    hint('btn-lock', '合上本子（锁定，⌘L）');
    hint('btn-write-new', '在新的一页写一条（⌘N）');
  }
  bindEvents();
  init();
}

// 给测试脚本 / 控制台留的把手（模块内部本来互相 import，这里只是把引用拎出来一份，
// 免得测试脚本去猜 DOM。production 逻辑不依赖它。）
window.__app = {
  state,
  byId,
  mountBook,
  afterDataChange,
  newItem,
  editItem,
  cancelEdit,
  commitEdit,
  deleteItem,
  openSettings,
  closeSettings,
  openGenerator,
  closeGenerator,
  lockVault
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
