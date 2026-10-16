'use strict';
/**
 * 加密内核：只管「明文对象 <-> 加密文件对象」的转换，不碰文件系统、不依赖 Electron。
 *
 * vault.dat 的文件格式：
 *   v1（老版本写的）：{ version:1, salt, iv, tag, data }
 *                     KDF 参数写死在代码里，只能读不能写
 *   v2（现在写的）：  { version:2, algo, kdf, salt, iv, tag, data }
 *                     KDF 参数进文件，将来调参数也认得出老档
 *
 * 算法：scrypt 派生 32 字节密钥 + AES-256-GCM（带认证标签，密码不对/文件被改都会报错）
 */

const crypto = require('crypto');
const { CODES, fail } = require('./errors');

const ALGO = 'aes-256-gcm';
const FILE_VERSION = 2;
const SALT_BYTES = 16;
const IV_BYTES = 12;

// v1 时代写死的那套参数：读老文件时用
const DEFAULT_KDF = {
  name: 'scrypt',
  N: 1 << 15,
  r: 8,
  p: 1,
  keylen: 32,
  maxmem: 64 * 1024 * 1024
};

function normalizeKdf(kdf) {
  const k = Object.assign({}, DEFAULT_KDF, kdf || {});
  return {
    name: 'scrypt',
    N: k.N,
    r: k.r,
    p: k.p,
    keylen: k.keylen,
    maxmem: k.maxmem
  };
}

function deriveKey(password, salt, kdf) {
  const k = normalizeKdf(kdf);
  return crypto.scryptSync(String(password == null ? '' : password), salt, k.keylen, {
    N: k.N,
    r: k.r,
    p: k.p,
    maxmem: k.maxmem
  });
}

/** 明文对象 -> 加密文件对象 */
function encryptPayload(payload, password, options) {
  const kdf = normalizeKdf(options && options.kdf);
  const salt = crypto.randomBytes(SALT_BYTES);
  const iv = crypto.randomBytes(IV_BYTES);
  const key = deriveKey(password, salt, kdf);

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: FILE_VERSION,
    algo: ALGO,
    kdf,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  };
}

/** 加密文件对象 -> 明文对象；密码不对抛 BAD_PASSWORD，文件坏了抛 CORRUPT */
function decryptPayload(file, password) {
  if (!file || typeof file !== 'object' || Array.isArray(file)) {
    fail(CODES.CORRUPT, '保险库文件读不出内容');
  }
  const salt = file.salt;
  const iv = file.iv;
  const tag = file.tag;
  const data = file.data;
  if (typeof salt !== 'string' || typeof iv !== 'string' || typeof tag !== 'string' || typeof data !== 'string') {
    fail(CODES.CORRUPT, '保险库文件字段不全');
  }

  const version = Number(file.version) || 1;
  if (version > FILE_VERSION) {
    fail(CODES.CORRUPT, '保险库文件是 v' + version + '，这个版本的程序读不了，请升级程序');
  }
  const kdf = version >= 2 ? normalizeKdf(file.kdf) : DEFAULT_KDF;

  let plaintext;
  try {
    const key = deriveKey(password, Buffer.from(salt, 'base64'), kdf);
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]);
  } catch (e) {
    // GCM 校验不过 = 密码不对（或者文件被动过）。对用的人来说都是「密码不对」
    fail(CODES.BAD_PASSWORD, '主密码错误', e);
  }

  try {
    return JSON.parse(plaintext.toString('utf8'));
  } catch (e) {
    fail(CODES.CORRUPT, '保险库内容不是合法 JSON', e);
  }
}

module.exports = {
  ALGO,
  FILE_VERSION,
  DEFAULT_KDF,
  normalizeKdf,
  deriveKey,
  encryptPayload,
  decryptPayload
};
