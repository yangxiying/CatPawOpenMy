import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, View, Text, TouchableOpacity, StyleSheet, BackHandler, Platform } from 'react-native';
import Boot from './screens/Boot';
import Sites from './screens/Sites';
import Category from './screens/Category';
import Detail from './screens/Detail';
import Player from './screens/Player';
import { NodeWebView } from '../node/NodeService';
import NodeService from '../node/NodeService';

export type Nav = {
    push: (name: string, params?: any) => void;
    pop: () => void;
    replace: (name: string, params?: any) => void;
};
const NavContext = createContext<Nav>(null as any);
export const useNav = () => useContext(NavContext);

const SCREENS: Record<string, React.ComponentType<any>> = { Boot, Sites, Category, Detail, Player };

type Route = { name: string; params?: any };

export default function App() {
    const [stack, setStack] = useState<Route[]>([{ name: 'Boot' }]);
    const [isWebSrc, setIsWebSrc] = useState(NodeService.isWebsiteSource);
    const nav = useMemo<Nav>(() => ({
        push: (name, params) => setStack(s => [...s, { name, params }]),
        pop: () => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)),
        replace: (name, params) => setStack(s => [...s.slice(0, -1), { name, params }]),
    }), []);

    useEffect(() => {
        const off = NodeService.onLog(() => {
            if (NodeService.isWebsiteSource !== isWebSrc) setIsWebSrc(NodeService.isWebsiteSource);
        });
        return off;
    }, [isWebSrc]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            let handled = false;
            setStack(s => { if (s.length > 1) { handled = true; return s.slice(0, -1); } return s; });
            return handled;
        });
        return () => sub.remove();
    }, []);

    // 监听网站源的播放请求
    useEffect(() => {
        const unsub = NodeService.onPlay(({ url, title }) => {
            nav.push('Player', { qualities: [{ label: '源', url }], headers: {}, title: title || '' });
        });
        return unsub;
    }, [nav]);

    const cur = stack[stack.length - 1];
    const Screen = SCREENS[cur.name] || Boot;
    const canBack = stack.length > 1;
    const isPlayer = cur.name === 'Player';
    const showWebView = isWebSrc && !isPlayer;

    return (
        <NavContext.Provider value={nav}>
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
            </SafeAreaView>
            <NodeWebView visible={showWebView} />
        </NavContext.Provider>
    );
}

function titleOf(r: Route) {
    switch (r.name) {
        case 'Boot': return 'CatPlayer';
        case 'Sites': return '站点';
        case 'Category': return r.params?.site?.name || '分类';
        case 'Detail': return '详情';
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
