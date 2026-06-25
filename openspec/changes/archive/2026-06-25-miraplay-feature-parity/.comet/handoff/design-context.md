# Comet Design Handoff

- Change: miraplay-feature-parity
- Phase: design
- Mode: compact
- Context hash: a412d8a2e915e6027deddc4e4748724249bad7cc5e90c36d554b4fc734523504

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This handoff is a deterministic, source-traceable context pack, not an agent-authored summary.

## openspec/changes/miraplay-feature-parity/proposal.md

- Source: openspec/changes/miraplay-feature-parity/proposal.md
- Lines: 1-36
- SHA256: 29f9ca2b09c1fbd272993ff999139613368c83db3f8a4c0def8b88ec5e7e45d2

```md
## Why

CatPawOpenMy 现有功能与 MiraPlay 1.12 存在显著差距。MiraPlay 使用 mpv + FFmpeg 作为播放引擎支持全格式硬解，内置 URL 嗅探、HLS 代理、NBY/jqq 解密、DLNA 投屏等能力，而 CatPawOpenMy 当前仅依赖 react-native-video（AVPlayer 封装），缺乏这些功能。为达到生产级播放体验，需实现全功能对标。

## What Changes

- **mpv + FFmpeg iOS framework 集成**：编译 libmpv、FFmpeg 各组件为 iOS framework，替换/增强现有播放引擎
- **多引擎播放器架构**：内置播放器 / mpv / MDK 三引擎可选，用户可在设置中切换
- **URL 嗅探（Sniff）**：非 m3u8 视频页通过 WebView 加载 + 正则提取真实 .m3u8 地址
- **HLS 反向代理**：Node.js 端 `/proxy/hls/` 将远程 m3u8 反代为本地可播，解决 CORS/鉴权问题
- **NBY / 自定义编码解密**：支持 NBY-XMYAE 编码串解码、jqq- 格式 API 解析
- **DLNA / UPnP 投屏**：SSDP 发现局域网 DMR 设备 + SOAP 控制（SetAVTransportURI）
- **Spider 系统完善**：补充内置 spider 嗅探 + 代理能力，完善 `messageToDart` 桥接

## Capabilities

### New Capabilities
- `player-engine-mpv`: mpv + FFmpeg iOS framework 编译与集成，覆盖 HLS/MP4/ts/自定义加密流
- `player-ui-multisource`: 多引擎播放器 UI（清晰度切换、倍速、进度续播）
- `url-sniffer`: WebView 加载视频页 + 正则嗅探真实 .m3u8 流地址，返回 header/cookie
- `hls-proxy`: Node.js `/proxy/hls/` 端点，本地反代远程 m3u8 及 ts 分片
- `crypto-decoder`: NBY-XMYAE 编码串解码逻辑、jqq- API 解析器
- `dlna-casting`: SSDP 设备发现 + UPnP/DLNA 控制（AVTransport、RenderingControl、ConnectionManager）

### Modified Capabilities
- `play-spider`: 现有 play 端点为 spider 添加嗅探回退链（直链 → 嗅探 → 解析器链 → 直通）
- `nodejs-runtime-signaling`: Node.js 运行时增加 `messageToDart` 双向消息通道，支持 `action: 'sniff'` 请求

## Impact

- **平台**：iOS only（mpv/FFmpeg framework 为 Apple 平台编译，Android 保持现有方案）
- **体积**：~40MB 增加（mpv + FFmpeg 各 framework）
- **编译**：需交叉编译脚本（iOS arm64，最低 iOS 10.0）
- **Node.js 运行时**：增强消息协议，新增 `/proxy/hls/` 路由
- **overlay 层**：新播放引擎接口、DLNA 原生模块、WebView 嗅探模块
- **不再使用**：纯 react-native-video 实现（保留为降级备选）
```

## openspec/changes/miraplay-feature-parity/design.md

- Source: openspec/changes/miraplay-feature-parity/design.md
- Lines: 1-128
- SHA256: d50ccbbcc8e2cef18c9815502036d50ae9343b1d670d040a312f0f2ec3d60e19

[TRUNCATED]

```md
## Context

CatPawOpenMy 当前架构：

```
RN Layer: CatApi → NodeService → WebView polyfill (port 18080) → Spider handlers
Player:   react-native-video (AVPlayer) — 仅 HLS/MP4，无代理/嗅探/解密
```

MiraPlay 参考架构：

```
Native iOS: WKWebView sniff + DLNA/UPnP + addon bridge
NodeMobile: Fastify spider → proxy/hls + crypto decode + messageToDart
Player: libmpv + FFmpeg + VideoToolbox — 全格式硬解
```

差距核心：**无真实播放引擎** + **无代理/嗅探/解密链路** + **无多引擎抽象** + **无投屏**。

## Goals / Non-Goals

**Goals:**
- mpv + FFmpeg iOS framework 编译集成，HLS/MP4/ts/自定义加密流全部可播
- URL 嗅探 + HLS 代理 + NBY/jqq 解密完整播放链路
- DLNA/UPnP 局域网投屏（SSDP 发现 + SOAP 控制）
- 三引擎播放器（mpv / MDK / react-native-video）用户可选
- 所有功能在 overlay RN 层实现，不侵入 app Flutter 层

**Non-Goals:**
- Android 平台改造（保持现有方案）
- 注入 dylib 的破解功能
- Full Flutter UI 替换为 SwiftUI
- 远程 bundle 的 web 源渲染（保持现有 WebView）

## Decisions

### D1: iOS mpv 编译方案 — FFmpegKit + mpv-build
**选型**：使用 [FFmpegKit](https://github.com/arthenica/ffmpeg-kit)（已封装 FFmpeg iOS framework）+ 自编译 mpv（libmpv static lib）。
**理由**：
- FFmpegKit 提供成熟的 iOS arm64 framework，省去从零交叉编译 FFmpeg 的工作
- MiraPlay 已使用 `libavcodec.framework` / `libavformat.framework` 等独立 framework，FFmpegKit 同样支持
- libmpv 需自编译，但 mpv 官方提供 iOS/tvOS 编译脚本（`mpv-build`）
- `cat /dev/lzma` 可选：直接用 `git submodule` 引入 mpv 源码 + Xcode 工程

**备选**：全手动交叉编译（维护成本高）| 使用 MDK 方案（已集成播放引擎非开源）

### D2: 多引擎播放器架构 — Strategy Pattern
```
VideoPlayer (facade)
  ├── mpvEngine:    NativeModule bridge → libmpv + FFmpeg
  ├── mdkEngine:    NativeModule bridge → MDKPlayer
  └── rnvEngine:    react-native-video (fallback/default)
```
**选型原因**：用户选择 + 降级策略统一。引擎切换只需换 `source` 格式 + `rate` 实现。mpv 引擎通过 `NativeModules.MPVPlayer` 暴露接口（play/pause/seek/speed/quality）。

### D3: URL 嗅探 — WKWebView + JS injection
```
play(id) 
  → id 含 .m3u8? → 直接 proxy
  → id 不含 .m3u8? → Node.js messageToDart({action:'sniff', url, rule})
    → Native: WKWebView.loadRequest(url) + WKUserScript(regex)
    → setInterval poll result → response back to Node.js
  → result.url? → proxy.hls 包装返回
  → 无结果 → 直通返回原始 id
```
**选型原因**：MiraPlay 同样方式。WKWebView 能正确渲染视频页 JS，Native 端获取页面 DOM/header 更可靠。非 m3u8 的页面（如 youku/iqiyi 详情页）需要 WKWebView 加载后 JS 提取真实流。

### D4: HLS Proxy — Fastify 路由
```
GET /proxy/hls/{encodedURL}/.m3u8
  → axios.get(remote_m3u8, {headers: {User-Agent, Referer}})
  → 解析 m3u8 内容，rewrite TS/IFRAME URL 为本地 proxy
  → 返回修改后 playlist

GET /proxy/hls/{encodedURL}/{segment} 
  → axios.get(remote_segment, {responseType: stream})
  → pipe 回客户端
```
**选型原因**：Node.js 侧即可完成，无需原生参与。解决 CORS、鉴权、自定义 header 传递。

```

Full source: openspec/changes/miraplay-feature-parity/design.md

## openspec/changes/miraplay-feature-parity/tasks.md

- Source: openspec/changes/miraplay-feature-parity/tasks.md
- Lines: 1-65
- SHA256: 4df816866107a06b3538e4c521e66718b85451191769da76873b0dcc1e1403d1

```md
## 1. 编译基础设施

- [ ] 1.1 集成 FFmpegKit iOS framework（avcodec/avformat/avfilter/swresample）
- [ ] 1.2 编译 libmpv iOS arm64 static lib（含 libdav1d、libass、libplacebo、gnutls 等依赖）
- [ ] 1.3 创建 `CatPlayer/scripts/build-mpv-ios.sh` 自动化编译脚本
- [ ] 1.4 Xcode project 配置：链接 mpv + FFmpeg frameworks，添加 VideoToolbox 依赖
- [ ] 1.5 验证：播放器能在 Simulator/真机加载 libmpv

## 2. mpv NativeModule 桥接

- [ ] 2.1 创建 `MPVPlayer.m` 原生模块：play/pause/seek/speed 接口
- [ ] 2.2 创建 `MPVPlayer.h` 接口定义，暴露 RCT_EXPORT_MODULE
- [ ] 2.3 overlay 端 `player/engines/mpvEngine.ts` 封装 NativeModules.MPVPlayer
- [ ] 2.4 overlay 端 `player/VideoPlayer.tsx` 改为抽象 facade，按设置选择引擎
- [ ] 2.5 验证：mpv 引擎可播放 HLS URL

## 3. 多引擎播放器 UI

- [ ] 3.1 `player/VideoPlayer.tsx`: 抽象 facade + 引擎选择逻辑
- [ ] 3.2 设置页 `Settings.tsx`: 引擎切换（mpv/MDK/内置）+ 默认倍速设置
- [ ] 3.3 清晰度选择 UI：质量 chip 指示器（当前/可选）
- [ ] 3.4 倍速面板完善
- [ ] 3.5 续播逻辑完善（vodId → StorageService → seek）
- [ ] 3.6 引擎降级逻辑：引擎初始化失败 → 回退 react-native-video

## 4. HLS 代理

- [ ] 4.1 Node.js 运行时添加 `/proxy/hls/{url}/.m3u8` 路由
- [ ] 4.2 远程 m3u8 获取 + 改写 TS/IFRAME URL 为本地代理地址
- [ ] 4.3 `/proxy/hls/{url}/{segment}` 路由：流式回传远程 TS 分片
- [ ] 4.4 自定义 headers 透传（User-Agent/Referer/Cookie）
- [ ] 4.5 验证：非直链 m3u8 通过 proxy 正常播放

## 5. URL 嗅探（Native + 桥接）

- [ ] 5.1 Node.js `messageToDart` 通道：spider play handler 发送 sniff 请求
- [ ] 5.2 Native WKWebView sniff 模块：加载 URL + inject JS regex + 提取 m3u8 URL
- [ ] 5.3 sniff 结果返回通道（header/cookie 捕获）
- [ ] 5.4 spider play 多策略链：直链 → sniff → 解析器 → 直通
- [ ] 5.5 验证：视频页 URL 通过 sniff 提取 m3u8 后正常播放

## 6. 加密解码器

- [ ] 6.1 NBY-XMYAE 编码解码器（从 MiraPlay dist/main.js 反编译提取算法）
- [ ] 6.2 jqq- 格式解析器（juquanquanapp.com API 调用）
- [ ] 6.3 商业站点解析器链（youku/iqiyi/v.qq.com/pptv/mgtv）
- [ ] 6.4 spider play 入口集成解码预处理
- [ ] 6.5 验证：加密流正常播放

## 7. DLNA 投屏

- [ ] 7.1 创建 `DLNACasting.m` 原生模块：GCDAsyncUdpSocket SSDP M-SEARCH
- [ ] 7.2 SSDP 服务发现：发送 M-SEARCH → 解析设备描述 XML
- [ ] 7.3 SOAP 控制：SetAVTransportURI + Play + Stop + RenderingControl
- [ ] 7.4 `DLNACasting.ts`: overlay 端封装 NativeModules
- [ ] 7.5 DLNA 投屏 UI：设备列表弹窗 + 连接状态
- [ ] 7.6 验证：投屏到小米电视（或模拟器 UPnP TestPoint）

## 8. 收尾与兼容

- [ ] 8.1 现有 spider 适配新 play 链（sniffer + hls proxy + decoder）
- [ ] 8.2 历史播放记录兼容多引擎
- [ ] 8.3 清理旧的 WebView polyfill 降级路径中冲突代码
- [ ] 8.4 文档更新（CLAUDE.md + README）
- [ ] 8.5 端到端验证：完整浏览 → 播放 → 投屏流程
```

## openspec/changes/miraplay-feature-parity/specs/crypto-decoder/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/crypto-decoder/spec.md
- Lines: 1-34
- SHA256: ab66b9dce05b7adf8e18b9893563e538d4b6d764ef22a979f9f7f4528a089a8c

```md
## ADDED Requirements

### Requirement: NBY-XMYAE decoding
The system SHALL decode the NBY-XMYAE URL format used by certain video sources, extracting the real play URL and decryption key.

#### Scenario: NBY decode success
- **WHEN** play endpoint receives id starting with "NBY-XMYAE" or similar encoding prefix
- **THEN** decoder extracts and decrypts the embedded real URL using the embedded key/IV
- **THEN** returns standard `{parse: 0, url, header}` response

#### Scenario: NBY decode failure
- **WHEN** decoded result is empty or malformed
- **THEN** falls through to direct URL return

### Requirement: jqq- format API resolution
The system SHALL resolve jqq- prefixed IDs by calling the juquanquanapp.com API with device-specific headers.

#### Scenario: jqq- resolution
- **WHEN** play endpoint receives id starting with "jqq-"
- **THEN** extracts dramaId/episodeSid from the encoded id
- **THEN** calls juquanquanapp.com API with cached device headers
- **THEN** returns the playInfo.url from the response

### Requirement: Parser chain for commercial sites
The play endpoint SHALL support a configurable parser chain for URLs from youku/iqiyi/v.qq.com/pptv/mgtv etc., trying each parser in order until one returns a valid URL.

#### Scenario: Parser chain fallthrough
- **WHEN** a video URL matches the commercial site pattern
- **THEN** system iterates through available parser URLs
- **THEN** returns the first valid result with header and parse=0

#### Scenario: Parser chain exhaustion
- **WHEN** all parsers fail to return a URL
- **THEN** falls through to direct URL return
```

## openspec/changes/miraplay-feature-parity/specs/dlna-casting/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/dlna-casting/spec.md
- Lines: 1-36
- SHA256: f9f5e4ed572da9b1f67e9247dc35cdc4ac87fe24a50d3d882df3dc206e5ac75d

```md
## ADDED Requirements

### Requirement: SSDP device discovery
The system SHALL discover UPnP/DLNA Media Renderer devices on the local network via SSDP M-SEARCH multicast.

#### Scenario: Device discovered
- **WHEN** user opens DLNA casting panel
- **THEN** system sends SSDP M-SEARCH to 239.255.255.250:1900
- **THEN** displays discovered DMR devices with friendlyName and icon

#### Scenario: No devices found
- **WHEN** no DMR device responds within 5 seconds
- **THEN** displays "未发现投屏设备" message with retry button

### Requirement: DLNA playback control
The system SHALL send SetAVTransportURI SOAP command to selected DMR device to initiate playback.

#### Scenario: Push URL to device
- **WHEN** user selects a discovered DMR device
- **THEN** system sends SOAP SetAVTransportURI with CurrentURI = video URL
- **THEN** sends Play command to start playback on the device

#### Scenario: UPnP service discovery
- **WHEN** connecting to a DMR device
- **THEN** system parses device description XML for AVTransport/RenderingControl/ConnectionManager service URLs

### Requirement: DLNA service lifecycle
The system SHALL manage the DLNA session lifecycle: connect → SetURI → Play → Stop → disconnect.

#### Scenario: Stop casting
- **WHEN** user taps "停止投屏"
- **THEN** system sends STOP command to the DMR device

#### Scenario: Session cleanup
- **WHEN** casting session ends or app backgrounds
- **THEN** system cleans up SSDP listeners and SOAP connections
```

## openspec/changes/miraplay-feature-parity/specs/hls-proxy/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/hls-proxy/spec.md
- Lines: 1-26
- SHA256: 11885a257051aa20106830d700d0ed9ec9b30bfcb2848850ce05ade1a5da196c

```md
## ADDED Requirements

### Requirement: HLS proxy endpoint
The Node.js server SHALL provide `GET /proxy/hls/{encodedUrl}/.m3u8` that fetches and proxies a remote HLS playlist locally.

#### Scenario: M3U8 playlist proxied
- **WHEN** player requests `/proxy/hls/{encoded-remote-url}/.m3u8`
- **THEN** Node.js fetches the remote .m3u8, rewrites TS segment URLs to local proxy paths, and returns the modified playlist

#### Scenario: TS segment proxied
- **WHEN** player requests a proxied .ts segment URL
- **THEN** server fetches the remote segment and streams it back with correct Content-Type

### Requirement: Header forwarding to proxy requests
The proxy SHALL forward necessary headers (User-Agent, Referer, Cookie) from the original sniffed response to upstream HLS requests.

#### Scenario: Custom headers on upstream fetch
- **WHEN** proxy fetch is made upstream
- **THEN** custom User-Agent and Referer from the sniff response are included in request headers

### Requirement: Minimal encoding of original URL
The encoded URL in the proxy path SHALL be URL-encoded to prevent parsing conflicts with the m3u8 path suffix.

#### Scenario: URL encoded correctly
- **WHEN** original URL contains special characters (?, &, #)
- **THEN** `encodeURIComponent` is applied before embedding in proxy path
```

## openspec/changes/miraplay-feature-parity/specs/nodejs-runtime-signaling/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/nodejs-runtime-signaling/spec.md
- Lines: 1-21
- SHA256: 5922403a1a54b11b5ea7b2734411f1be75a860dbab8a50630cc127f16fb600ae

```md
## ADDED Requirements

### Requirement: messageToDart bidirectional channel
The Node.js runtime SHALL expose `inReq.server.messageToDart(msg)` function that sends a JSON message to the native Dart/iOS layer and returns a response.

#### Scenario: sniff action
- **WHEN** spider play handler calls `messageToDart({action:'sniff', opt:{url, timeout, rule}})`
- **THEN** native layer receives the message, opens WebView, performs sniff, returns result
- **THEN** spider receives `{url, headers}` response asynchronously

#### Scenario: Response timeout
- **WHEN** native layer does not respond within the message timeout
- **THEN** `messageToDart` resolves with null/empty

### Requirement: Signaled port handshake
Node.js runtime SHALL report its listening port to the native layer via HTTP callback to `http://127.0.0.1:{catDartServerPort}/onCatPawOpenPort?port={nodePort}` on startup.

#### Scenario: Port registration
- **WHEN** Node.js server starts listening
- **THEN** creates HTTP request to native Dart server notifying of the assigned port
- **THEN** native layer stores the port for future message routing
```

## openspec/changes/miraplay-feature-parity/specs/play-spider/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/play-spider/spec.md
- Lines: 1-17
- SHA256: 367861c592c8d6477731d30e5fb872474fdbda5bf5994561444dde4efdd73beb

```md
## MODIFIED Requirements

### Requirement: Play endpoint resolution chain
The spider play endpoint SHALL implement a multi-strategy URL resolution chain: direct m3u8 → sniff via WebView → parser chain → NBY decode → direct pass-through.

#### Scenario: Resolution order
- **WHEN** play endpoint is called with id
- **THEN** checks for encoding prefix first (NBY-, jqq-, etc.)
- **THEN** if not encoded, checks if id contains .m3u8 → direct proxy
- **THEN** if no .m3u8, sends sniff request to native layer
- **THEN** if sniff fails, falls back to direct return of original URL

#### Scenario: Response format
- **WHEN** play endpoint resolves a URL
- **THEN** always returns `{parse: 0, url, header?}`
- **WHEN** URL is HLS
- **THEN** url is rewritten as local proxy path `/proxy/hls/{encodedUrl}/.m3u8`
```

## openspec/changes/miraplay-feature-parity/specs/player-engine-mpv/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/player-engine-mpv/spec.md
- Lines: 1-23
- SHA256: eb87b107eb0ecf75b5fa73e0ce12cd866ba98a73935e451f0bb467503927d344

```md
## ADDED Requirements

### Requirement: mpv + FFmpeg iOS framework
The system SHALL compile libmpv and FFmpeg components (avcodec, avformat, avfilter, avutil, swresample, swscale) as iOS frameworks for arm64.

#### Scenario: Framework build succeeds
- **WHEN** build script runs for iOS arm64 target
- **THEN** all .framework bundles are generated under CatPlayer/app/Frameworks/

#### Scenario: VideoToolbox hardware decoding
- **WHEN** mpv plays an H.264/H.265 video on iOS
- **THEN** VideoToolbox hardware decoder is used for GPU acceleration

### Requirement: Player engine abstraction
The system SHALL provide a unified player interface that supports switching between mpv, MDK, and react-native-video backends at runtime.

#### Scenario: Engine switch applies immediately
- **WHEN** user selects a different player engine in Settings
- **THEN** subsequent video plays use the selected engine

#### Scenario: Fallback on engine failure
- **WHEN** mpv engine fails to initialize for a given URL
- **THEN** system falls back to react-native-video without user intervention
```

## openspec/changes/miraplay-feature-parity/specs/player-ui-multisource/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/player-ui-multisource/spec.md
- Lines: 1-41
- SHA256: f1ba50fd250a66809b63cea03c75d86adf69436f74464c2911e4da941fc6774f

```md
## ADDED Requirements

### Requirement: Quality selection UI
The player SHALL display available quality options as chips/buttons overlaying the video, supporting tap to switch.

#### Scenario: Multiple qualities shown
- **WHEN** play response returns multiple quality labels (e.g., "4K", "HD", "标清")
- **THEN** UI shows selectable chips in the player control overlay

#### Scenario: Quality switch reloads video
- **WHEN** user taps a different quality chip
- **THEN** player reloads the new URL at that quality

### Requirement: Playback speed control
The player SHALL support speed adjustment from 0.5x to 3.0x with long-press speed panel.

#### Scenario: Speed cycling
- **WHEN** user taps speed button
- **THEN** speed cycles through [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]

#### Scenario: Speed panel
- **WHEN** user long-presses speed button
- **THEN** a panel with all speed options is shown for direct selection

### Requirement: Resume playback
The player SHALL save and restore playback position per vodId+siteKey pair.

#### Scenario: Resume prompt on revisit
- **WHEN** user re-opens a video with saved position >5s
- **THEN** player seeks to saved position after load

### Requirement: Auto-hide controls
Player overlay controls SHALL auto-hide after 5 seconds of inactivity, show on tap.

#### Scenario: Controls timeout
- **WHEN** user has not interacted for 5 seconds
- **THEN** control overlay fades out

#### Scenario: Controls show on tap
- **WHEN** user taps the video area
- **THEN** controls reappear and reset hide timer
```

## openspec/changes/miraplay-feature-parity/specs/url-sniffer/spec.md

- Source: openspec/changes/miraplay-feature-parity/specs/url-sniffer/spec.md
- Lines: 1-28
- SHA256: 0f7d8a8dc1eb43fae80709a21d49aa9d2ac8dd193c034f17c44268bbb18b4ba6

```md
## ADDED Requirements

### Requirement: URL sniffing via WebView
The system SHALL load a non-m3u8 video page URL in a hidden WebView, execute JS to extract the real .m3u8 stream URL, and return it along with required headers.

#### Scenario: Successful sniff
- **WHEN** play endpoint receives a URL not ending in .m3u8
- **THEN** Node.js sends `{action: 'sniff', url, timeout, rule}` message to native layer
- **THEN** native layer loads URL in WKWebView, extracts matching URL via regex rule
- **THEN** response includes `{url, headers}` containing the sniffed m3u8 and any User-Agent/Referer

#### Scenario: Sniff timeout
- **WHEN** WebView fails to find matching URL within timeout (default 10s)
- **THEN** returns null/empty, play endpoint falls through to next resolution strategy

### Requirement: Sniff rule customization
The sniff request SHALL accept a configurable regex rule string for flexible URL pattern matching.

#### Scenario: Custom rule passed
- **WHEN** sniff message includes `rule: 'http((?!http).){12,}?\\.m3u8(?!\\?)'`
- **THEN** only URLs matching this pattern are returned

### Requirement: Header propagation
Sniffed headers SHALL be returned and applied to subsequent HLS playback requests.

#### Scenario: Headers included in response
- **WHEN** sniffed URL has associated User-Agent and Referer headers
- **THEN** response includes these headers which are passed to subsequent play requests
```

