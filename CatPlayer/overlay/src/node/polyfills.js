/**
 * Node.js API polyfills — 注入 WebView，让 Node.js CJS bundle 在浏览器 JS 引擎中运行。
 *
 * 核心：http.createServer polyfill 拦截请求 → postMessage 回 RN → RN postMessage 发请求 → polyfill 调用 handler。
 * bundle（4.47MB CJS）只用 Node 核心 API（http/crypto/fs/path），polyfill 这些即可执行。
 *
 * 此文件被 Metro require() 时，通过 POLYFILL_SOURCE.toString() 导出源码字符串
 * 以供注入隐藏 WebView 执行。polyfill 代码本身在 WebView 中运行。
 */
'use strict';

function POLYFILL_SOURCE() {

// ============================================================
// 0. 全局 polyfill
// ============================================================
globalThis.global = globalThis;
globalThis.process = globalThis.process || {
    env: { NODE_ENV: 'production', NODE_PATH: '/data', DEV_HTTP_PORT: '0' },
    cwd: () => '/',
    nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
    version: 'v18.20.4',
    versions: { node: '18.20.4', v8: '11.3', modules: '108' },
    platform: 'darwin',
    arch: 'arm64',
    argv: ['node', 'main.js'],
    exit: () => {},
    stdout: { write: (s) => { console.log(s); } },
    stderr: { write: (s) => { console.error(s); } },
};
globalThis.setImmediate = globalThis.setImmediate || ((fn, ...a) => setTimeout(() => fn(...a), 0));
globalThis.clearImmediate = globalThis.clearImmediate || clearTimeout;

// ============================================================
// 1. Buffer polyfill (简化版，覆盖 bundle 常用操作)
// ============================================================
if (!globalThis.Buffer) {
    globalThis.Buffer = class Buffer extends Uint8Array {
        static from(data, encoding) {
            if (data instanceof ArrayBuffer) return new Buffer(new Uint8Array(data));
            if (typeof data === 'string') {
                if (encoding === 'hex') {
                    const bytes = new Uint8Array(data.length / 2);
                    for (let i = 0; i < data.length; i += 2) bytes[i / 2] = parseInt(data.substr(i, 2), 16);
                    return new Buffer(bytes);
                }
                if (encoding === 'base64') {
                    const binary = atob(data);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                    return new Buffer(bytes);
                }
                if (encoding === 'utf8' || encoding === undefined) {
                    return new Buffer(new TextEncoder().encode(data));
                }
                return new Buffer(new TextEncoder().encode(data));
            }
            if (data instanceof Uint8Array) return new Buffer(data);
            if (Array.isArray(data)) return new Buffer(new Uint8Array(data));
            return new Buffer(new Uint8Array(0));
        }
        static alloc(size, fill = 0) {
            const b = new Buffer(new Uint8Array(size));
            b.fill(fill);
            return b;
        }
        static concat(buffers) {
            let total = 0;
            for (const b of buffers) total += b.length;
            const result = new Uint8Array(total);
            let offset = 0;
            for (const b of buffers) { result.set(b, offset); offset += b.length; }
            return new Buffer(result);
        }
        toString(encoding = 'utf8') {
            if (encoding === 'hex') return Array.from(this).map(b => b.toString(16).padStart(2, '0')).join('');
            if (encoding === 'base64') return btoa(String.fromCharCode(...this));
            return new TextDecoder().decode(this);
        }
        toJSON() { return { type: 'Buffer', data: Array.from(this) }; }
    };
    globalThis.Buffer.isBuffer = (obj) => obj instanceof Buffer;
    globalThis.Buffer.byteLength = (str) => new TextEncoder().encode(str).length;
}

// ============================================================
// 2. path polyfill
// ============================================================
function pathPolyfill() {
    const sep = '/';
    function join(...args) { return args.filter(Boolean).join('/').replace(/\/+/g, '/'); }
    function resolve(...args) {
        let result = args[0] || '/';
        for (let i = 1; i < args.length; i++) {
            if (args[i].startsWith('/')) result = args[i];
            else result = join(result, args[i]);
        }
        return result;
    }
    function dirname(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
    function basename(p, ext) {
        let name = p.split('/').pop() || '';
        if (ext && name.endsWith(ext)) name = name.slice(0, -ext.length);
        return name;
    }
    function extname(p) {
        const name = p.split('/').pop() || '';
        const dot = name.lastIndexOf('.');
        return dot > 0 ? name.slice(dot) : '';
    }
    function relative(from, to) { return to; } // 简化
    return { join, resolve, dirname, basename, extname, relative, sep, posix: { join, resolve, dirname, basename, extname, sep: '/' } };
}

// ============================================================
// 3. url polyfill
// ============================================================
function urlPolyfill() {
    return {
        parse(urlStr) {
            try { const u = new URL(urlStr); return { protocol: u.protocol, hostname: u.hostname, port: u.port, pathname: u.pathname, search: u.search, hash: u.hash, href: u.href, auth: u.username }; }
            catch { return { href: urlStr, protocol: '', hostname: '', port: '', pathname: urlStr, search: '', hash: '', auth: '' }; }
        },
        format(obj) { return obj.href || ''; },
        resolve(from, to) { try { return new URL(to, from).href; } catch { return to; } },
        URL: globalThis.URL,
    };
}

// ============================================================
// 4. events polyfill (EventEmitter)
// ============================================================
class EventEmitterPolyfill {
    constructor() { this._events = {}; }
    on(event, fn) { (this._events[event] = this._events[event] || []).push(fn); return this; }
    off(event, fn) { if (this._events[event]) this._events[event] = this._events[event].filter(f => f !== fn); return this; }
    emit(event, ...args) { (this._events[event] || []).forEach(fn => fn(...args)); return this._events[event]?.length > 0; }
    once(event, fn) { const wrapped = (...a) => { fn(...a); this.off(event, wrapped); }; return this.on(event, wrapped); }
    addListener(event, fn) { return this.on(event, fn); }
    removeListener(event, fn) { return this.off(event, fn); }
    removeAllListeners(event) { this._events[event] = []; return this; }
    listenerCount(event) { return this._events[event]?.length || 0; }
    setMaxListeners() { return this; }
    getMaxListeners() { return 100; }
    prependListener() { return this; }
}

// ============================================================
// 5. http/https polyfill (核心：拦截 createServer)
// ============================================================
const HTTP_SERVERS = {}; // port → handler(req, res)
const PENDING_REQUESTS = new Map(); // reqId → { resolve, reject }
// 暴露到 window 以便 injectJavaScript 注入的代码能访问
window.__PENDING_REQUESTS = PENDING_REQUESTS;
let NEXT_REQ_ID = 1;

function createServerPolyfill(requestHandler) {
    const server = {
        _handler: requestHandler,
        _port: 0,
        on: (event, cb) => { if (event === 'listening') cb(); return server; },
        address: () => ({ address: '127.0.0.1', port: server._port, family: 'IPv4', url: `http://127.0.0.1:${server._port}` }),
        listen: (opts, cb) => {
            const rawPort = typeof opts === 'number' ? opts : (opts?.port || 0);
            const numericPort = typeof rawPort === 'number' ? rawPort : parseInt(rawPort, 10) || 0;
            server._port = numericPort || 18080; // 0 → 默认 18080（WebView 端不真正监听）
            HTTP_SERVERS[server._port] = requestHandler;
            if (cb) cb();
            // 通知 RN 端口就绪
            try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'port', port: server._port })); } catch {}
            return server;
        },
        close: (cb) => { delete HTTP_SERVERS[server._port]; if (cb) cb(); },
    };
    return server;
}

function httpRequestPolyfill(url, options) {
    const reqId = NEXT_REQ_ID++;
    const req = new EventEmitterPolyfill();
    req.method = options?.method || 'GET';
    req.url = typeof url === 'string' ? url : url?.href || '/';
    req.headers = options?.headers || {};
    req.setHeader = (k, v) => { req.headers[k.toLowerCase()] = v; };
    req.getHeader = (k) => req.headers[k.toLowerCase()];
    req.write = (data) => { req._body = (req._body || '') + data; };
    req.end = (data) => {
        if (data) req._body = (req._body || '') + data;
        // 发送请求到 RN
        try {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'proxyRequest',
                reqId,
                method: req.method,
                url: req.url,
                headers: req.headers,
                body: req._body || null,
            }));
            PENDING_REQUESTS.set(reqId, { resolve: (res) => { req.emit('response', res); }, reject: (e) => { req.emit('error', e); } });
        } catch (e) { req.emit('error', e); }
    };
    return req;
}

// ============================================================
// 5b. http/https module (供 require('http') 使用)
// ============================================================
function httpPolyfill() {
    return {
        createServer: createServerPolyfill,
        request: httpRequestPolyfill,
        get: (url, opts) => { const r = httpRequestPolyfill(url, { ...opts, method: 'GET' }); r.end(); return r; },
        METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        STATUS_CODES: { 200: 'OK', 404: 'Not Found', 500: 'Internal Server Error' },
    };
}

// ============================================================
// 6. crypto polyfill (Web Crypto API)
// ============================================================
function cryptoPolyfill() {
    const subtle = globalThis.crypto?.subtle;
    async function hashIt(algo, data) {
        const algoMap = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' };
        const normalizedAlgo = algoMap[algo?.toLowerCase()] || algo;
        if (!subtle) throw new Error('Web Crypto not available');
        const buf = typeof data === 'string' ? new TextEncoder().encode(data) : (data instanceof ArrayBuffer ? new Uint8Array(data) : data);
        const hash = await subtle.digest(normalizedAlgo, buf);
        return new Uint8Array(hash);
    }
    function hexEncode(bytes) { return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join(''); }
    function base64Encode(bytes) { return btoa(String.fromCharCode(...bytes)); }

    return {
        createHash: (algo) => {
            const a = algo?.toLowerCase().replace('-', '') || 'sha256';
            return {
                update: function(data) {
                    const input = (data instanceof Buffer || data instanceof Uint8Array) ? data : (typeof data === 'string' ? new TextEncoder().encode(data) : data);
                    this._data = this._data ? Buffer.concat([this._data, Buffer.from(input)]) : Buffer.from(input);
                    return this;
                },
                digest: () => { throw new Error('use async digest instead'); },
                async digestAsync() {
                    const hashBytes = await hashIt(a, this._data);
                    return Buffer.from(hashBytes);
                },
                hex: async function() { return hexEncode(await this.digestAsync()); },
                base64: async function() { return base64Encode(await this.digestAsync()); },
            };
        },
        createHmac: (algo, key) => {
            const a = algo?.toLowerCase().replace('-', '') || 'sha256';
            const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key;
            return {
                update: function(data) {
                    const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
                    this._data = this._data ? Buffer.concat([this._data, Buffer.from(input)]) : Buffer.from(input);
                    return this;
                },
                async digestAsync() {
                    if (!subtle) throw new Error('Web Crypto not available');
                    const algoMap = { md5: 'MD5', sha1: 'SHA-1', sha256: 'SHA-256', sha512: 'SHA-512' };
                    const k = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algoMap[a] || 'SHA-256' }, false, ['sign']);
                    const sig = await subtle.sign('HMAC', k, this._data);
                    return Buffer.from(new Uint8Array(sig));
                },
                hex: async function() { return hexEncode(await this.digestAsync()); },
            };
        },
        randomBytes: (size) => {
            const bytes = new Uint8Array(size);
            globalThis.crypto.getRandomValues(bytes);
            return Buffer.from(bytes);
        },
        randomUUID: () => globalThis.crypto.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)),
        createCipheriv: () => { throw new Error('createCipheriv polyfill not implemented'); },
        createDecipheriv: () => { throw new Error('createDecipheriv polyfill not implemented'); },
        pbkdf2: () => { throw new Error('pbkdf2 polyfill not implemented'); },
        scrypt: () => { throw new Error('scrypt polyfill not implemented'); },
    };
}

// ============================================================
// 7. fs polyfill (最小化)
// ============================================================
function fsPolyfill() {
    return {
        existsSync: () => false,
        readFileSync: () => { throw new Error('fs.readFileSync not available in WebView'); },
        writeFileSync: () => { throw new Error('fs.writeFileSync not available in WebView'); },
        mkdirSync: () => {},
        statSync: () => { throw new Error('fs.statSync not available'); },
        readdirSync: () => [],
    };
}

// ============================================================
// 8. require polyfill
// ============================================================
const MODULES = {
    'http': { default: httpPolyfill(), ...httpPolyfill() },
    'https': { default: httpPolyfill(), ...httpPolyfill() },
    'stream': { Stream: EventEmitterPolyfill, Readable: EventEmitterPolyfill, Writable: EventEmitterPolyfill, PassThrough: EventEmitterPolyfill },
    'zlib': {},
    'dns': { resolve: (host, cb) => cb(null, ['127.0.0.1']), resolve4: (host, cb) => cb(null, ['127.0.0.1']) },
    'tls': {},
    'net': {},
    'os': { platform: () => 'darwin', homedir: () => '/var/mobile', tmpdir: () => '/tmp', type: () => 'Darwin', arch: () => 'arm64', cpus: () => [{ model: 'Apple' }], totalmem: () => 6000000000, freemem: () => 3000000000, uptime: () => 0, networkInterfaces: () => ({}) },
    'assert': { ok: (val, msg) => { if (!val) throw new Error(msg || 'Assertion failed'); }, strictEqual: (a, b) => { if (a !== b) throw new Error(`${a} !== ${b}`); } },
    'util': { format: (f, ...a) => String(f), inspect: (o) => JSON.stringify(o), promisify: (fn) => (...a) => new Promise((res, rej) => fn(...a, (e, r) => e ? rej(e) : res(r))) },
};

function customRequire(moduleName) {
    if (MODULES[moduleName]) return MODULES[moduleName];
    // 返回空模块，避免 require 崩溃
    console.warn('[polyfill] require(' + moduleName + ') → stub');
    return {};
}

// ============================================================
// 9. 消息监听：接收 RN 发来的请求，路由到 HTTP handler
// ============================================================
window.addEventListener('message', (event) => {
    let msg;
    try { msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
    if (!msg || msg.type !== 'request') return;

    const port = msg.port || 18080;
    const handler = HTTP_SERVERS[port];
    if (!handler) {
        console.warn('[polyfill] no handler for port', port);
        return;
    }

    const bodyContent = msg.body || '';

    // 构造 req 对象（兼容 Fastify 使用的部分 IncomingMessage 接口）
    const req = new EventEmitterPolyfill();
    req.method = (msg.method || 'GET').toUpperCase();
    req.url = msg.url || '/';
    req.headers = msg.headers || {};
    req.socket = {};
    req.connection = {};
    req._body = bodyContent;

    // 构造 res 对象（兼容 Fastify 使用的 ServerResponse 接口）
    let statusCode = 200;
    const resHeaders = {};
    let resBody = '';
    const res = new EventEmitterPolyfill();
    res.statusCode = 200;
    res.statusMessage = '';
    res._headers = {};
    res.setHeader = (key, val) => { resHeaders[key] = val; };
    res.getHeader = (key) => resHeaders[key];
    res.getHeaders = () => ({ ...resHeaders });
    res.hasHeader = (key) => key in resHeaders;
    res.removeHeader = (key) => { delete resHeaders[key]; };
    res.writeHead = (status, statusText, hdrs) => {
        statusCode = status;
        if (typeof statusText === 'object') { hdrs = statusText; statusText = ''; }
        if (hdrs) Object.assign(resHeaders, hdrs);
    };
    res.write = (chunk) => { resBody += String(chunk); };
    res.end = (chunk) => {
        if (chunk) resBody += String(chunk);
        try {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
                type: 'response',
                reqId: msg.reqId,
                status: statusCode,
                headers: resHeaders,
                body: resBody,
            }));
        } catch (e) { console.error('[polyfill] response postMessage failed', e); }
    };
    res.addTrailers = () => {};
    res.flushHeaders = () => {};
    res.sendDate = false;
    res.assignSocket = () => {};
    res.detachSocket = () => {};
    res.destroy = () => {};
    res.writeContinue = () => {};
    res.writeProcessing = () => {};
    res.setTimeout = () => res;
    res.statusCode = statusCode;

    // 以流形式推送 body（Fastify 通过 req.on('data') + req.on('end') 读取）
    process.nextTick(() => {
        if (bodyContent) {
            try { req.emit('data', Buffer.from(bodyContent)); } catch (e) { /* ignore */ }
        }
        try { req.emit('end'); } catch (e) { /* ignore */ }
    });

    try { handler(req, res); } catch (e) {
        console.error('[polyfill] handler error', e);
        window.ReactNativeWebView?.postMessage(JSON.stringify({
            type: 'response', reqId: msg.reqId, status: 500, headers: {}, body: String(e),
        }));
    }
});

// ============================================================
// 10. 注入
// ============================================================
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.require = customRequire;
globalThis.__filename = 'main.js';
globalThis.__dirname = '/';
globalThis.module = { exports: {} };
globalThis.exports = globalThis.module.exports;

// ============================================================
// 11. catServerFactory / catDartServerPort
// ============================================================
globalThis.catServerFactory = function catServerFactory(handle) {
    return createServerPolyfill(handle);
};
globalThis.catDartServerPort = function catDartServerPort() {
    return 0;
};

console.log('[polyfill] Node.js polyfills loaded (WebView)');

// 通知 RN polyfill 已就绪，可以注入 bundle
try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' })); } catch {}

} // ← end POLYFILL_SOURCE()

// 自执行：在 WebView 中设置 polyfill，捕获错误并报告给 RN
try {
    POLYFILL_SOURCE();
} catch (e) {
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'error', error: 'polyfill init: ' + String(e) })); } catch {}
}

// 当被 Metro require() 时以字符串形式导出源码
if (typeof module !== 'undefined' && module.exports) {
    module.exports = POLYFILL_SOURCE.toString();
}
