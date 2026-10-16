/* 设置弹窗：本子署名 / 自动锁定 / 显示密码 / 翻页音效 / 修改主密码 */

import { byId } from '../lib.js';
import { state, savePayload } from '../store.js';
import { afterDataChange } from '../book.js';
import { toast } from '../toast.js';
import { resetAutoLock } from './lock.js';
import { setMasked, setSound } from '../../notebook/notebook.js';

export function openSettings() {
  byId('#setting-owner').value = state.payload.settings.owner || '';
  byId('#setting-autolock').value = String(state.payload.settings.autoLockMinutes ?? 5);
  byId('#setting-showpwd').checked = !!state.payload.settings.showPasswords;
  byId('#setting-sound').checked = !!state.payload.settings.sound;
  byId('#set-oldpw').value = '';
  byId('#set-newpw').value = '';
  byId('#set-newpw2').value = '';
  byId('#settings-error').textContent = '';
  byId('#settings-modal').classList.remove('hidden');
  byId('#modal-backdrop').classList.remove('hidden');
}

export function closeSettings() {
  byId('#settings-modal').classList.add('hidden');
  byId('#modal-backdrop').classList.add('hidden');
}

export function bindSettingsEvents() {
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
    setMasked(!e.target.checked);
    toast('已保存');
  });

  byId('#setting-sound').addEventListener('change', async (e) => {
    state.payload.settings.sound = e.target.checked;
    await savePayload();
    setSound(e.target.checked);
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
}
