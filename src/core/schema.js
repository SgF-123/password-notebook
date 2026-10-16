'use strict';
/**
 * 数据模型：保险库里那坨 JSON 长什么样，只在这里定义一次。
 *
 * 存盘前过一遍 normalizePayload —— 界面上手滑写出畸形数据，也进不了保险库；
 * 同时补齐缺省字段、保留不认识的字段（将来加字段不会把老数据洗掉）。
 */

const { CODES, fail } = require('./errors');

const SCHEMA_VERSION = 1;
const VERIFY_PLAINTEXT = 'vaultchat://verify/v1';   // 解锁后用来确认「密码真的对」
const CATEGORIES = ['web', 'social', 'email', 'bank', 'work', 'other'];

const DEFAULT_SETTINGS = {
  owner: '',
  autoLockMinutes: 5,
  showPasswords: false,
  sound: false
};

const asText = (v, fallback) => (typeof v === 'string' ? v : (v == null ? (fallback || '') : String(v)));
const asBool = (v) => v === true || v === 1 || v === '1' || v === 'true';
const asInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/** 一条密码记录（字段跟本子上的表格一一对应） */
function normalizeItem(raw, index) {
  const it = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const now = Date.now();
  return Object.assign({}, it, {
    id: asText(it.id) || 'item-' + now.toString(36) + '-' + (index || 0),
    title: asText(it.title),
    username: asText(it.username),
    password: asText(it.password),
    url: asText(it.url),
    notes: asText(it.notes),
    category: CATEGORIES.indexOf(it.category) >= 0 ? it.category : 'other',
    favorite: asBool(it.favorite),
    createdAt: asInt(it.createdAt, now),
    updatedAt: asInt(it.updatedAt, now)
  });
}

function normalizeSettings(raw) {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = Object.assign({}, DEFAULT_SETTINGS, s);
  out.owner = asText(s.owner, '');
  out.autoLockMinutes = Math.max(0, asInt(s.autoLockMinutes, DEFAULT_SETTINGS.autoLockMinutes));
  out.showPasswords = asBool(s.showPasswords);
  out.sound = asBool(s.sound);
  return out;
}

/** 新建一个空本子 */
function emptyPayload() {
  return {
    version: SCHEMA_VERSION,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    items: [],
    _verify: VERIFY_PLAINTEXT
  };
}

/** 存盘前的最后一道闸 */
function normalizePayload(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(CODES.BAD_INPUT, '保存的内容不是对象');
  }
  const items = Array.isArray(raw.items) ? raw.items.map(normalizeItem) : [];
  return Object.assign({}, raw, {
    version: SCHEMA_VERSION,
    settings: normalizeSettings(raw.settings),
    items,
    _verify: VERIFY_PLAINTEXT
  });
}

module.exports = {
  SCHEMA_VERSION,
  VERIFY_PLAINTEXT,
  CATEGORIES,
  DEFAULT_SETTINGS,
  normalizeItem,
  normalizeSettings,
  emptyPayload,
  normalizePayload
};
