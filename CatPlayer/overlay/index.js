/**
 * RN 入口（替代 RN 生成的 index.js）。
 * 注入 ErrorUtils polyfill，修复 LiveContainer / 非标准启动环境下的
 * "Cannot read property 'setGlobalHandler' of undefined" 崩溃。
 */
if (typeof global.ErrorUtils === 'undefined' || global.ErrorUtils == null) {
    global.ErrorUtils = {
        _globalHandler: null,
        setGlobalHandler: function (handler) {
            this._globalHandler = handler;
        },
        getGlobalHandler: function () {
            return this._globalHandler;
        },
        reportError: function (error) {
            if (this._globalHandler) {
                this._globalHandler(error, false);
            } else {
                console.error('ErrorUtils (polyfill):', error);
            }
        },
        reportFatalError: function (error) {
            if (this._globalHandler) {
                this._globalHandler(error, true);
            } else {
                console.error('ErrorUtils (polyfill fatal):', error);
            }
        },
    };
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
