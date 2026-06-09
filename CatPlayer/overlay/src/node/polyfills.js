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

// 日志桥：向 RN 发送日志消息（显示在 Boot 页面的日志框里）
// 同时暴露到全局，供注入的 bundle 代码使用
var _log = function (m) { try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'log', msg: '[WV] ' + m })); } catch (e) {} };
window._log = _log;

_log('polyfill start');

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
function EventEmitterPolyfill() {
    if (!(this instanceof EventEmitterPolyfill)) return new EventEmitterPolyfill();
    this._events = {};
}
EventEmitterPolyfill.prototype.on = function(event, fn) {
    if (!this._events) this._events = {};
    (this._events[event] = this._events[event] || []).push(fn);
    return this;
};
EventEmitterPolyfill.prototype.off = function(event, fn) {
    if (!this._events) this._events = {};
    const arr = this._events[event];
    if (arr) this._events[event] = arr.filter(f => f !== fn);
    return this;
};
EventEmitterPolyfill.prototype.emit = function(event, ...args) {
    if (!this._events) this._events = {};
    const list = this._events[event] || [];
    list.forEach(fn => fn(...args));
    return list.length > 0;
};
EventEmitterPolyfill.prototype.once = function(event, fn) {
    const wrapped = (...a) => { fn(...a); this.off(event, wrapped); };
    return this.on(event, wrapped);
};
EventEmitterPolyfill.prototype.addListener = EventEmitterPolyfill.prototype.on;
EventEmitterPolyfill.prototype.removeListener = EventEmitterPolyfill.prototype.off;
EventEmitterPolyfill.prototype.removeAllListeners = function(event) {
    if (!this._events) this._events = {};
    if (event) this._events[event] = [];
    else this._events = {};
    return this;
};
EventEmitterPolyfill.prototype.listenerCount = function(event) {
    if (!this._events) return 0;
    return this._events[event]?.length || 0;
};
EventEmitterPolyfill.prototype.setMaxListeners = function() { return this; };
EventEmitterPolyfill.prototype.getMaxListeners = function() { return 100; };
EventEmitterPolyfill.prototype.prependListener = function(event, fn) {
    if (!this._events) this._events = {};
    this._events[event] = [fn].concat(this._events[event] || []);
    return this;
};
EventEmitterPolyfill.prototype.prependOnceListener = function(event, fn) {
    const wrapped = (...a) => { fn(...a); this.off(event, wrapped); };
    return this.prependListener(event, wrapped);
};
EventEmitterPolyfill.prototype.listeners = function(event) { return [...((this._events || {})[event] || [])]; };
EventEmitterPolyfill.prototype.eventNames = function() { return Object.keys(this._events || {}); };
EventEmitterPolyfill.prototype.rawListeners = function(event) { return [...((this._events || {})[event] || [])]; };
EventEmitterPolyfill.defaultMaxListeners = 10;
EventEmitterPolyfill.listenerCount = function(emitter, event) { return emitter.listenerCount(event); };
EventEmitterPolyfill.EventEmitter = EventEmitterPolyfill;
EventEmitterPolyfill.errorMonitor = Symbol('events.errorMonitor');
EventEmitterPolyfill.captureRejections = false;

// require('events') must return EventEmitterPolyfill itself (a constructor function)
// with EventEmitterPolyfill.EventEmitter === EventEmitterPolyfill (like Node.js)
const EVENT_MODULE = EventEmitterPolyfill;
EVENT_MODULE.EventEmitter = EventEmitterPolyfill;
EVENT_MODULE.once = function once(emitter, event) {
    return new Promise((resolve) => { emitter.once(event, resolve); });
};
EVENT_MODULE.listenerCount = EventEmitterPolyfill.listenerCount;
EVENT_MODULE.defaultMaxListeners = 10;
EVENT_MODULE.captureRejections = false;
EVENT_MODULE.errorMonitor = Symbol('events.errorMonitor');

// ============================================================
// 5. http/https polyfill (核心：拦截 createServer)
// ============================================================
const HTTP_SERVERS = {}; // port → handler(req, res)
const PENDING_REQUESTS = new Map(); // reqId → { resolve, reject }
// 暴露到 window 以便 injectJavaScript 注入的代码能访问
window.__PENDING_REQUESTS = PENDING_REQUESTS;
let NEXT_REQ_ID = 1;

function createServerPolyfill(requestHandler) {
    const _listeners = {};
    const server = {
        _handler: requestHandler,
        _port: 0,
        on: (event, cb) => {
            (_listeners[event] = _listeners[event] || []).push(cb);
            return server;
        },
        once: (event, cb) => {
            const wrapped = function(...args) { cb(...args); server.removeListener(event, wrapped); };
            wrapped._isOnce = true;
            server.on(event, wrapped);
            return server;
        },
        removeListener: (event, cb) => {
            const arr = _listeners[event];
            if (arr) _listeners[event] = arr.filter(f => f !== cb);
            return server;
        },
        emit: (event, ...args) => {
            const list = _listeners[event] || [];
            list.slice().forEach(fn => fn(...args));
            return list.length > 0;
        },
        address: () => ({ address: '127.0.0.1', port: server._port, family: 'IPv4', url: `http://127.0.0.1:${server._port}` }),
        listen: (opts, cb) => {
            const rawPort = typeof opts === 'number' ? opts : (opts?.port || 0);
            const numericPort = typeof rawPort === 'number' ? rawPort : parseInt(rawPort, 10) || 0;
            server._port = numericPort || 18080; // 0 → 默认 18080（WebView 端不真正监听）
            HTTP_SERVERS[server._port] = requestHandler;
            if (cb) cb();
            _log('listen port=' + server._port);
            // 通知 RN 端口就绪
            try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'port', port: server._port })); } catch (e) { _log('port msg fail: ' + e); }
            return server;
        },
        close: (cb) => { delete HTTP_SERVERS[server._port]; if (cb) cb(); },
        addListener: (event, cb) => server.on(event, cb),
        removeAllListeners: (event) => { if (event) delete _listeners[event]; else Object.keys(_listeners).forEach(k => delete _listeners[k]); return server; },
        listeners: (event) => [...((_listeners[event] || []))],
        eventNames: () => Object.keys(_listeners),
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
    const Agent = class Agent extends EventEmitterPolyfill {
        constructor() { super(); }
        createConnection() { return {}; }
        destroy() {}
    };
    return {
        createServer: createServerPolyfill,
        request: httpRequestPolyfill,
        get: (url, opts) => { const r = httpRequestPolyfill(url, { ...opts, method: 'GET' }); r.end(); return r; },
        METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        STATUS_CODES: { 200: 'OK', 404: 'Not Found', 500: 'Internal Server Error' },
        Agent,
        globalAgent: new Agent(),
        maxHeaderSize: 16384,
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
        mkdir: (path, opts, cb) => { if (typeof opts === 'function') { cb = opts; } if (cb) process.nextTick(cb); },
        statSync: () => { throw new Error('fs.statSync not available'); },
        stat: (path, cb) => { process.nextTick(() => cb(new Error('ENOENT'))); },
        readdirSync: () => [],
        openSync: () => -1,
        open: (path, flags, mode, cb) => { if (typeof mode === 'function') { cb = mode; } process.nextTick(() => cb(null, -1)); },
        close: (fd, cb) => { if (cb) process.nextTick(cb); },
        closeSync: () => {},
        write: (fd, buffer, offset, length, position, cb) => {
            if (typeof cb !== 'function') { cb = position; } if (typeof cb !== 'function') { cb = length; }
            if (typeof cb === 'function') process.nextTick(() => cb(null, typeof buffer === 'string' ? Buffer.byteLength(buffer) : buffer.length));
        },
        writeSync: (fd, buffer) => typeof buffer === 'string' ? Buffer.byteLength(buffer) : buffer.length,
        fstat: (fd, cb) => { process.nextTick(() => cb(null, { size: 0, mode: 0o644 })); },
        fstatSync: () => ({ size: 0, mode: 0o644 }),
        fsync: (fd, cb) => { if (cb) process.nextTick(cb); },
        fsyncSync: () => {},
        ftruncate: (fd, len, cb) => { if (typeof len === 'function') { cb = len; } if (cb) process.nextTick(cb); },
        ftruncateSync: () => {},
        realpathSync: (p) => p,
        access: (path, mode, cb) => { if (typeof mode === 'function') { cb = mode; } if (cb) process.nextTick(cb); },
    };
}

// ============================================================
// 8. require polyfill
// ============================================================
const MODULES = {
    'http': { default: httpPolyfill(), ...httpPolyfill() },
    'https': { default: httpPolyfill(), ...httpPolyfill() },
    'events': EVENT_MODULE,
    'stream': { Stream: EventEmitterPolyfill, Readable: EventEmitterPolyfill, Writable: EventEmitterPolyfill, PassThrough: EventEmitterPolyfill, Duplex: EventEmitterPolyfill, Transform: EventEmitterPolyfill, pipeline: (...s) => { const cb = s[s.length-1]; if (typeof cb === 'function') cb(); }, finished: (s, cb) => { if (cb) cb(); } },
    'zlib': { createGunzip: () => new EventEmitterPolyfill(), createInflate: () => new EventEmitterPolyfill(), createDeflate: () => new EventEmitterPolyfill(), constants: {} },
    'dns': { resolve: (host, cb) => cb(null, ['127.0.0.1']), resolve4: (host, cb) => cb(null, ['127.0.0.1']), lookup: (h, opts, cb) => { if (typeof opts === 'function') { cb = opts; opts = {}; } cb && cb(null, '127.0.0.1', 4); } },
    'tls': { TLSSocket: EventEmitterPolyfill, connect: () => ({ on: () => {} }) },
    'tty': { isatty: () => false },
    'net': { Socket: EventEmitterPolyfill, createConnection: () => ({ on: () => {}, pipe: () => {} }), connect: () => ({ on: () => {} }) },
    'os': { platform: () => 'darwin', homedir: () => '/var/mobile', tmpdir: () => '/tmp', type: () => 'Darwin', arch: () => 'arm64', hostname: () => 'CatPlayer', cpus: () => [{ model: 'Apple' }], totalmem: () => 6000000000, freemem: () => 3000000000, uptime: () => 0, networkInterfaces: () => ({}) },
    'path': pathPolyfill(),
    'url': urlPolyfill(),
    'fs': fsPolyfill(),
    'constants': {},
    'worker_threads': {},
    'child_process': {},
    'fs/promises': { access: () => Promise.resolve(), readFile: () => Promise.reject(new Error('fs/promises not available')), writeFile: () => Promise.resolve(), mkdir: () => Promise.resolve(), unlink: () => Promise.resolve(), readdir: () => Promise.resolve([]), stat: () => Promise.resolve({}) },
    'assert': (() => {
        function assert(val, msg) { if (!val) throw new Error(msg || 'Assertion failed'); }
        assert.ok = assert;
        assert.strictEqual = (a, b, msg) => { if (a !== b) throw new Error(msg || `${a} !== ${b}`); };
        assert.equal = (a, b, msg) => { if (a != b) throw new Error(msg || `${a} == ${b}`); };
        assert.deepEqual = (a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('not deep equal'); };
        assert.notStrictEqual = (a, b) => { if (a === b) throw new Error(`${a} === ${b}`); };
        assert.AssertionError = class AssertionError extends Error {
            constructor(o) { super(o.message || ''); this.code = o?.code || 'ERR_ASSERTION'; this.actual = o?.actual; this.expected = o?.expected; this.operator = o?.operator || '=='; }
        };
        assert.fail = (msg) => { throw new Error(msg || 'Failed'); };
        return assert;
    })(),
    'util': {
        format: (f, ...a) => { if (typeof f !== 'string') return String(f); let i = 0; return f.replace(/%[sdifoO]/g, () => String(a[i++] ?? '')); },
        inspect: (o) => JSON.stringify(o),
        inherits: (ctor, superCtor) => { if (!ctor || !superCtor) { if (ctor) ctor.prototype = {}; return; } const proto = superCtor.prototype || {}; ctor.super_ = superCtor; ctor.prototype = Object.create(proto, { constructor: { value: ctor, enumerable: false, configurable: true } }); },
        promisify: (fn) => (...a) => new Promise((res, rej) => fn(...a, (e, r) => e ? rej(e) : res(r))),
        deprecate: (fn) => fn,
        types: { isDate: (v) => v instanceof Date, isRegExp: (v) => v instanceof RegExp, isArray: Array.isArray, isBoolean: (v) => typeof v === 'boolean', isNumber: (v) => typeof v === 'number', isString: (v) => typeof v === 'string', isFunction: (v) => typeof v === 'function', isObject: (v) => v !== null && typeof v === 'object', isPrimitive: (v) => v === null || !['object','function'].includes(typeof v) },
        callbackify: (fn) => (...a) => { const cb = a.pop(); fn(...a).then(r => cb(null, r)).catch(e => cb(e)); },
        TextDecoder: globalThis.TextDecoder,
        TextEncoder: globalThis.TextEncoder,
    },
    'module': { Module: class Module { static _resolveFilename() { return ''; } static _cache = {}; _compile() {} } },
    'buffer': { Buffer: globalThis.Buffer, kMaxLength: 2147483647, INSPECT_MAX_BYTES: 50, SlowBuffer: (size) => Buffer.alloc(size), constants: { MAX_STRING_LENGTH: 1073741790, MAX_LENGTH: 2147483647 } },
};

function customRequire(moduleName) {
    if (MODULES[moduleName]) return MODULES[moduleName];
    // Try without 'node:' prefix
    const stripped = moduleName.startsWith('node:') ? moduleName.slice(5) : null;
    if (stripped && MODULES[stripped]) return MODULES[stripped];
    // console.warn('[polyfill] require(' + moduleName + ') → stub');
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
globalThis.Buffer = globalThis.Buffer || globalThis.Buffer;
globalThis.__filename = 'main.js';
globalThis.__dirname = '/';
globalThis.module = { exports: {} };
globalThis.exports = globalThis.module.exports;

// require 注入：多重保障，确保 WebView 各执行上下文都能访问
try { Object.defineProperty(globalThis, 'require', { value: customRequire, writable: true, configurable: true }); } catch { try { globalThis.require = customRequire; } catch {} }
try { window.require = customRequire; } catch {}
try { self.require = customRequire; } catch {}

// ============================================================
// 11. catServerFactory / catDartServerPort
// ============================================================
globalThis.catServerFactory = function catServerFactory(handle) {
    _log('catServerFactory called');
    return createServerPolyfill(handle);
};
globalThis.catDartServerPort = function catDartServerPort() {
    return 0;
};

_log('globals injected');

console.log('[polyfill] Node.js polyfills loaded (WebView)');
try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'log', msg: 'polyfill env ready' })); } catch {}

// 通知 RN polyfill 已就绪，可以注入 bundle
try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'ready' })); } catch {
    try { window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'error', error: 'failed to send ready msg' })); } catch {}
}

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
