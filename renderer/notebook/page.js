/* 手写本子 · 整页 HTML
   pageHtml(page, pageIndex, isLeft, view)
     view = { owner, items, editId, editKind }  ← 只把"画这一页要用到的东西"传进来，
     所以这个文件是纯的：给同样的输入，永远画同样的页。 */

import { esc, jit, hash, CAT_COLOR } from './model.js';
import { entryHtml } from './ink.js';
import { editSheetHtml } from './sheet.js';

// isLeft：偶数页号（P2/P4/…）在左，奇数页号在右 —— 这是 turn.js 双页对开的规则
export function pageHtml(page, pageIndex, isLeft, view) {
  const side = isLeft ? 'left-page' : 'right-page';
  const seed = hash('p' + pageIndex);
  const owner = view.owner;
  const items = view.items || [];
  const edit = view.editId ? { id: view.editId, kind: view.editKind } : null;

  if (page.type === 'cover' || page.type === 'backcover') {
    const isBack = page.type === 'backcover';
    return `<div class="page cover ${side}">
        <div class="cover-inner">
          <div class="cover-title">${isBack ? '密码本' : '密码本'}</div>
          <div class="cover-rule"></div>
          <div class="cover-sub">${isBack ? 'VAULT · 本地加密' : 'PASSWORD NOTEBOOK'}</div>
          <div class="cover-owner">${isBack ? '请勿外借' : esc(owner) + ' 的私藏'}</div>
        </div>
        ${isBack ? '' : '<div class="cover-clasp"></div>'}
      </div>`;
  }

  if (page.type === 'flyleaf') {
    return `<div class="page flyleaf ${side}">
        <div class="fly-box">
          <div class="fly-title">本子使用说明</div>
          <div class="fly-line">
            这本子只存在你自己的电脑里<br>
            每一条密码都写在一页上<br>
            想抄哪条，翻到那一页就行
          </div>
          <div class="fly-line fly-line--hint">
            想写新的，按 ${document.documentElement.classList.contains('is-mac') ? '⌘' : 'Ctrl'}+N<br>
            翻页：拖页角，或按 ← →<br>
            想改哪条，双击它
          </div>
          <div class="fly-stamp">密码本<br>亲启</div>
        </div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
  }

  if (page.type === 'toc') {
    const rows = page.rows.map((r, k) =>
      `<div class="toc-row" data-page="${r.page}" data-entry-id="${esc(r.it.id)}" style="--rowrot:${jit(hash('row' + pageIndex + '-' + k), 0.5, 'deg')}">
          <span class="toc-dot" style="background:${CAT_COLOR[r.it.category]}"></span>
          <span class="toc-title">${esc(r.it.title)}</span>
          <span class="toc-lead"></span>
          <span class="toc-page">P${r.page}</span>
        </div>`).join('');
    return `<div class="page ${side}">
        <div class="toc-head">目录<small>${page.parts > 1 ? 'CONTENTS · ' + page.part + '/' + page.parts : 'CONTENTS'}</small></div>
        ${rows}
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
  }

  if (page.type === 'tailnote') {
    const favs = items.filter((i) => i.favorite).length;
    const cats = new Set(items.map((i) => i.category)).size;
    const year = new Date().getFullYear();
    return `<div class="page tailnote ${side}">
        <h3>写在最后一页</h3>
        <p>· 本子里的字都是加密后存的，锁上就打不开</p>
        <p>· 主密钥忘了，谁也翻不开，包括我</p>
        <p>· 建议每个网站用不同的密码，别偷懒</p>
        <div class="stat-line">本子里记着 <b>${items.length}</b> 条密码 · <b>${favs}</b> 条常用 · <b>${cats}</b> 个分类</div>
        <div class="tail-action" data-write="1" title="在新的一页写一条（Ctrl+N）">✍ 还想接着写？点这里开一页新的</div>
        <div class="sign">
          <div>这本子我记到了 ${year} 年，</div>
          <div>往后的日子接着写。</div>
          <div class="sign-name">—— ${esc(owner)}</div>
        </div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
  }

  if (page.type === 'blank') {
    return `<div class="page blank-page ${side}" data-new="1" title="双击这里，在新的一页写一条">
        <div class="blank-note">留白<span>双击这里就能写一条 · 以后新加的密码会写到这儿</span></div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
  }

  // entries（正在写的那一条画成"能填的表格"，其余照旧画成手写好的字）
  const editingPage = !!(edit && page.items.some((it) => it.id === edit.id));
  const body = page.items.length
    ? page.items.map((it, k) => ((edit && it.id === edit.id)
      ? editSheetHtml(it, edit.kind, { masked: view.masked })
      : entryHtml(it, seed + k * 101))).join('')
    : `<div class="toc-note">这一页还空着，等新密码住进来。</div>`;
  return `<div class="page ${side}">
      ${page.first && !editingPage ? '<div class="toc-head" style="font-size:24px;margin-bottom:14px">我的密码<small>按分类排列</small></div>' : ''}
      ${body}
      <div class="page-no">${pageIndex + 1}</div>
    </div>`;
}
