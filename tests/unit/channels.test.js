'use strict';
// 守住一条边界：preload 里内联的通道名不能和 shared/channels.js 漂开
// （"渲染层不许碰 ipcRenderer" 由 renderer-imports.test.js 守）
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const channels = require('../../src/shared/channels');

const ROOT = path.join(__dirname, '..', '..');
const PRELOAD = path.join(ROOT, 'src', 'preload.js');

function declaredChannels() {
  const out = [];
  Object.keys(channels).forEach((group) => {
    const g = channels[group];
    Object.keys(g).forEach((k) => out.push(g[k]));
  });
  return out;
}

test('preload 里内联的通道名和 shared/channels.js 完全一致', () => {
  const src = fs.readFileSync(PRELOAD, 'utf8');
  const used = new Set((src.match(/'[a-z]+:[A-Za-z]+'/g) || []).map((s) => s.slice(1, -1)));
  assert.deepStrictEqual(
    Array.from(used).sort(),
    declaredChannels().slice().sort()
  );
});
