import axios from 'axios';
import crypto from 'crypto';

// ── NBY-XMYAE 解码 ──

/**
 * 解码 NBY-XMYAE 格式加密串
 * 格式: NBY-XMYAE{base64_ciphertext}|{base64_key}
 * 算法: base64 decode → AES-256-ECB decrypt → extract url + headers
 */
export function decodeNBY(id) {
  try {
    // 去掉 NBY-XMYAE 前缀
    const payload = id.replace(/^NBY-XMYAE/i, '');
    const parts = payload.split('|');
    if (parts.length < 2) return null;

    const cipherB64 = parts[0];
    const keyB64 = parts[1];

    const ciphertext = Buffer.from(cipherB64, 'base64');
    const key = Buffer.from(keyB64, 'base64');

    // AES-256-ECB 解密
    const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    // 解析解密后 JSON（期望包含 url/header/parse 等字段）
    const result = JSON.parse(decrypted);
    return {
      parse: 0,
      url: result.url || result.play_url || '',
      header: result.header || result.headers || {},
    };
  } catch (e) {
    console.error('[decoder] NBY decode failed:', e.message);
    return null;
  }
}

// ── jqq- 解析器（juquanquanapp.com）──

export async function resolveJQQ(id) {
  try {
    const parts = id.split('-');
    // 格式: jqq-{dramaId}-{episodeSid}
    if (parts.length < 3) return null;
    const dramaId = parts[1];
    const episodeSid = parts[2];

    // 从缓存或配置加载 jqq headers
    const headers = loadJQQHeaders();

    const res = await axios.get(
      `https://api.juquanquanapp.com/app/drama/detail?dramaId=${dramaId}&episodeSid=${episodeSid}&quality=LD`,
      { headers, timeout: 10000 }
    );

    if (res.data?.data?.playInfo?.url) {
      return { parse: 0, url: res.data.data.playInfo.url };
    }
    return null;
  } catch (e) {
    console.error('[decoder] jqq resolve failed:', e.message);
    return null;
  }
}

export function loadJQQHeaders() {
  // 从缓存文件加载 jqq API headers
  // 简化实现：使用固定 headers（生产环境应从 jqqheader.json 加载）
  return {
    'User-Agent': 'okhttp/4.1.0',
    'Accept': 'application/json',
  };
}

// ── 商业站点解析器链 ──

const SITE_PARSERS = {
  'youku':   ['https://jx.aidouer.net/?url=', 'https://jx.youku.com/?url='],
  'iqiyi':   ['https://jx.aidouer.net/?url=', 'https://jx.iqiyi.com/?url='],
  'v.qq.com': ['https://jx.aidouer.net/?url='],
  'pptv':    ['https://jx.aidouer.net/?url='],
  'mgtv':    ['https://jx.aidouer.net/?url='],
  '1905.com': ['https://jx.aidouer.net/?url='],
};

export function detectParser(id) {
  for (const [site, parsers] of Object.entries(SITE_PARSERS)) {
    if (id.includes(site)) return parsers;
  }
  return null;
}

export async function tryParserChain(id, parsers) {
  for (const parser of parsers) {
    try {
      const res = await axios.get(parser + encodeURIComponent(id), {
        headers: { 'User-Agent': 'okhttp/4.1.0' },
        timeout: 8000,
      });
      const result = parseParserResult(res.data);
      if (result?.url) return result;
    } catch {}
  }
  return null;
}

function parseParserResult(body) {
  // 解析常见的解析器返回格式（JSON 或 HTML）
  try {
    const json = typeof body === 'string' ? JSON.parse(body) : body;
    if (json.url) return { parse: 0, url: json.url };
    if (json.data?.url) return { parse: 0, url: json.data.url };
  } catch {}
  return null;
}
