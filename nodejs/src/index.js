import fastify from 'fastify';
import router from './router.js';
import { JsonDB, Config } from 'node-json-db';
import axios from 'axios';
import path from 'path';
import fs from 'fs';

let server = null;
// 远程 bundle 加载器（类似 MiraPlay 的 loadScript）
let remoteSourceModule = null;
let remoteRoutesRegistered = false;

/**
 * 加载远程 bundle（类似 MiraPlay 的 loadScript）
 * @param {string} dirPath - 远程 bundle 所在目录（含 index.js + index.config.js）
 */
export async function loadRemoteBundle(dirPath) {
    try {
        const indexJSPath = path.join(dirPath, 'index.js');
        const configJSPath = path.join(dirPath, 'index.config.js');
        
        if (!fs.existsSync(indexJSPath)) {
            console.error('[loadRemoteBundle] index.js not found at', indexJSPath);
            return false;
        }
        
        // 清除缓存
        delete require.cache[require.resolve(indexJSPath)];
        
        remoteSourceModule = require(indexJSPath);
        
        let cfg = {};
        if (fs.existsSync(configJSPath)) {
            delete require.cache[require.resolve(configJSPath)];
            cfg = require(configJSPath);
            cfg = cfg.default || cfg;
        }
        
        // 启动远程 bundle
        if (typeof remoteSourceModule.start === 'function') {
            await remoteSourceModule.start(cfg);
            console.log('[loadRemoteBundle] remote bundle started successfully from', dirPath);
            return true;
        } else {
            console.error('[loadRemoteBundle] remote bundle has no start() function');
            return false;
        }
    } catch (e) {
        console.error('[loadRemoteBundle] failed:', e.message);
        return false;
    }
}

/**
 * Start the server with the given configuration.
 *
 * Be careful that start will be called multiple times when
 * work with catvodapp. If the server is already running,
 * the stop will be called by engine before start, make sure
 * to return new server every time.
 *
 * @param {Map} config - the config of the server
 * @return {void}
 */
export async function start(config) {
    /**
     * @type {import('fastify').FastifyInstance}
     */
    server = fastify({
        serverFactory: catServerFactory,
        forceCloseConnections: true,
        logger: !!(process.env.NODE_ENV !== 'development'),
        maxParamLength: 10240,
    });
    server.messageToDart = async (data, inReq) => {
        try {
            if (!data.prefix) {
                data.prefix = inReq ? inReq.server.prefix : '';
            }
            console.log(data);
            const port = catDartServerPort();
            if (port == 0) {
                return null;
            }
            const resp = await axios.post(`http://127.0.0.1:${port}/msg`, data);
            return resp.data;
        } catch (error) {
            return null;
        }
    };
    server.address = function () {
        const result = this.server.address();
        result.url = `http://${result.address}:${result.port}`;
        result.dynamic = 'js2p://_WEB_';
        return result;
    };
    server.addHook('onError', async (_request, _reply, error) => {
        console.error(error);
        if (!error.statusCode) error.statusCode = 500;
        return error;
    });
    server.stop = false;
    server.config = config;
    // 推荐使用NODE_PATH做db存储的更目录，这个目录在应用中清除缓存时会被清空
    server.db = new JsonDB(new Config((process.env['NODE_PATH'] || '.') + '/db.json', true, true, '/', true));
    server.register(router);
    
    // 注册远程 bundle 管理端点
    server.post('/admin/load-remote', async (req, reply) => {
        const { path: bundlePath } = req.body || {};
        if (!bundlePath) {
            return reply.status(400).send({ error: 'path required' });
        }
        const ok = await loadRemoteBundle(bundlePath);
        reply.send({ success: ok });
    });
    
    // 注意 一定要监听ipv4地址 build后 app中使用时 端口使用0让系统自动分配可用端口
    server.listen({ port: process.env['DEV_HTTP_PORT'] || 0, host: '127.0.0.1' });
}

/**
 * Stop the server if it exists.
 *
 */
export async function stop() {
    if (server) {
        server.close();
        server.stop = true;
    }
    server = null;
}
