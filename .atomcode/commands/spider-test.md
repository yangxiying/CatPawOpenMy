# spider-test <key> <type>

快速自测指定爬虫是否正常。

```bash
curl -sS -X POST "http://127.0.0.1:3006/spider/<key>/<type>/test" -H 'Content-Type: application/json' -d '{}' | jq .
```

先确保 dev 服务在 3006 端口运行 (`/dev`)。
