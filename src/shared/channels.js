'use strict';
/**
 * IPC 通道名单的唯一来源（main 侧引用）。
 *
 * 注意：渲染进程开着 sandbox，preload 在沙箱里不能 require 本地文件，
 * 所以 src/preload.js 里内联了一份同样的字符串。
 * 两边对不对得上，由 tests/unit/channels.test.js 兜底。
 */

module.exports = {
  VAULT: {
    exists: 'vault:exists',
    create: 'vault:create',
    unlock: 'vault:unlock',
    verify: 'vault:verify',
    load: 'vault:load',
    save: 'vault:save',
    changeMaster: 'vault:changeMaster',
    lock: 'vault:lock'
  },
  CLIP: {
    write: 'clip:write'
  },
  SHELL: {
    openExternal: 'shell:openExternal'
  },
  WIN: {
    minimize: 'win:minimize',
    toggleMaximize: 'win:toggleMaximize',
    close: 'win:close',
    isMaximized: 'win:isMaximized',
    state: 'win:state'
  }
};
