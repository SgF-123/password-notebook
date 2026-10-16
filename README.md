# 密码本 — 本地加密的手写密码本

**解锁之后直接翻开一本手写密码本**：登录界面（主密码 / scrypt 派生）和后端（主进程里的
AES-256-GCM 加密引擎）合成同一个软件 —— 输完主密码，窗口里就是一本摊在桌上的本子，
一页写一条密码，可以用鼠标或方向键翻页、点目录跳页，也能随时在"本子"上再写一条。
**数据不会上传到任何服务器**。

## 功能

- 🔐 主密码解锁：scrypt 密钥派生 + AES-256-GCM 加密存储
- 🎬 登录 → 翻开本子：解锁屏淡出、书桌淡入、本子轻轻"落"到桌面上，控制条随后升起
- 📖 解锁即进本子：封面 → 扉页 → 目录 → 一页一条密码 → 封底，turn.js 仿真翻页（四角都能拖）
- ✍️ 在本子上写：底部「写一条」（Ctrl+N）翻到新的一页，标题 / 账号 / 密码 / 网址 / 备注直接写在纸上的横线里
- 🔁 改这条：双击纸上那一条，那一页就变成可以改的；不想留了就「撕掉这页」，一整条从本子上撕下来
- ✍️ 写/改都是一个"动作"：新写的那一页像抽出来的一张纸落下来、表格一行一行写出来；改这条是墨迹化开；
  写进本子、撕掉各有自己的收尾（系统里开了"减少动态效果"就不动）；翻到那一页是"翻过去"而不是跳过去
- 🧭 目录点一行就跳到那一页；点密码那行 = 复制这条密码
- 🪟 无边框窗口 + 自绘标题栏（最小化 / 最大化 / 关闭）+ 单实例，就是一个独立的小软件
- 📋 写在纸上的那一页能复制密码、一键打开网址、换个强密码
- ⚡ 内置强密码生成器（长度、字符集可调）
- ⭐ 常用标记（★ 会画在本子上）、「遮住密码」一键打码
- 👁 想看一眼某条密码：本子上那一条、或写在纸上的那一页，点 👁 输入主密码，验过才显示
  （只验密码不换会话；收起来时把明文从界面上清掉，点密码那行仍然是"复制"）
- 🔤 密码列用等宽阅读字体（0/O、1/l、5/S 一眼分得清）；本子上手写的那部分照旧
- 🈶 纸面上的字用国标楷体（`KaiTi` / `楷体_GB2312`），不依赖行楷、舒体这类"看运气"的字体
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
> 另外它会把 `Info.plist` 里的图标换成 `icon.icns`（`build/icon.icns`，由 `work/icons/apply-icon.js` 或 `work/make-icns.js` 从 1024 的 `build/icon.png` 生成）、
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

文件格式是带 KDF 参数的 v2（老版本写的 v1 文件照样能读）；写法是「临时文件 → fsync → 改名覆盖」，
每次覆盖前还会在同目录留一份 `vault.dat.bak`（最近一次的内容），写坏了好回退。

## 测试

```bash
npm test          # 单元测试：加密内核 / 保险库 / 数据模型 / IPC 通道一致性（node --test，不需要 Electron）
npm run test:e2e  # 端到端冒烟测试：真窗口里走一遍 创建 → 写一条 → 翻页/目录 → 改 → 设置 → 改主密码 → 撕掉
```

> 测试用独立数据目录 `data-test/`，不会碰你自己的 `data\vault.dat`。

## 代码结构（分层）

```
主进程（Electron）
  src/main/index.js       生命周期：单实例 / 菜单 / 开窗 / 收尾
  src/main/window.js      主窗口（无边框 + 自绘标题栏；macOS 走系统红黄绿灯）
  src/main/paths.js       数据放哪儿只有这里说了算（便携式 / macOS / VAULT_DATA_DIR）
  src/main/ipc/*          通道装配：把 core 抛的 VaultError 翻成界面认的 { ok, error, code }
          │  IPC
  src/preload.js          唯一的门：window.vaultAPI / window.winAPI（沙箱里只能 require('electron')）
          │
核心（不依赖 Electron，可以单独 node --test）
  src/core/crypto.js      scrypt 派生 + AES-256-GCM 加解密（v1 / v2 文件格式都读）
  src/core/vault-file.js  文件读写：临时文件 + fsync + 改名，覆盖前留 .bak
  src/core/vault.js       保险库本体：一个实例 = 一个 vault.dat + 一份会话状态
  src/core/schema.js      数据长什么样、存盘前的最后一道闸
  src/core/errors.js      统一错误码
  src/shared/channels.js  IPC 通道名单（和 preload 的一致性有单测兜底）
          │
界面（ES module，不需要 Node 权限）
  renderer/index.html     解锁屏 + 本子 + 弹窗（只留结构，逻辑都在模块里）
  renderer/app.js         渲染层入口：注册回调 → 绑事件 → boot()
  renderer/app/*          lib 小工具 / toast 提示 / store 会话数据 / items 写改撕 / book 本子桥
  renderer/app/ui/*       lock 解锁屏 / settings 设置 / generator 生成器 / titlebar 标题栏
  renderer/notebook/*     turn.js 手写本子：model 排版 / ink 字迹 / page 整页 / sheet 编辑页 /
                          reveal 看一眼的弹框 / timing 时间常量（JS 与 CSS 共用一处）/ notebook 引擎接线
```

一句话：界面只认 `window.vaultAPI`，主进程只认 `src/core`，加密和落盘那层完全不知道 Electron 的存在。

## 界面：登录 → 手写密码本

窗口是**一个**：无边框 + 自绘标题栏（左边密码本 logo，右边 ⚡生成器 / ⚙设置 / 🔒合上本子 + 最小化 / 最大化 / 关闭，
可拖动）；再加一层**单实例**锁，双击第二次只是把已有窗口叫到前面来。

解锁的那一下有个短过渡：解锁屏淡出（带一点模糊和放大）→ 底下的书桌淡入 → 本子从稍小稍低的位置轻轻"落"到桌面上
→ 底部控制条跟着升起（约 0.9 秒；系统里开了"减少动态效果"就自动不动画）。

用的是 `renderer/notebook/` 那本手写本子，现在直接嵌在主窗口里（不是单独的窗口/网页）：

| 部位 | 内容 |
| --- | --- |
| 书 | 封面（署名 = 设置里的「本子署名」）→ 扉页 → 目录（点一行跳页）→ 内容页（一页一条）→ 留白页 → 封底 |
| 翻页 | 四个角都能拖，或 `← / →`（Home / End 到首尾） |
| 底部控制条 | **没有按钮栏**：本子占满窗口 —— 翻页拖页角或 `← / →`；目录点书顶的红飘带；改某条双击它；遮住密码 / 翻页音效在「设置」里 |
| 写一条 | 标题栏那个绿色 `＋`（常驻），或 `Ctrl+N`（Mac ⌘N），或「写在最后一页」上那行「还想接着写？点这里」 |
| 写 / 改 | 翻到那一页直接在纸上写（标题 / 账号 / 密码 / 网址 / 备注 / 分类 / 常用，能复制密码、一键打开网址、换个强密码），保存后本子重排并**自动翻到刚写的那一页** |
| 本子上直接点 | 点密码那行 = 复制这条密码；点目录某一行 = 跳到那一页；双击某一条 = 那一页就地变成可改的（也能整条撕掉） |

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

## 应用图标

图标是**绿色圆角底 + 白色「书 + 锁」**：本子代表密码本，锁代表加密保管。
一次命令生成全部图标文件（1024 PNG / 多尺寸 ICO / 多尺寸 ICNS / 窗口图标）：

```bash
node_modules\.bin\electron.cmd work\icons\apply-icon.js            # 默认 book-lock
node_modules\.bin\electron.cmd work\icons\apply-icon.js notebook-gold   # 换设计
node_modules\.bin\electron.cmd work\icons\apply-icon.js paper --preview # 只出预览图
```

可选设计：`book-lock`（书+锁，默认）、`notebook-gold`（白本+金锁扣）、`notebook-keyhole`（合着的密码书）、
`open-book`（翻开的密码本）、`notebook-pen`（笔记本+笔）、`paper`（皮面本+钥匙孔）、`char`（原来的「本」）。
对照表见 `work/icons/sheet-options.png`（大图）与 `work/icons/sheet-small-sizes.png`（16~128px 真实尺寸）。

写入的四个文件：

| 文件 | 用途 |
| --- | --- |
| `build/icon.png` | 1024×1024 主图（electron-builder / macOS） |
| `build/icon.ico` | Windows 安装包与 exe（16/24/32/48/64/128/256 七个尺寸） |
| `build/icon.icns` | macOS（16/32/64/128/256/512/1024） |
| `renderer/assets/icon.png` | 运行时的窗口图标（256×256） |

图标线条取自开源图标库 [lucide](https://github.com/lucide-icons/lucide)（ISC 许可），
底色与圆角比例沿用应用原来的品牌绿（`#07c160`）。

## 目录结构

```
├─ src/
│  ├─ main/           # 主进程：生命周期 / 窗口 / 路径 / IPC 装配（见上文「代码结构（分层）」）
│  ├─ core/           # 加密与存储内核（不依赖 Electron，可单测）
│  ├─ shared/         # IPC 通道名单
│  └─ preload.js      # 安全桥接层（contextBridge：vaultAPI 保险库 + winAPI 窗口控制）
├─ renderer/
│  ├─ index.html      # 界面结构：解锁屏 + #screen-app（密码本 / 列表两个视图）+ 编辑面板 + 弹窗
│  ├─ styles.css      # 解锁屏 + 抽屉/弹窗等共用样式
│  ├─ chat.css        # 程序外壳（标题栏 / 视图切换）+ 列表视图 + 本子嵌进窗口后的收敛样式
│  ├─ app.js          # 渲染层入口（ES module：import app/ 与本子，绑事件后启动）
│  ├─ app/            # 渲染逻辑：lib / toast / store / items / book / ui/*
│  ├─ characters.js   # 解锁屏动画小人
│  ├─ notebook/       # 手写密码本（turn.js 仿真翻页）——既是主界面，也能单独预览
│  │  ├─ index.html   # 单独预览用（npm run notebook）
│  │  ├─ notebook.js  # 引擎接线：挂载 / 尺寸 / 翻页 / 键盘 / window.__nb
│  │  ├─ model.js     # 数据模型 + 分页（纯函数，有单测）
│  │  ├─ ink.js       # 手写字迹渲染（纯函数）
│  │  ├─ page.js      # 每一页长什么样（纯函数）
│  │  ├─ sheet.js     # 写在纸上的那一页（写一条 / 改这条的表单）
│  │  ├─ reveal.js    # 看一眼密码：输主密码的弹框（验过才显示）
│  │  ├─ timing.js    # 所有动画时间只有这一处定义（CSS 通过 :root 变量取）
│  │  ├─ notebook.css  # 版式 / 纸面 / 控制条
│  │  ├─ variants.css  # 背景板皮肤（默认暖橡木，另有 B/C）
│  │  └─ vendor/      # jQuery 1.12.4 + turn.js（本地）
│  └─ assets/icon.png # 应用图标
├─ tests/
│  ├─ unit/           # 单元测试（node --test，不用开窗口）
│  └─ e2e/app.js      # 端到端冒烟测试（npm run test:e2e）
├─ tools/             # 开发脚本：notebook-preview.js 单独预览本子
├─ work/              # 开发用脚本与截图（shot-client.js 出图，look.js / verify.js 看本子）
│  └─ icons/          # 图标工程：apply-icon.js 生成图标，sheet-*.png 是候选对照表
└─ data/vault.dat     # 运行时生成的加密保险库
```
