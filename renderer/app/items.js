/* 写一条 / 改一条 / 撕掉一条 —— 都写在"本子上的一页"里。
   以前是右边滑出一块面板来填；现在改成翻到那一页、直接在纸上写。
   那一页由 notebook 画成一张能填的表格（.es），纸上的按钮回调转给下面这几个函数。 */

import { uid, generatePassword } from './lib.js';
import { state, savePayload } from './store.js';
import { mountBook, afterDataChange } from './book.js';
import { toast } from './toast.js';

// 「写一条」：新的一页 + 一个还没写好的空条目
export function newItem() {
  if (!state.payload) return;
  if (state.editingId) endEdit();                        // 上一条还没写完，先收掉
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
  state.editingId = item.id;
  mountBook(item.id, true);                                    // 翻到这一页，光标已经落在"标题"上
  toast('写在这一页上 · 写完点「写进本子」');
}

// 「改这条」：把那一页变成可以写的
export function editItem(id) {
  if (!state.payload || !id) return;
  if (!state.payload.items.some((x) => x.id === id)) return;
  if (state.editingId === id) return;                    // 已经在写它了
  if (state.editingId) endEdit();
  state.editingId = id;
  state.draftId = null;
  mountBook(id, true);
}

// 收掉编辑态：新写的那条（还没保存）直接扔掉；改到一半的只是还原
export function endEdit() {
  const drafting = !!state.draftId && state.editingId === state.draftId;
  const id = state.editingId;
  state.editingId = null;
  state.draftId = null;
  if (!state.payload) return;
  if (drafting) state.payload.items = state.payload.items.filter((x) => x.id !== id);
  afterDataChange();
}

// 纸上点了「撕掉这页 / 不写了」（notebook 那边已经问过要不要撕了）
export function cancelEdit() {
  if (!state.editingId) return;
  endEdit();
}

// 纸上点了「写进本子 / 改好了」：把这一条抄进数据里
export async function commitEdit(draft) {
  const it = state.payload.items.find((x) => x.id === draft.id);
  if (!it) return;
  const wasDraft = state.draftId === draft.id;
  it.title = draft.title;
  it.username = draft.username;
  it.password = draft.password;
  it.url = draft.url;
  it.notes = draft.notes;
  it.category = draft.category;
  it.favorite = draft.favorite;
  it.updatedAt = Date.now();
  state.editingId = null;
  state.draftId = null;
  await savePayload();
  afterDataChange(it.id);                                // 重排一本，翻到刚写好的那一页
  toast(wasDraft ? '已经写进本子' : '这一页改好了');
}

// 改的时候纸上的「撕掉这页」：把这一条从本子上撕掉
export async function deleteItem(id) {
  const it = state.payload.items.find((x) => x.id === id);
  if (!it) return;
  if (!window.confirm('把「' + (it.title || '这一条') + '」这一页撕掉？')) return;
  state.payload.items = state.payload.items.filter((x) => x.id !== id);
  state.editingId = null;
  state.draftId = null;
  await savePayload();
  afterDataChange();
  toast('已经撕掉');
}
