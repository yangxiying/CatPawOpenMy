# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CatPlayer — React Native iOS 播放器，运行 CatVod/CatPaw 源。内嵌 NodeMobile.framework（Node.js 18.20 运行时），通过 rn-bridge 与 React Native 双向通信。支持多引擎播放（react-native-video + mpv）、全屏横屏、后台续播。

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

### 核心架构：NodeMobile + 直连 HTTP

NodeMobile.framework（Node.js 18.20 arm64）内嵌在 app 中作为运行时，通过 `nodejs-mobile-react-native` 的 rn-bridge 通道与 React Native 通信：

```
React Native (UI + CatApi)
  ├── rn-bridge.channel (双向 JSON 消息)
  │     ├── server-ready → NodeService.markReady()
  │     ├── sniff → SniffModule → 结果回送
  │     └── action:run → loadScript(path) → 启动 spider 服务
  └── fetch('http://127.0.0.1:{port}') — 直连 HTTP
        ├── /config → 站点列表
        └── /spider/*/home, /detail, /play → 爬虫数据
```

**请求流程**：
1. `CatApi.get/post()` → `NodeService.request()` → `fetch('http://127.0.0.1:{port}{url}')`
2. NodeMobile 内 main.js 承载的 spider server 处理请求并返回 JSON
3. 不再使用 WebView polyfill / postMessage 桥

### 运行时入口（main.js）

`nodejs/src/main.js` 是 NodeMobile 入口，通过 esbuild 打包为 `dist/nodejs-runtime.js`，setup.sh 复制到 `nodejs-assets/nodejs-project/main.js`。

职责：
- 加载所有 builtinModules 到 globalThis（排除 trace_events）
- 提供 `globalThis.catServerFactory(handle)` — HTTP 服务器工厂，启动时通过 rn-bridge 发送 `server-ready`
- 提供 `globalThis.catDartServerPort()` — 返回 Dart 端口
- 监听 rn-bridge `message` 事件，处理 `run`（加载远程 bundle）和 `nativeServerPort` 指令
- **不**内嵌任何 spider server — 远程源是唯一加载方式

### 源加载流程

1. App 启动 → `NodeJS.start('main.js')` → 等待 `server-ready` 事件（事件驱动，无超时）
2. 从 `StorageService` 读取用户配置的远程源 URL
3. 下载 `index.js.md5` → 比对本地缓存 → 不匹配则下载 `index.js` + `index.config.js`
4. 通过 rn-bridge 发送 `{action:'run', path}` 到 Node.js
5. Node.js `loadScript(path)` → stop 旧源 → clear cache → require → start
6. 站点列表通过 `fetch('http://127.0.0.1:{port}/config')` 获取

### 播放引擎

- **BuiltinEngine**（默认）：react-native-video `<Video>` 组件，ref 操作，通过 `renderVideo()` 渲染
- **MPVEngine**（可选）：libmpv NativeModule，编译 `build-mpv-ios.sh` 后可用
- **引擎回退**：`createEngine('mpv')` 失败 → BuiltinEngine

### 远程源下载

- 源 URL 含 Basic auth: `http://user:pass@host/index.js.md5`
- 下载后缓存到 `Documents/catplayer/`（MD5 校验）
- 未配置源 URL → Boot 页显示"请设置源 URL"引导

### 关键文件

| 文件 | 作用 |
|------|------|
| `../nodejs/src/main.js` | NodeMobile 运行时入口，builtinModules + catServerFactory + loadScript + rn-bridge 循环 |
| `../nodejs/esbuild.js` | 构建 dist/nodejs-runtime.js（main.js 入口，external rn-bridge） |
| `overlay/src/node/NodeService.tsx` | NodeService 单例 + NodeWebView 占位组件，NodeMobile 启动 + 远程源下载 + 直连 HTTP 请求 |
| `overlay/src/api/CatApi.ts` | 封装爬虫接口（`get/post/init/home/category/detail/play/search`），走 `fetch('http://127.0.0.1:{port}')` |
| `overlay/src/config.ts` | 硬编码源 URL + Basic auth（MVP） |
| `overlay/src/ui/App.tsx` | 根组件，挂载 NodeWebView + 极简栈导航 |
| `overlay/src/ui/screens/Boot.tsx` | 启动页：等待 server-ready → 下载源 → 获取 /config |
| `overlay/src/ui/screens/Settings.tsx` | 设置页：源 URL 配置 |
| `overlay/src/player/VideoPlayer.tsx` | 视频播放，多引擎（BuiltinEngine / MPVEngine），全屏横屏 + 后台音频 |
| `overlay/src/player/engine.ts` | PlayerEngine 接口定义 |
| `overlay/src/player/engines/BuiltinEngine.tsx` | react-native-video 引擎，完整 PlayerEngine 接口 + renderVideo() |
| `overlay/src/player/DLNACasting.ts` | DLNA/UPnP 投屏 UI 封装 |
| `PlayerBridge/MPVPlayer.h/m` | mpv NativeModule（RCTBridgeModule），libmpv 播放器实例 |
| `PlayerBridge/SniffModule.h/m` | WKWebView URL 嗅探（拦截 video 标签 HLS 直链） |
| `PlayerBridge/DLNACasting.h/m` | DLNA/UPnP 投屏 NativeModule |
| `patch.js` | iOS 原生补丁（Info.plist UIBackgroundModes=audio、AppDelegate AVAudioSession、Podfile 16.0 + FRAMEWORK_SEARCH_PATHS） |
| `setup.sh` | 一键生成工程：RN init → npm install → overlay → nodejs build → Frameworks 提取 → patch → pod install |
| `build-ipa.sh` | 编译未签名 IPA |

### 依赖

| 包 | 用途 |
|---|---|
| `react-native` 0.74.7 | 框架（需 Xcode >= 14.3，macOS >= 12.5） |
| `react-native-fs` | 下载源 bundle + 缓存到 Documents |
| `react-native-video` 5.2.2 | 视频播放 |
| `nodejs-mobile-react-native` | RN ↔ NodeMobile 通信桥（NodeJS.start()、channel） |

### GitHub Actions CI

- `build-ios.yml`：`workflow_dispatch` 选 `full`/`minimal`，或 push 触发
- Runner：`macos-14`，双 Node 切换（22→npm，22→pod+xcodebuild）
- mpv 编译步骤在 xcodebuild 前，失败时 IPA 继续构建
- 产物：未签名 IPA → GitHub Release（tag `ios-full-v<run>` 或 `ios-minimal-v<run>`）

## Constraints

- **macOS >= 12.5 + Xcode >= 14.3**（RN 0.74 要求）
- **NodeMobile.framework** 提取自 `nodejs-mobile-react-native` 的 xcframework，在 `setup.sh` 中复制到 `app/Frameworks/NodeMobile.xcframework/`（不提交 git）
- 源 bundle 下载后缓存到 `Documents/catplayer/`（md5 校验，避免重复下载）
- 请求通过 `fetch('http://127.0.0.1:{port}')` 直连 Node.js HTTP 服务，不再使用 postMessage 桥
- `printWidth: 10000`（Prettier，禁用行宽换行）
- 每次构建生成 `.md5` 哈希文件（源完整性校验）

## MPV/FFmpeg 可选依赖

mpv + FFmpeg iOS framework 为可选，提供 HLS/MP4/ts/加密流格式支持。
编译方法：
  1. cd CatPlayer && bash scripts/build-mpv-ios.sh
  2. 产物放在 CatPlayer/app/Frameworks/
未编译时降级使用 BuiltinEngine（react-native-video）。

## Verification

1. CI 构建成功 → Release 出 IPA
2. Full 版启动 → Boot 页显示日志 → NodeMobile server-ready → 远程源下载 → /config 返回站点列表
3. 未配置源 URL → Boot 页显示"请设置源 URL"引导
4. 视频播放 → 全屏横屏 → 息屏续播声音
