/**
 * 爬虫元数据校验脚本
 * 检查所有爬虫的 meta.key 唯一性和 meta.type 范围正确性
 *
 * 用法: node scripts/validate-spider-meta.mjs
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const SPIDER_DIR = join(__dirname, '..', 'src', 'spider');

// meta.type 范围定义
const TYPE_RANGES = {
  video: { min: 0, max: 9, dir: 'video' },
  book: { min: 10, max: 19, dir: 'book' },
  comic: { min: 20, max: 29, dir: null }, // 无独立目录
  music: { min: 30, max: 39, dir: null },
  pan: { min: 40, max: 49, dir: 'pan' },
};

function collectJsFiles(dir, baseDir = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsFiles(fullPath, baseDir));
    } else if (entry.isFile() && extname(entry.name) === '.js') {
      files.push(fullPath);
    }
  }
  return files;
}

function extractMeta(content) {
  // meta 声明格式:
  //   meta: {
  //       key: 'xxx',
  //       type: 3,
  //   },
  const metaBlock = content.match(/meta\s*:\s*\{([^}]+)\}/s);
  if (!metaBlock) return { key: null, type: null };

  const block = metaBlock[1];
  const keyMatch = block.match(/key\s*:\s*['"](\w+)['"]/);
  const typeMatch = block.match(/type\s*:\s*(\d+)/);
  return {
    key: keyMatch ? keyMatch[1] : null,
    type: typeMatch ? parseInt(typeMatch[1], 10) : null,
  };
}

function getCategoryByPath(filePath, baseDir) {
  const rel = filePath.replace(baseDir, '').replace(/^[/\\]/, '');
  const parts = rel.split(/[/\\]/);
  return parts[0]; // e.g., "video", "book", "pan"
}

function getTypeRange(category) {
  for (const [name, range] of Object.entries(TYPE_RANGES)) {
    if (range.dir === category) return range;
    // heuristic: try matching name prefixes
    if (name.startsWith(category) || category.startsWith(name)) return range;
  }
  return null;
}

function validate() {
  if (!statSync(SPIDER_DIR, { throwIfNoEntry: false })) {
    console.log(`❌ 爬虫目录不存在: ${SPIDER_DIR}`);
    process.exit(1);
  }

  const files = collectJsFiles(SPIDER_DIR);
  const keys = {};
  const errors = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const meta = extractMeta(content);
    if (!meta.key && !meta.type) continue; // 非爬虫文件

    const relPath = file.replace(SPIDER_DIR, '').replace(/^[/\\]/, '');
    const category = getCategoryByPath(file, SPIDER_DIR);

    // 检查 key 唯一性
    if (meta.key) {
      if (keys[meta.key]) {
        errors.push({
          file: relPath,
          field: 'meta.key',
          msg: `重复的 key "${meta.key}"（已在 ${keys[meta.key]} 中定义）`,
        });
      } else {
        keys[meta.key] = relPath;
      }
    }

    // 检查 type 范围
    if (meta.type !== null && category) {
      const range = getTypeRange(category);
      if (range) {
        if (meta.type < range.min || meta.type > range.max) {
          errors.push({
            file: relPath,
            field: 'meta.type',
            msg: `type=${meta.type} 不在 ${category} 类别范围 [${range.min}-${range.max}] 内`,
          });
        }
      }
    }
  }

  // 输出报告
  const totalSpiders = Object.keys(keys).length;
  console.log(`\n## 爬虫元数据校验报告`);
  console.log(`\n扫描文件: ${files.length}`);
  console.log(`有效爬虫: ${totalSpiders}`);

  if (errors.length === 0) {
    console.log(`\n### ✅ 全部通过\n`);
    for (const [key, file] of Object.entries(keys)) {
      console.log(`  ✓ ${file} — key: ${key}`);
    }
    process.exit(0);
  } else {
    console.log(`\n### ❌ 发现 ${errors.length} 个问题\n`);
    console.log('| 文件 | 字段 | 问题描述 |');
    console.log('|------|------|----------|');
    for (const err of errors) {
      console.log(`| ${err.file} | ${err.field} | ${err.msg} |`);
    }
    process.exit(1);
  }
}

validate();
