/*
 * Node 桥 —— 运行在 nodejs-mobile 内嵌 Node18 子线程。
 * 职责：下载并 md5 校验源 index.js / index.config.js，注入宿主全局，
 *       require + start() 跑起 fastify 爬虫服务，把真实端口回传 RN。
 *
 * 宿主契约（已离线验证）：源 bundle 的 start(config) 只需两个全局
 *   - globalThis.catServerFactory(handle) -> http.Server
 *   - globalThis.catDartServerPort() -> number (0 表示无 Dart 宿主)
 * 其余 messageToDart / Pans / getPanName / getPanEnabled / websiteBundle
 * 由 bundle 自行注入。
 */
'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rn = require('rn-bridge');

// 可写目录（Documents），bundle 的 db.json 落此
let baseDir;
try { baseDir = rn.app.datadir(); } catch (e) { baseDir = process.cwd(); }
const DATA = path.join(baseDir, 'catdata');
try { fs.mkdirSync(DATA, { recursive: true }); } catch (e) {}
process.env.NODE_PATH = DATA;        // bundle: (process.env.NODE_PATH||'.')+'/db.json'
process.env.DEV_HTTP_PORT = '0';     // 强制 OS 自动分配端口（健壮）

const send = (obj) => { try { rn.channel.send(JSON.stringify(obj)); } catch (e) {} };
const log = (...a) => send({ type: 'log', msg: a.map(String).join(' ') });

let PORT = 0;
globalThis.catServerFactory = (handle) => {
    const s = http.createServer((req, res) => handle(req, res));
    s.on('listening', () => {
        PORT = s.address().port;
        send({ type: 'port', port: PORT });
    });
    s.on('error', (e) => send({ type: 'error', error: 'server: ' + String(e) }));
    return s;
};
globalThis.catDartServerPort = () => 0;

const md5 = (buf) => crypto.createHash('md5').update(buf).digest('hex');

async function dl(url, auth) {
    // Node18 全局 fetch，自动跟随 302（源 index.js 跳转 CDN）
    const r = await fetch(url, { headers: auth ? { Authorization: 'Basic ' + auth } : {} });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
    return Buffer.from(await r.arrayBuffer());
}

let started = false;
let mod = null;

async function load(base, auth, forceRefresh) {
    if (started) { if (PORT) send({ type: 'port', port: PORT }); return; }
    base = base.replace(/\/+$/, '');
    const idxPath = path.join(DATA, 'index.js');
    const cfgPath = path.join(DATA, 'index.config.js');

    log('fetching md5…');
    const want = (await dl(base + '/index.js.md5', auth)).toString().trim();
    const have = fs.existsSync(idxPath) ? md5(fs.readFileSync(idxPath)) : '';

    if (forceRefresh || have !== want) {
        log('downloading index.js…');
        const idx = await dl(base + '/index.js', auth);
        const got = md5(idx);
        if (got !== want) throw new Error('index.js md5 mismatch want=' + want + ' got=' + got);
        fs.writeFileSync(idxPath, idx);
        log('downloading index.config.js…');
        fs.writeFileSync(cfgPath, await dl(base + '/index.config.js', auth));
        log('verified & cached');
    } else {
        log('cache hit (md5=' + want.slice(0, 8) + '…)');
    }

    const cfgMod = require(cfgPath);
    const cfg = cfgMod && cfgMod.default ? cfgMod.default : cfgMod;
    mod = require(idxPath);
    log('starting server…');
    await mod.start(cfg);             // bundle 自建 fastify 并 listen(0)
    started = true;
}

rn.channel.on('message', async (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    try {
        if (m.type === 'load') {
            await load(m.base, m.auth, !!m.forceRefresh);
        } else if (m.type === 'stop') {
            if (mod && mod.stop) await mod.stop();
            started = false; PORT = 0;
        }
    } catch (e) {
        send({ type: 'error', error: String((e && e.stack) || e) });
    }
});

send({ type: 'ready' });
