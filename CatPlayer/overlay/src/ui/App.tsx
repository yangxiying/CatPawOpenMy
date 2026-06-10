import React, { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import { SafeAreaView, StatusBar, View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform } from 'react-native';
import Boot from './screens/Boot';
import Sites from './screens/Sites';
import Category from './screens/Category';
import Detail from './screens/Detail';
import Player from './screens/Player';
import Favorites from './screens/Favorites';
import History from './screens/History';
import Settings from './screens/Settings';
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

const SCREENS: Record<string, React.ComponentType<any>> = { Boot, Sites, Category, Detail, Player, Favorites, History, Settings };

type Route = { name: string; params?: any };

/** Tab 页面名称集合，这些页面显示底部 Tab 栏 */
const TAB_SCREENS = ['Home', 'Favorites', 'History', 'Settings'];

/** 判断当前路由是否为 Tab 根页面 */
function isTabRoot(name: string): boolean {
    return TAB_SCREENS.includes(name);
}

export default function App() {
    const [stack, setStack] = useState<Route[]>([{ name: 'Boot' }]);
    const [activeTab, setActiveTab] = useState('home');
    const [isWebSrc, setIsWebSrc] = useState(false);

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

    // 网站源：全屏显示 WebView（网站 UI 在 WebView 内渲染）
    if (isWebSrc && cur.name === 'Boot') {
        return (
            <NavContext.Provider value={nav}>
                <NodeWebView visible={true} />
            </NavContext.Provider>
        );
    }

    return (
        <NavContext.Provider value={nav}>
            {/* NodeWebView 始终挂载（隐藏时 1x1px），负责执行 bundle */}
            <NodeWebView visible={false} />

            {/* 服务源：显示正常原生 UI */}
            <SafeAreaView style={styles.root}>
                <StatusBar barStyle="light-content" backgroundColor="#0b0b0f" />
                {!isPlayer && (
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
});
