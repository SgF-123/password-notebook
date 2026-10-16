/* 手写本子 · 写在纸上的那一页（写一条 / 改这一条）
   这一页不画手写好的字，而是一张"能直接写"的表格：每行高正好一个行距，
   行里输入框的下边线正好压在本子的横线上 —— 写进去的字就落在线上。

   这个模块只管 DOM：画表格、接按钮、把表里的字抄回来。
   "写完交给谁""要不要真撕"由 notebook.js 决定（handlers 回调）。 */

import { esc, CAT_NAME, CAT_COLOR } from './model.js';
import { genPassword } from './ink.js';

export function editSheetHtml(it, kind, opts) {
  const isNew = kind !== 'edit';
  const masked = !!(opts && opts.masked);      // 跟"设置 → 显示密码"同一个开关
  const cats = Object.keys(CAT_NAME).map((key) =>
    `<button type="button" class="es-cat${(it.category || 'web') === key ? ' active' : ''}" data-cat="${key}" style="--c:${CAT_COLOR[key]}">${CAT_NAME[key]}</button>`
  ).join('');
  const rawTitle = isNew ? '' : it.title;
  return `<div class="es es--${isNew ? 'new' : 'edit'}" data-entry-id="${esc(it.id)}">
      <div class="es-head">
        <span class="es-title">${isNew ? '写一条' : '改这一条'}</span>
        <span class="es-sub">${isNew ? '新的一页 · 就写在这一页上' : '这一页可以改'}</span>
      </div>
      <div class="es-row">
        <span class="es-label">标题</span>
        <input class="es-in es-title-in" data-k="title" id="es-title" value="${esc(rawTitle)}" placeholder="例如：GitHub" spellcheck="false" />
      </div>
      <div class="es-row">
        <span class="es-label">账号</span>
        <input class="es-in" data-k="username" id="es-username" value="${esc(it.username)}" placeholder="邮箱 / 用户名" spellcheck="false" />
      </div>
      <div class="es-row">
        <span class="es-label">密码</span>
        <input class="es-in es-pw" type="${masked ? 'password' : 'text'}" data-k="password" id="es-password" value="${esc(it.password)}" spellcheck="false" />
        <button type="button" class="es-mini es-eye${masked ? '' : ' on'}" id="es-eye" title="输主密码看一眼">👁</button>
        <button type="button" class="es-mini" id="es-gen" title="换一个强密码">⚡</button>
        <button type="button" class="es-mini" id="es-copy" title="复制这条密码">复制</button>
      </div>
      <div class="es-row">
        <span class="es-label">网址</span>
        <input class="es-in" data-k="url" id="es-url" value="${esc(it.url)}" placeholder="https://" spellcheck="false" />
        <button type="button" class="es-mini" id="es-open" title="用浏览器打开">打开</button>
      </div>
      <div class="es-row">
        <span class="es-label">备注</span>
        <input class="es-in" data-k="notes" id="es-notes" value="${esc(it.notes)}" placeholder="可选" spellcheck="false" />
      </div>
      <div class="es-row es-row--cats">
        <span class="es-label">分类</span>
        <span class="es-cats">${cats}</span>
      </div>
      <div class="es-row es-row--fav">
        <label class="es-fav"><input type="checkbox" id="es-fav" ${it.favorite ? 'checked' : ''} />★ 记为常用（会画在本子上）</label>
      </div>
      <div class="es-actions">
        <button type="button" class="es-btn es-btn--save" id="es-save">${isNew ? '写进本子' : '改好了'}</button>
        <button type="button" class="es-btn es-btn--cancel" id="es-cancel">${isNew ? '撕掉这页' : '不写了'}</button>
        ${isNew ? '' : '<button type="button" class="es-btn es-btn--danger" id="es-delete">撕掉这页</button>'}
      </div>
    </div>`;
}

/** 把纸上的字抄回来（没起标题也照抄，交给调用方提示） */
export function readSheetItem(root) {
  const sheet = root.querySelector('.es');
  if (!sheet) return null;
  const val = (k) => { const n = sheet.querySelector('[data-k="' + k + '"]'); return n ? n.value : ''; };
  const activeCat = sheet.querySelector('.es-cat.active');
  return {
    id: sheet.dataset.entryId,
    title: val('title').trim(),
    username: val('username').trim(),
    password: val('password'),
    url: val('url').trim(),
    notes: val('notes').trim(),
    category: activeCat ? activeCat.dataset.cat : 'other',
    favorite: !!sheet.querySelector('#es-fav').checked
  };
}

/**
 * 接上编辑页上的按钮：换个密码 / 复制 / 打开网址 / 选分类 / 写进本子 / 撕掉。
 * handlers: { onGenerated, onCopy(text), onOpen(url), onSave, onCancel, onDelete(id) }
 */
export function bindSheet(root, handlers) {
  const sheet = root.querySelector('.es');
  if (!sheet) return;
  const h = handlers || {};
  const q = (sel) => sheet.querySelector(sel);

  q('#es-gen').onclick = () => {
    q('#es-password').value = genPassword(20);
    if (h.onGenerated) h.onGenerated();
  };
  q('#es-copy').onclick = () => { if (h.onCopy) h.onCopy(q('#es-password').value); };
  q('#es-eye').onclick = () => { if (h.onReveal) h.onReveal(q('#es-password'), q('#es-eye')); };
  q('#es-open').onclick = () => { if (h.onOpen) h.onOpen((q('#es-url').value || '').trim()); };

  sheet.querySelectorAll('.es-cat').forEach((btn) => {
    btn.onclick = () => {
      sheet.querySelectorAll('.es-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  q('#es-save').onclick = () => { if (h.onSave) h.onSave(); };
  q('#es-cancel').onclick = () => { if (h.onCancel) h.onCancel(); };
  const del = q('#es-delete');
  if (del) del.onclick = () => {
    sheet.classList.add('es-ripped');                 // 先做出"撕掉"的动作
    if (h.onDelete) h.onDelete(sheet.dataset.entryId);
    // 用户要是选了"取消"（本子没重挂），把这一页放回来
    setTimeout(() => { if (document.body.contains(sheet)) sheet.classList.remove('es-ripped'); }, 800);
  };

  sheet.querySelectorAll('.es-in').forEach((inp) => {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (h.onSave) h.onSave(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (h.onCancel) h.onCancel(); }
    });
  });

  // 光标直接落到"标题"上，省一次点击。
  // focus() 会让 overflow:hidden 的页容器滚出一条缝，所以顺手把滚动位置清零。
  const titleIn = q('#es-title');
  if (titleIn) {
    setTimeout(() => {
      try {
        titleIn.focus({ preventScroll: true });
        titleIn.setSelectionRange(titleIn.value.length, titleIn.value.length);
      } catch (_) { /* 忽略 */ }
      root.querySelectorAll('.nb-page').forEach((p) => { p.scrollTop = 0; p.scrollLeft = 0; });
    }, 420);
  }
}
