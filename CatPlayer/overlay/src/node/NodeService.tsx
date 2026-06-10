/**
 * NodeService — 用隐藏 WebView 执行 Node.js 源 bundle，通过 postMessage 桥通信。
 * 替代 nodejs-mobile-react-native（iOS 18 兼容问题）。
 */
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import WebViewNode, { WebViewNodeRef } from './WebViewNode';
import { BridgeRequest, BridgeResponse, rejectAll } from './bridge';
import { SOURCE } from '../config';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// polyfill 源码（同步注入 WebView）
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

// 内嵌爬虫服务 bundle（CI 构建 nodejs/ 后内联）。存在则本地运行服务源，
// 不再下载远程"网站源"（cloud-drive 配置页）。
let embeddedSpiderCode = '';
let embeddedSpiderConfig = '';
try {
    const m = require('./spider-bundle-string');
    embeddedSpiderCode = m.spiderBundleCode || '';
    embeddedSpiderConfig = m.spiderConfigCode || '';
} catch {}

// 简易 MD5 实现
function md5(str: string) {
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
    private _isWebsiteSource = false;
    private readyResolve: (() => void) | null = null;
    private readyPromise: Promise<void>;
    private ready = false;
    private renderTrigger: (() => void) | null = null;
    private refreshCount = 0;
    private playCbs: Cb<{ url: string; title?: string }>[] = [];
    private sourceTypeCbs: Cb<boolean>[] = [];
    remoteSourceUrl: string = '';

    constructor() {
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
    }

    get isWebsiteSource() { return this._isWebsiteSource; }

    onSourceTypeChange(cb: Cb<boolean>) {
        this.sourceTypeCbs.push(cb);
        return () => { this.sourceTypeCbs = this.sourceTypeCbs.filter(c => c !== cb); };
    }

    private setIsWebsiteSource(v: boolean) {
        if (this._isWebsiteSource !== v) {
            this._isWebsiteSource = v;
            this.sourceTypeCbs.forEach(cb => cb(v));
        }
    }

    waitForReady(): Promise<void> {
        if (this.ready) return Promise.resolve();
        return this.readyPromise;
    }

    markReady() {
        this.ready = true;
        this.readyResolve?.();
    }

    onPlay(cb: Cb<{ url: string; title?: string }>) {
        this.playCbs.push(cb);
        return () => { this.playCbs = this.playCbs.filter(c => c !== cb); };
    }

    triggerPlay(url: string, title?: string) {
        this.playCbs.forEach(cb => cb({ url, title }));
    }

    onLog(cb: Cb<string>) {
        this.logCbs.push(cb);
        return () => { this.logCbs = this.logCbs.filter(c => c !== cb); };
    }
    onError(cb: Cb<string>) {
        this.errCbs.push(cb);
        return () => { this.errCbs = this.errCbs.filter(c => c !== cb); };
    }

    setRenderTrigger(cb: (() => void) | null) { this.renderTrigger = cb; }

    retry() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        this.setIsWebsiteSource(false);
        this.init();
    }

    async refresh() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        this.setIsWebsiteSource(false);
        try {
            const dir = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/catplayer`
                : `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.unlink(`${dir}/index.js`).catch(() => {});
            await RNFS.unlink(`${dir}/index.config.js`).catch(() => {});
        } catch {}
        await this.init();
    }

    /** 强制重新下载 bundle（清除 MD5 缓存 + 本地文件） */
    async forceRefresh() {
        this.log('forceRefresh: clearing cache…');
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        this.setIsWebsiteSource(false);
        try {
            const dir = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/catplayer`
                : `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.unlink(`${dir}/index.js`).catch(() => {});
            await RNFS.unlink(`${dir}/index.config.js`).catch(() => {});
            await RNFS.unlink(`${dir}/.md5`).catch(() => {});
            await RNFS.unlink(`${dir}/index.md5`).catch(() => {});
            this.log('forceRefresh: cache cleared');
        } catch (e) { this.log(`forceRefresh: clear error: ${e}`); }
        await this.init();
    }

    async init() {
        if (this.started) return;
        this.started = true;
        this.log(`init start (polyfillCode len=${polyfillCode.length})`);

        // 检查是否有自定义远程源 URL（Settings 配置）
        let remoteUrl = '';
        try {
            const AsyncStorage = require('@react-native-async-storage/async-storage').default;
            remoteUrl = (await AsyncStorage.getItem('setting_sourceUrl')) || '';
        } catch {}

        if (remoteUrl && remoteUrl !== SOURCE.base) {
            // 自定义远程源：下载 bundle，检测类型
            this.log(`custom remote source: ${remoteUrl}`);
            try {
                const dir = Platform.OS === 'ios'
                    ? `${RNFS.DocumentDirectoryPath}/catplayer`
                    : `${RNFS.DocumentDirectoryPath}/catplayer`;
                await RNFS.mkdir(dir).catch(() => {});

                // 下载 index.js
                const idxPath = `${dir}/remote_index.js`;
                const md5Path = `${dir}/remote_index.md5`;
                const baseNoMd5 = remoteUrl.replace(/\/index\.js\.md5$/, '').replace(/\/index\.md5$/, '');
                const md5Url = baseNoMd5 + '/index.js.md5';
                const jsUrl = baseNoMd5 + '/index.js';

                // 获取 auth header
                let authHeader = '';
                try {
                    const u = new URL(remoteUrl);
                    if (u.username || u.password) {
                        authHeader = 'Basic ' + btoa(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password));
                    }
                } catch {}

                // MD5 校验
                this.log('fetching remote md5…');
                await RNFS.downloadFile({ fromUrl: md5Url, toFile: md5Path, headers: authHeader ? { Authorization: authHeader } : {} }).promise;
                const wantMd5 = (await RNFS.readFile(md5Path, 'utf8')).trim();
                let cachedMd5 = '';
                try { cachedMd5 = (await RNFS.readFile(`${dir}/.remote_md5`, 'utf8')).trim(); } catch {}

                const idxExists = await RNFS.exists(idxPath).catch(() => false);
                let localOk = false;
                if (idxExists) {
                    try {
                        const content = await RNFS.readFile(idxPath, 'utf8');
                        localOk = md5(content).trim() === wantMd5;
                    } catch {}
                }

                if (cachedMd5 !== wantMd5 || !localOk) {
                    this.log('downloading remote bundle…');
                    await RNFS.downloadFile({ fromUrl: jsUrl, toFile: idxPath, headers: authHeader ? { Authorization: authHeader } : {} }).promise;
                    await RNFS.writeFile(`${dir}/.remote_md5`, wantMd5, 'utf8');
                } else {
                    this.log('cache hit');
                }

                this.bundleCode = await RNFS.readFile(idxPath, 'utf8');
                const isWeb = this.bundleCode.includes('globalThis.websiteBundle');
                this.setIsWebsiteSource(isWeb);
                this.log(`remote bundle loaded (${(this.bundleCode.length / 1024).toFixed(0)} KB), website=${isWeb}`);

                // 网站源：保存远程 URL 供 WebView 加载
                if (isWeb) {
                    this.remoteSourceUrl = baseNoMd5;
                    this.log(`website source URL: ${this.remoteSourceUrl}`);
                }

                this.renderTrigger?.();
                return;
            } catch (e: any) {
                this.log(`remote source failed: ${e?.message || e}, falling back to embedded`);
            }
        }

        // 优先使用内嵌爬虫服务 bundle（服务源）
        if (embeddedSpiderCode) {
            this.bundleCode = embeddedSpiderCode;
            this.configCode = embeddedSpiderConfig;
            this.setIsWebsiteSource(false);
            this.log(`embedded spider server (${(this.bundleCode.length / 1024).toFixed(0)} KB), config (${(this.configCode.length / 1024).toFixed(0)} KB)`);
            this.log('  类型: 服务源（embedded spider server）');
            this.log('triggering WebView render…');
            this.renderTrigger?.();
            this.log('WebView render triggered');
            return;
        }

        this.log('downloading source…');
        try {
            const dir = Platform.OS === 'ios'
                ? `${RNFS.DocumentDirectoryPath}/catplayer`
                : `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.mkdir(dir).catch(() => {});
            const idxPath = `${dir}/index.js`;
            const md5CachePath = `${dir}/.md5`;

            const md5Url = SOURCE.base + '/index.js.md5';
            this.log(`fetching remote md5: ${md5Url}`);
            await this.downloadFile(md5Url, dir, 'index.md5');
            const wantMd5 = (await RNFS.readFile(`${dir}/index.md5`, 'utf8')).trim();
            this.log(`remote md5: ${wantMd5}`);

            let cachedMd5 = '';
            try { cachedMd5 = (await RNFS.readFile(md5CachePath, 'utf8')).trim(); } catch {}
            this.log(`cached md5: ${cachedMd5 || '(none)'}`);

            const idxExists = await RNFS.exists(idxPath).catch(() => false);
            this.log(`local index.js exists: ${idxExists}`);

            let localOk = false;
            let localMd5 = '';
            if (idxExists) {
                try {
                    const content = await RNFS.readFile(idxPath, 'utf8');
                    localMd5 = md5(content).trim();
                    if (localMd5 === wantMd5) localOk = true;
                    this.log(`local file md5: ${localMd5} (match=${localOk})`);
                } catch (e) { this.log(`local md5 compute error: ${e}`); }
            }

            const needDownload = cachedMd5 !== wantMd5 || !localOk;
            this.log(`need download: ${needDownload} (md5Match=${cachedMd5 === wantMd5}, localOk=${localOk})`);

            if (needDownload) {
                this.log('downloading index.js…');
                await this.downloadFile(SOURCE.base + '/index.js', dir, 'index.js');
                await this.downloadFile(SOURCE.base + '/index.config.js', dir, 'index.config.js');
                await RNFS.writeFile(md5CachePath, wantMd5, 'utf8');
                // Verify downloaded file
                try {
                    const dlContent = await RNFS.readFile(idxPath, 'utf8');
                    const dlMd5 = md5(dlContent).trim();
                    this.log(`downloaded md5: ${dlMd5} (expected: ${wantMd5}, match=${dlMd5 === wantMd5})`);
                    if (dlMd5 !== wantMd5) {
                        this.log('WARNING: downloaded file MD5 mismatch!');
                    }
                } catch {}
                this.log('verified & cached');
            } else {
                this.log('cache hit');
            }
            this.bundleCode = await RNFS.readFile(idxPath, 'utf8');
            this.configCode = await RNFS.readFile(`${dir}/index.config.js`, 'utf8');
            const isWeb = this.bundleCode.includes('globalThis.websiteBundle');
            this.setIsWebsiteSource(isWeb);
            this.log(`bundle loaded (${(this.bundleCode.length / 1024).toFixed(0)} KB), config (${(this.configCode.length / 1024).toFixed(0)} KB)`);
            if (isWeb) this.log('  类型: 网站源（website source）');
            // Log bundle type indicator
            const hasAvvioRequire = this.bundleCode.includes('require("avvio")');
            const hasAvvioInline = this.bundleCode.includes('avvio');
            this.log(`bundle: external require("avvio")=${hasAvvioRequire}, avvio inline=${hasAvvioInline}`);
            this.log('triggering WebView render…');
            this.renderTrigger?.();
            this.log('WebView render triggered');
        } catch (e: any) {
            this.error(String(e?.message || e));
        }
    }

    /** 切换源地址后重新检测源类型 */
    async reloadSource() {
        this.log('reloadSource: re-detecting source type...');
        this.setIsWebsiteSource(false);
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleCode = '';
        this.configCode = '';
        await this.init();
    }

    private async downloadFile(url: string, dir: string, filename?: string): Promise<string> {
        const dest = filename ? `${dir}/${filename}` : `${dir}/tmp_${Date.now()}`;
        await RNFS.downloadFile({ fromUrl: url, toFile: dest, headers: { Authorization: `Basic ${SOURCE.auth}` } }).promise;
        return dest;
    }

    public log(msg: string) { this.logCbs.forEach(cb => cb(msg)); }
    private error(msg: string) { this.errCbs.forEach(cb => cb(msg)); }

    setWebViewRef(ref: WebViewNodeRef | null) { this.wvRef = ref; }

    async request(req: BridgeRequest): Promise<BridgeResponse> {
        if (!this.wvRef) throw new Error('WebView not ready');
        return this.wvRef.request(req);
    }

    getBaseUrl(): Promise<string> { return Promise.resolve('bridge://local'); }
    getBundleCode(): string { return this.bundleCode; }
    getConfigCode(): string { return this.configCode; }
    getRefreshCount(): number { return this.refreshCount; }
}

const nodeService = new NodeServiceImpl();
export default nodeService;

/** React 组件：包裹隐藏 WebView，需挂载在 App 里 */
export function NodeWebView({ visible: forcedVisible }: { visible?: boolean }) {
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [, forceRender] = useState(0);
    const wvRef = useRef<WebViewNodeRef>(null);
    const webWvRef = useRef<WebView>(null);

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
        nodeService.log(msg);
    }, []);

    const handlePlay = useCallback((url: string, title?: string) => {
        nodeService.triggerPlay(url, title);
    }, []);

    // 网站源：直接加载远程 URL（全屏可见 WebView）
    if (nodeService.isWebsiteSource && nodeService.remoteSourceUrl) {
        return (
            <View style={forcedVisible ? styles.visible : styles.hidden}>
                <WebView
                    ref={webWvRef}
                    source={{ uri: nodeService.remoteSourceUrl }}
                    style={styles.webview}
                    originWhitelist={['*']}
                    javaScriptEnabled
                    allowFileAccess
                    allowUniversalAccessFromFileURLs
                    mixedContentMode="always"
                    cacheEnabled={true}
                    allowFileAccessFromFileURLs
                    scrollEnabled
                    bounces
                    onLoadEnd={() => {
                        // 注入播放桥接：拦截播放请求发送给 RN
                        webWvRef.current?.injectJavaScript(`
(function(){
  window.addEventListener('message', function(e) {
    try {
      var d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (d && d.type === 'play') {
        window.ReactNativeWebView.postMessage(JSON.stringify(d));
      }
    } catch {}
  });
})();
true;
                        `);
                    }}
                />
            </View>
        );
    }

    const code = nodeService.getBundleCode();
    if (!code) { return null; }

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
            visible={forcedVisible ?? false}
            onPlay={handlePlay}
        />
    );
}

const styles = StyleSheet.create({
    hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -9999 },
    visible: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
    webview: { flex: 1, width: '100%', height: '100%' },
});
