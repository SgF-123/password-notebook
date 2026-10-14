/* ==========================================================
   密码本 · 手写本子
   - 翻页引擎：turn.js（Emmanuel Garcia，个人免费授权）+ jQuery
     · 拖拽从任意角都成立，纸面卷曲、投影、翻页动效都交给库
     · 页面尺寸按窗口自适应；排版层用 --fit 等比缩放（不动 turn.js 的坐标）
   - 数据：window.NOTEBOOK_DATA（{owner, items[]}）或自带演示数据
   ========================================================== */
(function () {
  'use strict';

  const PAGE_W = 440;           // 排版基准尺寸：页面内容全按这个尺寸写
  const PAGE_H = 600;
  const LINE = 28;              // 页面行距（与 CSS --line 一致，手写字要落在横线上）
  // 留白：书占舞台的多少（数值越大书越小，边上露出越多桌垫/桌面）。
  // 走 CSS 变量是为了方便调"本子大小"：--book-pad-x / --book-pad-y。
  function padX() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--book-pad-x')) || 120; }
  function padY() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--book-pad-y')) || 140; }

  const CAT_NAME = { web: '网站', social: '社交', email: '邮箱', bank: '银行', work: '工作', other: '其他' };
  const CAT_COLOR = { web: '#4b7bec', social: '#07c160', email: '#5d9cec', bank: '#eb4d4b', work: '#f7b731', other: '#8f959e' };

  // ---------- 演示数据（明显是假数据，仅用于看效果） ----------
  const DEMO = {
    owner: '本子主人',
    items: [
      { title: '淘宝', username: 'free_shopper@163.com', password: 'Tb#8kLm2Qv!', url: 'taobao.com', notes: '主账号，绑了支付宝', category: 'web', favorite: true },
      { title: 'GitHub', username: 'free-dev', password: 'Gh$7wPz9Rt2', url: 'github.com', notes: '开了两步验证', category: 'work', favorite: true },
      { title: '微信', username: '138****6688', password: 'Wx@2024#abc', url: '', notes: '换机扫码用', category: 'social' },
      { title: 'QQ 邮箱', username: '668899@qq.com', password: 'Qm!5tYu8Io3', url: 'mail.qq.com', notes: '', category: 'email' },
      { title: '招商银行', username: '6214********3721', password: 'Cm_9pLk3Wq', url: 'cmbchina.com', notes: '查询密码另记', category: 'bank', favorite: true },
      { title: '公司 VPN', username: 'free.zhao', password: 'Vp&6nHj1Kd', url: 'vpn.company.cn', notes: '每 90 天要改', category: 'work' },
      { title: 'B 站', username: 'free_bili', password: 'Bb@3xCe7Uy', url: 'bilibili.com', notes: '大会员 2027 到期', category: 'social' },
      { title: '网易云音乐', username: 'free_music', password: 'Nc#4vBn8Mj', url: 'music.163.com', notes: '', category: 'social' },
      { title: '路由器管理', username: 'admin', password: 'Rt_2zXc5Vb', url: '192.168.1.1', notes: '家里那台', category: 'other' },
      { title: 'Steam', username: 'free_steam', password: 'St!7mQa4Zs', url: 'store.steampowered.com', notes: '', category: 'other' },
      { title: '阿里云', username: 'free@aliyun', password: 'Al$8kPz2Xc', url: 'aliyun.com', notes: '备案在这里', category: 'work' },
      { title: '知乎', username: 'free_zhihu', password: 'Zh@5wEr9Ty', url: 'zhihu.com', notes: '', category: 'web' }
    ]
  };

  // ---------- 稳定的伪随机（手写抖动每次都一样） ----------
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rnd(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
  function jit(seed, amp, unit) { return ((rnd(seed) * 2 - 1) * amp).toFixed(2) + unit; }

  const esc = (s) => String(s == null ? '' : s)
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- 数据 ----------
  function normalize(raw) {
    const src = (raw && Array.isArray(raw.items)) ? raw.items : [];
    const items = src.map((it, i) => ({
      id: it.id || ('nb-' + i),
      title: it.title || '未命名',
      username: it.username || '',
      password: it.password || '',
      url: it.url || '',
      notes: it.notes || '',
      category: CAT_NAME[it.category] ? it.category : 'other',
      favorite: !!it.favorite,
      _i: i
    })).sort((a, b) => {
      const c = Object.keys(CAT_NAME).indexOf(a.category) - Object.keys(CAT_NAME).indexOf(b.category);
      return c !== 0 ? c : a.title.localeCompare(b.title, 'zh');
    });
    return { owner: (raw && raw.owner) || '本子主人', items };
  }

  let data = normalize(window.NOTEBOOK_DATA || DEMO);

  // ---------- 分页（按行高动态装箱） ----------
  function entryLines(it) {
    let n = 1;                                   // 标题行
    if (it.username) n++;
    n++;                                         // 密码行（始终有）
    if (it.url) n++;
    if (it.notes) n++;
    return n;
  }

  const SLOT_LINES = 18;                         // 每页可写的行数（18 × 28px = 504px）
  const TOC_PER_PAGE = 16;                       // 目录每页最多几行
  const HEAD_ROWS = 2;                           // 首页标题占掉的行数

  function buildPages() {
    // 1) 按“正好落在横线网格上”把条目装进各页
    const chunks = [];
    let cur = [];
    let used = 0;
    data.items.forEach((it) => {
      // 条目占的行：标题行 + 各字段行 + 分隔行(1)
      const cost = entryLines(it) + 1;
      if (cur.length && used + cost > SLOT_LINES) { chunks.push(cur); cur = []; used = 0; }
      if (!chunks.length && cur.length === 0) used = HEAD_ROWS;    // 首页要给标题留位置
      cur.push(it);
      used += cost;
    });
    if (cur.length) chunks.push(cur);
    if (!chunks.length) chunks.push([]);

    // 2) 目录：一行一个条目，按 TOC_PER_PAGE 分页
    const rows = [];
    // 内容页页码：封面=1 扉页=2 目录=N 页 → 内容从 3+N 起
    let tocPageCount = Math.max(1, Math.ceil(data.items.length / TOC_PER_PAGE) || 1);
    const contentNo = (i) => 3 + tocPageCount + i;
    pageOfItem = new Map();
    chunks.forEach((items, i) => items.forEach((it) => {
      rows.push({ it, page: contentNo(i) });
      pageOfItem.set(it.id, contentNo(i));
    }));

    const tocPages = [];
    for (let i = 0; i < rows.length; i += TOC_PER_PAGE) {
      tocPages.push({ type: 'toc', rows: rows.slice(i, i + TOC_PER_PAGE), part: i / TOC_PER_PAGE + 1 });
    }
    if (!tocPages.length) tocPages.push({ type: 'toc', rows: [], part: 1 });
    tocPageCount = tocPages.length;

    // 3) 组装整本书（页码从 1 起，和 turn.js 的页码一致）
    const pages = [];
    pages.push({ type: 'cover' });                    // P1 封面（单独立在右边）
    pages.push({ type: 'flyleaf' });                  // P2 扉页
    tocPages.forEach((t, i) => pages.push({ ...t, part: i + 1, parts: tocPages.length }));  // P3.. 目录
    chunks.forEach((items, i) => pages.push({ type: 'entries', items, first: i === 0, ids: items.map((x) => x.id) }));
    pages.push({ type: 'tailnote' });
    // 封底要单独落在左边那页：总页数必须是偶数，先补白页
    while (pages.length % 2 === 0) pages.push({ type: 'blank' });
    pages.push({ type: 'backcover' });                 // 最后一页
    return pages;
  }

  // 条目 id → 页码：集成进主窗口后"刚写完就翻到那一页"要用
  // （必须在 buildPages() 之前声明：buildPages 会往里填）
  let pageOfItem = new Map();
  let pages = buildPages();

  // ---------- 渲染：条目 ----------
  function pwHtml(pw, seed) {
    const real = [...String(pw)].map((ch, i) =>
      `<i style="transform: rotate(${jit(seed + i * 7, 3.2, 'deg')}) translateY(${jit(seed + i * 13, 1.2, 'px')})">${esc(ch)}</i>`
    ).join('');
    return `<span class="pw-real">${real}</span><span class="pw-dots">••••••••••••</span>`;
  }

  // 手写体逐字抖动：每个字自己歪一点点、上下错一点点，比一整行平着呆着像真的
  function ink(text, seed, amp) {
    return [...String(text)].map((ch, i) =>
      `<i style="transform: rotate(${jit(seed + i * 5, amp || 2.4, 'deg')}) translateY(${jit(seed + i * 11, 1.1, 'px')})">${esc(ch)}</i>`
    ).join('');
  }

  function entryHtml(it, seed) {
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
    html += line('密码', pwHtml(it.password || '—', seed + 17), seed + 19, false, true);
    if (it.url) html += line('网址', it.url.length <= 20 ? ink(it.url, seed + 23) : esc(it.url), seed + 23, it.url.length > 24);
    if (it.notes) html += line('备注', it.notes.length <= 14 ? ink(it.notes, seed + 29, 2.0) : esc(it.notes), seed + 29, it.notes.length > 20, false, true);
    html += `</div>`;
    return html;
  }

  function line(label, valueHtml, seed, long, isPw, cn) {
    const vrot = jit(seed, 0.4, 'deg');
    return `<div class="e-line"><span class="e-label">${label}</span>` +
      `<span class="e-val${long ? ' long' : ''}${isPw ? ' pw' : ''}${cn ? ' cn' : ''}" style="--vrot:${vrot}">${valueHtml}</span></div>`;
  }

  // ---------- 渲染：整页 ----------
  // isLeft：偶数页号（P2/P4/…）在左，奇数页号在右 —— 这是 turn.js 双页对开的规则
  function pageHtml(page, pageIndex, isLeft) {
    const side = isLeft ? 'left-page' : 'right-page';
    const seed = hash('p' + pageIndex);

    if (page.type === 'cover' || page.type === 'backcover') {
      const isBack = page.type === 'backcover';
      return `<div class="page cover ${side}">
        <div class="cover-inner">
          <div class="cover-title">${isBack ? '密码本' : '密码本'}</div>
          <div class="cover-rule"></div>
          <div class="cover-sub">${isBack ? 'VAULT · 本地加密' : 'PASSWORD NOTEBOOK'}</div>
          <div class="cover-owner">${isBack ? '请勿外借' : esc(data.owner) + ' 的私藏'}</div>
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
      const favs = data.items.filter((i) => i.favorite).length;
      const cats = new Set(data.items.map((i) => i.category)).size;
      const year = new Date().getFullYear();
      return `<div class="page tailnote ${side}">
        <h3>写在最后一页</h3>
        <p>· 本子里的字都是加密后存的，锁上就打不开</p>
        <p>· 主密钥忘了，谁也翻不开，包括我</p>
        <p>· 建议每个网站用不同的密码，别偷懒</p>
        <div class="stat-row">
          <div class="stat-box"><div class="stat-num">${data.items.length}</div><div class="stat-cap">条密码</div></div>
          <div class="stat-box"><div class="stat-num">${favs}</div><div class="stat-cap">条常用</div></div>
          <div class="stat-box"><div class="stat-num">${cats}</div><div class="stat-cap">个分类</div></div>
        </div>
        <div class="sign">
          <div>这本子我记到了 ${year} 年，</div>
          <div>往后的日子接着写。</div>
          <div class="sign-name">—— 本子主人</div>
        </div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
    }

    if (page.type === 'blank') {
      return `<div class="page blank-page ${side}">
        <div class="blank-note">留白<span>以后新加的密码会写到这儿</span></div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
    }

    // entries
    const body = page.items.length
      ? page.items.map((it, k) => entryHtml(it, seed + k * 101)).join('')
      : `<div class="toc-note">这一页还空着，等新密码住进来。</div>`;
    return `<div class="page ${side}">
      ${page.first ? '<div class="toc-head" style="font-size:24px;margin-bottom:14px">我的密码<small>按分类排列</small></div>' : ''}
      ${body}
      <div class="page-no">${pageIndex + 1}</div>
    </div>`;
  }

  // ---------- 纸张纹理 ----------
  // 用小 canvas 现生成一块噪点贴图当纸纹。
  // 之前用 SVG feTurbulence：每次光栅化都要跑一遍滤镜，翻页旋转时会明显掉帧。
  // 注意：噪点必须是"半透明小点"，不能是整片实色 —— 整片跟纸做 multiply
  // 会把纸整体压暗，看上去就脏了（发黑）。
  function makeGrain(size, lo, hi, alphaMax) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < size * size; i++) {
      const v = Math.round(lo + Math.random() * (hi - lo));
      d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
      d[i * 4 + 3] = Math.round(255 * alphaMax * Math.random());
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  }
  // 纸纹：极淡的浅灰小点（只给纸一点"纹理感"，不能压暗、更不能发黑）
  // 桌上浮尘：更淡的亮点
  document.documentElement.style.setProperty('--grain', 'url("' + makeGrain(110, 172, 214, 0.035) + '")');
  document.documentElement.style.setProperty('--grain-dust', 'url("' + makeGrain(110, 225, 255, 0.04) + '")');
  document.documentElement.style.setProperty('--line', LINE + 'px');

  // ---------- 挂载 ----------
  const el = {
    stage: document.getElementById('stage'),
    wrap: document.getElementById('bookWrap'),
    book: document.getElementById('book'),
    label: document.getElementById('pageLabel'),
    // 单独打开这一页时是 #toast；嵌进主窗口时叫 #nb-toast（#toast 是 app 的提示条）
    toast: document.getElementById('nb-toast') || document.getElementById('toast')
  };

  const state = { sound: false };

  // ---------- 书本尺寸：跟着窗口走，但不缩放 turn.js 的容器（缩放会让拖拽坐标错位） ----------
  let pageW = PAGE_W;
  let pageH = PAGE_H;
  let book = null;

  // ---------- 挂载 / 重挂 ----------
  // 数据变了（新写一条、改掉一条）就整本重排、重新挂一次。
  // turn.js 没有 destroy()，所以直接换一个干净的 #book 容器最稳：
  // 旧的页容器、页 wrapper 都在它里面，换掉就等于整本扔掉。
  function mount(raw) {
    data = normalize(raw || window.NOTEBOOK_DATA || DEMO);
    pages = buildPages();

    const fresh = document.createElement('div');
    fresh.className = 'book';
    fresh.id = 'book';
    el.book.replaceWith(fresh);
    el.book = fresh;

    // 每一页 = turn.js 的页容器（负责定位 / 裁切 / 旋转的那一层）
    //   里面 .nb-fit 是 440×600 的排版层，按 --fit 等比缩放，保证手写排版不跑版
    pages.forEach((page, i) => {
      const holder = document.createElement('div');
      holder.className = 'nb-page';
      // 每页的"书写倾斜"：同一页的字整体歪一点点，像真人趴在桌上写的
      holder.style.setProperty('--tilt', jit(hash('tilt' + i), 0.75, 'deg'));
      const fitBox = document.createElement('div');
      fitBox.className = 'nb-fit';
      fitBox.innerHTML = pageHtml(page, i, i % 2 === 1);
      holder.appendChild(fitBox);
      el.book.appendChild(holder);
    });

    // ---------- 翻页引擎 ----------
    book = window.jQuery('#book').turn({
      width: pageW * 2,
      height: pageH,
      display: 'double',
      autoCenter: false,
      // 翻页时的纸面明暗/投影：gradients+elevation 会让每一页在旋转期间逐帧重绘，
      // 是翻页卡顿的主因。这里关掉，投影改由 CSS 的静态层（书脊阴影/书底投影）负责。
      gradients: false,
      elevation: 0,
      duration: 760,
      acceleration: true,
      corners: 'all',        // 四个角都能拖：从上往下扒和从下往上扒一样
      cornerSize: 46,
      when: {
        // 位移要跟翻页同时开始，不能等翻完再"滑"一下——那样看起来就是卡一下
        turning: function (e, page) {
          // 只在翻页期间把页提升为独立合成层：软件渲染下每帧只做位移/混合，
          // 不再逐帧重绘整页内容（实测丢帧 28 → 3）。翻完即撤，平时不占内存。
          document.body.classList.add('flipping');
          updateLabel(page);
        },
        turned: function (e, page) {
          document.body.classList.remove('flipping');
          updateLabel(page);
          swish(1);
        }
      }
    });

    // 拖拽被取消/松手没翻成时，也要把合成层标记摘掉
    book.bind('end', () => document.body.classList.remove('flipping'));
    bindPageClicks();          // 新的 #book 容器，页内点击要重新绑

    el.wrap.classList.remove('at-cover', 'at-end');
    document.documentElement.style.setProperty('--shift', 0);
    updateLabel(1);
    fit();
    return { pages, pageCount: pages.length, pageOf: (id) => pageOfItem.get(id) || 0 };
  }

  function fit() {
    if (!book || !el.stage.clientWidth) return;
    const availW = el.stage.clientWidth - 24;
    const availH = el.stage.clientHeight - 24;
    const s = Math.max(0.5, Math.min(1.35, availW / (PAGE_W * 2 + padX()), availH / (PAGE_H + padY())));
    pageW = Math.round(PAGE_W * s);
    pageH = Math.round(PAGE_H * s);
    const root = document.documentElement.style;
    root.setProperty('--scale', s.toFixed(4));                 // 桌垫、笔等装饰按这个缩放
    root.setProperty('--fit', (pageW / PAGE_W).toFixed(5));    // 页内排版层缩放
    root.setProperty('--book-w', (pageW * 2) + 'px');
    root.setProperty('--book-h', pageH + 'px');
    book.turn('size', pageW * 2, pageH);
  }

  // ---------- 页码标签 / 只剩单页时的居中位移 ----------
  function updateLabel(pageNo) {
    if (!book) return;
    const total = pages.length;
    pageNo = pageNo || book.turn('page');
    const atCover = pageNo <= 1;
    const atEnd = pageNo >= total;
    el.wrap.classList.toggle('at-cover', atCover);
    el.wrap.classList.toggle('at-end', atEnd);
    // 只剩单页时把整本书往空的那一侧挪半页，视觉上居中
    document.documentElement.style.setProperty('--shift', atCover ? -0.25 : (atEnd ? 0.25 : 0));

    let text;
    if (atCover) text = '封面';
    else if (atEnd) text = '封底';
    else if (pageNo % 2 === 0) text = 'P' + pageNo + ' · P' + (pageNo + 1);
    else text = 'P' + (pageNo - 1) + ' · P' + pageNo;
    el.label.textContent = text;
  }

  function next() { book.turn('next'); }
  function prev() { book.turn('previous'); }
  function gotoPage(pageNo) {
    const n = Math.max(1, Math.min(pages.length, pageNo | 0));
    if (n === book.turn('page')) return;
    book.turn('page', n);
  }

  // ---------- 页内交互：目录跳页 / 点密码复制 ----------
  // 复制：优先走 app 的 preload（vaultAPI.copy）；单独打开这个页面时退回到浏览器剪贴板
  function copyText(text) {
    if (window.vaultAPI && window.vaultAPI.copy) { window.vaultAPI.copy(text); return true; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
      return true;
    }
    return fallbackCopy(text);
  }
  function fallbackCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', 'readonly');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (_) { return false; }
  }

  // 页内交互：点目录跳页 / 点密码复制。
  // 注意：每次重挂都会换一个全新的 #book 容器，所以这个监听要跟着重绑一次，
  // 否则"数据改了重挂一本"之后，目录跳页和点密码复制就失灵了。
  function bindPageClicks() {
    el.book.addEventListener('click', (e) => {
      const row = e.target.closest('.toc-row');
      if (row) { gotoPage(parseInt(row.dataset.page, 10)); return; }
      const pw = e.target.closest('.e-val.pw');
      if (pw) {
        const real = pw.querySelector('.pw-real');
        const text = real ? real.textContent : '';
        if (text && text !== '—') {
          copyText(text);
          toast('已复制这条密码');
        }
      }
    });
  }

  // ---------- 声音（WebAudio 合成翻纸声，无需素材） ----------
  let ac = null;
  function swish(power) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const dur = 0.28;
      const n = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (0.25 + 0.75 * Math.sin(Math.PI * t));
      }
      const src = ac.createBufferSource(); src.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q = 0.9;
      bp.frequency.setValueAtTime(2600, ac.currentTime);
      bp.frequency.exponentialRampToValueAtTime(700, ac.currentTime + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.13 * (power || 1), ac.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      src.connect(bp).connect(g).connect(ac.destination);
      src.start();
    } catch (_) { }
  }

  // ---------- 提示条 ----------
  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1400);
  }

  // ---------- 控制条 / 键盘 ----------
  document.getElementById('btnPrev').onclick = () => prev();
  document.getElementById('btnNext').onclick = () => next();
  document.getElementById('btnToc').onclick = () => gotoPage(3);
  document.getElementById('ribbon').onclick = () => gotoPage(3);

  const btnMask = document.getElementById('btnMask');
  btnMask.onclick = () => {
    document.body.classList.toggle('masked');
    const on = document.body.classList.contains('masked');
    btnMask.classList.toggle('on', on);
    btnMask.textContent = on ? '显示密码' : '遮住密码';
  };

  const btnSound = document.getElementById('btnSound');
  btnSound.onclick = () => {
    state.sound = !state.sound;
    btnSound.classList.toggle('on', state.sound);
    btnSound.textContent = '音效：' + (state.sound ? '开' : '关');
    if (state.sound) swish(0.8);
  };

  // 书本是不是正显示着（嵌进主窗口后，列表视图/解锁屏时不该被方向键翻页）
  function bookVisible() {
    const screen = document.getElementById('screen-book');
    return !screen || !screen.classList.contains('hidden');
  }

  window.addEventListener('keydown', (e) => {
    if (!book || !bookVisible()) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
    else if (e.key === 'Home') { gotoPage(1); e.preventDefault(); }
    else if (e.key === 'End') { gotoPage(pages.length); e.preventDefault(); }
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });

  // ---------- 启动 ----------
  // 背景皮肤：默认是 A（暖橡木，写在 variants.css 里）；
  // 传 ?variant=B|C 或运行时 window.__applyVariant('B') 可换。
  window.__applyVariant = (v) => {
    const val = String(v || '').toUpperCase();
    if (!val) { document.documentElement.removeAttribute('data-variant'); return; }
    document.documentElement.setAttribute('data-variant', val);
  };
  try {
    const v = new URLSearchParams(location.search).get('variant');
    if (v) window.__applyVariant(v);
  } catch (e) { /* 忽略 */ }

  // 字体（行楷/楷体）加载完行高会变，等它准备好了再量一次
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fit());

  // 供测试 / 集成调用
  window.__mountNotebook = mount;
  window.__nb = {
    mount,
    get pages() { return pages; },
    get pageCount() { return pages.length; },
    next,
    prev,
    gotoPage,
    fit,
    currentPage: () => (book ? book.turn('page') : 0),
    book: () => book,
    pageEl: (i) => el.book.children[i],
    pageOf: (id) => pageOfItem.get(id) || 0,
    setMasked: (v) => {
      document.body.classList.toggle('masked', !!v);
      btnMask.classList.toggle('on', !!v);
      btnMask.textContent = v ? '显示密码' : '遮住密码';
    }
  };

  // 单独打开本子这一页（npm run notebook / 测试脚本）就自动挂上一本；
  // 嵌在主窗口里（有 #screen-app）时不动手，等 app.js 解锁之后来调 mount()。
  if (!document.getElementById('screen-app')) {
    mount();
  }
})();


