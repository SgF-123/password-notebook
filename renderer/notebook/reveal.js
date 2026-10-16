/* 看一眼这条密码：点眼睛 → 输主密码 → 验过才显示。
   对话框做在本子里（不依赖 app 层的弹窗），所以单独预览这一页时也能用。
   验证走 options.verify（app 层传进来：window.vaultAPI.verifyMaster）。
   密码不对就把话写在框里，让用户接着输；取消返回 null。 */

export function askMasterPassword(options) {
  const opts = options || {};

  return new Promise((resolve) => {
    const host = document.getElementById('bookWrap') || document.body;

    const mask = document.createElement('div');
    mask.className = 'ask-mask';
    mask.innerHTML = `
      <div class="ask-box" role="dialog" aria-modal="true">
        <div class="ask-title">看一眼这条密码</div>
        <div class="ask-sub">输入本子的主密码，验过就把这条显示出来</div>
        <input class="ask-input" type="password" placeholder="主密码" autocomplete="off" spellcheck="false" />
        <div class="ask-err"></div>
        <div class="ask-row">
          <button type="button" class="ask-btn ask-btn--cancel">不看了</button>
          <button type="button" class="ask-btn ask-btn--ok">看</button>
        </div>
      </div>`;
    host.appendChild(mask);

    const input = mask.querySelector('.ask-input');
    const errBox = mask.querySelector('.ask-err');
    const okBtn = mask.querySelector('.ask-btn--ok');
    const cancelBtn = mask.querySelector('.ask-btn--cancel');

    let settled = false;
    let busy = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      mask.remove();
      resolve(value);
    };

    const submit = async () => {
      if (busy) return;
      const value = input.value;
      if (!value) {
        errBox.textContent = '请输入主密码';
        input.focus();
        return;
      }
      if (typeof opts.verify !== 'function') { finish(value); return; }

      busy = true;
      okBtn.disabled = true;
      errBox.textContent = '';
      let ok = false;
      try { ok = await opts.verify(value); } catch (e) { ok = false; }
      busy = false;
      okBtn.disabled = false;

      if (!ok) {
        errBox.textContent = '主密码不对，再试一次';
        input.select();
        input.focus();
        return;
      }
      finish(value);
    };

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', () => finish(null));
    mask.addEventListener('mousedown', (e) => { if (e.target === mask) finish(null); });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();            // 别让本子的方向键/回车翻页
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    });

    setTimeout(() => input.focus(), 30);
  });
}
