# dev

启动 CatPawOpenMy 开发服务器（热重载，端口 3006）。

```bash
cd nodejs && npm run dev
```

等价于 `cross-env DEV_HTTP_PORT=3006 nodemon --config nodemon.json src/dev.js`。
