'use strict';
const test = require('node:test');
const assert = require('node:assert');

const schema = require('../../src/core/schema');
const { CODES } = require('../../src/core/errors');

test('空本子的形状固定，方便界面直接读', () => {
  const empty = schema.emptyPayload();
  assert.deepStrictEqual(empty.items, []);
  assert.strictEqual(empty._verify, schema.VERIFY_PLAINTEXT);
  assert.strictEqual(empty.settings.autoLockMinutes, 5);
  assert.strictEqual(empty.settings.showPasswords, false);
});

test('settings 缺字段补默认、类型不对就纠正', () => {
  const s = schema.normalizeSettings({ owner: 'FRee', autoLockMinutes: -3, showPasswords: 'true', sound: undefined });
  assert.strictEqual(s.owner, 'FRee');
  assert.strictEqual(s.autoLockMinutes, 0);      // 负数夹到 0
  assert.strictEqual(s.showPasswords, true);
  assert.strictEqual(s.sound, false);
  assert.deepStrictEqual(schema.normalizeSettings(null), Object.assign({}, schema.DEFAULT_SETTINGS));
});

test('items 不是数组就当空的；条目里的怪字段被规整但不丢', () => {
  const p = schema.normalizePayload({ items: 'nope', settings: {} });
  assert.deepStrictEqual(p.items, []);

  const one = schema.normalizeItem({ id: '', title: 'x', category: 'social', favorite: 0, 备注: '留着' }, 3);
  assert.ok(one.id.startsWith('item-'));
  assert.strictEqual(one.category, 'social');
  assert.strictEqual(one.favorite, false);
  assert.strictEqual(one.备注, '留着');
  assert.ok(one.createdAt > 0);
});

test('payload 不是对象 -> BAD_INPUT', () => {
  assert.throws(() => schema.normalizePayload([]), (e) => e.code === CODES.BAD_INPUT);
  assert.throws(() => schema.normalizePayload('x'), (e) => e.code === CODES.BAD_INPUT);
});
