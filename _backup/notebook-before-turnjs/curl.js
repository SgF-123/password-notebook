/* ==========================================================
   页面卷曲引擎（page curl / iBooks 那种折痕翻页）
   模型（正交投影下的真实纸张）：
     1) 折痕线 L = 被拖的角 C 与落点 T 的垂直平分线（过中点 M，方向 d）
     2) 纸在 L 处离开台面，绕半径 r 的圆柱卷起 θ 角，再沿切线方向摊平
     3) 投影到屏幕上，“被折起的那部分”分成两段：
          · 卷边：被卷住的那一段纸 → 宽 r·sinθ 的一条带，落在 T 一侧
          · 摊平段：剩下的纸 = 关于 L 的镜像，再沿 v 压缩 cosθ（近大远小）
     4) 明暗：卷边按圆柱法线打光（贴痕处最暗 → 迎光最亮 → 转开回暗），
        卷起来的部分在台面上投一道柔影，折痕压一道细暗线
   全部用 Canvas 2D，页面内容走 DOM 栅格化来的贴图。
   ========================================================== */
(function (global) {
  'use strict';

  // ---------- 贴图：DOM 页面 → canvas（SVG foreignObject 路线） ----------
  let cssCache = null;
  function collectCss() {
    if (cssCache) return cssCache;
    let css = '';
    for (const ss of document.styleSheets) {
      try { for (const r of ss.cssRules) css += r.cssText + '\n'; } catch (e) { /* 跨域表跳过 */ }
    }
    const vars = ['--grain', '--line', '--page-w', '--page-h'];
    const cs = getComputedStyle(document.documentElement);
    css += '\n:root{' + vars.map((v) => v + ':' + cs.getPropertyValue(v)).join(';') + '}';
    cssCache = css;
    return css;
  }

  const texCache = new WeakMap();
  const texDone = new WeakMap();
  function rasterize(pageEl) {
    if (texCache.has(pageEl)) return texCache.get(pageEl);
    const w = pageEl.offsetWidth, h = pageEl.offsetHeight;
    const holder = document.createElement('div');
    holder.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    holder.style.cssText = 'width:' + w + 'px;height:' + h + 'px;position:relative;overflow:hidden;';
    const style = document.createElement('style');
    style.textContent = collectCss();
    holder.appendChild(style);
    holder.appendChild(pageEl.cloneNode(true));
    // foreignObject 里是 XML：<br> 这类空元素必须自闭合，否则整个 SVG 解析失败
    const html = holder.outerHTML.replace(
      /<(br|hr|img|input|link|meta)((?:\s[^>]*)?)>/gi,
      (m, tag, attrs) => (/\/$/.test(attrs || '') ? m : '<' + tag + (attrs || '') + '/>')
    );
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '">' +
      '<foreignObject x="0" y="0" width="100%" height="100%">' + html + '</foreignObject></svg>';

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const prom = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        c.getContext('2d').drawImage(img, 0, 0);
        texDone.set(pageEl, c);          // 同步可取的成品
        resolve(c);
      };
      img.onerror = () => {                // 失败也要有东西：铺一层纸色，别画出空洞
        const g = c.getContext('2d');
        g.fillStyle = '#f8f3e7';
        g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.font = '13px "Microsoft YaHei", sans-serif';
        g.fillText('rasterize failed: ' + (pageEl.className || '?').slice(0, 40), 12, h - 14);
        console.warn('[curl] rasterize failed for', pageEl.className);
        texDone.set(pageEl, c);
        resolve(c);
      };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    texCache.set(pageEl, prom);
    return prom;
  }

  // 已经栅格化好的贴图（同步拿，避免翻页首帧空一下）
  function textureOf(pageEl) { return pageEl ? texDone.get(pageEl) : undefined; }

  // ---------- 2D 仿射小工具 ----------
  const mul = (a, b) => [                       // 矩阵按 [a,b,c,d,e,f] 存
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
  const applyM = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] });
  const setM = (ctx, m) => ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
  // 关于直线（过 M，单位方向 d）的镜像
  function mirrorMatrix(M, d) {
    const c = d.x, s = d.y;
    const r = [c * c - s * s, 2 * c * s, 2 * c * s, s * s - c * c, 0, 0];
    // 让它过 M：p -> M + R(p - M)
    return [r[0], r[1], r[2], r[3],
      M.x - (r[0] * M.x + r[2] * M.y), M.y - (r[1] * M.x + r[3] * M.y)];
  }
  const flipH = (w) => [-1, 0, 0, 1, w, 0];    // 水平翻转（背面贴图是左页排版）
  const translateM = (x, y) => [1, 0, 0, 1, x, y];
  // 沿单位方向 u 按 k 缩放的线性矩阵（其余方向不动）
  function scaleAlongM(u, k) {
    const t = k - 1;
    return [1 + t * u.x * u.x, t * u.x * u.y, t * u.x * u.y, 1 + t * u.y * u.y, 0, 0];
  }

  // 直线与矩形求交（返回两个端点）
  function clipLineToRect(M, d, W, H) {
    const ts = [];
    const push = (t) => ts.push(t);
    if (Math.abs(d.x) > 1e-6) {
      for (const x of [0, W]) push((x - M.x) / d.x);
    }
    if (Math.abs(d.y) > 1e-6) {
      for (const y of [0, H]) push((y - M.y) / d.y);
    }
    const hits = [];
    for (const t of ts) {
      const x = M.x + d.x * t, y = M.y + d.y * t;
      if (x > -0.5 && x < W + 0.5 && y > -0.5 && y < H + 0.5) {
        if (!hits.some((h) => Math.abs(h.t - t) < 0.5)) hits.push({ t, x, y });
      }
    }
    if (hits.length < 2) return null;
    hits.sort((a, b) => a.t - b.t);
    return { a: hits[0], b: hits[hits.length - 1] };
  }

  // 折痕参数：由“角 C → 落点 T”推出
  function creaseOf(C, T, W, H) {
    let dx = T.x - C.x, dy = T.y - C.y;
    let len = Math.hypot(dx, dy);
    if (len < 1e-3) { dx = -1; dy = 0; len = 1; }          // 退化：当作水平拖动
    const v = { x: dx / len, y: dy / len };                 // 从角指向落点（被折侧 → 静止侧）
    const M = { x: (C.x + T.x) / 2, y: (C.y + T.y) / 2 };   // 折痕过中点
    const d = { x: -v.y, y: v.x };                          // 折痕方向
    const seg = clipLineToRect(M, d, W, H);
    return { C, T, M, v, d, seg, len };
  }

  // 用半平面裁剪矩形（Sutherland–Hodgman），保证顶点按边界顺序 → 不会自交
  function clipHalfPlane(poly, M, v, keepPositive) {
    if (!poly) return null;
    const side = (p) => (p.x - M.x) * v.x + (p.y - M.y) * v.y;
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const sa = side(a), sb = side(b);
      const ina = keepPositive ? sa >= 0 : sa <= 0;
      const inb = keepPositive ? sb >= 0 : sb <= 0;
      if (ina) out.push(a);
      if (ina !== inb) {
        const t = sa / (sa - sb);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out.length >= 3 ? out : null;
  }
  const rectOf = (W, H) => [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  const polyStationary = (cr, W, H) => clipHalfPlane(rectOf(W, H), cr.M, cr.v, true);
  const polyPeeled = (cr, W, H) => clipHalfPlane(rectOf(W, H), cr.M, cr.v, false);

  function tracePoly(ctx, pts) {
    if (!pts || !pts.length) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
  const shiftPoly = (pts, v, t) => pts.map((p) => ({ x: p.x + v.x * t, y: p.y + v.y * t }));

  // ---------- 折痕坐标系：u 沿折痕，d 垂直折痕（d > 0 = 被卷起的一侧） ----------
  function toFold(cr, p) {
    const dx = p.x - cr.M.x, dy = p.y - cr.M.y;
    return { u: dx * cr.d.x + dy * cr.d.y, d: -(dx * cr.v.x + dy * cr.v.y) };
  }
  const foldToScreen = (cr, u, s) => ({
    x: cr.M.x + u * cr.d.x + s * cr.v.x,
    y: cr.M.y + u * cr.d.y + s * cr.v.y
  });

  /* ------------------------------------------------------------
     画一帧卷曲（只画“被翻的那一页”这一张纸）
     ctx   : 目标画布上下文（页面本地坐标 0..W, 0..H）
     front : 正面贴图（canvas）
     back  : 背面贴图（canvas，按左页排版）
     C     : 被拖的角
     T     : 落点（手指位置）
     radius: 卷曲半径 r（圆柱粗细）
     opts  : { thetaMax 最大卷起角(弧度), flat 1 = 不做透视压缩（对照用） }
     ------------------------------------------------------------ */
  function drawSheet(ctx, W, H, front, back, C, T, radius, opts) {
    opts = opts || {};
    const cr = creaseOf(C, T, W, H);
    if (!cr.seg) {                     // 还没开始折：整页平放
      ctx.drawImage(front, 0, 0);
      return cr;
    }
    const peel = polyPeeled(cr, W, H);
    if (!peel) {                       // 折痕把整页都划到静止侧了
      ctx.drawImage(front, 0, 0);
      return cr;
    }
    const v = cr.v, dd = cr.d;
    const r = Math.max(8, radius || 32);
    // 卷起角：起手/落页时摊平，中途最卷（|CT| 从 0 涨到 2W）
    const progress = Math.max(0, Math.min(1, cr.len / (2 * W)));
    const thetaMax = opts.thetaMax != null ? opts.thetaMax : 1.08;      // ≈62°
    const theta = opts.flat ? 0 : thetaMax * Math.pow(Math.sin(Math.PI * progress), 0.85);
    const sn = Math.sin(theta), cs = Math.cos(theta);
    const wrapD = r * theta;                       // 绕圆柱用掉的纸长
    const kShift = r * sn - wrapD * cs;            // 摊平段相对镜像位置的偏移
    // 立起来的面（卷边外沿 + 摊平段）整体比平放的页面暗：它已经转开 θ 角
    const tiltAlpha = 0.30 * (1 - cs);

    const sRoll = r * sn;                          // 卷边宽度（投影后）
    // ---------- 折痕：不是直线，是一条往"卷起侧"鼓出的弧线 ----------
    // 真纸被手指拉起来时，折痕中间鼓、两头收到页边；卷边也是中间粗两头细。
    // 这里把折痕采样成折线，卷边/摊平段都由采样点生成。
    const NS = 16;
    const segA = cr.seg.a, segB = cr.seg.b;
    const devMax = Math.max(4, Math.min(34, cr.len * 0.09));     // 弧线最大鼓出量
    const ctrl = { x: cr.M.x + v.x * 2 * devMax, y: cr.M.y + v.y * 2 * devMax };
    const S = [];
    for (let i = 0; i <= NS; i++) {
      const t = i / NS, mt = 1 - t;
      const x = mt * mt * segA.x + 2 * mt * t * ctrl.x + t * t * segB.x;
      const y = mt * mt * segA.y + 2 * mt * t * ctrl.y + t * t * segB.y;
      S.push({
        u: toFold(cr, { x, y }).u,                              // 沿折痕的坐标
        s0: (x - cr.M.x) * v.x + (y - cr.M.y) * v.y,             // 相对直线的偏移（鼓出量）
        w: 0.20 + 0.80 * Math.pow(Math.sin(Math.PI * t), 0.75)   // 卷边粗细：中间 1，两头 0.2
      });
    }
    const taperAt = (u) => {
      let best = S[0], bd = Infinity;
      for (const s of S) { const d = Math.abs(s.u - u); if (d < bd) { bd = d; best = s; } }
      return best.w;
    };
    const clipRect = (poly) => {
      let q = poly;
      if (!q) return null;
      q = clipHalfPlane(q, { x: 0, y: 0 }, { x: 1, y: 0 }, true);
      if (!q) return null;
      q = clipHalfPlane(q, { x: W, y: 0 }, { x: -1, y: 0 }, true);
      if (!q) return null;
      q = clipHalfPlane(q, { x: 0, y: 0 }, { x: 0, y: 1 }, true);
      if (!q) return null;
      return clipHalfPlane(q, { x: 0, y: H }, { x: 0, y: -1 }, true);
    };
    const innerPts = S.map((s) => foldToScreen(cr, s.u, s.s0));
    const outerPts = S.map((s) => foldToScreen(cr, s.u, s.s0 + sRoll * s.w));
    const rollScr = clipRect(innerPts.concat(outerPts.slice().reverse()));

    // 把"沿直线裁出来的多边形"靠折痕的那条边换成弧线采样点：
    // 返回 [弧线 A→B] + [远边链 B→A]，farS(f) 给出远边每个顶点映射后的 s
    const curvePoly = (poly, edgeD, curvePts, farS) => {
      if (!poly) return null;
      const n = poly.length;
      const fd = poly.map((q) => toFold(cr, q));
      const idx = [];
      for (let i = 0; i < n; i++) if (Math.abs(fd[i].d - edgeD) < 0.75) idx.push(i);
      if (idx.length !== 2) return null;
      const iA = fd[idx[0]].u <= fd[idx[1]].u ? idx[0] : idx[1];
      const iB = iA === idx[0] ? idx[1] : idx[0];
      const chain = [];
      let k = iB;
      for (let s = 1; s < n; s++) { k = (iB + s) % n; if (k === iA) break; chain.push(poly[k]); }
      if (!chain.length) {                       // 多边形方向反了：正着走到 B 再倒过来
        let k2 = iA;
        for (let s = 1; s < n; s++) { k2 = (iA + s) % n; if (k2 === iB) break; chain.push(poly[k2]); }
        chain.reverse();
      }
      return curvePts.concat(chain.map((q) => {
        const f = toFold(cr, q);
        return foldToScreen(cr, f.u, farS(f));
      }));
    };
    // 摊平段：内边界接着卷边外沿，外边界 = 直线版摊平段的"远边"链（按弧线重映射）
    const M2 = { x: cr.M.x - v.x * wrapD, y: cr.M.y - v.y * wrapD };
    const headFold = clipHalfPlane(peel, M2, v, false);
    const headS = (f) => {
      const w = taperAt(f.u);
      return cs * (f.d - wrapD * w) + sRoll * w;
    };
    const headPts = curvePoly(headFold, wrapD, outerPts, headS) || outerPts.slice();
    const headScr = headPts;                       // 摊平段会翻到旁边那页上，不能按本页矩形裁
    // 台面也按弧线收边：否则折痕与卷边之间会漏出一条"本页自己的内容"
    const flatStationary = polyStationary(cr, W, H);
    const stationaryScr = curvePoly(flatStationary, 0, innerPts, (f) => f.d) || flatStationary;
    const sHeadEnd = headPts.reduce((m, p) => {
      const s = (p.x - cr.M.x) * v.x + (p.y - cr.M.y) * v.y;
      return s > m ? s : m;
    }, 0);

    // 1) 台面：静止侧保持原样（正面贴图）
    ctx.save();
    tracePoly(ctx, stationaryScr);
    ctx.clip();
    ctx.drawImage(front, 0, 0);
    ctx.restore();

    // 2) 卷起来的部分投在台面上的柔影
    ctx.save();
    ctx.filter = 'blur(' + Math.max(3, r * 0.32).toFixed(1) + 'px)';
    if (rollScr) {
      ctx.fillStyle = 'rgba(28,19,10,0.26)';
      tracePoly(ctx, shiftPoly(rollScr, v, r * 0.22));
      ctx.fill();
    }
    if (headScr) {
      ctx.fillStyle = 'rgba(28,19,10,0.16)';
      tracePoly(ctx, shiftPoly(headScr, v, r * 0.50));
      ctx.fill();
    }
    ctx.restore();

    // 3) 卷边：圆柱投影出来的那条带
    if (rollScr && sRoll > 0.4) {
      ctx.save();
      tracePoly(ctx, rollScr);
      ctx.clip();
      // 3a 卷边上的纸背内容（近似沿 v 均匀压缩）
      const mRoll = mul(scaleAlongM(v, sn / Math.max(theta, 1e-3)),
        mul(mirrorMatrix(cr.M, dd), flipH(W)));
      ctx.save();
      ctx.globalAlpha = 0.95;
      setM(ctx, mRoll);
      ctx.drawImage(back, 0, 0);
      ctx.restore();
      // 3b 圆柱受光：贴痕最暗 → 迎光一道亮带 → 收在“摊平段”的亮度上（接缝不断层）
      const A = { x: cr.M.x + v.x * devMax, y: cr.M.y + v.y * devMax };
      const Bx = cr.M.x + v.x * (devMax + sRoll), By = cr.M.y + v.y * (devMax + sRoll);
      const gRoll = ctx.createLinearGradient(A.x, A.y, Bx, By);
      gRoll.addColorStop(0.00, 'rgba(34,24,13,0.46)');
      gRoll.addColorStop(0.18, 'rgba(96,80,58,0.22)');
      gRoll.addColorStop(0.45, 'rgba(255,252,243,0.40)');
      gRoll.addColorStop(0.72, 'rgba(206,192,166,0.18)');
      gRoll.addColorStop(1.00, 'rgba(22,15,7,' + tiltAlpha.toFixed(3) + ')');
      ctx.fillStyle = gRoll;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // 4) 摊平的那一段：纸背 + 明暗 + 纸边
    if (headScr) {
      ctx.save();
      tracePoly(ctx, headScr);
      ctx.clip();
      const A0 = { x: cr.M.x + v.x * (devMax + sRoll), y: cr.M.y + v.y * (devMax + sRoll) };
      const sEnd = Math.max(sHeadEnd, devMax + sRoll + 2);
      const B0 = { x: cr.M.x + v.x * sEnd, y: cr.M.y + v.y * sEnd };
      // 4a 纸色打底（贴图缺内容时也不露台面）
      const gPaper = ctx.createLinearGradient(A0.x, A0.y, B0.x, B0.y);
      gPaper.addColorStop(0, '#e9e1cd');
      gPaper.addColorStop(0.25, '#f7f2e6');
      gPaper.addColorStop(1, '#fffdf8');
      ctx.fillStyle = gPaper;
      ctx.fillRect(0, 0, W, H);
      // 4b 纸背内容：被翻起来的就是这一面（翻完落下来要跟左页对得上，所以照实画）
      const mHead = mul(translateM(v.x * kShift, v.y * kShift),
        mul(scaleAlongM(v, cs), mul(mirrorMatrix(cr.M, dd), flipH(W))));
      ctx.save();
      setM(ctx, mHead);
      ctx.drawImage(back, 0, 0);
      ctx.restore();
      // 4b2 压暗层要在内容之上，才是"这张纸整体转开了"
      ctx.fillStyle = 'rgba(22,15,7,' + tiltAlpha.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
      // 4c 刚离开圆柱那一侧的暗部（纸面互相遮光的过渡）
      const gUnder = ctx.createLinearGradient(A0.x, A0.y, B0.x, B0.y);
      gUnder.addColorStop(0, 'rgba(26,18,10,0.16)');
      gUnder.addColorStop(0.20, 'rgba(26,18,10,0.05)');
      gUnder.addColorStop(0.55, 'rgba(26,18,10,0)');
      ctx.fillStyle = gUnder;
      ctx.fillRect(0, 0, W, H);
      // 4d 纸边（自由边压一道极淡的边线，像真纸有厚度）
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(62,46,24,0.13)';
      tracePoly(ctx, headScr);
      ctx.stroke();
      ctx.restore();
    }

    // 5) 折痕：纸离开台面的那条线。两头收掉（渐隐）+ 轻微模糊，
    //    免得变成一道硬线横贯整页 —— 真纸的折痕是中间实、两头淡的。
    const seg = cr.seg;
    const fade = (alpha) => {
      const g = ctx.createLinearGradient(seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      g.addColorStop(0.00, 'rgba(28,20,10,0)');
      g.addColorStop(0.16, 'rgba(28,20,10,' + (alpha * 0.55).toFixed(3) + ')');
      g.addColorStop(0.50, 'rgba(28,20,10,' + alpha.toFixed(3) + ')');
      g.addColorStop(0.84, 'rgba(28,20,10,' + (alpha * 0.55).toFixed(3) + ')');
      g.addColorStop(1.00, 'rgba(28,20,10,0)');
      return g;
    };
    const strokePath = (pts) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    };
    ctx.save();
    ctx.filter = 'blur(1.1px)';
    ctx.strokeStyle = fade(0.40);
    ctx.lineWidth = 1.9;
    strokePath(innerPts);                      // 折痕画在弧线上
    ctx.filter = 'blur(0.8px)';
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = 1.2;
    strokePath(innerPts.map((q) => ({ x: q.x + v.x * 2.4, y: q.y + v.y * 2.4 })));
    ctx.restore();

    return cr;
  }

  global.PageCurl = {
    rasterize, textureOf, drawSheet, creaseOf,
    polyStationary, polyPeeled, toFold, foldToScreen, applyM,
    drawCreaseDebug: null
  };
})(window);
