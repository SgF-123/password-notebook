'use strict';
/**
 * 路径解析：程序的「数据放哪儿」只有这一处说了算。
 *
 * 优先级：
 *   1) 环境变量 VAULT_DATA_DIR（测试脚本、便携用法都走这个）
 *   2) 安装版：exe 同级的 data\（装到哪个盘，数据就在哪个盘）
 *      例外：macOS 的 .app 包内只读，改放 ~/Library/Application Support/密码本/data
 *   3) 开发时：仓库根目录下的 data\
 */

const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');   // src/main -> 仓库根
const ENV_DATA_DIR = 'VAULT_DATA_DIR';

function electronApp() {
  try {
    const { app } = require('electron');
    return app || null;
  } catch (e) {
    return null;   // 不在 Electron 里跑（比如单测）
  }
}

function isPackaged() {
  const app = electronApp();
  return !!(app && app.isPackaged);
}

function isMac() {
  return process.platform === 'darwin';
}

/** 「程序旁边」：安装版是 exe 同级目录，开发时是仓库根 */
function baseDir() {
  const app = electronApp();
  if (app && app.isPackaged) {
    try { return path.dirname(app.getPath('exe')); } catch (e) { /* 忽略 */ }
  }
  return REPO_ROOT;
}

/** 保险库文件所在目录 */
function getDataDir() {
  if (process.env[ENV_DATA_DIR]) return process.env[ENV_DATA_DIR];

  const app = electronApp();
  if (isPackaged() && isMac() && app) {
    try { return path.join(app.getPath('userData'), 'data'); } catch (e) { /* 忽略 */ }
  }
  return path.join(baseDir(), 'data');
}

/** Electron 自己的缓存目录（删掉不影响密码）。
 *  非 macOS：data\userdata，别往 C 盘 AppData 写；macOS 返回 null = 用系统默认。 */
function getUserDataDir() {
  if (isMac()) return null;
  return path.join(baseDir(), 'data', 'userdata');
}

function ensureDir(dir) {
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  REPO_ROOT,
  ENV_DATA_DIR,
  isPackaged,
  isMac,
  baseDir,
  getDataDir,
  getUserDataDir,
  ensureDir
};
