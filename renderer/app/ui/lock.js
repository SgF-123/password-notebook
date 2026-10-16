/* 解锁屏：创建 / 解锁 / 合上本子（锁定），外加闲置自动锁定。
   这一屏的所有东西都在这里：动画小人、密码框、过渡动画、锁定时长。 */

import { byId } from '../lib.js';
import { state } from '../store.js';
import { mountBook } from '../book.js';
import { refreshMaxIcon } from './titlebar.js';
import { fit, setMasked, setSound } from '../../notebook/notebook.js';

// ---------- 解锁屏的动画小人 ----------
let chars = null;
let eyeShowing = false;

function updateCharState() {
  if (!chars) return;
  const pwLen = (byId('#lock-password').value || '').length;
  chars.setPasswordLength(pwLen, eyeShowing);
}

export function setupLockCharacters() {
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

// ---------- 闲置自动锁定 ----------
export function resetAutoLock() {
  clearTimeout(state.autoLockTimer);
  const minutes = Number(state.payload?.settings?.autoLockMinutes ?? 5);
  if (!minutes) return;
  state.autoLockTimer = setTimeout(() => { lockVault(); }, minutes * 60 * 1000);
}

['click', 'keydown', 'mousemove'].forEach((evt) => {
  document.addEventListener(evt, () => resetAutoLock(), { passive: true });
});

// ---------- 解锁 / 创建流程 ----------
export async function applyLockMode() {
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

export async function init() {
  updateCharState();
  await showLock();
}

export async function handleUnlock() {
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
export async function showLock() {
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

/** 等这一帧真的画过（rAF + 一个宏任务）：用来把"首次绘制"和"动画"错开 */
function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

export async function enterMain(payload) {
  state.payload = payload;
  state.editingId = null;
  state.draftId = null;
  state.bookMounted = false;
  state.bookDirty = true;

  const lock = byId('#screen-lock');
  const app = byId('#screen-app');

  // 先把本子挂上、让它在解锁屏底下把第一帧画出来，等这一帧真的画过了再开始动画。
  // （"翻开本子"的第一帧本来要替整块屏幕付绘制成本，实测能顿 240ms；挪到动画之前就顺了。）
  app.classList.remove('hidden');
  app.style.opacity = '0.01';        // 一点点不透明：让这一屏在锁屏底下先画好（完全透明会被跳过）
  mountBook();
  resetAutoLock();
  refreshMaxIcon();

  await nextPaint();

  app.style.opacity = '';

  app.classList.add('app-entering');
  lock.classList.add('lock-leaving');            // 解锁屏固定成浮层淡出，底下的本子露出来

  setTimeout(() => {
    lock.classList.add('hidden');
    lock.classList.remove('lock-leaving');
    app.classList.remove('app-entering');
    fit();                                       // 布局变化后再量一次，保证排版严丝合缝
  }, ENTER_MS);

  setSound(!!payload.settings?.sound);
  // 遮不遮密码等本子真正画出来再切（跟过渡动画错开一帧，免得闪一下）
  setTimeout(() => setMasked(!payload.settings?.showPasswords), 60);
}

export async function lockVault() {
  await window.vaultAPI.lock();
  state.payload = null;
  state.editingId = null;
  state.draftId = null;
  await showLock();
}
