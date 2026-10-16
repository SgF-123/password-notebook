'use strict';
/**
 * 统一错误码。
 * 规矩：core 层只抛 VaultError，不关心怎么给界面看；
 * IPC 层负责把它翻成界面认的 { ok:false, error, code }。
 */

const CODES = {
  NOT_FOUND: 'NOT_FOUND',           // 保险库文件不存在
  ALREADY_EXISTS: 'ALREADY_EXISTS', // 想新建，但已经有了
  BAD_PASSWORD: 'BAD_PASSWORD',     // 主密码不对（GCM 校验不过）
  CORRUPT: 'CORRUPT',               // 文件读不出内容 / 版本比程序新 / 不是合法 JSON
  LOCKED: 'LOCKED',                 // 还没解锁就要读写
  IO: 'IO',                         // 磁盘读写失败
  BAD_INPUT: 'BAD_INPUT'            // 传进来的参数不像话
};

const MESSAGES = {
  NOT_FOUND: '保险库不存在',
  ALREADY_EXISTS: '保险库已存在',
  BAD_PASSWORD: '主密码错误',
  CORRUPT: '保险库文件读不出来',
  LOCKED: '未解锁',
  IO: '读写失败',
  BAD_INPUT: '参数不合法'
};

class VaultError extends Error {
  constructor(code, message, cause) {
    super(message || MESSAGES[code] || '未知错误');
    this.name = 'VaultError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/** 抛一个 VaultError（省得每次 new + throw 两行） */
function fail(code, message, cause) {
  throw new VaultError(code, message, cause);
}

/** 给界面看的文案：VaultError 用自带文案，别的错误原样透出 */
function messageOf(err) {
  if (!err) return MESSAGES.IO;
  if (err instanceof VaultError) return err.message;
  return err.message || MESSAGES.IO;
}

module.exports = { CODES, MESSAGES, VaultError, fail, messageOf };
