# build

执行生产构建，产出 dist/ 目录（包含 .md5 校验文件）。

```bash
cd nodejs && npm run build
```

等价于 `cross-env NODE_ENV=production npm run _build` → rimraf dist && node esbuild.js && node esbuild-config.js。
