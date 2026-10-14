# 密码本 — 本地加密的手写密码本

**解锁之后直接翻开一本手写密码本**：登录界面（主密码 / scrypt 派生）和后端（主进程里的
AES-256-GCM 加密引擎）合成同一个软件 —— 输完主密码，窗口里就是一本摊在桌上的本子，
一页写一条密码，可以用鼠标或方向键翻页、点目录跳页，也能随时在"本子"上再写一条。
**数据不会上传到任何服务器**。

## 功能

- 🔐 主密码解锁：scrypt 密钥派生 + AES-256-GCM 加密存储
- 🎬 登录 → 翻开本子：解锁屏淡出、书桌淡入、本子轻轻"落"到桌面上，控制条随后升起
- 📖 解锁即进本子：封面 → 扉页 → 目录 → 一页一条密码 → 封底，turn.js 仿真翻页（四角都能拖）
- ✍️ 在本子上写：底部「＋ 写一条」（Ctrl+N）开写，双击本子里某一条直接改，写完自动翻到那一页
- 🧭 目录点一行就跳到那一页；点密码那行 = 复制这条密码
- 🪟 无边框窗口 + 自绘标题栏（最小化 / 最大化 / 关闭）+ 单实例，就是一个独立的小软件
- 📋 编辑面板里能复制密码、一键打开网址
- ⚡ 内置强密码生成器（长度、字符集可调）
- ⭐ 常用标记（★ 会画在本子上）、「遮住密码」一键打码
- ⏱️ 闲置自动锁定（可配置 1~30 分钟或从不）
- 🔑 支持修改主密码

## 运行

```bash
npm install        # 首次
npm start          # 启动应用
```

## 打包成 exe

```bash
npm run build
```

安装包输出在 `dist/` 目录。

> 打包需要的缓存默认写在项目里：`ELECTRON_CACHE=.electron-cache ELECTRON_BUILDER_CACHE=.electron-builder-cache npm_config_cache=.npm-cache npm run build`
> （清掉这三个目录后，下次打包会重新下载 Electron 发行包，约 115 MB。）

## 打包 macOS 版

### 路线一（在 Windows 上就能做）：出一个 Mac 用户双击能跑的 .app（放在 zip 里）

```bash
# 1) 用官方 packager 跨平台打包（arm64 = Apple Silicon，x64 = Intel）
npx --yes @electron/packager@18 . 密码本 --platform=darwin --arch=arm64 --out=dist-mac --overwrite \
  --asar --prune=true --app-bundle-id=com.free.passwordnotebook --app-version=1.0.0 \
  --ignore="^/(dist|dist-mac|work|_backup|data|data-test|\.electron-cache|\.electron-builder-cache|\.npm-cache|\.github)" \
  --ignore="^/(dev-test\.js|notebook-preview\.js|README\.md|package-lock\.json)$"

# 2) 收拾 .app 并打成 zip（修 Info.plist / 图标，保留符号链接与可执行位）
node work/pack-mac.js dist-mac/密码本-darwin-arm64 1.0.0 arm64
```

产出 `dist-mac/密码本-1.0.0-arm64-mac.zip`（换 `--arch=x64` 再跑一遍就是 Intel 版）。

> 为什么还要自己写 `work/pack-mac.js`：Windows 上的解压/压缩会弄坏 macOS 应用的三样东西 ——
> 框架里的**符号链接**（会被写成反斜杠文本或展开成副本）、**可执行位**（Windows 没有这个概念）、
> **UTF-8 文件名**（PowerShell 的 Compress-Archive 按 ANSI 编码写）。这个脚本自己写 zip，
> 把这三样都按 macOS 的要求写进去，末尾还会回读校验一遍。
>
> 另外它会把 `Info.plist` 里的图标换成 `icon.icns`（`build/icon.icns`，由 `work/make-icns.js` 从 1024 的 `build/icon.png` 生成）、
> 分类改成 productivity，并把 `ElectronAsarIntegrity` 的键修正成 macOS 认的 `Resources/app.asar`。

### 路线二（在 Mac 或 CI 上）：要 .dmg 安装包

**Windows 上打不了 dmg** —— electron-builder 会直接拒绝：

```
⨯ Build for macOS is supported only on macOS, please see https://electron.build/multi-platform-build
```

项目已经做好 macOS 适配，拿到 Mac（或 CI 上的 macOS runner）后一条命令就出 dmg：

```bash
npm ci
npm run build:mac          # 出 dist/密码本-1.0.0-arm64.dmg + -x64.dmg（外带 zip）
npm run build:mac:arm64    # 只出 Apple Silicon 版
```

macOS 上专门适配了这些（Windows 行为不变，都走 `process.platform` / `.is-mac` 分支）：

| 项 | macOS 上的做法 |
| --- | --- |
| 窗口 | `titleBarStyle: 'hiddenInset'`，用系统原生红黄绿灯（左上角），自绘的那三个窗口按钮自动隐藏 |
| 菜单 | 保留最小菜单（appMenu / editMenu / windowMenu），否则 ⌘Q 退出、输入框里的 ⌘C / ⌘V 会失效 |
| 快捷键 | ⌘N 写一条、⌘S 保存、⌘L 合上本子（Windows 上仍是 Ctrl） |
| 密码库位置 | `~/Library/Application Support/密码本/data/vault.dat`（`.app` 包内只读，不能放里面） |
| 图标 | `build/icon.png`（1024×1024，打包时自动转成 icns） |

**没有 Mac 也能出包**：`.github/workflows/build-mac.yml` 是现成的 GitHub Actions（跑在 macOS runner 上）。
把项目 `git init` 推到自己的 GitHub 仓库，然后在 Actions 里点「打包 macOS 版 → Run workflow」，跑完直接下载 dmg。

没有 Apple 开发者证书时包是**未签名**的，别人第一次打开会提示"无法验证开发者"：
右键 → 打开，或 `xattr -dr com.apple.quarantine /Applications/密码本.app`。
要正式对外分发，需要 Apple Developer ID 签名 + 公证（99 美元/年）。

> 上面路线一产出的 zip 同样是**未签名**的，zip 里已经放了一份 `首次打开请看这里.txt` 说明这一步。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl+N` | 在本子上新写一条 |
| `Ctrl+S` | 保存编辑面板里正在改的那一条 |
| `Ctrl+L` | 合上本子（立即锁定） |
| `←` / `→` | 本子上翻上一页 / 下一页（`Home` / `End` 到首尾） |
| `Esc` | 关掉弹窗 / 编辑面板（「写一条」没保存就关掉，不会留下空条目） |

## 数据存储

加密保险库文件名为 `vault.dat`，存放位置：

- **开发运行**（`npm start`）：项目根目录 `data/vault.dat`
- **安装版**：exe 同级目录的 `data/vault.dat`（便携式，装到哪个盘数据就在哪个盘）
- 也可通过环境变量 `VAULT_DATA_DIR` 自定义数据目录

> ⚠️ 请务必备份 `vault.dat`。它是全密文，**必须配合主密码**才能解密；主密码一旦遗忘将无法找回。

## 测试

```bash
npx electron dev-test.js    # 端到端功能测试（解锁→过渡动画→翻页/目录跳页/写一条/改这条/遮住密码/生成器/设置/锁定/删除/快捷键等 30 项）
```

> 测试用独立数据目录 `data-test/`，不会碰你自己的 `data\vault.dat`。

## 界面：登录 → 手写密码本

窗口是**一个**：无边框 + 自绘标题栏（左边密码本 logo，右边 ⚡生成器 / ⚙设置 / 🔒合上本子 + 最小化 / 最大化 / 关闭，
可拖动）；再加一层**单实例**锁，双击第二次只是把已有窗口叫到前面来。

解锁的那一下有个短过渡：解锁屏淡出（带一点模糊和放大）→ 底下的书桌淡入 → 本子从稍小稍低的位置轻轻"落"到桌面上
→ 底部控制条跟着升起（约 0.9 秒；系统里开了"减少动态效果"就自动不动画）。

用的是 `renderer/notebook/` 那本手写本子，现在直接嵌在主窗口里（不是单独的窗口/网页）：

| 部位 | 内容 |
| --- | --- |
| 书 | 封面（署名 = 设置里的「本子署名」）→ 扉页 → 目录（点一行跳页）→ 内容页（一页一条）→ 留白页 → 封底 |
| 翻页 | 四个角都能拖，或 `← / →`（Home / End 到首尾），`上一页 / 下一页` 也行 |
| 底部控制条 | `＋ 写一条`（Ctrl+N）、`改这条`（改当前对开页那一条）、`目录`、`遮住密码`、`音效`、页码牌 |
| 写 / 改 | 都是同一个编辑面板（标题 / 账号 / 密码 / 网址 / 备注 / 分类 / 常用，能复制密码、一键打开网址），保存后本子重排并**自动翻到刚写的那一页** |
| 本子上直接点 | 点密码那行 = 复制这条密码；点目录某一行 = 跳到那一页；双击某一条 = 打开编辑面板改它 |

- 代码：`renderer/chat.css`（外壳：标题栏 / 过渡动画 / 把本子收进窗口）、`renderer/app.js`（解锁、挂本子、写/改、设置）、
  `renderer/notebook/notebook.js`（本子分页 / 翻页 / 页内点击 / `window.__mountNotebook()` 重挂）
- 截图：`work/shots/client/`，截图脚本 `work/shot-client.js`
- 改版前（卡片网格 + 本子单独窗口）的 `index.html` / `styles.css` / `app.js` / `main.js` / `preload.js` 在
  `_backup/before-chat-ui/`，回退说明见该目录的 `README.md`

## 登录 / 解锁界面

解锁屏的版式取自 GitHub 上的开源登录页模板并做了本地化改造：

- **来源**：[ui-code/ModernLoginPage](https://github.com/ui-code/ModernLoginPage)（MIT）——
  左侧「胶囊装饰面板」+ 右侧「带图标圆角字段」的登录表单结构；
  布局参考了 [mazipan/login-page-css](https://github.com/mazipan/login-page-css)（MIT）的左右分栏做法。
- **改动**：配色换成密码本的品牌绿（深绿渐变面板 + 胶囊装饰 + 绿色渐变主按钮），
  去掉模板里的 CDN 图标字体（remixicon）与 Google Fonts，改用内联 SVG 与系统字体，
  以符合页面 CSP（`default-src 'self'`）并保证离线可用。
- **保留**：动画小人（`renderer/characters.js`）仍是左栏的主角，随输入 / 显示密码做反应。
- **备份**：改造前的 `index.html` / `styles.css` / `app.js` 在
  `_backup/login-before-redesign/`，回退见该目录的 `README.md`。

截图（`work/shots/`）：`lock-create.png`（首次创建）、`lock-unlock.png`（解锁）、`lock-error.png`（密码错误）。

## 手写密码本（仿真翻页视图）

`renderer/notebook/` 是一本"摊在桌上的手写本子"：封面 / 扉页 / 目录 / 一页一条密码 /
封底，翻页用 **turn.js** 做真实纸张翻页（四角都能拖、纸面卷曲、投影、快速甩页）。

现在这本子就是**解锁后的主界面**（嵌在主窗口里，见上一节）；另外还能单独打开当预览：

```bash
npm run notebook
```

要点：

- 翻页交给 turn.js，页面尺寸随窗口自适应；页内排版固定 440×600，靠 `--fit` 等比缩放，
  所以拖拽坐标和排版不会打架。
- 第 1 页是封面（单独立在右边），最后一页是封底（单独落在左边），中间都是双页对开。
- 数据接口：`window.__mountNotebook({ owner, items[] })` 重排并挂上一本（数据变了就调它）；
  单独打开预览时不给数据就用自带演示数据。`window.__nb` 暴露 `pages / pageOf(id) / gotoPage / fit / setMasked` 等。
- 嵌进主窗口时本子的 `.desk/.stage/.hud/.toast` 会收进 `#screen-book`（`renderer/chat.css` 里覆盖 position），
  所以它不会盖住标题栏、也不会影响列表视图。
- 目录点击跳页、点密码复制、遮住密码、翻页音效、`←/→` 翻页都还在。

### 背景板（桌面皮肤）

书桌背景的**默认皮肤是「暖橡木桌面 + 米白皮质桌垫」**（`.desk` 木纹 + `.mat` 皮垫），
写在 `renderer/notebook/variants.css` 里。另外备了两套皮肤：

| 代码 | 桌面 | 桌垫 |
| --- | --- | --- |
| 默认（A） | 暖橡木 | 米白皮质 |
| `B` | 极简水泥灰 | 磨砂石板 |
| `C` | 石墨深灰 | 暖灰皮革 |

切换方式：

```js
// 预览时直接加查询参数
renderer/notebook/index.html?variant=B
// 或在运行时切换（清空 = 回默认）
window.__applyVariant('B'); window.__applyVariant('');
```

### 第三方库

| 库 | 版本 | 用途 | 授权 |
| --- | --- | --- | --- |
| [turn.js](https://github.com/blasten/turn.js)（Emmanuel Garcia） | 3rd release | 仿真翻页引擎 | 个人非商业用途免费（见 `renderer/notebook/vendor/turn.js-LICENSE.txt`） |
| [jQuery](https://jquery.com) | 1.12.4 | turn.js 的依赖 | MIT |

两个文件都放在 `renderer/notebook/vendor/`，离线可用（页面 CSP 只允许本地脚本）。

## 目录结构

```
├─ main.js            # 主进程：无边框窗口 + 窗口控制 IPC + 单实例 + AES-256-GCM 加密存储引擎
├─ preload.js         # 安全桥接层（contextBridge：vaultAPI 保险库 + winAPI 窗口控制）
├─ renderer/
│  ├─ index.html      # 界面结构：解锁屏 + #screen-app（密码本 / 列表两个视图）+ 编辑面板 + 弹窗
│  ├─ styles.css      # 解锁屏 + 抽屉/弹窗等共用样式
│  ├─ chat.css        # 程序外壳（标题栏 / 视图切换）+ 列表视图 + 本子嵌进窗口后的收敛样式
│  ├─ app.js          # 渲染逻辑（解锁 → 挂本子、写/改、视图切换、列表渲染、设置）
│  ├─ characters.js   # 解锁屏动画小人
│  ├─ notebook/       # 手写密码本（turn.js 仿真翻页）——既是主界面，也能单独预览
│  │  ├─ index.html   # 单独预览用（npm run notebook）
│  │  ├─ notebook.js  # 分页 / 排版 / 翻页接线 / window.__mountNotebook()
│  │  ├─ notebook.css  # 版式 / 纸面 / 控制条
│  │  ├─ variants.css  # 背景板皮肤（默认暖橡木，另有 B/C）
│  │  └─ vendor/      # jQuery 1.12.4 + turn.js（本地）
│  └─ assets/icon.png # 应用图标
├─ work/              # 开发用脚本与截图（shot-client.js 出图，look.js / verify.js 看本子）
└─ data/vault.dat     # 运行时生成的加密保险库
```
