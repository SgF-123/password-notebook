# 回退说明：改成「会话式客户端 / 解锁即进本子」之前的主界面

这一份是 2026-10-14 两次界面改造**之前**的原始文件（那次是从"卡片网格 + 本子单独窗口"
改成"会话式客户端"，随后又改成"解锁直接进手写本子"）。也就是说：想回到最初那版
（解锁后进卡片网格，本子另开窗口看），恢复这五个文件就对。

| 文件 | 改版前是什么样 |
| --- | --- |
| `index.html` | 主界面是顶部工具栏 + 分类标签 + 卡片网格；没有右侧会话区、没有自绘标题栏 |
| `styles.css` | 含工具栏 / 分类标签 / 卡片网格 / 空状态等样式（这些后来挪到了 `chat.css`） |
| `app.js` | 渲染卡片网格、详情抽屉（查看 + 编辑）、设置、生成器；没有导航栏 / 会话区逻辑 |
| `main.js` | 普通带系统边框的窗口（`frame` 默认），没有窗口控制 IPC，没有单实例锁 |
| `preload.js` | 只暴露 `vaultAPI`，没有 `winAPI`（窗口最小化 / 最大化 / 关闭） |

## 怎么退回去

```powershell
# 主界面三件套回到 renderer\
Copy-Item _backup\before-chat-ui\index.html,_backup\before-chat-ui\styles.css,_backup\before-chat-ui\app.js renderer\ -Force
# 主进程两个文件回到项目根目录
Copy-Item _backup\before-chat-ui\main.js,_backup\before-chat-ui\preload.js . -Force
# 新外壳样式不再被引用，删掉即可
Remove-Item renderer\chat.css
```

退回后窗口会恢复成系统边框（不再是自绘标题栏），主界面回到卡片网格。

> 注意：`_backup\before-chat-ui\styles.css` 里还留着工具栏 / 卡片网格那一段样式，
> 而现在的 `styles.css` 已经把它删掉了 —— 所以要么整个覆盖回去，要么两边别混用。
