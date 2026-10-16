/* app 层通用小工具（纯函数 + DOM 便利函数），谁都能用，自己不依赖别人 */

export function byId(id) {
  if (typeof id === 'string' && id.startsWith('#')) id = id.slice(1);
  return document.getElementById(id);
}

export const allOf = (sel) => Array.from(document.querySelectorAll(sel));

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 强密码生成：渲染进程也有 crypto.getRandomValues */
export function generatePassword(length, opts) {
  const sets = {
    upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    lower: 'abcdefghijkmnopqrstuvwxyz',
    digit: '23456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.<>?'
  };
  let pool = '';
  Object.keys(opts).forEach((k) => { if (opts[k]) pool += sets[k]; });
  if (!pool) pool = sets.lower + sets.digit;
  let result = '';
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  for (let i = 0; i < length; i++) result += pool[arr[i] % pool.length];
  return result;
}
