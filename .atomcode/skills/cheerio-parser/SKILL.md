---
name: cheerio-parser
description: 爬虫 HTML 解析助手 — 提供 cheerio 选择器优化、DOM 遍历最佳实践、数据提取管道建议
user_invocable: false
disable_model_invocation: false
---

# cheerio-parser

为 CatPawOpenMy 的 spider 爬虫开发提供 cheerio HTML 解析指导。

## 职责

- 在开发新爬虫时，帮助设计高效的 cheerio 选择器
- 优化现有爬虫的 DOM 遍历逻辑
- 提供数据提取管道的最佳实践建议
- 处理编码转换（iconv-lite）、HTML 清洗等常见问题

## 最佳实践

### 选择器优化
- 优先使用 `id` 选择器（`#id`）而非 class 选择器
- 长链选择器（`div > ul > li > a`）改为更具体的单级选择器
- 避免使用 `:nth-child` 等低效伪类

### 数据提取
```
// 推荐：链式调用 + 可选链
const title = $('.title').text().trim();
const link = $('a.link').attr('href');

// 批量提取用 .map() + get()
const items = $('.item').map((i, el) => ({
  title: $(el).find('.title').text().trim(),
  url: $(el).find('a').attr('href')
})).get();
```

### 编码处理
- 对 GBK/GB2312 页面使用 `iconv-lite` 解码
- 在 `req.js` 的 axios 响应中指定 `responseType: 'arraybuffer'`

### 错误处理
- 选择器匹配不到元素时返回空数组而非抛错
- 使用 `try/catch` 包裹 cheerio 加载过程
- 对嵌套数据使用可选链（`?.`）防止 `Cannot read properties of undefined`

## 参考资源

- 项目内所有爬虫位于 `nodejs/src/spider/`
- HTTP 请求统一走 `nodejs/src/util/req.js`
- 工具函数见 `nodejs/src/util/misc.js`
