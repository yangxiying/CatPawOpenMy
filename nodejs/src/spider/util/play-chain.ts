import { decodeNBY, resolveJQQ, detectParser, tryParserChain } from './decoder.js';

/**
 * 多策略播放 URL 解码链
 * 顺序：NBY → jqq → 商业站点解析器 → 直通
 */
export async function resolvePlayUrl(id) {
  // 1. NBY 编码前缀检测
  if (id.startsWith('NBY-XMYAE') || id.startsWith('NBY-')) {
    const result = decodeNBY(id);
    if (result?.url) return result;
  }

  // 2. jqq- 前缀
  if (id.startsWith('jqq-')) {
    const result = await resolveJQQ(id);
    if (result?.url) return result;
  }

  // 3. 商业站点解析器
  const parsers = detectParser(id);
  if (parsers) {
    const result = await tryParserChain(id, parsers);
    if (result?.url) return result;
  }

  // 4. 直通（无法解码，返回原始 URL）
  return { parse: 0, url: id };
}
