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
    return ALLOWED_HOSTS.includes(location.hostname);
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

  function renderStars(score) {
    // 满分 10 → 5 星，按 score/2 就近取整到 0.5 颗（6.6 ≈ 3.5 星）
    const s5 = Math.max(0, Math.min(5, (Number(score) || 0) / 2));
    const half = Math.round(s5 * 2) / 2;
    const full = Math.floor(half);
    const hasHalf = half - full === 0.5;
    const empty = 5 - full - (hasHalf ? 1 : 0);
    return '★'.repeat(full) + (hasHalf ? '⯪' : '') + '☆'.repeat(empty);
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
  // 网络与图片
  // ========================================================================

  async function fetchSubject(id) {
    const url = `${API_BASE}/v0/subjects/${id}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'bgm-share-card/0.1 (personal preview)' },
    });
    if (!res.ok) throw new Error(`条目数据加载失败：HTTP ${res.status}`);
    return res.json();
  }

  function loadImage(src, opts = {}) {
    return retry(async () => {
      const img = new Image();
      if (opts.crossOrigin) img.crossOrigin = opts.crossOrigin;
      img.src = src;
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`图片加载失败：${src}`));
      });
      try { await img.decode(); } catch (e) { /* decode 失败但 onload 成功时仍可用 */ }
      return img;
    }, { retries: 2, delay: 500 });
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
      ctx.filter = `blur(${blur}px) brightness(0.42)`;
      drawImageCover(ctx, posterImg, -blur, -blur, LAYOUT.w + blur * 2, LAYOUT.h + blur * 2);
      ctx.filter = 'none';
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
        ctx.font = `${LAYOUT.rating.starsSize}px ${FONT_STACK.mono}`;
        ctx.fillStyle = LAYOUT.colors.accent;
        ctx.fillText(renderStars(data.score), metaX, cy);
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
    ctx.font = `${LAYOUT.rating.starsSize}px ${FONT_STACK.mono}`;
    const starsW = ctx.measureText(renderStars(data.score)).width;
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
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('生成 PNG 失败'));
        resolve(blob);
      }, 'image/png');
    });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
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

    const data = await retry(() => fetchSubject(id), {
      retries: 3,
      delay: 800,
      onRetry: (err, attempt) => console.warn(`[share-card] 重试 ${attempt}/3`, err.message),
    });

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

    const blob = await exportPNG(canvas);
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
    renderStars,
    processSummary,
    retry,
    fetchSubject,
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
    download,
    copyToClipboard,
    generateShareCard,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BgmShareCardCore;
  } else {
    global.BgmShareCardCore = BgmShareCardCore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
