import { createRequire } from 'module';
import path from 'path';

const req = createRequire(import.meta.url);
let polyfillSrc;
try {
    polyfillSrc = req('../../CatPlayer/overlay/src/node/polyfills.js').toString();
} catch (e) {
    console.error('[FAIL] 无法加载 polyfill:', e.message);
    process.exit(1);
}

const messages = [];
globalThis.window = globalThis;
globalThis.console = console;
globalThis.ReactNativeWebView = {
    postMessage: (json) => {
        try {
            const msg = JSON.parse(json);
            messages.push(msg);
            console.log(`[postMessage] type=${msg.type}${msg.port !== undefined ? ' port='+msg.port : ''}${msg.error ? ' error='+msg.error : ''}`);
        } catch (e) {
            console.log('[postMessage] raw:', json);
        }
    },
};
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
globalThis.btoa = btoa;
globalThis.atob = atob;
globalThis.setTimeout = setTimeout;
globalThis.clearTimeout = clearTimeout;
globalThis.fetch = async (url) => {
    console.log(`[fetch] ${url}`);
    return { ok: true, status: 200, text: async () => 'export default {}' };
};

console.log('--- 执行 polyfill ---');
try {
    (new Function(polyfillSrc))();
    console.log('[PASS] polyfill 执行无异常');
} catch (e) {
    console.error('[FAIL] 异常:', e.message);
    console.error(e.stack);
    process.exit(1);
}

const ready = messages.find(m => m.type === 'ready');
if (ready) {
    console.log('[OK] 收到 ready 消息');
} else {
    console.log('[WARN] 未收到 ready 消息');
}

try {
    const http = globalThis.require('http');
    if (http && typeof http.createServer === 'function') {
        console.log('[OK] require("http").createServer 可用');
    } else {
        console.log('[FAIL] http.createServer 不可用');
    }
} catch (e) {
    console.log('[FAIL] require("http"):', e.message);
}

console.log('\n消息总数:', messages.length);
