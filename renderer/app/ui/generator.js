/* 密码生成器弹窗：生成 / 换一个 / 复制 / 填进正在写的那一条 */

import { byId, generatePassword } from '../lib.js';
import { copyText, toast } from '../toast.js';

let genTarget = null;   // 从编辑页的 ⚡ 打开时，指向那个密码输入框

export function openGenerator(targetInput) {
  genTarget = targetInput || null;
  byId('#gen-modal').classList.remove('hidden');
  byId('#gen-backdrop').classList.remove('hidden');
  regenPassword();
}

export function closeGenerator() {
  byId('#gen-modal').classList.add('hidden');
  byId('#gen-backdrop').classList.add('hidden');
}

export function regenPassword() {
  const len = Number(byId('#gen-length').value);
  byId('#gen-length-val').textContent = len;
  byId('#gen-password').value = generatePassword(len, {
    upper: byId('#gen-upper').checked,
    lower: byId('#gen-lower').checked,
    digit: byId('#gen-digit').checked,
    symbol: byId('#gen-symbol').checked
  });
}

export function bindGeneratorEvents() {
  byId('#gen-refresh').addEventListener('click', regenPassword);
  byId('#gen-copy').addEventListener('click', () => copyText(byId('#gen-password').value));
  byId('#gen-length').addEventListener('input', regenPassword);
  ['gen-upper', 'gen-lower', 'gen-digit', 'gen-symbol'].forEach((id) => {
    byId('#' + id).addEventListener('change', regenPassword);
  });
  byId('#gen-use').addEventListener('click', async () => {
    const pwd = byId('#gen-password').value;
    if (genTarget) {
      genTarget.value = pwd;
      closeGenerator();
      toast('已填入密码');
      return;
    }
    closeGenerator();
    await copyText(pwd, '新密码已复制');
  });
  byId('#gen-close').addEventListener('click', closeGenerator);
  byId('#gen-backdrop').addEventListener('click', closeGenerator);
}
