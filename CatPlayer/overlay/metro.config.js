/**
 * Metro 配置：排除 nodejs-assets（内嵌 Node 项目，含 require('rn-bridge') 等
 * metro 无法解析的模块，且不应被打包进 RN bundle）。
 *
 * 参见 nodejs-mobile-react-native README：
 * https://github.com/nodejs-mobile/nodejs-mobile-react-native
 */
const path = require('path');
const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
    const config = await getDefaultConfig(__dirname);
    // 用 blockList（metro ≥0.64）或 blacklistRE（旧版）排除整个 nodejs-assets 目录
    config.resolver.blockList = [
        /nodejs-assets\/nodejs-project\/.*/,
    ];
    return config;
})();
