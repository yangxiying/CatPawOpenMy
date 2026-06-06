// 管理 nodejs-mobile 子线程的生命周期与桥消息。单例。
import nodejs from 'nodejs-mobile-react-native';
import { SOURCE } from '../config';

type Cb<T> = (v: T) => void;

class NodeServiceImpl {
    private started = false;
    private ready = false;
    private baseUrl: string | null = null;
    private waiters: { resolve: Cb<string>; reject: Cb<any> }[] = [];
    private logCbs: Cb<string>[] = [];
    private errCbs: Cb<string>[] = [];

    onLog(cb: Cb<string>) {
        this.logCbs.push(cb);
        return () => { this.logCbs = this.logCbs.filter(c => c !== cb); };
    }
    onError(cb: Cb<string>) {
        this.errCbs.push(cb);
        return () => { this.errCbs = this.errCbs.filter(c => c !== cb); };
    }

    /** 启动内嵌 Node 并绑定桥消息。延迟 2s 确保 RN ErrorUtils 已初始化。 */
    init() {
        if (this.started) return;
        this.started = true;
        // nodejs-mobile 的 native 模块 RNNodeJsMobile 在桥初始化早期加载，
        // 若此时 ErrorUtils 未就绪则触发 setGlobalHandler undefined → 崩溃。
        // 延迟启动让 RN 先完成初始化（包括 ErrorUtils）。
        setTimeout(() => {
            try {
                nodejs.start('main.js');
            } catch (e) {
                this.errCbs.forEach(cb => cb(String(e)));
                this.waiters.splice(0).forEach(w => w.reject(new Error(String(e))));
            }
            nodejs.channel.addListener('message', (raw: string) => {
                let m: any;
                try { m = JSON.parse(raw); } catch (e) { return; }
                switch (m.type) {
                    case 'ready':
                        this.ready = true;
                        this.load(false);
                        break;
                    case 'port':
                        this.baseUrl = `http://127.0.0.1:${m.port}`;
                        this.waiters.splice(0).forEach(w => w.resolve(this.baseUrl as string));
                        break;
                    case 'log':
                        this.logCbs.forEach(c => c(String(m.msg)));
                        break;
                    case 'error':
                        this.errCbs.forEach(c => c(String(m.error)));
                        this.waiters.splice(0).forEach(w => w.reject(new Error(String(m.error))));
                        break;
                }
            });
        }, 2000);
    }

    private send(obj: any) {
        nodejs.channel.send(JSON.stringify(obj));
    }

    private load(force: boolean) {
        if (!this.ready) return; // 'ready' 会自动触发首次 load
        this.send({ type: 'load', base: SOURCE.base, auth: SOURCE.auth, forceRefresh: force });
    }

    /** 解析为本地服务 baseUrl；端口未就绪时挂起，加载失败时 reject。 */
    getBaseUrl(): Promise<string> {
        if (this.baseUrl) return Promise.resolve(this.baseUrl);
        return new Promise<string>((resolve, reject) => this.waiters.push({ resolve, reject }));
    }

    /** 失败后重试（用 md5 缓存）。 */
    retry() { this.load(false); }

    /** 强制重下源并重启（忽略 md5 缓存）。 */
    refresh() { this.baseUrl = null; this.load(true); }
}

export default new NodeServiceImpl();
