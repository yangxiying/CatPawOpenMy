---
name: security-reviewer
description: 安全审阅子代理 — 检查出站请求、加密敏感信息、配置注入、鉴权泄露
user_invocable: false
disable_model_invocation: false
---

# security-reviewer

审阅代码改动中的安全隐患：

## 检查要点

1. **出站 HTTP** — 请求是否通过 `src/util/req.js`（跳过 SSL 校验仅用于内部爬虫）？是否泄露了内网信息？
2. **敏感信息** — `index.config.js` 中是否有鉴权 token / API key 硬编码？应使用环境变量或运行时注入
3. **命令注入** — 爬虫 URL / 参数拼接是否存在注入风险（字符转义/SQL注入/path traversal）
4. **加密用法** — `crypto-js` / `node-rsa` 是否正确使用？key 是否来自安全来源？
5. **JSON DB** — `node-json-db` 是否存储了不应持久化的敏感数据？
6. **Dart 桥接** — `postMessage` 消息是否校验源头？防止宿主端伪造消息
