/**
 * Metro 配置：排除 nodejs-assets（内嵌 Node 项目，含 require('rn-bridge') 等
 * metro 无法解析的模块，且不应被打包进 RN bundle）。
 *
 * 参见 nodejs-mobile-react-native README：
 * https://github.com/nodejs-mobile/nodejs-mobile-react-native
 */
const exclusionList = require('metro-config/src/defaults/exclusionList');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const config = {
    resolver: {
        blockList: exclusionList([/nodejs-assets\/nodejs-project\/.*/]),
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
