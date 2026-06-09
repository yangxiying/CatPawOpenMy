import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet, Clipboard } from 'react-native';
import NodeService from '../../node/NodeService';
import { CatApi } from '../../api/CatApi';
import { useNav } from '../App';

export default function Boot() {
    const nav = useNav();
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

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
        const timeout = setTimeout(() => setErr('等待超时（60s）— WebView 未就绪'), 60000);
        NodeService.waitForReady().then(() => {
            clearTimeout(timeout);
            if (NodeService.isWebsiteSource) {
                // 网站源：WebView 已显示全屏 UI，不需跳转到 Sites
                setLogs(l => [...l, '网站源已加载完成']);
            } else {
                go();
            }
        }).catch(e => { clearTimeout(timeout); setErr(String(e)); });
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
                <TouchableOpacity style={[styles.btn, styles.btn2]} onPress={() => { NodeService.forceRefresh(); NodeService.waitForReady().then(go).catch(e => setErr(String(e))); }}>
                    <Text style={styles.btnt}>强制重新下载</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.btn, styles.btn3]} onPress={async () => {
                    const text = logs.join('\n') + (err ? '\n' + err : '');
                    await Clipboard.setString(text);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                }}>
                    <Text style={styles.btnt}>{copied ? '已复制' : '复制日志'}</Text>
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
    btn3: { backgroundColor: '#2a4535' },
    btnt: { color: '#fff', fontSize: 15 },
});
