/**
 * 持久化存储服务：收藏、观看历史、应用设置。
 * 优先使用 @react-native-async-storage/async-storage；
 * 若未安装则自动降级为内存 Map（进程重启后丢失）。
 */

declare const require: any;

let AsyncStorage: any = null;
try {
    AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
    AsyncStorage = null;
}

/** 内存降级存储 */
const memStore = new Map<string, string>();

/** 历史记录上限（FIFO） */
const HISTORY_LIMIT = 200;

/** 存储键前缀，避免冲突 */
const KEYS = {
    FAVORITES: '@CatPlayer/favorites',
    HISTORY: '@CatPlayer/history',
    SETTINGS_PREFIX: '@CatPlayer/setting/',
} as const;

// ─── 通用读写 ────────────────────────────────────────────────

/** 从持久化层读取原始 JSON 字符串并反序列化 */
async function read<T>(key: string, fallback: T): Promise<T> {
    try {
        const raw = AsyncStorage
            ? await AsyncStorage.getItem(key)
            : memStore.get(key) ?? null;
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

/** 将数据序列化后写入持久化层 */
async function write(key: string, value: unknown): Promise<void> {
    const raw = JSON.stringify(value);
    if (AsyncStorage) {
        await AsyncStorage.setItem(key, raw);
    } else {
        memStore.set(key, raw);
    }
}

// ─── 类型定义 ────────────────────────────────────────────────

/** 收藏条目 */
export interface FavoriteItem {
    id: string;
    name: string;
    pic: string;
    remarks: string;
    siteKey: string;
    siteName: string;
    siteApi: string;
    addedAt: number;
}

/** 观看历史条目 */
export interface HistoryItem {
    id: string;
    name: string;
    pic: string;
    remarks: string;
    siteKey: string;
    siteName: string;
    siteApi: string;
    lastEpisode: string;
    /** 上次播放位置（秒） */
    lastPosition: number;
    /** 上次播放时长（秒） */
    lastDuration: number;
    updatedAt: number;
}

/** 播放器类型 */
export type PlayerType = 'builtin' | 'mpv' | 'mdk';

/** 设置键与值类型映射 */
export interface SettingsMap {
    sourceUrl: string;
    sourceAuth: string;
    playerType: PlayerType;
    defaultSpeed: number;
}

// ─── 收藏 ────────────────────────────────────────────────────

/** 添加收藏，若已存在则更新 addedAt */
async function addFavorite(item: FavoriteItem): Promise<void> {
    const list = await read<FavoriteItem[]>(KEYS.FAVORITES, []);
    const idx = list.findIndex(f => f.id === item.id && f.siteKey === item.siteKey);
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...item, addedAt: Date.now() };
    } else {
        list.unshift({ ...item, addedAt: item.addedAt || Date.now() });
    }
    await write(KEYS.FAVORITES, list);
}

/** 移除收藏，按 id + siteKey 匹配 */
async function removeFavorite(id: string, siteKey: string): Promise<void> {
    const list = await read<FavoriteItem[]>(KEYS.FAVORITES, []);
    await write(
        KEYS.FAVORITES,
        list.filter(f => !(f.id === id && f.siteKey === siteKey)),
    );
}

/** 判断是否已收藏 */
async function isFavorite(id: string, siteKey: string): Promise<boolean> {
    const list = await read<FavoriteItem[]>(KEYS.FAVORITES, []);
    return list.some(f => f.id === id && f.siteKey === siteKey);
}

/** 获取全部收藏列表 */
async function listFavorites(): Promise<FavoriteItem[]> {
    return read<FavoriteItem[]>(KEYS.FAVORITES, []);
}

// ─── 观看历史 ────────────────────────────────────────────────

/**
 * 添加或更新历史记录。
 * 同一 id + siteKey 视为同一条目，更新播放信息并移至列表头部；
 * 超出 HISTORY_LIMIT 时淘汰最旧条目。
 */
async function addHistory(item: HistoryItem): Promise<void> {
    const list = await read<HistoryItem[]>(KEYS.HISTORY, []);
    const idx = list.findIndex(h => h.id === item.id && h.siteKey === item.siteKey);
    const entry: HistoryItem = { ...item, updatedAt: item.updatedAt || Date.now() };
    if (idx >= 0) {
        list.splice(idx, 1);
    }
    list.unshift(entry);
    if (list.length > HISTORY_LIMIT) {
        list.length = HISTORY_LIMIT;
    }
    await write(KEYS.HISTORY, list);
}

/** 移除单条历史，按 id + siteKey 匹配 */
async function removeHistory(id: string, siteKey: string): Promise<void> {
    const list = await read<HistoryItem[]>(KEYS.HISTORY, []);
    await write(
        KEYS.HISTORY,
        list.filter(h => !(h.id === id && h.siteKey === siteKey)),
    );
}

/** 获取全部观看历史 */
async function listHistory(): Promise<HistoryItem[]> {
    return read<HistoryItem[]>(KEYS.HISTORY, []);
}

// ─── 设置 ────────────────────────────────────────────────────

/** 读取单项设置，不存在时返回默认值 */
async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | null> {
    const defaults: SettingsMap = {
        sourceUrl: '',
        sourceAuth: '',
        playerType: 'builtin',
        defaultSpeed: 1.0,
    };
    const val = await read<SettingsMap[K] | null>(KEYS.SETTINGS_PREFIX + key, null);
    return val ?? defaults[key] ?? null;
}

/** 写入单项设置，带简单校验 */
async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
    if (key === 'defaultSpeed') {
        const speed = Number(value);
        if (speed < 0.5 || speed > 3.0) return;
    }
    if (key === 'playerType') {
        const allowed: PlayerType[] = ['builtin', 'mpv', 'mdk'];
        if (!allowed.includes(value as PlayerType)) return;
    }
    await write(KEYS.SETTINGS_PREFIX + key, value);
}

// ─── 导出单例 ────────────────────────────────────────────────

export const StorageService = {
    addFavorite,
    removeFavorite,
    isFavorite,
    listFavorites,
    addHistory,
    removeHistory,
    listHistory,
    getSetting,
    setSetting,
};
