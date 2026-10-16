/* 页面提示条 + 复制到剪贴板（app 的 #toast 会浮在标题栏下方） */

import { byId } from './lib.js';

let toastTimer = null;

export function toast(msg) {
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

export async function copyText(text, msg) {
  await window.vaultAPI.copy(text || '');
  toast(msg || '已复制');
}
