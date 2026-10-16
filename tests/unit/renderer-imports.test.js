'use strict';
// 守渲染层的模块边界：
//  1) ES module 的相对 import 必须指到真实文件（这次就栽在少写一层目录上）
//  2) 界面只认 window.vaultAPI / winAPI，不许直接碰 IPC 内部对象
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'renderer');

function jsFiles(dir) {
  const out = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((f) => {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (f.name !== 'vendor') jsFiles(p).forEach((x) => out.push(x));
    } else if (/\.(js|html)$/i.test(f.name)) {
      out.push(p);
    }
  });
  return out;
}

function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  const specs = new Set();
  const re = /(?:^|\n)\s*(?:import|export)[^'"\n]*from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) specs.add(m[1]);
  return Array.from(specs);
}

test('renderer 下所有相对 import 都能落到真实文件', () => {
  const bad = [];
  jsFiles(RENDERER).forEach((file) => {
    importsOf(file).forEach((spec) => {
      if (!spec.startsWith('.')) return;
      if (!fs.existsSync(path.resolve(path.dirname(file), spec))) {
        bad.push(path.relative(ROOT, file) + ' → ' + spec);
      }
    });
  });
  assert.deepStrictEqual(bad, [], '这些 import 指不到文件：\n' + bad.join('\n'));
});

test('渲染层不许直接碰 ipcRenderer / contextBridge', () => {
  const bad = jsFiles(RENDERER).filter((f) => /ipcRenderer|contextBridge/.test(fs.readFileSync(f, 'utf8')));
  assert.deepStrictEqual(bad.map((f) => path.relative(ROOT, f)), []);
});
