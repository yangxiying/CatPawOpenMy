# CatPlayer — CatVod 兼容 iOS 播放器

内嵌 Node.js（nodejs-mobile）运行 CatVod/CatPaw 爬虫源的 React Native iOS 播放器。
加源 → 浏览 → 播视频/音频，支持**全屏自动横屏**与**后台/息屏续播声音**。

> 本工程是 `../`（CatPawOpenMy 后端）的客户端。后端把爬虫打包成 `index.js`，
> 设计上由宿主 App 内嵌 Node 运行时调用 `start(config)`。CatPlayer 即该宿主。

## 架构

```
React Native (UI)  ──rn-bridge──  nodejs-mobile (内嵌 Node 18)
  · 启动 Node                        · 下载 index.js + index.js.md5 校验
  · 收到本地端口 → baseURL           · 注入 catServerFactory/catDartServerPort
  · 调 /config、/spider/<key>/<type> · require(index.js).start(config)
  · react-native-video 播放          · 本地 fastify 跑爬虫，回传真实端口
```

宿主只需注入两个全局（`nodejs-assets/nodejs-project/main.js`，已离线验证）：
- `globalThis.catServerFactory(handle) → http.Server`
- `globalThis.catDartServerPort() → 0`（无 Dart 宿主）

源（硬编码于 `overlay/src/config.ts`）：`http://wexfnw:wexfnw@cat.xn--4kq62z5rby2qupq9ub.top`
（Basic auth，`index.js` 302 跳转 netease CDN，md5=`969a1ff8…`）。

## 目录

```
CatPlayer/
├─ setup.sh            # 生成 RN 壳 + 装依赖 + 覆盖 overlay + 注入补丁 + pod install
├─ build-ipa.sh        # 编译未签名 .ipa
├─ patch.js            # 注入 Info.plist / AppDelegate / Podfile
├─ overlay/            # 入库的源码（覆盖进生成的 app/）
│  ├─ App.tsx
│  ├─ src/             # config / node 桥客户端 / CatApi / 极简导航 / 屏幕 / 播放器
│  └─ nodejs-project/  # main.js（Node 桥）+ package.json
└─ app/                # 生成工程（.gitignore，CI 每次重建）
```

## GitHub Actions 出 IPA（推荐，绕开本机 macOS/Xcode 限制）

工作流：`../.github/workflows/build-ios.yml`（runner `macos-14`）。

触发方式：
- 改动 `CatPlayer/**` 后 push → 自动构建
- 或 GitHub 仓库 → **Actions** → *Build CatPlayer iOS IPA* → **Run workflow**

产物：Actions 运行页底部 **Artifacts → `CatPlayer-unsigned-ipa`**（未签名 `.ipa`）。

## 本机构建（需 macOS + Xcode + CocoaPods + Node 18）

```bash
cd CatPlayer
./setup.sh        # 首次较久：生成壳、装依赖、pod install
./build-ipa.sh    # → app/ios/build/CatPlayer.ipa（未签名）
```

## 安装（未签名 → 侧载自签）

任选其一安装 `.ipa`：
- **Sideloadly**（Win/macOS，免费 Apple ID）
- **AltStore**（免费 Apple ID，7 天自动续签）
- **TrollStore**（受支持的 iOS 版本，永久签名）

> 免费 Apple ID 签名 7 天过期，到期重签即可。

## 两个核心功能实现

| 需求 | 实现 |
|---|---|
| 全屏按钮自动横屏全屏 | `react-native-video` `fullscreenOrientation="landscape"` + 自定义「全屏」按钮调 `presentFullscreenPlayer()` → 原生全屏即旋转横屏（`overlay/src/player/VideoPlayer.tsx`） |
| 后台/息屏续播声音 | 播放器 `playInBackground` + `playWhenInactive`；`Info.plist` `UIBackgroundModes=audio`；`AppDelegate` 设 `AVAudioSession` 为 `playback`（`patch.js` 注入） |

## 技术栈（锁版，适配 nodejs-mobile）

- react-native `0.72.17`（旧架构）/ react `18.2.0`
- nodejs-mobile-react-native `18.20.4`（内嵌 Node 18.20.4，与源 bundle 的 node18 目标吻合）
- react-native-video `6.19.2`
- 导航：自写极简栈（免 react-navigation 原生 pod）；网络：内置 `fetch`

## 已知限制 / 风险

- `parse:0` 直链可播；需网页嗅探/外部解析的源 MVP 不支持（详情页会提示）。
- nodejs-mobile-rn 仅旧架构，故锁 RN 0.72；勿升级到新架构 RN。
- iOS 无 JIT，Node 解释模式，首启下载+起服务约数秒（有加载页）。
- ATS 全放行（源与本地服务为 http）；正式版应按域收窄。
- 仅视频站（源 `/config` 当前仅返回 60 个视频站）；后台音频对所有内容生效（息屏续播其声音）。

## 验证状态

桥契约已离线验证（node 跑通）：仅两全局即 `start()` 成功、`/config` 返回 60 视频站、
完整 `home→category→detail→play` 链路得 `parse:0` 直链。iOS 端构建/真机验证需在 Mac 或 CI 完成。
