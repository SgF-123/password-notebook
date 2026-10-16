'use strict';
/**
 * 保险库文件读写：只认路径，不认 Electron，不认 IPC。
 *
 * 写盘是「临时文件 -> fsync -> 改名覆盖」：中途断电/崩溃不会留下写了一半的烂文件；
 * 覆盖之前还会留一份 vault.dat.bak（改主密码这种操作写坏了好回退）。
 */

const fs = require('fs');
const path = require('path');
const { CODES, fail } = require('./errors');

const BACKUP_SUFFIX = '.bak';
const TEMP_SUFFIX = '.tmp';

function backupPath(file) {
  return file + BACKUP_SUFFIX;
}

function vaultFileExists(file) {
  return fs.existsSync(file);
}

/** 读 + 解析；文件不存在返回 null */
function readVaultFile(file) {
  if (!vaultFileExists(file)) return null;

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail(CODES.IO, '读取保险库失败：' + e.message, e);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    fail(CODES.CORRUPT, '保险库文件不是合法 JSON', e);
  }
}

/** 原子写：临时文件 + fsync + 改名；原文件先拷一份 .bak */
function writeVaultFile(file, obj) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  } catch (e) {
    fail(CODES.IO, '建数据目录失败：' + e.message, e);
  }

  if (vaultFileExists(file)) {
    try {
      fs.copyFileSync(file, backupPath(file));
    } catch (e) {
      // 备份失败不该拦住保存
    }
  }

  const tmp = file + TEMP_SUFFIX;
  const text = JSON.stringify(obj, null, 2);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
  } catch (e) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) { /* 忽略 */ }
      fd = undefined;
    }
    try { fs.unlinkSync(tmp); } catch (_) { /* 忽略 */ }
    fail(CODES.IO, '写保险库失败：' + e.message, e);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) { /* 忽略 */ }
    }
  }

  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* 忽略 */ }
    fail(CODES.IO, '替换保险库失败：' + e.message, e);
  }
}

module.exports = {
  BACKUP_SUFFIX,
  TEMP_SUFFIX,
  backupPath,
  vaultFileExists,
  readVaultFile,
  writeVaultFile
};
