# 嵌入 Node.js 运行时 — Design Doc

## 方案选型

| 方案 | 体积增加 | 复杂度 | iOS 18 兼容 | 推荐 |
|------|---------|--------|-------------|------|
| **A: nodejs-mobile-react-native** | ~35MB | 中 | ✅ 18.20.4 版已修复 | ✅ |
| B: Node.js for Mobile Apps 原生集成 | ~30MB | 高 | 待验证 | ❌ |
| C: 自定义 Node.js 编译 + native bridge | ~25MB | 极高 | 需自行维护 | ❌ |

## 架构设计

### 当前架构（WebView polyfill）

```
App (RN)
  → NodeService.request() → WebView bridge
    → Polyfill HTTP Server (port 18080)
      → Remote bundle handlers (fake Node.js)
```

### 目标架构（Native Node.js）

```
App (RN)
  → NodeService.request() → Native Bridge (nodejs-mobile)
    → Node.js Runtime (real crypto/http/fs)
      → Fastify Server (real)
        → Built-in spiders (real)
        → Remote bundle (loaded via real require())
```

### MiraPlay 参考架构

```
App (iOS native)
  → process._linkedBinding('myaddon')  ← 原生插件桥
    → Node.js Event Loop
      → createServer(handle) ← 真实 HTTP 服务器
      → loadScript(path)     ← require() 加载远程 bundle
      → registerCallback()   ← 接收 native 端消息
```

我们将采用类似结构，但通过 `nodejs-mobile-react-native` 的 RN bridge 替代 `myaddon`。

## 核心组件

### 1. nodejs-mobile-react-native 集成

```
nodejs-assets/
├── nodejs-project/
│   ├── main.js          ← 服务入口（类似 dev.js）
│   ├── index.config.js  ← 配置
│   └── node_modules/    ← 预构建依赖
```

`main.js` 将包含：
- `catServerFactory` — 创建真实 HTTP 服务器
- `catDartServerPort` — 返回 native 端端口
- `loadScript(path)` — `require()` 加载远程 bundle（参考 MiraPlay）

### 2. 原生桥接模块

`nodejs-mobile-react-native` 已提供：
- `nodejs.start()/stop()` — 启动/停止 Node.js 引擎
- `nodejs.channel.send/recv` — Node.js ↔ RN 通信

我们需要在 Node.js 侧创建通道处理：

```javascript
// main.js（运行在真实 Node.js 中）
const rn_bridge = require('rn-bridge');

rn_bridge.channel.on('request', (msg) => {
    // 处理 CatApi 请求
    const result = handleRequest(JSON.parse(msg));
    rn_bridge.channel.send(JSON.stringify(result));
});

rn_bridge.channel.on('loadScript', (path) => {
    // 加载远程 bundle
    const mod = require(path);
    mod.start(config);
});
```

### 3. 远程 bundle 加载机制

参考 MiraPlay 的 `loadScript()`：

```javascript
function loadScript(path) {
    try {
        delete require.cache[require.resolve(path + '/index.js')];
        const mod = require(path + '/index.js');
        const config = require(path + '/index.config.js');
        mod.start(config.default || config);
    } catch (e) {
        console.error('loadScript failed:', e);
    }
}
```

### 4. CatApi 路由改造

所有 `/spider/*` 和 `/config` 请求由两种路径处理：
1. **本地 Spider**（`nodejs` 服务内置）→ Node.js 的 Fastify 直接处理
2. **远程 Bundle Spider**（`cat.999888123.xyz` 提供）→ 也由同一 Node.js 实例的 `loadScript()` 加载后处理

不再需要 WebView 桥接层，请求直连 Node.js runtime。

### 5. 降级方案

保留 WebView polyfill 作为回退选项：
- 如果 `nodejs-mobile-react-native` 初始化失败 → 回退到 WebView polyfill
- setup.sh 的 `--minimal` 参数保留纯 WebView 模式
- 通过配置文件开关控制

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `CatPlayer/setup.sh` | 修改 | 恢复 nodejs-mobile-react-native 安装 |
| `CatPlayer/app/package.json` | 修改 | 添加 nodejs-mobile-react-native 依赖 |
| `nodejs/src/main.js` | **新建** | Node.js 运行时入口（类似 dev.js + MiraPlay main.js） |
| `nodejs/esbuild.js` | 修改 | 打包产出放入 nodejs-assets/ |
| `CatPlayer/app/src/node/NodeService.tsx` | 修改 | 替换 WebView 逻辑为原生 Node.js 调用 |
| `CatPlayer/app/src/node/NodeService.tsx` | 新增通道 | 添加 `rn-bridge` 消息处理 |
| `CatPlayer/overlay/src/node/polyfills.js` | 保留 | 作为降级方案 |
| `CatPlayer/build-ipa.sh` | 修改 | 确保 nodejs-assets/ 被打包进 IPA |
| `docs/ARCHITECTURE.md` | 更新 | 记录新架构 |

## 通信协议

### RN → Node.js（请求）

```json
{
  "type": "api-request",
  "id": 1,
  "method": "POST",
  "url": "/spider/douban/3/home",
  "headers": {"content-type": "application/json"},
  "body": "{}"
}
```

### Node.js → RN（响应）

```json
{
  "type": "api-response",
  "id": 1,
  "status": 200,
  "headers": {"content-type": "application/json"},
  "body": "{\"class\":[...],\"list\":[...]}"
}
```

### Node.js → RN（日志）

```json
{
  "type": "node-log",
  "message": "[crypto] createDecipheriv algo=aes-256-ecb"
}
```

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| iOS 18 仍有兼容问题 | 低 | 高 | 保留 WebView polyfill 降级 |
| IPA 体积增长 ~35MB | 高 | 中 | 使用 App Thinning；警告用户 |
| CI 构建时间延长 | 中 | 低 | 缓存 nodejs-assets/ |
| nodejs-mobile 偶发崩溃 | 低 | 高 | 自动重启 + fallback 到 polyfill |
