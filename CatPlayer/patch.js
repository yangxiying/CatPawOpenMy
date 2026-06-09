/*
 * 在 react-native init 生成原生壳后，注入 iOS 原生配置：
 *   1) Info.plist：UIBackgroundModes=audio（后台音频）、ATS 放行 http、保留横竖屏
 *   2) AppDelegate：AVAudioSession 设为 playback 并激活（息屏续播声音）
 *   3) Podfile：iOS 部署目标提升到 13.4（react-native-video 6 要求）
 * 幂等：重复执行不会重复注入。
 * 用法：node patch.js <appDir>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const APP = process.argv[2];
if (!APP) { console.error('usage: node patch.js <appDir>'); process.exit(1); }
const IOS = path.join(APP, 'ios');
const NAME = 'CatPlayer';

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (p, c) => { fs.writeFileSync(p, c); console.log('  patched', path.relative(APP, p)); };

// 1) Info.plist — UIBackgroundModes + NSAppTransportSecurity
(() => {
    const p = path.join(IOS, NAME, 'Info.plist');
    if (!fs.existsSync(p)) { console.warn('  ! Info.plist not found'); return; }
    let s = read(p);
    let changed = false;

    // 1a) UIBackgroundModes=audio
    if (!s.includes('<key>UIBackgroundModes</key>')) {
        const inject = '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n';
        if (/<\/dict>\s*<\/plist>\s*$/.test(s)) {
            s = s.replace(/<\/dict>\s*<\/plist>\s*$/, inject + '</dict>\n</plist>\n');
            changed = true;
        } else {
            console.warn('  ! Info.plist closing tags not matched');
        }
    } else {
        console.log('  Info.plist UIBackgroundModes already present');
    }

    // 1b) NSAppTransportSecurity — 确保只有一个，且 NSAllowsArbitraryLoads=true
    //     处理三种情况：不存在 / 已存在但 false / 已存在且 true
    if (s.includes('<key>NSAppTransportSecurity</key>')) {
        // 检查是否已有 NSAllowsArbitraryLoads=true
        const atsBlock = s.match(/<key>NSAppTransportSecurity<\/key>\s*<dict>([\s\S]*?)<\/dict>/);
        if (atsBlock) {
            const block = atsBlock[0];
            if (block.includes('<false/>')) {
                // 已有 ATS 但 NSAllowsArbitraryLoads=false，改为 true
                s = s.replace(block, block.replace('<false/>', '<true/>'));
                changed = true;
                console.log('  Info.plist: fixed NSAllowsArbitraryLoads false→true');
            } else {
                console.log('  Info.plist NSAppTransportSecurity already OK');
            }
        }
        // 检查是否有重复的 NSAppTransportSecurity 键（patch.js 旧版 bug 产生的）
        const atsMatches = s.match(/<key>NSAppTransportSecurity<\/key>/g);
        if (atsMatches && atsMatches.length > 1) {
            // 移除最后一个重复的 NSAppTransportSecurity 块
            const lastIdx = s.lastIndexOf('<key>NSAppTransportSecurity</key>');
            const afterBlock = s.indexOf('</dict>', lastIdx);
            if (afterBlock !== -1) {
                const endPos = afterBlock + '</dict>'.length;
                const dupBlock = s.slice(lastIdx, endPos);
                // 包含可能的换行
                const nextChar = s[endPos];
                const extraLen = (nextChar === '\n') ? 1 : 0;
                s = s.slice(0, lastIdx) + s.slice(endPos + extraLen);
                changed = true;
                console.log('  Info.plist: removed duplicate NSAppTransportSecurity block');
            }
        }
    } else {
        // 没有 ATS 块，注入一个
        const inject = '\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t</dict>\n';
        if (/<\/dict>\s*<\/plist>\s*$/.test(s)) {
            s = s.replace(/<\/dict>\s*<\/plist>\s*$/, inject + '</dict>\n</plist>\n');
            changed = true;
        }
    }

    if (changed) write(p, s);
    else console.log('  Info.plist: no changes needed');
})();

// 2) AppDelegate — AVAudioSession playback
(() => {
    const cands = ['AppDelegate.mm', 'AppDelegate.m', 'AppDelegate.swift'].map(f => path.join(IOS, NAME, f));
    const p = cands.find(fs.existsSync);
    if (!p) { console.warn('  ! AppDelegate not found, skip audio session'); return; }
    let s = read(p);
    if (s.includes('AVAudioSession')) { console.log('  AppDelegate already has AVAudioSession'); return; }

    if (p.endsWith('.swift')) {
        if (!s.includes('import AVFoundation')) s = s.replace(/import UIKit/, 'import UIKit\nimport AVFoundation');
        s = s.replace(/(func application\([^)]*didFinishLaunchingWithOptions[^\{]*\{)/,
            '$1\n    try? AVAudioSession.sharedInstance().setCategory(.playback)\n    try? AVAudioSession.sharedInstance().setActive(true)');
        write(p, s);
        return;
    }
    // Objective-C / C++
    if (!s.includes('#import <AVFoundation/AVFoundation.h>')) {
        s = s.replace(/(#import "AppDelegate\.h")/, '$1\n#import <AVFoundation/AVFoundation.h>');
    }
    s = s.replace(/(didFinishLaunchingWithOptions:[^\{]*\{)/,
        '$1\n  [[AVAudioSession sharedInstance] setCategory:AVAudioSessionCategoryPlayback error:nil];\n  [[AVAudioSession sharedInstance] setActive:YES error:nil];');
    write(p, s);
})();

// 3) Podfile — bump deployment target to 16.0 (iOS 16+ required)
(() => {
    const p = path.join(IOS, 'Podfile');
    if (!fs.existsSync(p)) { console.warn('  ! Podfile not found'); return; }
    let s = read(p);
    if (/platform :ios, '16\.0'/.test(s)) { console.log('  Podfile already 16.0'); return; }
    if (/platform :ios, min_ios_version_supported/.test(s)) {
        s = s.replace(/platform :ios, min_ios_version_supported/, "platform :ios, '16.0'");
        write(p, s);
    } else if (/platform :ios, '[\d.]+'/.test(s)) {
        s = s.replace(/platform :ios, '[\d.]+'/, "platform :ios, '16.0'");
        write(p, s);
    } else {
        console.warn('  ! Podfile platform line not found');
    }
})();

console.log('patch.js done.');
