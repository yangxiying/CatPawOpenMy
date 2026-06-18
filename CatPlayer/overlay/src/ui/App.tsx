import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import {
    SafeAreaView, StatusBar, View, Text, TouchableOpacity, StyleSheet,
    BackHandler, Platform, Modal, ScrollView, Clipboard,
} from 'react-native';
import Boot from './screens/Boot';
import Sites from './screens/Sites';
import Category from './screens/Category';
import Detail from './screens/Detail';
import Player from './screens/Player';
import Favorites from './screens/Favorites';
import History from './screens/History';
import Settings from './screens/Settings';
import Search from './screens/Search';
import TabBar from './components/TabBar';
import { NodeWebView } from '../node/NodeService';
import NodeService from '../node/NodeService';

export type Nav = {
    push: (name: string, params?: any) => void;
    pop: () => void;
    replace: (name: string, params?: any) => void;
};
const NavContext = createContext<Nav>(null as any);
export const useNav = () => useContext(NavContext);

const SCREENS: Record<string, React.ComponentType<any>> = { Boot, Sites, Category, Detail, Player, Favorites, History, Settings, Search };

type Route = { name: string; params?: any };

/** Tab 页面名称集合，这些页面显示底部 Tab 栏 */
const TAB_SCREENS = ['Sites', 'Favorites', 'History', 'Settings'];

/** 判断当前路由是否为 Tab 根页面 */
function isTabRoot(name: string): boolean {
    return TAB_SCREENS.includes(name);
}

export default function App() {
    const [stack, setStack] = useState<Route[]>([{ name: 'Boot' }]);
    const [activeTab, setActiveTab] = useState('home');
    const [isWebSrc, setIsWebSrc] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [logCopied, setLogCopied] = useState(false);

    const nav = useMemo<Nav>(() => ({
        push: (name, params) => setStack(s => [...s, { name, params }]),
        pop: () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)),
        replace: (name, params) => setStack(s => [...s.slice(0, -1), { name, params }]),
    }), []);

    /** 监听源类型变化，网站源时全屏显示 WebView */
    useEffect(() => {
        const off = NodeService.onSourceTypeChange(setIsWebSrc);
        setIsWebSrc(NodeService.isWebsiteSource);
        return off;
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            let handled = false;
            setStack(s => { if (s.length > 1) { handled = true; return s.slice(0, -1); } return s; });
            return handled;
        });
        return () => sub.remove();
    }, []);

    useEffect(() => {
        const unsub = NodeService.onPlay(({ url, title }) => {
            nav.push('Player', { qualities: [{ label: '源', url }], headers: {}, title: title || '' });
        });
        return unsub;
    }, [nav]);

    // 订阅日志
    useEffect(() => {
        const off = NodeService.onLog(m => setLogs(l => [...l.slice(-99), m]));
        return off;
    }, []);

    // 网站源不再直接渲染 WebView，而是走正常 Boot → 解析 → 进入 流程

    /** Tab 切换处理：替换栈底为对应 Tab 页面 */
    const handleTabChange = useCallback((tab: string) => {
        setActiveTab(tab);
        const screenMap: Record<string, string> = { home: 'Sites', favorites: 'Favorites', history: 'History', settings: 'Settings' };
        const screenName = screenMap[tab] || 'Sites';
        setStack([{ name: screenName }]);
    }, []);

    const cur = stack[stack.length - 1];
    const Screen = SCREENS[cur.name] || Boot;
    const canBack = stack.length > 1;
    const isPlayer = cur.name === 'Player';
    const showTabBar = !isPlayer && cur.name !== 'Boot' && isTabRoot(cur.name);

    return (
        <NavContext.Provider value={nav}>
            {/* NodeWebView 始终挂载（隐藏时 1x1px），负责执行 bundle */}
            <NodeWebView visible={false} />

            {/* 服务源：显示正常原生 UI */}
            <SafeAreaView style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0b0b0f" />
                {!isPlayer && cur.name !== 'Sites' && (
                    <View style={styles.header}>
                        {canBack ? (
                            <TouchableOpacity onPress={nav.pop} style={styles.side}><Text style={styles.back}>‹ 返回</Text></TouchableOpacity>
                        ) : <View style={styles.side} />}
                        <Text style={styles.title} numberOfLines={1}>{titleOf(cur)}</Text>
                        <View style={styles.side} />
                    </View>
                )}
                <View style={styles.body}>
                    <Screen {...(cur.params || {})} />
                </View>
                {showTabBar && <TabBar activeTab={activeTab} onTabChange={handleTabChange} />}

                {/* ═══════ 浮动日志按钮（所有 Tab 页面可见） ═══════ */}
                {showTabBar && (
                    <TouchableOpacity style={styles.logFloating} onPress={() => setShowLogs(true)} activeOpacity={0.7}>
                        <Text style={styles.logFloatingT}>日志</Text>
                    </TouchableOpacity>
                )}

                {/* ═══════ 日志弹窗 ═══════ */}
                <Modal visible={showLogs} transparent animationType="slide" onRequestClose={() => setShowLogs(false)}>
                    <View style={styles.logOverlay}>
                        <View style={styles.logPanel}>
                            <View style={styles.logHeader}>
                                <Text style={styles.logTitle}>运行日志</Text>
                                <View style={styles.logRight}>
                                    <TouchableOpacity style={styles.logCopyBtn} onPress={async () => {
                                        await Clipboard.setString(logs.join('\n'));
                                        setLogCopied(true);
                                        setTimeout(() => setLogCopied(false), 1500);
                                    }}>
                                        <Text style={styles.logCopyT}>{logCopied ? '已复制' : '复制日志'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.logCloseBtn} onPress={() => setShowLogs(false)}>
                                        <Text style={styles.logCloseT}>关闭</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            <ScrollView style={styles.logScroll} contentContainerStyle={{ padding: 10 }}>
                                {logs.length === 0 ? (
                                    <Text style={styles.logEmpty}>暂无日志</Text>
                                ) : (
                                    logs.map((l, i) => <Text key={i} style={styles.logLine}>• {l}</Text>)
                                )}
                            </ScrollView>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </NavContext.Provider>
    );
}

function titleOf(r: Route) {
    switch (r.name) {
        case 'Boot': return 'CatPlayer';
        case 'Sites': return '首页';
        case 'Category': return r.params?.site?.name || '分类';
        case 'Detail': return '详情';
        case 'Player': return '播放';
        case 'Favorites': return '收藏';
        case 'History': return '历史';
        case 'Settings': return '设置';
        case 'Search': return '搜索';
        default: return 'CatPlayer';
    }
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0b0b0f' },
    header: { height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#23232b' },
    side: { width: 72 },
    back: { color: '#7aa2ff', fontSize: 16 },
    title: { color: '#fff', fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
    body: { flex: 1 },
    webSettingsBtn: { position: 'absolute', bottom: 40, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4 },
    webSettingsBtnT: { color: '#fff', fontSize: 20 },

    /* ── 浮动日志按钮 ── */
    logFloating: {
        position: 'absolute', bottom: 68, right: 12,
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: 'rgba(42,47,69,0.92)',
        alignItems: 'center', justifyContent: 'center',
        elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4,
    },
    logFloatingT: { color: '#7aa2ff', fontSize: 11, fontWeight: '700' },

    /* ── 日志弹窗 ── */
    logOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    logPanel: { backgroundColor: '#14141b', borderTopLeftRadius: 14, borderTopRightRadius: 14, maxHeight: '75%', minHeight: 200 },
    logHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#23232b' },
    logTitle: { color: '#e6e8ef', fontSize: 15, fontWeight: '600' },
    logRight: { flexDirection: 'row', gap: 8 },
    logCopyBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#2a4535' },
    logCopyT: { color: '#7aa2ff', fontSize: 12 },
    logCloseBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, backgroundColor: '#2a2f45' },
    logCloseT: { color: '#9aa0ad', fontSize: 12 },
    logScroll: { maxHeight: 400 },
    logEmpty: { color: '#666', fontSize: 12, textAlign: 'center', paddingVertical: 30 },
    logLine: { color: '#8a8f9c', fontSize: 11, lineHeight: 16 },
});
