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

### D5: DLNA 投屏 — 原生模块 (NativeModule)
**方案**：React Native NativeModule `DLNACasting`，封装：
- SSDP M-SEARCH 发现（GCDAsyncUdpSocket 或纯 C socket）
- XML 解析 DMR 设备描述
- SOAP HTTP POST 控制命令

**理由**：
- SSDP 需要 UDP multicast socket，RN JS 层无法直接操作
- MiraPlay Device.xml 示例体现了标准 DLNA DMR 交互模式
- `NSLocalNetworkUsageDescription` 权限已在 Info.plist 中声明

**备选**：纯 JS SSDP（net socket）| 第三方库如 `react-native-ssdp`（不够稳定）

### D6: 解密器位置 — Node.js 层
NBY 解码逻辑放在 Node.js spider play 端点的预处理阶段，不做成独立原生模块。理由：
- 解密逻辑是纯字符串/编码操作（base64、XOR、AES-ECB 等），Node.js crypto 完全胜任
- 与现有 `src/spider/video/kkys.js` 等 spider 的玩法一致
- 远程 bundle 的 spider 也需要相同的解码能力（必须 Node.js 侧）

### D7: 集成到 overlay 而非 app
所有新 UI（DLNA 面板、引擎选择、清晰度指示器）放在 `CatPlayer/overlay/src/`，不修改 app/ Flutter 层。理由：
- overlay 是 RN 代码，开发迭代速度快
- MiraPlay 对标功能都属于 UI + 播放体验，不涉及 Flutter 底层架构
- 原生模块 bridge 通过 `CatPlayer/overlay/ios/` 原生文件注入

## Migration Plan

1. **Phase 1 — 编译基础设施**：FFmpegKit + mpv iOS framework 编译脚本，在 `CatPlayer/scripts/` 下
2. **Phase 2 — mpv NativeModule**：`MPVPlayer.m` 原生桥 + overlay 端 `mpvEngine.ts`
3. **Phase 3 — HLS Proxy**：Node.js 运行时 `/proxy/hls/` 路由
4. **Phase 4 — URL Sniff**：`messageToDart` 嗅探通道 + WKWebView 落地
5. **Phase 5 — Crypto Decoder**：NBY + jqq 解析器
6. **Phase 6 — DLNA**：`DLNACasting` native module + overlay UI
7. **Phase 7 — 多引擎收尾**：设置页引擎切换、降级逻辑、播放历史兼容

## Risks / Trade-offs

- **[Size]** mpv + FFmpeg ~40MB → IPA 打包后膨胀，影响用户下载。**缓解**：按需下载 framework（App Clip 或 on-demand resource），主包默认 react-native-video
- **[Compatibility]** iOS 18 新版本可能影响 mpv VideoToolbox 解码。**缓解**：react-native-video 作为兜底引擎
- **[Compile Complexity]** mpv 交叉编译依赖较多（libdav1d, libass, libplacebo, gnutls 等）。**缓解**：使用 pre-built FFmpegKit，mpv 使用 `mpv-build` 自动化脚本
- **[DLNA Fragility]** 不同 DMR 设备对 SOAP/UPnP 实现差异大。**缓解**：先支持小米电视（已验证 MiraPlay 配置），逐步兼容其他品牌
- **[Sniff Latency]** WKWebView 加载 + JS 执行需 2-10s，影响播放启动时间。**缓解**：嗅探带进度 UI，同时设 10s 超时兜底直连

## Open Questions

- NBY 解码算法的具体实现细节（需从 MiraPlay dist/main.js 反编译提取或重写）
- iOS 18 上 `nodejs-mobile-react-native` 是否已恢复兼容（影响 messageToDart 通道）
- mpv iOS framework 需要最低 iOS 版本？（MiraPlay 最低 10.0，但 mpv 可能需要 12.0+）
