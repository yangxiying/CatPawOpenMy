import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import NodeService from '../../node/NodeService';
import { CatApi } from '../../api/CatApi';
import { useNav } from '../App';

export default function Boot() {
    const nav = useNav();
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const go = async () => {
        setErr(null);
        try {
            await NodeService.getBaseUrl();
            const config = await CatApi.getConfig();
            nav.replace('Sites', { config });
        } catch (e: any) {
            setErr(String(e?.message || e));
        }
    };

    useEffect(() => {
        const offLog = NodeService.onLog(m => setLogs(l => [...l.slice(-9), m]));
        const offErr = NodeService.onError(m => setErr(m));
        NodeService.init();
        // 等待 WebView polyfill 加载→bundle 启动→server 就绪，再调用 API
        const timeout = setTimeout(() => setErr('等待超时（60s）— WebView 未就绪'), 60000);
        NodeService.waitForReady().then(() => { clearTimeout(timeout); go(); }).catch(e => { clearTimeout(timeout); setErr(String(e)); });
        return () => { offLog(); offErr(); clearTimeout(timeout); };
    }, []);

    return (
        <View style={styles.c}>
            {!err && <ActivityIndicator size="large" color="#7aa2ff" />}
            <Text style={styles.t}>{err ? '加载失败' : '正在启动内嵌服务…'}</Text>
            <ScrollView style={styles.logbox} contentContainerStyle={{ padding: 10 }}>
                {logs.map((l, i) => <Text key={i} style={styles.log}>• {l}</Text>)}
                {err ? <Text style={styles.errtxt}>{err}</Text> : null}
            </ScrollView>
            <View style={styles.row}>
                <TouchableOpacity style={styles.btn} onPress={() => { NodeService.retry(); NodeService.waitForReady().then(go).catch(e => setErr(String(e))); }}>
                    <Text style={styles.btnt}>重试</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btn2]} onPress={() => { NodeService.refresh(); NodeService.waitForReady().then(go).catch(e => setErr(String(e))); }}>
                    <Text style={styles.btnt}>强制刷新源</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    c: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
    t: { color: '#cfd2dc', marginTop: 16, fontSize: 15 },
    logbox: { alignSelf: 'stretch', maxHeight: 220, marginTop: 18, backgroundColor: '#14141b', borderRadius: 8 },
    log: { color: '#8a8f9c', fontSize: 12, lineHeight: 18 },
    errtxt: { color: '#ff6b6b', fontSize: 12, marginTop: 8 },
    row: { flexDirection: 'row', marginTop: 18, gap: 12 },
    btn: { backgroundColor: '#2a2f45', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 8 },
    btn2: { backgroundColor: '#3a2f45' },
    btnt: { color: '#fff', fontSize: 15 },
});
