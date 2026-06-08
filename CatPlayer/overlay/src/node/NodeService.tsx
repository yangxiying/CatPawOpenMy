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

// polyfill.js 内容（同步注入）
let polyfillCode = '';
try {
    // RN 打包时此文件会被 metro 打入 bundle
    polyfillCode = require('./polyfills.js').toString();
} catch {
    polyfillCode = '// polyfill load failed';
}

type Cb<T> = (v: T) => void;

class NodeServiceImpl {
    private started = false;
    private baseUrl: string | null = null;
    private wvRef: WebViewNodeRef | null = null;
    private logCbs: Cb<string>[] = [];
    private errCbs: Cb<string>[] = [];
    private bundleUri: string = '';
    private readyResolve: (() => void) | null = null;
    private readyPromise: Promise<void>;
    private ready = false;

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

    /** 重试（不清缓存） */
    retry() {
        this.started = false;
        // 重置 ready 状态
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleUri = '';
        this.init();
    }

    /** 强制刷新：清缓存重新下载 */
    async refresh() {
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.bundleUri = '';
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
            if (cachedMd5.trim() !== wantMd5) {
                this.log('downloading index.js…');
                await this.downloadFile(SOURCE.base + '/index.js', dir, 'index.js');
                await this.downloadFile(SOURCE.base + '/index.config.js', dir, 'index.config.js');
                // 缓存服务端的 md5，下次比对用
                await RNFS.writeFile(md5CachePath, wantMd5, 'utf8');
                this.log('verified & cached');
            } else {
                this.log('cache hit');
            }
            this.bundleUri = `file://${idxPath}`;
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

    getBundleUri(): string {
        return this.bundleUri;
    }
}

const nodeService = new NodeServiceImpl();
export default nodeService;

/** React 组件：包裹隐藏 WebView，需挂载在 App 里 */
export function NodeWebView() {
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const wvRef = useRef<WebViewNodeRef>(null);

    // callback ref：当 WebViewNode 挂载/卸载时自动更新 NodeService 的 wvRef
    const setWvRef = useCallback((ref: WebViewNodeRef | null) => {
        wvRef.current = ref;
        nodeService.setWebViewRef(ref);
    }, []);

    useEffect(() => {
        nodeService.init();
    }, []);

    const handleReady = useCallback((port: number) => {
        setLogs(l => [...l, `server ready (port ${port})`]);
        nodeService.markReady();
    }, []);

    const handleError = useCallback((msg: string) => {
        setErr(msg);
        setLogs(l => [...l, `error: ${msg}`]);
    }, []);

    const handleLog = useCallback((msg: string) => {
        setLogs(l => [...l.slice(-19), msg]);
    }, []);

    if (!nodeService.getBundleUri()) {
        return null;
    }

    return (
        <WebViewNode
            ref={setWvRef}
            bundleUri={nodeService.getBundleUri()}
            polyfillCode={polyfillCode}
            onReady={handleReady}
            onError={handleError}
            onLog={handleLog}
        />
    );
}
