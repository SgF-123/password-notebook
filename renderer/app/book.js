/* 本子与数据之间的桥：数据变了 → 重挂一本；刚写完哪一条 → 翻到那一页。
   纸上那几个按钮（写进本子 / 撕掉 / 不写了）由 app 层注册进来（setItemHooks），
   这样 book.js 不用去 import items.js，两边不会打转。 */

import { state, bookOwner } from './store.js';
import { mount, gotoPage, holdSheetWrite } from '../notebook/notebook.js';

let itemHooks = {};

export function setItemHooks(hooks) {
  itemHooks = hooks || {};
}

export function mountBook(jumpToId, keepPage) {
  if (!state.payload) return null;
  const editing = state.editingId
    ? { id: state.editingId, kind: state.draftId === state.editingId ? 'new' : 'edit' }
    : null;
  const res = mount({ owner: bookOwner(), items: state.payload.items }, {
    edit: editing,
    hooks: itemHooks,
    keep: !!keepPage
  });
  state.bookMounted = true;
  state.bookDirty = false;
  if (jumpToId) {
    const page = res && res.pageOf(jumpToId);
    // 就在这一页：马上动笔；要翻过去：先把动作往后压，等翻到了再写
    if (page && page !== res.page) {
      holdSheetWrite();                              // 按住写在纸上的那一页，等翻到了再放开
      setTimeout(() => gotoPage(page), 80);           // 等 turn.js 站稳再翻（太急会翻错页）
    }
  }
  return res;
}

// 数据变了：本子正翻开就重挂一本（顺便翻到刚写的那条），没翻开就等下次进本子
export function afterDataChange(jumpToId) {
  state.bookDirty = true;
  const app = document.getElementById('screen-app');
  if (!app || app.classList.contains('hidden')) return;
  mountBook(jumpToId, true);    // 重挂时都停在原来那一页，要翻的话由上面带动画翻
}
