/**
 * NodeService — 用隐藏 WebView 执行 Node.js 源 bundle，通过 postMessage 桥通信。
 * 替代 nodejs-mobile-react-native（iOS 18 兼容问题）。
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import WebViewNode, { WebViewNodeRef } from './WebViewNode';
import { BridgeRequest, BridgeResponse, rejectAll } from './bridge';
import { SOURCE } from '../config';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// polyfill 源码（同步注入 WebView）
// 优先使用预构建的字符串常量（避免 Hermes Function.prototype.toString() 反编译 bug）
let polyfillCode: string = '';
try {
    polyfillCode = require('./polyfill-string').polyfillCode;
} catch {
    try {
        polyfillCode = require('./polyfills.js').toString();
    } catch {
        polyfillCode = '// polyfill load failed';
    }
}

// 简易 MD5 实现（用于本地文件完整性校验，来源：简化版 public-domain 实现）
function md5(str: string) {
    // UTF8 encode
    function toUtf8(s: string) {
        return unescape(encodeURIComponent(s));
    }
    const s = toUtf8(str);
    function rotl(n: number, c: number) { return (n << c) | (n >>> (32 - c)); }
    function cmn(q: number, a: number, b: number, x: number, s2: number, t: number) {
        a = (a + q + x + t) | 0;
        return ((rotl(a, s2) + b) | 0) >>> 0;
    }
    function ff(a: number, b: number, c: number, d: number, x: number, s2: number, t: number) { return cmn((b & c) | (~b & d), a, b, x, s2, t); }
    function gg(a: number, b: number, c: number, d: number, x: number, s2: number, t: number) { return cmn((b & d) | (c & ~d), a, b, x, s2, t); }
    function hh(a: number, b: number, c: number, d: number, x: number, s2: number, t: number) { return cmn(b ^ c ^ d, a, b, x, s2, t); }
    function ii(a: number, b: number, c: number, d: number, x: number, s2: number, t: number) { return cmn(c ^ (b | ~d), a, b, x, s2, t); }
    function toWords(str2: string) {
        const n = str2.length;
        const words: number[] = [];
        for (let i = 0; i < n; i += 4) {
            words[i >> 2] = (str2.charCodeAt(i) & 0xff) | ((str2.charCodeAt(i + 1) & 0xff) << 8) | ((str2.charCodeAt(i + 2) & 0xff) << 16) | ((str2.charCodeAt(i + 3) & 0xff) << 24);
        }
        return words;
    }
    const bytes = s;
    const bitLen = bytes.length * 8;
    let words = toWords(bytes);
    // append padding
    const idx = bytes.length;
    words[idx >> 2] = (words[idx >> 2] || 0) | (0x80 << ((idx % 4) * 8));
    const needed = (((idx + 8) >> 6) + 1) * 16;
    while (words.length < needed) words.push(0);
    words[needed - 2] = bitLen & 0xffffffff;
    words[needed - 1] = (bitLen / 0x100000000) >>> 0;
    let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (let i = 0; i < words.length; i += 16) {
        const olda = a, oldb = b, oldc = c, oldd = d;
        a = ff(a, b, c, d, words[i + 0], 7, -680876936);
        d = ff(d, a, b, c, words[i + 1], 12, -389564586);
        c = ff(c, d, a, b, words[i + 2], 17, 606105819);
        b = ff(b, c, d, a, words[i + 3], 22, -1044525330);
        a = ff(a, b, c, d, words[i + 4], 7, -176418897);
        d = ff(d, a, b, c, words[i + 5], 12, 1200080426);
        c = ff(c, d, a, b, words[i + 6], 17, -1473231341);
        b = ff(b, c, d, a, words[i + 7], 22, -45705983);
        a = ff(a, b, c, d, words[i + 8], 7, 1770035416);
        d = ff(d, a, b, c, words[i + 9], 12, -1958414417);
        c = ff(c, d, a, b, words[i + 10], 17, -42063);
        b = ff(b, c, d, a, words[i + 11], 22, -1990404162);
        a = ff(a, b, c, d, words[i + 12], 7, 1804603682);
        d = ff(d, a, b, c, words[i + 13], 12, -40341101);
        c = ff(c, d, a, b, words[i + 14], 17, -1502002290);
        b = ff(b, c, d, a, words[i + 15], 22, 1236535329);
        a = gg(a, b, c, d, words[i + 1], 5, -165796510);
        d = gg(d, a, b, c, words[i + 6], 9, -1069501632);
        c = gg(c, d, a, b, words[i + 11], 14, 643717713);
        b = gg(b, c, d, a, words[i + 0], 20, -373897302);
        a = gg(a, b, c, d, words[i + 5], 5, -701558691);
        d = gg(d, a, b, c, words[i + 10], 9, 38016083);
        c = gg(c, d, a, b, words[i + 15], 14, -660478335);
        b = gg(b, c, d, a, words[i + 4], 20, -405537848);
        a = gg(a, b, c, d, words[i + 9], 5, 568446438);
        d = gg(d, a, b, c, words[i + 14], 9, -1019803690);
        c = gg(c, d, a, b, words[i + 3], 14, -187363961);
        b = gg(b, c, d, a, words[i + 8], 20, 1163531501);
        a = gg(a, b, c, d, words[i + 13], 5, -1444681467);
        d = gg(d, a, b, c, words[i + 2], 9, -51403784);
        c = gg(c, d, a, b, words[i + 7], 14, 1735328473);
        b = gg(b, c, d, a, words[i + 12], 20, -1926607734);
        a = hh(a, b, c, d, words[i + 5], 4, -378558);
        d = hh(d, a, b, c, words[i + 8], 11, -2022574463);
        c = hh(c, d, a, b, words[i + 11], 16, 1839030562);
        b = hh(b, c, d, a, words[i + 14], 23, -35309556);
        a = hh(a, b, c, d, words[i + 1], 4, -1530992060);
        d = hh(d, a, b, c, words[i + 4], 11, 1272893353);
        c = hh(c, d, a, b, words[i + 7], 16, -155497632);
        b = hh(b, c, d, a, words[i + 10], 23, -1094730640);
        a = hh(a, b, c, d, words[i + 13], 4, 681279174);
        d = hh(d, a, b, c, words[i + 0], 11, -358537222);
        c = hh(c, d, a, b, words[i + 3], 16, -722521979);
        b = hh(b, c, d, a, words[i + 6], 23, 76029189);
        a = hh(a, b, c, d, words[i + 9], 4, -640364487);
        d = hh(d, a, b, c, words[i + 12], 11, -421815835);
        c = hh(c, d, a, b, words[i + 15], 16, 530742520);
        b = hh(b, c, d, a, words[i + 2], 23, -995338651);
        a = ii(a, b, c, d, words[i + 0], 6, -198630844);
        d = ii(d, a, b, c, words[i + 7], 10, 1126891415);
        c = ii(c, d, a, b, words[i + 14], 15, -1416354905);
        b = ii(b, c, d, a, words[i + 5], 21, -57434055);
        a = ii(a, b, c, d, words[i + 12], 6, 1700485571);
        d = ii(d, a, b, c, words[i + 3], 10, -1894986606);
        c = ii(c, d, a, b, words[i + 10], 15, -1051523);
        b = ii(b, c, d, a, words[i + 1], 21, -2054922799);
        a = ii(a, b, c, d, words[i + 8], 6, 1873313359);
        d = ii(d, a, b, c, words[i + 15], 10, -30611744);
        c = ii(c, d, a, b, words[i + 6], 15, -1560198380);
        b = ii(b, c, d, a, words[i + 13], 21, 1309151649);
        a = ii(a, b, c, d, words[i + 4], 6, -145523070);
        d = ii(d, a, b, c, words[i + 11], 10, -1120210379);
        c = ii(c, d, a, b, words[i + 2], 15, 718787259);
        b = ii(b, c, d, a, words[i + 9], 21, -343485551);
        a = (a + olda) | 0; b = (b + oldb) | 0; c = (c + oldc) | 0; d = (d + oldd) | 0;
    }
    function hex(x: number) { const h = [(x & 0xff), (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff]; return h.map(v => v.toString(16).padStart(2, '0')).join(''); }
    return (hex(a) + hex(b) + hex(c) + hex(d)).toLowerCase();
}

type Cb<T> = (v: T) => void;

class NodeServiceImpl {
    private started = false;
    private baseUrl: string | null = null;
    private wvRef: WebViewNodeRef | null = null;
    private logCbs: Cb<string>[] = [];
    private errCbs: Cb<string>[] = [];
    private bundleCode: string = '';
    private configCode: string = '';
    private readyResolve: (() => void) | null = null;
    private readyPromise: Promise<void>;
    private ready = false;
    private renderTrigger: (() => void) | null = null;
    private refreshCount = 0;

    constructor() {
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
    }

    /** 等待 WebView 就绪（polyfill 加载→bundle 启动→server port 就绪） */
    waitForReady(): Promise<void> {
        if (this.ready) return Promise.resolve();
        return this.readyPromise;
    }

    /** 由 WebViewNode 收到 'port' 消息时调用 */
    markReady() {
        this.ready = true;
        this.readyResolve?.();
    }

    onLog(cb: Cb<string>) {
        this.logCbs.push(cb);
        return () => { this.logCbs = this.logCbs.filter(c => c !== cb); };
    }
    onError(cb: Cb<string>) {
        this.errCbs.push(cb);
        return () => { this.errCbs = this.errCbs.filter(c => c !== cb); };
    }

    /** 注册 React 强制渲染回调 */
    setRenderTrigger(cb: (() => void) | null) { this.renderTrigger = cb; }

    /** 重试（不清缓存） */
    retry() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        this.init();
    }

    /** 强制刷新：清缓存重新下载 */
    async refresh() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        // 清除已下载的文件
        try {
            const dir = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/catplayer`
                : `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.unlink(`${dir}/index.js`).catch(() => {});
            await RNFS.unlink(`${dir}/index.config.js`).catch(() => {});
        } catch {}
        await this.init();
    }

    async init() {
        if (this.started) return;
        this.started = true;
        this.log(`init start (polyfillCode len=${polyfillCode.length})`);
        this.log('downloading source…');
        try {
            const dir = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/catplayer`
                : `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.mkdir(dir).catch(() => {});
            const idxPath = `${dir}/index.js`;
            const md5CachePath = `${dir}/.md5`;

            // 下载服务端 md5 摘要
            const md5Url = SOURCE.base + '/index.js.md5';
            await this.downloadFile(md5Url, dir, 'index.md5');
            const wantMd5 = (await RNFS.readFile(`${dir}/index.md5`, 'utf8')).trim();

            // 读取本地缓存的 md5，与服务器比对决定是否重新下载
            let cachedMd5 = '';
            try { cachedMd5 = await RNFS.readFile(md5CachePath, 'utf8'); } catch {}
            // 如果缓存 md5 相同，仍需确认 index.js 文件确实存在且文件内容的 md5 与 wantMd5 匹配（防止文件损坏）
            const idxExists = await RNFS.exists(idxPath).catch(() => false);
            let localOk = false;
            if (idxExists) {
                try {
                    const content = await RNFS.readFile(idxPath, 'utf8');
                    const localMd5 = md5(content).trim();
                    if (localMd5 === wantMd5) localOk = true;
                } catch (e) { /* ignore */ }
            }
            if (cachedMd5.trim() !== wantMd5 || !localOk) {
                this.log('downloading index.js…');
                await this.downloadFile(SOURCE.base + '/index.js', dir, 'index.js');
                await this.downloadFile(SOURCE.base + '/index.config.js', dir, 'index.config.js');
                // 缓存服务端的 md5，下次比对用
                await RNFS.writeFile(md5CachePath, wantMd5, 'utf8');
                this.log('verified & cached');
            } else {
                this.log('cache hit');
            }
            // 读入内存供 WebView 直接注入（绕过 file:// fetch CORS 限制）
            this.bundleCode = await RNFS.readFile(idxPath, 'utf8');
            this.configCode = await RNFS.readFile(`${dir}/index.config.js`, 'utf8');
            this.log(`bundle loaded (${(this.bundleCode.length / 1024).toFixed(0)} KB), config (${(this.configCode.length / 1024).toFixed(0)} KB)`);
            this.log('triggering WebView render…');
            this.renderTrigger?.();
            this.log('WebView render triggered');
        } catch (e: any) {
            this.error(String(e?.message || e));
        }
    }

    private async downloadFile(url: string, dir: string, filename?: string): Promise<string> {
        const dest = filename ? `${dir}/${filename}` : `${dir}/tmp_${Date.now()}`;
        await RNFS.downloadFile({ fromUrl: url, toFile: dest, headers: { Authorization: `Basic ${SOURCE.auth}` } }).promise;
        return dest;
    }

    private log(msg: string) { this.logCbs.forEach(cb => cb(msg)); }
    private error(msg: string) { this.errCbs.forEach(cb => cb(msg)); }

    setWebViewRef(ref: WebViewNodeRef | null) { this.wvRef = ref; }

    async request(req: BridgeRequest): Promise<BridgeResponse> {
        if (!this.wvRef) throw new Error('WebView not ready');
        return this.wvRef.request(req);
    }

    getBaseUrl(): Promise<string> {
        return Promise.resolve('bridge://local');
    }

    getBundleCode(): string {
        return this.bundleCode;
    }

    getConfigCode(): string {
        return this.configCode;
    }

    getRefreshCount(): number {
        return this.refreshCount;
    }
}

const nodeService = new NodeServiceImpl();
export default nodeService;

/** React 组件：包裹隐藏 WebView，需挂载在 App 里 */
export function NodeWebView() {
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [, forceRender] = useState(0);
    const wvRef = useRef<WebViewNodeRef>(null);

    // callback ref：当 WebViewNode 挂载/卸载时自动更新 NodeService 的 wvRef
    const setWvRef = useCallback((ref: WebViewNodeRef | null) => {
        wvRef.current = ref;
        nodeService.setWebViewRef(ref);
    }, []);

    useEffect(() => {
        nodeService.setRenderTrigger(() => forceRender(v => v + 1));
        nodeService.init();
        return () => { nodeService.setRenderTrigger(null); };
    }, []);

    const handleReady = useCallback((port: number) => {
        setLogs(l => [...l, `server ready (port ${port})`]);
        nodeService.markReady();
    }, []);

    const handleError = useCallback((msg: string) => {
        setErr(msg);
        setLogs(l => [...l, `error: ${msg}`]);
        nodeService.error(msg);
    }, []);

    const handleLog = useCallback((msg: string) => {
        setLogs(l => [...l.slice(-19), msg]);
    }, []);

    const code = nodeService.getBundleCode();
    if (!code) {
        return null;
    }

    return (
        <WebViewNode
            key={nodeService.getRefreshCount()}
            ref={setWvRef}
            bundleCode={code}
            configCode={nodeService.getConfigCode()}
            polyfillCode={polyfillCode}
            onReady={handleReady}
            onError={handleError}
            onLog={handleLog}
        />
    );
}
