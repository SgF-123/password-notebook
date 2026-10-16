'use strict';
/**
 * IPC 装配入口：真身（src/main/index.js）和测试脚本共用这一处，
 * 免得测试环境和真身各装一半、行为对不上。
 *
 *   const { vault } = registerIpc(ipcMain, { clipboard, shell });
 *   const { vault } = registerIpc(ipcMain, { clipboard, shell, dataDir: 'D:\tmp' });
 */

const { Vault } = require('../../core/vault');
const paths = require('../paths');
const { registerVaultIpc } = require('./vault-ipc');
const { registerWindowIpc } = require('./window-ipc');

function registerIpc(ipcMain, options) {
  const opts = options || {};
  const vault = opts.vault || new Vault({ dataDir: opts.dataDir || paths.getDataDir() });

  registerVaultIpc(ipcMain, { vault, clipboard: opts.clipboard, shell: opts.shell });
  registerWindowIpc(ipcMain);

  return { vault };
}

module.exports = { registerIpc };
