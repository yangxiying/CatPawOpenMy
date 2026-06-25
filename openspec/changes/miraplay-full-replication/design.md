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
