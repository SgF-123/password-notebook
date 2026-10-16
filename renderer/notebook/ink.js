/* 手写本子 · 字迹渲染
   把一条密码画成"手写在纸上"的样子：逐字抖动、书写倾斜、密码逐字符歪一点。
   纯函数：输入数据，输出 HTML 字符串。 */

import { esc, jit, CAT_NAME, CAT_COLOR } from './model.js';

export function pwHtml(pw, seed) {
  const real = [...String(pw)].map((ch, i) =>
    `<i style="transform: rotate(${jit(seed + i * 7, 3.2, 'deg')}) translateY(${jit(seed + i * 13, 1.2, 'px')})">${esc(ch)}</i>`
  ).join('');
  return `<span class="pw-real">${real}</span><span class="pw-dots">••••••••••••</span>`;
}

// 手写体逐字抖动：每个字自己歪一点点、上下错一点点，比一整行平着呆着像真的
export function ink(text, seed, amp) {
  return [...String(text)].map((ch, i) =>
    `<i style="transform: rotate(${jit(seed + i * 5, amp || 2.4, 'deg')}) translateY(${jit(seed + i * 11, 1.1, 'px')})">${esc(ch)}</i>`
  ).join('');
}

export function line(label, valueHtml, seed, long, isPw, cn, extra) {
  const vrot = jit(seed, 0.4, 'deg');
  return `<div class="e-line"><span class="e-label">${label}</span>` +
    `<span class="e-val${long ? ' long' : ''}${isPw ? ' pw' : ''}${cn ? ' cn' : ''}" style="--vrot:${vrot}">${valueHtml}</span>${extra || ''}</div>`;
}

export function entryHtml(it, seed) {
  const c = CAT_COLOR[it.category];
  const rot = jit(seed, 0.55, 'deg');
  const dy = jit(seed + 3, 1.5, 'px');
  const skew = jit(seed + 7, 1.1, 'deg');                 // 书写倾斜（往右歪一点）
  let html = `<div class="entry" data-entry-id="${esc(it.id)}" title="双击这一条可以直接改" style="--rot:${rot};--dy:${dy};--skew:calc(-2.4deg + ${skew})">`;
  html += `<div class="e-head">`;
  html += `<span class="e-dot" style="--c:${c}"></span>`;
  html += `<span class="e-title">${it.title.length <= 6 ? ink(it.title, seed + 2, 1.6) : esc(it.title)}</span>`;
  html += `<span class="e-cat" style="--c:${c};--tagrot:${jit(seed + 5, 4, 'deg')}">${esc(CAT_NAME[it.category])}</span>`;
  if (it.favorite) html += `<span class="e-star">★</span>`;
  html += `</div>`;
  html += `<div class="e-sep" style="--sep-rot:${jit(seed + 9, 0.35, 'deg')}"></div>`;
  if (it.username) html += line('账号', it.username.length <= 20 ? ink(it.username, seed + 11) : esc(it.username), seed + 11, it.username.length > 22);
  // 密码那一行多一颗 👁：点它要输主密码，验过才把这条读出来（等宽字体读得出字符）
  const eye = `<button type="button" class="e-eye" data-reveal="${esc(it.id)}" title="输主密码看一眼">👁</button>`;
  html += line('密码', pwHtml(it.password || '—', seed + 17), seed + 19, false, true, false, eye);
  if (it.url) html += line('网址', it.url.length <= 20 ? ink(it.url, seed + 23) : esc(it.url), seed + 23, it.url.length > 24);
  if (it.notes) html += line('备注', it.notes.length <= 14 ? ink(it.notes, seed + 29, 2.0) : esc(it.notes), seed + 29, it.notes.length > 20, false, true);
  html += `</div>`;
  return html;
}

/** 编辑页上那颗 ⚡ 用：随机一个强密码 */
export function genPassword(n) {
  const len = n || 20;
  const pool = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+';
  const arr = new Uint32Array(len);
  try { window.crypto.getRandomValues(arr); }
  catch (_) { for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 4294967296); }
  let out = '';
  for (let i = 0; i < len; i++) out += pool[arr[i] % pool.length];
  return out;
}
