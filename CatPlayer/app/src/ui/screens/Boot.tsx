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
    const [ready, setReady] = useState(false);
    const [parsing, setParsing] = useState(false);
    const [parsed, setParsed] = useState(false);
    const configRef = useRef<CatConfig|null>(null);

    const parseSites = async () => {
        setErr(null);
        setParsing(true);
        try {
            await NodeService.getBaseUrl();
            const config = await CatApi.getConfig();
            const allKeys = config ? Object.keys(config) : [];
            setLogs(l => [...l, `config keys=[${allKeys}]`]);
            const categories = ['video', 'read', 'comic', 'music', 'pan'];
            for (const cat of categories) {
                const sites = (config as any)?.[cat]?.sites || [];
                if (sites.length > 0) {
                    setLogs(l => [...l, `【${cat}】${sites.length} 个站点:`]);
                    sites.forEach((site: any, idx: number) => {
                        const name = site.name || '未命名';
                        const key = site.key || '';
                        const api = site.api || '';
                        setLogs(l => [...l, `  ${idx + 1}. ${name} (${key})`]);
                        if (api) setLogs(l => [...l, `     API: ${api}`]);
                    });
                }
            }
            configRef.current = config;
            setParsed(true);
            setLogs(l => [...l, '解析完成，点击「进入」继续']);
        } catch (e: any) {
            setLogs(l => [...l, `解析失败: ${String(e?.message || e)}`]);
            setErr(String(e?.message || e));
        } finally {
            setParsing(false);
        }
    };

    useEffect(() => {
        const offLog = NodeService.onLog(m => {
            setLogs(l => [...l.slice(-19), m]);
        });
        const offErr = NodeService.onError(m => setErr(m));
        const timeout = setTimeout(() => {
            setErr('等待超时（60s）— WebView 未就绪');
        }, 60000);
        NodeService.waitForReady().then(() => {
            clearTimeout(timeout);
            setLogs(l => [...l, '服务已就绪，请点击「解析」或「进入」']);
            setReady(true);
        }).catch(e => { clearTimeout(timeout); setErr(String(e)); });
        return () => { offLog(); offErr(); clearTimeout(timeout); };
    }, []);

    return (
        <View style={styles.c}>
            {!err && !ready && <ActivityIndicator size="large" color="#7aa2ff" />}
            <Text style={styles.t}>{ready ? (parsed ? '解析完成' : '服务已就绪') : err ? '加载失败' : '正在启动内嵌服务…'}</Text>
            <ScrollView style={styles.logbox} contentContainerStyle={{ padding: 10 }}>
                {logs.map((l, i) => <Text key={i} style={styles.log}>• {l}</Text>)}
                {err ? <Text style={styles.errtxt}>{err}</Text> : null}
            </ScrollView>
            <View style={styles.row}>
                {ready && !parsed && !parsing && (
                    <TouchableOpacity style={[styles.btn, styles.parseBtn]} onPress={parseSites}>
                        <Text style={styles.btnt}>解析</Text>
                    </TouchableOpacity>
                )}
                {parsing && <ActivityIndicator size="small" color="#7aa2ff" style={{marginHorizontal:12}} />}
                {parsed && !NodeService.isWebsiteSource && (
                    <TouchableOpacity style={[styles.btn, styles.goBtn]} onPress={() => {
                        nav.replace('Sites', { config: configRef.current });
                    }}>
                        <Text style={styles.btnt}>进入</Text>
                    </TouchableOpacity>
                )}
                {NodeService.isWebsiteSource && ready && (
                    <TouchableOpacity style={[styles.btn, styles.goBtn]} onPress={() => {
                        nav.replace('Sites', { config: null });
                    }}>
                        <Text style={styles.btnt}>进入</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.btn} onPress={() => { NodeService.retry(); setReady(false); setParsed(false); setLogs([]); NodeService.waitForReady().then(() => setReady(true)).catch(e => setErr(String(e))); }}>
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
    parseBtn: { backgroundColor: '#4a9eff' },
    goBtn: { backgroundColor: '#7aa2ff' },
    btn3: { backgroundColor: '#2a4535' },
    btnt: { color: '#fff', fontSize: 15 },
});
