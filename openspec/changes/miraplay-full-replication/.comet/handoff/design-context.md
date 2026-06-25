# Comet Design Handoff

- Change: miraplay-full-replication
- Phase: design
- Mode: compact
- Context hash: 8882ecb14967a01700cae6859bd5b302fd49c1e2a9487591109d4182bbbf4cd3

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/miraplay-full-replication/proposal.md

- Source: openspec/changes/miraplay-full-replication/proposal.md
- Lines: 1-36
- SHA256: 9030e0d27a644439951d0ba3b4641c5a1db3fe352ae9aa9072ba7dc7ab57153c

```md
## Why

MiraPlay 1.12 是一个功能完整的 CatVod/CatPaw 播放器 IPA，支持 Node.js 运行时、mpv+FFmpeg 播放、DLNA 投屏、URL 嗅探、HLS 代理、NBY/jqq 解密等功能。当前 CatPawOpenMy 部分功能已实现（DLNA、嗅探、HLS 代理、解码器），但核心架构差异显著：使用 WebView polyfill 而非真 Node.js 运行时。本次变更是为了完全复制 MiraPlay 1.12 的功能，使用户获得一致的使用体验。

## What Changes

- **NodeMobile 集成**: 将 nodejs-mobile-react-native 替换当前 WebView polyfill 方案，实现真正的 Node.js 运行时执行远程源 bundle
- **原生桥接层**: 实现 Node.js ↔ React Native 的双向消息通道（对应 MiraPlay 的 myaddon）
- **mpv + FFmpeg 编译完成**: 确保 build-mpv-ios.sh 在 CI 上可用，编译产物打包进 IPA
- **BuiltinEngine 补全**: react-native-video 内置播放器作为 mpv 不可用时的回退
- **远程源完整流程**: 用户配置 URL → MD5 校验 → 下载 bundle → loadScript → start
- **移除 WebView polyfill**: 不再使用隐藏 WebView 执行代码（保留 WebView 仅用于网站源 UI 渲染）
- **清理旧代码**: 移除 WebView polyfill 相关 fallback 路径

## Capabilities

### New Capabilities

- `node-mobile-runtime`: Node.js 真运行时嵌入 RN，替代 WebView polyfill，支持 require('http')/axios 等真实 Node 模块
- `native-runtime-bridge`: Node.js ↔ RN 双向消息通道（对应 MiraPlay 的 myaddon），支持 registerCallback / sendMessageToNative
- `remote-source-loading`: 用户配置远程源 URL → MD5 校验 → 下载 → loadScript → start 流程
- `mpv-engine-build`: mpv + FFmpeg iOS 编译脚本 CI 集成，产物打包入 IPA
- `builtin-engine`: react-native-video 内置播放器回退方案补全

### Modified Capabilities

<!-- No existing specs modified -->

## Impact

- **CatPlayer/overlay/src/node/NodeService.tsx**: 从 WebView polyfill 迁移到 NodeMobile，保留 WebView 仅用于网站源 UI
- **CatPlayer/overlay/src/node/WebViewNode.tsx**: 服务源逻辑移除，仅保留网站源渲染
- **CatPlayer/scripts/build-mpv-ios.sh**: 确保 CI 编译通过
- **CatPlayer/.github/workflows/build-ios.yml**: 可能需超时调整（mpv 编译长）
- **package.json**: 新增 nodejs-mobile-react-native 依赖
- **nodejs/src/**: 可能需调整入口以适配 NodeMobile 的 rn-bridge
```

## openspec/changes/miraplay-full-replication/design.md

- Source: openspec/changes/miraplay-full-replication/design.md
- Lines: 1-73
- SHA256: 14870fd8b64525fbca07768845b73847f0a2fc4a2079eac3c71e62318ed991a4

```md
## Context

当前 CatPawOpenMy 使用 WebView polyfill 在隐藏 WebView 中执行 spider server bundle，通过 postMessage 桥转发 HTTP 请求。这存在性能瓶颈、兼容性问题（Hermes Function.prototype.toString Bug）和功能限制（无法使用真实 Node 模块）。

MiraPlay 1.12 使用 NodeMobile.framework（真 Node.js 运行时）+ C++ addon 桥接 Swift ↔ Node.js，用户配置的远程源 bundle 通过 `loadScript(path)` → `require(index.js)` → `start(config)` 执行。

## Goals / Non-Goals

**Goals:**
- 用 nodejs-mobile-react-native 替代 WebView polyfill 作为主要 Node.js 运行时
- 实现 RN ↔ NodeMobile 双向消息通道（对齐 myaddon）
- 保留 WebView 仅用于网站源 UI 渲染
- mpv + FFmpeg 编译脚本在 CI 上可用
- BuiltinEngine 作为 mpv 不可用时的完整回退
- 远程源下载 → loadScript 完整流程

**Non-Goals:**
- 不替换 RN 为 Swift Native
- 不改 CatVodApp Dart 端
- 不使用 KSPlayer（坚持 mpv + 内置回退）
- 不添加 Alamofire/Kingfisher

## Decisions

### D1: NodeMobile 为主，WebView 降级
- **RN ↔ NodeMobile**: 通过 rn-bridge 的 `channel.on('message')` + `channel.send()` 实现双向通信
- **WebView 降级**: 当 NodeMobile 启动超时或不可用时 `tryNativeNode()` 失败 → WebView polyfill 仍作为后备
- MiraPlay 的 `myaddon.registerCallback + sendMessageToNative` 映射到 `NodeJS.channel.on('message', handler)` + `NodeJS.channel.send(msg)`

### D2: ESBuild 双输出
- `nodejs/esbuild.js` 输出两个 bundle:
  - `dist/nodejs-runtime.js` → `app/nodejs-assets/nodejs-project/main.js`（内嵌运行时 + Fastify spider server）
  - `dist/index.js` → `app/nodejs-assets/nodejs-project/spider-dist/index.js`（远程源包）
- 保持 `dist/` 原有产物不变，仅新增 `nodejs-runtime.js` 输出

### D3: 远程源通过 loadRemoteBundle 消息
- RN 下载远程 bundle → `NodeJS.channel.send({type: 'load-remote-bundle', path})`
- Node.js 侧 `registerCallback` 收到 → `loadScript(path)` → stop 旧源 → require 新源 → start

### D4: mpv 编译分两步
- 本地开发: 用户手动 `bash scripts/build-mpv-ios.sh`
- CI: workflow 内嵌编译步骤，产物打包入 IPA
- 编译失败时 IPA 仍继续构建（仅 BuiltinEngine 可用）

### D5: BuiltinEngine 从 stub 补全为可用引擎
- 移除现有 stub 占位符
- 集成 react-native-video `<Video>` 组件
- 实现完整的 PlayerEngine 接口：play/pause/resume/seek/setRate/onProgress/onError/onEnd

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| NodeMobile iOS 18 兼容性（已知此前崩溃） | 若崩溃立即走降级路径，无需用户操作 |
| mpv 编译 CI 超时（全量编译可能 > 90min） | 增加 CI timeout-minutes 到 120min |
| NodeMobile 54MB 附加体积 | IPA 增大但功能完备，MiraPlay 同样大小 |
| nodejs-mobile-react-native 可能已停更 | fork 到可用版本，或锁定已知稳定版本 |

## Migration Plan

1. 安装 nodejs-mobile-react-native 依赖
2. 更新 esbuild 输出 `nodejs-runtime.js`
3. 修改 NodeService.tryNativeNode() 为主路径，原 WebView 代码为降级路径
4. 修改 main.js 增加远程源加载通道
5. 更新 setup.sh 复制 `nodejs-runtime.js` 到 `nodejs-assets/`
6. 补全 BuiltinEngine
7. CI 集成 mpv 编译
8. 更新 CLADUE.md 文档

## Open Questions

- nodejs-mobile-react-native 最新版是否兼容 RN 0.74？（上次项目因 iOS 18 崩溃放弃此方案，需验证版本）
- CI mpv 编译是否能在 120 分钟内完成？（本地编译 ~1h，CI runner macos-14 可能更慢）
```

## openspec/changes/miraplay-full-replication/tasks.md

- Source: openspec/changes/miraplay-full-replication/tasks.md
- Lines: 1-42
- SHA256: 333e369fc9c6cc76c9aa572e97f37d5a361c8d424c5c460a3c283b16ec3bf1e7

```md
## 1. NodeMobile 框架集成

- [ ] 1.1 从 MiraPlay IPA 提取 NodeMobile.framework 到 `CatPlayer/app/Frameworks/`
- [ ] 1.2 安装 `nodejs-mobile-react-native` npm 依赖
- [ ] 1.3 patch.js: Podfile post_install FRAMEWORK_SEARCH_PATHS 优先指向 `../Frameworks`

## 2. main.js NodeMobile 入口

- [ ] 2.1 创建 `nodejs/src/main.js`：builtinModules 加载、catServerFactory、catDartServerPort、loadScript(path)、rn-bridge 消息循环
- [ ] 2.2 esbuild 输出 `dist/nodejs-runtime.js`
- [ ] 2.3 setup.sh 复制到 `app/nodejs-assets/nodejs-project/main.js`

## 3. NodeService 改造

- [ ] 3.1 重写 `tryNativeNode()`：NodeJS.start('main.js') → 事件驱动等 server-ready（无超时）
- [ ] 3.2 实现 `nativeNodeRequest()`：fetch(`http://127.0.0.1:{port}{url}`) 直连 HTTP
- [ ] 3.3 远程源下载：StorageService sourceUrl → MD5 校验 → 下载 → rn-bridge send(`action:'run'`)
- [ ] 3.4 sourceUrl 未配置时 Boot 页引导用户设置
- [ ] 3.5 移除 polyfill-string.ts / spider-bundle-string.ts / bridge.ts 导入和使用
- [ ] 3.6 移除 WebViewNode 组件创建（保留网站源 UI 渲染单独判断）

## 4. BuiltinEngine 补全

- [ ] 4.1 补全 BuiltinEngine.ts：集成 react-native-video `<Video>` 组件
- [ ] 4.2 实现完整 PlayerEngine 接口：play/pause/resume/seek/setRate/setQuality
- [ ] 4.3 实现事件转发：onProgress/onError/onLoad/onEnd
- [ ] 4.4 engines/index.ts 的 createEngine 在 mpv 不可用时回退 BuiltinEngine

## 5. CI + mpv 编译

- [ ] 5.1 更新 build-ios.yml：xcodebuild 前先执行 build-mpv-ios.sh
- [ ] 5.2 mpv 编译失败时 IPA 继续构建
- [ ] 5.3 调整 CI timeout 到 120min

## 6. 验证与清理

- [ ] 6.1 验证 NodeMobile 启动 → server-ready → fetch /config → 站点列表
- [ ] 6.2 验证远程源下载 → loadScript → start → 远程站点显示
- [ ] 6.3 验证 mpv 播放和 BuiltinEngine 回退
- [ ] 6.4 验证未配置源 URL 时引导用户设置
- [ ] 6.5 清理旧代码和脚本（inline-polyfill.mjs、inline-spider-bundle.mjs）
- [ ] 6.6 更新 CLAUDE.md 和 AGENTS.md
```

## openspec/changes/miraplay-full-replication/specs/builtin-engine/spec.md

- Source: openspec/changes/miraplay-full-replication/specs/builtin-engine/spec.md
- Lines: 1-36
- SHA256: d0c6b35fc95613d54178eae5c2364a4d0377da3e836946904006c731572352e5

```md
## ADDED Requirements

### Requirement: BuiltinEngine 补全
The BuiltinEngine SHALL provide a working react-native-video based player as fallback when mpv frameworks are not compiled.

#### Scenario: 引擎选择
- **WHEN** `createEngine('builtin')` is called
- **THEN** it SHALL return a BuiltinEngine instance
- **WHEN** mpv is not available (`libmpv.xcframework` not present)
- **THEN** `createEngine('mpv')` SHALL return the BuiltinEngine as fallback

#### Scenario: 播放控制
- **WHEN** `play(url, headers)` is called on BuiltinEngine
- **THEN** it SHALL render a `react-native-video` `<Video>` component
- **WHEN** `pause()` is called
- **THEN** the video SHALL pause
- **WHEN** `resume()` is called
- **THEN** the video SHALL resume
- **WHEN** `seek(position)` is called
- **THEN** the video SHALL seek to the given position in seconds

#### Scenario: 事件回调
- **WHEN** playback progresses
- **THEN** BuiltinEngine SHALL call `onProgress` with position and duration
- **WHEN** playback ends
- **THEN** BuiltinEngine SHALL call `onEnd`
- **WHEN** an error occurs
- **THEN** BuiltinEngine SHALL call `onError` with error description
- **WHEN** the video loads
- **THEN** BuiltinEngine SHALL call `onLoad` with duration

#### Scenario: 多引擎切换
- **WHEN** the user changes player type in Settings (Settings.tsx)
- **THEN** the setting `playerType` SHALL be persisted via StorageService
- **WHEN** VideoPlayer receives a new `engineKey` prop
- **THEN** it SHALL destroy the old engine and create a new one via `createEngine(engineKey)`
```

## openspec/changes/miraplay-full-replication/specs/mpv-engine-build/spec.md

- Source: openspec/changes/miraplay-full-replication/specs/mpv-engine-build/spec.md
- Lines: 1-55
- SHA256: 04417e6c3618c9e2bfc08b9114d0aea3a030a0aa25b2eee00137d1df486e93ef

```md
## ADDED Requirements

### Requirement: mpv + FFmpeg iOS 编译
The build-mpv-ios.sh script SHALL compile libmpv and FFmpeg libraries for iOS arm64.

#### Scenario: 本地编译
- **WHEN** the user runs `bash scripts/build-mpv-ios.sh`
- **THEN** it SHALL clone mpv-build and FFmpeg (shallow clone, retry on failure)
- **THEN** it SHALL run `./rebuild -j4` with iOS-specific options
- **THEN** the resulting `libmpv.xcframework` and FFmpeg `.xcframework` bundles SHALL be placed in `CatPlayer/app/Frameworks/`
- **WHEN** compilation is complete
- **THEN** setup.sh SHALL detect the frameworks and include them in the build

#### Scenario: CI 编译
- **WHEN** CI workflow runs
- **THEN** it SHALL execute `build-mpv-ios.sh` before `build-ipa.sh`
- **THEN** the IPA SHALL include `Frameworks/` with all compiled `.xcframework` bundles
- **WHEN** CI timeout is 90 minutes
- **THEN** the build steps SHALL complete within that window
- **THEN** CI timeout MAY be increased if mpv compilation exceeds 90 minutes

### Requirement: 编译产物结构
The compiled libraries SHALL produce the following frameworks:

#### Scenario: 必要框架
- **WHEN** build-mpv-ios.sh completes successfully
- **THEN** the following frameworks SHALL be present in `CatPlayer/app/Frameworks/`:
  - `libmpv.xcframework`
  - `Libavcodec.xcframework`
  - `Libavformat.xcframework`
  - `Libavutil.xcframework`
  - `Libavfilter.xcframework`
  - `Libswresample.xcframework`
  - `Libswscale.xcframework`

### Requirement: MPVPlayer NativeModule
The MPVPlayer SHALL be exposed as an RCTBridgeModule for RN to control playback.

#### Scenario: MPV 播放控制
- **WHEN** RN calls `NativeModules.MPVPlayer.play(url, headers)`
- **THEN** MPVPlayer SHALL load the URL and begin playback
- **THEN** `pause()` SHALL pause, `resume()` SHALL resume
- **THEN** `seek(position)` SHALL seek to the given position in seconds
- **THEN** `setRate(rate)` SHALL set playback speed
- **THEN** `destroy()` SHALL release the mpv context

#### Scenario: 事件回调
- **WHEN** playback progresses
- **THEN** MPVPlayer SHALL emit `onPosition` event with current position and duration
- **WHEN** playback ends
- **THEN** MPVPlayer SHALL emit `onEnd` event
- **WHEN** an error occurs
- **THEN** MPVPlayer SHALL emit `onError` event with error description
- **WHEN** the video loads
- **THEN** MPVPlayer SHALL emit `onLoad` event with total duration
```

## openspec/changes/miraplay-full-replication/specs/native-runtime-bridge/spec.md

- Source: openspec/changes/miraplay-full-replication/specs/native-runtime-bridge/spec.md
- Lines: 1-43
- SHA256: 0c140aa1947716d1584076bfa54cb2b0b80e0084ecbd5f44aae2e57dcb4e0b56

```md
## ADDED Requirements

### Requirement: 双向消息通道 (rn-bridge)
The app SHALL implement a bidirectional message channel between React Native and the NodeMobile runtime, corresponding to MiraPlay's myaddon (`_linkedBinding('myaddon')`).

#### Scenario: Node.js → RN 消息
- **WHEN** Node.js code calls `sendMessageToNative(msg)`
- **THEN** the message SHALL be delivered via rn-bridge `channel.on('message', ...)`
- **THEN** the RN side SHALL parse the JSON message
- **THEN** the RN side SHALL dispatch based on `type` field:
  - `server-ready` → mark native runtime ready
  - `node-started` → heartbeat
  - `node-log` → log with level
  - `sniff` → call SniffModule and return result

#### Scenario: RN → Node.js 消息
- **WHEN** RN sends a message via `NodeJS.channel.send(msg)`
- **THEN** Node.js SHALL receive it via `rn_bridge.channel.on('message', handler)`
- **THEN** the message SHALL be parsed as JSON
- **THEN** Node.js SHALL dispatch based on `action` field:
  - `run` → call `loadScript(data.path)`
  - `nativeServerPort` → set the Dart port
  - other actions → handled as needed

#### Scenario: SNIFF 请求响应
- **WHEN** Node.js sends a `sniff` message with `url`, `rule`, `timeout`, `correlationId`
- **THEN** RN SHALL call `NativeModules.SniffModule.sniff(url, rule, timeout)`
- **THEN** RN SHALL send the result back via `NodeJS.channel.send(JSON.stringify({correlationId, result}))`

### Requirement: 直连 HTTP 请求
When NodeMobile is ready, the app SHALL use direct HTTP requests instead of WebView postMessage bridge.

#### Scenario: API 请求转发
- **WHEN** `CatApi.getConfig()` is called
- **THEN** the request SHALL go to `http://127.0.0.1:{port}/config` via `fetch()`
- **WHEN** `CatApi.home(api)` is called
- **THEN** the request SHALL go to `http://127.0.0.1:{port}{api}/home` via `fetch()`
- **THEN** all spider endpoints (`/spider/*/home`, `/spider/*/detail`, `/spider/*/play`, etc.) SHALL work through direct HTTP

#### Scenario: 请求头兼容
- **WHEN** making requests through direct HTTP
- **THEN** `content-type: application/json` SHALL be set by default
- **THEN** response SHALL parse as JSON when possible, fallback to raw string
```

## openspec/changes/miraplay-full-replication/specs/node-mobile-runtime/spec.md

- Source: openspec/changes/miraplay-full-replication/specs/node-mobile-runtime/spec.md
- Lines: 1-55
- SHA256: 1bfc11afd3993aed76ae2ee08fa1f7ee02619f6cb89b6f9ef98624149eb6c3ba

```md
## ADDED Requirements

### Requirement: NodeMobile 集成
The app SHALL integrate nodejs-mobile-react-native as the Node.js runtime, using NodeMobile.framework extracted from MiraPlay IPA.

#### Scenario: NodeMobile 初始化
- **WHEN** the app starts
- **THEN** NodeMobile runtime SHALL be started with `NodeJS.start('main.js')`
- **THEN** the runtime SHALL load `nodejs-assets/nodejs-project/main.js` as the entry point
- **THEN** the runtime SHALL send a `server-ready` message via rn-bridge channel with `port` field
- **THEN** the app SHALL wait for `server-ready` (event-driven, no timeout)
- **THEN** the app SHALL use direct HTTP requests to `127.0.0.1:<port>` for all API calls

#### Scenario: main.js 职责
- **WHEN** NodeMobile finishes loading `main.js`
- **THEN** main.js SHALL expose `globalThis.catServerFactory` for the HTTP server factory
- **THEN** main.js SHALL expose `globalThis.catDartServerPort` returning the native message port
- **THEN** main.js SHALL expose `loadScript(path)` for loading remote bundles via `require()`
- **THEN** main.js SHALL listen on rn-bridge channel for `action:'run'` → `loadScript(path)`
- **THEN** main.js SHALL **NOT** bundle any spider server — spider source comes exclusively from remote URL

#### Scenario: remote bundle 加载
- **WHEN** the app sends an rn-bridge message with `action:'run'` and `path` field
- **THEN** main.js SHALL call `loadScript(path)`
- **THEN** loadScript SHALL stop previous source, clear cache, require `${path}/index.js` and `${path}/index.config.js`
- **THEN** loadScript SHALL call `sourceModule.start(config.default || config)`

#### Scenario: NodeMobile 启动失败
- **WHEN** NodeMobile fails to start
- **THEN** the boot screen SHALL display the error
- **THEN** there SHALL be NO WebView polyfill fallback
- **THEN** the user SHALL see a "重试" button

#### Scenario: NodeMobile 重启
- **WHEN** the user triggers "重试" or source reload
- **THEN** NodeMobile runtime SHALL be stopped and restarted
- **THEN** the app SHALL wait for the new `server-ready` signal

### Requirement: 框架集成
NodeMobile.framework SHALL be extracted from MiraPlay IPA and placed in the project.

#### Scenario: 框架复制
- **WHEN** setting up the project
- **THEN** `docs/ipa/MiraPlay_extracted/.../NodeMobile.framework` SHALL be copied to `CatPlayer/app/Frameworks/NodeMobile.framework/`
- **WHEN** pod install runs
- **THEN** `FRAMEWORK_SEARCH_PATHS` SHALL include `../Frameworks` (via patch.js post_install)
- **THEN** Xcode SHALL link the extracted NodeMobile.framework instead of npm's bundled version

### Requirement: 依赖安装
The project SHALL install nodejs-mobile-react-native.

#### Scenario: setup.sh 集成
- **WHEN** setup.sh runs
- **THEN** it SHALL install `nodejs-mobile-react-native` via npm
- **THEN** it SHALL copy `dist/nodejs-runtime.js` into `app/nodejs-assets/nodejs-project/main.js`
```

## openspec/changes/miraplay-full-replication/specs/remote-source-loading/spec.md

- Source: openspec/changes/miraplay-full-replication/specs/remote-source-loading/spec.md
- Lines: 1-41
- SHA256: a65fd16992ecad85566cbf7526a5568946c08ed54d60eb26935a277d78c8a925

```md
## ADDED Requirements

### Requirement: 远程源 URL 配置
The app SHALL allow users to configure a remote source URL for downloading spider server bundles. This is the ONLY way to load spider sources — there is no embedded spider server.

#### Scenario: 未配置源
- **WHEN** the app starts with no custom source configured (sourceUrl is empty)
- **THEN** the boot screen SHALL display a message guiding the user to set a source URL in Settings
- **THEN** the app SHALL NOT attempt to load any embedded spider
- **THEN** the app SHALL wait for the user to configure a source URL and tap "重试"

#### Scenario: 远程源下载
- **WHEN** the user has configured a remote source URL
- **THEN** the app SHALL download `index.js.md5` from the base URL for MD5 comparison
- **WHEN** the remote MD5 differs from local cache
- **THEN** the app SHALL download `index.js` and `index.config.js`
- **THEN** files SHALL be cached in `Documents/catplayer/`
- **THEN** the MD5 SHALL be persisted for future cache-hit detection

#### Scenario: Basic Auth
- **WHEN** the remote URL contains `user:pass@host` format
- **THEN** the app SHALL extract credentials and set `Authorization: Basic ...` header
- **WHEN** downloading the bundle
- **THEN** the auth header SHALL be included in all download requests

#### Scenario: loadScript 集成
- **WHEN** the remote bundle is downloaded
- **THEN** the RN side SHALL send an rn-bridge message with `action:'run'` and `path` fields
- **WHEN** NodeMobile receives the message via rn-bridge
- **THEN** it SHALL call `loadScript(path)` → stop old source → `require(index.js)` → `start(config.default)`
- **THEN** the spider server SHALL start its HTTP server and send `server-ready` with port number

### Requirement: MD5 缓存校验
The app SHALL maintain an MD5 cache to avoid redundant downloads.

#### Scenario: 缓存命中
- **WHEN** the local MD5 matches the remote MD5
- **THEN** the app SHALL use the cached `index.js` without downloading
- **WHEN** the local MD5 does not match
- **THEN** the app SHALL download fresh `index.js` and `index.config.js`
- **THEN** the cached MD5 SHALL be updated after successful download
```

