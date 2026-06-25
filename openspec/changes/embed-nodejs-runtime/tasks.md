# 嵌入 Node.js 运行时 — 任务清单

## Phase 1：基础设施 ✅

- [x] **1.1 添加 nodejs-mobile-react-native 依赖**
  - setup.sh 已添加 `npm install nodejs-mobile-react-native@18.20.4`
- [x] **1.2 创建 Node.js 运行时入口文件**
  - `nodejs/src/main.js` — `catServerFactory`、`catDartServerPort`、`loadScript`、rn-bridge
- [x] **1.3 更新 esbuild 打包配置**
  - `nodejs/esbuild.js` 同时输出 `dist/index.js`（spider bundle）和 `dist/nodejs-runtime.js`（运行时）

## Phase 2：原生集成 ✅

- [x] **2.1 更新 setup.sh**
  - 安装 nodejs-mobile-react-native，复制 nodejs-assets/
- [x] **2.2 更新 build-ipa.sh**
  - RN 构建系统自动包含 nodejs-assets/（无需修改）
- [x] **2.3 创建原生桥接模块**
  - Node.js 侧：main.js 的 rn-bridge.channel 消息循环
  - RN 侧：NodeService.tryNativeNode() + nativeNodeRequest()

## Phase 3：NodeService 改造

- [x] **3.1 替换 NodeService.request() 实现**
  - 双通道：优先走原生 Node.js（rn-bridge），失败降级 WebView polyfill
- [ ] **3.2 实现远程 bundle 下载 + loadScript 联动**
  - NodeService.init() 下载远程 bundle 后，通过 rn-bridge 通知 Node.js 运行时
  - Node.js 侧的 loadScript(path) 用真实 require() 加载
- [ ] **3.3 实现日志转发**
  - Node.js 的 console.log → rn-bridge.channel → RN 日志

## Phase 4：远程 bundle 加载

- [ ] **4.1 完善 loadRemoteBundle 流程**
  - RN 侧：下载 bundle 到本地路径 → 发送 load-remote-bundle 消息
  - Node.js 侧：接收消息 → require() 加载 → start(config)
- [ ] **4.2 路由聚合**
  - Node.js 运行时同时服务内置 spider + 远程 bundle spider
  - /config 端点聚合所有 spider

## Phase 5：验证与收尾

- [x] **5.1 测试内置 spider**
- [x] **5.2 测试远程 bundle（9280.kstore.vip/cat）**
- [ ] **5.3 测试降级方案（WebView polyfill）**
- [ ] **5.4 清理旧代码和诊断日志**
- [ ] **5.5 更新文档**

## Phase 6：MiraPlay iOS 验证

- [x] **6.1 内联 spider bundle（nodejs/dist → spider-bundle-string.ts）**
- [x] **6.2 配置源 URL（overlay/src/config.ts = 9280.kstore.vip/cat）**
- [x] **6.3 应用 overlay 到 app/（setup.sh 等价操作）**
- [x] **6.4 Metro bundle 编译验证**
- [ ] **6.5 iOS 模拟器运行测试**
