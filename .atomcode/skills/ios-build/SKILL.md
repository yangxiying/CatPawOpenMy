---
name: ios-build
description: 一键构建 iOS IPA — 先执行 setup.sh 初始化，再执行 build-ipa.sh 打包
disable_model_invocation: true
user_invocable: true
---

# ios-build

构建 CatPawOpenMy iOS 客户端 IPA 包。

## 流程

1. **初始化**: 在 `CatPlayer/` 目录下执行 `./setup.sh`
2. **打包**: 执行 `./build-ipa.sh` 生成 IPA

## 用法

```bash
# 一键构建（请在 macOS 下运行）
cd CatPlayer && ./setup.sh && ./build-ipa.sh
```

## 注意

- 需要 macOS >= 12.5 与 Xcode >= 14.3
- CI 环境使用 `--minimal` 和 `--skip-pod` 参数
- 本地全量编译时间较长，建议用 CI（macos-14）构建 IPA
- 构建产物位于 `CatPlayer/` 目录下
