/**
 * 设置页面：播放源配置、播放器偏好、关于信息。
 * 所有设置通过 StorageService 持久化，播放源变更后调用 NodeService.forceRefresh() 重新加载。
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet, ScrollView } from 'react-native';
import { StorageService } from '../../storage/StorageService';
import NodeService from '../../node/NodeService';
import { SOURCE } from '../../config';

/** 播放器类型 */
type PlayerType = 'builtin' | 'mpv' | 'mdk';

/** 播放器类型选项定义 */
const PLAYER_OPTIONS: { key: PlayerType; label: string }[] = [
    { key: 'builtin', label: '内置播放器' },
    { key: 'mpv', label: 'MPV' },
    { key: 'mdk', label: 'MDK' },
];

/** 默认倍速选项 */
const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

export default function Settings() {
    const [sourceUrl, setSourceUrl] = useState('');
    const [sourceAuth, setSourceAuth] = useState('');
    const [playerType, setPlayerType] = useState<PlayerType>('builtin');
    const [defaultSpeed, setDefaultSpeed] = useState(1.0);
    const [saving, setSaving] = useState(false);

    /** 从 StorageService 加载已保存的设置，若无则使用默认值 */
    const loadSettings = useCallback(async () => {
        const url = await StorageService.getSetting('sourceUrl');
        const auth = await StorageService.getSetting('sourceAuth');
        const pt = await StorageService.getSetting('playerType');
        const sp = await StorageService.getSetting('defaultSpeed');
        setSourceUrl(url || SOURCE.base);
        setSourceAuth(auth || SOURCE.auth);
        setPlayerType(pt || 'builtin');
        setDefaultSpeed(sp ?? 1.0);
    }, []);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    /** 保存播放源设置并触发 NodeService 强制刷新 */
    const handleSaveAndReload = useCallback(async () => {
        if (!sourceUrl.trim()) {
            Alert.alert('提示', '播放源地址不能为空');
            return;
        }
        setSaving(true);
        try {
            await StorageService.setSetting('sourceUrl', sourceUrl.trim());
            await StorageService.setSetting('sourceAuth', sourceAuth.trim());
            await NodeService.forceRefresh();
            Alert.alert('成功', '播放源已保存并重新加载');
        } catch (e: any) {
            Alert.alert('错误', String(e?.message || e));
        } finally {
            setSaving(false);
        }
    }, [sourceUrl, sourceAuth]);

    /** 切换播放器类型并立即持久化 */
    const handlePlayerTypeChange = useCallback(async (type: PlayerType) => {
        setPlayerType(type);
        await StorageService.setSetting('playerType', type);
    }, []);

    /** 切换默认倍速并立即持久化 */
    const handleSpeedChange = useCallback(async (speed: number) => {
        setDefaultSpeed(speed);
        await StorageService.setSetting('defaultSpeed', speed);
    }, []);

    /** 渲染水平选项芯片组 */
    const renderChips = <T extends string | number>(options: T[], current: T, onSelect: (v: T) => void, formatLabel: (v: T) => string) => (
        <View style={styles.chipRow}>
            {options.map(opt => {
                const active = opt === current;
                return (
                    <TouchableOpacity key={String(opt)} style={[styles.chip, active && styles.chipActive]} onPress={() => onSelect(opt)}>
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{formatLabel(opt)}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
            {/* 播放源设置 */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>播放源设置</Text>
                <Text style={styles.label}>Source URL</Text>
                <TextInput style={styles.input} value={sourceUrl} onChangeText={setSourceUrl} placeholder="输入播放源地址" placeholderTextColor="#5b6072" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
                <Text style={styles.label}>Source Auth</Text>
                <TextInput style={styles.input} value={sourceAuth} onChangeText={setSourceAuth} placeholder="输入认证密钥" placeholderTextColor="#5b6072" autoCapitalize="none" autoCorrect={false} secureTextEntry />
                <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSaveAndReload} disabled={saving}>
                    <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存并重新加载'}</Text>
                </TouchableOpacity>
            </View>

            {/* 播放器设置 */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>播放器设置</Text>
                <Text style={styles.label}>播放器类型</Text>
                {renderChips(PLAYER_OPTIONS.map(o => o.key), playerType, handlePlayerTypeChange, k => PLAYER_OPTIONS.find(o => o.key === k)?.label || k)}
                <Text style={styles.label}>默认倍速</Text>
                {renderChips(SPEED_OPTIONS, defaultSpeed, handleSpeedChange, v => `${v}x`)}
            </View>

            {/* 关于 */}
            <View style={styles.card}>
                <Text style={styles.sectionTitle}>关于</Text>
                <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>应用版本</Text>
                    <Text style={styles.aboutValue}>CatPlayer 1.0.0</Text>
                </View>
                <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>当前源地址</Text>
                    <Text style={styles.aboutValue} numberOfLines={1}>{sourceUrl || '未配置'}</Text>
                </View>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { flex: 1, backgroundColor: '#0b0b0f' },
    container: { paddingVertical: 8 },
    card: { backgroundColor: '#1a1a2e', borderRadius: 12, margin: 12, padding: 16 },
    sectionTitle: { color: '#cfd2dc', fontSize: 17, fontWeight: '600', marginBottom: 14 },
    label: { color: '#8a8f9c', fontSize: 13, marginTop: 10, marginBottom: 6 },
    input: { backgroundColor: '#23232b', color: '#fff', borderRadius: 8, padding: 10, fontSize: 15 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { backgroundColor: '#23232b', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, marginRight: 0 },
    chipActive: { backgroundColor: '#7aa2ff' },
    chipText: { color: '#cfd2dc', fontSize: 13 },
    chipTextActive: { color: '#0b0b0f', fontWeight: '600' },
    saveBtn: { backgroundColor: '#7aa2ff', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 18 },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { color: '#0b0b0f', fontSize: 15, fontWeight: '600' },
    aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#23232b' },
    aboutLabel: { color: '#8a8f9c', fontSize: 14 },
    aboutValue: { color: '#cfd2dc', fontSize: 14, flex: 1, textAlign: 'right', marginLeft: 12 },
});
