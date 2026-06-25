// ==UserScript==
// @name         Bangumi 条目分享卡片
// @name:en      Bangumi Subject Share Card
// @namespace    https://github.com/aronnaxlin/bgm-cards
// @version      1.0.0
// @author       aronnaxlin
// @description  在 Bangumi 条目页生成可下载 / 可复制的 PNG 分享卡片，支持受限条目，无需额外授权
// @description:en  Generate downloadable/copyable PNG share cards on Bangumi subject pages, works on restricted subjects without extra auth
// @license      MIT
// @homepageURL  https://github.com/aronnaxlin/bgm-cards
// @supportURL   https://github.com/aronnaxlin/bgm-cards/issues
// @icon         https://bgm.tv/img/favicon.ico
// @match        *://bgm.tv/subject/*
// @match        *://bangumi.tv/subject/*
// @match        *://chii.in/subject/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// 本文件由 build.js 自动生成，请勿手动编辑
// 生成时间：2026-06-25T15:40:43.865Z
// 内联核心来源：userscript/core.js
/**
 * Bangumi 条目分享卡片 - 核心渲染逻辑
 * 纯浏览器原生 JS，零依赖。三版用户脚本共享同一份实现。
 */

(function (global) {
  'use strict';

  // ========================================================================
  // 配置常量
  // ========================================================================

  const LAYOUT = {
    w: 500,
    h: 720,
    dpr: Math.max(typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 2, 2),
    colors: {
      bg: '#0a0a0c',
      textMain: '#f5f5f7',
      textSub: '#a0a0b0',
      accent: '#F09199',
      footerBg: '#f4f4f5',
      footerText: '#555555',
      footerDark: '#111111',
      panelBg: 'rgba(255,255,255,0.05)',
      panelBorder: 'rgba(255,255,255,0.08)',
      tagBg: 'rgba(240,145,153,0.12)',
      tagBorder: 'rgba(240,145,153,0.22)',
      tagText: 'rgba(245,245,247,0.82)',
      fallbackGradient: ['#1a1a2e', '#16213e', '#0f3460'],
    },
    poster: {
      x: 40, y: 40, w: 152, h: 228, radius: 24,
      shadowColor: 'rgba(0,0,0,0.50)',
      shadowBlur: 52,
      shadowY: 20,
    },
    title: {
      x: 216, y: 72, maxW: 244,
      mainSize: 22, mainSizeLong: 18, subSize: 13,
      lineHeight: 1.25,
    },
    meta: {
      x: 216, y: 158, w: 150, size: 11, lineHeight: 21,
    },
    coll: {
      x: 380, y: 158, size: 14, labelSize: 10, lineHeight: 21,
    },
    // divider1 的 x 在运行时按 Meta / 收藏区实际边界取中点（见 renderCard）
    divider1: { y: 156, h: 80, alpha: 0.14, solidStart: 0.2, solidEnd: 0.8 },
    // divider2 的 x 在运行时按评分区实际宽度动态计算（见 renderCard），这里只给纵向参数
    divider2: { y: 310, h: 58, alpha: 0.16, solidStart: 0.25, solidEnd: 0.75 },
    rating: {
      x: 40, y: 294, w: 420, h: 90, radius: 24,
      scoreSize: 38, starsSize: 12, countSize: 10,
    },
    tags: {
      // 位置/宽度随 divider2 动态计算、行块在面板内垂直居中；这里只保留药丸样式参数
      pillSize: 11, pillH: 19, pillPadX: 11, gap: 7,
    },
    summary: {
      // y=410：让「评分面板下边 → 简介」与「上方信息 → 评分面板上边」两段间距一致（均 26px）
      x: 40, y: 410, w: 420, size: 12, lineHeight: 21, maxLines: 6,
    },
    footer: {
      x: 0, y: 612, w: 500, h: 108,
      qrX: 40, qrY: 18, qrSize: 64, qrRadius: 16,
      tipX: 116, tipY: 38,
      logoX: 320, logoY: 36, logoW: 140, logoH: 32,
    },
  };

  const FONT_STACK = {
    ja: "'Noto Sans', 'Noto Sans JP', 'Noto Sans SC', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'MS PGothic', sans-serif",
    cn: "'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', 'Hiragino Sans GB', 'Source Han Sans SC', sans-serif",
    mono: "'JetBrains Mono', 'SF Mono', Consolas, 'Liberation Mono', 'Courier New', monospace",
  };

  function logoUrl() {
    if (typeof location === 'undefined') return 'https://bgm.tv/img/logo_riff.png';
    return `${location.protocol}//${location.hostname}/img/logo_riff.png`;
  }
  const API_BASE = 'https://api.bgm.tv';
  const QR_SERVICE = 'https://api.qrserver.com/v1/create-qr-code/';
  const ALLOWED_HOSTS = ['bgm.tv', 'bangumi.tv', 'chii.in'];

  // ========================================================================
  // 工具函数
  // ========================================================================

  function isAllowedHost() {
    if (typeof location === 'undefined') return false;
    // hostname 不含端口，hostnames 如 bgm.tv:443 用 location.hostname 仍正确
    const host = location.hostname.replace(/:\d+$/, '');
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  }

  function parseSubjectId() {
    if (typeof location === 'undefined') return null;
    if (/^\/m\//.test(location.pathname)) return null;
    const m = location.pathname.match(/^\/subject\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }

  function subjectPageUrl(id) {
    if (typeof location === 'undefined') return `https://bgm.tv/subject/${id}`;
    return `${location.protocol}//${location.hostname}/subject/${id}`;
  }

  function pickPosterUrl(images) {
    if (!images) return null;
    const preferred = images.medium || images.common || images.large || images.grid || images.small;
    if (!preferred) return null;
    if (/\/r\/\d+\/pic\/cover\//.test(preferred)) return preferred;
    return preferred.replace(/\/pic\/cover\//, '/r/800/pic/cover/');
  }

  function normalizeValue(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (Array.isArray(v)) {
      return v.map(item => {
        if (item && typeof item === 'object') return item.v || item.value || '';
        return String(item);
      }).filter(Boolean).join(' / ');
    }
    return String(v);
  }

  function pickStaff(infobox, type) {
    const priorities = {
      1: ['作者', '作画', '原作', '出版社', '插图'],
      2: ['导演', '原作', '动画制作', '人物设定', '音乐'],
      3: ['艺术家', '作曲', '编曲', '作词', '发行'],
      4: ['开发', '发行', '游戏类型', '平台'],
      6: ['导演', '主演', '编剧', '制作'],
    };
    const order = priorities[type] || ['导演', '原作', '作者'];
    const seen = new Set();
    const picks = [];
    for (const item of (infobox || [])) {
      if (!item || !item.key) continue;
      if (!order.includes(item.key) || seen.has(item.key)) continue;
      const val = normalizeValue(item.value);
      if (!val) continue;
      seen.add(item.key);
      picks.push({ key: item.key, value: val });
      if (picks.length >= 2) break;
    }
    return picks;
  }

  function mediaLabel(type, platform) {
    if (platform) return platform;
    const map = { 1: '书籍', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };
    return map[type] || '条目';
  }

  // 收藏状态用词随条目类型变化：书=读 / 音乐=听 / 游戏=玩 / 动画·三次元=看
  function collectionLabels(type) {
    switch (type) {
      case 1: return { wish: '想读', doing: '在读', done: '读过' };
      case 3: return { wish: '想听', doing: '在听', done: '听过' };
      case 4: return { wish: '想玩', doing: '在玩', done: '玩过' };
      default: return { wish: '想看', doing: '在看', done: '看过' };
    }
  }

  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  // 用路径绘制五角星，避免依赖 ⯪ 等 iOS 不支持的 Unicode 字符
  function drawStars(ctx, score, x, cy, size, color) {
    const s5 = Math.max(0, Math.min(5, (Number(score) || 0) / 2));
    const half = Math.round(s5 * 2) / 2;
    const full = Math.floor(half);
    const hasHalf = half - full === 0.5;
    const empty = 5 - full - (hasHalf ? 1 : 0);
    const R = size / 2;
    const r = R * 0.4;
    const gap = size * 0.25;
    const step = size + gap;

    function starPath(sx) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI / 5) - Math.PI / 2;
        const rad = i % 2 === 0 ? R : r;
        ctx.lineTo(sx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      ctx.closePath();
    }

    ctx.fillStyle = color;
    let ox = x + R;
    for (let i = 0; i < full; i++, ox += step) { starPath(ox); ctx.fill(); }

    if (hasHalf) {
      ctx.save();
      ctx.beginPath(); ctx.rect(ox - R - 1, cy - R - 1, R + 1, R * 2 + 2); ctx.clip();
      starPath(ox); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.beginPath(); ctx.rect(ox, cy - R - 1, R + 2, R * 2 + 2); ctx.clip();
      starPath(ox); ctx.fill();
      ctx.restore();
      ox += step;
    }

    ctx.save();
    ctx.globalAlpha = 0.28;
    for (let i = 0; i < empty; i++, ox += step) { starPath(ox); ctx.fill(); }
    ctx.restore();
  }

  function starsWidth(size) {
    // 5 颗星 × size + 4 个间隔 × (size*0.25) = size*6
    return size * 6;
  }

  function processSummary(raw) {
    if (!raw) return '';
    return raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .split('\n')
      .map(s => s.replace(/^\s+/, '').replace(/\s+$/, ''))
      .filter(Boolean)
      .join('\n')
      .slice(0, 360) + (raw.length > 360 ? '…' : '');
  }

  function retry(fn, opts = {}) {
    const { retries = 3, delay = 800, onRetry } = opts;
    return new Promise((resolve, reject) => {
      let attempt = 0;
      function run() {
        attempt++;
        fn().then(resolve).catch(err => {
          if (attempt > retries) return reject(err);
          if (onRetry) onRetry(err, attempt);
          setTimeout(run, delay * attempt);
        });
      }
      run();
    });
  }

  // ========================================================================
  // 页面抓取（替代 API 调用，天然绕过登录限制）
  // ========================================================================

  function scrapeSubjectPage() {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));
    const numFrom = (el) => {
      const m = el?.textContent?.match(/(\d[\d,]*)/);
      return m ? parseInt(m[1].replace(/,/g, ''), 10) : 0;
    };

    if (!$('#bangumiInfo')) throw new Error('未找到条目信息，请确认已在条目页');

    // 条目 ID
    const id = parseSubjectId();

    // 条目类型（从标签区链接前缀推断）
    // .subject_tag_section 包含所有标签（含 #user_tags 里 display:none 的溢出部分）
    let type = 0;
    const firstTagHref = $('.subject_tag_section a[href*="/tag/"]')?.getAttribute('href') || '';
    const typeMap = { '/anime/': 2, '/book/': 1, '/music/': 3, '/game/': 4, '/real/': 6 };
    for (const [prefix, t] of Object.entries(typeMap)) {
      if (firstTagHref.startsWith(prefix)) { type = t; break; }
    }

    // 标题
    const titleEl = $('h1.nameSingle a');
    const name = titleEl?.textContent?.trim() || '';
    const name_cn = titleEl?.getAttribute('title') || '';

    // 媒体形式（TV / OVA / Movie…）
    const platform = $('h1.nameSingle small.grey')?.textContent?.trim() || '';

    // 封面（升级到 800px，保留原始 400px 作备份）
    const rawCover = $('a.thickbox.cover img')?.getAttribute('src') || '';
    const cover = rawCover
      ? (rawCover.startsWith('//') ? 'https:' + rawCover : rawCover)
      : '';
    const cover800 = cover.replace('/r/400/', '/r/800/');
    const images = cover ? { large: cover800, medium: cover } : null;

    // infobox → API 兼容格式 [{ key, value }]
    const infobox = $$('#infobox li').map(li => {
      const tip = li.querySelector('span.tip');
      const key = tip?.textContent?.replace(':', '').trim() || '';
      const value = li.textContent.replace(tip?.textContent || '', '').trim();
      return key ? { key, value } : null;
    }).filter(Boolean);

    const infoMap = Object.fromEntries(infobox.map(i => [i.key, i.value]));
    const date = infoMap['放送开始'] || infoMap['发售日'] || infoMap['开始'] || infoMap['出版年份'] || '';
    const eps = parseInt(infoMap['话数'] || infoMap['集数'] || infoMap['册数'] || '0', 10) || 0;

    // 评分
    const score = parseFloat($('span[property="v:average"]')?.textContent) || 0;
    const total = parseInt($('[property="v:votes"]')?.textContent, 10) || 0;
    const rankText = $('.global_score small.alarm')?.textContent?.trim() || '';
    const rank = parseInt(rankText.replace('#', ''), 10) || undefined;

    // 标签（.subject_tag_section 下所有 /tag/ 链接，含 #user_tags 隐藏溢出部分）
    const tags = $$('.subject_tag_section a[href*="/tag/"]').map(a => ({
      name: a.querySelector('span')?.textContent?.trim() || '',
      count: parseInt(a.querySelector('small')?.textContent, 10) || 0,
    })).filter(t => t.name);

    // 简介
    const summary = $('#subject_summary')?.textContent?.trim() || '';

    // 收藏统计
    const collection = {
      wish:    numFrom($('a[href*="/wishes"]')),
      doing:   numFrom($('a[href*="/doings"]')),
      collect: numFrom($('a[href*="/collections"]')),
      on_hold: numFrom($('a[href*="/on_hold"]')),
      dropped: numFrom($('a[href*="/dropped"]')),
    };

    return { id, name, name_cn, type, platform, date, eps, images, infobox, tags, summary, rating: { score, total, rank }, collection };
  }

  // ========================================================================
  // 网络与图片
  // ========================================================================

  function loadImageRaw(src, useCORS) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (useCORS) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`图片加载失败：${src}`));
      img.src = src;
    });
  }

  // 先尝试 crossOrigin，失败则不带 crossOrigin 再试（canvas 会 taint，但至少能渲染）
  function loadImage(src, opts = {}) {
    const wantCORS = !!opts.crossOrigin;
    const attempt = (cors) => new Promise((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      img.onload = () => {
        try { img.decode ? img.decode().then(() => resolve(img)).catch(() => resolve(img)) : resolve(img); }
        catch (_) { resolve(img); }
      };
      img.onerror = () => reject(new Error(`图片加载失败：${src}`));
      img.src = src;
    });

    if (!wantCORS) return attempt(false);

    return attempt(true).catch(() => attempt(false));
  }

  function makeQRImage(url) {
    const qrUrl = `${QR_SERVICE}?size=240x240&data=${encodeURIComponent(url)}&color=000000&bgcolor=ffffff`;
    return loadImage(qrUrl, { crossOrigin: 'anonymous' });
  }

  function loadLogoImage() {
    return loadImage(logoUrl(), { crossOrigin: 'anonymous' }).catch(() => null);
  }

  // ========================================================================
  // Canvas 绘制
  // ========================================================================

  // ctx.filter 在 iOS Safari/Chrome 静默无效——用 1x1 canvas 实测像素是否变暗来检测
  let _filterSupported = null;
  function canvasFilterSupported() {
    if (_filterSupported !== null) return _filterSupported;
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, 1, 1);
      x.filter = 'brightness(0)';
      x.fillRect(0, 0, 1, 1);
      _filterSupported = x.getImageData(0, 0, 1, 1).data[0] === 0;
    } catch (_) {
      _filterSupported = false;
    }
    return _filterSupported;
  }

  // 多次降采样模拟 blur：每次 1/4 缩放，连做 3 次使细节彻底消失，再压暗
  function drawBlurredBackground(ctx, img, w, h) {
    const passes = 3;
    let src = img;
    let cur = null;
    for (let i = 0; i < passes; i++) {
      const prev = cur;
      cur = document.createElement('canvas');
      cur.width = Math.max(1, Math.round((prev ? prev.width : w) * 0.25));
      cur.height = Math.max(1, Math.round((prev ? prev.height : h) * 0.25));
      const cx = cur.getContext('2d');
      if (i === 0) {
        const ratio = Math.max(cur.width / img.naturalWidth, cur.height / img.naturalHeight);
        const sw = img.naturalWidth * ratio, sh = img.naturalHeight * ratio;
        cx.drawImage(img, (cur.width - sw) / 2, (cur.height - sh) / 2, sw, sh);
      } else {
        cx.drawImage(prev, 0, 0, cur.width, cur.height);
      }
    }
    ctx.drawImage(cur, 0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, w, h);
  }

  function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = LAYOUT.w * LAYOUT.dpr;
    canvas.height = LAYOUT.h * LAYOUT.dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(LAYOUT.dpr, LAYOUT.dpr);
    return { canvas, ctx };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r, fill) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  function clipRoundRect(ctx, x, y, w, h, r) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.clip();
  }

  // 等比裁剪绘制（object-fit: cover）：居中裁掉多余部分，避免方形专辑封面被拉伸
  function drawImageCover(ctx, img, dx, dy, dw, dh) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) { ctx.drawImage(img, dx, dy, dw, dh); return; }
    const scale = Math.max(dw / iw, dh / ih);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (iw - sw) / 2;
    const sy = (ih - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  // 竖向柔和渐变分割线（两端淡出），对应设计稿里的 soft-divider
  function drawVDivider(ctx, x, y, h, alpha, solidStart = 0.2, solidEnd = 0.8) {
    const grd = ctx.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(solidStart, `rgba(255,255,255,${alpha})`);
    grd.addColorStop(solidEnd, `rgba(255,255,255,${alpha})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.fillStyle = grd;
    ctx.fillRect(x, y, 1, h);
    ctx.restore();
  }

  function drawText(ctx, text, x, y, opts = {}) {
    const {
      font = `12px ${FONT_STACK.cn}`,
      color = LAYOUT.colors.textMain,
      maxWidth = Infinity,
      lineHeight = 16,
      maxLines = 1,
      align = 'left',
      baseline = 'top',
    } = opts;
    ctx.save();
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;

    if (maxLines === 1 && maxWidth !== Infinity) {
      let str = String(text);
      let width = ctx.measureText(str).width;
      if (width <= maxWidth) {
        ctx.fillText(str, x, y);
        ctx.restore();
        return;
      }
      while (str.length > 1 && width > maxWidth) {
        str = str.slice(0, -1);
        width = ctx.measureText(str + '…').width;
      }
      ctx.fillText(str + '…', x, y);
      ctx.restore();
      return;
    }

    if (maxLines > 1 && maxWidth !== Infinity) {
      const paragraphs = String(text).split('\n');
      const ell = '…';
      let lineY = y;
      let linesDrawn = 0;
      for (let p = 0; p < paragraphs.length && linesDrawn < maxLines; p++) {
        let remaining = paragraphs[p];
        while (remaining.length && linesDrawn < maxLines) {
          let len = remaining.length;
          while (len > 0 && ctx.measureText(remaining.slice(0, len)).width > maxWidth) len--;
          if (len === 0) len = 1;
          let line = remaining.slice(0, len);
          remaining = remaining.slice(len).replace(/^\s+/, '');
          const hasMore = remaining.length > 0 || p < paragraphs.length - 1;
          if (linesDrawn === maxLines - 1 && hasMore) {
            let t = line;
            while (t.length && ctx.measureText(t + ell).width > maxWidth) t = t.slice(0, -1);
            line = t + ell;
          }
          ctx.fillText(line, x, lineY);
          lineY += lineHeight;
          linesDrawn++;
        }
      }
      ctx.restore();
      return;
    }

    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function measureTextHeight(ctx, text, maxWidth, lineHeight, maxLines) {
    const paragraphs = String(text).split('\n');
    let lines = 0;
    for (const para of paragraphs) {
      let remaining = para;
      while (remaining.length && lines < maxLines) {
        let len = remaining.length;
        while (len > 0 && ctx.measureText(remaining.slice(0, len)).width > maxWidth) len--;
        if (len === 0) len = 1;
        lines++;
        remaining = remaining.slice(len).trimStart();
      }
    }
    return lines * lineHeight;
  }

  // ========================================================================
  // 主渲染
  // ========================================================================

  function prepareData(raw) {
    const posterUrl = pickPosterUrl(raw.images);
    const titleZh = (raw.name_cn || raw.name || '').trim();
    const titleJa = raw.name_cn ? raw.name : '';
    const releaseDate = raw.date || '';
    const mediaType = mediaLabel(raw.type, raw.platform);
    const episodes = raw.eps || raw.total_episodes || 0;

    const staff = pickStaff(raw.infobox, raw.type);
    const staff1 = staff[0] || { key: '作者', value: '' };
    const staff2 = staff[1] || { key: '出版社', value: '' };

    const score = raw.rating?.score ?? 0;
    const scoreCount = raw.rating?.total ?? 0;
    const rank = raw.rating?.rank;

    const tags = (raw.tags || []).slice(0, 6).map(t => t.name);
    const summary = processSummary(raw.summary || '');

    const collWish = raw.collection?.wish ?? 0;
    const collDoing = raw.collection?.doing ?? 0;
    const collDone = raw.collection?.collect ?? 0;

    return {
      id: raw.id,
      type: raw.type,
      posterUrl,
      titleZh,
      titleJa,
      releaseDate,
      mediaType,
      episodes,
      staff1,
      staff2,
      score,
      scoreCount,
      rank,
      tags,
      summary,
      collWish,
      collDoing,
      collDone,
    };
  }

  async function renderCard(rawData, posterImg, qrImg, logoImg, opts = {}) {
    await document.fonts.ready;

    const data = prepareData(rawData);
    const { canvas, ctx } = createCanvas();
    const tainted = opts.tainted || !posterImg;

    // 1. 背景
    ctx.save();
    if (!tainted && posterImg) {
      ctx.fillStyle = LAYOUT.colors.bg;
      ctx.fillRect(0, 0, LAYOUT.w, LAYOUT.h);
      const blur = 40;
      if (canvasFilterSupported()) {
        ctx.filter = `blur(${blur}px) brightness(0.42)`;
        drawImageCover(ctx, posterImg, -blur, -blur, LAYOUT.w + blur * 2, LAYOUT.h + blur * 2);
        ctx.filter = 'none';
      } else {
        // iOS Safari/Chrome：ctx.filter 静默无效，用 stackBlur 降级
        drawBlurredBackground(ctx, posterImg, LAYOUT.w, LAYOUT.h, blur);
      }
    } else {
      const grd = ctx.createLinearGradient(0, 0, LAYOUT.w, LAYOUT.h);
      grd.addColorStop(0, LAYOUT.colors.fallbackGradient[0]);
      grd.addColorStop(0.45, LAYOUT.colors.fallbackGradient[1]);
      grd.addColorStop(1, LAYOUT.colors.fallbackGradient[2]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, LAYOUT.w, LAYOUT.h);
    }
    ctx.restore();

    // 2. 暗色遮罩
    const overlay = ctx.createRadialGradient(LAYOUT.w / 2, 0, 0, LAYOUT.w / 2, LAYOUT.h / 2, LAYOUT.h);
    overlay.addColorStop(0, 'rgba(0,0,0,0.18)');
    overlay.addColorStop(0.65, 'rgba(0,0,0,0.52)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, LAYOUT.w, LAYOUT.h);

    // 3. 海报（带阴影与圆角）
    if (!tainted && posterImg) {
      ctx.save();
      // 先画阴影：用圆角矩形路径开启阴影
      ctx.shadowColor = LAYOUT.poster.shadowColor;
      ctx.shadowBlur = LAYOUT.poster.shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = LAYOUT.poster.shadowY;
      roundRectPath(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      // 再绘制图片并裁剪为圆角（cover 等比裁剪，方形专辑封面不会被拉伸）
      clipRoundRect(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      drawImageCover(ctx, posterImg, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h);
      ctx.restore();
    } else {
      ctx.save();
      fillRoundRect(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius, 'rgba(255,255,255,0.06)');
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 4]);
      roundRectPath(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `12px ${FONT_STACK.cn}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('海报加载失败', LAYOUT.poster.x + LAYOUT.poster.w / 2, LAYOUT.poster.y + LAYOUT.poster.h / 2);
      ctx.restore();
    }

    // 4. 标题（中日文都最多两行，溢出省略号）
    const titleFontSize = data.titleZh.length > 16 ? LAYOUT.title.mainSizeLong : LAYOUT.title.mainSize;
    const zhFont = `800 ${titleFontSize}px ${FONT_STACK.cn}`;
    const zhLineH = titleFontSize * LAYOUT.title.lineHeight;
    // 实测中文标题占用几行（最多 2 行），据此决定日文标题位置与可用行数
    ctx.font = zhFont;
    const zhLines = Math.max(1, Math.min(2,
      Math.round(measureTextHeight(ctx, data.titleZh, LAYOUT.title.maxW, zhLineH, 2) / zhLineH)));
    drawText(ctx, data.titleZh, LAYOUT.title.x, LAYOUT.title.y, {
      font: zhFont,
      color: LAYOUT.colors.textMain,
      maxWidth: LAYOUT.title.maxW,
      lineHeight: zhLineH,
      maxLines: 2,
    });
    if (data.titleJa) {
      // 中文占满两行时日文留 1 行，否则日文可占 2 行（保证整体不压到下方信息）
      const jaMaxLines = zhLines >= 2 ? 1 : 2;
      const subLineH = LAYOUT.title.subSize * 1.35;
      const subY = LAYOUT.title.y + zhLineH * zhLines + 8;
      drawText(ctx, data.titleJa, LAYOUT.title.x, subY, {
        font: `400 ${LAYOUT.title.subSize}px ${FONT_STACK.ja}`,
        color: LAYOUT.colors.textSub,
        maxWidth: LAYOUT.title.maxW,
        lineHeight: subLineH,
        maxLines: jaMaxLines,
      });
    }

    // 6. 收藏数度量（先算，用来约束 Meta 的最大宽度并让分割线居中）
    const collLabels = collectionLabels(data.type);
    const collItems = [
      { num: fmtCount(data.collWish), label: collLabels.wish, color: LAYOUT.colors.textMain },
      { num: fmtCount(data.collDoing), label: collLabels.doing, color: LAYOUT.colors.accent },
      { num: fmtCount(data.collDone), label: collLabels.done, color: LAYOUT.colors.textMain },
    ];
    // 比内容边缘再内收一点：右对齐 CJK 文字侧边间距小，贴着边缘观感发紧
    const contentRight = LAYOUT.w - 50;
    ctx.font = `700 ${LAYOUT.coll.size}px ${FONT_STACK.mono}`;
    let maxNumW = 0;
    collItems.forEach(it => { maxNumW = Math.max(maxNumW, ctx.measureText(it.num).width); });
    ctx.font = `400 ${LAYOUT.coll.labelSize}px ${FONT_STACK.cn}`;
    let maxLabelW = 0;
    collItems.forEach(it => { maxLabelW = Math.max(maxLabelW, ctx.measureText(it.label).width); });
    const labelColRight = contentRight;
    const numColRight = contentRight - maxLabelW - 6;
    const collLeft = numColRight - maxNumW;

    // 5. Meta 信息（值过长时省略号截断：如多导演条目「猫和老鼠」，避免压到分割线/收藏区）
    const metaLines = [
      { strong: data.releaseDate, rest: ' 发售' },
      { strong: data.mediaType, rest: (data.episodes ? ` · ${data.episodes} 话` : '') },
      data.staff1.value ? { strong: data.staff1.key, rest: ` / ${data.staff1.value}` } : null,
      data.staff2.value ? { strong: data.staff2.key, rest: ` / ${data.staff2.value}` } : null,
    ].filter(Boolean);

    const metaMaxW = collLeft - LAYOUT.meta.x - 24; // 给分割线留出空间
    let maxMetaW = 0;
    metaLines.forEach((line, i) => {
      const y = LAYOUT.meta.y + i * LAYOUT.meta.lineHeight;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `600 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      const sw = ctx.measureText(line.strong).width;
      ctx.fillStyle = LAYOUT.colors.textMain;
      ctx.fillText(line.strong, LAYOUT.meta.x, y);
      // 值部分按可用宽度截断
      ctx.font = `400 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      let val = line.rest;
      let rw = ctx.measureText(val).width;
      if (sw + rw > metaMaxW) {
        const ell = '…';
        const avail = metaMaxW - sw;
        while (val.length && ctx.measureText(val + ell).width > avail) val = val.slice(0, -1);
        val += ell;
        rw = ctx.measureText(val).width;
      }
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.fillText(val, LAYOUT.meta.x + sw, y);
      maxMetaW = Math.max(maxMetaW, sw + rw);
    });
    const metaRight = LAYOUT.meta.x + maxMetaW;

    // 6b. 绘制收藏数（数字一列、标签一列各自右对齐）
    collItems.forEach((item, i) => {
      const y = LAYOUT.coll.y + i * LAYOUT.coll.lineHeight;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = `700 ${LAYOUT.coll.size}px ${FONT_STACK.mono}`;
      ctx.fillStyle = item.color;
      ctx.fillText(item.num, numColRight, y);
      ctx.font = `400 ${LAYOUT.coll.labelSize}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.fillText(item.label, labelColRight, y + 2);
    });

    // 分割线 1：落在 Meta 区与收藏区之间的正中
    let divider1X = Math.round((metaRight + collLeft) / 2);
    const d1lo = metaRight + 8, d1hi = collLeft - 8;
    divider1X = d1lo <= d1hi ? Math.max(d1lo, Math.min(divider1X, d1hi)) : d1hi;
    drawVDivider(ctx, divider1X, LAYOUT.divider1.y, LAYOUT.divider1.h, LAYOUT.divider1.alpha, LAYOUT.divider1.solidStart, LAYOUT.divider1.solidEnd);

    // 7. 评分面板
    fillRoundRect(ctx, LAYOUT.rating.x, LAYOUT.rating.y, LAYOUT.rating.w, LAYOUT.rating.h, LAYOUT.rating.radius, LAYOUT.colors.panelBg);
    ctx.save();
    roundRectPath(ctx, LAYOUT.rating.x, LAYOUT.rating.y, LAYOUT.rating.w, LAYOUT.rating.h, LAYOUT.rating.radius);
    ctx.strokeStyle = LAYOUT.colors.panelBorder;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 分数与评分元信息整体在面板内垂直居中（对齐设计稿的 align-items: center）
    const panelCenterY = LAYOUT.rating.y + LAYOUT.rating.h / 2;

    // 分数：拆成 整数 / 小数点 / 小数，把小数点左右收紧（等宽字体下点离数字太远）
    ctx.font = `800 ${LAYOUT.rating.scoreSize}px ${FONT_STACK.mono}`;
    ctx.fillStyle = LAYOUT.colors.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const scoreStr = data.score ? data.score.toFixed(1) : '0.0';
    const [scoreInt, scoreDec] = scoreStr.split('.');
    const kern = LAYOUT.rating.scoreSize * 0.09; // 约等于设计稿里的 -0.09em
    let sx = LAYOUT.rating.x + 18;
    ctx.fillText(scoreInt, sx, panelCenterY);
    sx += ctx.measureText(scoreInt).width - kern;
    ctx.fillText('.', sx, panelCenterY);
    sx += ctx.measureText('.').width - kern;
    ctx.fillText(scoreDec, sx, panelCenterY);
    sx += ctx.measureText(scoreDec).width;

    // 星星 / 评分人数 / RANK：整列同样在面板内垂直居中，与分数共用中线
    const metaX = sx + 16;
    const metaRows = ['stars', 'count'];
    if (data.rank) metaRows.push('rank');
    const metaLineH = 18;
    const metaTopCenter = panelCenterY - (metaRows.length - 1) * metaLineH / 2;
    metaRows.forEach((kind, i) => {
      const cy = metaTopCenter + i * metaLineH;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      if (kind === 'stars') {
        drawStars(ctx, data.score, metaX, cy, LAYOUT.rating.starsSize, LAYOUT.colors.accent);
      } else if (kind === 'count') {
        ctx.font = `${LAYOUT.rating.countSize}px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.fillText(`${fmtCount(data.scoreCount)} 人评分`, metaX, cy);
      } else {
        ctx.font = `${LAYOUT.rating.countSize}px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.fillText('RANK ', metaX, cy);
        const pre = ctx.measureText('RANK ').width;
        ctx.font = `600 ${LAYOUT.rating.countSize}px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textMain;
        ctx.fillText(`#${data.rank}`, metaX + pre, cy);
      }
    });

    // 评分区实际宽度 → 动态决定分割线与标签起点（等宽布局下星星/人数比固定坐标更宽，
    // 固定 tags.x 会和星星、人数重叠；这里按真实内容宽度排版，对齐设计稿的 flex 行为）
    const starsW = starsWidth(LAYOUT.rating.starsSize);
    ctx.font = `${LAYOUT.rating.countSize}px ${FONT_STACK.cn}`;
    const countW = ctx.measureText(`${fmtCount(data.scoreCount)} 人评分`).width;
    let rankW = 0;
    if (data.rank) {
      const pre = ctx.measureText('RANK ').width;
      ctx.font = `600 ${LAYOUT.rating.countSize}px ${FONT_STACK.cn}`;
      rankW = pre + ctx.measureText(`#${data.rank}`).width;
    }
    const metaColW = Math.max(starsW, countW, rankW);

    const panelRight = LAYOUT.rating.x + LAYOUT.rating.w;
    const minTagsW = 150; // 给标签至少留出的宽度，避免分数过宽时标签被挤没
    let dividerX = Math.round(metaX + metaColW + 18);
    dividerX = Math.min(dividerX, panelRight - 18 - minTagsW);
    drawVDivider(ctx, dividerX, LAYOUT.divider2.y, LAYOUT.divider2.h, LAYOUT.divider2.alpha, LAYOUT.divider2.solidStart, LAYOUT.divider2.solidEnd);

    // 8. Tags：先在「分割线 → 毛玻璃右边界」之间排版成最多两行，
    //    再让整组标签在该区域内水平居中、垂直居中（行与行之间仍左对齐）
    const tagAreaL = dividerX + 18;
    const tagAreaR = panelRight - 18;
    const tagsMaxW = tagAreaR - tagAreaL;
    const th = LAYOUT.tags.pillH;
    const tagGap = LAYOUT.tags.gap;
    const maxTagRows = 2;

    ctx.font = `500 ${LAYOUT.tags.pillSize}px ${FONT_STACK.cn}`;
    const tagRows = [[]];
    let rowW = 0;
    for (const tag of data.tags) {
      const tw = ctx.measureText(tag).width + LAYOUT.tags.pillPadX * 2;
      const cur = tagRows[tagRows.length - 1];
      const need = (cur.length ? tagGap : 0) + tw;
      if (rowW + need > tagsMaxW && cur.length) {
        if (tagRows.length >= maxTagRows) break;
        tagRows.push([]);
        rowW = 0;
      }
      const row = tagRows[tagRows.length - 1];
      row.push({ tag, tw });
      rowW += (row.length > 1 ? tagGap : 0) + tw;
    }

    // 整组以「最宽一行」为基准居中，各行左对齐到同一左边界
    const rowWidth = (row) => row.reduce((w, t, i) => w + t.tw + (i ? tagGap : 0), 0);
    const tagsBlockW = Math.max(...tagRows.map(rowWidth));
    const tagsLeft = tagAreaL + Math.max(0, (tagsMaxW - tagsBlockW) / 2);

    const tagsBlockH = tagRows.length * th + (tagRows.length - 1) * tagGap;
    let rowY = LAYOUT.rating.y + (LAYOUT.rating.h - tagsBlockH) / 2;
    ctx.textBaseline = 'middle';
    for (const row of tagRows) {
      let rx = tagsLeft;
      for (const { tag, tw } of row) {
        fillRoundRect(ctx, rx, rowY, tw, th, th / 2, LAYOUT.colors.tagBg);
        ctx.save();
        roundRectPath(ctx, rx, rowY, tw, th, th / 2);
        ctx.strokeStyle = LAYOUT.colors.tagBorder;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
        ctx.font = `500 ${LAYOUT.tags.pillSize}px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.tagText;
        ctx.textAlign = 'center';
        ctx.fillText(tag, rx + tw / 2, rowY + th / 2 + 1);
        rx += tw + tagGap;
      }
      rowY += th + tagGap;
    }

    // 9. 简介
    if (data.summary) {
      drawText(ctx, data.summary, LAYOUT.summary.x, LAYOUT.summary.y, {
        font: `400 ${LAYOUT.summary.size}px ${FONT_STACK.cn}`,
        color: 'rgba(245,245,247,0.70)',
        maxWidth: LAYOUT.summary.w,
        lineHeight: LAYOUT.summary.lineHeight,
        maxLines: LAYOUT.summary.maxLines,
      });
    }

    // 10. Footer
    ctx.fillStyle = LAYOUT.colors.footerBg;
    ctx.fillRect(LAYOUT.footer.x, LAYOUT.footer.y, LAYOUT.footer.w, LAYOUT.footer.h);

    // QR（qrY/tipY 为相对 footer 顶部的偏移，必须叠加 footer.y）
    const qrAbsY = LAYOUT.footer.y + LAYOUT.footer.qrY;
    ctx.save();
    clipRoundRect(ctx, LAYOUT.footer.qrX, qrAbsY, LAYOUT.footer.qrSize, LAYOUT.footer.qrSize, LAYOUT.footer.qrRadius);
    ctx.fillStyle = '#fff';
    ctx.fillRect(LAYOUT.footer.qrX, qrAbsY, LAYOUT.footer.qrSize, LAYOUT.footer.qrSize);
    if (qrImg) {
      // 白色圆角底不变，二维码本身留更大内边距，方形码与圆角底更协调
      const qrPad = 11;
      ctx.drawImage(qrImg, LAYOUT.footer.qrX + qrPad, qrAbsY + qrPad, LAYOUT.footer.qrSize - qrPad * 2, LAYOUT.footer.qrSize - qrPad * 2);
    }
    ctx.restore();

    // QR 提示文字
    const tipAbsY = LAYOUT.footer.y + LAYOUT.footer.tipY;
    drawText(ctx, '扫码查看条目', LAYOUT.footer.tipX, tipAbsY, {
      font: `700 14px ${FONT_STACK.cn}`,
      color: LAYOUT.colors.footerDark,
    });
    drawText(ctx, `bgm.tv/subject/${data.id}`, LAYOUT.footer.tipX, tipAbsY + 20, {
      font: `12px ${FONT_STACK.mono}`,
      color: LAYOUT.colors.footerText,
    });

    // Logo
    if (logoImg) {
      const lr = LAYOUT.footer.logoW / logoImg.naturalWidth;
      const drawH = logoImg.naturalHeight * lr;
      const drawY = LAYOUT.footer.y + (LAYOUT.footer.h - drawH) / 2;
      ctx.drawImage(logoImg, LAYOUT.footer.logoX, drawY, LAYOUT.footer.logoW, drawH);
    } else {
      ctx.save();
      ctx.fillStyle = LAYOUT.colors.footerDark;
      ctx.font = `900 20px ${FONT_STACK.cn}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('bangumi', LAYOUT.footer.logoX + LAYOUT.footer.logoW - 18, LAYOUT.footer.y + LAYOUT.footer.h / 2);
      const dotX = LAYOUT.footer.logoX + LAYOUT.footer.logoW - 16;
      ctx.fillStyle = LAYOUT.colors.accent;
      ctx.beginPath();
      ctx.arc(dotX, LAYOUT.footer.y + LAYOUT.footer.h / 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = LAYOUT.colors.footerDark;
      ctx.fillText('.tv', LAYOUT.footer.logoX + LAYOUT.footer.logoW, LAYOUT.footer.y + LAYOUT.footer.h / 2);
      ctx.restore();
    }

    return canvas;
  }

  // ========================================================================
  // 导出
  // ========================================================================

  function exportPNG(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error('生成 PNG 失败'));
          resolve(blob);
        }, 'image/png');
      } catch (e) {
        // canvas 被污染（SecurityError）时 toBlob 会同步抛异常
        reject(e);
      }
    });
  }

  // dataURL → Blob 转换，用于 toBlob 不可用时降级
  function dataURLToBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(data);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function exportPNGFallback(canvas) {
    try {
      const dataUrl = canvas.toDataURL('image/png');
      return Promise.resolve(dataURLToBlob(dataUrl));
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function isIOS() {
    return /iphone|ipad|ipod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    if (isIOS()) {
      // iOS Chrome / Safari 不支持 <a download>：用 window.open 打开图片，用户长按保存
      window.open(url, '_blank');
      // 延迟释放，否则新 tab 还没打开就被撤销
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  async function copyToClipboard(blob) {
    if (!navigator.clipboard || !navigator.clipboard.write) {
      throw new Error('浏览器不支持复制图片');
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
    } catch (e) {
      throw new Error('复制失败：' + (e.message || e));
    }
  }

  // ========================================================================
  // 主流程
  // ========================================================================

  async function generateShareCard(opts = {}) {
    const id = opts.id || parseSubjectId();
    if (!id) throw new Error('未能识别条目 ID');
    if (!isAllowedHost()) throw new Error('当前站点不在支持列表');

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const data = scrapeSubjectPage();

    const [posterImg, qrImg, logoImg] = await Promise.all([
      data.images ? loadImage(pickPosterUrl(data.images), { crossOrigin: 'anonymous' }).catch(err => {
        console.warn('[share-card] 海报加载失败，使用降级布局', err.message);
        return null;
      }) : Promise.resolve(null),
      makeQRImage(subjectPageUrl(id)).catch(err => {
        console.warn('[share-card] QR 加载失败', err.message);
        return null;
      }),
      loadLogoImage(),
    ]);

    const canvas = await renderCard(data, posterImg, qrImg, logoImg, {
      tainted: !posterImg,
    });

    // toBlob 在 canvas 被污染（SecurityError）时抛异常；自动降级 toDataURL
    let blob;
    try {
      blob = await exportPNG(canvas);
    } catch (secErr) {
      console.warn('[share-card] toBlob 失败，尝试 toDataURL 降级', secErr.message);
      blob = await exportPNGFallback(canvas).catch(e2 => {
        throw new Error('图片导出失败：' + secErr.message);
      });
    }
    return { canvas, blob, id, data };
  }

  // ========================================================================
  // 暴露
  // ========================================================================

  const BgmShareCardCore = {
    LAYOUT,
    FONT_STACK,
    logoUrl,
    parseSubjectId,
    isAllowedHost,
    subjectPageUrl,
    pickPosterUrl,
    normalizeValue,
    pickStaff,
    mediaLabel,
    collectionLabels,
    fmtCount,
    processSummary,
    retry,
    scrapeSubjectPage,
    loadImage,
    makeQRImage,
    loadLogoImage,
    createCanvas,
    roundRectPath,
    fillRoundRect,
    clipRoundRect,
    drawText,
    measureTextHeight,
    prepareData,
    renderCard,
    exportPNG,
    exportPNGFallback,
    dataURLToBlob,
    isIOS,
    download,
    copyToClipboard,
    generateShareCard,
  };

  global.BgmShareCardCore = BgmShareCardCore;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));


// 内联核心代码结束，以下为 UI 层与启动逻辑
(function () {
  'use strict';

  if (typeof BgmShareCardCore === 'undefined') {
    console.error('[bgm-share-card] 核心未加载');
    return;
  }

  const core = BgmShareCardCore;

  function createUI(core) {
  const ns = 'bgm-share-card';

  function ensureStyles() {
    if (document.getElementById(`${ns}-styles`)) return;
    const style = document.createElement('style');
    style.id = `${ns}-styles`;
    style.textContent = `
      .${ns}-trigger { cursor: pointer; }
      .${ns}-ico {
        display: inline-block;
        width: 16px;
        height: 16px;
        vertical-align: -3px;
        background: center / 15px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F09199' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='3'/%3E%3Ccircle cx='8.5' cy='10' r='1.5'/%3E%3Cpath d='M21 16l-5-5L5 20'/%3E%3C/svg%3E");
      }
      .${ns}-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        padding: 3px 10px;
        border-radius: 12px;
        background: rgba(240,145,153,0.12);
        color: #F09199;
        font-size: 12px;
        text-decoration: none;
        cursor: pointer;
        border: 1px solid rgba(240,145,153,0.22);
        transition: background .15s;
      }
      .${ns}-pill:hover { background: rgba(240,145,153,0.22); }
      .${ns}-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        background: rgba(0,0,0,0.78);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        backdrop-filter: blur(4px);
      }
      .${ns}-modal {
        position: relative;
        background: #1a1a1e;
        border-radius: 24px;
        padding: 20px;
        max-width: 420px;
        width: auto;
        max-height: calc(100vh - 48px);
        box-shadow: 0 32px 80px rgba(0,0,0,0.70);
        display: flex;
        flex-direction: column;
        gap: 14px;
        color: #f5f5f7;
        font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      }
      .${ns}-preview {
        align-self: center;
        border-radius: 20px;
        overflow: hidden;
        box-shadow: 0 16px 48px rgba(0,0,0,0.40);
        line-height: 0;
        min-height: 0;
      }
      .${ns}-preview img {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: calc(100vh - 150px);
      }
      .${ns}-actions {
        display: flex;
        justify-content: center;
        gap: 12px;
      }
      .${ns}-btn {
        padding: 10px 20px;
        border-radius: 12px;
        border: none;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: transform .1s;
      }
      .${ns}-btn:hover { transform: translateY(-1px); }
      .${ns}-btn-primary { background: #F09199; color: #1a1a1a; }
      .${ns}-btn-secondary { background: rgba(255,255,255,0.10); color: #f5f5f7; }
      .${ns}-close {
        position: absolute;
        top: 16px;
        right: 16px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255,255,255,0.10);
        color: #f5f5f7;
        border: none;
        font-size: 20px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .${ns}-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 100000;
        padding: 10px 18px;
        border-radius: 12px;
        background: rgba(0,0,0,0.85);
        color: #f5f5f7;
        font-size: 13px;
        pointer-events: none;
        opacity: 0;
        transition: opacity .3s;
      }
      .${ns}-toast.show { opacity: 1; }
      .${ns}-loading {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 100001;
        padding: 10px 16px;
        border-radius: 12px;
        background: rgba(0,0,0,0.80);
        color: #f5f5f7;
        font-size: 13px;
        display: none;
      }
      .${ns}-loading.show { display: block; }
    `;
    document.head.appendChild(style);
  }

  function toast(msg) {
    let el = document.getElementById(`${ns}-toast`);
    if (!el) {
      el = document.createElement('div');
      el.id = `${ns}-toast`;
      el.className = `${ns}-toast`;
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function setLoading(show) {
    let el = document.getElementById(`${ns}-loading`);
    if (!el) {
      el = document.createElement('div');
      el.id = `${ns}-loading`;
      el.className = `${ns}-loading`;
      el.textContent = '生成中…';
      document.body.appendChild(el);
    }
    el.classList.toggle('show', show);
  }

  function showPreview(canvas) {
    const overlay = document.createElement('div');
    overlay.className = `${ns}-overlay`;

    const modal = document.createElement('div');
    modal.className = `${ns}-modal`;

    const preview = document.createElement('div');
    preview.className = `${ns}-preview`;
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.alt = '分享卡片预览';
    preview.appendChild(img);

    const actions = document.createElement('div');
    actions.className = `${ns}-actions`;

    const ios = core.isIOS();

    const downloadBtn = document.createElement('button');
    downloadBtn.className = `${ns}-btn ${ns}-btn-primary`;
    downloadBtn.textContent = ios ? '打开图片' : '下载 PNG';
    if (ios) downloadBtn.title = '在新标签打开后长按图片保存';

    const copyBtn = document.createElement('button');
    copyBtn.className = `${ns}-btn ${ns}-btn-secondary`;
    copyBtn.textContent = ios ? '长按预览图保存' : '复制图片';
    if (ios) {
      copyBtn.title = '长按上方预览图片即可保存';
      copyBtn.style.opacity = '0.6';
      copyBtn.style.cursor = 'default';
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = `${ns}-close`;
    closeBtn.textContent = '×';

    actions.appendChild(downloadBtn);
    if (!ios) actions.appendChild(copyBtn);

    modal.appendChild(closeBtn);
    modal.appendChild(preview);
    if (ios) {
      const hint = document.createElement('p');
      hint.style.cssText = 'margin:0;font-size:11px;color:#a0a0b0;text-align:center;';
      hint.textContent = 'iOS：长按上方预览图片 → 存储到相册';
      modal.appendChild(hint);
    }
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let blob = null;
    core.exportPNG(canvas).catch(() => core.exportPNGFallback(canvas)).then(b => { blob = b; });

    downloadBtn.addEventListener('click', () => {
      if (!blob) return toast('图片尚未生成完毕');
      core.download(blob, `bgm-share-card-${core.parseSubjectId()}.png`);
    });

    if (!ios) {
      copyBtn.addEventListener('click', async () => {
        if (!blob) return toast('图片尚未生成完毕');
        try {
          await core.copyToClipboard(blob);
          toast('已复制到剪贴板');
        } catch (e) {
          toast('复制失败，请使用下载：' + e.message);
        }
      });
    }

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  async function runGenerate() {
    setLoading(true);
    try {
      const { canvas } = await core.generateShareCard();
      showPreview(canvas);
    } catch (err) {
      toast('生成失败：' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function injectButton() {
    if (document.querySelector(`.${ns}-trigger, .${ns}-pill`)) return;

    const shareBtn = document.querySelector('.shareBtn');
    if (shareBtn) {

      const action = document.createElement('span');
      action.className = `action ${ns}-action`;
      const a = document.createElement('a');
      a.className = `icon ${ns}-trigger`;
      a.href = 'javascript:void(0);';
      a.title = '生成分享卡片';
      a.innerHTML = `<span class="ico ${ns}-ico"></span><span class="title">卡片</span>`;
      a.addEventListener('click', (e) => { e.preventDefault(); runGenerate(); });
      action.appendChild(a);

      const firstAction = shareBtn.querySelector('.action');
      if (firstAction) firstAction.after(action);
      else shareBtn.insertBefore(action, shareBtn.firstChild);
      return;
    }

    const panelTitle = document.querySelector('.SidePanel h2');
    if (panelTitle) {
      const btn = document.createElement('a');
      btn.className = `${ns}-pill`;
      btn.href = 'javascript:void(0);';
      btn.textContent = '生成卡片';
      btn.addEventListener('click', (e) => { e.preventDefault(); runGenerate(); });
      panelTitle.appendChild(btn);
    }
  }

  return {
    init() {
      ensureStyles();
      if (core.parseSubjectId()) injectButton();
    },
  };
}

  function start() {
    if (!/\/subject\/\d+/.test(location.pathname)) return;
    if (/^\/m\//.test(location.pathname)) return;
    createUI(core).init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
