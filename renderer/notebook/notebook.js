/* ==========================================================
   密码本 · 手写本子（翻页引擎接线）
   - 翻页引擎：turn.js（Emmanuel Garcia，个人免费授权）+ jQuery
     · 拖拽从任意角都成立，纸面卷曲、投影、翻页动效都交给库
     · 页面尺寸按窗口自适应；排版层用 --fit 等比缩放（不动 turn.js 的坐标）
   - 数据：mount({ owner, items }, opts) 传进来；单独打开这一页时用演示数据

   这个文件只管"引擎接线"：挂载 / 尺寸 / 翻页 / 键盘 / 提示条 / 公共 API。
   排版在 model.js，字迹在 ink.js，每一页长什么样在 page.js，写在纸上的表格在 sheet.js。
   ========================================================== */

import { PAGE_W, PAGE_H, LINE, DEMO, normalize, paginate, jit, hash } from './model.js';
import { pageHtml } from './page.js';
import { bindSheet, readSheetItem } from './sheet.js';
import { askMasterPassword } from './reveal.js';
import {
  FLIP_MS,
  SHEET_OUT_MS,
  SHEET_RIP_MS,
  SHEET_RELEASE_FALLBACK_MS,
  installTimingVars
} from './timing.js';

// 留白：书占舞台的多少（数值越大书越小，边上露出越多桌垫/桌面）。
// 走 CSS 变量是为了方便调"本子大小"：--book-pad-x / --book-pad-y。
function padX() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--book-pad-x')) || 120; }
function padY() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--book-pad-y')) || 140; }

// ---------- 书本状态 ----------
let data = normalize(window.NOTEBOOK_DATA || DEMO);
let pages = [];

// 条目 id → 页码：集成进主窗口后"刚写完就翻到那一页"要用
let pageOfItem = new Map();

// ---------- 正在往本子上写的那一条（「写一条」/「改这一条」） ----------
// app 层调 mount(data, { edit: { id, kind }, hooks }) 传进来：
//   kind === 'new'  → 新写一条；否则就是改某一条
// 这一条独占一整页，那一页不画写好的字，而是画一张能直接写的表格。
let editInfo = null;      // { id, kind } | null
let editHooks = {};       // { onSubmit(item), onCancel(), onDelete(id) }

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

// 时间只有 timing.js 一处定义：写进 :root 给 CSS 用（样式里只写 var(--xxx)）
installTimingVars();

// 字体预热：第一次画整页楷体要现场栅格化字形（正好卡在"翻开本子"那一下），
// 先在外面画一遍同样字体、同样大小的样品，把字形缓存热起来。
function warmUpFonts() {
  const text = '密码本 账号 密码 网址 备注 分类 常用 目录 封面 扉页 本子主人 0123456789 abcdefghijklmnopqrstuvwxyz';
  const made = ['var(--hand)', 'var(--hand-num)'].map((font) => {
    const d = document.createElement('div');
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText = 'position:fixed;left:-9999px;top:0;pointer-events:none;'
      + 'font-family:' + font + ';font-size:17px;line-height:28px;letter-spacing:.5px;';
    d.textContent = text;
    document.body.appendChild(d);
    return d;
  });
  setTimeout(() => made.forEach((d) => d.remove()), 1500);
}
warmUpFonts();

// ---------- 挂载 ----------
const el = {
  stage: document.getElementById('stage'),
  wrap: document.getElementById('bookWrap'),
  book: document.getElementById('book'),
  // 单独打开这一页时是 #toast；嵌进主窗口时叫 #nb-toast（#toast 是 app 的提示条）
  toast: document.getElementById('nb-toast') || document.getElementById('toast')
};

const state = { sound: false };

// ---------- 书本尺寸：跟着窗口走，但不缩放 turn.js 的容器（缩放会让拖拽坐标错位） ----------
let pageW = PAGE_W;
let pageH = PAGE_H;
let book = null;
// 翻页请求排队：turn.js 在动画进行中会把新的跳页请求丢掉（表现："点了目录不动"、甚至这一页和
// 页码对不上）。所以正在翻的时候先把目标记下来，等 turned 事件来了立刻补上，一次都不丢。
let pendingPage = 0;
let turning = false;
let turnSafety = null;
// 自己记的"当前页"：turn.js 的 turn('page') 在跨到新的对开页时会把**左页**报成当前页
// （实测 3→2、15→14），拿它当判断依据就会误判、跳页也会被吞掉。这里只信我们自己记的。
let wantPage = 1;
let hasFitted = false;      // fit() 的短路用：至少量过一次，且尺寸变了才动

// ---------- 挂载 / 重挂 ----------
// 数据变了（新写一条、改掉一条）就整本重排、重新挂一次。
// turn.js 没有 destroy()，所以直接换一个干净的 #book 容器最稳：
// 旧的页容器、页 wrapper 都在它里面，换掉就等于整本扔掉。
export function mount(raw, opts) {
  // 数据改了要重挂一本：先看看现在翻到哪儿（opts.keep 时还要停在那一页）
  const keepPage = (opts && opts.keep && book && bookVisible()) ? (book.turn('page') || 0) : 0;
  editInfo = (opts && opts.edit && opts.edit.id)
    ? { id: opts.edit.id, kind: opts.edit.kind === 'new' ? 'new' : 'edit' }
    : null;
  editHooks = (opts && opts.hooks) || {};
  data = normalize(raw || window.NOTEBOOK_DATA || DEMO);

  const built = paginate(data.items, editInfo ? editInfo.id : null);
  pages = built.pages;
  pageOfItem = built.pageOfItem;

  const fresh = document.createElement('div');
  fresh.className = 'book';
  fresh.id = 'book';
  el.book.replaceWith(fresh);
  el.book = fresh;

  // 每一页 = turn.js 的页容器（负责定位 / 裁切 / 旋转的那一层）
  //   里面 .nb-fit 是 440×600 的排版层，按 --fit 等比缩放，保证手写排版不跑版
  const view = {
    owner: data.owner,
    items: data.items,
    editId: editInfo ? editInfo.id : null,
    editKind: editInfo ? editInfo.kind : null,
    masked: document.body.classList.contains('masked')      // 编辑页的密码列跟着"显示密码"开关走
  };
  pages.forEach((page, i) => {
    const holder = document.createElement('div');
    holder.className = 'nb-page';
    // 每页的"书写倾斜"：同一页的字整体歪一点点，像真人趴在桌上写的
    holder.style.setProperty('--tilt', jit(hash('tilt' + i), 0.75, 'deg'));
    const fitBox = document.createElement('div');
    fitBox.className = 'nb-fit';
    fitBox.innerHTML = pageHtml(page, i, i % 2 === 1, view);
    holder.appendChild(fitBox);
    el.book.appendChild(holder);
  });

  // ---------- 翻页引擎 ----------
  book = window.jQuery('#book').turn({
    width: pageW * 2,
    height: pageH,
    display: 'double',
    autoCenter: false,
    // 重挂时停在原来那一页：一开始就摆好，不翻一遍动画
    page: keepPage > 1 ? Math.min(keepPage, pages.length) : 1,
    // 翻页时的纸面明暗/投影：gradients+elevation 会让每一页在旋转期间逐帧重绘，
    // 是翻页卡顿的主因。这里关掉，投影改由 CSS 的静态层（书脊阴影/书底投影）负责。
    gradients: false,
    elevation: 0,
    duration: FLIP_MS,
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
        const wasOurTurn = turning;
        turning = false;
        // 我们发起的翻页：wantPage 早就设好了，别用 turn.js 的回报覆盖（它跨对开页时报的是左页）；
        // 只有用户自己拖页角翻的（wasOurTurn 为 false）才按它同步。
        if (!wasOurTurn) wantPage = page;
        flushPendingPage();        // 动画期间攒下的跳页请求，这时候补上
        releaseSheetWrite();       // 翻到了：放开按住的那一页，开始动笔（事件驱动，不猜时间）
      }
    }
  });

  // 拖拽被取消/松手没翻成时，也要把合成层标记摘掉
  book.bind('end', () => {
    document.body.classList.remove('flipping');
    if (turning) { turning = false; flushPendingPage(); }
  });
  bindPageClicks();          // 新的 #book 容器，页内点击要重新绑
  bindSheet(el.book, {       // 正在写的那一页，把纸上的按钮接起来
    onSave: submitEdit,
    onCancel: cancelEdit,
    onDelete: (id) => {
      // 让"撕"先做出来，再让 app 去删数据、重排（确认框也是这时候才弹）
      setTimeout(() => {
        if (typeof editHooks.onDelete === 'function') editHooks.onDelete(id);
      }, Math.max(0, SHEET_RIP_MS - 120));
    },
    onGenerated: () => toast('换了个新密码，写完记得保存'),
    onCopy: (text) => copyText(text),
    onOpen: (url) => openSheetUrl(url),
    onReveal: (input, btn) => toggleReveal(input, btn)
  });

  resetSheetWrite();
  turning = false;
  pendingPage = 0;
  clearTimeout(turnSafety);
  el.wrap.classList.remove('at-cover', 'at-end');
  document.documentElement.style.setProperty('--shift', 0);
  // 起始页可能是「原来那一页」（opts.keep）：标签 / 左右居中按本子真实的当前页来刷
  updateLabel(book.turn('page') || 1);
  fit();
  // 写在纸上的那一页：默认马上动笔；要翻一页过去时 app 层会调 holdSheetWrite 把它推后
  armSheetSoon();          // 默认下一帧动笔；app 要翻页的话会紧接着调 holdSheetWrite()
  wantPage = keepPage > 1 ? Math.min(keepPage, pages.length) : 1;

  return {
    pages,
    pageCount: pages.length,
    pageOf: (id) => pageOfItem.get(id) || 0,
    page: wantPage
  };
}

export function fit() {
  if (!book || !el.stage.clientWidth) return;
  const availW = el.stage.clientWidth - 24;
  const availH = el.stage.clientHeight - 24;
  const raw = Math.max(0.5, Math.min(1.35, availW / (PAGE_W * 2 + padX()), availH / (PAGE_H + padY())));
  // 让"一行"正好落在整数物理像素上：横线最锐利，手写字也不会被半像素糊掉
  const dpr = window.devicePixelRatio || 1;
  const perLine = LINE * dpr;
  const s = Math.max(0.5, Math.round(raw * perLine) / perLine);
  const nextW = Math.round(PAGE_W * s);
  const nextH = Math.round(PAGE_H * s);

  // 尺寸没变就别再动：turn('size') 会让整本书重新排版 + 重新栅格化（实测 100ms+）。
  // 过渡结束时那次 fit()、窗口 resize 抖动，多数都是白干的。
  if (hasFitted && nextW === pageW && nextH === pageH) return;
  hasFitted = true;
  pageW = nextW;
  pageH = nextH;
  const root = document.documentElement.style;
  root.setProperty('--scale', s.toFixed(4));                 // 桌垫、笔等装饰按这个缩放
  root.setProperty('--fit', s.toFixed(6));                   // 页内排版层缩放（zoom 用）
  root.setProperty('--book-w', (pageW * 2) + 'px');
  root.setProperty('--book-h', pageH + 'px');
  book.turn('size', pageW * 2, pageH);
}

// ---------- 页码标签 / 只剩单页时的居中位移 ----------
function updateLabel(pageNo) {
  if (!book) return;
  const total = pages.length;
  pageNo = pageNo || wantPage;
  const atCover = pageNo <= 1;
  const atEnd = pageNo >= total;
  el.wrap.classList.toggle('at-cover', atCover);
  el.wrap.classList.toggle('at-end', atEnd);
  // 只剩单页时把整本书往空的那一侧挪半页，视觉上居中
  document.documentElement.style.setProperty('--shift', atCover ? -0.25 : (atEnd ? 0.25 : 0));
}

export function next() { turnBy(1); }
export function prev() { turnBy(-1); }
export function gotoPage(pageNo) { turnTo(pageNo | 0); }

/** 往上/往下翻：排队时以"已经排到的那一页"为基准，连按几次就往前走几页（不合并、不丢） */
function turnBy(step) {
  turnTo((pendingPage || wantPage) + step);
}

/** 统一入口：正在翻就排队，翻完立刻补上 */
function turnTo(pageNo) {
  const n = Math.max(1, Math.min(pages.length, pageNo));
  if (n === wantPage) return;                       // 已经在（或者正要去的）就是这一页
  if (turning) { pendingPage = n; return; }         // 动画中：记住目标，别丢
  startTurn(n);
}

function startTurn(n) {
  turning = true;
  wantPage = n;
  clearTimeout(turnSafety);
  // 兜底：万一 turned 没来（拖拽中断之类），到点自己解锁
  turnSafety = setTimeout(() => { turning = false; flushPendingPage(); }, FLIP_MS * 1.8);
  book.turn('page', n);
}

function flushPendingPage() {
  clearTimeout(turnSafety);
  if (!pendingPage) return;
  const n = pendingPage;
  pendingPage = 0;
  if (n === book.turn('page')) return;
  startTurn(n);
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

// 写在纸上那一页的「打开」按钮：拼上协议再用浏览器打开
function openSheetUrl(u) {
  if (!u) { toast('这一条还没填网址'); return; }
  const url = /^https?:\/\//i.test(u) ? u : 'https://' + u;
  if (window.vaultAPI && window.vaultAPI.openExternal) window.vaultAPI.openExternal(url);
}

// 页内交互：点目录跳页 / 点密码复制。
// 注意：每次重挂都会换一个全新的 #book 容器，所以这个监听要跟着重绑一次，
// 否则"数据改了重挂一本"之后，目录跳页和点密码复制就失灵了。
function bindPageClicks() {
  el.book.addEventListener('click', (e) => {
    const row = e.target.closest('.toc-row');
    if (row) { gotoPage(parseInt(row.dataset.page, 10)); return; }
    const eye = e.target.closest('[data-reveal]');
    if (eye) { toggleEntryReveal(eye); return; }
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

// ---------- 写在纸上的那一条：交给 app 层 ----------
// 把纸上写的字收回来，交给 app 存
export function submitEdit() {
  if (!editInfo) return;
  const item = readSheetItem(el.book);
  if (!item) return;
  if (!item.title) {
    toast('给它起个标题吧');
    const t = el.book.querySelector('#es-title');
    if (t) t.focus();
    return;
  }
  const sheetEl = sheetOf();
  if (sheetEl) sheetEl.classList.add('es-going');       // 先做出"抄进本子"的动作
  // 等这个动作播完再交给 app 去重排 —— 不然重挂会把动画掐断（衔接就断了）
  setTimeout(() => {
    if (typeof editHooks.onSubmit === 'function') editHooks.onSubmit(item, editInfo.kind);
  }, Math.max(0, SHEET_OUT_MS - 40));
}

export function cancelEdit() {
  if (!editInfo) return;
  // 新写的一页：已经起了标题的话，撕掉之前先问一声
  if (editInfo.kind !== 'edit') {
    const sheet = el.book.querySelector('.es');
    const t = sheet && sheet.querySelector('#es-title');
    if (t && t.value.trim() && !window.confirm('这一页还没写进本子，撕掉就没了。真要撕？')) return;
  }
  const sheetEl = sheetOf();
  const ripping = editInfo.kind !== 'edit';
  if (sheetEl) sheetEl.classList.add(ripping ? 'es-ripped' : 'es-going');
  setTimeout(() => {
    if (typeof editHooks.onCancel === 'function') editHooks.onCancel();
  }, Math.max(0, (ripping ? SHEET_RIP_MS : SHEET_OUT_MS) - 60));
}

// ---------- 看一眼这条密码（👁） ----------
// 规矩：露着的时候点一下收回去（不用验）；遮着的时候点一下，要输主密码，
// 验过就只把这一条显示出来 —— 会话照旧，不重新解锁。
async function toggleReveal(inputEl, btn) {
  if (!inputEl || !btn) return;

  if (inputEl.type === 'text') {
    inputEl.type = 'password';
    btn.classList.remove('on');
    toast('收起来了');
    return;
  }

  const pw = await askMasterPassword({ verify: (value) => verifyMasterPassword(value) });
  if (pw == null) return;

  inputEl.type = 'text';
  btn.classList.add('on');
  toast('看完了记得收起来');
}

// 只验密码对不对，不动当前会话。单独预览这一页（没有保险库）时直接放行。
async function verifyMasterPassword(password) {
  const api = window.vaultAPI;
  if (!api || typeof api.verifyMaster !== 'function') return true;
  try {
    const res = await api.verifyMaster(password);
    return !!(res && res.ok);
  } catch (e) {
    return false;
  }
}

// ---------- 写在纸上的那一页：什么时候"动笔" ----------
// 就在这一页改 → mount 之后下一帧动笔；要翻一页过去 → 先把这一页按住（不可见），
// 等 turn.js 的 turned 事件来了再放开。全交给事件，不再靠"猜一个 860ms"。
let sheetHeld = false;
let armTimer = null;
let releaseTimer = null;

function sheetOf() {
  return el.book.querySelector('.es');
}

/** 默认节奏：下一帧放开（给 app 留一个同步的"先别放"的机会） */
function armSheetSoon() {
  clearTimeout(armTimer);
  if (!sheetOf()) return;
  armTimer = setTimeout(() => releaseSheetWrite(), 30);
}

/** 要翻一页过去：先把这一页按住，等翻到了再放开 */
export function holdSheetWrite() {
  const sheetEl = sheetOf();
  if (!sheetEl) return;
  clearTimeout(armTimer);
  sheetHeld = true;
  sheetEl.classList.add('es--pending');
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => releaseSheetWrite(), SHEET_RELEASE_FALLBACK_MS);   // 兜底
}

/** 翻到了 / 兜底时间到：放开这一页，动画从这一刻开始 */
export function releaseSheetWrite() {
  clearTimeout(armTimer);
  clearTimeout(releaseTimer);
  const sheetEl = sheetOf();
  if (!sheetEl) { sheetHeld = false; return; }
  if (!sheetHeld && sheetEl.classList.contains('es-armed')) return;   // 已经放过了
  sheetHeld = false;
  sheetEl.classList.remove('es--pending');
  sheetEl.classList.add('es-armed');
}

/** 重挂一本之前，把上一次的计时器收掉 */
function resetSheetWrite() {
  clearTimeout(armTimer);
  clearTimeout(releaseTimer);
  sheetHeld = false;
}

// ---------- 本子页面上：点 👁 看一眼这条密码 ----------
// 遮着的时候点一下要输主密码；验过把这条用等宽字体读出来。
// 收起来的时候把明文从 DOM 里清掉（页面上只留圆点/手写体）。
async function toggleEntryReveal(btn) {
  const lineEl = btn.closest('.e-line');
  const valEl = lineEl && lineEl.querySelector('.e-val.pw');
  if (!valEl) return;

  if (valEl.classList.contains('pw-shown')) {
    const span = valEl.querySelector('.pw-read');
    if (span) span.remove();
    valEl.classList.remove('pw-shown');
    btn.classList.remove('on');
    toast('收起来了');
    return;
  }

  const pw = await askMasterPassword({ verify: (value) => verifyMasterPassword(value) });
  if (pw == null) return;

  const item = data.items.find((x) => x.id === btn.dataset.reveal);
  if (!item) return;

  const span = document.createElement('span');
  span.className = 'pw-read';
  span.textContent = item.password || '—';
  valEl.appendChild(span);
  valEl.classList.add('pw-shown');
  btn.classList.add('on');
  toast('看完记得收起来');
}

// ---------- 页内交互 / 键盘 ----------
// 底栏整条删掉了：翻页靠拖页角或 ← →，目录靠书顶那条红飘带，写 / 改在 app 层。
document.getElementById('ribbon').onclick = () => gotoPage(3);

// 遮住 / 显示密码：body.masked = 密码被遮住（开不开在「设置」里）
export function setMasked(v) {
  document.body.classList.toggle('masked', !!v);
}
setMasked(document.body.classList.contains('masked'));

// 翻页音效现在是「设置」里的一个开关（底栏那颗按钮搬到设置里了），这里只管存状态
export function setSound(v) {
  state.sound = !!v;
  if (state.sound) swish(0.8);
}

// 书本是不是正显示着（嵌进主窗口后，解锁屏时不该被方向键翻页）
function bookVisible() {
  const screen = document.getElementById('screen-book');
  return !screen || !screen.classList.contains('hidden');
}

window.addEventListener('keydown', (e) => {
  if (!book || !bookVisible()) return;
  // 光标在纸上的输入框里：方向键交给输入框自己
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
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

// ---------- 给 app 层 / 测试用的读数 ----------
export function pageOf(id) { return pageOfItem.get(id) || 0; }
export function pageCount() { return pages.length; }
export function currentPage() { return book ? book.turn('page') : 0; }
export function getPages() { return pages; }
export function getEditId() { return editInfo ? editInfo.id : null; }

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

// 供 app 层 / 测试脚本 / 集成调用（app 层本来就直接 import，这里留一份给控制台和测试脚本用）
window.__mountNotebook = mount;
window.__nb = {
  mount,
  get pages() { return pages; },
  get pageCount() { return pages.length; },
  next,
  prev,
  gotoPage,
  fit,
  currentPage,
  book: () => book,
  pageEl: (i) => el.book.children[i],
  pageOf,
  submitEdit,
  cancelEdit,
  get editId() { return editInfo ? editInfo.id : null; },
  get wantPage() { return wantPage; },          // 应用自己记的当前页（turn('page') 跨对开页时会报左页）
  setMasked,
  setSound
};

// 单独打开本子这一页（npm run notebook / 测试脚本）就自动挂上一本；
// 嵌在主窗口里（有 #screen-app）时不动手，等 app 层解锁之后来调 mount()。
if (!document.getElementById('screen-app')) {
  mount();
}
