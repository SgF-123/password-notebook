/* ==========================================================
   密匣 · 手写密码本
   - 仿真翻页引擎（零依赖，turn.js 风格：拖拽/点击/卷角/投影）
   - 数据：window.NOTEBOOK_DATA（{owner, items[]}）或自带演示数据
   ========================================================== */
(function () {
  'use strict';

  const PAGE_W = 440;
  const PAGE_H = 600;
  const LINE = 28;              // 页面行距（与 CSS --line 一致，手写字要落在横线上）
  const FLIP_MS = 820;
  const CASCADE_MS = 190;       // 目录跳页时的连环翻页速度

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

  const data = normalize(window.NOTEBOOK_DATA || DEMO);

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
    // 先算内容页页码：封面=1 扉页=2 目录=N 页 内容从 3+N 起
    let tocPageCount = Math.max(1, Math.ceil(data.items.length / TOC_PER_PAGE) || 1);
    const contentNo = (i) => 3 + tocPageCount + i;
    chunks.forEach((items, i) => items.forEach((it) => rows.push({ it, page: contentNo(i) })));

    const tocPages = [];
    for (let i = 0; i < rows.length; i += TOC_PER_PAGE) {
      tocPages.push({ type: 'toc', rows: rows.slice(i, i + TOC_PER_PAGE), part: i / TOC_PER_PAGE + 1 });
    }
    if (!tocPages.length) tocPages.push({ type: 'toc', rows: [], part: 1 });
    // 目录页数变了（items 为空时）——保持占位一致
    tocPageCount = tocPages.length;

    // 3) 组装整本书
    const pages = [];
    pages.push({ type: 'cover' });                    // P1 封面
    pages.push({ type: 'flyleaf' });                  // P2 扉页
    tocPages.forEach((t, i) => pages.push({ ...t, part: i + 1, parts: tocPages.length }));  // P3.. 目录
    chunks.forEach((items, i) => pages.push({ type: 'entries', items, first: i === 0 }));
    pages.push({ type: 'tailnote' });
    while (pages.length % 2 !== 1) pages.push({ type: 'blank' });   // 让封底落在“背面”
    pages.push({ type: 'backcover' });
    return pages;
  }

  const pages = buildPages();
  const leafCount = pages.length / 2;

  // ---------- 渲染：条目 ----------
  function pwHtml(pw, seed) {
    const real = [...String(pw)].map((ch, i) =>
      `<i style="transform: rotate(${jit(seed + i * 7, 3.2, 'deg')}) translateY(${jit(seed + i * 13, 1.2, 'px')})">${esc(ch)}</i>`
    ).join('');
    return `<span class="pw-real">${real}</span><span class="pw-dots">••••••••••••</span>`;
  }

  function entryHtml(it, seed) {
    const c = CAT_COLOR[it.category];
    const rot = jit(seed, 0.55, 'deg');
    const dy = jit(seed + 3, 1.5, 'px');
    let html = `<div class="entry" style="--rot:${rot};--dy:${dy}">`;
    html += `<div class="e-head">`;
    html += `<span class="e-dot" style="--c:${c}"></span>`;
    html += `<span class="e-title">${esc(it.title)}</span>`;
    html += `<span class="e-cat" style="--c:${c};--tagrot:${jit(seed + 5, 4, 'deg')}">${esc(CAT_NAME[it.category])}</span>`;
    if (it.favorite) html += `<span class="e-star">★</span>`;
    html += `</div>`;
    html += `<div class="e-sep" style="--sep-rot:${jit(seed + 9, 0.35, 'deg')}"></div>`;
    if (it.username) html += line('账号', esc(it.username), seed + 11, it.username.length > 22);
    html += line('密码', pwHtml(it.password || '—', seed + 17), seed + 19, false, true);
    if (it.url) html += line('网址', esc(it.url), seed + 23, it.url.length > 24);
    if (it.notes) html += line('备注', esc(it.notes), seed + 29, it.notes.length > 20, false, true);
    html += `</div>`;
    return html;
  }

  function line(label, valueHtml, seed, long, isPw, cn) {
    const vrot = jit(seed, 0.4, 'deg');
    return `<div class="e-line"><span class="e-label">${label}</span>` +
      `<span class="e-val${long ? ' long' : ''}${isPw ? ' pw' : ''}${cn ? ' cn' : ''}" style="--vrot:${vrot}">${valueHtml}</span></div>`;
  }

  // ---------- 渲染：整页 ----------
  function pageHtml(page, pageIndex, isLeft) {
    const side = isLeft ? 'left-page' : 'right-page';
    const seed = hash('p' + pageIndex);

    if (page.type === 'cover' || page.type === 'backcover') {
      const isBack = page.type === 'backcover';
      return `<div class="page cover ${side}">
        <div class="cover-inner">
          <div class="cover-title">${isBack ? '密匣' : '密码本'}</div>
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
          <div class="fly-stamp">密匣<br>亲启</div>
        </div>
        <div class="page-no">${pageIndex + 1}</div>
      </div>`;
    }

    if (page.type === 'toc') {
      const rows = page.rows.map((r) =>
        `<div class="toc-row" data-page="${r.page}">
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

  // ---------- 纸张纹理（内联 SVG 噪点） ----------
  const GRAIN = "url(\"data:image/svg+xml," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'>" +
    "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/>" +
    "<feColorMatrix type='saturate' values='0'/></filter>" +
    "<rect width='140' height='140' filter='url(#n)' opacity='0.5'/></svg>"
  ) + "\")";
  document.documentElement.style.setProperty('--grain', GRAIN);
  document.documentElement.style.setProperty('--line', LINE + 'px');

  // ---------- 挂载 ----------
  const el = {
    stage: document.getElementById('stage'),
    wrap: document.getElementById('bookWrap'),
    book: document.getElementById('book'),
    spread: document.getElementById('spread'),
    castRight: document.getElementById('castRight'),
    castLeft: document.getElementById('castLeft'),
    ribbon: document.getElementById('ribbon'),
    label: document.getElementById('pageLabel'),
    toast: document.getElementById('toast')
  };

  const leaves = [];
  for (let i = 0; i < leafCount; i++) {
    const frontPage = pages[i * 2];
    const backPage = pages[i * 2 + 1];
    const leaf = document.createElement('div');
    leaf.className = 'leaf turnable';
    leaf.style.setProperty('--p', 0);
    leaf.innerHTML =
      `<div class="leaf-face front">
         ${pageHtml(frontPage, i * 2, false)}
         <div class="face-light"></div>
         <div class="face-shade"></div>
         <div class="curl"></div>
       </div>
       <div class="leaf-face back">
         ${pageHtml(backPage, i * 2 + 1, true)}
         <div class="curl curl-back"></div>
         <div class="face-shade"></div>
       </div>`;
    el.spread.appendChild(leaf);
    leaves.push(leaf);
  }

  const state = { turned: 0, sound: false, busy: false, active: null };

  // ============ 弧面翻页机 ============
  // 把正在翻的那一页切成 SEG 条，第 k 条绕“第 k-1 条的右边缘”再转一点，
  // 于是整页变成一条连续的弯纸：书脊侧滞后、外沿领先，中途最弯、两头摊平。
  const SEG = 12;                         // 条带越多弧面越圆滑
  const BEND_MAX = 52;                    // 最大弯曲角（度）—— 手感主要调这个
  const segW = PAGE_W / SEG;
  // 弯曲只集中在外沿：靠书脊的地方几乎不动，越靠外沿弯得越多（更像真纸）
  const segWeight = (() => {
    const w = []; let s = 0;
    for (let k = 0; k < SEG; k++) { s += (k + 1); w.push(s); }
    return w.map((v) => v / s);
  })();
  const rig = document.getElementById('curler');
  const segEls = [];
  for (let k = 0; k < SEG; k++) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.style.width = (segW + 1) + 'px';  // +1px 压住条与条之间的接缝
    seg.innerHTML =
      '<div class="seg-face sf-front"><div class="seg-copy"></div><div class="seg-shade"></div><div class="seg-lip"></div></div>' +
      '<div class="seg-face sf-back"><div class="seg-copy"></div><div class="seg-shade"></div><div class="seg-lip"></div></div>';
    rig.appendChild(seg);
    segEls.push(seg);
  }

  let rigFor = -1;
  function loadRig(i) {
    if (rigFor === i) return;
    rigFor = i;
    const leaf = leaves[i];
    const fp = leaf.querySelector('.leaf-face.front .page');
    const bp = leaf.querySelector('.leaf-face.back .page');
    segEls.forEach((seg, k) => {
      const cf = seg.querySelector('.sf-front .seg-copy');
      const cb = seg.querySelector('.sf-back .seg-copy');
      cf.textContent = ''; cb.textContent = '';
      cf.appendChild(fp.cloneNode(true));
      cb.appendChild(bp.cloneNode(true));
      cf.style.transform = 'translateX(' + (-k * segW).toFixed(2) + 'px)';           // 正面：第 k 条 = 原页第 k 片
      cb.style.transform = 'translateX(' + ((k + 1) * segW - PAGE_W).toFixed(2) + 'px)';  // 背面是左页，书脊在右，切片顺序相反
    });
  }

  function segShade(angle) {              // 纸面与屏幕夹角 → 明暗（立起来时最暗，两头最亮）
    const a = Math.max(0, Math.min(180, angle)) * Math.PI / 180;
    return (0.02 + 0.36 * Math.sin(a)).toFixed(3);
  }

  function currentP(i) {
    const v = parseFloat(leaves[i].style.getPropertyValue('--p'));
    return isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
  }

  // ---------- 层级 / 阴影 ----------
  // ============ 卷曲翻页（page curl）============
  // 折痕 = 被拖的角 → 落点 的垂直平分线；纸在折痕处绕半径 r 的圆柱卷起 θ 角再摊平，
  // 卷边 + 摊平段（镜像后按 cosθ 压缩）由 curl.js 画；翻页中整跨页由一张 canvas 接管。
  const CURL_MODE = true;
  const CURVE_R = 32;                    // 卷曲半径（圆柱粗细）：越大卷边越宽、纸越"圆"
  const curlCanvas = document.createElement('canvas');
  curlCanvas.className = 'curl-canvas';
  curlCanvas.width = PAGE_W * 2;
  curlCanvas.height = PAGE_H;
  el.book.appendChild(curlCanvas);
  const cctx = curlCanvas.getContext('2d');

  let turn = null;      // { leaf, dir, corner, cur, tmap, tex, dragging }

  function pageElOf(leafIdx, face) {
    const leaf = leaves[leafIdx];
    return leaf ? leaf.querySelector('.leaf-face.' + face + ' .page') : null;
  }

  // 向后翻时工作坐标系整体镜像，贴图要各备一份镜像版
  function flipCopy(src) {
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const g = c.getContext('2d');
    g.translate(src.width, 0); g.scale(-1, 1);
    g.drawImage(src, 0, 0);
    return c;
  }

  function ensureTex(role, elm) {
    if (!elm || !turn || turn.tex[role]) return;
    const done = PageCurl.textureOf(elm);          // 已经栅格化过 → 同步用上
    if (done) { turn.tex[role] = turn.dir < 0 ? flipCopy(done) : done; return; }
    turn.tex[role] = 'pending';
    PageCurl.rasterize(elm).then((c) => {
      if (turn && turn.tex[role] === 'pending') {
        turn.tex[role] = turn.dir < 0 ? flipCopy(c) : c;
        drawTurn();
      }
    });
  }

  function beginTurn(leafIdx, dir) {
    const corner = { x: PAGE_W, y: PAGE_H };
    turn = {
      leaf: leafIdx,
      dir: dir < 0 ? -1 : 1,
      corner,
      cur: { x: corner.x, y: corner.y },
      tmap: { p0: 0, p1: 1, T0: corner, T1: { x: -PAGE_W, y: corner.y } },
      tex: {},
      dragging: false
    };
    if (turn.dir > 0) {                       // 向前翻：右页 → 左页
      ensureTex('front', pageElOf(leafIdx, 'front'));
      ensureTex('back', pageElOf(leafIdx, 'back'));
      ensureTex('left', pageElOf(leafIdx - 1, 'back'));    // 左半底下的页
      ensureTex('right', pageElOf(leafIdx + 1, 'front'));  // 右半底下的页
    } else {                                  // 向后翻：镜像坐标系（书脊左右对调）
      ensureTex('front', pageElOf(leafIdx, 'back'));
      ensureTex('back', pageElOf(leafIdx, 'front'));
      ensureTex('left', pageElOf(leafIdx + 1, 'front'));
      ensureTex('right', pageElOf(leafIdx - 1, 'back'));
    }
    el.book.classList.add('turning');
    drawTurn();
    return turn;
  }

  function tOfP(t, p) {
    const m = t.tmap;
    const span = m.p1 - m.p0;
    let k = span > 1e-6 ? (p - m.p0) / span : 1;
    k = Math.max(-0.25, Math.min(1.25, k));
    return { x: m.T0.x + (m.T1.x - m.T0.x) * k, y: m.T0.y + (m.T1.y - m.T0.y) * k };
  }
  const ready = (t) => !!(t && t.width > 0 && typeof t.getContext === 'function');

  function drawTurn() {
    if (!turn) return;
    const t = turn, W = PAGE_W, H = PAGE_H;
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, W * 2, H);
    cctx.save();
    cctx.translate(W, 0);                       // 书脊落在局部 x=0
    if (t.dir < 0) cctx.scale(-1, 1);
    cctx.fillStyle = '#f8f3e7';
    if (ready(t.tex.left)) cctx.drawImage(t.tex.left, -W, 0); else cctx.fillRect(-W, 0, W, H);
    if (ready(t.tex.right)) cctx.drawImage(t.tex.right, 0, 0); else cctx.fillRect(0, 0, W, H);
    if (ready(t.tex.front) && ready(t.tex.back)) {
      PageCurl.drawSheet(cctx, W, H, t.tex.front, t.tex.back, t.corner, t.cur, CURVE_R);
    }
    cctx.restore();
  }

  // 把屏幕坐标换算成“工作坐标系”里的页面坐标（书脊 = 0）
  function localPoint(clientX, clientY) {
    const r = el.book.getBoundingClientRect();
    const s = r.width / (PAGE_W * 2);
    const x = (clientX - r.left) / s - PAGE_W;
    const y = (clientY - r.top) / s;
    return { x, y };
  }

  function applyZ() {
    leaves.forEach((leaf, i) => {
      const p = parseFloat(leaf.style.getPropertyValue('--p')) || 0;
      leaf.classList.toggle('turnable', p <= 0 || p >= 1);
      if (state.active === i) { leaf.style.zIndex = 9000; return; }
      if (p >= 1) leaf.style.zIndex = 100 + i;                      // 已翻到左边：越晚翻的越靠上
      else if (p <= 0) leaf.style.zIndex = 1000 + (leafCount - i);   // 未翻：越靠前的越靠上
      else leaf.style.zIndex = 9000;
    });
  }

  function updateCast(i, p) {
    const pc = Math.max(0, Math.min(1, p == null ? 0 : p));
    const lift = Math.sin(Math.PI * pc);        // 抬起来的程度：平放 / 落到另一侧都是 0
    const moving = i !== null && i !== undefined && Math.abs(p) > 0.0035 && Math.abs(p - 1) > 0.0035;
    el.castRight.style.width = (PAGE_W * (1 - pc)).toFixed(1) + 'px';
    el.castRight.style.opacity = moving ? (0.62 * lift * (1 - pc)).toFixed(3) : 0;
    el.castLeft.style.width = (PAGE_W * pc).toFixed(1) + 'px';
    el.castLeft.style.opacity = moving ? (0.56 * lift * pc).toFixed(3) : 0;
  }

  // ---------- 摆姿势（翻页中走弧面页，静止时用平面叶） ----------
  // 只摆弧面页的姿态（不碰叶子显隐/状态），供翻页与预热共用
  function poseRig(i, p) {
    p = Math.max(-0.04, Math.min(1.06, p));
    const pc = Math.max(0, Math.min(1, p));
    const bend = BEND_MAX * Math.sin(Math.PI * pc);       // 中途最弯，两头摊平
    const spine = 180 * p - bend;                          // 书脊侧角度（滞后于外沿）
    rig.style.transform = 'rotateY(' + (-spine).toFixed(2) + 'deg)';
    let x = 0, z = 0;
    segEls.forEach((seg, k) => {
      const a = bend * segWeight[k];
      const aPrev = k === 0 ? 0 : bend * segWeight[k - 1];
      seg.style.transform =
        'translate3d(' + x.toFixed(2) + 'px,0,' + z.toFixed(2) + 'px) rotateY(' + (-a).toFixed(2) + 'deg)';
      // 两条带子交界处取同一个明暗值 → 渐变首尾相接，弧面上不会出现一条条竖纹
      seg.style.setProperty('--shade-a', segShade(spine + aPrev));
      seg.style.setProperty('--shade-b', segShade(spine + a));
      seg.style.setProperty('--seg-shade', segShade(spine + a));
      const r = a * Math.PI / 180;
      x += segW * Math.cos(r);
      z += segW * Math.sin(r);
    });
    rig.style.setProperty('--curl', Math.min(0.7, pc * 1.45).toFixed(2));
  }

  function applyPose(i, p) {
    const leaf = leaves[i];
    p = Math.max(-0.04, Math.min(1.06, p));
    const pc = Math.max(0, Math.min(1, p));
    const moving = Math.abs(p) > 0.0035 && Math.abs(p - 1) > 0.0035;

    leaf.style.setProperty('--p', pc.toFixed(4));

    if (CURL_MODE) {                       // 卷曲翻页：翻页中整跨页交给 canvas
      if (moving) {
        if (!turn || turn.leaf !== i) beginTurn(i, state.turnDir || (p >= pc ? 1 : -1));
        const q = turn.dir > 0 ? p : 1 - p;     // 向后翻：工作坐标系里的进度是反的
        turn.cur = turn.dragging ? turn.cur : tOfP(turn, q);
        drawTurn();
        el.book.classList.add('turning');
        state.active = i;
      } else {
        el.book.classList.remove('turning');
        if (turn && turn.leaf === i) turn = null;
        state.active = null;
        leaf.style.visibility = '';
      }
      applyZ();
      updateCast(null, 0);
      updateLabel();
      return;
    }

    leaf.style.setProperty('--shade', (Math.sin(Math.PI * pc) * 0.42).toFixed(3));
    leaf.style.setProperty('--curve', Math.sin(Math.PI * pc).toFixed(3));
    leaf.style.visibility = moving ? 'hidden' : '';
    state.active = moving ? i : null;

    rig.style.display = moving ? 'block' : 'none';
    if (moving) {
      loadRig(i);
      poseRig(i, p);
    }
    applyZ();
    updateCast(state.active === null ? null : i, p);
    updateLabel();
  }

  // ---------- 预热：把下一页的条带提前建好并栅格化，翻页时就不会卡一帧 ----------
  let buildTimer = null;
  function prebuildFor(i, warm) {
    clearTimeout(buildTimer);
    if (i < 0 || i >= leafCount) return;
    buildTimer = setTimeout(() => {
      if (anim) return;
      if (CURL_MODE) {                 // 卷曲模式：真正贵的是把这几页栅格化成贴图
        [pageElOf(i, 'front'), pageElOf(i, 'back'), pageElOf(i - 1, 'back'), pageElOf(i + 1, 'front')]
          .forEach((elm) => { if (elm) PageCurl.rasterize(elm); });
        return;
      }
      const dsp = rig.style.display, opa = rig.style.opacity;
      loadRig(i);
      poseRig(i, 0.5);
      if (warm) {                       // 几乎看不见，但足以让浏览器先把这页栅格化好
        rig.style.display = 'block';
        rig.style.opacity = '0.004';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          rig.style.opacity = opa;
          rig.style.display = dsp;
        }));
      }
    }, 140);
  }

  // 启动时预热：把翻页过程中各个角度都先画一遍（含纸块/位移），避免头几次翻页卡顿
  async function warmup() {
    if (CURL_MODE) {                   // 卷曲模式：空闲时先把前几页的贴图栅格化出来
      for (let k = 0; k < Math.min(leafCount, 3); k++) {
        for (const face of ['front', 'back']) {
          const elm = pageElOf(k, face);
          if (elm) await PageCurl.rasterize(elm);
        }
      }
      prebuildFor(state.turned, false);
      return;
    }
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const st = document.createElement('style');
    st.textContent = '*{transition:none !important}';
    document.head.appendChild(st);
    const prevOpacity = el.stage.style.opacity;
    el.stage.style.opacity = '0.004';   // 不能用 0：透明度为 0 时浏览器会跳过绘制，预热就白做了
    const keep = state.turned;

    rig.style.display = 'block';
    rig.style.opacity = '0.004';
    loadRig(0);
    for (const p of [0.12, 0.32, 0.55, 0.78, 0.95]) {   // 把弧面的各个角度都过一遍
      poseRig(0, p);
      await frame();
    }
    state.turned = 1;
    layout();
    for (let k = 0; k < leafCount; k++) applyPose(k, k < 1 ? 1 : 0);
    await frame();
    await frame();

    state.turned = keep;                                  // 复原到封面
    for (let k = 0; k < leafCount; k++) applyPose(k, k < keep ? 1 : 0);
    layout();
    rig.style.opacity = '';
    rig.style.display = 'none';
    el.stage.style.opacity = prevOpacity;
    document.head.removeChild(st);
    prebuildFor(state.turned, true);
  }

  // ---------- 动画驱动：rAF，先慢后快 + 落地轻微回弹 ----------
  let anim = null;
  function easeFlip(t, over) {
    const e = Math.pow(t, 1.45);
    const o = (over && t > 0.72) ? over * Math.sin(((t - 0.72) / 0.28) * Math.PI) : 0;
    return e + o;
  }
  function step(now) {
    const a = anim;
    if (!a) return;
    const t = Math.min(1, (now - a.t0) / a.dur);
    applyPose(a.i, a.from + (a.to - a.from) * easeFlip(t, a.over));
    if (t < 1) { requestAnimationFrame(step); return; }
    anim = null;
    applyPose(a.i, a.to);
    if (a.res) a.res();
  }
  function animateLeaf(i, to, dur, over) {
    return new Promise((resolve) => {
      anim = { i, from: currentP(i), to, dur: Math.max(160, dur), t0: performance.now(), over: over || 0, res: resolve };
      requestAnimationFrame(step);
    });
  }
  const turnDur = (from, to) => 340 + 380 * Math.abs(to - from);

  function setP(i, p, animate, dur) {
    if (animate) { animateLeaf(i, p, dur || turnDur(currentP(i), p), 0); return; }
    if (anim && anim.i === i) anim = null;
    applyPose(i, p);
  }

  function layout() {
    el.book.classList.toggle('has-left', state.turned > 0);
    el.book.classList.toggle('has-right', state.turned < leafCount);
    const shift = state.turned <= 0 ? -0.25 : (state.turned >= leafCount ? 0.25 : 0);
    el.wrap.style.setProperty('--shift', shift);
    el.wrap.classList.toggle('at-cover', state.turned <= 0);
    el.wrap.classList.toggle('at-end', state.turned >= leafCount);
    resize();
  }

  function resize() {
    const cs = getComputedStyle(document.documentElement);
    const padX = parseFloat(cs.getPropertyValue('--mat-pad-x')) || 150;
    const padY = parseFloat(cs.getPropertyValue('--mat-pad-y')) || 160;
    const availW = el.stage.clientWidth - 30;
    const availH = el.stage.clientHeight - 30;
    // 按“桌垫”的实际占地来缩放：本子和背景板一起放大/缩小，比例恒定
    const s = Math.max(0.5, Math.min(1.35, availW / (PAGE_W * 2 + padX), availH / (PAGE_H + padY)));
    document.documentElement.style.setProperty('--scale', s.toFixed(3));
  }

  function updateLabel() {
    if (state.turned <= 0) { el.label.textContent = '封面 · 翻开看看'; return; }
    const a = state.turned * 2;            // 已翻 k 页芯 → 左页是第 2k 页，右页是第 2k+1 页
    const b = a + 1;
    if (a > pages.length) { el.label.textContent = `封底 · 共 ${pages.length} 页`; return; }
    el.label.textContent = `第 ${a} – ${b} 页 / 共 ${pages.length} 页`;
  }

  // ---------- 翻页动作 ----------
  let queue = Promise.resolve();
  function enqueue(fn) { queue = queue.then(fn); return queue; }

  // 翻一页；fast=true 用于目录连环跳页（串行，避免两个弧面页打架）
  function turnOnce(dir, fast, opts) {
    if (dir > 0 && state.turned >= leafCount) return Promise.resolve(false);
    if (dir < 0 && state.turned <= 0) return Promise.resolve(false);
    const i = dir > 0 ? state.turned : state.turned - 1;
    state.turnDir = dir;
    if (dir > 0) state.turned++; else state.turned--;
    layout();
    swish(fast ? 0.55 : 1);
    loadRig(i);                                   // 先把这一页的条带建好，别建在动画中间
    const to = dir > 0 ? 1 : 0;
    const dur = fast ? ((opts && opts.dur) || CASCADE_MS) : turnDur(currentP(i), to);
    return animateLeaf(i, to, dur, fast ? 0 : 0.05)
      .then((r) => { prebuildFor(state.turned, true); return r; });   // 空下来先把下一页备好
  }

  function next() {
    if (state.busy || state.turned >= leafCount) return false;
    state.busy = true;
    turnOnce(1, false).then(() => { state.busy = false; });
    return true;
  }

  function prev() {
    if (state.busy || state.turned <= 0) return false;
    state.busy = true;
    turnOnce(-1, false).then(() => { state.busy = false; });
    return true;
  }

  // 跳到“某一面”（页面序号，1 起）
  function gotoPage(pageNo) {
    const idx = Math.max(0, Math.min(pages.length - 1, pageNo - 1));
    const target = Math.min(leafCount, Math.ceil(idx / 2));
    enqueue(async () => {
      state.busy = true;
      while (state.turned < target) { await turnOnce(1, true); }
      while (state.turned > target) { await turnOnce(-1, true); }
      state.busy = false;
    });
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 交互：拖拽 / 点击 ----------
  let drag = null;

  function pointLeaf(x) {
    const r = el.book.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    if (x >= mid) return state.turned < leafCount ? { i: state.turned, dir: 1 } : null;
    return state.turned > 0 ? { i: state.turned - 1, dir: -1 } : null;
  }

  el.book.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.toc-row, .e-val.pw, .ribbon')) return;   // 可点元素不参与翻页
    if (state.busy || anim) return;
    const t = pointLeaf(e.clientX);
    if (!t) return;
    const rect = el.book.getBoundingClientRect();
    const scale = rect.width / (PAGE_W * 2);
    const now = performance.now();
    drag = {
      i: t.i, dir: t.dir, startX: e.clientX, startY: e.clientY, moved: 0,
      p0: t.dir === 1 ? 0 : 1,
      pageW: PAGE_W * scale,
      lastX: e.clientX, lastT: now, v: 0
    };
    el.book.setPointerCapture(e.pointerId);
    state.turnDir = t.dir;
    if (CURL_MODE) {                              // 卷曲：捏住的角跟着手指走
      beginTurn(t.i, t.dir);
      const lp = localPoint(e.clientX, e.clientY);
      const fy = lp.y;
      turn.corner = { x: PAGE_W, y: fy < PAGE_H / 2 ? 0 : PAGE_H };
      turn.tmap = { p0: 0, p1: 1, T0: turn.corner, T1: { x: -PAGE_W, y: turn.corner.y } };
      turn.cur = { x: turn.corner.x, y: turn.corner.y };
      turn.dragging = true;
      drawTurn();
    }
    loadRig(t.i);                                 // 捏住的一瞬间就建好，拖动时不再卡
    prebuildFor(-1);
    applyPose(t.i, drag.p0);
  });

  el.book.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));   // 任意方向的位移都算"拖动过"
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 8) { drag.v = (e.clientX - drag.lastX) / dt; drag.lastX = e.clientX; drag.lastT = now; }
    let p;
    if (drag.dir === 1) p = dx < 0 ? Math.min(1, -dx / (drag.pageW * 0.92)) : 0;
    else p = dx > 0 ? 1 - Math.min(1, dx / (drag.pageW * 0.92)) : 1;
    if (CURL_MODE && turn && turn.leaf === drag.i) {
      const lp = localPoint(e.clientX, e.clientY);          // 折痕跟着手指走（斜着拖就是斜折痕）
      const fx = drag.dir > 0 ? lp.x : -lp.x;               // 向后翻时坐标系镜像
      turn.dragging = true;
      turn.cur = { x: Math.max(-PAGE_W * 1.2, Math.min(PAGE_W, fx)), y: Math.max(0, Math.min(PAGE_H, lp.y)) };
      // 进度按"手指离捏住的角有多远"算（任意方向都行），不是只按左右位移
      // —— 否则从上方往下拉永远是 p≈0，翻不过去。
      const span = PAGE_W * 2;                              // 拉满一页宽 = 折痕走到书脊
      const dist = Math.hypot(turn.cur.x - turn.corner.x, turn.cur.y - turn.corner.y);
      const q = Math.max(0, Math.min(1, dist / span));
      p = drag.dir > 0 ? q : 1 - q;
      if (dt > 8) { drag.v = (dist - (drag.lastDist || 0)) / dt; drag.lastDist = dist; }
    }
    applyPose(drag.i, p);
    el.book.classList.add('dragging');
  });

  function endDrag(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    el.book.classList.remove('dragging');
    try { el.book.releasePointerCapture(e.pointerId); } catch (_) { }

    if (d.moved < 6) {                       // 当成点击：整页翻
      if (CURL_MODE && turn && turn.leaf === d.i) {
        turn.dragging = false;
        turn.tmap = { p0: 0, p1: 1, T0: turn.corner, T1: { x: -PAGE_W, y: turn.corner.y } };
        turn.cur = { x: turn.corner.x, y: turn.corner.y };
      }
      swish(1);
      state.busy = true;
      turnOnce(d.dir, false).then(() => { state.busy = false; });
      return;
    }

    const p = currentP(d.i);
    const v = d.v || 0;
    const flick = Math.abs(v) > 0.5;                       // 甩动：方向说话
    let done = d.dir === 1 ? p > 0.3 : p < 0.7;
    if (flick) done = v > 0;                               // v = 手指"离开捏住的角"的速度（两个方向通用）
    if (CURL_MODE && turn && turn.leaf === d.i) {          // 动画从当前手指位置接着走
      const qNow = turn.dir > 0 ? p : 1 - p;
      const qTo = done ? 1 : 0;
      const tTo = done ? { x: -PAGE_W, y: turn.corner.y } : turn.corner;
      turn.tmap = { p0: qNow, p1: qTo, T0: turn.cur, T1: tTo };
      turn.dragging = false;
    }

    if (done) {
      if (d.dir === 1) { if (state.turned === d.i) state.turned++; }
      else { if (state.turned === d.i + 1) state.turned--; }
    }
    layout();
    if (done) swish(1);
    const to = done ? (d.dir === 1 ? 1 : 0) : (d.dir === 1 ? 0 : 1);
    const dur = Math.max(200, turnDur(p, to) * (flick ? 0.72 : 1));
    animateLeaf(d.i, to, dur, done ? 0.045 : 0.03)
      .then(() => prebuildFor(state.turned, true));
  }
  el.book.addEventListener('pointerup', endDrag);
  el.book.addEventListener('pointercancel', endDrag);

  // 目录点击跳页
  el.spread.addEventListener('click', (e) => {
    const row = e.target.closest('.toc-row');
    if (row) { gotoPage(parseInt(row.dataset.page, 10)); return; }
    const pw = e.target.closest('.e-val.pw');
    if (pw) {
      const real = pw.querySelector('.pw-real');
      const text = real ? real.textContent : '';
      if (text && text !== '—') {
        if (window.vaultAPI && window.vaultAPI.copy) window.vaultAPI.copy(text);
        else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => { });
        toast('已复制这条密码');
      }
    }
  });

  // 拖拽后抑制误触点击
  el.spread.addEventListener('click', (e) => {
    if (drag && drag.moved > 6) e.stopPropagation();
  }, true);

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
  el.ribbon.onclick = () => gotoPage(3);

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

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { next(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { prev(); e.preventDefault(); }
    else if (e.key === 'Home') { gotoPage(1); e.preventDefault(); }
    else if (e.key === 'End') { gotoPage(pages.length); e.preventDefault(); }
  });
  window.addEventListener('resize', resize);

  // ---------- 启动 ----------
  applyZ();
  layout();
  updateLabel();
  warmup();

  // 供测试 / 集成调用
  window.__nb = {
    state,
    pages,
    leafCount,
    curlMode: CURL_MODE,
    turnState: () => (turn ? { leaf: turn.leaf, dir: turn.dir, cur: turn.cur, corner: turn.corner } : null),
    next,
    prev,
    gotoPage,
    setP,
    layout,
    leafEl: (i) => leaves[i],
    setMasked: (v) => { document.body.classList.toggle('masked', !!v); btnMask.classList.toggle('on', !!v); btnMask.textContent = v ? '显示密码' : '遮住密码'; }
  };
})();
