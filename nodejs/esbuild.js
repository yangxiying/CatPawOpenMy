import * as esbuild from 'esbuild';
import fs from 'fs';
import { createHash } from 'crypto';
import path from 'path';

// 构建 Spider 服务（在 WebView polyfill 中运行）
esbuild.build({
    entryPoints: ['src/index.js'],
    outfile: 'dist/index.js',
    bundle: true,
    minify: true,
    write: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    plugins: [genMd5()],
});

// 构建 Node.js 运行时入口（在嵌入的 Node.js 中运行，供 nodejs-assets/ 使用）
esbuild.build({
    entryPoints: ['src/main.js'],
    outfile: 'dist/nodejs-runtime.js',
    bundle: true,
    minify: true,
    write: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    external: ['rn-bridge'], // rn-bridge 由 nodejs-mobile-react-native 提供
    sourcemap: false,
});

function genMd5() {
    return {
        name: 'gen-output-file-md5',
        setup(build) {
            build.onEnd(async (_) => {
                const md5 = createHash('md5').update(fs.readFileSync('dist/index.js')).digest('hex');
                fs.writeFileSync('dist/index.js.md5', md5);
            });
        },
    };
}
