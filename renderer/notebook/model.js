/* 手写本子 · 数据模型与分页
   —— 纯函数：不碰 DOM、不碰 turn.js，可以单独跑单测。
   排版基准尺寸也在这里，HTML 那边（ink.js / page.js）按同一套数字画。 */

export const PAGE_W = 440;      // 排版基准尺寸：页面内容全按这个尺寸写
export const PAGE_H = 600;
export const LINE = 28;         // 页面行距（与 CSS --line 一致，手写字要落在横线上）

export const SLOT_LINES = 18;   // 每页可写的行数（18 × 28px = 504px）
export const TOC_PER_PAGE = 16; // 目录每页最多几行
export const HEAD_ROWS = 2;     // 首页标题占掉的行数

export const CAT_NAME = { web: '网站', social: '社交', email: '邮箱', bank: '银行', work: '工作', other: '其他' };
export const CAT_COLOR = { web: '#4b7bec', social: '#07c160', email: '#5d9cec', bank: '#eb4d4b', work: '#f7b731', other: '#8f959e' };

// ---------- 演示数据（明显是假数据，仅用于看效果） ----------
export const DEMO = {
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
export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rnd(seed) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }
export function jit(seed, amp, unit) { return ((rnd(seed) * 2 - 1) * amp).toFixed(2) + unit; }

export const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 数据 ----------
export function normalize(raw) {
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

/** 一条占几行：标题行 + 账号 + 密码 + 网址 + 备注 */
export function entryLines(it) {
  let n = 1;                                   // 标题行
  if (it.username) n++;
  n++;                                         // 密码行（始终有）
  if (it.url) n++;
  if (it.notes) n++;
  return n;
}

/**
 * 分页：把条目按"正好落在横线网格上"装进各页，再插封面 / 扉页 / 目录 / 尾页 / 封底。
 * editingId：正在写的那一条独占一整页（一页纸上写一条）。
 * 返回 { pages, pageOfItem }（pageOfItem = 条目 id → 页码）。
 */
export function paginate(items, editingId) {
  const list = Array.isArray(items) ? items : [];

  // 1) 装箱
  const chunks = [];
  let cur = [];
  let used = 0;
  list.forEach((it) => {
    // 条目占的行：标题行 + 各字段行 + 分隔行(1)
    // 正在写的那一条独占一整页：一页纸上写一条
    if (editingId && it.id === editingId) {
      if (cur.length) { chunks.push(cur); cur = []; }
      chunks.push([it]);
      used = 0;
      return;
    }
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
  let tocPageCount = Math.max(1, Math.ceil(list.length / TOC_PER_PAGE) || 1);
  const contentNo = (i) => 3 + tocPageCount + i;
  const pageOfItem = new Map();
  chunks.forEach((chunk, i) => chunk.forEach((it) => {
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
  chunks.forEach((chunk, i) => pages.push({ type: 'entries', items: chunk, first: i === 0, ids: chunk.map((x) => x.id) }));
  pages.push({ type: 'tailnote' });
  // 封底要单独落在左边那页：总页数必须是偶数，先补白页
  while (pages.length % 2 === 0) pages.push({ type: 'blank' });
  pages.push({ type: 'backcover' });                 // 最后一页

  return { pages, pageOfItem };
}
