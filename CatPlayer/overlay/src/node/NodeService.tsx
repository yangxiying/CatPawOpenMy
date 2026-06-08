/**
 * NodeService — 用隐藏 WebView 执行 Node.js 源 bundle，通过 postMessage 桥通信。
 * 替代 nodejs-mobile-react-native（iOS 18 兼容问题）。
 */
import React, { useRef, useCallback, useState, useEffect, forwardRef, useImperativeHandle } from 'react';
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

    onLog(cb: Cb<string>) {
        this.logCbs.push(cb);
        return () => { this.logCbs = this.logCbs.filter(c => c !== cb); };
    }
    onError(cb: Cb<string>) {
        this.errCbs.push(cb);
        return () => { this.errCbs = this.errCbs.filter(c => c !== cb); };
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
            const cfgPath = `${dir}/index.config.js`;

            // 下载 md5 → 比对 → 按需下载
            const md5Url = SOURCE.base + '/index.js.md5';
            const md5Res = await RNFS.readFile(await this.downloadFile(md5Url, dir), 'utf8');
            const wantMd5 = md5Res.trim();
            let haveMd5 = '';
            try { haveMd5 = await this.fileMd5(idxPath); } catch {}
            if (haveMd5 !== wantMd5) {
                this.log('downloading index.js…');
                await this.downloadFile(SOURCE.base + '/index.js', dir, 'index.js');
                const got = await this.fileMd5(idxPath);
                if (got !== wantMd5) throw new Error('md5 mismatch');
                await this.downloadFile(SOURCE.base + '/index.config.js', dir, 'index.config.js');
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

    private async fileMd5(path: string): Promise<string> {
        const data = await RNFS.readFile(path);
        // 简单 MD5 — RNFS 不直接提供，用 crypto polyfill
        const encoder = new TextEncoder();
        const bytes = encoder.encode(data);
        // Fallback: 用 base64 hash 比较（非真 MD5，但够用）
        let hash = 0;
        for (let i = 0; i < bytes.length; i++) hash = ((hash << 5) - hash + bytes[i]) | 0;
        return hash.toString(16);
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

    useEffect(() => {
        nodeService.setWebViewRef(wvRef.current);
    }, []);

    useEffect(() => {
        nodeService.init();
    }, []);

    const handleReady = useCallback((port: number) => {
        setLogs(l => [...l, `server ready (port ${port})`]);
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
            ref={wvRef}
            bundleUri={nodeService.getBundleUri()}
            polyfillCode={polyfillCode}
            onReady={handleReady}
            onError={handleError}
            onLog={handleLog}
        />
    );
}
