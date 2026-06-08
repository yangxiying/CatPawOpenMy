---
name: spider-test
description: 快速自测爬虫 — 启动 dev → curl /config 找 key → 执行 /spider/<key>/<type>/test
user_invocable: true
disable_model_invocation: true
---

# spider-test

快速验证某个爬虫是否正常工作。

## 用法

```bash
spider-test <key> <type>
```

示例：`spider-test mydemo 5`

## 流程

1. 确保 dev 服务在 3006 端口运行
2. 调用 `curl -sS "http://127.0.0.1:3006/spider/<key>/<type>/test" -X POST -H 'Content-Type: application/json' -d '{}'`
3. 输出完整的 JSON 链路诊断信息
