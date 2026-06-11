import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, ScrollView, StyleSheet, Clipboard } from 'react-native';
import NodeService from '../../node/NodeService';
import { CatApi } from '../../api/CatApi';
import { useNav } from '../App';

export default function Boot() {
    const nav = useNav();
    const [logs, setLogs] = useState<string[]>([]);
    const [err, setErr] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [showGo, setShowGo] = useState<{config: CatConfig|null}|null>(null);
    const [loading, setLoading] = useState(false);
    const configRef = useRef<CatConfig|null>(null);

    const go = async () => {
        if (NodeService.isWebsiteSource) return;
        setErr(null);
        setLoading(true);
        try {
            await NodeService.getBaseUrl();
            const config = await CatApi.getConfig();
            const siteCount = config?.video?.sites?.length ?? 0;
            const allKeys = config ? Object.keys(config) : [];
            console.log('[Boot] config keys:', allKeys, 'video.sites:', siteCount);
            setLogs(l => [...l, `config keys=[${allKeys}] video.sites=${siteCount}`]);
            configRef.current = config;
            setShowGo({config});
        } catch (e: any) {
            setLogs(l => [...l, `getConfig error: ${String(e?.message || e)}`]);
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const offLog = NodeService.onLog(m => {
            setLogs(l => [...l.slice(-9), m]);
        });
        const offErr = NodeService.onError(m => setErr(m));
        const timeout = setTimeout(() => {
            setErr('等待超时（60s）— WebView 未就绪');
        }, 60000);
        NodeService.waitForReady().then(() => {
            clearTimeout(timeout);
            // 显示「进入」按钮，不自动跳转，用户点按钮才执行 go() + 跳转
            setLogs(l => [...l, '服务已就绪，点击「进入」继续']);
            setShowGo({config: null});
        }).catch(e => { clearTimeout(timeout); setErr(String(e)); });
        return () => { offLog(); offErr(); clearTimeout(timeout); };
    }, []);

    return (
        <View style={styles.c}>
            {!err && !showGo && <ActivityIndicator size="large" color="#7aa2ff" />}
            <Text style={styles.t}>{showGo ? '加载完成' : err ? '加载失败' : '正在启动内嵌服务…'}</Text>
            <ScrollView style={styles.logbox} contentContainerStyle={{ padding: 10 }}>
                {logs.map((l, i) => <Text key={i} style={styles.log}>• {l}</Text>)}
                {err ? <Text style={styles.errtxt}>{err}</Text> : null}
            </ScrollView>
            <View style={styles.row}>
                {showGo && !loading && (
                    <TouchableOpacity style={[styles.btn, styles.goBtn]} onPress={async () => {
                        if (NodeService.isWebsiteSource) {
                            nav.replace('Sites', { config: null });
                            return;
                        }
                        setLogs(l => [...l, '正在加载配置…']);
                        try {
                            await go();
                            nav.replace('Sites', { config: configRef.current });
                        } catch (e) {
                            setLogs(l => [...l, `加载失败: ${String(e)}`]);
                            setErr(String(e));
                        }
                    }}>
                        <Text style={styles.btnt}>进入</Text>
                    </TouchableOpacity>
                )}
                {loading && <ActivityIndicator size="small" color="#7aa2ff" style={{marginHorizontal:12}} />}
                <TouchableOpacity style={styles.btn} onPress={() => { NodeService.retry(); setShowGo(null); NodeService.waitForReady().then(go).catch(e => setErr(String(e))); }}>
                    <Text style={styles.btnt}>重试</Text>
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
    goBtn: { backgroundColor: '#7aa2ff' },
    btn3: { backgroundColor: '#2a4535' },
    btnt: { color: '#fff', fontSize: 15 },
});
