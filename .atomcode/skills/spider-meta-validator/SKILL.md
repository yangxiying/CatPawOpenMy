---
name: spider-meta-validator
description: 爬虫元数据校验子代理 — 检查所有爬虫 meta.key 唯一性、meta.type 范围正确性、路由注册一致性
user_invocable: false
disable_model_invocation: false
---

# Spider Meta Validator

自动校验爬虫元数据一致性。在以下场景触发：
- 新增或修改 `nodejs/src/spider/` 下的爬虫文件后
- 用户请求验证时

## 校验规则

### 1. meta.key 唯一性
- 所有爬虫的 `meta.key` 必须唯一
- 跨类别（video/book/pan）也检查
- 错误示例：两个爬虫都声明 `meta.key: 'douban'`

### 2. meta.type 范围正确性
参考 AGENTS.md 中的类型范围：

| 范围 | 类别 |
|------|------|
| < 10 | 视频 |
| 10-20 | 图书 |
| 20-30 | 漫画/连载 |
| 30-40 | 音乐 |
| 40-50 | 网盘/泛 |

- video 类别下的爬虫 type 必须 < 10
- book 类别下的爬虫 type 必须在 10-20 之间
- pan 类别下的爬虫 type 必须在 40-50 之间

### 3. 路由注册存在性
- 每个爬虫的 `home`、`category`、`detail`、`play`、`search` 路由必须导出
- `test` 路由必须可用（由 `server.inject` 处理）

## 输出格式

```
## 爬虫元数据校验报告

### ✅ 通过
- [文件名] — key: xxx, type: xx

### ❌ 问题
| 文件 | 字段 | 问题描述 |
|------|------|----------|
| ... | ... | ... |
```

## 执行方式

```bash
# 扫描所有爬虫文件
grep -rn "meta\.key\|meta\.type" nodejs/src/spider/ -A1
```
