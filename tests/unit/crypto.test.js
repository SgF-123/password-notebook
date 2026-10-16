'use strict';
// 加密内核单测：不需要 Electron，直接 node --test 跑
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');

const { encryptPayload, decryptPayload, FILE_VERSION, DEFAULT_KDF } = require('../../src/core/crypto');
const { CODES } = require('../../src/core/errors');

const PAYLOAD = {
  settings: { owner: 'FRee', autoLockMinutes: 5 },
  items: [{ id: 'a1', title: 'GitHub', password: 'Tb#8kLm2Qv!' }]
};

test('加密 -> 解密 拿回原样的数据，新文件是 v2（带 kdf 参数）', () => {
  const file = encryptPayload(PAYLOAD, 'master-123456');
  assert.strictEqual(file.version, FILE_VERSION);
  assert.strictEqual(file.algo, 'aes-256-gcm');
  assert.strictEqual(file.kdf.name, 'scrypt');
  assert.strictEqual(file.kdf.N, DEFAULT_KDF.N);
  assert.deepStrictEqual(decryptPayload(file, 'master-123456'), PAYLOAD);
});

test('每次写出来的盐 / IV 都不一样（同一个密码两次结果不同）', () => {
  const a = encryptPayload(PAYLOAD, 'pw');
  const b = encryptPayload(PAYLOAD, 'pw');
  assert.notStrictEqual(a.salt, b.salt);
  assert.notStrictEqual(a.iv, b.iv);
  assert.notStrictEqual(a.data, b.data);
});

test('明文和主密码都不会出现在文件里', () => {
  const text = JSON.stringify(encryptPayload(PAYLOAD, 'master-123456'));
  assert.ok(!text.includes('GitHub'));
  assert.ok(!text.includes('FRee'));
  assert.ok(!text.includes('master-123456'));
});

test('密码不对 -> BAD_PASSWORD', () => {
  const file = encryptPayload(PAYLOAD, 'right-pw');
  assert.throws(() => decryptPayload(file, 'wrong-pw'), (e) => e.code === CODES.BAD_PASSWORD);
});

test('文件被改过 -> BAD_PASSWORD（GCM 认证标签会挂）', () => {
  const file = encryptPayload(PAYLOAD, 'pw');
  const tamperedTag = Object.assign({}, file, { tag: Buffer.alloc(16, 7).toString('base64') });
  assert.throws(() => decryptPayload(tamperedTag, 'pw'), (e) => e.code === CODES.BAD_PASSWORD);

  const tamperedData = Object.assign({}, file, { data: Buffer.from('nonsense').toString('base64') });
  assert.throws(() => decryptPayload(tamperedData, 'pw'), (e) => e.code === CODES.BAD_PASSWORD);
});

test('字段不全 / 版本比程序新 -> CORRUPT', () => {
  assert.throws(() => decryptPayload({ version: 2, salt: 'x' }, 'pw'), (e) => e.code === CODES.CORRUPT);
  assert.throws(() => decryptPayload(null, 'pw'), (e) => e.code === CODES.CORRUPT);
  const future = Object.assign(encryptPayload(PAYLOAD, 'pw'), { version: 99 });
  assert.throws(() => decryptPayload(future, 'pw'), (e) => e.code === CODES.CORRUPT);
});

test('老版本（v1）写的文件还能读 —— 升级不丢数据', () => {
  // 按老代码的写法造一个 v1 文件：字段里没有 algo / kdf
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync('old-pw', salt, DEFAULT_KDF.keylen, {
    N: DEFAULT_KDF.N, r: DEFAULT_KDF.r, p: DEFAULT_KDF.p, maxmem: DEFAULT_KDF.maxmem
  });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(PAYLOAD), 'utf8')), cipher.final()]);
  const legacy = {
    version: 1,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64')
  };

  assert.deepStrictEqual(decryptPayload(legacy, 'old-pw'), PAYLOAD);
  assert.throws(() => decryptPayload(legacy, 'wrong'), (e) => e.code === CODES.BAD_PASSWORD);
});
