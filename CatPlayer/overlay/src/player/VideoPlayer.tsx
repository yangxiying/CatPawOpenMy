import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Quality } from '../api/CatApi';
import { StorageService } from '../storage/StorageService';

let Video: any = null;
try { Video = require('react-native-video').default; } catch (e) { /* not installed */ }

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

export default function VideoPlayer({ uri, headers, title, qualities, qi, onQuality, onBack, vodId, siteKey }: {
    uri: string;
    headers?: any;
    title?: string;
    qualities?: Quality[];
    qi?: number;
    onQuality?: (i: number) => void;
    onBack?: () => void;
    vodId?: string;
    siteKey?: string;
}) {
    const ref = useRef<any>(null);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [speed, setSpeed] = useState(1.0);
    const [showSpeed, setShowSpeed] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [resumePos, setResumePos] = useState<number | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** 加载上次播放进度，用于续播 */
    useEffect(() => {
        if (!vodId || !siteKey) return;
        (async () => {
            const history = await StorageService.listHistory();
            const item = history.find(h => h.id === vodId && h.siteKey === siteKey);
            if (item && item.lastPosition > 5 && item.lastDuration > 0) {
                setResumePos(item.lastPosition);
            }
        })();
    }, [vodId, siteKey]);

    /** 加载默认倍速设置 */
    useEffect(() => {
        (async () => {
            const s = await StorageService.getSetting('defaultSpeed');
            if (typeof s === 'number' && s >= 0.5 && s <= 3.0) setSpeed(s);
        })();
    }, []);

    /** 续播：视频加载后跳转到上次位置 */
    const handleLoad = useCallback((e: any) => {
        setLoading(false);
        const dur = e?.duration || e?.naturalSize?.duration || 0;
        if (dur > 0) setDuration(dur);
        if (resumePos && resumePos > 5 && ref.current) {
            ref.current.seek(resumePos);
            setResumePos(null);
        }
    }, [resumePos]);

    /** 定时保存播放进度到历史 */
    const handleProgress = useCallback((e: any) => {
        const pos = e?.currentTime || e?.currentPosition || 0;
        const dur = e?.seekableDuration || duration;
        setPosition(pos);
        if (dur > 0) setDuration(dur);
    }, [duration]);

    /** 退出时保存播放进度 */
    const handleBack = useCallback(() => {
        if (vodId && siteKey && position > 0 && duration > 0) {
            StorageService.addHistory({
                id: vodId,
                name: title || '',
                pic: '',
                remarks: '',
                siteKey,
                siteName: '',
                siteApi: '',
                lastEpisode: '',
                lastPosition: position,
                lastDuration: duration,
                updatedAt: Date.now(),
            });
        }
        onBack?.();
    }, [vodId, siteKey, position, duration, title, onBack]);

    /** 自动隐藏控制栏 */
    const resetHideTimer = useCallback(() => {
        setShowControls(true);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowControls(false), 5000);
    }, []);

    const [speedKey, setSpeedKey] = useState(0);

    /** 切换倍速 */
    const cycleSpeed = useCallback(() => {
        const idx = SPEED_OPTIONS.indexOf(speed);
        const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
        setSpeed(next);
        setSpeedKey(k => k + 1);
    }, [speed]);

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
        <TouchableOpacity activeOpacity={1} style={styles.root} onPress={resetHideTimer}>
            <Video
                key={speedKey}
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
                rate={speed}
                onLoadStart={() => { setLoading(true); setErr(null); }}
                onLoad={handleLoad}
                onProgress={handleProgress}
                onError={(e: any) => {
                    setLoading(false);
                    setErr(e?.error?.localizedDescription || e?.error?.errorString || JSON.stringify(e?.error || e));
                }}
            />

            {showControls && (
                <View style={styles.topbar}>
                    <TouchableOpacity onPress={handleBack} hitSlop={hit}><Text style={styles.tb}>‹ 返回</Text></TouchableOpacity>
                    <Text style={styles.title} numberOfLines={1}>{title}</Text>
                    <TouchableOpacity onPress={() => ref.current?.presentFullscreenPlayer()} hitSlop={hit}>
                        <Text style={styles.tb}>全屏</Text>
                    </TouchableOpacity>
                </View>
            )}

            {loading && !err && <ActivityIndicator style={styles.loading} size="large" color="#fff" />}

            {showControls && (
                <View style={styles.bottomBar}>
                    {qualities && qualities.length > 1 && (
                        <View style={styles.qbar}>
                            {qualities.map((q, i) => (
                                <TouchableOpacity key={i} onPress={() => onQuality && onQuality(i)} style={[styles.qchip, i === qi && styles.qOn]}>
                                    <Text style={styles.qt}>{q.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    <TouchableOpacity style={styles.speedBtn} onPress={cycleSpeed} onLongPress={() => setShowSpeed(!showSpeed)}>
                        <Text style={styles.speedText}>{speed}x</Text>
                    </TouchableOpacity>
                </View>
            )}

            {showSpeed && (
                <View style={styles.speedPanel}>
                    {SPEED_OPTIONS.map(s => (
                        <TouchableOpacity key={s} onPress={() => { setSpeed(s); setShowSpeed(false); }} style={[styles.speedOpt, s === speed && styles.speedOn]}>
                            <Text style={[styles.speedOptT, s === speed && styles.speedOptOnT]}>{s}x</Text>
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
        </TouchableOpacity>
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
    bottomBar: { position: 'absolute', bottom: 70, left: 14, right: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    qbar: { flexDirection: 'row', gap: 8, flex: 1 },
    qchip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#0009' },
    qOn: { backgroundColor: '#2a6cff' },
    qt: { color: '#fff', fontSize: 12 },
    speedBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: '#0009' },
    speedText: { color: '#7aa2ff', fontSize: 13, fontWeight: '600' },
    speedPanel: { position: 'absolute', bottom: 120, right: 14, backgroundColor: '#1a1a2eee', borderRadius: 12, padding: 8, minWidth: 80 },
    speedOpt: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
    speedOn: { backgroundColor: '#2a6cff44' },
    speedOptT: { color: '#aaa', fontSize: 14, textAlign: 'center' },
    speedOptOnT: { color: '#7aa2ff', fontWeight: '600' },
    errBox: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
    err: { color: '#ff6b6b', fontSize: 16, marginBottom: 8 },
    err2: { color: '#aaa', fontSize: 12, textAlign: 'center' },
    fallback: { flex: 1, backgroundColor: '#0b0b0f', alignItems: 'center', justifyContent: 'center', padding: 24 },
    fbTitle: { color: '#ff9f43', fontSize: 18, marginBottom: 16 },
    fbUrl: { color: '#888', fontSize: 12, textAlign: 'center', marginBottom: 20 },
    fbBtn: { backgroundColor: '#2a6cff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
    fbBtnT: { color: '#fff', fontSize: 15 },
});
