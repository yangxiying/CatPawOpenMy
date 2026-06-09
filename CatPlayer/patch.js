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

// 1) Info.plist
(() => {
    const p = path.join(IOS, NAME, 'Info.plist');
    if (!fs.existsSync(p)) { console.warn('  ! Info.plist not found'); return; }
    let s = read(p);
    if (s.includes('<key>UIBackgroundModes</key>')) { console.log('  Info.plist already patched'); return; }
    const inject =
        '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n' +
        '\t<key>NSAppTransportSecurity</key>\n\t<dict>\n\t\t<key>NSAllowsArbitraryLoads</key>\n\t\t<true/>\n\t</dict>\n';
    if (/<\/dict>\s*<\/plist>\s*$/.test(s)) {
        s = s.replace(/<\/dict>\s*<\/plist>\s*$/, inject + '</dict>\n</plist>\n');
        write(p, s);
    } else {
        console.warn('  ! Info.plist closing tags not matched');
    }
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
