/**
 * 持久化存储服务
 * 使用 react-native-fs 文件存储（已有依赖，无需新增 native 模块）
 * 存储路径: DocumentDirectoryPath/catplayer/store.json
 */

let RNFS: any = null;
try {
    // @ts-ignore — 可选依赖
    RNFS = require('react-native-fs');
} catch {
    RNFS = null;
}

const STORE_FILE = (RNFS?.DocumentDirectoryPath || '/tmp') + '/catplayer/store.json';

/** 内存缓存 */
let cache: Record<string, any> | null = null;

/** 读取整个存储 */
async function loadStore(): Promise<Record<string, any>> {
    if (cache) return cache;
    if (!RNFS) return {};
    try {
        const exists = await RNFS.exists(STORE_FILE);
        if (!exists) { cache = {}; return cache; }
        const raw = await RNFS.readFile(STORE_FILE, 'utf8');
        cache = JSON.parse(raw);
    } catch {
        cache = {};
    }
    return cache!;
}

/** 写入整个存储 */
async function saveStore(store: Record<string, any>): Promise<void> {
    cache = store;
    if (!RNFS) return;
    try {
        const dir = STORE_FILE.substring(0, STORE_FILE.lastIndexOf('/'));
        const dirExists = await RNFS.exists(dir);
        if (!dirExists) await RNFS.mkdir(dir);
        await RNFS.writeFile(STORE_FILE, JSON.stringify(store), 'utf8');
    } catch { /* ignore write failures */ }
}

/** 收藏条目 */
export type FavoriteItem = {
    id: string;
    name: string;
    pic: string;
    remarks: string;
    siteKey: string;
    siteName: string;
    siteApi: string;
    addedAt: number;
};

/** 历史条目 */
export type HistoryItem = {
    id: string;
    name: string;
    pic: string;
    remarks: string;
    siteKey: string;
    siteName: string;
    siteApi: string;
    lastEpisode: string;
    lastPosition: number;
    lastDuration: number;
    updatedAt: number;
};

const MAX_HISTORY = 200;

/** 播放源 */
export type SourceItem = {
    id: string;
    name: string;
    url: string;
    isActive: boolean;
};

const DEFAULT_SOURCE: SourceItem = {
    id: 'default',
    name: '默认源',
    url: 'http://wexfnw:wexfnw@cat.999888123.xyz/index.js.md5',
    isActive: true,
};

export const StorageService = {
    // ─── 收藏 ───

    /** 添加收藏，已存在则更新 */
    async addFavorite(item: FavoriteItem): Promise<void> {
        const store = await loadStore();
        if (!store.favorites) store.favorites = [];
        const idx = store.favorites.findIndex((f: FavoriteItem) => f.id === item.id && f.siteKey === item.siteKey);
        if (idx >= 0) { store.favorites[idx] = item; }
        else { store.favorites.push(item); }
        await saveStore(store);
    },

    /** 移除收藏 */
    async removeFavorite(id: string, siteKey: string): Promise<void> {
        const store = await loadStore();
        if (!store.favorites) return;
        store.favorites = store.favorites.filter((f: FavoriteItem) => !(f.id === id && f.siteKey === siteKey));
        await saveStore(store);
    },

    /** 判断是否已收藏 */
    async isFavorite(id: string, siteKey: string): Promise<boolean> {
        const store = await loadStore();
        return (store.favorites || []).some((f: FavoriteItem) => f.id === id && f.siteKey === siteKey);
    },

    /** 获取全部收藏 */
    async listFavorites(): Promise<FavoriteItem[]> {
        const store = await loadStore();
        return store.favorites || [];
    },

    // ─── 历史 ───

    /** 添加/更新观看历史（同条目移至头部，上限 200 条） */
    async addHistory(item: HistoryItem): Promise<void> {
        const store = await loadStore();
        if (!store.history) store.history = [];
        store.history = store.history.filter((h: HistoryItem) => !(h.id === item.id && h.siteKey === item.siteKey));
        store.history.unshift(item);
        if (store.history.length > MAX_HISTORY) store.history = store.history.slice(0, MAX_HISTORY);
        await saveStore(store);
    },

    /** 移除单条历史 */
    async removeHistory(id: string, siteKey: string): Promise<void> {
        const store = await loadStore();
        if (!store.history) return;
        store.history = store.history.filter((h: HistoryItem) => !(h.id === id && h.siteKey === siteKey));
        await saveStore(store);
    },

    /** 获取全部历史（按 updatedAt 降序） */
    async listHistory(): Promise<HistoryItem[]> {
        const store = await loadStore();
        return (store.history || []).sort((a: HistoryItem, b: HistoryItem) => b.updatedAt - a.updatedAt);
    },

    /** 清空全部历史 */
    async clearHistory(): Promise<void> {
        const store = await loadStore();
        store.history = [];
        await saveStore(store);
    },

    // ─── 设置 ───

    /** 获取设置值 */
    async getSetting(key: string): Promise<any> {
        const defaults: Record<string, any> = {
            sourceUrl: '',
            sourceAuth: '',
            playerType: 'builtin',
            defaultSpeed: 1.0,
        };
        const store = await loadStore();
        if (!store.settings) store.settings = {};
        return store.settings[key] !== undefined ? store.settings[key] : defaults[key];
    },

    /** 设置值 */
    async setSetting(key: string, value: any): Promise<void> {
        const store = await loadStore();
        if (!store.settings) store.settings = {};
        store.settings[key] = value;
        await saveStore(store);
    },

    // ─── 播放源管理 ───

    /** 获取所有播放源（首次调用自动创建默认源） */
    async listSources(): Promise<SourceItem[]> {
        const store = await loadStore();
        if (!store.sources || !Array.isArray(store.sources) || store.sources.length === 0) {
            store.sources = [DEFAULT_SOURCE];
            await saveStore(store);
        }
        return store.sources;
    },

    /** 获取当前激活的播放源 */
    async getActiveSource(): Promise<SourceItem> {
        const sources = await this.listSources();
        return sources.find(s => s.isActive) || sources[0] || DEFAULT_SOURCE;
    },

    /** 添加播放源 */
    async addSource(item: Omit<SourceItem, 'id' | 'isActive'>): Promise<SourceItem> {
        const store = await loadStore();
        if (!store.sources) store.sources = [];
        const newItem: SourceItem = {
            ...item,
            id: 'src_' + Date.now(),
            isActive: store.sources.length === 0,
        };
        store.sources.push(newItem);
        await saveStore(store);
        return newItem;
    },

    /** 更新播放源 */
    async updateSource(id: string, updates: Partial<Omit<SourceItem, 'id'>>): Promise<void> {
        const store = await loadStore();
        if (!store.sources) return;
        const idx = store.sources.findIndex((s: SourceItem) => s.id === id);
        if (idx >= 0) Object.assign(store.sources[idx], updates);
        await saveStore(store);
    },

    /** 删除播放源（不能删除最后一个） */
    async removeSource(id: string): Promise<void> {
        const store = await loadStore();
        if (!store.sources || store.sources.length <= 1) return;
        const wasActive = store.sources.find((s: SourceItem) => s.id === id)?.isActive;
        store.sources = store.sources.filter((s: SourceItem) => s.id !== id);
        if (wasActive && store.sources.length > 0) store.sources[0].isActive = true;
        await saveStore(store);
    },

    /** 设置激活的播放源（取消其他激活） */
    async setActiveSource(id: string): Promise<void> {
        const store = await loadStore();
        if (!store.sources) return;
        store.sources.forEach((s: SourceItem) => { s.isActive = s.id === id; });
        await saveStore(store);
    },

    /** 从旧的 sourceUrl/sourceAuth 迁移到 sources 数组 */
    async migrateSourceSettings(): Promise<void> {
        const store = await loadStore();
        if (store.sources && Array.isArray(store.sources) && store.sources.length > 0) return;
        const oldUrl = store.settings?.sourceUrl;
        if (oldUrl) {
            const auth = store.settings?.sourceAuth || '';
            let fullUrl = oldUrl;
            if (auth) {
                try {
                    const decoded = atob(auth);
                    const [user, pass] = decoded.split(':');
                    const u = new URL(oldUrl);
                    u.username = user || '';
                    u.password = pass || '';
                    fullUrl = u.toString();
                } catch {}
            }
            store.sources = [{ id: 'migrated', name: '已迁移源', url: fullUrl, isActive: true }];
        } else {
            store.sources = [DEFAULT_SOURCE];
        }
        await saveStore(store);
    },
};
