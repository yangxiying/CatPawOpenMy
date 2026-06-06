import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Video from 'react-native-video';
import { Quality } from '../api/CatApi';

/**
 * 需求①全屏自动横屏：fullscreenOrientation="landscape" + 自定义「全屏」按钮调
 *   presentFullscreenPlayer()，原生 AVPlayerViewController 进全屏即旋转横屏。
 * 需求②后台/息屏续播声音：playInBackground + playWhenInactive，
 *   配合 Info.plist UIBackgroundModes=audio 与 AVAudioSession=playback（AppDelegate）。
 */
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
});
