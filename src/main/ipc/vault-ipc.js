'use strict';
/**
 * 保险库相关的 IPC 通道：core 抛的 VaultError 在这里翻成界面认的
 * { ok:false, error, code }，界面那边一行都不用改。
 */

const { messageOf } = require('../../core/errors');
const { VAULT, CLIP, SHELL } = require('../../shared/channels');

function registerVaultIpc(ipcMain, deps) {
  const opts = deps || {};
  const vault = opts.vault;
  const clipboard = opts.clipboard;
  const shell = opts.shell;
  if (!vault) throw new Error('registerVaultIpc 需要 vault 实例');

  const reply = (work) => {
    try {
      return work();
    } catch (e) {
      return { ok: false, error: messageOf(e), code: e && e.code ? e.code : null };
    }
  };

  ipcMain.handle(VAULT.exists, () => vault.exists());
  ipcMain.handle(VAULT.create, (_e, masterPassword) =>
    reply(() => ({ ok: true, payload: vault.create(masterPassword) })));
  ipcMain.handle(VAULT.unlock, (_e, masterPassword) =>
    reply(() => ({ ok: true, payload: vault.unlock(masterPassword) })));
  ipcMain.handle(VAULT.verify, (_e, masterPassword) =>
    reply(() => { vault.verify(masterPassword); return { ok: true }; }));
  ipcMain.handle(VAULT.load, () =>
    reply(() => ({ ok: true, payload: vault.load() })));
  ipcMain.handle(VAULT.save, (_e, payload) =>
    reply(() => { vault.save(payload); return { ok: true }; }));
  ipcMain.handle(VAULT.changeMaster, (_e, oldPw, newPw) =>
    reply(() => { vault.changeMaster(oldPw, newPw); return { ok: true }; }));
  ipcMain.handle(VAULT.lock, () => {
    vault.lock();
    return { ok: true };
  });

  ipcMain.handle(CLIP.write, (_e, text) => {
    if (clipboard) clipboard.writeText(typeof text === 'string' ? text : '');
    return { ok: true };
  });

  ipcMain.handle(SHELL.openExternal, async (_e, url) => {
    if (!shell || typeof url !== 'string' || !url) return { ok: true };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  return vault;
}

module.exports = { registerVaultIpc };
