/* 无边框窗口的自绘标题栏：最小化 / 最大化 / 关闭 + 最大化图标 */

import { allOf } from '../lib.js';

const WIN_ICON_MAX = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="6" width="12" height="12" rx="1.8"/></svg>';
const WIN_ICON_RESTORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.6" y="9.4" width="9.6" height="9.6" rx="1.6"/><path d="M8.4 7.4h6.4a2 2 0 0 1 2 2v6.4"/></svg>';

export async function refreshMaxIcon() {
  if (!window.winAPI) return;
  let isMax = false;
  try { isMax = await window.winAPI.isMaximized(); } catch (e) { /* 忽略 */ }
  allOf('[data-win="max"]').forEach((btn) => {
    btn.innerHTML = isMax ? WIN_ICON_RESTORE : WIN_ICON_MAX;
    btn.title = isMax ? '向下还原' : '最大化';
  });
}

export function bindWindowControls() {
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
