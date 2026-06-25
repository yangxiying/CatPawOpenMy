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
