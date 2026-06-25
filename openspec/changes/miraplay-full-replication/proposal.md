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
