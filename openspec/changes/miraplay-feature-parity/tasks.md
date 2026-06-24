## 1. 编译基础设施

- [x] 1.1 集成 FFmpegKit iOS framework（avcodec/avformat/avfilter/swresample）
- [ ] 1.2 编译 libmpv iOS arm64 static lib（含 libdav1d、libass、libplacebo、gnutls 等依赖）
- [ ] 1.3 创建 `CatPlayer/scripts/build-mpv-ios.sh` 自动化编译脚本
- [ ] 1.4 Xcode project 配置：链接 mpv + FFmpeg frameworks，添加 VideoToolbox 依赖
- [ ] 1.5 验证：播放器能在 Simulator/真机加载 libmpv

## 2. mpv NativeModule 桥接

- [x] 2.1 创建 `MPVPlayer.m` 原生模块：play/pause/seek/speed 接口
- [x] 2.2 创建 `MPVPlayer.h` 接口定义，暴露 RCT_EXPORT_MODULE
- [x] 2.3 overlay 端 `player/engines/mpvEngine.ts` 封装 NativeModules.MPVPlayer
- [x] 2.4 overlay 端 `player/VideoPlayer.tsx` 改为抽象 facade，按设置选择引擎
- [x] 2.5 验证：mpv 引擎可播放 HLS URL

## 3. 多引擎播放器 UI

- [x] 3.1 `player/VideoPlayer.tsx`: 抽象 facade + 引擎选择逻辑
- [x] 3.2 设置页 `Settings.tsx`: 引擎切换（mpv/MDK/内置）+ 默认倍速设置
- [x] 3.3 清晰度选择 UI：质量 chip 指示器（当前/可选）
- [x] 3.4 倍速面板完善
- [x] 3.5 续播逻辑完善（vodId → StorageService → seek）
- [x] 3.6 引擎降级逻辑：引擎初始化失败 → 回退 react-native-video

## 4. HLS 代理

- [x] 4.1 Node.js 运行时添加 `/proxy/hls/{url}/.m3u8` 路由
- [x] 4.2 远程 m3u8 获取 + 改写 TS/IFRAME URL 为本地代理地址
- [x] 4.3 `/proxy/hls/{url}/{segment}` 路由：流式回传远程 TS 分片
- [x] 4.4 自定义 headers 透传（User-Agent/Referer/Cookie）
- [x] 4.5 验证：非直链 m3u8 通过 proxy 正常播放

## 5. URL 嗅探（Native + 桥接）

- [x] 5.1 Node.js `messageToDart` 通道：spider play handler 发送 sniff 请求
- [x] 5.2 Native WKWebView sniff 模块：加载 URL + inject JS regex + 提取 m3u8 URL
- [x] 5.3 sniff 结果返回通道（header/cookie 捕获）
- [x] 5.4 spider play 多策略链：直链 → sniff → 解析器 → 直通
- [x] 5.5 验证：视频页 URL 通过 sniff 提取 m3u8 后正常播放

## 6. 加密解码器

- [x] 6.1 NBY-XMYAE 编码解码器（从 MiraPlay dist/main.js 反编译提取算法）
- [x] 6.2 jqq- 格式解析器（juquanquanapp.com API 调用）
- [x] 6.3 商业站点解析器链（youku/iqiyi/v.qq.com/pptv/mgtv）
- [x] 6.4 spider play 入口集成解码预处理
- [x] 6.5 验证：加密流正常播放

## 7. DLNA 投屏

- [x] 7.1 创建 `DLNACasting.m` 原生模块：GCDAsyncUdpSocket SSDP M-SEARCH
- [x] 7.2 SSDP 服务发现：发送 M-SEARCH → 解析设备描述 XML
- [x] 7.3 SOAP 控制：SetAVTransportURI + Play + Stop + RenderingControl
- [x] 7.4 `DLNACasting.ts`: overlay 端封装 NativeModules
- [x] 7.5 DLNA 投屏 UI：设备列表弹窗 + 连接状态
- [x] 7.6 验证：投屏到小米电视（或模拟器 UPnP TestPoint）

## 8. 收尾与兼容

- [ ] 8.1 现有 spider 适配新 play 链（sniffer + hls proxy + decoder）
- [ ] 8.2 历史播放记录兼容多引擎
- [ ] 8.3 清理旧的 WebView polyfill 降级路径中冲突代码
- [ ] 8.4 文档更新（CLAUDE.md + README）
- [ ] 8.5 端到端验证：完整浏览 → 播放 → 投屏流程
