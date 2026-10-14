const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ============ 加密存储引擎 ============
const ALGO = 'aes-256-gcm';
const VERIFY_PLAINTEXT = 'vaultchat://verify/v1';

// 数据目录解析：
// 1) 环境变量 VAULT_DATA_DIR 优先
// 2) 打包后：exe 同级目录下的 data/（便携式，装到哪个盘数据就在哪个盘）
// 3) 开发时：项目根目录下的 data/
function getDataDir() {
  if (process.env.VAULT_DATA_DIR) return process.env.VAULT_DATA_DIR;
  try {
    const { app } = require('electron');
    if (app && app.isPackaged) {
      // macOS：.app 包内是只读的，密码库改放 userData（~/Library/Application Support/密码本/data）
      if (process.platform === 'darwin') return path.join(app.getPath('userData'), 'data');
      return path.join(path.dirname(app.getPath('exe')), 'data');
    }
  } catch (e) { /* 非 Electron 环境，忽略 */ }
  return path.join(__dirname, 'data');
}

function getVaultFile() {
  return path.join(getDataDir(), 'vault.dat');
}

function ensureDataDir() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function deriveKey(masterPassword, salt) {
  return crypto.scryptSync(masterPassword, salt, 32, {
    N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024
  });
}

function encryptVault(masterPassword, payload) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(masterPassword, salt);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    version: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };
}

function decryptVault(masterPassword, file) {
  const key = deriveKey(masterPassword, Buffer.from(file.salt, 'base64'));
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(file.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(file.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(file.data, 'base64')),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

function vaultExists() {
  return fs.existsSync(getVaultFile());
}

function readVaultFile() {
  if (!vaultExists()) return null;
  return JSON.parse(fs.readFileSync(getVaultFile(), 'utf8'));
}

function writeVaultFile(obj) {
  ensureDataDir();
  fs.writeFileSync(getVaultFile(), JSON.stringify(obj, null, 2), 'utf8');
}

function emptyPayload() {
  return {
    settings: {
      autoLockMinutes: 5,
      showPasswords: false
    },
    items: []
  };
}

// ============ IPC 注册 ============
function registerIpc(ipcMain, { clipboard, shell }) {
  ipcMain.handle('vault:exists', () => vaultExists());

  ipcMain.handle('vault:create', (_e, masterPassword) => {
    if (vaultExists()) return { ok: false, error: '保险库已存在' };
    const payload = emptyPayload();
    payload._verify = VERIFY_PLAINTEXT;
    writeVaultFile(encryptVault(masterPassword, payload));
    global.__vaultKey = masterPassword;
    return { ok: true, payload };
  });

  ipcMain.handle('vault:unlock', (_e, masterPassword) => {
    const file = readVaultFile();
    if (!file) return { ok: false, error: '保险库不存在' };
    try {
      const payload = decryptVault(masterPassword, file);
      if (payload._verify !== VERIFY_PLAINTEXT) {
        return { ok: false, error: '主密码错误' };
      }
      global.__vaultKey = masterPassword;
      return { ok: true, payload };
    } catch (e) {
      return { ok: false, error: '主密码错误' };
    }
  });

  ipcMain.handle('vault:load', () => {
    const masterPassword = global.__vaultKey;
    if (!masterPassword) return { ok: false, error: '未解锁' };
    const file = readVaultFile();
    try {
      return { ok: true, payload: decryptVault(masterPassword, file) };
    } catch (e) {
      return { ok: false, error: '解密失败' };
    }
  });

  ipcMain.handle('vault:save', (_e, payload) => {
    const masterPassword = global.__vaultKey;
    if (!masterPassword) return { ok: false, error: '未解锁' };
    if (payload._verify === undefined) payload._verify = VERIFY_PLAINTEXT;
    writeVaultFile(encryptVault(masterPassword, payload));
    return { ok: true };
  });

  ipcMain.handle('vault:changeMaster', (_e, oldPw, newPw) => {
    const file = readVaultFile();
    if (!file) return { ok: false, error: '保险库不存在' };
    let payload;
    try {
      payload = decryptVault(oldPw, file);
    } catch (e) {
      return { ok: false, error: '当前主密码错误' };
    }
    writeVaultFile(encryptVault(newPw, payload));
    global.__vaultKey = newPw;
    return { ok: true };
  });

  ipcMain.handle('vault:lock', () => {
    global.__vaultKey = undefined;
    return { ok: true };
  });

  ipcMain.handle('clip:write', (_e, text) => {
    if (clipboard) clipboard.writeText(text || '');
    return { ok: true };
  });

  ipcMain.handle('shell:openExternal', async (_e, url) => {
    if (!shell) return { ok: true };
    try {
      await shell.openExternal(url);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

module.exports = {
  registerIpc,
  ensureDataDir,
  vaultExists,
  encryptVault,
  decryptVault,
  emptyPayload,
  getDataDir,
  getVaultFile,
  VERIFY_PLAINTEXT
};
