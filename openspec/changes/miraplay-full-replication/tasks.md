## 1. NodeMobile 框架集成

- [x] 1.1 从 MiraPlay IPA 提取 NodeMobile.framework 到 `CatPlayer/app/Frameworks/`
- [x] 1.2 安装 `nodejs-mobile-react-native` npm 依赖
- [x] 1.3 patch.js: Podfile post_install FRAMEWORK_SEARCH_PATHS 优先指向 `../Frameworks`

## 2. main.js NodeMobile 入口

- [x] 2.1 创建 `nodejs/src/main.js`：builtinModules 加载、catServerFactory、catDartServerPort、loadScript(path)、rn-bridge 消息循环
- [x] 2.2 esbuild 输出 `dist/nodejs-runtime.js`
- [x] 2.3 setup.sh 复制到 `app/nodejs-assets/nodejs-project/main.js`

## 3. NodeService 改造

- [x] 3.1 重写 `tryNativeNode()`：NodeJS.start('main.js') → 事件驱动等 server-ready（无超时）
- [x] 3.2 实现 `nativeNodeRequest()`：fetch(`http://127.0.0.1:{port}{url}`) 直连 HTTP
- [x] 3.3 远程源下载：StorageService sourceUrl → MD5 校验 → 下载 → rn-bridge send(`action:'run'`)
- [x] 3.4 sourceUrl 未配置时 Boot 页引导用户设置
- [x] 3.5 移除 polyfill-string.ts / spider-bundle-string.ts / bridge.ts 导入和使用
- [x] 3.6 移除 WebViewNode 组件创建（保留网站源 UI 渲染单独判断）

## 4. BuiltinEngine 补全

- [x] 4.1 补全 BuiltinEngine.ts：集成 react-native-video `<Video>` 组件
- [x] 4.2 实现完整 PlayerEngine 接口：play/pause/resume/seek/setRate/setQuality
- [x] 4.3 实现事件转发：onProgress/onError/onLoad/onEnd
- [x] 4.4 engines/index.ts 的 createEngine 在 mpv 不可用时回退 BuiltinEngine

## 5. CI + mpv 编译

- [x] 5.1 更新 build-ios.yml：xcodebuild 前先执行 build-mpv-ios.sh
- [x] 5.2 mpv 编译失败时 IPA 继续构建
- [x] 5.3 调整 CI timeout 到 120min

## 6. 验证与清理

- [ ] 6.1 验证 NodeMobile 启动 → server-ready → fetch /config → 站点列表
- [ ] 6.2 验证远程源下载 → loadScript → start → 远程站点显示
- [ ] 6.3 验证 mpv 播放和 BuiltinEngine 回退
- [ ] 6.4 验证未配置源 URL 时引导用户设置
- [x] 6.5 清理旧代码和脚本（inline-polyfill.mjs、inline-spider-bundle.mjs）
- [x] 6.6 更新 CLAUDE.md 和 AGENTS.md
