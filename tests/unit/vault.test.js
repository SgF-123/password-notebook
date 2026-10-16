'use strict';
// 保险库本体单测：不需要 Electron，直接 node --test 跑
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Vault } = require('../../src/core/vault');
const { CODES } = require('../../src/core/errors');
const { backupPath } = require('../../src/core/vault-file');

const PW = 'master-123456';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
}

function newVault(dir) {
  return new Vault({ dataDir: dir });
}

function payloadWith(items) {
  return {
    settings: { owner: 'FRee', autoLockMinutes: 5, showPasswords: false, sound: false },
    items
  };
}

const ITEM = {
  id: 'a1',
  title: 'GitHub',
  username: 'free-dev',
  password: 'Tb#8kLm2Qv!',
  url: 'github.com',
  notes: '',
  category: 'work',
  favorite: true,
  createdAt: 1700000000000,
  updatedAt: 1700000000000
};

test('新建：生成 vault.dat，磁盘上是 v2 密文', () => {
  const dir = tempDir();
  const v = newVault(dir);
  assert.strictEqual(v.exists(), false);

  const payload = v.create(PW);
  assert.strictEqual(v.exists(), true);
  assert.strictEqual(v.unlocked, true);
  assert.deepStrictEqual(payload.items, []);
  assert.strictEqual(payload.version, 1);

  const raw = fs.readFileSync(v.filePath, 'utf8');
  const onDisk = JSON.parse(raw);
  assert.strictEqual(onDisk.version, 2);
  assert.ok(!raw.includes(PW));

  // 重复创建要拦住
  assert.throws(() => v.create(PW), (e) => e.code === CODES.ALREADY_EXISTS);
});

test('锁定前不许读写；锁上之后 save/load 都报未解锁', () => {
  const dir = tempDir();
  const v = newVault(dir);
  assert.throws(() => v.save(payloadWith([])), (e) => e.code === CODES.LOCKED);
  assert.throws(() => v.load(), (e) => e.code === CODES.LOCKED);

  v.create(PW);
  v.lock();
  assert.strictEqual(v.unlocked, false);
  assert.throws(() => v.save(payloadWith([])), (e) => e.code === CODES.LOCKED);
  assert.throws(() => v.load(), (e) => e.code === CODES.LOCKED);
});

test('保存 -> 换个实例解锁，数据一模一样', () => {
  const dir = tempDir();
  newVault(dir).create(PW);

  const writer = newVault(dir);
  writer.unlock(PW);
  writer.save(payloadWith([ITEM]));

  const reader = newVault(dir);
  const payload = reader.unlock(PW);
  assert.strictEqual(payload.items.length, 1);
  assert.strictEqual(payload.items[0].title, 'GitHub');
  assert.strictEqual(payload.items[0].category, 'work');
  assert.strictEqual(payload.items[0].favorite, true);
  assert.deepStrictEqual(reader.load(), payload);
});

test('错密码打不开（BAD_PASSWORD），文件不存在报 NOT_FOUND', () => {
  const dir = tempDir();
  const v = newVault(dir);
  assert.throws(() => v.unlock(PW), (e) => e.code === CODES.NOT_FOUND);

  v.create(PW);
  const other = newVault(dir);
  assert.throws(() => other.unlock('wrong-password'), (e) => e.code === CODES.BAD_PASSWORD);
  assert.strictEqual(other.unlocked, false);
});

test('存盘前过一遍 schema：畸形数据进不了保险库', () => {
  const dir = tempDir();
  const v = newVault(dir);
  v.create(PW);

  const saved = v.save({
    settings: { autoLockMinutes: '15', showPasswords: 1 },
    items: [
      { id: 'x1', title: 123, category: '不存在的分类', favorite: 'true', 额外字段: '留着' },
      'not-an-object'
    ]
  });

  assert.strictEqual(saved.settings.autoLockMinutes, 15);
  assert.strictEqual(saved.settings.showPasswords, true);
  assert.strictEqual(saved.settings.owner, '');           // 缺省补齐
  assert.strictEqual(saved.settings.sound, false);
  assert.strictEqual(saved.items.length, 2);              // 坏条目也不丢，只是被规整
  assert.strictEqual(saved.items[0].title, '123');
  assert.strictEqual(saved.items[0].category, 'other');   // 不认识的分类归到 other
  assert.strictEqual(saved.items[0].favorite, true);
  assert.strictEqual(saved.items[0].额外字段, '留着');     // 不认识的字段保留
  assert.ok(saved.items[1].id);                           // 没有 id 的补一个

  assert.throws(() => v.save('不是对象'), (e) => e.code === CODES.BAD_INPUT);
  assert.throws(() => v.save(null), (e) => e.code === CODES.BAD_INPUT);
});

test('改主密码：旧密码作废、新密码能开、数据还在', () => {
  const dir = tempDir();
  const v = newVault(dir);
  v.create(PW);
  v.save(payloadWith([ITEM]));

  v.changeMaster(PW, 'new-master-654321');
  assert.strictEqual(v.unlocked, true);

  const oldPw = newVault(dir);
  assert.throws(() => oldPw.unlock(PW), (e) => e.code === CODES.BAD_PASSWORD);

  const newPw = newVault(dir);
  const payload = newPw.unlock('new-master-654321');
  assert.strictEqual(payload.items[0].title, 'GitHub');
});

test('改主密码时旧密码不对 -> 当前主密码错误', () => {
  const dir = tempDir();
  const v = newVault(dir);
  v.create(PW);
  assert.throws(() => v.changeMaster('wrong', 'whatever-123'), (e) => e.code === CODES.BAD_PASSWORD && /当前主密码错误/.test(e.message));
});

test('覆盖写会留一份 .bak，且不留 .tmp', () => {
  const dir = tempDir();
  const v = newVault(dir);
  v.create(PW);
  assert.strictEqual(fs.existsSync(backupPath(v.filePath)), false);

  v.save(payloadWith([ITEM]));
  assert.strictEqual(fs.existsSync(backupPath(v.filePath)), true);
  assert.strictEqual(fs.existsSync(v.filePath + '.tmp'), false);

  // .bak 就是上一次的内容（这里上一次是空本子）
  const backup = JSON.parse(fs.readFileSync(backupPath(v.filePath), 'utf8'));
  assert.strictEqual(backup.version, 2);
});

test('verify：只验主密码对不对，不动当前会话', () => {
  const dir = tempDir();
  const v = newVault(dir);
  v.create(PW);

  assert.strictEqual(v.verify(PW), true);
  assert.throws(() => v.verify('wrong-password'), (e) => e.code === CODES.BAD_PASSWORD);
  assert.strictEqual(v.unlocked, true, '验一下不该把会话搞乱');
  assert.strictEqual(v.verify(PW), true);

  // 没有保险库文件时也要说清楚
  assert.throws(() => newVault(tempDir()).verify(PW), (e) => e.code === CODES.NOT_FOUND);
});

test('文件被写坏 -> CORRUPT，不会假装成"密码错误"', () => {
  const dir = tempDir();
  const file = path.join(dir, 'vault.dat');
  fs.writeFileSync(file, '这不是 JSON', 'utf8');
  assert.throws(() => newVault(dir).unlock(PW), (e) => e.code === CODES.CORRUPT);
});
