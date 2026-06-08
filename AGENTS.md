简洁速查卡 — 高信号提示（为自动化 agent 设计）

必会命令
- 开发（热重载）：cd nodejs && npm install && npm run dev
- 生产打包：cd nodejs && npm install && npm run build
- 仅构建可读配置：cd nodejs && npm run build:config
- iOS 一键生成（Mac）：cd CatPlayer && ./setup.sh
- iOS 打包 IPA（推荐 CI）：cd CatPlayer && ./build-ipa.sh

先看哪些文件（优先级）
- nodejs/src/index.js — 服务入口，导出 start(config)/stop()（嵌入到移动端）。
- nodejs/src/dev.js — 本地 launcher，设置 global catServerFactory / catDartServerPort 并在 dev 下调用 start()。
- nodejs/esbuild.js & nodejs/esbuild-config.js — 负责生成 dist/ 与 .md5（必须存在）。
- nodejs/package.json — 脚本为权威（dev/build/_build/build:config），不要绕过。
- CatPlayer/README.md 与 CatPlayer/setup.sh — iOS 本地初始化与 CI 差异说明。

关键约束（改动前必须知道）
- 这是嵌入运行的 Node 服务：start(config) 会被宿主多次调用，不要假设单次进程生命周期。
- 开发端口 DEV_HTTP_PORT=3006；在 App 中运行时使用端口 0（由系统分配）。
- 持久化 db 路径：(process.env.NODE_PATH || '.') + '/db.json'。未设置 NODE_PATH 会把 db 写到仓库根。
- index.config.js 必须保持可读（构建时不压缩）；构建脚本会生成 dist/*.md5，App 依赖这些 md5 文件验证完整性。
- esbuild 在生产会压缩 dist/index.js，但不会压缩 index.config.js。使用 npm run build 以产出全部文件与 md5。
- 所有爬虫出站 HTTP 都通过 nodejs/src/util/req.js（keep-alive、跳过 SSL 校验），改动会影响全体爬虫。
- Prettier printWidth=10000：不要盲目折行长行。

单个爬虫自测（快速）
- 路径：nodejs/src/spider/<category>，每个模块导出 meta.key 与 meta.type，路由注册到 /spider/<key>/<type>。
- 流程：
  1) 启动 dev：cd nodejs && npm run dev（nodemon）
  2) 找 key/type：curl -sS http://127.0.0.1:3006/config | jq '.'
  3) 调用自测：curl -sS -X POST "http://127.0.0.1:3006/spider/<key>/<type>/test" -H 'Content-Type: application/json' -d '{}'
  期望：返回 JSON，包含爬虫内部链路与诊断信息（自调用 server.inject）。

爬虫类型快速参考（meta.type 范围）
- <10: 视频  10-20: 图书  20-30: 漫画/连载  30-40: 音乐  40-50: 网盘/泛

常见故障与可执行排查（简明）
- /config 缺条目：确认 npm run dev 正在运行，控制台应有 "Run on 3006"；检查 spider 文件里 meta.key/meta.type 是否写错或重复。
- /spider/.../test 返回 500：查看终端 Fastify 错误堆栈（onError 已打印）；检查爬虫内 axios 请求、编码、选择器；关注 nodejs/src/util/req.js 的超时/keepAlive 设置。
- play 返回不可播：在 play 路由临时打印中间结果，用 curl/Postman 重放上游请求，确认最终 play URL 可直接访问（或需要额外 header/cookie/鉴权）。
- db.json 写到仓库：检查 echo $NODE_PATH；建议开发环境设置 NODE_PATH 指向临时目录避免污染仓库。
- 构建缺 md5 或 dist：cd nodejs && npm run _build（观察原始错误），检查 dist 写权限与 NODE_ENV 设置。

小技巧
- 快速定位爬虫：rg "meta\.key|meta\.type" nodejs/src/spider -n
- 更详细日志：DEV_HTTP_PORT=3006 NODE_ENV=development npm run dev

CatPlayer / iOS 要点（常被忽视）
- 优先使用 CI（macos-14）构建 IPA；本地全量编译需 macOS >= 12.5 与 Xcode >= 14.3。
- 仅做语法/类型检查：./setup.sh 后打开 app/ios/CatPlayer.xcworkspace（不要打开 .xcodeproj）。
- setup.sh 参数：--minimal（极简 RN 空壳）、--skip-pod（CI 场景）。
- 注意 polyfill 限制：bundle 在隐藏 WebView 执行，fs 为 stub（无法用 readFileSync/writeFileSync），http.createServer 被拦截并通过 postMessage 转发。

CI 与复现
- NodeJS 构建（actions）使用 Node 18.17.1；在本地复现 CI 请匹配该版本。

速验清单（一行验证）
- dev：cd nodejs && npm run dev → 终端显示 "Run on 3006"；curl http://127.0.0.1:3006/config 返回 JSON。
- build：cd nodejs && npm run build → 检查 dist/index.js(.md5) 与 dist/index.config.js(.md5) 存在且非空。

更多资料
- 仓库根 CLAUDE.md 与 CatPlayer/CLAUDE.md 包含更完整架构说明，做重大改动前务必阅读。
