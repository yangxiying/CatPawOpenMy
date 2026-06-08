---
name: new-spider
description: 生成新爬虫骨架 — 包含 meta.key / meta.type / api 路由（init, home, category, detail, play, search, test）
user_invocable: true
disable_model_invocation: true
---

# new-spider

为 CatPawOpenMy 生成一个新爬虫模块文件。

## 用法

```bash
new-spider <key> <type> <category>
```

示例：`new-spider mydemo 5 video`

## 参数

| 参数 | 说明 |
|------|------|
| key | 爬虫唯一标识（字母数字，中划线分隔） |
| type | 内容类型编号：<10 视频，10-20 图书，20-30 漫画，30-40 音乐，40-50 网盘 |
| category | 放置目录名（如 video, book, comic, music, pan） |

## 输出

在 `nodejs/src/spider/<category>/` 下创建 `<key>.js` 文件，含完整路由骨架。
