import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Quality } from '../api/CatApi';

// react-native-video 可选——未安装时降级为跳转播放
let Video: any = null;
try { Video = require('react-native-video').default; } catch (e) { /* not installed */ }

export default function VideoPlayer({ uri, headers, title, qualities, qi, onQuality, onBack }: {
    uri: string;
    headers?: any;
    title?: string;
    qualities?: Quality[];
    qi?: number;
    onQuality?: (i: number) => void;
    onBack?: () => void;
}) {
    const ref = useRef<any>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    if (!Video) {
        return (
            <View style={styles.fallback}>
                <Text style={styles.fbTitle}>react-native-video 未安装</Text>
                <Text style={styles.fbUrl} numberOfLines={3}>{uri}</Text>
                <TouchableOpacity style={styles.fbBtn} onPress={() => Linking.openURL(uri)}>
                    <Text style={styles.fbBtnT}>在 Safari 中打开</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.fbBtn, { marginTop: 12, backgroundColor: '#333' }]} onPress={onBack}>
                    <Text style={styles.fbBtnT}>返回</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.root}>
            <Video
                ref={ref}
                source={{ uri, headers: headers || {} }}
                style={styles.video}
                controls
                resizeMode="contain"
                fullscreenOrientation="landscape"
                fullscreenAutorotate
                playInBackground
                playWhenInactive
                ignoreSilentSwitch="ignore"
                onLoadStart={() => { setLoading(true); setErr(null); }}
                onLoad={() => setLoading(false)}
                onError={(e: any) => {
                    setLoading(false);
                    setErr(e?.error?.localizedDescription || e?.error?.errorString || JSON.stringify(e?.error || e));
                }}
            />

            <View style={styles.topbar}>
                <TouchableOpacity onPress={onBack} hitSlop={hit}><Text style={styles.tb}>‹ 返回</Text></TouchableOpacity>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                <TouchableOpacity onPress={() => ref.current?.presentFullscreenPlayer()} hitSlop={hit}>
                    <Text style={styles.tb}>全屏</Text>
                </TouchableOpacity>
            </View>

            {loading && !err && <ActivityIndicator style={styles.loading} size="large" color="#fff" />}

            {qualities && qualities.length > 1 && (
                <View style={styles.qbar}>
                    {qualities.map((q, i) => (
                        <TouchableOpacity key={i} onPress={() => onQuality && onQuality(i)} style={[styles.qchip, i === qi && styles.qOn]}>
                            <Text style={styles.qt}>{q.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {!!err && (
                <View style={styles.errBox}>
                    <Text style={styles.err}>播放失败</Text>
                    <Text style={styles.err2}>{err}</Text>
                </View>
            )}
        </View>
    );
}

const hit = { top: 12, bottom: 12, left: 12, right: 12 };

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    video: { ...StyleSheet.absoluteFillObject },
    topbar: { position: 'absolute', top: 0, left: 0, right: 0, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#0006' },
    tb: { color: '#fff', fontSize: 16 },
    title: { color: '#fff', fontSize: 14, flex: 1, textAlign: 'center', marginHorizontal: 8 },
    loading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    qbar: { position: 'absolute', bottom: 70, right: 14, flexDirection: 'row', gap: 8 },
    qchip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#0009' },
    qOn: { backgroundColor: '#2a6cff' },
    qt: { color: '#fff', fontSize: 12 },
    errBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
    err: { color: '#ff6b6b', fontSize: 16, marginBottom: 8 },
    err2: { color: '#aaa', fontSize: 12, textAlign: 'center' },
    fallback: { flex: 1, backgroundColor: '#0b0b0f', alignItems: 'center', justifyContent: 'center', padding: 24 },
    fbTitle: { color: '#ff9f43', fontSize: 18, marginBottom: 16 },
    fbUrl: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 20 },
    fbBtn: { backgroundColor: '#2a6cff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    fbBtnT: { color: '#fff', fontSize: 15 },
});
