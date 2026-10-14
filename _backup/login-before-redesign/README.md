# 登录界面改造前的快照

2026-10-14 把解锁 / 创建界面（`#screen-lock`）换成新版式前的原始文件备份。

## 这里存的是什么

| 文件 | 说明 |
| --- | --- |
| `index.html` | 改造前的 `renderer/index.html`（含旧版解锁屏结构：`.lock-left` + `.lock-right`） |
| `styles.css` | 改造前的 `renderer/styles.css`（旧 `.lock-*` 样式 + 旧的窄屏媒体查询） |
| `app.js` | 改造前的 `renderer/app.js`（`init()` 里切换的是 `#lock-confirm` 而不是 `#lock-confirm-wrap`） |

只有解锁屏相关片段与现版本不同，其他内容完全一致（`dev-test.js` 19 项全通过）。

## 怎么回退

把这三个文件覆盖回 `renderer/` 即可：

```powershell
Copy-Item _backup\login-before-redesign\index.html renderer\index.html -Force
Copy-Item _backup\login-before-redesign\styles.css renderer\styles.css -Force
Copy-Item _backup\login-before-redesign\app.js     renderer\app.js -Force
```
