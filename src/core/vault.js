'use strict';
/**
 * 保险库本体：一个 Vault 实例 = 一个 vault.dat + 一份会话状态（解锁后拿着的主密码）。
 * 不依赖 Electron、不依赖 IPC，所以 node --test 能直接跑（tests/unit/vault.test.js）。
 *
 * 老版本把主密码挂在 global.__vaultKey 上；现在收进实例里，
 * 将来想开第二个本子 / 多窗口，各拿各的实例就行。
 */

const path = require('path');
const { CODES, fail } = require('./errors');
const { encryptPayload, decryptPayload } = require('./crypto');
const { vaultFileExists, readVaultFile, writeVaultFile } = require('./vault-file');
const schema = require('./schema');

const DEFAULT_FILE_NAME = 'vault.dat';

class Vault {
  constructor(options) {
    const opts = options || {};
    if (!opts.dataDir && !opts.file) {
      throw new Error('Vault 需要 dataDir 或 file');
    }
    this.file = opts.file || path.join(opts.dataDir, DEFAULT_FILE_NAME);
    this.dataDir = opts.dataDir || path.dirname(this.file);
    this.key = null;   // 解锁后是主密码，锁定后是 null
  }

  get filePath() {
    return this.file;
  }

  get unlocked() {
    return this.key !== null;
  }

  exists() {
    return vaultFileExists(this.file);
  }

  /** 首次使用：建一个空本子，直接算解锁 */
  create(masterPassword) {
    if (this.exists()) fail(CODES.ALREADY_EXISTS);
    const payload = schema.emptyPayload();
    this.write(payload, masterPassword);
    this.key = masterPassword;
    return payload;
  }

  /** 翻开本子 */
  unlock(masterPassword) {
    const file = readVaultFile(this.file);
    if (!file) fail(CODES.NOT_FOUND);

    const payload = decryptPayload(file, masterPassword);
    if (payload._verify !== schema.VERIFY_PLAINTEXT) fail(CODES.BAD_PASSWORD);

    this.key = masterPassword;
    return payload;
  }

  /** 已解锁状态下重新读盘（磁盘上的文件被换过也能读回来） */
  load() {
    if (!this.unlocked) fail(CODES.LOCKED);

    const file = readVaultFile(this.file);
    if (!file) fail(CODES.NOT_FOUND);

    try {
      return decryptPayload(file, this.key);
    } catch (e) {
      fail(CODES.CORRUPT, '解密失败', e);
    }
  }

  /**
   * 只确认一下主密码对不对，不改当前会话（不看一眼就换掉会话里的 key）。
   * 「想看一眼这条密码」这种二次确认走这里：对 → true，错 → BAD_PASSWORD。
   */
  verify(masterPassword) {
    const file = readVaultFile(this.file);
    if (!file) fail(CODES.NOT_FOUND);

    const payload = decryptPayload(file, masterPassword);
    if (payload._verify !== schema.VERIFY_PLAINTEXT) fail(CODES.BAD_PASSWORD);
    return true;
  }

  /** 存盘：过一遍 schema 再写，写下去的是规范化之后的数据 */
  save(payload) {
    if (!this.unlocked) fail(CODES.LOCKED);
    const clean = schema.normalizePayload(payload);
    this.write(clean, this.key);
    return clean;
  }

  /** 改主密码：用旧密码解一次，再用新密码重新加密写回 */
  changeMaster(oldPassword, newPassword) {
    const file = readVaultFile(this.file);
    if (!file) fail(CODES.NOT_FOUND);

    let payload;
    try {
      payload = decryptPayload(file, oldPassword);
    } catch (e) {
      fail(CODES.BAD_PASSWORD, '当前主密码错误', e);
    }

    this.write(payload, newPassword);
    this.key = newPassword;
    return payload;
  }

  /** 合上本子：忘掉主密码 */
  lock() {
    this.key = null;
  }

  write(payload, password) {
    writeVaultFile(this.file, encryptPayload(payload, password));
  }
}

module.exports = { Vault, DEFAULT_FILE_NAME };
