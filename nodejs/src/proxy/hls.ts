import axios from 'axios';

function baseDir(url) {
  if (url.endsWith('/')) return url;
  const i = url.lastIndexOf('/');
  return i > 8 ? url.substring(0, i + 1) : url + '/';
}

/**
 * HLS 反向代理 plugin
 * @param {import('fastify').FastifyInstance} fastify
 */
export default async function hlsProxyPlugin(fastify, opts) {
  const upstreamTimeout = opts.upstreamTimeout || 15000;

  // GET /:encoded/:path(*) — via prefix /proxy/hls
  fastify.get('/:encoded/:path(*)', async (req, reply) => {
    const remoteBase = decodeURIComponent(req.params.encoded);
    const requestPath = req.params.path;

    // m3u8 playlist — fetch + rewrite URIs
    if (requestPath.endsWith('.m3u8')) {
      const upstreamUrl =
        requestPath === '.m3u8' ? remoteBase : baseDir(remoteBase) + requestPath;
      const res = await axios.get(upstreamUrl, {
        headers: {
          'User-Agent': req.headers['user-agent'] || 'okhttp/4.1.0',
        },
        timeout: upstreamTimeout,
        responseType: 'text',
      });
      const rewritten = rewritePlaylist(res.data, upstreamUrl);
      return reply.type('application/vnd.apple.mpegurl').send(rewritten);
    }

    // TS segment (or other binary) — stream passthrough
    const upstreamUrl =
      requestPath.startsWith('http://') || requestPath.startsWith('https://')
        ? requestPath
        : baseDir(remoteBase) + requestPath;
    const upstreamRes = await axios.get(upstreamUrl, {
      headers: {
        'User-Agent': req.headers['user-agent'] || 'okhttp/4.1.0',
      },
      timeout: upstreamTimeout,
      responseType: 'stream',
    });
    reply.type(upstreamRes.headers['content-type'] || 'video/MP2T');
    reply.send(upstreamRes.data);
  });
}

/** Rewrite m3u8 URIs to local proxy paths */
function rewritePlaylist(content, remoteUrl) {
  const dir = baseDir(remoteUrl);
  const encodedBase = encodeURIComponent(dir);

  return content
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return line;
      const absUrl = trimmed.startsWith('http') ? trimmed : dir + trimmed;
      const relPath = absUrl.startsWith(dir)
        ? absUrl.substring(dir.length)
        : trimmed;
      return `/proxy/hls/${encodedBase}/${relPath}`;
    })
    .join('\n');
}