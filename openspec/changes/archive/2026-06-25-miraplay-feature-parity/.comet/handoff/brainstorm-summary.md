# Brainstorm Summary

- Change: miraplay-feature-parity
- Date: 2026-06-24

## 确认的技术方案

### 1. mpv 编译 + 播放器引擎
- **FFmpegKit pre-built framework** + **mpv-build 自编译 libmpv**
- 三引擎架构：VideoPlayer facade → mpvEngine / mdkEngine / rnvEngine
- 接口统一：play/pause/seek/setRate/setQuality
- 引擎初始化失败自动降级 react-native-video

### 2. HLS Proxy + URL Sniff
- HLS Proxy: Node.js Fastify `/proxy/hls/{encodedUrl}/.m3u8` + TS segment 代理
- Proxy 自动 rewrite .m3u8 中 TS URL 为本地地址，透传 User-Agent/Referer
- URL Sniff: 两个路径
  - CatApi 预处理（RN 侧直接调 NodeService.sniff()）
  - Spider handler 嗅探（Node.js rn-bridge correlationId request/response）
- WKWebView + JS injection 提取 .m3u8 + header/cookie

### 3. NBY 解码 + 加密解析器
- 解码器放 Node.js spider play 层，不侵入原生
- NBY: 先尝试从 MiraPlay main.js 反编译，混淆严重则参考 tvbox 开源实现
- jqq-: 从 kkys.js 移植 API 调用逻辑
- 商业站点解析器链：配置化 parser URL 列表

### 4. DLNA 投屏
- NativeModule `DLNACasting.m`: GCDAsyncUdpSocket SSDP + SOAP
- SSDP 发现 DMR 设备 → 解析 Device.xml → SOAP SetAVTransportURI + Play
- 先支持小米电视，逐步兼容其他品牌
- UI: 播放页 DLNA 图标 → 设备列表弹窗 → 连接状态

## 关键取舍与风险

- **体积** mpv + FFmpeg ~40MB → on-demand resource 策略
- **编译复杂度** FFmpegKit 简化 FFmpeg, mpv-build 简化 mpv, 但仍有 10+ 依赖库需交叉编译
- **DLNA 兼容性** 不同品牌 DMR 实现差异大 → 先支持已验证的小米电视
- **Sniff 延迟** WKWebView 加载 2-10s → 带进度 UI + 10s 超时兜底直连
- **NBY 算法** 反编译可能混淆严重 → 备选开源重写
- **rn-bridge 改造** 现有单向消息需加 correlationId 实现 request/response

## 测试策略

- 编译产物验证：framework 真机加载
- 模块级：每个 module 独立测试（proxy/sniff/decode/DLNA 各有验证场景）
- 引擎降级测试：mpv 初始化失败 → 自动 fallback
- 边界测试：空 URL、超时、设备断连、多设备去重
- E2E：完整浏览 → 播放 → 投屏

## Spec Patch

无。现有 delta spec 覆盖了所有新增能力和修改，无需补充场景。
