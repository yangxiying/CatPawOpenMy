# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CatPlayer — React Native iOS 播放器，运行 CatVod/CatPaw 静态 Node.js 爬虫源（4.47MB CJS），通过 WebView + Node.js API polyfill 执行，支持视频/音频播放、全屏横屏、后台续播。

## Commands

```bash
cd CatPlayer

# 生成 RN 工程（含 npm install + pod install）
./setup.sh

# 极简模式（无 WebView/polyfill，纯 RN 空壳，排查用）
./setup.sh --minimal

# 跳过 pod install（CI 用，先 Node 20 再 Node 18）
./setup.sh --skip-pod

# 编译未签名 IPA
./build-ipa.sh   # → app/ios/build/CatPlayer.ipa

# Xcode 本地调试
# 1. ./setup.sh
# 2. Xcode 打开 app/ios/CatPlayer.xcworkspace（非 .xcodeproj）
# 3. 选 iPhone → ▶️ 运行
```

## Architecture

### 核心架构：WebView + Node Polyfill 桥

源 bundle（4.47MB CJS，由 esbuild 打包的 fastify+axios+http 服务）**无法直接在 iOS 上运行**（无 Node.js 运行时），改为在隐藏 WebView 中执行：

```
React Native (UI + CatApi)
  ↓ postMessage
WebView (隐藏，运行 Node.js 源 bundle)
  ├─ polyfills.js：http.createServer → 拦截请求 → postMessage 回 RN
  ├─ crypto polyfill (Web Crypto API)
  ├─ fs polyfill (react-native-fs)
  └─ path/url/stream/buffer/events/require polyfills
```

**请求流程**：
1. RN `CatApi.get/post()` → `NodeService.request()` → `bridge.sendRequest()` → `postMessage` 到 WebView
2. WebView 内：polyfill `http.createServer` 拦截 → 调用 bundle 注册的 fastify handler
3. handler 处理请求 → `res.end()` → `postMessage` 回 RN → bridge 匹配 reqId → resolve Promise

### 关键文件

| 文件 | 作用 |
|------|------|
| `overlay/src/node/polyfills.js` | Node API polyfill（http/crypto/fs/path/events/require），注入 WebView |
| `overlay/src/node/WebViewNode.tsx` | 隐藏 WebView 组件，加载 polyfill + bundle，postMessage 通信 |
| `overlay/src/node/bridge.ts` | request/response ID 匹配，超时处理 |
| `overlay/src/node/NodeService.tsx` | NodeService 单例 + NodeWebView React 组件，管理 WebView 生命周期 |
| `overlay/src/api/CatApi.ts` | 封装爬虫接口（`get/post/init/home/category/detail/play/search`） |
| `overlay/src/config.ts` | 硬编码源 URL + Basic auth（MVP） |
| `overlay/src/ui/App.tsx` | 根组件，挂载 NodeWebView + 极简栈导航 |
| `overlay/src/ui/screens/Boot.tsx` | 启动页：初始化 WebView → 等待端口 → 获取 /config |
| `overlay/src/player/VideoPlayer.tsx` | 视频播放（react-native-video），全屏横屏 + 后台音频 |
| `overlay/ios/AppIcon.appiconset/` | 小猫简笔画图标（PIL 生成，13 个尺寸） |
| `patch.js` | iOS 原生补丁（Info.plist UIBackgroundModes=audio、AppDelegate AVAudioSession、Podfile 13.4） |
| `setup.sh` | 一键生成工程：RN init → npm install → overlay → patch → pod install |
| `build-ipa.sh` | 编译未签名 IPA（保留 build/generated/ios codegen 输出） |

### 依赖

| 包 | 用途 |
|---|---|
| `react-native` 0.74.7 | 框架（需 Xcode >= 14.3，macOS >= 12.5） |
| `react-native-webview` | 隐藏 WebView，执行 Node.js bundle |
| `react-native-fs` | 下载源 bundle + 缓存到 Documents |
| `react-native-video` 5.2.2 | 视频播放（未安装，注释状态） |

### GitHub Actions CI

- `build-ios.yml`：`workflow_dispatch` 选 `full`/`minimal`，或 push 到 `main` 自动触发
- Runner：`macos-14`，双 Node 切换（20→npm，18→pod+xcodebuild）
- 产物：未签名 IPA → GitHub Release（tag `ios-full-v<run>` 或 `ios-minimal-v<run>`）

## Constraints

- **macOS >= 12.5 + Xcode >= 14.3**（RN 0.74 要求，用户 macOS 12.0 / Xcode 14.0.1 需升级）
- nodejs-mobile-react-native 在 iOS 18 崩溃，已替换为 WebView 方案
- 源 bundle 下载后缓存到 `Documents/catplayer/`（md5 校验，避免重复下载）
- polyfill `http.createServer` 不真正监听端口——拦截请求走 postMessage 桥
- polyfill `fs` 为 stub（readFileSync/writeFileSync 不可用），仅 mkdirSync/existsSync
- `printWidth: 10000`（Prettier，禁用行宽换行）
- 每次构建生成 `.md5` 哈希文件（源完整性校验）

## Verification

1. CI 构建成功 → Release 出 IPA
2. Minimal 版能启动 → RN 0.74 + WebView 本身没问题
3. Full 版启动 → Boot 页显示日志 → WebView 加载 bundle → /config 返回站点列表
4. 视频播放 → 全屏横屏 → 息屏续播声音
