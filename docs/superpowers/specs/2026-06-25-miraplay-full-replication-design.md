---
comet_change: miraplay-full-replication
role: technical-design
canonical_spec: openspec
---

# MiraPlay 完全复制 — 技术设计

## 概述

在 CatPawOpenMy 中替换 WebView polyfill 方案为 NodeMobile.framework（真 Node.js 运行时），实现与 MiraPlay 1.12 一致的能力：Node.js 远程源执行、mpv/FFmpeg 播放、DLNA 投屏、URL 嗅探、HLS 代理、NBY/jqq 解密。

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     React Native (CatPlayer)                 │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              NodeMobile.framework (54MB)              │   │
│  │  Node.js 18.20 arm64, 取自 MiraPlay IPA              │   │
│  │                                                       │   │
│  │  nodejs-assets/nodejs-project/main.js                 │   │
│  │    ├── builtinModules 全部加载                         │   │
│  │    ├── globalThis.catServerFactory(handle)            │   │
│  │    ├── globalThis.catDartServerPort → port            │   │
│  │    ├── loadScript(path) → require → start             │   │
│  │    └── rn-bridge.channel                              │   │
│  │        └── .on('message') → dispatch actions          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  NodeService.tsx                                              │
│    NodeJS.start('main.js') → wait server-ready               │
│    → fetch('http://127.0.0.1:{port}/config')                 │
│    → rn-bridge.send load-remote-bundle / sniff               │
│                                                              │
│  VideoPlayer.tsx (Multi-Engine)                              │
│    ├── MPVEngine (libmpv) → MPVPlayer NativeModule           │
│    └── BuiltinEngine (react-native-video)                    │
│                                                              │
│  DLNA / Sniff / HLS Proxy / Decoders (已存在)                 │
└─────────────────────────────────────────────────────────────┘
```

## 模块 1：NodeMobile 框架集成

### 方案

1. `cp -R docs/ipa/MiraPlay_extracted/Payload/tvbox.app/Frameworks/NodeMobile.framework/ CatPlayer/app/Frameworks/NodeMobile.framework/`
2. `npm install nodejs-mobile-react-native` — 获得 RN 桥代码（`NodeJS.start()`、`NodeJS.channel`）
3. patch.js: Podfile post_install 添加 `FRAMEWORK_SEARCH_PATHS` 优先指向 `../Frameworks`
4. Xcode 自动链接提取版 NodeMobile.framework，而非 npm 包自带的

### 文件变更

| 文件 | 变更 |
|------|------|
| `CatPlayer/app/Frameworks/NodeMobile.framework/` | 新建，提取自 MiraPlay IPA |
| `CatPlayer/app/package.json` | 新增 `nodejs-mobile-react-native` |
| `CatPlayer/patch.js` | post_install 修改 FRAMEWORK_SEARCH_PATHS |
| `CatPlayer/.gitignore` | NodeMobile.framework 可能需要 git-lfs |

## 模块 2：main.js（NodeMobile 入口）

### 内容

位置：`nodejs/src/main.js` → esbuild → `dist/nodejs-runtime.js` → setup.sh → `app/nodejs-assets/nodejs-project/main.js`

```javascript
const {builtinModules} = require('module');
const rn_bridge = require('rn-bridge');

builtinModules.forEach(mod => {
  if (!['trace_events'].includes(mod)) {
    globalThis[mod] = require(mod);
  }
});

let sourceModule;
let nativeServerPort = 0;

globalThis.catServerFactory = handle => {
  const server = require('http').createServer((req, res) => handle(req, res));
  server.on('listening', () => {
    const port = server.address().port;
    rn_bridge.channel.send(JSON.stringify({type: 'server-ready', port}));
  });
  return server;
};

globalThis.catDartServerPort = () => nativeServerPort;

function loadScript(path) {
  // stop old source
  try { sourceModule?.stop?.(); } catch {}
  delete require.cache[require.resolve(path + '/index.js')];
  const mod = require(path + '/index.js');
  const config = require(path + '/index.config.js');
  mod.start(config.default || config);
}

// 远程源通过 main.js 的 loadScript 执行 Spider Server
// ↑ catServerFactory 会创建 HTTP server，通过 rn-bridge 报告端口

rn_bridge.channel.on('message', (msg) => {
  try {
    const data = JSON.parse(msg);
    switch (data.action) {
      case 'run':
        loadScript(data.path);
        break;
      case 'nativeServerPort':
        nativeServerPort = data.port;
        break;
    }
  } catch (e) { console.error(e); }
});

rn_bridge.channel.send(JSON.stringify({type: 'node-started', message: 'runtime ready'}));
```

### 关键设计

- **不内嵌 spider bundle** — main.js 只有运行时基础设施
- **loadScript 是核心** — RN 配好远程源 URL → 下载 → send action:run → Node.js 加载
- **server-ready 通过 rn-bridge 发送** — RN 侧收到此消息才标记 ready

## 模块 3：NodeService 改造

### NodeService.tsx 新逻辑

```
init():
  ├── tryNativeNode()
  │     ├── NodeJS = require('nodejs-mobile-react-native')
  │     ├── NodeJS.start('main.js')
  │     ├── NodeJS.channel.on('message', handler)
  │     └── wait server-ready (事件驱动, 无超时)
  │
  ├── (收到 server-ready 后)
  │     ├── baseUrl = 'http://127.0.0.1:{port}'
  │     └── markReady()
  │
  ├── check StorageService sourceUrl
  │     ├── 有 → MD5 校验 → 下载 → channel.send({action:'run', path})
  │     └── 无 → 显示"请设置源 URL"
  │
  └── CatApi.getConfig() → fetch('{baseUrl}/config')
```

### 移除内容

- `require('./polyfill-string')` — 删除
- `require('./spider-bundle-string')` — 删除
- `WebViewNode` 渲染 — 删除服务源逻辑（保留网站源 UI 渲染）
- `isWebsiteSource` 检测 — 删除
- `remoteSourceUrl` — 删除
- Website source 渲染 — WebViewNode 仅保留服务源执行逻辑？实际上无服务源后，WebViewNode 只用于网站源。如果 CatPlayer 不需要网站源 UI，WebViewNode 可整个移除，依赖 `react-native-webview` 也可移除。

### 错误处理

- NodeMobile 不启动 → Boot 页显示错误 "Node.js 运行时启动失败"
- sourceUrl 未配置 → Boot 页显示 "请进入 Settings 设置源 URL"
- 远程源下载失败 → 显示下载错误
- loadScript 失败 → 显示加载错误

## 模块 4：mpv + BuiltinEngine

### mpv 编译不变

build-mpv-ios.sh 已有，功能正常（shallow clone FFmpeg + 3 retry + `./rebuild -j4`）。

CI 修改：在 xcodebuild 前加入 mpv 编译步骤。编译失败时 IPA 继续构建。

### BuiltinEngine 补全

BuiltinEngine.ts 实现完整 PlayerEngine 接口，使用 react-native-video `<Video>` 组件渲染。

### 引擎选择

`engines/index.ts`: `createEngine('mpv')` 检查 `libmpv.xcframework` 是否存在，不存在则返回 BuiltinEngine。

## 涉改文件清单

| 文件 | 操作 |
|------|------|
| `CatPlayer/app/Frameworks/NodeMobile.framework/` | 新建(提取) |
| `CatPlayer/app/package.json` | 加 `nodejs-mobile-react-native` |
| `CatPlayer/patach.js` | Podfile FRAMEWORK_SEARCH_PATHS |
| `CatPlayer/app/ios/Podfile` | 自动生成 （pod install 处理） |
| `nodejs/package.json` | 加 `rn-bridge` 依赖 |
| `nodejs/esbuild.js` | 输出 `nodejs-runtime.js` |
| `nodejs/src/main.js` | 新建：运行时入口 |
| `CatPlayer/overlay/src/node/NodeService.tsx` | 重写：NodeMobile主路径 |
| `CatPlayer/overlay/src/node/WebViewNode.tsx` | 移除服务源逻辑 |
| `CatPlayer/overlay/src/node/polyfill-string.ts` | 删除 |
| `CatPlayer/overlay/src/node/spider-bundle-string.ts` | 删除 |
| `CatPlayer/overlay/src/node/polyfills.js` | 可删除（不再需要） |
| `CatPlayer/overlay/src/node/bridge.ts` | 可简化或删除 |
| `CatPlayer/overlay/src/api/CatApi.ts` | 可能简化 |
| `CatPlayer/scripts/inline-polyfill.mjs` | 删除 |
| `CatPlayer/scripts/inline-spider-bundle.mjs` | 删除 |
| `CatPlayer/scripts/setup.sh` | 复制 main.js + 安装 nodejs-mobile |
| `CatPlayer/.github/workflows/build-ios.yml` | 加 mpv 编译步骤 |
| `CatPlayer/build-ipa.sh` | 可能不需要改 |

## 打开问题

- nodejs-mobile-react-native 用哪个版本？（配合 Node 18.20）
- rn-bridge 包是否需要单独 npm install？（nodejs-mobile-react-native 自带）
- WebViewNode 网站源 UI 渲染是否需要保留？（如果不需要，可移除整个 WebView）
