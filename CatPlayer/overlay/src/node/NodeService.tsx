/**
 * NodeService — NodeMobile 主运行时路径。
 * 使用 nodejs-mobile-react-native 原生 Node.js 运行时替代隐藏 WebView polyfill。
 */
import { useEffect, useState } from 'react';
import RNFS from 'react-native-fs';
import { BridgeRequest, BridgeResponse } from './bridge';

type Cb<T> = (v: T) => void;

class NodeServiceImpl {
    private started = false;
    private baseUrl: string | null = null;
    private logCbs: Cb<string>[] = [];
    private errCbs: Cb<string>[] = [];
    private readyResolve: (() => void) | null = null;
    private readyPromise: Promise<void>;
    private ready = false;
    private renderTrigger: (() => void) | null = null;
    private refreshCount = 0;
    private playCbs: Cb<{ url: string; title?: string }>[] = [];
    remoteSourceUrl: string = '';
    private nodejs: any = null;
    private useNativeNode = false;
    private nativeNodePort = 0;

    constructor() {
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        this.tryNativeNode();
    }

    /** 尝试初始化原生 Node.js 运行时 */
    private async tryNativeNode() {
        try {
            console.log('[NodeJS] trying module...');
            const NodeJS = require('nodejs-mobile-react-native');
            console.log('[NodeJS] require result:', typeof NodeJS, NodeJS ? Object.keys(NodeJS).join(',') : 'null');
            this.nodejs = NodeJS;
            console.log('[NodeJS] module loaded OK, starting main.js...', typeof NodeJS?.start);
            NodeJS.start('main.js');
            console.log('[NodeJS] main.js started, channel listener setup...');
            NodeJS.channel.on('message', (msg: string) => {
                try {
                    const data = JSON.parse(msg);
                    if (data.type === 'server-ready') {
                        this.nativeNodePort = data.port;
                        this.useNativeNode = true;
                        console.log(`[NodeJS] server-ready on port ${data.port}`);
                        if (!this.ready) this.markReady();
                    } else if (data.type === 'node-started') {
                        console.log(`[NodeJS] heartbeat: ${data.message}`);
                    } else if (data.type === 'node-log') {
                        console.log(`[NodeJS:${data.level}] ${data.message}`);
                    } else if (data.type === 'sniff') {
                        this.handleSniff(data).then(result => {
                            NodeJS.channel.send(JSON.stringify({
                                correlationId: data.correlationId,
                                result,
                            }));
                        });
                    }
                } catch (e: any) {
                    console.error('[NodeJS] channel parse error:', e?.message);
                }
            });
            console.log('[NodeJS] initialization complete');
        } catch (e: any) {
            this.error(`NodeJS 运行时加载失败: ${e?.message || e}`);
            this.useNativeNode = false;
            this.nodejs = null;
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

    async retry() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        await this.init();
    }

    async refresh() {
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        const dir = `${RNFS.DocumentDirectoryPath}/catplayer`;
        await RNFS.unlink(`${dir}/index.js`).catch(() => {});
        await RNFS.unlink(`${dir}/index.config.js`).catch(() => {});
        await this.init();
    }

    /** 强制重新下载 bundle（清除 MD5 缓存 + 本地文件） */
    async forceRefresh() {
        this.log('forceRefresh: clearing cache…');
        this.refreshCount++;
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        const dir = `${RNFS.DocumentDirectoryPath}/catplayer`;
        await RNFS.unlink(`${dir}/index.js`).catch(() => {});
        await RNFS.unlink(`${dir}/index.config.js`).catch(() => {});
        await RNFS.unlink(`${dir}/.md5`).catch(() => {});
        await RNFS.unlink(`${dir}/index.md5`).catch(() => {});
        this.log('forceRefresh: cache cleared');
        await this.init();
    }

    async init() {
        if (this.started) return;
        this.started = true;
        this.log('init start (NodeMobile path)');

        // 等待原生 Node.js 运行时就绪（事件驱动，等待 server-ready）
        if (this.nodejs && !this.useNativeNode) {
            this.log('等待原生 Node.js 运行时就绪...');
            await this.waitForReady();
        }

        if (!this.useNativeNode) {
            this.error('Node.js 运行时未就绪');
            return;
        }
        this.log(`原生 Node.js 就绪 (port ${this.nativeNodePort})`);

        // 从远程源 URL 下载 bundle
        let remoteUrl = '';
        try {
            const { StorageService } = require('../storage/StorageService');
            await StorageService.migrateSourceSettings();
            const active = await StorageService.getActiveSource();
            remoteUrl = active?.url || '';
        } catch {}

        if (!remoteUrl) {
            this.error('未配置源 URL，请进入 Settings 设置');
            return;
        }

        this.log(`downloading source: ${remoteUrl}`);
        try {
            const dir = `${RNFS.DocumentDirectoryPath}/catplayer`;
            await RNFS.mkdir(dir).catch(() => {});

            // 解析 base URL
            const baseNoMd5 = remoteUrl.replace(/\/index\.js\.md5$/, '').replace(/\/index\.md5$/, '');
            const md5Url = baseNoMd5 + '/index.js.md5';
            const jsUrl = baseNoMd5 + '/index.js';
            const cfgPath = `${dir}/index.config.js`;
            const idxPath = `${dir}/index.js`;

            // 获取 auth header
            let authHeader = '';
            try {
                const u = new URL(remoteUrl);
                if (u.username || u.password) {
                    authHeader = 'Basic ' + btoa(decodeURIComponent(u.username) + ':' + decodeURIComponent(u.password));
                }
            } catch {}

            // MD5 校验（直接字符串比对，不需要手动 MD5 计算）
            this.log('fetching remote md5…');
            const md5Headers = authHeader ? { Authorization: authHeader } : {};
            await RNFS.downloadFile({ fromUrl: md5Url, toFile: `${dir}/index.md5`, headers: md5Headers }).promise;
            const wantMd5 = (await RNFS.readFile(`${dir}/index.md5`, 'utf8')).trim();
            let cachedMd5 = '';
            try { cachedMd5 = (await RNFS.readFile(`${dir}/.md5`, 'utf8')).trim(); } catch {}

            const idxExists = await RNFS.exists(idxPath).catch(() => false);
            if (!idxExists || cachedMd5 !== wantMd5) {
                this.log('downloading index.js…');
                const dlHeaders = authHeader ? { Authorization: authHeader } : {};
                await RNFS.downloadFile({ fromUrl: jsUrl, toFile: idxPath, headers: dlHeaders }).promise;
                await RNFS.downloadFile({ fromUrl: baseNoMd5 + '/index.config.js', toFile: cfgPath, headers: dlHeaders }).promise;
                await RNFS.writeFile(`${dir}/.md5`, wantMd5, 'utf8');
            } else {
                this.log('cache hit');
            }

            // 通过 rn-bridge 发送 run 指令到 Node.js main.js
            this.nodejs.channel.send(JSON.stringify({
                action: 'run',
                path: dir,
            }));
            this.log('Node.js spider bundle loaded');
            // retry/refresh 路径：useNativeNode 已为 true，标记 ready 避免死锁
            if (this.useNativeNode && !this.ready) this.markReady();
        } catch (e: any) {
            this.error(String(e?.message || e));
        }
    }

    /** 切换源地址后重新加载 */
    async reloadSource() {
        this.started = false;
        this.ready = false;
        this.readyPromise = new Promise(resolve => { this.readyResolve = resolve; });
        await this.init();
    }

    public log(msg: string) { this.logCbs.forEach(cb => cb(msg)); }
    public error(msg: string) { this.errCbs.forEach(cb => cb(msg)); }

    async request(req: BridgeRequest): Promise<BridgeResponse> {
        if (this.useNativeNode && this.nativeNodePort > 0) {
            return await this.nativeNodeRequest(req);
        }
        throw new Error('Node.js runtime not ready');
    }

    private async nativeNodeRequest(req: BridgeRequest): Promise<BridgeResponse> {
        const url = `http://127.0.0.1:${this.nativeNodePort}${req.url}`;
        const headers: Record<string, string> = { ...(req.headers || {}) };
        if (!headers['content-type']) headers['content-type'] = 'application/json';
        const res = await fetch(url, {
            method: req.method || 'GET',
            headers,
            body: req.body || undefined,
        });
        const body = await res.text();
        const respHeaders: Record<string, string> = {};
        res.headers?.forEach?.((v: string, k: string) => { respHeaders[k] = v; });
        return { status: res.status, headers: respHeaders, body };
    }

    private async handleSniff(data: any): Promise<any> {
        try {
            const { SniffModule } = require('react-native').NativeModules;
            if (!SniffModule) return null;
            const result = await SniffModule.sniff(data.url, data.rule, data.timeout || 10000);
            return result;
        } catch {
            return null;
        }
    }

    getBaseUrl(): Promise<string> { return Promise.resolve('bridge://local'); }
    getRefreshCount(): number { return this.refreshCount; }
}

const nodeService = new NodeServiceImpl();
export default nodeService;

/** React 组件占位 — NodeMobile 路径不再需要隐藏 WebView */
export function NodeWebView(_props: { visible?: boolean }) {
    const [, forceRender] = useState(0);
    useEffect(() => {
        nodeService.setRenderTrigger(() => forceRender(v => v + 1));
        nodeService.init();
        return () => { nodeService.setRenderTrigger(null); };
    }, []);
    return null;
}
