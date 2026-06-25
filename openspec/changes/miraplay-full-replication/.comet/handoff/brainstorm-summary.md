# Brainstorm Summary

- Change: miraplay-full-replication
- Date: 2026-06-25

## 确认的技术方案

- **NodeMobile**: 从 MiraPlay IPA 提取 NodeMobile.framework（Node 18.20）→ catPlayer/app/Frameworks/
- **通信**: nodejs-mobile-react-native rn-bridge（channel.on/send），替代 WebView polyfill
- **main.js**: 纯运行时入口，内嵌 rn-bridge + loadScript + catServerFactory，**不内嵌 spider bundle**
- **蜘蛛来源唯一**: 远程源 URL 下载 → MD5 校验 → rn-bridge send {action:'run', path} → loadScript → start
- **不降级**: NodeMobile 不可用时报错，不创建 WebView polyfill（移除所有 polyfill 代码）
- **Boot 页**: 等待 server-ready 事件驱动（无超时），用户可手动重试
- **mpv**: CI 先编译 build-mpv-ios.sh，失败则 IPA 继续构建（仅 BuiltinEngine）
- **BuiltinEngine**: 补全为完整播放引擎（react-native-video <Video>）

## 关键取舍与风险

| 风险 | 缓解 |
|------|------|
| iOS 18 NodeMobile 兼容 | 提取版已验证在 MiraPlay IPA 中工作 |
| mpv 编译 CI 超时 | 编译失败继续构建，BuiltinEngine 兜底 |
| 无 WebView 降级 | 失败即报错，用户须配远程源或重试 |

## 测试策略

1. NodeMobile 启动 → server-ready → fetch /config → 站点列表
2. 远程源配置 → MD5 校验 → 下载 → loadScript → 显示远程站点
3. mpv 播放 / BuiltinEngine 回退
4. CI 完整构建 → IPA Release

## Spec Patch

- `specs/remote-source-loading/spec.md`: 默认源改为"引导用户配置"
- `specs/node-mobile-runtime/spec.md`: 删除 WebView polyfill 降级场景，改为无降级
- `specs/node-mobile-runtime/spec.md`: main.js 不内嵌 spider bundle
