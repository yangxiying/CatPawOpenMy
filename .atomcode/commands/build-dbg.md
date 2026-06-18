# build-dbg

执行调试构建，产出 dist/ 目录（NODE_ENV=development，不压缩）。

```bash
cd nodejs && npm run build:dbg
```

等价于 `cross-env NODE_ENV=development npm run _build` → rimraf dist && node esbuild.js && node esbuild-config.js。

与 `build` 命令的区别：
- `build` → `NODE_ENV=production`（esbuild 压缩 dist/index.js）
- `build-dbg` → `NODE_ENV=development`（esbuild 不压缩，适合调试）
