# CatPlayer — React Native iOS 播放器

运行 CatVod/CatPaw 源 ，通过 WebView + Node.js API polyfill 执行，支持视频/音频播放、全屏横屏、后台续播。

## 快速开始

### CI 构建（推荐，无需本地 Xcode 编译）

1. 改代码 → commit → push to `main`
2. CI 自动构建 → **https://github.com/yangxiying/CatPawOpenMy/releases** 出 IPA
3. 下载 IPA → Sideloadly 安装到 iPhone

手动触发：**Actions** → *Build CatPlayer iOS IPA* → 选 `full` 或 `minimal` → Run

### 本地开发（写代码 + 语法检查，不编译）

```bash
# 首次生成工程（约 5-10 分钟）
cd CatPlayer && ./setup.sh

# Xcode 打开工程（只看语法错误，不运行）
open app/ios/CatPlayer.xcworkspace
```

> 本地 Mac 用于写代码和 Git，编译交给 CI。Xcode 用于语法高亮和类型检查。

### 本机构建（需 macOS >= 12.5 + Xcode >= 14.3）

```bash
./setup.sh          # 生成 RN 壳 + npm + overlay + patch + pod install
./build-ipa.sh      # → app/ios/build/CatPlayer.ipa
```

## 安装（未签名 → 侧载）

- **Sideloadly**（Win/macOS，免费 Apple ID，7 天过期）
- **AltStore**（免费 Apple ID，7 天自动续签）
- **TrollStore**（受支持 iOS 版本，永久签名）

## 架构

```
React Native (UI + CatApi)
  ↓ postMessage 桥
WebView (隐藏，执行 Node.js 源 bundle)
  ├─ polyfills.js：http.createServer → 拦截请求 → postMessage 回 RN
  ├─ crypto (Web Crypto API) / fs (react-native-fs) / path / events
  └─ require polyfill → 映射到 polyfill 模块
```

请求链：`CatApi.get/post` → `NodeService.request()` → `bridge.sendRequest()` → WebView 内 `http.createServer` handler 处理 → postMessage 回 RN → Promise resolve。

### 关键文件

| 文件 | 作用 |
|------|------|
| `overlay/src/node/polyfills.js` | Node API polyfill（310 行），注入 WebView |
| `overlay/src/node/WebViewNode.tsx` | 隐藏 WebView，加载 polyfill + bundle |
| `overlay/src/node/bridge.ts` | request/response ID 匹配 |
| `overlay/src/node/NodeService.tsx` | 单例 + NodeWebView 组件 |
| `overlay/src/api/CatApi.ts` | 爬虫接口封装（走桥，非 HTTP） |
| `overlay/src/player/VideoPlayer.tsx` | 视频播放（全屏横屏 + 后台音频） |
| `patch.js` | iOS 补丁（UIBackgroundModes=audio、AVAudioSession） |
| `setup.sh` | 一键生成工程 |

## 核心功能

| 功能 | 实现 |
|---|---|
| 全屏横屏 | `react-native-video` `fullscreenOrientation="landscape"` + `presentFullscreenPlayer()` |
| 后台续播 | `playInBackground` + `UIBackgroundModes=audio` + `AVAudioSession(.playback)` |
| 源管理 | 首启下载 `index.js`（md5 校验），缓存到 Documents，支持强制刷新 |

## 技术栈

- react-native `0.74.7` / react `18.2.0`（需 Xcode >= 14.3）
- react-native-webview（WebView 执行 Node.js bundle）
- react-native-fs（下载源 bundle）
- react-native-video `5.2.2`（未安装，待基础启动后启用）
- 自写极简栈导航（免 react-navigation 原生依赖）

## CI 工作流

| 文件 | 触发 | 产物 |
|---|---|---|
| `build-ios.yml` | push main / workflow_dispatch（full/minimal） | IPA → GitHub Release |
| `build-ios-minimal.yml` | workflow_dispatch | 纯 RN 空壳 IPA（调试用） |

Runner：`macos-14`（Xcode 15.4），双 Node 切换（20→npm，18→pod+xcodebuild）。

## 已知限制

- `parse:0` 直链可播；需嗅探/网盘鉴权的源不支持（详情页提示）
- polyfill `fs` 为 stub，readFileSync/writeFileSync 不可用
- polyfill `http.createServer` 不真正监听端口——拦截请求走 postMessage 桥
- ATS 全放行（源与播放直链多为 http）
- 仅视频站（源 `/config` 返回 60 视频站）；后台音频对所有内容生效

## 验证状态

- ✅ Minimal RN 0.74 + WebView 在 iOS 18 设备启动
- ✅ 桥契约离线验证（node 跑通）：/config 60 站 + 完整 spider 链路
- ⏳ WebView polyfill 端到端验证（等 CI 构建 + 真机测试）
