// ============================================================
// 动画小人（移植自 animated-characters 组件，纯原生 DOM 实现）
// 逐帧插值 + 拟人化；底部严格对齐一条直线
// 性能/观感：整数像素 + 脏检查(仅在变化时改写样式) + GPU 合成，杜绝底边闪烁
// 行为：不输入时脖子随鼠标自由伸缩；聚焦输入框时缩回原位；
//       输密码时扭身躲避并偶尔伸长脖子偷看；显示密码时偷瞄
// ============================================================
(function () {
  const PURPLE = '#6C3FF5';
  const DARK = '#2D2D2D';
  const YELLOW = '#E8D754';
  const ORANGE = '#FF9B6B';
  const WHITE = '#ffffff';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const BASE_Z = { purple: 1, black: 2, orange: 3, yellow: 4 };
  const BASE_H = { purple: 400, black: 310, orange: 200, yellow: 230 };
  const PEEK_STRETCH = { purple: 90, black: 72, yellow: 62 };
  const MAX_NECK = { purple: 46, black: 36, orange: 16, yellow: 30 };
  const PHASE = { purple: 0, black: 1.4, orange: 2.2, yellow: 0.7 };
  const ENTER_DELAY = { purple: 0, black: 80, orange: 150, yellow: 210 };
  const ALL = ['purple', 'black', 'orange', 'yellow'];

  function makeBall(size, pupilSize, eyeColor, pupilColor, maxDistance) {
    const ball = document.createElement('div');
    Object.assign(ball.style, {
      width: size + 'px', height: size + 'px', background: eyeColor,
      borderRadius: '50%', display: 'flex', alignItems: 'center',
      justifyContent: 'center', overflow: 'hidden', flex: '0 0 auto',
      transition: 'height .1s ease'
    });
    const pupil = document.createElement('div');
    Object.assign(pupil.style, {
      width: pupilSize + 'px', height: pupilSize + 'px',
      background: pupilColor, borderRadius: '50%'
    });
    ball.appendChild(pupil);
    return { el: ball, pupil, pupilBase: pupilSize, maxDistance, size, setBlink(on) { ball.style.height = on ? '2px' : size + 'px'; } };
  }

  function makePupil(size, color, maxDistance) {
    const el = document.createElement('div');
    Object.assign(el.style, {
      width: size + 'px', height: size + 'px', background: color,
      borderRadius: '50%', flex: '0 0 auto', transition: 'height .1s ease'
    });
    return { el, maxDistance, size, setBlink(on) { el.style.height = on ? Math.max(2, size * 0.22) + 'px' : size + 'px'; } };
  }

  function mountAnimatedCharacters(wrapEl) {
    const stage = document.createElement('div');
    Object.assign(stage.style, { position: 'relative', width: '550px', height: '400px', transformOrigin: 'bottom center' });
    wrapEl.appendChild(stage);

    function buildChar(eyes, geo, extraEl) {
      const charEl = document.createElement('div');
      Object.assign(charEl.style, {
        position: 'absolute', bottom: '0px', left: geo.left, width: geo.width,
        height: geo.height, background: geo.background, borderRadius: geo.borderRadius,
        zIndex: geo.zIndex, transformOrigin: 'bottom center'
      });
      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position: 'absolute', display: 'flex', gap: geo.gap, transformOrigin: 'center'
      });
      // 柔边：同色模糊副本垫在最下层（只在小人自己身上，不遮眼睛/脚垫）。
      // 斜边抗锯齿在「亮/暗行交替」时会看成一条淡淡的虚线，用同色模糊包一层就看不出来了。
      const halo = document.createElement('div');
      Object.assign(halo.style, {
        position: 'absolute', left: '0px', top: '0px', right: '0px', bottom: '0px',
        background: geo.background, borderRadius: 'inherit',
        filter: 'blur(2px)', pointerEvents: 'none'
      });
      charEl.appendChild(halo);
      // 底边脚垫：在身体下面再垫 3px 同色块。身体底边的抗锯齿半透明像素只和「自己」混色，
      // 不会再透出后面的紫色/背景（原先表现为橙色小人底部一条蓝线）。
      const foot = document.createElement('div');
      Object.assign(foot.style, {
        position: 'absolute', left: '0px', right: '0px', top: '100%', height: '3px',
        background: geo.background, pointerEvents: 'none'
      });
      charEl.appendChild(foot);
      eyes.forEach((e) => wrap.appendChild(e.el));
      charEl.appendChild(wrap);
      if (extraEl) charEl.appendChild(extraEl);
      stage.appendChild(charEl);
      return { charEl, wrap, foot };
    }

    const purpleEyes = [makeBall(18, 7, WHITE, DARK, 5), makeBall(18, 7, WHITE, DARK, 5)];
    const purple = buildChar(purpleEyes, { left: '70px', width: '180px', height: '400px', background: PURPLE, borderRadius: '10px 10px 0 0', zIndex: 1, gap: '32px' });

    const blackEyes = [makeBall(16, 6, WHITE, DARK, 4), makeBall(16, 6, WHITE, DARK, 4)];
    const black = buildChar(blackEyes, { left: '240px', width: '120px', height: '310px', background: DARK, borderRadius: '8px 8px 0 0', zIndex: 2, gap: '24px' });

    const orangeEyes = [makePupil(12, DARK, 5), makePupil(12, DARK, 5)];
    const orange = buildChar(orangeEyes, { left: '0px', width: '240px', height: '200px', background: ORANGE, borderRadius: '120px 120px 0 0', zIndex: 3, gap: '32px' });

    const yellowEyes = [makePupil(12, DARK, 5), makePupil(12, DARK, 5)];
    const yellowMouth = document.createElement('div');
    Object.assign(yellowMouth.style, { position: 'absolute', width: '80px', height: '4px', background: DARK, borderRadius: '9999px' });
    const yellow = buildChar(yellowEyes, { left: '310px', width: '140px', height: '230px', background: YELLOW, borderRadius: '70px 70px 0 0', zIndex: 4, gap: '24px' }, yellowMouth);

    // 接缝补位：相邻两个小人因位移/倾斜不同而张开缝隙时，用「后面那个小人」的颜色补上，
    // 避免露出更后层的紫色或背景（表现为橙色小人底部一条蓝线）。
    function buildSkirt(charObj, side, color) {
      const el = document.createElement('div');
      Object.assign(el.style, {
        position: 'absolute', bottom: '-3px', height: '0px', width: '0px',
        background: color, pointerEvents: 'none'
      });
      // 压进自己身体 8px：把身体左/右边那条抗锯齿接缝盖掉
      if (side === 'left') el.style.right = 'calc(100% - 8px)';
      else el.style.left = '100%';
      charObj.charEl.appendChild(el);
      return el;
    }
    const blackSkirt = buildSkirt(black, 'left', DARK);
    const purpleSkirt = buildSkirt(purple, 'right', PURPLE);

    const A = {
      purple: { ex: 45, ey: 40, skew: 0, tx: 0, tilt: 0, dil: 1, h: 0, p: [{ x: 0, y: 0 }, { x: 0, y: 0 }] },
      black: { ex: 26, ey: 32, skew: 0, tx: 0, tilt: 0, dil: 1, h: 0, p: [{ x: 0, y: 0 }, { x: 0, y: 0 }] },
      orange: { ex: 82, ey: 90, skew: 0, tx: 0, tilt: 0, dil: 1, h: 0, p: [{ x: 0, y: 0 }, { x: 0, y: 0 }] },
      yellow: { ex: 52, ey: 40, skew: 0, tx: 0, tilt: 0, dil: 1, h: 0, mx: 40, my: 88, p: [{ x: 0, y: 0 }, { x: 0, y: 0 }] }
    };
    const CHAR = {
      purple: { el: purple.charEl, wrap: purple.wrap, foot: purple.foot, eyes: purpleEyes, setZ: (z) => purple.charEl.style.zIndex = z },
      black: { el: black.charEl, wrap: black.wrap, foot: black.foot, eyes: blackEyes, setZ: (z) => black.charEl.style.zIndex = z },
      orange: { el: orange.charEl, wrap: orange.wrap, foot: orange.foot, eyes: orangeEyes, setZ: (z) => orange.charEl.style.zIndex = z },
      yellow: { el: yellow.charEl, wrap: yellow.wrap, foot: yellow.foot, eyes: yellowEyes, setZ: (z) => yellow.charEl.style.zIndex = z }
    };
    // 脏检查缓存：只有真正变化才改样式，避免无谓重绘造成闪烁
    const CACHE = {};
    ALL.forEach((c) => CACHE[c] = { h: -1, tf: '', left: '', top: '', rot: '', op: '', pup: ['', ''] });

    function resize() {
      const scale = Math.min(1, (wrapEl.clientWidth - 24) / 570, (wrapEl.clientHeight - 24) / 420);
      stage.style.transform = 'scale(' + Math.max(0.5, scale).toFixed(3) + ')';
    }
    new ResizeObserver(resize).observe(wrapEl);
    resize();

    if (reduceMotion) {
      ALL.forEach((c) => {
        CHAR[c].el.style.height = BASE_H[c] + 'px';
        CHAR[c].wrap.style.opacity = '1';
        CHAR[c].wrap.style.left = ({ purple: 45, black: 26, orange: 82, yellow: 52 })[c] + 'px';
        CHAR[c].wrap.style.top = ({ purple: 40, black: 32, orange: 90, yellow: 40 })[c] + 'px';
      });
      yellowMouth.style.left = '40px'; yellowMouth.style.top = '88px';
      return { setTyping() {}, setPasswordLength() {}, react() {} };
    }

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    const st = { isTyping: false, showPassword: false, passwordLength: 0 };
    let looking = false;
    let lookingTimer = null;
    let peeking = false;
    let peekChar = null;
    const blink = { purple: false, black: false, orange: false, yellow: false };

    const mountTime = performance.now();
    let frameNow = mountTime;
    let denyUntil = 0;

    window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
    document.addEventListener('mouseleave', () => { mouseX = window.innerWidth / 2; mouseY = window.innerHeight * 0.4; });

    function scheduleBlink(c) {
      setTimeout(() => {
        blink[c] = true;
        setTimeout(() => { blink[c] = false; scheduleBlink(c); }, 140);
      }, Math.random() * 4000 + 2600);
    }
    ALL.forEach((c, i) => setTimeout(() => scheduleBlink(c), i * 500));

    function calcPos(el) {
      const r = el.getBoundingClientRect();
      const dx = mouseX - (r.left + r.width / 2);
      const dy = mouseY - (r.top + r.height / 3);
      return { faceX: clamp(dx / 20, -15, 15), faceY: clamp(dy / 30, -10, 10), bodySkew: clamp(-dx / 120, -6, 6), top: r.top };
    }
    function eyeTarget(eye, fx, fy) {
      if (fx !== undefined && fy !== undefined) return { x: fx, y: fy };
      const r = eye.el.getBoundingClientRect();
      const dx = mouseX - (r.left + r.width / 2);
      const dy = mouseY - (r.top + r.height / 2);
      const d = Math.min(Math.hypot(dx, dy), eye.maxDistance);
      const a = Math.atan2(dy, dx);
      return { x: Math.cos(a) * d, y: Math.sin(a) * d };
    }

    let last = performance.now();
    function update(now) {
      const dt = Math.min(48, now - last) || 16;
      last = now;
      frameNow = now;
      const k = (base) => 1 - Math.pow(1 - base, dt / 16.67);
      const kPupil = k(0.32), kPos = k(0.14), kBody = k(0.10), kH = k(0.14), kSlow = k(0.10);

      const pwShow = st.showPassword && st.passwordLength > 0;
      const hiding = st.passwordLength > 0 && !st.showPassword;
      const leaning = st.isTyping || hiding;
      const curious = st.isTyping && st.passwordLength === 0 && !looking;
      const denying = now < denyUntil;

      const pos = { purple: calcPos(purple.charEl), black: calcPos(black.charEl), orange: calcPos(orange.charEl), yellow: calcPos(yellow.charEl) };
      const tiltOf = (c) => (peekChar === c ? 7 : curious ? 4 : 0);
      const isPeek = (c) => peekChar === c;
      // 脖子跟随鼠标：仅在未聚焦输入框时生效；聚焦时归零（缩回原位）
      const neckOf = (c) => (st.isTyping ? 0 : clamp((pos[c].top - mouseY) / 10, 0, MAX_NECK[c]));
      // 呼吸改为“脸部微幅上下浮动”，身体保持不动 → 底部永不动，杜绝闪烁
      const headBob = (c) => Math.sin(now * 0.0016 + PHASE[c]) * 1.6;
      const shake = denying ? Math.sin(now / 32) * 3.4 : 0;

      function step(c, set, eyes) {
        const a = A[c], ce = CACHE[c];
        const entering = now - mountTime < ENTER_DELAY[c];
        const gate = entering ? 0 : 1;
        a.ex = lerp(a.ex, set.ex, kPos);
        a.ey = lerp(a.ey, set.ey, kPos);
        a.skew = lerp(a.skew, set.skew, kBody);
        a.tx = lerp(a.tx, set.tx, kBody);
        a.tilt = lerp(a.tilt, entering ? 0 : tiltOf(c), kSlow);
        a.dil = lerp(a.dil, set.dil || 1, kSlow);
        const targetH = clamp(gate * (BASE_H[c] + set.extra + neckOf(c)) - (denying ? 24 : 0), 0, 900);
        a.h = lerp(a.h, targetH, kH);

        const hPx = Math.max(0, Math.round(a.h));
        if (ce.h !== hPx) { CHAR[c].el.style.height = hPx + 'px'; ce.h = hPx; }

        // 用 2D translate（不用 translate3d/GPU 图层）：独立图层会被吸附到整数设备像素，
        // 导致紫色小人的底边比橙色低约 1px、且底边出现半透明混色（看起来像一条蓝线）。
        const txf = 'translate(' + Math.round(a.tx + shake) + 'px,0) skewX(' + (a.skew + shake * 0.6).toFixed(2) + 'deg)';
        if (ce.tf !== txf) { CHAR[c].el.style.transform = txf; ce.tf = txf; }

        const left = (a.ex + 0).toFixed(1) + 'px';
        if (ce.left !== left) { CHAR[c].wrap.style.left = left; ce.left = left; }
        const top = (a.ey + headBob(c)).toFixed(1) + 'px';
        if (ce.top !== top) { CHAR[c].wrap.style.top = top; ce.top = top; }
        const rot = 'rotate(' + a.tilt.toFixed(2) + 'deg)';
        if (ce.rot !== rot) { CHAR[c].wrap.style.transform = rot; ce.rot = rot; }

        const op = clamp((a.h - 28) / 46, 0, 1).toFixed(2);
        if (ce.op !== op) {
          CHAR[c].wrap.style.opacity = op;
          if (CHAR[c].foot) CHAR[c].foot.style.opacity = op;
          ce.op = op;
        }

        eyes.forEach((eye, i) => {
          const t = eyeTarget(eye, set.fx, set.fy);
          a.p[i].x = lerp(a.p[i].x, t.x, kPupil);
          a.p[i].y = lerp(a.p[i].y, t.y, kPupil);
          const px = a.p[i].x.toFixed(2), py = a.p[i].y.toFixed(2);
          const key = px + ',' + py;
          if (ce.pup[i] !== key) {
            (eye.pupil || eye.el).style.transform = 'translate(' + px + 'px,' + py + 'px)';
            ce.pup[i] = key;
          }
          if (eye.pupil && eye.pupilBase) {
            const s = Math.round(eye.pupilBase * a.dil) + 'px';
            if (eye.pupil.style.width !== s) { eye.pupil.style.width = s; eye.pupil.style.height = s; }
          }
          if (eye.setBlink) eye.setBlink(blink[c]);
        });
      }

      step('purple', {
        ex: pwShow ? 20 : looking ? 55 : 45 + pos.purple.faceX,
        ey: pwShow ? 35 : looking ? 65 : 40 + pos.purple.faceY,
        skew: pwShow ? 0 : leaning ? pos.purple.bodySkew - 12 : pos.purple.bodySkew,
        tx: (isPeek('purple') ? 30 : 0) + (leaning && !pwShow ? 26 : 0) + (curious ? 14 : 0),
        extra: ((st.isTyping || hiding) ? 30 : 0) + (isPeek('purple') ? PEEK_STRETCH.purple : 0) + (curious ? 20 : 0),
        dil: isPeek('purple') ? 1.3 : curious ? 1.22 : 1,
        fx: isPeek('purple') ? 5 : pwShow ? (peeking ? 4 : -4) : looking ? 3 : undefined,
        fy: isPeek('purple') ? -1 : pwShow ? (peeking ? 5 : -4) : looking ? 4 : undefined
      }, purpleEyes);

      step('black', {
        ex: pwShow ? 10 : looking ? 32 : 26 + pos.black.faceX,
        ey: pwShow ? 28 : looking ? 12 : 32 + pos.black.faceY,
        skew: pwShow ? 0 : looking ? pos.black.bodySkew * 1.5 + 10 : leaning ? pos.black.bodySkew * 1.5 : pos.black.bodySkew,
        tx: (isPeek('black') ? 28 : 0) + (looking ? 14 : 0) + (curious ? 12 : 0),
        extra: (isPeek('black') ? PEEK_STRETCH.black : 0) + (curious ? 16 : 0),
        dil: isPeek('black') ? 1.3 : curious ? 1.22 : 1,
        fx: isPeek('black') ? 5 : pwShow ? -4 : looking ? 0 : undefined,
        fy: isPeek('black') ? -1 : pwShow ? -4 : looking ? -4 : undefined
      }, blackEyes);

      step('orange', {
        ex: pwShow ? 50 : 82 + pos.orange.faceX,
        ey: pwShow ? 85 : 90 + pos.orange.faceY,
        skew: pwShow ? 0 : pos.orange.bodySkew,
        tx: curious ? 8 : 0,
        extra: curious ? 12 : 0,
        dil: curious ? 1.15 : 1,
        fx: pwShow ? -5 : undefined,
        fy: pwShow ? -4 : undefined
      }, orangeEyes);

      step('yellow', {
        ex: pwShow ? 20 : 52 + pos.yellow.faceX,
        ey: pwShow ? 35 : 40 + pos.yellow.faceY,
        skew: pwShow ? 0 : pos.yellow.bodySkew,
        tx: (isPeek('yellow') ? 28 : 0) + (curious ? 12 : 0),
        extra: (isPeek('yellow') ? PEEK_STRETCH.yellow : 0) + (curious ? 16 : 0),
        dil: isPeek('yellow') ? 1.3 : curious ? 1.2 : 1,
        fx: isPeek('yellow') ? 5 : pwShow ? -5 : undefined,
        fy: isPeek('yellow') ? -1 : pwShow ? -4 : undefined
      }, yellowEyes);

      {
        const a = A.yellow;
        a.mx = lerp(a.mx, pwShow ? 10 : 40 + pos.yellow.faceX, kPos);
        a.my = lerp(a.my, pwShow ? 88 : 88 + pos.yellow.faceY, kPos);
        const ml = a.mx.toFixed(1) + 'px', mt = a.my.toFixed(1) + 'px';
        if (yellowMouth.dataset.l !== ml) { yellowMouth.style.left = ml; yellowMouth.dataset.l = ml; }
        if (yellowMouth.dataset.t !== mt) { yellowMouth.style.top = mt; yellowMouth.dataset.t = mt; }
      }

      // 接缝补位尺寸：高度只到「前置小人直边范围」内（再往上属于正常的层叠露出），
      // 宽度按当前缝隙实时计算，够用即可，避免补位色跑到别处。
      {
        const tk = (deg) => Math.tan((deg * Math.PI) / 180);
        const tOrange = -tk(A.orange.skew), tBlack = -tk(A.black.skew);
        const hB = Math.round(Math.max(0, Math.min(A.black.h, A.orange.h) - 118));
        const gapBottom = A.black.tx - A.orange.tx;
        const gapTop = gapBottom + hB * (tBlack - tOrange);
        // 偷看时该小人会临时置顶，此时补位不能压到前面那个小人身上 → 不加余量
        const margin = peekChar === 'black' ? 0 : 8;
        // 边缘柔化交给同色 halo，这里保持纯黑即可（左端压在橙小人身后，右端压进黑身体 8px）
        const wB = Math.round(clamp(Math.max(gapBottom, gapTop) + margin + 10, 0, 190));
        if (blackSkirt.dataset.h !== String(hB) || blackSkirt.dataset.w !== String(wB)) {
          blackSkirt.style.height = hB + 'px';
          blackSkirt.style.width = wB + 'px';
          blackSkirt.dataset.h = String(hB);
          blackSkirt.dataset.w = String(wB);
        }
        const hP = Math.round(Math.max(0, Math.min(A.purple.h, A.black.h) - 12));
        const marginP = peekChar === 'purple' ? 0 : 6;
        const gapP = A.black.tx - A.purple.tx - 10;            // 紫右边缘 → 黑左边缘
        const wP = Math.round(clamp(gapP + 8 + marginP, 0, 80));
        if (purpleSkirt.dataset.h !== String(hP) || purpleSkirt.dataset.w !== String(wP)) {
          purpleSkirt.style.height = hP + 'px';
          purpleSkirt.style.width = wP + 'px';
          purpleSkirt.dataset.h = String(hP);
          purpleSkirt.dataset.w = String(wP);
        }
      }

      requestAnimationFrame(update);
    }
    requestAnimationFrame(update);

    let peekSchedTimer = null;
    let peekBackTimer = null;
    function scheduleNeckPeek() {
      clearTimeout(peekSchedTimer);
      peekSchedTimer = setTimeout(() => {
        const isHiding = st.passwordLength > 0 && !st.showPassword;
        if (!isHiding) { scheduleNeckPeek(); return; }
        peekChar = ['purple', 'black', 'yellow'][Math.floor(Math.random() * 3)];
        if (CHAR[peekChar]) CHAR[peekChar].setZ(9);
        clearTimeout(peekBackTimer);
        peekBackTimer = setTimeout(() => {
          if (peekChar && CHAR[peekChar]) CHAR[peekChar].setZ(BASE_Z[peekChar]);
          peekChar = null;
          scheduleNeckPeek();
        }, 950);
      }, Math.random() * 2500 + 2600);
    }

    let peekEyeTimer = null;
    function scheduleEyePeek() {
      clearTimeout(peekEyeTimer);
      peekEyeTimer = setTimeout(() => {
        peeking = true;
        setTimeout(() => { peeking = false; scheduleEyePeek(); }, 800);
      }, Math.random() * 3000 + 2000);
    }

    return {
      setTyping(v) {
        if (v === st.isTyping) return;
        st.isTyping = v;
        if (v) {
          looking = true;
          clearTimeout(lookingTimer);
          lookingTimer = setTimeout(() => { looking = false; }, 800);
        } else {
          looking = false;
        }
      },
      setPasswordLength(len, show) {
        const wasHiding = st.passwordLength > 0 && !st.showPassword;
        const wasShow = st.showPassword && st.passwordLength > 0;
        st.passwordLength = len;
        st.showPassword = show;
        const nowHiding = len > 0 && !show;
        const nowShow = show && len > 0;
        if (nowHiding && !wasHiding) scheduleNeckPeek();
        if (!nowHiding) { clearTimeout(peekSchedTimer); clearTimeout(peekBackTimer); if (peekChar) { CHAR[peekChar].setZ(BASE_Z[peekChar]); peekChar = null; } }
        if (nowShow && !wasShow) scheduleEyePeek();
        if (!nowShow) { clearTimeout(peekEyeTimer); peeking = false; }
      },
      react(kind) {
        if (kind === 'deny') denyUntil = performance.now() + 620;
      }
    };
  }

  window.mountAnimatedCharacters = mountAnimatedCharacters;
})();
