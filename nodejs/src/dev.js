import { createServer } from 'http';

globalThis.catServerFactory = (handle) => {
    let port = 0;
    const server = createServer((req, res) => {
        handle(req, res);
    });
    server.on('listening', () => {
        port = server.address().port;
        console.log('Run on ' + port);
    });
    server.on('close', () => {
        console.log('Close on ' + port);
    });
    return server;
};

globalThis.catDartServerPort = () => {
    return parseInt(process.env['DART_SERVER_PORT'] || '0', 10);
};

import { start } from './index.js';

import * as config from './index.config.js';

start(config.default);

console.log('[dev] Node.js server started');
console.log('[dev] DEV_HTTP_PORT=' + (process.env['DEV_HTTP_PORT'] || 'auto'));
console.log('[dev] Remote bundles can be loaded via POST /admin/load-remote');
