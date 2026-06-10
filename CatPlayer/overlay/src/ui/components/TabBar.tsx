import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/** 标签页配置项 */
type TabItem = {
    key: string;
    label: string;
    icon: string;
};

/** TabBar 组件属性 */
type TabBarProps = {
    activeTab: string;
    onTabChange: (tab: string) => void;
};

/** 底部标签栏的四个标签定义 */
const TABS: TabItem[] = [
    { key: 'home', label: '首页', icon: '🏠' },
    { key: 'favorites', label: '收藏', icon: '⭐' },
    { key: 'history', label: '历史', icon: '🕐' },
    { key: 'settings', label: '设置', icon: '⚙️' },
];

/**
 * 底部标签栏组件
 * 提供四个标签页的切换功能，高亮当前激活标签
 */
export default function TabBar({ activeTab, onTabChange }: TabBarProps) {
    return (
        <View style={styles.container}>
            {TABS.map(tab => {
                const isActive = tab.key === activeTab;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        style={styles.tab}
                        activeOpacity={0.7}
                        onPress={() => onTabChange(tab.key)}
                    >
                        <Text style={[styles.icon, isActive && styles.iconActive]}>{tab.icon}</Text>
                        <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        height: 56,
        flexDirection: 'row',
        backgroundColor: '#1a1a2e',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#23232b',
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    icon: {
        fontSize: 20,
        color: '#666',
    },
    iconActive: {
        color: '#7aa2ff',
    },
    label: {
        fontSize: 10,
        color: '#666',
        marginTop: 2,
    },
    labelActive: {
        color: '#7aa2ff',
    },
});
