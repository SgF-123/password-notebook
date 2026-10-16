'use strict';
// 手写本子的排版引擎单测：renderer/notebook/model.js 是纯函数（node --test 直接跑）
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { pathToFileURL } = require('url');

const MODEL = pathToFileURL(path.join(__dirname, '..', '..', 'renderer', 'notebook', 'model.js')).href;

const load = () => import(MODEL);

test('normalize：缺字段补上，分类不认识就归到 other，按分类 + 标题排序', async () => {
  const { normalize } = await load();
  const data = normalize({
    owner: 'FRee',
    items: [
      { id: 'b', title: 'b 站的账号', category: '社交' },     // 中文分类 → 不认识
      { id: 'a', title: 'AAA', category: 'work' },
      { id: 'c', title: 'CCC', category: 'work' }
    ]
  });
  assert.strictEqual(data.owner, 'FRee');
  assert.deepStrictEqual(data.items.map((x) => x.id), ['a', 'c', 'b']);   // work 在前，other 在后
  assert.strictEqual(data.items[2].category, 'other');
  assert.strictEqual(data.items[2].password, '');
  assert.strictEqual(data.items[0].favorite, false);
});

test('normalize：没有数据也不炸，给一本空本子', async () => {
  const { normalize } = await load();
  const data = normalize(null);
  assert.deepStrictEqual(data.items, []);
  assert.strictEqual(data.owner, '本子主人');
});

test('entryLines：一条占几行按字段算（密码行始终占一行）', async () => {
  const { entryLines } = await load();
  assert.strictEqual(entryLines({ title: 'x', password: 'p' }), 2);
  assert.strictEqual(entryLines({ title: 'x', password: 'p', username: 'u', url: 'u', notes: 'n' }), 5);
});

test('paginate：一本书该有的页都在，页码对得上', async () => {
  const { paginate, entryLines, SLOT_LINES } = await load();
  const items = [
    { id: 'a', title: 'A', password: 'p', category: 'web' },
    { id: 'b', title: 'B', password: 'p', category: 'web' }
  ];
  const { pages, pageOfItem } = paginate(items, null);

  assert.strictEqual(pages[0].type, 'cover');
  assert.strictEqual(pages[1].type, 'flyleaf');
  assert.strictEqual(pages[2].type, 'toc');
  assert.strictEqual(pages[pages.length - 1].type, 'backcover');
  assert.strictEqual(pages.length % 2, 0, '总页数要凑成偶数，封底才落在左边那页');

  // 目录里记的页码 = pageOfItem 里记的页码 = 内容页真实位置
  const tocRows = pages[2].rows;
  assert.strictEqual(tocRows.length, 2);
  tocRows.forEach((row) => {
    assert.strictEqual(pageOfItem.get(row.it.id), row.page);
    const page = pages[row.page - 1];
    assert.strictEqual(page.type, 'entries');
    assert.ok(page.items.some((x) => x.id === row.it.id));
  });

  // 条目占的行不能撑破一页
  pages.filter((p) => p.type === 'entries').forEach((p) => {
    const used = p.items.reduce((n, it) => n + entryLines(it) + 1, 0);
    assert.ok(used <= SLOT_LINES + 1, '装页超了：' + used);
  });
});

test('paginate：正在写的那一条独占一整页', async () => {
  const { paginate } = await load();
  const items = [
    { id: 'a', title: 'A', password: 'p', category: 'web' },
    { id: 'b', title: 'B', password: 'p', category: 'web' }
  ];
  const { pages } = paginate(items, 'b');
  const entryPages = pages.filter((p) => p.type === 'entries');
  assert.strictEqual(entryPages.length, 2, '一条一边页');
  entryPages.forEach((p) => assert.strictEqual(p.items.length, 1));
});
