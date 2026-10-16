/* 会话数据：解锁后的 payload + 正在编辑的那一条 + 自动锁的定时器句柄。
   只管数据，不碰界面 —— 界面要什么自己读 state / 调 savePayload()。 */

import { toast } from './toast.js';

export const state = {
  payload: null,       // { settings, items, _verify }
  editingId: null,     // 正在本子上写的那一条 id
  draftId: null,       // 「写一条」刚建出来、还没保存的空条目
  bookMounted: false,
  bookDirty: true,
  autoLockTimer: null
};

/** 本子署名（封面上那行字） */
export function bookOwner() {
  return state.payload?.settings?.owner || '本子主人';
}

/** 存盘：失败时提示，成功返回 true */
export async function savePayload() {
  const res = await window.vaultAPI.save(state.payload);
  if (!res.ok) {
    toast('保存失败：' + res.error);
    return false;
  }
  return true;
}
