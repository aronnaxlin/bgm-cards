/**
 * Bangumi 分享卡片构建脚本
 * 将 core.js 内联嵌入三个发布用 wrapper，生成可直接粘贴的单文件脚本。
 *
 * 用法（在项目根目录）：
 *   node userscript/build.js
 *
 * 输入（src/ 下的 UI 源码）：
 *   userscript/core.js
 *   userscript/src/share-card.native.src.js
 *   userscript/src/share-card.tampermonkey.src.js
 *   userscript/src/share-card.bgm-gadget.src.js
 *
 * 输出（覆盖根目录下的成品发布文件）：
 *   userscript/share-card.native.user.js
 *   userscript/share-card.tampermonkey.user.js
 *   userscript/share-card.bgm-gadget.js
 *
 * 构建规则：
 *   - 把 core.js 完整内容作为 IIFE 前置代码插入 wrapper 中。
 *   - 保留 wrapper 的 UserScript header（如果有）。
 *   - 在 core.js 之后自动注入启动壳：检查 BgmShareCardCore、调用 createUI(core).init()。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SRC_DIR = path.join(ROOT, 'src');
const CORE_PATH = path.join(ROOT, 'core.js');

// input：src/ 下的 UI 源码（*.src.js）
// output：项目根 userscript/ 下可直接发布 / 粘贴的成品（含内联 core.js）
const WRAPPERS = [
  { input: 'share-card.native.src.js', output: 'share-card.native.user.js' },
  { input: 'share-card.tampermonkey.src.js', output: 'share-card.tampermonkey.user.js' },
  { input: 'share-card.bgm-gadget.src.js', output: 'share-card.bgm-gadget.js' },
];

function read(file) {
  return fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
}

function write(file, content) {
  fs.writeFileSync(path.join(ROOT, file), content, 'utf8');
}

/**
 * 从 wrapper 源码中提取 UserScript header（如果有）。
 * 返回 header 字符串，若没有则返回空字符串。
 */
function extractHeader(source) {
  const lines = source.split('\n');
  let start = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*\/\/\s*==UserScript==\s*$/.test(lines[i]) && start === -1) start = i;
    if (start !== -1 && /^\s*\/\/\s*==\/UserScript==\s*$/.test(lines[i])) { end = i; break; }
  }
  if (start === -1 || end === -1) return '';
  return lines.slice(start, end + 1).join('\n');
}

function buildWrapper(coreSource, wrapperSource) {
  const header = extractHeader(wrapperSource);
  // 去掉 header 后只保留 UI 函数体
  let uiBody = wrapperSource;
  if (header) uiBody = uiBody.replace(header, '');
  uiBody = uiBody
    .replace(/^\/\*\*[\s\S]*?\*\/$/m, '')   // 移除顶部注释块
    .replace(/^\s*\/\/.*$/gm, '')             // 移除单行注释
    .trim();

  const bootstrap = `
// 内联核心代码结束，以下为 UI 层与启动逻辑
(function () {
  'use strict';

  if (typeof BgmShareCardCore === 'undefined') {
    console.error('[bgm-share-card] 核心未加载');
    return;
  }

  const core = BgmShareCardCore;

  ${uiBody}

  function start() {
    if (!/\\/(subject|character)\\/\\d+/.test(location.pathname)) return;
    if (/^\\/m\\//.test(location.pathname)) return;
    createUI(core).init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;

  const banner = `// 本文件由 build.js 自动生成，请勿手动编辑
// 生成时间：${new Date().toISOString()}
// 内联核心来源：userscript/core.js
`;

  if (header) {
    return `${header}\n\n${banner}${coreSource}\n${bootstrap}`;
  }
  return `${banner}${coreSource}\n${bootstrap}`;
}

function main() {
  if (!fs.existsSync(CORE_PATH)) {
    console.error(`找不到核心文件：${CORE_PATH}`);
    process.exit(1);
  }
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`找不到源码目录：${SRC_DIR}`);
    process.exit(1);
  }

  const coreSource = fs.readFileSync(CORE_PATH, 'utf8');

  for (const { input, output } of WRAPPERS) {
    const wrapperSource = read(input);
    const built = buildWrapper(coreSource, wrapperSource);
    write(output, built);
    console.log(`✓ 已生成 ${output} (${(built.length / 1024).toFixed(1)} KB)`);
  }

  console.log('构建完成');
}

main();
