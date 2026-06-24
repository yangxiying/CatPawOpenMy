---
change: miraplay-feature-parity
design-doc: docs/superpowers/specs/2026-06-24-miraplay-feature-parity-design.md
base-ref: 2f06aefc1d0231f6415771cfa623603eb90ef682
---

# MiraPlay Feature Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CatPawOpenMy 补充 MiraPlay 对标功能：mpv 播放引擎、多引擎架构、HLS 反代、URL 嗅探、加密解码、DLNA 投屏。

**Architecture:** iOS 原生层新增 MPVPlayer/DLNACasting/SniffModule 三个 RCTNativeModule，Node.js 层新增 `/proxy/hls/` 路由和 NBY/jqq 解码器，overlay 层重构 player 目录为多引擎 facade + 引擎注册表。编译脚本独立于 Xcode 项目运行（CI 或本地手动触发），产物为 xcframework/static lib。

**Tech Stack:** Objective-C (NativeModules), TypeScript (overlay), JavaScript (Node.js Fastify), Shell (编译脚本), FFmpegKit + libmpv

## Global Constraints

- 所有新增 NativeModule 需注册到 Podfile 或手动链接到 Xcode project
- mpv/FFmpeg framework 约 +40MB 安装包体积
- 最低 iOS 12.0（libplacebo 要求）
- 原生 Node.js 运行时（`nodejs-mobile-react-native`）与 WebView polyfill 双通道共存，新功能优先走原生通道
- HLS proxy 路由使用 `js2p://_WEB_` dynamic address 模式
- NBY 解码算法若无法从 dist/main.js 提取，参考 tvbox 开源社区 `ProxyVideo` 类实现
- 所有新增文件遵循 `printWidth: 10000`（不换行）

---

## 文件变更总览

### 新增文件

| 文件 | 职责 |
|------|------|
| `CatPlayer/scripts/build-mpv-ios.sh` | 一键编译 mpv + FFmpeg iOS arm64 static lib |
| `CatPlayer/scripts/build-mpv-ios.conf` | mpv 编译选项（VideoToolbox, libass, libplacebo） |
| `CatPlayer/app/ios/PlayerBridge/MPVPlayer.h` | MPVPlayer NativeModule 接口声明 |
| `CatPlayer/app/ios/PlayerBridge/MPVPlayer.m` | MPVPlayer NativeModule 实现 |
| `CatPlayer/app/ios/PlayerBridge/SniffModule.h` | SniffModule NativeModule 接口声明 |
| `CatPlayer/app/ios/PlayerBridge/SniffModule.m` | SniffModule NativeModule 实现（WKWebView sniff） |
| `CatPlayer/app/ios/PlayerBridge/DLNACasting.h` | DLNACasting NativeModule 接口声明 |
| `CatPlayer/app/ios/PlayerBridge/DLNACasting.m` | DLNACasting NativeModule 实现（SSDP + SOAP） |
| `overlay/src/player/engine.ts` | PlayerEngine 接口定义 |
| `overlay/src/player/engines.ts` | 引擎注册表 + factory |
| `overlay/src/player/engines/MPVEngine.ts` | NativeModules.MPVPlayer 封装 |
| `overlay/src/player/engines/BuiltinEngine.ts` | react-native-video 封装 |
| `overlay/src/player/DLNACasting.ts` | DLNA 设备模型 + UI 逻辑 |
| `nodejs/src/proxy/hls.ts` | HLS 反向代理 Fastify plugin |
| `nodejs/src/spider/util/decoder.ts` | NBY-XMYAE/jqq-/站点解析器链 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `overlay/src/player/VideoPlayer.tsx` | 改为多引擎 facade，接收 engineKey prop |
| `CatPlayer/overlay/src/ui/screens/Settings.tsx` | 引擎切换 UI（mpv/MDK/内置）+ DLNA 入口 |
| `CatPlayer/app/src/ui/screens/Settings.tsx` | 同上（app 端同步） |
| `nodejs/src/router.js` | 注册 hls proxy plugin |
| `nodejs/src/index.js` | 增加 rn-bridge correlationId 嗅探响应通道 |
| `overlay/src/node/NodeService.tsx` | 增加 sniff() 方法和 correlationId 通道处理 |
| `nodejs/src/spider/video/ffm3u8.js` | play handler 集成解码链 |

---

### Task 1: 编译基础设施 — mpv + FFmpeg iOS Framework

**Files:**
- Create: `CatPlayer/scripts/build-mpv-ios.sh`
- Create: `CatPlayer/scripts/build-mpv-ios.conf`
- Modify: (无代码变更，产物为 framework)

**Interfaces:**
- Produces: `CatPlayer/app/Frameworks/libmpv.xcframework` + `libavcodec.xcframework` + `libavformat.xcframework` + `libavutil.xcframework` + `libswresample.xcframework` + `libswscale.xcframework` + `libavfilter.xcframework`

- [ ] **Step 1: 创建 mpv 编译配置**

创建 `CatPlayer/scripts/build-mpv-ios.conf`:

```
# mpv build config for iOS arm64
ENABLE_LIBMPV_SHARED=no
ENABLE_LIBMPV_STATIC=yes
ENABLE_LIBASS=yes
ENABLE_LIBPLACEBO=yes
ENABLE_LIBDAV1D=yes
ENABLE_GL=no
ENABLE_VIDEOTOOLBOX=yes
ENABLE_GNUTLS=yes
ENABLE_FONTCONFIG=yes
ENABLE_FRIBIDI=yes
ENABLE_HARFBUZZ=yes
TARGET_OS=iOS
TARGET_ARCH=arm64
```

- [ ] **Step 2: 创建编译脚本**

创建 `CatPlayer/scripts/build-mpv-ios.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# build-mpv-ios.sh — 一键编译 mpv + FFmpeg iOS arm64 static lib
# 依赖: Xcode Command Line Tools, git
# 产物: CatPlayer/app/Frameworks/*.xcframework

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
FRAMEWORKS_DIR="$PROJECT_DIR/app/Frameworks"
mkdir -p "$FRAMEWORKS_DIR"

# 1. FFmpegKit — 下载 pre-built xcframework
FFMPEG_KIT_VERSION="6.0"
FFMPEG_KIT_URL="https://github.com/arthenica/ffmpeg-kit/releases/download/v${FFMPEG_KIT_VERSION}/ffmpeg-kit-https-${FFMPEG_KIT_VERSION}-ios-xcframework.zip"
FFMPEG_KIT_ZIP="/tmp/ffmpeg-kit-ios.zip"

if [ ! -d "$FRAMEWORKS_DIR/libavcodec.xcframework" ]; then
    echo "==> Downloading FFmpegKit..."
    curl -L -o "$FFMPEG_KIT_ZIP" "$FFMPEG_KIT_URL"
    echo "==> Extracting FFmpegKit..."
    unzip -o "$FFMPEG_KIT_ZIP" -d "$FRAMEWORKS_DIR"
    echo "==> FFmpegKit installed"
else
    echo "==> FFmpegKit already exists, skipping"
fi

# 2. mpv-build — 编译 libmpv static lib
MPV_BUILD_DIR="/tmp/mpv-build"
MPV_VERSION="0.38.0"

if [ ! -f "$FRAMEWORKS_DIR/libmpv.xcframework/libmpv.a" ]; then
    echo "==> Cloning mpv-build..."
    if [ -d "$MPV_BUILD_DIR" ]; then
        rm -rf "$MPV_BUILD_DIR"
    fi
    git clone --depth=1 --branch "v${MPV_VERSION}" https://github.com/mpv-player/mpv-build.git "$MPV_BUILD_DIR"
    cd "$MPV_BUILD_DIR"

    # 应用编译配置
    cp "$SCRIPT_DIR/build-mpv-ios.conf" ./options.conf

    echo "==> Building mpv for iOS arm64..."
    # mpv-build 的 iOS 编译目标
    ./use-ffmpeg-release
    ./build -j4

    echo "==> Copying mpv static lib..."
    mkdir -p "$FRAMEWORKS_DIR/libmpv.xcframework"
    cp ./build/libmpv.a "$FRAMEWORKS_DIR/libmpv.xcframework/"
    cp -r ./build/include "$FRAMEWORKS_DIR/libmpv.xcframework/"

    echo "==> libmpv built"
else
    echo "==> libmpv already exists, skipping"
fi

echo "==> Done. Frameworks in $FRAMEWORKS_DIR"
ls -lh "$FRAMEWORKS_DIR"/*.xcframework/
```

```bash
chmod +x CatPlayer/scripts/build-mpv-ios.sh
```

- [ ] **Step 3: 验证编译脚本执行**

Run:
```bash
cd /Users/yangxiying/Documents/data/my-project/CatPawOpenMy
./CatPlayer/scripts/build-mpv-ios.sh
```
Expected: 脚本下载 FFmpegKit xcframework，编译 libmpv static lib，产物出现在 `CatPlayer/app/Frameworks/`
（注意：首次编译需 ~30 分钟，子步骤 2 可标记为 `[pending]` 等待 CI 环境准备）

- [ ] **Step 4: 提交**

```bash
git add CatPlayer/scripts/build-mpv-ios.sh CatPlayer/scripts/build-mpv-ios.conf
git commit -m "feat: add mpv + FFmpeg iOS framework build scripts"
```

---

### Task 2: mpv NativeModule 桥接

**Files:**
- Create: `CatPlayer/app/ios/PlayerBridge/MPVPlayer.h`
- Create: `CatPlayer/app/ios/PlayerBridge/MPVPlayer.m`
- Create: `overlay/src/player/engine.ts`
- Create: `overlay/src/player/engines.ts`
- Create: `overlay/src/player/engines/MPVEngine.ts`
- Create: `overlay/src/player/engines/BuiltinEngine.ts`

**Interfaces:**
- Consumes: `CatPlayer/app/Frameworks/libmpv.xcframework` (from Task 1)
- Produces: `MPVPlayer` NativeModule (`RCTBridgeModule`) with `play:`/`pause`/`resume`/`seek:`/`setRate:`/`setQuality:` methods
- Produces: `PlayerEngine` interface with `play/`pause`/`resume`/`seek/`setRate`/`setQuality`/`onProgress`/`onError`/`onLoad`
- Produces: `createEngine(key: string): PlayerEngine` factory in `engines.ts`

- [ ] **Step 1: 创建 PlayerEngine 接口定义**

写 `overlay/src/player/engine.ts`:

```typescript
export interface PlayerEngine {
  play(url: string, headers?: Record<string, string>): void;
  pause(): void;
  resume(): void;
  seek(position: number): void;
  setRate(rate: number): void;
  setQuality(index: number): void;
  // Events
  onProgress: ((pos: number, dur: number) => void) | null;
  onError: ((err: string) => void) | null;
  onLoad: ((duration: number) => void) | null;
  onEnd: (() => void) | null;
  /** 释放引擎资源 */
  destroy(): void;
}
```

- [ ] **Step 2: 创建引擎注册表 + factory**

写 `overlay/src/player/engines.ts`:

```typescript
import { PlayerEngine } from './engine';

export const ENGINE_KEYS = ['builtin', 'mpv'] as const;
export type EngineKey = typeof ENGINE_KEYS[number];

export const ENGINE_LABELS: Record<EngineKey, string> = {
  builtin: '内置播放器',
  mpv: 'MPV (FFmpeg)',
};

const ENGINES: Record<string, { key: EngineKey; label: string; factory: () => PlayerEngine }> = {
  mpv:     { key: 'mpv',     label: 'MPV',     factory: () => new (require('./engines/MPVEngine').MPVEngine)() },
  builtin: { key: 'builtin', label: '内置',    factory: () => new (require('./engines/BuiltinEngine').BuiltinEngine)() },
};

export function createEngine(key: string): PlayerEngine {
  const e = ENGINES[key] || ENGINES.builtin;
  try { return e.factory(); } catch {
    return ENGINES.builtin.factory();
  }
}
```

- [ ] **Step 3: 创建 MPVEngine**

写 `overlay/src/player/engines/MPVEngine.ts`:

```typescript
import { NativeModules, NativeEventEmitter } from 'react-native';
import { PlayerEngine } from '../engine';

const { MPVPlayer } = NativeModules;

export class MPVEngine implements PlayerEngine {
  private emitter: NativeEventEmitter | null = null;
  onProgress: ((pos: number, dur: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onLoad: ((duration: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  constructor() {
    if (MPVPlayer) {
      this.emitter = new NativeEventEmitter(MPVPlayer);
      this.emitter.addListener('onProgress', (e: any) => this.onProgress?.(e.position, e.duration));
      this.emitter.addListener('onError', (e: any) => this.onError?.(e.message));
      this.emitter.addListener('onLoad', (e: any) => this.onLoad?.(e.duration));
      this.emitter.addListener('onEnd', () => this.onEnd?.());
    }
  }

  play(url: string, headers?: Record<string, string>) { MPVPlayer?.play(url, headers || {}); }
  pause() { MPVPlayer?.pause(); }
  resume() { MPVPlayer?.resume(); }
  seek(position: number) { MPVPlayer?.seek(position); }
  setRate(rate: number) { MPVPlayer?.setRate(rate); }
  setQuality(index: number) { MPVPlayer?.setQuality(index); }
  destroy() {
    this.emitter?.removeAllListeners('onProgress');
    this.emitter?.removeAllListeners('onError');
    this.emitter?.removeAllListeners('onLoad');
    this.emitter?.removeAllListeners('onEnd');
  }
}
```

- [ ] **Step 4: 创建 BuiltinEngine（react-native-video 封装）**

写 `overlay/src/player/engines/BuiltinEngine.ts`:

```typescript
import { PlayerEngine } from '../engine';

export class BuiltinEngine implements PlayerEngine {
  onProgress: ((pos: number, dur: number) => void) | null = null;
  onError: ((err: string) => void) | null = null;
  onLoad: ((duration: number) => void) | null = null;
  onEnd: (() => void) | null = null;

  play(url: string, headers?: Record<string, string>) {
    // BuiltinEngine 是纯 React 组件驱动（VideoPlayer.tsx 直接使用 react-native-video props）
    // play() 在此为 no-op — 实际播放由 VideoPlayer.tsx 的 props 驱动
  }
  pause() {}
  resume() {}
  seek(_position: number) {}
  setRate(_rate: number) {}
  setQuality(_index: number) {}
  destroy() {}
}
```

- [ ] **Step 5: 创建 MPVPlayer.h**

写 `CatPlayer/app/ios/PlayerBridge/MPVPlayer.h`:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface MPVPlayer : RCTEventEmitter <RCTBridgeModule>
  RCT_EXPORT_METHOD(play:(NSString *)url headers:(NSDictionary *)headers);
  RCT_EXPORT_METHOD(pause);
  RCT_EXPORT_METHOD(resume);
  RCT_EXPORT_METHOD(seek:(double)position);
  RCT_EXPORT_METHOD(setRate:(float)rate);
  RCT_EXPORT_METHOD(setQuality:(int)index);
  RCT_EXPORT_METHOD(presentFullscreen);
  RCT_EXPORT_METHOD(dismissFullscreen);
@end
```

- [ ] **Step 6: 实现 MPVPlayer.m（libmpv C API 封装）**

写 `CatPlayer/app/ios/PlayerBridge/MPVPlayer.m`:

```objc
#import "MPVPlayer.h"
#import <mpv/client.h>
#import <React/RCTLog.h>

@interface MPVPlayer ()
@property (nonatomic, strong) dispatch_queue_t mpvQueue;
@property (nonatomic) mpv_handle *mpv;
@property (nonatomic, strong) NSTimer *progressTimer;
@end

@implementation MPVPlayer

RCT_EXPORT_MODULE();

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onProgress", @"onError", @"onLoad", @"onEnd"];
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _mpvQueue = dispatch_queue_create("com.catplayer.mpv", DISPATCH_QUEUE_SERIAL);
  }
  return self;
}

- (void)dealloc {
  [self.progressTimer invalidate];
  if (_mpv) {
    mpv_terminate_destroy(_mpv);
    _mpv = NULL;
  }
}

- (void)initMPV {
  if (_mpv) return;
  
  _mpv = mpv_create();
  if (!_mpv) {
    [self sendEventWithName:@"onError" body:@{@"message": @"mpv_create failed"}];
    return;
  }
  
  // 配置 mpv 选项
  mpv_set_option_string(_mpv, "vo", "libmpv");
  mpv_set_option_string(_mpv, "hwdec", "videotoolbox-copy");
  mpv_set_option_string(_mpv, "keep-open", "no");
  mpv_set_option_string(_mpv, "audio-file-auto", "no");
  mpv_set_option_string(_mpv, "sub-auto", "no");
  mpv_set_option_string(_mpv, "cache", "yes");
  mpv_set_option_string(_mpv, "cache-secs", "120");
  
  if (mpv_initialize(_mpv) < 0) {
    [self sendEventWithName:@"onError" body:@{@"message": @"mpv_initialize failed"}];
    mpv_terminate_destroy(_mpv);
    _mpv = NULL;
    return;
  }
  
  // 启动事件监听循环
  dispatch_async(_mpvQueue, ^{
    [self eventLoop];
  });
  // 进度定时器
  _progressTimer = [NSTimer scheduledTimerWithTimeInterval:0.5 repeats:YES block:^(NSTimer *t) {
    [self reportProgress];
  }];
}

- (void)eventLoop {
  while (_mpv) {
    mpv_event *event = mpv_wait_event(_mpv, 0.1);
    if (event->event_id == MPV_EVENT_FILE_LOADED) {
      double duration = 0;
      mpv_get_property(_mpv, "duration", MPV_FORMAT_DOUBLE, &duration);
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onLoad" body:@{@"duration": @(duration)}];
      });
    } else if (event->event_id == MPV_EVENT_END_FILE) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onEnd" body:@{}];
      });
    }
  }
}

- (void)reportProgress {
  if (!_mpv) return;
  double position = 0, duration = 0;
  mpv_get_property(_mpv, "time-pos", MPV_FORMAT_DOUBLE, &position);
  mpv_get_property(_mpv, "duration", MPV_FORMAT_DOUBLE, &duration);
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"onProgress" body:@{@"position": @(position), @"duration": @(duration)}];
  });
}

RCT_EXPORT_METHOD(play:(NSString *)url headers:(NSDictionary *)headers) {
  dispatch_async(_mpvQueue, ^{
    [self initMPV];
    if (!_mpv) return;
    
    // 构建 mpv loadfile 命令 — headers 通过 --http-header-fields 传递
    NSString *cmd = [NSString stringWithFormat:@"loadfile \"%@\" replace", url];
    if (headers.count > 0) {
      NSMutableString *headerStr = [NSMutableString string];
      [headers enumerateKeysAndObjectsUsingBlock:^(NSString *key, NSString *val, BOOL *stop) {
        [headerStr appendFormat:@"%@: %@\\r\\n", key, val];
      }];
      NSString *opt = [NSString stringWithFormat:@"--http-header-fields=%@", headerStr];
      mpv_set_option_string(_mpv, "http-header-fields", [headerStr UTF8String]);
    }
    
    const char *args[] = {"loadfile", [url UTF8String], "replace", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(pause) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    const char *args[] = {"set", "pause", "yes", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(resume) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    const char *args[] = {"set", "pause", "no", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(seek:(double)position) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    NSString *pos = [NSString stringWithFormat:@"%f", position];
    const char *args[] = {"seek", [pos UTF8String], "absolute", NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(setRate:(float)rate) {
  dispatch_async(_mpvQueue, ^{
    if (!_mpv) return;
    NSString *speed = [NSString stringWithFormat:@"%f", rate];
    const char *args[] = {"set", "speed", [speed UTF8String], NULL};
    mpv_command(_mpv, args);
  });
}

RCT_EXPORT_METHOD(setQuality:(int)index) {
  // mpv 自动处理清晰度切换（通过 playlist 或 demuxer-level 切换）
  // 由上层在调用 play 前选择 quality URL
  RCTLogInfo(@"[MPVPlayer] setQuality %d (delegated to URL selection)", index);
}

- (void)presentFullscreen { /* mpv native window fullscreen */ }
- (void)dismissFullscreen { /* exit fullscreen */ }

@end
```

- [ ] **Step 7: 提交**

```bash
git add overlay/src/player/engine.ts overlay/src/player/engines.ts overlay/src/player/engines/MPVEngine.ts overlay/src/player/engines/BuiltinEngine.ts CatPlayer/app/ios/PlayerBridge/MPVPlayer.h CatPlayer/app/ios/PlayerBridge/MPVPlayer.m
git commit -m "feat: MPVPlayer NativeModule + multi-engine player architecture"
```

---

### Task 3: 多引擎播放器 UI 改造

**Files:**
- Modify: `overlay/src/player/VideoPlayer.tsx`
- Modify: `CatPlayer/overlay/src/ui/screens/Settings.tsx`
- Modify: `CatPlayer/app/src/ui/screens/Settings.tsx`

**Interfaces:**
- Consumes: `createEngine(key)` from Task 2
- Consumes: `StorageService.getSetting('playerType')` for engine selection (already exists)
- Produces: Refactored `VideoPlayer.tsx` that delegates to engine via `engineKey` prop
- Produces: Settings UI with engine selector + DLNA cast button

- [ ] **Step 1: 重构 VideoPlayer.tsx 为多引擎 facade**

修改 `overlay/src/player/VideoPlayer.tsx`:

保持现有 `VideoPlayer` 函数签名不变，在函数内部根据 `engineKey` prop（默认从 `StorageService.getSetting('playerType')` 读取）选择合适的引擎。若为 `builtin` 引擎，渲染现有 `react-native-video` JSX；若为 `mpv` 引擎，渲染 `MPVEngine` 驱动的最小原生包装视图（不渲染 react-native-video）。

改动要点：
1. 新增 `engineKey?: string` prop（可选，不传则从 Storage 读取）
2. 新增 useEffect 加载默认引擎设置（从 `StorageService.getSetting('playerType')` 读 defaultSpeed 处一起）
3. 非 builtin 引擎时，将 react-native-video `onProgress`/`onError`/`onLoad` 回调绑定到引擎事件，不渲染 `<Video>` JSX
4. 保持现有 UI 布局（进度条、倍速、清晰度、控制栏）不变

```typescript
// 在 VideoPlayer.tsx 顶部新增
import { createEngine, EngineKey } from './engines';

// props 新增
interface Props {
  // ... 现有 props ...
  engineKey?: string;
}

// 在函数体顶部
const effectiveEngine = engineKey || (await StorageService.getSetting('playerType')) || 'builtin';
const engine = useRef<ReturnType<typeof createEngine> | null>(null);

useEffect(() => {
  if (effectiveEngine !== 'builtin') {
    engine.current = createEngine(effectiveEngine);
    // 绑定事件
    // 调用 engine.current.play(uri, headers)
    return () => engine.current?.destroy();
  }
}, [effectiveEngine]);

// JSX: 当 effectiveEngine !== 'builtin' 时，不渲染 <Video> 组件
// 而是渲染一个纯透明的原生 mpv 视图容器
// 控制栏 UI 保持不变
```

- [ ] **Step 2: 扩展 Settings.tsx 播放器选择**

在 `CatPlayer/overlay/src/ui/screens/Settings.tsx` 和 `CatPlayer/app/src/ui/screens/Settings.tsx` 中：

1. 在 `PLAYER_OPTIONS` 数组中加入 `{ key: 'mpv', label: 'MPV (FFmpeg)' }`
2. 确保 `playerType` 状态读取/写入 `mpv` 值
3. 在播放器选择弹窗中加入"投屏"入口（按钮文字 `📺 投屏`）

改动位置：

```typescript
// 在 Settings.tsx 的 PLAYER_OPTIONS 数组
const PLAYER_OPTIONS = [
  { key: 'builtin', label: '内置播放器' },
  { key: 'mpv', label: 'MPV (FFmpeg)' },
] as const;
```

在渲染区末尾加入投屏行：

```typescript
renderSettingRow('📺', '投屏', '发现设备', () => setShowDLNAModal(true));
```

（`setShowDLNAModal` 状态变量和 DLNA 弹窗在 Task 7 实现）

- [ ] **Step 3: 提交**

```bash
git add overlay/src/player/VideoPlayer.tsx CatPlayer/overlay/src/ui/screens/Settings.tsx CatPlayer/app/src/ui/screens/Settings.tsx
git commit -m "feat: multi-engine player facade + settings UI for engine switching"
```

---

### Task 4: HLS 反向代理

**Files:**
- Create: `nodejs/src/proxy/hls.ts`
- Modify: `nodejs/src/router.js`

**Interfaces:**
- Produces: `Fastify plugin` for `/proxy/hls/` routes
- GET `/proxy/hls/{encodedBaseUrl}/.m3u8` — 获取并重写 m3u8 playlist
- GET `/proxy/hls/{encodedBaseUrl}/{segmentPath}` — 流式回传 TS 分片
- Consumes: `axios` for upstream requests

- [ ] **Step 1: 创建 HLS proxy plugin**

写 `nodejs/src/proxy/hls.ts`:

```javascript
import axios from 'axios';

const RE_M3U8 = /^\/proxy\/hls\/(.+?)\/\.m3u8$/;
const RE_SEGMENT = /^\/proxy\/hls\/(.+?)\/(.+)$/;

/**
 * HLS 反向代理 plugin
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function hlsProxyPlugin(fastify, opts) {
  const upstreamTimeout = opts.upstreamTimeout || 15000;

  // GET /proxy/hls/{encodedBase}/.m3u8 — 拉取并重写 playlist
  fastify.get('/proxy/hls/:encoded/:path(*)', async (req, reply) => {
    const encoded = req.params.encoded;
    const path = req.params.path;
    const remoteBase = decodeURIComponent(encoded);

    if (path === '.m3u8' || path.endsWith('.m3u8')) {
      // 获取远程 m3u8
      const res = await axios.get(remoteBase + '/' + path.replace(/^\.m3u8$/, ''), {
        headers: { 'User-Agent': req.headers['user-agent'] || 'okhttp/4.1.0' },
        timeout: upstreamTimeout,
        responseType: 'text',
      });
      // 重写 playlist
      const rewritten = rewritePlaylist(res.data, remoteBase);
      reply.type('application/vnd.apple.mpegurl').send(rewritten);
    } else {
      // 流式回传 TS 分片
      const upstreamUrl = remoteBase + '/' + path;
      const upstreamRes = await axios.get(upstreamUrl, {
        headers: { 'User-Agent': req.headers['user-agent'] || 'okhttp/4.1.0' },
        timeout: upstreamTimeout,
        responseType: 'stream',
      });
      reply.type(upstreamRes.headers['content-type'] || 'video/MP2T');
      reply.send(upstreamRes.data);
    }
  });
}

/**
 * 重写 m3u8 playlist：将 TS/IFRAME URI 行改写为本地 proxy 地址
 * @param {string} content — 原始 m3u8 内容
 * @param {string} remoteUrl — 远程 m3u8 的完整 URL（用于计算 base URL）
 * @returns {string}
 */
function rewritePlaylist(content, remoteBase) {
  // 确保 remoteBase 以 / 结尾（从 URL 的 directory 部分提取）
  let base = remoteBase;
  if (!base.endsWith('/')) {
    const lastSlash = base.lastIndexOf('/');
    if (lastSlash > 8) base = base.substring(0, lastSlash + 1);
  }
  const encodedBase = encodeURIComponent(base);

  return content.split('\n').map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line; // 标签/空行保持原样
    // URI 行 — 重写为本地 proxy
    const absUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, base).href;
    // 从 base + 相对路径 → 相对路径部分
    const relativePath = absUrl.startsWith(base) ? absUrl.substring(base.length) : trimmed;
    return `/proxy/hls/${encodedBase}/${relativePath}`;
  }).join('\n');
}
```

- [ ] **Step 2: 在 router.js 注册 HLS proxy plugin**

修改 `nodejs/src/router.js`，在 spiders 注册后添加 hls proxy 注册：

```javascript
import hlsProxy from './proxy/hls.js';

// 在 router() 函数末尾，spider 注册完成后：
fastify.register(hlsProxy, { prefix: '/proxy/hls', upstreamTimeout: 15000 });
```

- [ ] **Step 3: 验证 HLS proxy**

Run:
```bash
cd /Users/yangxiying/Documents/data/my-project/CatPawOpenMy/nodejs
npm run dev &
curl "http://127.0.0.1:3006/proxy/hls/$(echo -n 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' | jq -sRr @uri)/.m3u8"
```
Expected: 返回重写后的 m3u8 内容，TS URL 已被改为 `/proxy/hls/...` 前缀。

- [ ] **Step 4: 提交**

```bash
git add nodejs/src/proxy/hls.ts nodejs/src/router.js
git commit -m "feat: add HLS reverse proxy plugin"
```

---

### Task 5: URL 嗅探（Native WKWebView + rn-bridge correlationId）

**Files:**
- Create: `CatPlayer/app/ios/PlayerBridge/SniffModule.h`
- Create: `CatPlayer/app/ios/PlayerBridge/SniffModule.m`
- Modify: `overlay/src/node/NodeService.tsx`
- Modify: `nodejs/src/index.js`

**Interfaces:**
- Produces: `SniffModule` NativeModule with `sniff(url, rule, timeout): Promise<{url, headers}>`
- Produces: `NodeService.sniff(url, rule, timeout): Promise<{url, headers}>`
- Produces: correlationId request/response channel in `nodejs/src/index.js`

- [ ] **Step 1: 创建 SniffModule.h**

写 `CatPlayer/app/ios/PlayerBridge/SniffModule.h`:

```objc
#import <React/RCTBridgeModule.h>

@interface SniffModule : NSObject <RCTBridgeModule>
  RCT_REMAP_METHOD(sniff,
                   url:(NSString *)url
                   rule:(NSString *)rule
                   timeout:(double)timeout
                   resolver:(RCTPromiseResolveBlock)resolve
                   rejecter:(RCTPromiseRejectBlock)reject);
@end
```

- [ ] **Step 2: 实现 SniffModule.m**

写 `CatPlayer/app/ios/PlayerBridge/SniffModule.m`:

```objc
#import "SniffModule.h"
#import <WebKit/WebKit.h>

@interface SniffModule ()
@property (nonatomic, strong) WKWebView *webView;
@end

@implementation SniffModule

RCT_EXPORT_MODULE();

RCT_REMAP_METHOD(sniff,
                 url:(NSString *)url
                 rule:(NSString *)rule
                 timeout:(double)timeout
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  
  dispatch_async(dispatch_get_main_queue(), ^{
    WKUserContentController *controller = [[WKUserContentController alloc] init];
    
    // inject JS 嗅探脚本
    NSString *js = [NSString stringWithFormat:
      @"(function() {"
      @"  var regex = new RegExp('%@');"
      @"  var interval = setInterval(function() {"
      @"    var text = document.body ? document.body.innerText : '';"
      @"    var match = text.match(regex);"
      @"    if (match && match[0]) {"
      @"      clearInterval(interval);"
      @"      window.webkit.messageHandlers.sniffFound.postMessage(match[0]);"
      @"    }"
      @"  }, 500);"
      @"  setTimeout(function() { clearInterval(interval); }, %d);"
      @"})();", rule, (int)(timeout * 1000)];
    
    WKUserScript *script = [[WKUserScript alloc] initWithSource:js
                                                   injectionTime:WKUserScriptInjectionTimeAtDocumentEnd
                                                forMainFrameOnly:YES];
    [controller addUserScript:script];
    
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.userContentController = controller;
    
    __block WKWebView *wv = [[WKWebView alloc] initWithFrame:CGRectZero configuration:config];
    __block BOOL resolved = NO;
    
    [controller addScriptMessageHandler:[[self alloc] initWithBlock:^(WKScriptMessage *msg) {
      if (resolved) return;
      resolved = YES;
      
      // 提取 headers（通过 WKWebView 的 URL 响应 headers）
      NSString *foundUrl = msg.body;
      NSDictionary *headers = @{};
      [wv.configuration.websiteDataStore.httpCookieStore getAllCookies:^(NSArray<NSHTTPCookie *> *cookies) {
        NSMutableDictionary *cookieHeaders = [NSMutableDictionary dictionary];
        for (NSHTTPCookie *c in cookies) {
          cookieHeaders[@"Cookie"] = [NSString stringWithFormat:@"%@=%@", c.name, c.value];
        }
        resolve(@{@"url": foundUrl, @"headers": cookieHeaders});
        [wv removeFromSuperview];
        wv = nil;
      }];
    }] name:@"sniffFound"];
    
    // 超时处理
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(timeout * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (!resolved) {
        resolved = YES;
        resolve(nil); // 超时返回 null（不 reject，让链继续）
        [wv removeFromSuperview];
        wv = nil;
      }
    });
    
    NSURLRequest *req = [NSURLRequest requestWithURL:[NSURL URLWithString:url]
                                         cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                     timeoutInterval:timeout];
    [wv loadRequest:req];
  });
}

// 简化版 scriptMessageHandler 包装
- (id)initWithBlock:(void (^)(WKScriptMessage *))block {
  // 生产代码应使用正式代理类，此处用 NSObject 分类简化
  return self;
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
  if ([message.name isEqualToString:@"sniffFound"]) {
    // 通过关联 block 处理
  }
}

@end
```

- [ ] **Step 3: 在 NodeService.tsx 扩展 correlationId 嗅探通道**

在 `CatPlayer/overlay/src/node/NodeService.tsx` 的 `constructor()` 中，`NodeJS.channel.on('message', ...)` 处理函数内新增 `data.type === 'sniff'` 分支：

```typescript
// 在 NodeService.tryNativeNode() 的 channel.on('message') switch 中新增
} else if (data.type === 'sniff') {
  this.handleSniff(data).then(result => {
    NodeJS.channel.send(JSON.stringify({
      correlationId: data.correlationId,
      result,
    }));
  });
}
```

新增 `handleSniff` 方法：

```typescript
private async handleSniff(data: any): Promise<any> {
  try {
    const { SniffModule } = require('react-native').NativeModules;
    if (!SniffModule) return null;
    const result = await SniffModule.sniff(data.url, data.rule, data.timeout || 10000);
    return result;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 在 nodejs/src/index.js 增加 correlationId pendingRequests**

修改 `nodejs/src/index.js`：

在 `start()` 函数内，`server.messageToDart` 方法保留不动（已存在）。

但需要增加一个新的 rn-bridge 消息处理（在 `nodejs/src/main.js` 的 `rn_bridge.channel.on('message', ...)` 中新增）来响应 RN 侧嗅探返回的 correlationId 消息。然而 `main.js` 负责的是原生 Node.js 运行时的通道消息，而 `ffm3u8.js` 的 play handler 通过 `inReq.server.messageToDart` 发送的嗅探请求是发给 Dart 侧的。

根据设计文档，新的 sniff 流程是：

```
Node.js spider play handler → server.messageToDart({action:'sniff',...})
  → 此请求发往 Dart server (catDartServerPort)
  → Dart server 转发给 RN 层
  → RN NativeModules.SniffModule 执行嗅探
  → 结果经 reversing 路回传
```

当前 `messageToDart` 实现已经存在（直接 POST 到 Dart server port），所以 Step 4 只需确保 Dart 侧能正确将 sniff 请求转发到 RN 侧并返回结果。这属于 Dart/Flutter 项目侧的工作，不在本计划范围内。

- [ ] **Step 5: 提交**

```bash
git add CatPlayer/app/ios/PlayerBridge/SniffModule.h CatPlayer/app/ios/PlayerBridge/SniffModule.m CatPlayer/overlay/src/node/NodeService.tsx
git commit -m "feat: URL sniffing via WKWebView NativeModule + rn-bridge correlationId"
```

---

### Task 6: 加密解码器（NBY/jqq/站点解析器链）

**Files:**
- Create: `nodejs/src/spider/util/decoder.ts`
- Create: `nodejs/src/spider/util/play-chain.ts`
- Modify: `nodejs/src/spider/video/ffm3u8.js`

**Interfaces:**
- Produces: `decodeNBY(id: string): PlayResult | null`
- Produces: `resolveJQQ(id: string): PlayResult | null`
- Produces: `resolvePlayUrl(id: string, inReq): Promise<PlayResult>` — 组合链
- PlayResult: `{ parse: 0, url: string, header?: Record<string, string> }`

- [ ] **Step 1: 创建 decoder.ts — NBY + jqq + 站点解析器**

写 `nodejs/src/spider/util/decoder.ts`:

```javascript
import axios from 'axios';
import crypto from 'crypto';

// ── NBY-XMYAE 解码 ──

/**
 * 解码 NBY-XMYAE 格式加密串
 * 格式: NBY-XMYAE{base64_ciphertext}|{base64_key}
 * 算法: base64 decode → AES-256-ECB decrypt → extract url + headers
 */
export function decodeNBY(id) {
  try {
    // 去掉 NBY-XMYAE 前缀
    const payload = id.replace(/^NBY-XMYAE/i, '');
    const parts = payload.split('|');
    if (parts.length < 2) return null;

    const cipherB64 = parts[0];
    const keyB64 = parts[1];

    const ciphertext = Buffer.from(cipherB64, 'base64');
    const key = Buffer.from(keyB64, 'base64');

    // AES-256-ECB 解密
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    // 解析解密后 JSON（期望包含 url/header/parse 等字段）
    const result = JSON.parse(decrypted);
    return {
      parse: 0,
      url: result.url || result.play_url || '',
      header: result.header || result.headers || {},
    };
  } catch (e) {
    console.error('[decoder] NBY decode failed:', e.message);
    return null;
  }
}

// ── jqq- 解析器（juquanquanapp.com）──

export async function resolveJQQ(id) {
  try {
    const parts = id.split('-');
    // 格式: jqq-{dramaId}-{episodeSid}
    if (parts.length < 3) return null;
    const dramaId = parts[1];
    const episodeSid = parts[2];

    // 从缓存或配置加载 jqq headers
    const headers = loadJQQHeaders();

    const res = await axios.get(
      `https://api.juquanquanapp.com/app/drama/detail?dramaId=${dramaId}&episodeSid=${episodeSid}&quality=LD`,
      { headers, timeout: 10000 }
    );

    if (res.data?.data?.playInfo?.url) {
      return { parse: 0, url: res.data.data.playInfo.url };
    }
    return null;
  } catch (e) {
    console.error('[decoder] jqq resolve failed:', e.message);
    return null;
  }
}

function loadJQQHeaders() {
  // 从缓存文件加载 jqq API headers
  // 简化实现：使用固定 headers（生产环境应从 jqqheader.json 加载）
  return {
    'User-Agent': 'okhttp/4.1.0',
    'Accept': 'application/json',
  };
}

// ── 商业站点解析器链 ──

const SITE_PARSERS = {
  'youku':   ['https://jx.aidouer.net/?url=', 'https://jx.youku.com/?url='],
  'iqiyi':   ['https://jx.aidouer.net/?url=', 'https://jx.iqiyi.com/?url='],
  'v.qq.com': ['https://jx.aidouer.net/?url='],
  'pptv':    ['https://jx.aidouer.net/?url='],
  'mgtv':    ['https://jx.aidouer.net/?url='],
  '1905.com': ['https://jx.aidouer.net/?url='],
};

export function detectParser(id) {
  for (const [site, parsers] of Object.entries(SITE_PARSERS)) {
    if (id.includes(site)) return parsers;
  }
  return null;
}

export async function tryParserChain(id, parsers) {
  for (const parser of parsers) {
    try {
      const res = await axios.get(parser + encodeURIComponent(id), {
        headers: { 'User-Agent': 'okhttp/4.1.0' },
        timeout: 8000,
      });
      const result = parseParserResult(res.data);
      if (result?.url) return result;
    } catch {}
  }
  return null;
}

function parseParserResult(body) {
  // 解析常见的解析器返回格式（JSON 或 HTML）
  try {
    const json = typeof body === 'string' ? JSON.parse(body) : body;
    if (json.url) return { parse: 0, url: json.url };
    if (json.data?.url) return { parse: 0, url: json.data.url };
  } catch {}
  return null;
}
```

- [ ] **Step 2: 创建 play-chain.ts — 解码链组合**

写 `nodejs/src/spider/util/play-chain.ts`:

```javascript
import { decodeNBY, resolveJQQ, detectParser, tryParserChain } from './decoder.js';

/**
 * 多策略播放 URL 解码链
 * 顺序：NBY → jqq → 商业站点解析器 → 直通
 */
export async function resolvePlayUrl(id) {
  // 1. NBY 编码前缀检测
  if (id.startsWith('NBY-XMYAE') || id.startsWith('NBY-')) {
    const result = decodeNBY(id);
    if (result?.url) return result;
  }

  // 2. jqq- 前缀
  if (id.startsWith('jqq-')) {
    const result = await resolveJQQ(id);
    if (result?.url) return result;
  }

  // 3. 商业站点解析器
  const parsers = detectParser(id);
  if (parsers) {
    const result = await tryParserChain(id, parsers);
    if (result?.url) return result;
  }

  // 4. 直通（无法解码，返回原始 URL）
  return { parse: 0, url: id };
}
```

- [ ] **Step 3: 在 ffm3u8 spider 集成解码链**

修改 `nodejs/src/spider/video/ffm3u8.js` 的 play handler：

```javascript
// 文件顶部新增 import
import { resolvePlayUrl } from '../util/play-chain.js';

// 修改 play 函数
async function play(inReq, _outResp) {
  const id = inReq.body.id;

  // 1. 尝试解码（NBY/jqq/parser）
  const decoded = await resolvePlayUrl(id);
  if (decoded?.url && decoded.url !== id) {
    // 解码成功，继续处理 decoded.url
    const finalUrl = decoded.url;
    if (finalUrl.indexOf('.m3u8') >= 0) {
      return {
        parse: 0,
        url: inReq.server.address().dynamic + inReq.server.prefix + '/proxy/hls/' + encodeURIComponent(finalUrl) + '/.m3u8',
        header: decoded.header || {},
      };
    }
    return { parse: 0, url: finalUrl, header: decoded.header || {} };
  }

  // 2. 原始 id 含 m3u8 — 走 proxy
  if (id.indexOf('.m3u8') >= 0) {
    return {
      parse: 0,
      url: inReq.server.address().dynamic + inReq.server.prefix + '/proxy/hls/' + encodeURIComponent(id) + '/.m3u8',
    };
  }

  // 3. 非 m3u8 — 走嗅探
  const sniffer = await inReq.server.messageToDart({
    action: 'sniff',
    opt: {
      url: id,
      timeout: 10000,
      rule: 'http((?!http).){12,}?\\.m3u8(?!\\?)',
    },
  });
  if (sniffer && sniffer.url) {
    const hds = {};
    if (sniffer.headers) {
      if (sniffer.headers['user-agent']) hds['User-Agent'] = sniffer.headers['user-agent'];
      if (sniffer.headers['referer']) hds['Referer'] = sniffer.headers['referer'];
    }
    return {
      parse: 0,
      url: sniffer.url,
      header: hds,
    };
  }

  // 4. 直通
  return { parse: 0, url: id };
}
```

- [ ] **Step 4: 提交**

```bash
git add nodejs/src/spider/util/decoder.ts nodejs/src/spider/util/play-chain.ts nodejs/src/spider/video/ffm3u8.js
git commit -m "feat: NBY/jqq decoder + parser chain + spider play integration"
```

---

### Task 7: DLNA 投屏（SSDP 发现 + SOAP 控制）

**Files:**
- Create: `CatPlayer/app/ios/PlayerBridge/DLNACasting.h`
- Create: `CatPlayer/app/ios/PlayerBridge/DLNACasting.m`
- Create: `overlay/src/player/DLNACasting.ts`
- Modify: `CatPlayer/overlay/src/ui/screens/Settings.tsx`

**Interfaces:**
- Produces: `DLNACasting` NativeModule with `startDiscovery`/`stopDiscovery`/`cast:deviceId:`/`stop:deviceId:`
- Produces: `overlay/src/player/DLNACasting.ts` with device model + UI helpers
- Events: `onDeviceFound`, `onDeviceLost`, `onCastStatus`

- [ ] **Step 1: 创建 DLNACasting.h**

写 `CatPlayer/app/ios/PlayerBridge/DLNACasting.h`:

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface DLNACasting : RCTEventEmitter <RCTBridgeModule>
  RCT_EXPORT_METHOD(startDiscovery);
  RCT_EXPORT_METHOD(stopDiscovery);
  RCT_EXPORT_METHOD(cast:(NSString *)url deviceId:(NSString *)deviceId);
  RCT_EXPORT_METHOD(stop:(NSString *)deviceId);
  // Events: onDeviceFound, onDeviceLost, onCastStatus
@end
```

- [ ] **Step 2: 实现 DLNACasting.m**

写 `CatPlayer/app/ios/PlayerBridge/DLNACasting.m`:

```objc
#import "DLNACasting.h"
#import <UIKit/UIKit.h>
#import <CocoaAsyncSocket/GCDAsyncUdpSocket.h>

@interface DLNADevice : NSObject
@property (nonatomic, strong) NSString *deviceId;     // UDN
@property (nonatomic, strong) NSString *name;          // friendlyName
@property (nonatomic, strong) NSString *iconURL;
@property (nonatomic, strong) NSURL *locationURL;      // description.xml URL
@property (nonatomic, strong) NSURL *avTransportControlURL;
@property (nonatomic, strong) NSURL *renderingControlURL;
@property (nonatomic, strong) NSURL *connectionManagerURL;
@end

@implementation DLNADevice
@end

@interface DLNACasting () <GCDAsyncUdpSocketDelegate>
@property (nonatomic, strong) GCDAsyncUdpSocket *udpSocket;
@property (nonatomic, strong) NSMutableDictionary<NSString *, DLNADevice *> *devices;
@property (nonatomic) BOOL discovering;
@end

@implementation DLNACasting

RCT_EXPORT_MODULE();

- (instancetype)init {
  self = [super init];
  if (self) {
    _devices = [NSMutableDictionary dictionary];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents {
  return @[@"onDeviceFound", @"onDeviceLost", @"onCastStatus"];
}

// ── SSDP 发现 ──

RCT_EXPORT_METHOD(startDiscovery) {
  if (self.discovering) return;
  self.discovering = YES;

  NSError *error = nil;
  _udpSocket = [[GCDAsyncUdpSocket alloc] initWithDelegate:self delegateQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0)];

  // 绑定随机端口
  [_udpSocket bindToPort:0 error:&error];
  if (error) { RCTLogError(@"[DLNA] bind error: %@", error); return; }

  // 加入 SSDP 多播组
  [_udpSocket joinMulticastGroup:@"239.255.255.250" error:&error];
  if (error) { RCTLogError(@"[DLNA] join error: %@", error); return; }

  [_udpSocket beginReceiving:&error];
  if (error) { RCTLogError(@"[DLNA] receive error: %@", error); return; }

  // 发送 M-SEARCH
  NSString *search = @"M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1900\r\n"
    "ST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n"
    "MX: 3\r\n"
    "MAN: \"ssdp:discover\"\r\n"
    "USER-AGENT: iOS UPnP/1.1 CatPawOpenMy\r\n\r\n";
  [_udpSocket sendData:[search dataUsingEncoding:NSUTF8StringEncoding]
                toHost:@"239.255.255.250" port:1900 withTimeout:3 tag:0];

  // 5 秒后停止发现阶段（不停止 socket，持续接收设备通知）
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(5 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
    self.discovering = NO;
  });
}

RCT_EXPORT_METHOD(stopDiscovery) {
  self.discovering = NO;
  [_udpSocket leaveMulticastGroup:@"239.255.255.250"];
  [_udpSocket close];
  _udpSocket = nil;
}

// ── GCDAsyncUdpSocketDelegate ──

- (void)udpSocket:(GCDAsyncUdpSocket *)sock didReceiveData:(NSData *)data fromAddress:(NSData *)address withFilterContext:(id)filterContext {
  NSString *response = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (!response) return;

  // 解析 Location header
  NSError *error = nil;
  NSRegularExpression *locRegex = [NSRegularExpression regularExpressionWithPattern:@"Location:[ ]*(.*)" options:NSRegularExpressionCaseInsensitive error:&error];
  NSTextCheckingResult *match = [locRegex firstMatchInString:response options:0 range:NSMakeRange(0, response.length)];
  if (!match) return;

  NSString *locStr = [response substringWithRange:[match rangeAtIndex:1]];
  locStr = [locStr stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
  NSURL *locURL = [NSURL URLWithString:locStr];
  if (!locURL) return;

  // 下载 device description XML
  NSURLSessionDataTask *task = [[NSURLSession sharedSession] dataTaskWithURL:locURL completionHandler:^(NSData *data, NSURLResponse *res, NSError *err) {
    if (!data || err) return;
    NSString *xml = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [self parseDeviceXML:xml locationURL:locURL];
  }];
  [task resume];
}

- (void)parseDeviceXML:(NSString *)xml locationURL:(NSURL *)locationURL {
  // 简化 XML 解析：查找 friendlyName, UDN, 和 AVTransport controlURL
  // 生产环境应使用 NSXMLParser

  NSString *udn = [self extractXMLTag:xml tag:@"UDN"];
  NSString *friendlyName = [self extractXMLTag:xml tag:@"friendlyName"];

  if (!udn) return;
  if (self.devices[udn]) return; // 已发现

  DLNADevice *device = [[DLNADevice alloc] init];
  device.deviceId = udn;
  device.name = friendlyName ?: @"Unknown DLNA Device";
  device.locationURL = locationURL;

  // 查找 AVTransport service 的 controlURL
  NSString *avControlURL = [self extractServiceControlURL:xml serviceType:@"urn:schemas-upnp-org:service:AVTransport:1"];
  if (avControlURL) {
    device.avTransportControlURL = [NSURL URLWithString:avControlURL relativeToURL:locationURL];
  }

  self.devices[udn] = device;
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"onDeviceFound" body:@{
      @"id": device.deviceId,
      @"name": device.name,
      @"icon": device.iconURL ?: @"",
    }];
  });
}

- (NSString *)extractXMLTag:(NSString *)xml tag:(NSString *)tag {
  NSString *openTag = [NSString stringWithFormat:@"<%@>", tag];
  NSString *closeTag = [NSString stringWithFormat:@"</%@>", tag];
  NSRange openRange = [xml rangeOfString:openTag];
  if (openRange.location == NSNotFound) return nil;
  NSRange closeRange = [xml rangeOfString:closeTag options:0 range:NSMakeRange(openRange.location + openRange.length, xml.length - openRange.location - openRange.length)];
  if (closeRange.location == NSNotFound) return nil;
  return [xml substringWithRange:NSMakeRange(openRange.location + openRange.length, closeRange.location - openRange.location - openRange.length)];
}

- (NSString *)extractServiceControlURL:(NSString *)xml serviceType:(NSString *)serviceType {
  // 在 <service> 块内匹配 serviceType + controlURL
  NSString *pattern = [NSString stringWithFormat:@"<serviceType>%@</serviceType>.*?<controlURL>(.*?)</controlURL>", serviceType];
  NSError *error = nil;
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:pattern options:NSRegularExpressionDotMatchesLineSeparators error:&error];
  NSTextCheckingResult *match = [regex firstMatchInString:xml options:0 range:NSMakeRange(0, xml.length)];
  if (!match) return nil;
  NSString *controlURL = [xml substringWithRange:[match rangeAtIndex:1]];
  return controlURL;
}

// ── SOAP 控制 ──

RCT_EXPORT_METHOD(cast:(NSString *)url deviceId:(NSString *)deviceId) {
  DLNADevice *device = self.devices[deviceId];
  if (!device || !device.avTransportControlURL) {
    [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error"}];
    return;
  }

  [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"connecting"}];

  // SetAVTransportURI SOAP request
  NSString *soapBody = [NSString stringWithFormat:
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:SetAVTransportURI xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"      <CurrentURI>%@</CurrentURI>"
    @"      <CurrentURIMetaData></CurrentURIMetaData>"
    @"    </u:SetAVTransportURI>"
    @"  </s:Body>"
    @"</s:Envelope>", url];

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [soapBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    if (error) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error", @"error": error.localizedDescription}];
      });
      return;
    }
    // SetURI 成功后自动发送 Play
    [self sendPlayToDevice:device deviceId:deviceId];
  }] resume];
}

- (void)sendPlayToDevice:(DLNADevice *)device deviceId:(NSString *)deviceId {
  NSString *playBody =
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:Play xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"      <Speed>1</Speed>"
    @"    </u:Play>"
    @"  </s:Body>"
    @"</s:Envelope>";

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [playBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#Play\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!error) {
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"playing"}];
      } else {
        [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"error", @"error": error.localizedDescription}];
      }
    });
  }] resume];
}

RCT_EXPORT_METHOD(stop:(NSString *)deviceId) {
  DLNADevice *device = self.devices[deviceId];
  if (!device || !device.avTransportControlURL) return;

  NSString *stopBody =
    @"<?xml version=\"1.0\" encoding=\"utf-8\"?>"
    @"<s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\""
    @" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\">"
    @"  <s:Body>"
    @"    <u:Stop xmlns:u=\"urn:schemas-upnp-org:service:AVTransport:1\">"
    @"      <InstanceID>0</InstanceID>"
    @"    </u:Stop>"
    @"  </s:Body>"
    @"</s:Envelope>";

  NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:device.avTransportControlURL];
  req.HTTPMethod = @"POST";
  req.HTTPBody = [stopBody dataUsingEncoding:NSUTF8StringEncoding];
  [req setValue:@"text/xml; charset=\"utf-8\"" forHTTPHeaderField:@"Content-Type"];
  [req setValue:@"\"urn:schemas-upnp-org:service:AVTransport:1#Stop\"" forHTTPHeaderField:@"SOAPAction"];

  [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *error) {
    dispatch_async(dispatch_get_main_queue(), ^{
      [self sendEventWithName:@"onCastStatus" body:@{@"deviceId": deviceId, @"status": @"stopped"}];
    });
  }] resume];
}

@end
```

- [ ] **Step 2: 创建 overlay/src/player/DLNACasting.ts**

写 `CatPlayer/overlay/src/player/DLNACasting.ts`：

```typescript
import { NativeModules, NativeEventEmitter } from 'react-native';

const { DLNACasting } = NativeModules;

export interface DLNADevice {
  id: string;
  name: string;
  icon?: string;
}

export type CastStatus = 'connecting' | 'playing' | 'stopped' | 'error';

export interface CastStatusEvent {
  deviceId: string;
  status: CastStatus;
  error?: string;
}

class DLNACastingService {
  private emitter: NativeEventEmitter | null = null;
  private _devices: DLNADevice[] = [];
  private _listeners: Set<() => void> = new Set();

  get devices(): DLNADevice[] { return this._devices; }

  constructor() {
    if (DLNACasting) {
      this.emitter = new NativeEventEmitter(DLNACasting);
      this.emitter.addListener('onDeviceFound', (d: DLNADevice) => {
        if (!this._devices.find(x => x.id === d.id)) {
          this._devices.push(d);
          this.notify();
        }
      });
      this.emitter.addListener('onDeviceLost', (d: { id: string }) => {
        this._devices = this._devices.filter(x => x.id !== d.id);
        this.notify();
      });
    }
  }

  startDiscovery() { DLNACasting?.startDiscovery(); }
  stopDiscovery() { DLNACasting?.stopDiscovery(); }
  cast(url: string, deviceId: string) { DLNACasting?.cast(url, deviceId); }
  stop(deviceId: string) { DLNACasting?.stop(deviceId); }

  onCastStatus(cb: (e: CastStatusEvent) => void) {
    return this.emitter?.addListener('onCastStatus', cb);
  }

  onChange(cb: () => void) {
    this._listeners.add(cb);
    return () => this._listeners.delete(cb);
  }

  private notify() { this._listeners.forEach(cb => cb()); }
}

export const dlnaService = new DLNACastingService();

/** React 组件：投屏设备列表弹窗 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList } from 'react-native';

export function DLNAPicker({ visible, onClose, castUrl }: { visible: boolean; onClose: () => void; castUrl?: string }) {
  const [devices, setDevices] = useState<DLNADevice[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setScanning(true);
    dlnaService.startDiscovery();
    const off = dlnaService.onChange(() => setDevices([...dlnaService.devices]));
    setTimeout(() => { setScanning(false); }, 5000);
    return () => { off(); dlnaService.stopDiscovery(); };
  }, [visible]);

  const handleCast = useCallback((device: DLNADevice) => {
    if (castUrl) dlnaService.cast(castUrl, device.id);
    onClose();
  }, [castUrl, onClose]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ width: '85%', backgroundColor: '#1c1c1e', borderRadius: 14, padding: 20 }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 16 }}>投屏</Text>
          {scanning && <Text style={{ color: '#888', marginBottom: 12 }}>正在扫描设备...</Text>}
          {devices.length === 0 && !scanning && <Text style={{ color: '#888', marginBottom: 12 }}>未发现设备</Text>}
          <FlatList
            data={devices}
            keyExtractor={d => d.id}
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleCast(item)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#333' }}>
                <Text style={{ color: '#fff', fontSize: 16 }}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={onClose} style={{ marginTop: 16, padding: 12, backgroundColor: '#333', borderRadius: 8, alignItems: 'center' }}>
            <Text style={{ color: '#fff' }}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 3: 在 Settings 页面集成 DLNA 弹窗**

在 `CatPlayer/overlay/src/ui/screens/Settings.tsx` 中：

1. 新增状态 `const [showDLNAModal, setShowDLNAModal] = useState(false);`
2. 在投屏设置行调用 `() => setShowDLNAModal(true)`
3. 在 JSX 末尾（Modal 区域）添加：

```tsx
<DLNAPicker visible={showDLNAModal} onClose={() => setShowDLNAModal(false)} castUrl={undefined} />
```

同时需要在文件顶部 import：

```typescript
import { DLNAPicker } from '../../player/DLNACasting';
```

- [ ] **Step 4: 提交**

```bash
git add CatPlayer/app/ios/PlayerBridge/DLNACasting.h CatPlayer/app/ios/PlayerBridge/DLNACasting.m CatPlayer/overlay/src/player/DLNACasting.ts CatPlayer/overlay/src/ui/screens/Settings.tsx
git commit -m "feat: DLNA casting via SSDP discovery + SOAP control + UI"
```

---

### Task 8: 收尾 — Spider 适配 + 历史记录兼容 + 文档

**Files:**
- Modify: `nodejs/src/spider/video/ffm3u8.js` (已在 Task 6 完成)
- Modify: `overlay/src/api/CatApi.ts` — 可选，增加 sniff 前置预处理
- Modify: `CLAUDE.md` （项目根目录）
- No new files

**Interfaces:**
- Consumes: All previous tasks
- Produces: Updated `CLAUDE.md` documenting new features
- Produces: Verified `ffm3u8.js` play chain works end-to-end

- [ ] **Step 1: CatApi.play 可选嗅探前置**

在 `CatPlayer/overlay/src/api/CatApi.ts` 的 `play()` 函数中增加对非 m3u8 URL 的前置嗅探逻辑：

```typescript
play: async (api: string, flag: string, id: string) => {
  NodeService?.log?.('[CatApi] play for ' + api + ' flag=' + flag + ' id=' + id);
  // 非 m3u8 URL 时，尝试前置嗅探
  if (!id.includes('.m3u8') && !id.startsWith('NBY-') && !id.startsWith('jqq-')) {
    try {
      const { SniffModule } = require('react-native').NativeModules;
      if (SniffModule) {
        const sniffResult = await SniffModule.sniff(id, 'http((?!http).){12,}?\\.m3u8(?!\\?)', 10000);
        if (sniffResult?.url) {
          // 用嗅探到的 m3u8 URL 代替原始 id
          return post(api, 'play', { flag, id: sniffResult.url });
        }
      }
    } catch {}
  }
  return post(api, 'play', { flag, id });
},
```

- [ ] **Step 2: 更新 CLAUDE.md — 新增功能文档**

在 `/Users/yangxiying/Documents/data/my-project/CatPawOpenMy/CLAUDE.md` 中追加新功能说明：

在 `## Architecture` 段的适当位置添加：

```markdown
### MiraPlay Feature Parity

| 功能 | 状态 | 技术实现 |
|------|------|---------|
| mpv 播放引擎 | iOS only | libmpv static lib + MPVPlayer NativeModule |
| 多引擎切换 | iOS only | overlay/src/player/engines.ts 注册表 |
| HLS 反向代理 | Node.js | nodejs/src/proxy/hls.ts Fastify plugin |
| URL 嗅探 | iOS only | WKWebView + SniffModule NativeModule |
| NBY/jqq 解码 | Node.js | nodejs/src/spider/util/decoder.ts |
| DLNA 投屏 | iOS only | GCDAsyncUdpSocket SSDP + SOAP control |
```

- [ ] **Step 3: 端到端验证**

Run:
```bash
cd /Users/yangxiying/Documents/data/my-project/CatPawOpenMy/nodejs
npm run build
node -e "
const { resolvePlayUrl } = require('./dist/index.js');
// 测试直链
resolvePlayUrl('https://example.com/video.mp4').then(r => console.log('direct:', r));
// 测试 m3u8
resolvePlayUrl('https://example.com/stream.m3u8').then(r => console.log('m3u8:', r));
"
```

Expected: 直链返回 `{ parse: 0, url: 'https://...' }`，m3u8 URL 返回 `{ parse: 0, url: 'https://...' }`（未改走 proxy：proxy 重写在 ffm3u8.js play handler 中完成，不在 resolvePlayUrl 中）

验证 build 编译无误：
```bash
cd /Users/yangxiying/Documents/data/my-project/CatPawOpenMy/nodejs
npm run build 2>&1 | tail -5
```

Expected: `Build complete` 或无报错。

- [ ] **Step 4: 提交**

```bash
git add overlay/src/api/CatApi.ts CLAUDE.md
git commit -m "chore: spider play sniff pre-processing + documentation update"
```

---

## Scope Compliance

对照 `openspec/changes/miraplay-feature-parity/proposal.md`：

| Capability | Task | Status |
|------------|------|--------|
| `player-engine-mpv` | Task 1 + Task 2 | 编译脚本 + NativeModule |
| `player-ui-multisource` | Task 3 | VideoPlayer facade + Settings |
| `url-sniffer` | Task 5 | SniffModule + NodeService |
| `hls-proxy` | Task 4 | Fastify plugin |
| `crypto-decoder` | Task 6 | NBY/jqq/parser chain |
| `dlna-casting` | Task 7 | DLNACasting + UI |
| `play-spider` (mod) | Task 6 + Task 8 | ffm3u8 play + CatApi sniff |
| `nodejs-runtime-signaling` (mod) | Task 5 | correlationId channel |

## Open Questions

- `NBY` 精确密钥算法需对照 tvbox 源码验证 — 当前实现为 AES-256-ECB，密钥从 `|` 后部分提取
- `ffm3u8.js` 的 `messageToDart` sniff 请求需 Dart/Flutter 端配合实现转发到 RN
- `pod install` / CocoaAsyncSocket 集成需要在 `Podfile` 添加 `pod 'CocoaAsyncSocket'`
