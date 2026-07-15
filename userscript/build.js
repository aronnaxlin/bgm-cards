/**
 * Bangumi 分享卡片构建脚本
 * 将 core.js + 共享 UI 层内联嵌入三个发布用 wrapper，生成可直接粘贴的单文件脚本。
 *
 * 用法（在项目根目录）：
 *   node userscript/build.js
 *
 * 输入：
 *   userscript/core.js                              — 共享核心（取数据/绘制/导出）
 *   userscript/src/share-card.ui.shared.js           — 共享 UI 层（createUI），三环境共用同一份
 *   userscript/src/share-card.native.src.js          — 仅含各环境的 UserScript header（如有）
 *   userscript/src/share-card.tampermonkey.src.js
 *   userscript/src/share-card.bgm-gadget.src.js
 *
 * 输出（覆盖根目录下的成品发布文件）：
 *   userscript/share-card.native.user.js
 *   userscript/share-card.tampermonkey.user.js
 *   userscript/share-card.bgm-gadget.js
 *
 * 构建规则：
 *   - 把 core.js + share-card.ui.shared.js 依次内联到 IIFE 中。
 *   - 保留各 wrapper 的 UserScript header（如果有）。
 *   - 自动注入启动壳：检查 BgmShareCardCore、调用 createUI(core).init()。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);
const SRC_DIR = path.join(ROOT, 'src');
const CORE_PATH = path.join(ROOT, 'core.js');
const UI_SHARED_PATH = path.join(SRC_DIR, 'share-card.ui.shared.js');

// input：src/ 下仅含 header 的环境标记文件 → output：项目根 userscript/ 下的成品（含内联 core.js + 共享 UI）
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

function buildWrapper(coreSource, uiSharedSource, wrapperSource) {
  const header = extractHeader(wrapperSource);
  const uiBody = uiSharedSource
    .replace(/^\/\*\*[\s\S]*?\*\/$/m, '')   // 移除顶部注释块
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
    // 全站运行：设置面板（chiiLib Tab）需要在任意页面可用；
    // 卡片入口是否注入由 init() 内部按页型（subject/character/person）自行判断。
    if (/^\\/m\\//.test(location.pathname)) return; // 移动版页面跳过
    createUI(core).init();
  }

  // 让 bangumi 先完成加载与渲染，再在浏览器空闲时挂载组件，避免与首屏抢主线程
  function scheduleStart() {
    var idle = window.requestIdleCallback || function (cb) {
      return setTimeout(function () { cb(); }, 200);
    };
    idle(start, { timeout: 2000 });
  }

  if (document.readyState === 'complete') {
    scheduleStart();
  } else {
    window.addEventListener('load', scheduleStart, { once: true });
  }
})();
`;

  const banner = `// 本文件由 build.js 自动生成，请勿手动编辑
// 生成时间：${new Date().toISOString()}
// 内联来源：userscript/core.js + userscript/src/share-card.ui.shared.js
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
  if (!fs.existsSync(UI_SHARED_PATH)) {
    console.error(`找不到共享 UI 源码：${UI_SHARED_PATH}`);
    process.exit(1);
  }

  const coreSource = fs.readFileSync(CORE_PATH, 'utf8');
  const uiSharedSource = fs.readFileSync(UI_SHARED_PATH, 'utf8');

  for (const { input, output } of WRAPPERS) {
    const wrapperSource = read(input);
    const built = buildWrapper(coreSource, uiSharedSource, wrapperSource);
    write(output, built);
    console.log(`✓ 已生成 ${output} (${(built.length / 1024).toFixed(1)} KB)`);
  }

  console.log('构建完成');
}

main();
