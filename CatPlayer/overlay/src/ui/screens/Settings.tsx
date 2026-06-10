import React, { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, Alert,
    StyleSheet, ScrollView, Switch, Modal, Platform,
} from 'react-native';
import { StorageService } from '../../storage/StorageService';
import type { SourceItem } from '../../storage/StorageService';
import NodeService from '../../node/NodeService';

type PlayerType = 'builtin' | 'mpv' | 'mdk';

const PLAYER_OPTIONS: { key: PlayerType; label: string }[] = [
    { key: 'builtin', label: '内置播放器' },
    { key: 'mpv', label: 'MPV' },
    { key: 'mdk', label: 'MDK' },
];

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

/** 暗色模式枚举 */
type DarkModeType = 'system' | 'on' | 'off';
const DARK_MODE_OPTIONS: { key: DarkModeType; label: string }[] = [
    { key: 'system', label: '跟随系统' },
    { key: 'on', label: '开启' },
    { key: 'off', label: '关闭' },
];

/** 预定义色彩主题 */
type ColorThemeKey = 'green' | 'blue' | 'purple' | 'pink' | 'orange' | 'red';
interface ColorThemeOption {
    key: ColorThemeKey;
    label: string;
    color: string;
}
const COLOR_THEME_OPTIONS: ColorThemeOption[] = [
    { key: 'green', label: '翠绿', color: '#4CAF50' },
    { key: 'blue', label: '海蓝', color: '#2196F3' },
    { key: 'purple', label: '紫罗兰', color: '#9C27B0' },
    { key: 'pink', label: '粉红', color: '#E91E63' },
    { key: 'orange', label: '橙色', color: '#FF9800' },
    { key: 'red', label: '赤红', color: '#F44336' },
];

export default function Settings() {
    const [sources, setSources] = useState<SourceItem[]>([]);
    const [playerType, setPlayerType] = useState<PlayerType>('builtin');
    const [defaultSpeed, setDefaultSpeed] = useState(1.0);
    const [darkMode, setDarkMode] = useState<DarkModeType>('system');
    const [colorTheme, setColorTheme] = useState<ColorThemeKey>('green');
    const [autoClearCache, setAutoClearCache] = useState(false);
    const [debugMode, setDebugMode] = useState(false);
    const [saving, setSaving] = useState(false);

    /** 弹窗状态 */
    const [showPlayerModal, setShowPlayerModal] = useState(false);
    const [showDarkModeModal, setShowDarkModeModal] = useState(false);
    const [showColorModal, setShowColorModal] = useState(false);
    const [showSourceModal, setShowSourceModal] = useState(false);
    const [editingSource, setEditingSource] = useState<SourceItem | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [sourceUrl, setSourceUrl] = useState('');

    /** 从 StorageService 加载所有设置 */
    const loadSettings = useCallback(async () => {
        const srcs = await StorageService.listSources();
        setSources(srcs);
        const pt = await StorageService.getSetting('playerType');
        const sp = await StorageService.getSetting('defaultSpeed');
        const dm = await StorageService.getSetting('darkMode');
        const ct = await StorageService.getSetting('colorTheme');
        const acc = await StorageService.getSetting('autoClearCache');
        const dbg = await StorageService.getSetting('debugMode');

        setPlayerType(pt || 'builtin');
        setDefaultSpeed(sp ?? 1.0);
        setDarkMode(dm || 'system');
        setColorTheme(ct || 'green');
        setAutoClearCache(acc ?? false);
        setDebugMode(dbg ?? false);
    }, []);

    useEffect(() => { loadSettings(); }, [loadSettings]);

    /** 截断显示 URL（保留协议+域名） */
    const truncateUrl = (url: string) => {
        if (!url || url.length <= 40) return url || '未配置';
        try {
            const u = new URL(url);
            return u.origin + u.pathname.slice(0, 20) + '…';
        } catch {
            return url.slice(0, 40) + '…';
        }
    };

    /** 获取当前激活源名称 */
    const getActiveSourceLabel = () => {
        const active = sources.find(s => s.isActive);
        return active ? truncateUrl(active.url) : '未配置';
    };

    /** 切换激活源 */
    const handleSelectSource = useCallback(async (id: string) => {
        await StorageService.setActiveSource(id);
        await loadSettings();
        await NodeService.forceRefresh();
        Alert.alert('已切换', '源已切换，重新加载中…');
    }, [loadSettings]);

    /** 删除源 */
    const handleDeleteSource = useCallback(async (id: string) => {
        if (sources.length <= 1) {
            Alert.alert('提示', '至少保留一个源');
            return;
        }
        Alert.alert('确认删除', '删除此源？', [
            { text: '取消', style: 'cancel' },
            { text: '删除', style: 'destructive', onPress: async () => {
                await StorageService.removeSource(id);
                await loadSettings();
                await NodeService.forceRefresh();
            }},
        ]);
    }, [sources.length, loadSettings]);

    /** 打开添加/编辑弹窗 */
    const openSourceModal = (source?: SourceItem) => {
        setEditingSource(source || null);
        setSourceName(source?.name || '');
        setSourceUrl(source?.url || '');
        setShowSourceModal(true);
    };

    /** 保存源（添加或更新） */
    const handleSaveSource = useCallback(async () => {
        if (!sourceUrl.trim()) {
            Alert.alert('提示', 'URL 不能为空');
            return;
        }
        setSaving(true);
        try {
            if (editingSource) {
                await StorageService.updateSource(editingSource.id, {
                    name: sourceName.trim() || '未命名',
                    url: sourceUrl.trim(),
                });
            } else {
                await StorageService.addSource({
                    name: sourceName.trim() || '未命名',
                    url: sourceUrl.trim(),
                });
            }
            setShowSourceModal(false);
            await loadSettings();
            Alert.alert('成功', editingSource ? '源已更新' : '源已添加');
        } catch (e: any) {
            Alert.alert('错误', String(e?.message || e));
        } finally {
            setSaving(false);
        }
    }, [editingSource, sourceName, sourceUrl, loadSettings]);

    /** 获取当前播放器类型标签 */
    const getPlayerLabel = () => PLAYER_OPTIONS.find(o => o.key === playerType)?.label || playerType;
    /** 获取当前暗色模式标签 */
    const getDarkModeLabel = () => DARK_MODE_OPTIONS.find(o => o.key === darkMode)?.label || darkMode;
    /** 获取当前色彩主题对象 */
    const getCurrentColorTheme = () => COLOR_THEME_OPTIONS.find(o => o.key === colorTheme) || COLOR_THEME_OPTIONS[0];

    /** 切换播放器类型 */
    const handlePlayerTypeChange = useCallback(async (type: PlayerType) => {
        setPlayerType(type);
        await StorageService.setSetting('playerType', type);
    }, []);

    /** 切换默认倍速 */
    const handleSpeedChange = useCallback(async (speed: number) => {
        setDefaultSpeed(speed);
        await StorageService.setSetting('defaultSpeed', speed);
    }, []);

    /** 循环切换暗色模式 */
    const cycleDarkMode = useCallback(async () => {
        const order: DarkModeType[] = ['system', 'on', 'off'];
        const idx = order.indexOf(darkMode);
        const next = order[(idx + 1) % order.length];
        setDarkMode(next);
        await StorageService.setSetting('darkMode', next);
    }, [darkMode]);

    /** 选择暗色模式（弹窗内） */
    const selectDarkMode = useCallback(async (mode: DarkModeType) => {
        setDarkMode(mode);
        await StorageService.setSetting('darkMode', mode);
        setShowDarkModeModal(false);
    }, []);

    /** 选择色彩主题 */
    const selectColorTheme = useCallback(async (key: ColorThemeKey) => {
        setColorTheme(key);
        await StorageService.setSetting('colorTheme', key);
        setShowColorModal(false);
    }, []);

    /** 切换自动清缓存开关 */
    const toggleAutoClearCache = useCallback(async (value: boolean) => {
        setAutoClearCache(value);
        await StorageService.setSetting('autoClearCache', value);
    }, []);

    /** 切换调试模式开关 */
    const toggleDebugMode = useCallback(async (value: boolean) => {
        setDebugMode(value);
        await StorageService.setSetting('debugMode', value);
    }, []);

    /** 清空缓存操作 */
    const handleClearCache = useCallback(() => {
        Alert.alert(
            '确认清空缓存',
            '将清除所有本地缓存数据，包括已下载的源文件。此操作不可撤销。',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确认',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await NodeService.forceRefresh();
                            Alert.alert('完成', '缓存已清空');
                        } catch (e: any) {
                            Alert.alert('错误', String(e?.message || e));
                        }
                    },
                },
            ],
        );
    }, []);

    /** 渲染水平选项芯片组 */
    const renderChips = <T extends string | number>(
        options: T[], current: T, onSelect: (v: T) => void, formatLabel: (v: T) => string,
    ) => (
        <View style={modalStyles.chipRow}>
            {options.map(opt => {
                const active = opt === current;
                return (
                    <TouchableOpacity
                        key={String(opt)}
                        style={[modalStyles.chip, active && modalStyles.chipActive]}
                        onPress={() => onSelect(opt)}
                        activeOpacity={0.7}
                    >
                        <Text style={[modalStyles.chipText, active && modalStyles.chipTextActive]}>
                            {formatLabel(opt)}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    /** 渲染设置行组件（带图标、标签、值、箭头） */
    const renderSettingRow = (
        icon: string, label: string, value: string | React.ReactNode, onPress?: () => void,
    ) => (
        <TouchableOpacity
            style={styles.settingRow}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={onPress ? 0.6 : 1}
        >
            <View style={styles.rowLeft}>
                <Text style={styles.rowIcon}>{icon}</Text>
                <Text style={styles.rowLabel}>{label}</Text>
            </View>
            <View style={styles.rowRight}>
                {typeof value === 'string' ? (
                    <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
                ) : (
                    value
                )}
                {onPress && <Text style={styles.chevron}>›</Text>}
            </View>
        </TouchableOpacity>
    );

    /** 渲染分割线 */
    const renderDivider = () => <View style={styles.divider} />;

    const themeColor = getCurrentColorTheme().color;

    return (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
            {/* ── 播放源列表 ── */}
            <View style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>播放源</Text>
                    <TouchableOpacity onPress={() => openSourceModal()} style={styles.addBtn}>
                        <Text style={styles.addBtnT}>+ 添加</Text>
                    </TouchableOpacity>
                </View>
                {sources.map(s => (
                    <View key={s.id}>
                        <TouchableOpacity
                            style={[styles.sourceRow, s.isActive && styles.sourceRowActive]}
                            onPress={() => handleSelectSource(s.id)}
                            activeOpacity={0.6}
                        >
                            <View style={styles.sourceInfo}>
                                <Text style={[styles.sourceName, s.isActive && styles.sourceNameActive]} numberOfLines={1}>{s.name}</Text>
                                <Text style={styles.sourceUrl} numberOfLines={1}>{truncateUrl(s.url)}</Text>
                            </View>
                            <View style={styles.sourceActions}>
                                {s.isActive && <Text style={styles.activeCheck}>✓</Text>}
                                <TouchableOpacity onPress={() => openSourceModal(s)} hitSlop={8}>
                                    <Text style={styles.sourceEdit}>编辑</Text>
                                </TouchableOpacity>
                                {sources.length > 1 && (
                                    <TouchableOpacity onPress={() => handleDeleteSource(s.id)} hitSlop={8}>
                                        <Text style={styles.sourceDel}>删除</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </TouchableOpacity>
                        <View style={styles.divider} />
                    </View>
                ))}
            </View>

            {/* ── 其他设置 ── */}
            <View style={styles.section}>
                {renderSettingRow(
                    '🎬', '播放器', getPlayerLabel(),
                    () => setShowPlayerModal(true),
                )}
                {renderDivider()}
                {renderSettingRow(
                    '🌙', '暗色模式', getDarkModeLabel(),
                    cycleDarkMode,
                )}
                {renderDivider()}
                {renderSettingRow(
                    '🎨', '色彩',
                    <View style={styles.colorIndicatorWrap}>
                        <View style={[styles.colorIndicator, { backgroundColor: themeColor }]} />
                        <Text style={styles.rowValue}>{getCurrentColorTheme().label}</Text>
                    </View>,
                    () => setShowColorModal(true),
                )}
            </View>

            {/* ── 功能开关区域 ── */}
            <View style={styles.section}>
                <View style={styles.settingRow}>
                    <View style={styles.rowLeft}>
                        <Text style={styles.rowIcon}>🗑️</Text>
                        <Text style={styles.rowLabel}>自动清缓存</Text>
                    </View>
                    <Switch
                        value={autoClearCache}
                        onValueChange={toggleAutoClearCache}
                        trackColor={{ false: '#dcdcdc', true: themeColor }}
                        thumbColor={autoClearCache ? '#fff' : '#fff'}
                    />
                </View>
                {renderDivider()}
                <View style={styles.settingRow}>
                    <View style={styles.rowLeft}>
                        <Text style={styles.rowIcon}>🐛</Text>
                        <Text style={styles.rowLabel}>调试模式</Text>
                    </View>
                    <Switch
                        value={debugMode}
                        onValueChange={toggleDebugMode}
                        trackColor={{ false: '#dcdcdc', true: themeColor }}
                        thumbColor={debugMode ? '#fff' : '#fff'}
                    />
                </View>
            </View>

            {/* ── 清空缓存按钮 ── */}
            <View style={styles.clearCacheSection}>
                <TouchableOpacity style={styles.clearCacheBtn} onPress={handleClearCache} activeOpacity={0.7}>
                    <Text style={styles.clearCacheBtnText}>清空缓存</Text>
                </TouchableOpacity>
            </View>

            {/* ═══════ 弹窗：添加/编辑播放源 ═══════ */}
            <Modal visible={showSourceModal} animationType="slide" transparent onRequestClose={() => setShowSourceModal(false)}>
                <View style={modalStyles.overlay}>
                    <View style={modalStyles.panel}>
                        <View style={modalStyles.header}>
                            <Text style={modalStyles.headerTitle}>{editingSource ? '编辑源' : '添加源'}</Text>
                            <TouchableOpacity onPress={() => setShowSourceModal(false)} hitSlop={8}>
                                <Text style={modalStyles.closeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={modalStyles.body} keyboardShouldPersistTiles="handled">
                            <Text style={modalStyles.fieldLabel}>名称</Text>
                            <TextInput
                                style={modalStyles.input}
                                value={sourceName}
                                onChangeText={setSourceName}
                                placeholder="我的源"
                                placeholderTextColor="#999"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />

                            <Text style={modalStyles.fieldLabel}>源地址</Text>
                            <TextInput
                                style={modalStyles.input}
                                value={sourceUrl}
                                onChangeText={setSourceUrl}
                                placeholder="http://user:pass@host/path/index.js.md5"
                                placeholderTextColor="#999"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                            <Text style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
                                支持 http://user:pass@host/path 格式
                            </Text>
                        </ScrollView>

                        <View style={modalStyles.footer}>
                            <TouchableOpacity
                                style={[modalStyles.saveBtn, saving && modalStyles.saveBtnDisabled]}
                                onPress={handleSaveSource}
                                disabled={saving}
                                activeOpacity={0.7}
                            >
                                <Text style={modalStyles.saveBtnText}>
                                    {saving ? '保存中…' : '保存'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* ═══════ 弹窗：播放器设置（类型 + 倍速）═══════ */}
            <Modal visible={showPlayerModal} animationType="slide" transparent onRequestClose={() => setShowPlayerModal(false)}>
                <View style={modalStyles.overlay}>
                    <View style={modalStyles.panel}>
                        <View style={modalStyles.header}>
                            <Text style={modalStyles.headerTitle}>播放器设置</Text>
                            <TouchableOpacity onPress={() => setShowPlayerModal(false)} hitSlop={8}>
                                <Text style={modalStyles.closeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={modalStyles.body}>
                            <Text style={modalStyles.fieldLabel}>播放器类型</Text>
                            {renderChips(
                                PLAYER_OPTIONS.map(o => o.key), playerType, handlePlayerTypeChange,
                                k => PLAYER_OPTIONS.find(o => o.key === k)?.label || k,
                            )}

                            <Text style={[modalStyles.fieldLabel, { marginTop: 20 }]}>默认倍速</Text>
                            {renderChips(SPEED_OPTIONS, defaultSpeed, handleSpeedChange, v => `${v}x`)}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ═══════ 弹窗：暗色模式选择 ═══════ */}
            <Modal visible={showDarkModeModal} animationType="fade" transparent onRequestClose={() => setShowDarkModeModal(false)}>
                <View style={modalStyles.overlayCentered}>
                    <View style={modalStyles.pickerPanel}>
                        <Text style={modalStyles.pickerTitle}>选择暗色模式</Text>
                        {DARK_MODE_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.key}
                                style={[
                                    modalStyles.pickerItem,
                                    darkMode === opt.key && modalStyles.pickerItemActive,
                                    { borderLeftColor: themeColor },
                                ]}
                                onPress={() => selectDarkMode(opt.key)}
                                activeOpacity={0.7}
                            >
                                <Text style={[
                                    modalStyles.pickerItemText,
                                    darkMode === opt.key && { color: themeColor, fontWeight: '700' as any },
                                ]}>
                                    {opt.label}
                                </Text>
                                {darkMode === opt.key && (
                                    <Text style={[modalStyles.checkMark, { color: themeColor }]}>✓</Text>
                                )}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={modalStyles.pickerCancel}
                            onPress={() => setShowDarkModeModal(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={modalStyles.pickerCancelText}>取消</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ═══════ 弹窗：色彩主题选择 ═══════ */}
            <Modal visible={showColorModal} animationType="fade" transparent onRequestClose={() => setShowColorModal(false)}>
                <View style={modalStyles.overlayCentered}>
                    <View style={modalStyles.pickerPanel}>
                        <Text style={modalStyles.pickerTitle}>选择主题色彩</Text>
                        <View style={modalStyles.colorGrid}>
                            {COLOR_THEME_OPTIONS.map(opt => (
                                <TouchableOpacity
                                    key={opt.key}
                                    style={[
                                        modalStyles.colorCircleWrap,
                                        colorTheme === opt.key && { borderColor: opt.color },
                                    ]}
                                    onPress={() => selectColorTheme(opt.key)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[modalStyles.colorCircle, { backgroundColor: opt.color }]} />
                                    {colorTheme === opt.key && (
                                        <View style={[modalStyles.colorCheckBadge, { backgroundColor: opt.color }]}>
                                            <Text style={modalStyles.colorCheckIcon}>✓</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </View>
                        <View style={modalStyles.selectedColorLabel}>
                            <View style={[modalStyles.selectedDot, { backgroundColor: themeColor }]} />
                            <Text style={modalStyles.selectedColorName}>{getCurrentColorTheme().label}</Text>
                        </View>
                        <TouchableOpacity
                            style={modalStyles.pickerCancel}
                            onPress={() => setShowColorModal(false)}
                            activeOpacity={0.7}
                        >
                            <Text style={modalStyles.pickerCancelText}>取消</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

/* ═════════ 主页面样式 ═════════ */
const styles = StyleSheet.create({
    scroll: { flex: 1, backgroundColor: '#f5f5f0' },
    container: { paddingVertical: 16 },

    section: {
        marginHorizontal: 16,
        marginBottom: 20,
        borderRadius: 14,
        backgroundColor: '#ffffff',
        overflow: 'hidden',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 2 } }),
    },

    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },
    sectionTitle: { fontSize: 14, fontWeight: '600', color: '#666' },
    addBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#4CAF50' },
    addBtnT: { color: '#fff', fontSize: 13, fontWeight: '600' },

    sourceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        minHeight: 52,
    },
    sourceRowActive: { backgroundColor: '#f0f8f0' },
    sourceInfo: { flex: 1, marginRight: 8 },
    sourceName: { fontSize: 15, fontWeight: '500', color: '#1a1a1a' },
    sourceNameActive: { color: '#4CAF50' },
    sourceUrl: { fontSize: 12, color: '#888', marginTop: 2 },
    sourceActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    activeCheck: { color: '#4CAF50', fontSize: 16, fontWeight: '700' },
    sourceEdit: { color: '#2196F3', fontSize: 13 },
    sourceDel: { color: '#e04444', fontSize: 13 },

    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 15,
        minHeight: 52,
    },

    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },

    rowIcon: {
        fontSize: 18,
        marginRight: 12,
    },

    rowLabel: {
        fontSize: 16,
        color: '#1a1a1a',
        fontWeight: '500',
    },

    rowRight: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 1,
        marginLeft: 12,
    },

    rowValue: {
        fontSize: 14,
        color: '#888',
        textAlign: 'right',
        flexShrink: 1,
    },

    chevron: {
        fontSize: 20,
        color: '#bbb',
        marginLeft: 4,
    },

    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#eee',
        marginLeft: 16,
    },

    colorIndicatorWrap: {
        flexDirection: 'row',
        alignItems: 'center',
    },

    colorIndicator: {
        width: 14,
        height: 14,
        borderRadius: 7,
        marginRight: 8,
    },

    clearCacheSection: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },

    clearCacheBtn: {
        borderWidth: 1.5,
        borderColor: '#e04444',
        borderRadius: 10,
        paddingVertical: 13,
        alignItems: 'center',
        backgroundColor: 'transparent',
    },

    clearCacheBtnText: {
        color: '#e04444',
        fontSize: 15,
        fontWeight: '600',
    },
});

/* ═════════ 弹窗样式 ═════════ */
const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },

    overlayCentered: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    panel: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 }, android: { elevation: 10 } }),
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#eee',
    },

    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1a1a1a',
    },

    closeBtn: {
        fontSize: 20,
        color: '#999',
        paddingHorizontal: 4,
    },

    body: {
        padding: 20,
    },

    fieldLabel: {
        fontSize: 13,
        color: '#666',
        fontWeight: '600',
        marginBottom: 8,
        marginTop: 4,
    },

    input: {
        backgroundColor: '#f7f7f7',
        color: '#1a1a1a',
        borderRadius: 10,
        padding: 12,
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#eee',
    },

    footer: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#eee',
    },

    saveBtn: {
        backgroundColor: '#4CAF50',
        borderRadius: 10,
        paddingVertical: 13,
        alignItems: 'center',
    },

    saveBtnDisabled: { opacity: 0.55 },

    saveBtnText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },

    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },

    chip: {
        backgroundColor: '#f0f0f0',
        borderRadius: 10,
        paddingHorizontal: 16,
        paddingVertical: 9,
    },

    chipActive: {
        backgroundColor: '#4CAF50',
    },

    chipText: {
        color: '#555',
        fontSize: 14,
        fontWeight: '500',
    },

    chipTextActive: {
        color: '#fff',
        fontWeight: '700',
    },

    /* 选择器面板（居中弹窗） */
    pickerPanel: {
        backgroundColor: '#fff',
        borderRadius: 16,
        width: '78%',
        maxWidth: 300,
        padding: 20,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 }, android: { elevation: 12 } }),
    },

    pickerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1a1a1a',
        textAlign: 'center',
        marginBottom: 16,
    },

    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 13,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
        paddingLeft: 10,
    },

    pickerItemActive: {
        backgroundColor: '#fafafa',
    },

    pickerItemText: {
        fontSize: 15,
        color: '#333',
    },

    checkMark: {
        fontSize: 16,
        fontWeight: '700',
    },

    pickerCancel: {
        marginTop: 12,
        paddingVertical: 12,
        alignItems: 'center',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#eee',
    },

    pickerCancelText: {
        fontSize: 15,
        color: '#999',
    },

    /* 色彩网格 */
    colorGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 16,
    },

    colorCircleWrap: {
        width: 54,
        height: 54,
        borderRadius: 27,
        borderWidth: 3,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },

    colorCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },

    colorCheckBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },

    colorCheckIcon: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '800',
    },

    selectedColorLabel: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },

    selectedDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },

    selectedColorName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#333',
    },
});
