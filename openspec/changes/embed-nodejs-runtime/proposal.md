# 嵌入 Node.js 运行时 — Proposal

## 问题描述

当前 CatPaw 使用 WebView + JS polyfill 方案模拟 Node.js 环境来运行远程视频源 bundle。这种方案存在严重的兼容问题：

1. **Crypto API 是 stub**：`createHash.digest()` 返回原始数据的 hex 编码而非真正哈希值，`createHmac` 同理
2. **HTTP 请求走 proxy**：所有请求通过 WebView bridge → RN → 外发，增加了延迟和复杂性
3. **远程 bundle 纯 JS 执行**：`require('crypto-js')`、`createDecipheriv("aes-256-ecb")` 等操作在 polyfill 中要么不支持要么有 bug
4. **性能差**：每次请求都要经过 WebView ↔ RN 桥接，增加延迟
5. **维护成本高**：每个新的 API 需求都需要在 polyfill 中加 stub

## 根因分析

根本原因是在 iOS 18 上 `nodejs-mobile-react-native` 出现兼容问题后，项目改用 WebView polyfill 替代。polyfill 无法完美模拟 Node.js 的所有原生 API，尤其是 crypto、fs、net 等涉及底层系统调用的模块。

## 修复目标

恢复嵌入真实 Node.js 运行时，确保：

1. `require('crypto')` 返回真实 crypto 模块（哈希、HMAC、AES 加解密全部可用）
2. `require('http')` / `require('https')` 创建真实的 HTTP 服务器和客户端
3. `require('fs')` 能读写真实文件系统
4. 远程 bundle（cat.999888123.xyz）用真实 `require()` 加载，全部 API 可用
5. WebView polyfill 保留为降级方案
