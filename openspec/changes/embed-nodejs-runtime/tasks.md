# 嵌入 Node.js 运行时 — 任务清单

## Phase 1：基础设施

- [ ] **1.1 添加 nodejs-mobile-react-native 依赖**
  - 更新 `CatPlayer/app/package.json`
  - 执行 `npm install nodejs-mobile-react-native@18.20.4`
- [ ] **1.2 创建 Node.js 运行时入口文件**
  - 新建 `nodejs/src/main.js`（基于 dev.js + MiraPlay main.js）
  - 实现 `catServerFactory`、`catDartServerPort`、`loadScript(path)`
  - 实现 rn-bridge 通道通信
- [ ] **1.3 更新 esbuild 打包配置**
  - `nodejs/esbuild.js` 打包产出同时输出到 `nodejs-assets/`
  - 确保 node_modules 正确包含

## Phase 2：原生集成

- [ ] **2.1 更新 setup.sh**
  - 恢复 nodejs-mobile-react-native 安装
  - 将 nodejs-assets/ 复制到 app 目录
  - 原生补丁配置
- [ ] **2.2 更新 build-ipa.sh**
  - 确保 nodejs-assets/ 被打包进 IPA
- [ ] **2.3 创建原生桥接模块**
  - Node.js 侧：`rn-bridge.channel` 消息循环
  - RN 侧：`NodeService` 改为通过 rn-bridge 通信

## Phase 3：NodeService 改造

- [ ] **3.1 替换 NodeService.request() 实现**
  - WebView 路径 → rn-bridge 路径
  - 添加降级检测（Node.js 不可用时回退 WebView）
- [ ] **3.2 更新 CatApi 路由**
  - 所有 spider 请求走 Node.js runtime
  - 远程 bundle 通过 `loadScript()` 加载
- [ ] **3.3 实现日志转发**
  - Node.js 的 console.log → RN 日志

## Phase 4：远程 bundle 加载

- [ ] **4.1 实现 loadScript(path)**
  - 下载远程 bundle 文件到本地
  - 用真实 `require()` 加载
  - 调用 `mod.start(config)`
- [ ] **4.2 远程 bundle 路由集成**
  - 远程 bundle 的 spider 路由注册到同一个 Fastify 实例
  - `/config` 聚合本地 + 远程 spider

## Phase 5：验证与收尾

- [ ] **5.1 测试内置 spider（douban、kunyu77 等）**
- [ ] **5.2 测试远程 bundle（cat.999888123.xyz）**
- [ ] **5.3 测试降级方案（WebView polyfill）**
- [ ] **5.4 清理旧代码**
  - 移除不再需要的 polyfill 代码
  - 移除诊断日志
- [ ] **5.5 更新文档**
