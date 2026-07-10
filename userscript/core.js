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

  function parseCharacterId() {
    if (typeof location === 'undefined') return null;
    if (/^\/m\//.test(location.pathname)) return null;
    const m = location.pathname.match(/^\/character\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }

  function characterPageUrl(id) {
    if (typeof location === 'undefined') return `https://bgm.tv/character/${id}`;
    return `${location.protocol}//${location.hostname}/character/${id}`;
  }

  function isCharacterPage() {
    if (typeof location === 'undefined') return false;
    return /^\/character\//.test(location.pathname);
  }

  function parsePersonId() {
    if (typeof location === 'undefined') return null;
    if (/^\/m\//.test(location.pathname)) return null;
    const m = location.pathname.match(/^\/person\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }

  function personPageUrl(id) {
    if (typeof location === 'undefined') return `https://bgm.tv/person/${id}`;
    return `${location.protocol}//${location.hostname}/person/${id}`;
  }

  function isPersonPage() {
    if (typeof location === 'undefined') return false;
    return /^\/person\//.test(location.pathname);
  }

  function pickPosterUrl(images) {
    if (!images) return null;
    const preferred = images.medium || images.common || images.large || images.grid || images.small;
    if (!preferred) return null;
    if (/\/r\/\d+\/pic\/cover\//.test(preferred)) return preferred;
    return preferred.replace(/\/pic\/cover\//, '/r/800/pic/cover/');
  }

  function formatCrtUrl(url, size = 800) {
    if (!url) return '';
    const cleanUrl = url.startsWith('//') ? 'https:' + url : url;
    let resolved = cleanUrl;
    if (/\/pic\/crt\/[gms]\//.test(resolved)) {
      resolved = resolved.replace(/\/pic\/crt\/[gms]\//, '/pic/crt/l/');
    }
    if (/\/r\/\d+\/pic\/crt\/l\//.test(resolved)) {
      resolved = resolved.replace(/\/r\/\d+\/pic\/crt\/l\//, `/r/${size}/pic/crt/l/`);
    } else {
      resolved = resolved.replace(/\/pic\/crt\/l\//, `/r/${size}/pic/crt/l/`);
    }
    return resolved;
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
    // 日期来源可能是放送/发售/连载/出版，标签需跟随来源，避免给动画标「发售」
    const DATE_SOURCES = [
      { key: '放送开始', label: '放送' },  // 动画
      { key: '发售日期', label: '发售' },  // 游戏 / 音乐
      { key: '发售日', label: '发售' },    // 书籍单行本
      { key: '开始', label: '开始' },      // 书籍连载 / 三次元开播
    ];
    let date = '';
    let dateLabel = '';
    for (const s of DATE_SOURCES) {
      if (infoMap[s.key]) { date = infoMap[s.key]; dateLabel = s.label; break; }
    }
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

    return { id, name, name_cn, type, platform, date, dateLabel, eps, images, infobox, tags, summary, rating: { score, total, rank }, collection };
  }

  function scrapeCharacterPage() {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    if (!document.querySelector('#infobox') && !document.querySelector('.infobox')) {
      throw new Error('未找到角色信息，请确认已在角色页');
    }

    const id = parseCharacterId();

    const titleEl = $('h1.nameSingle a');
    const name = titleEl?.textContent?.trim() || '';
    const name_cn = titleEl?.getAttribute('title') || $('h1.nameSingle small.grey')?.textContent?.trim() || '';

    const coverEl = $('a.thickbox.cover img') || $('img.cover') || $('.infobox img');
    let rawCover = coverEl?.getAttribute('src') || '';
    if (!rawCover && coverEl) {
      rawCover = coverEl.src || '';
    }
    const cover = rawCover
      ? (rawCover.startsWith('//') ? 'https:' + rawCover : rawCover)
      : '';
    const largeCover = formatCrtUrl(cover, 800);
    const images = cover ? { large: largeCover, medium: cover } : null;

    const infobox = $$('#infobox li').map(li => {
      const tip = li.querySelector('span.tip');
      const key = tip?.textContent?.replace(':', '').trim() || '';
      const value = li.textContent.replace(tip?.textContent || '', '').trim();
      return key ? { key, value } : null;
    }).filter(Boolean);

    const summaryEl = $('#char_contents') || $('.detail');
    const summary = summaryEl?.textContent?.trim() || '';

    const cvs = [];
    const works = [];
    const castList = document.querySelector('ul.browserList.castTypeFilterList');
    if (castList) {
      const lis = Array.from(castList.querySelectorAll(':scope > li'));
      lis.forEach(li => {
        const subjectA = li.querySelector('.innerLeftItem h3 a');
        const subjectName = subjectA ? subjectA.textContent.trim() : '';
        
        const jobBadge = li.querySelector('.badge_job_tip');
        const jobName = jobBadge ? jobBadge.textContent.trim() : '';

        const cvLis = Array.from(li.querySelectorAll('ul.innerRightList li.badge_actor'));
        const workCvs = [];
        cvLis.forEach(cvLi => {
          const cvA = cvLi.querySelector('h3 a');
          const cvName = cvA ? cvA.textContent.trim() : '';
          const cvHref = cvA ? cvA.getAttribute('href') : '';
          const cvId = cvHref ? cvHref.match(/\/person\/(\d+)/)?.[1] : '';
          const cvAvatarImg = cvLi.querySelector('img.avatar');
          const cvAvatar = cvAvatarImg ? cvAvatarImg.getAttribute('src') || cvAvatarImg.src : '';
          
          if (cvName) {
            const resolvedCvAvatar = cvAvatar ? formatCrtUrl(cvAvatar, 200) : '';
            workCvs.push({
              name: cvName,
              id: cvId,
              avatar: resolvedCvAvatar
            });
            if (!cvs.some(c => c.name === cvName)) {
              cvs.push({
                name: cvName,
                id: cvId,
                avatar: resolvedCvAvatar
              });
            }
          }
        });

        if (subjectName) {
          works.push({
            name: subjectName,
            role: jobName,
            cvs: workCvs
          });
        }
      });
    }

    return {
      id,
      name,
      name_cn,
      images,
      infobox,
      summary,
      cvs,
      works
    };
  }

  // 真人（声优/制作/作者等）页抓取。与角色页共享模板，但没有 CV 栏，
  // 作品列表是「本人参与的作品 + 职务」，职务 badge 可能是 .badge_job（原作/脚本…）
  // 或 .badge_job_tip（CV），两者都取。
  function scrapePersonPage() {
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    if (!document.querySelector('#infobox') && !document.querySelector('.infobox')) {
      throw new Error('未找到人物信息，请确认已在人物页');
    }

    const id = parsePersonId();

    const titleEl = $('h1.nameSingle a');
    const name = titleEl?.textContent?.trim() || '';
    const name_cn = titleEl?.getAttribute('title') || $('h1.nameSingle small.grey')?.textContent?.trim() || '';

    const coverEl = $('a.thickbox.cover img') || $('img.cover') || $('.infobox img');
    let rawCover = coverEl?.getAttribute('src') || '';
    if (!rawCover && coverEl) rawCover = coverEl.src || '';
    const cover = rawCover
      ? (rawCover.startsWith('//') ? 'https:' + rawCover : rawCover)
      : '';
    const largeCover = formatCrtUrl(cover, 800);
    const images = cover ? { large: largeCover, medium: cover } : null;

    const infobox = $$('#infobox li').map(li => {
      const tip = li.querySelector('span.tip');
      const key = tip?.textContent?.replace(':', '').trim() || '';
      const value = li.textContent.replace(tip?.textContent || '', '').trim();
      return key ? { key, value } : null;
    }).filter(Boolean);

    const summaryEl = $('#char_contents') || $('.detail');
    const summary = summaryEl?.textContent?.trim() || '';

    const works = [];
    const castList = document.querySelector('ul.browserList.castTypeFilterList');
    if (castList) {
      const lis = Array.from(castList.querySelectorAll(':scope > li'));
      lis.forEach(li => {
        const subjectA = li.querySelector('.innerLeftItem h3 a.l')
          || li.querySelector('.innerLeftItem h3 a')
          || li.querySelector('h3 a.l');
        const subjectName = subjectA ? subjectA.textContent.trim() : '';

        const jobBadge = li.querySelector('.badge_job') || li.querySelector('.badge_job_tip');
        const jobName = jobBadge ? jobBadge.textContent.trim() : '';

        // 声优作品：右侧列出其配演的角色
        const roles = Array.from(li.querySelectorAll('ul.innerRightList h3 a'))
          .map(a => a.textContent.trim()).filter(Boolean);

        if (subjectName) {
          works.push({ name: subjectName, role: jobName, roles });
        }
      });
    }

    return { id, name, name_cn, images, infobox, summary, works };
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

  function createCanvas(w = LAYOUT.w, h = LAYOUT.h) {
    const canvas = document.createElement('canvas');
    canvas.width = w * LAYOUT.dpr;
    canvas.height = h * LAYOUT.dpr;
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

  // 等比裁剪绘制（object-fit: cover）：居中或顶部裁掉多余部分
  function drawImageCover(ctx, img, dx, dy, dw, dh, align = 'center') {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) { ctx.drawImage(img, dx, dy, dw, dh); return; }
    const scale = Math.max(dw / iw, dh / ih);
    const sw = dw / scale;
    const sh = dh / scale;
    const sx = (iw - sw) / 2;
    const sy = align === 'top' ? 0 : (ih - sh) / 2;
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

  // 中文标点避头尾（禁则处理）：
  // NO_LINE_START —— 不允许出现在行首的标点（收尾类，如句号、逗号、右括号）；
  // NO_LINE_END   —— 不允许出现在行末的标点（起头类，如左括号、开引号）。
  const NO_LINE_START = '，。、；：！？）】」』〉》〕｝］,.!?;:)]}…·—’”';
  const NO_LINE_END = '（【「『〈《〔｛［([{“‘';

  // 给定「按宽度贪心切出的字符数 len」，按避头尾规则微调：
  // 1) 行末若是起头类标点，则把它挪到下一行（len--）；
  // 2) 行首（下一行开头）若是收尾类标点，则悬挂到当前行末（len++，最多挂 2 个）。
  function applyKinsoku(str, len) {
    if (len > 1 && NO_LINE_END.includes(str[len - 1])) len--;
    let hang = 0;
    while (len < str.length && hang < 2 && NO_LINE_START.includes(str[len])) {
      len++;
      hang++;
    }
    return len;
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
      kinsoku = false,
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
          // 未到段落末尾时套用避头尾规则，避免标点落在行首 / 行末
          if (kinsoku && len < remaining.length) len = applyKinsoku(remaining, len);
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
    const releaseLabel = raw.dateLabel || '发售';
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
      releaseLabel,
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

  function prepareCharacterData(raw) {
    const titleZh = (raw.name_cn || raw.name || '').trim();
    const titleJa = raw.name_cn ? raw.name : '';
    const summary = processSummary(raw.summary || '');

    // CV details: support multiple CVs in name, first CV for avatar
    const cvName = (raw.cvs || []).map(c => c.name).filter(Boolean).join(' / ');
    const primaryCv = raw.cvs?.[0] || null;
    const cvAvatar = primaryCv?.avatar || '';

    // Featured Work
    const featuredWork = raw.works?.find(w => w.role === '主角') || raw.works?.[0] || null;

    // Filter and prioritize infobox keys
    const PRIORITY_KEYS = [
      '性别', '性別',
      '生日',
      '年龄', '年齢',
      '血型',
      '身高',
      '体重',
      'BWH', '三围', '三圍',
      '星座',
      '种族', '種族',
      '职业', '職業',
      '兴趣', '趣味',
      '出身地', '出生地',
      '身份', '身份'
    ];
    const EXCLUDE_KEYS = [
      '简体中文名',
      '别名',
      '英文名',
      '日文名',
      '引用来源',
      '姓名',
      'CV',
      '声优'
    ];

    const filteredInfobox = (raw.infobox || []).filter(item => {
      return item && item.key && !EXCLUDE_KEYS.includes(item.key);
    });

    filteredInfobox.sort((a, b) => {
      const idxA = PRIORITY_KEYS.indexOf(a.key);
      const idxB = PRIORITY_KEYS.indexOf(b.key);
      const hasA = idxA !== -1;
      const hasB = idxB !== -1;
      if (hasA && hasB) return idxA - idxB;
      if (hasA) return -1;
      if (hasB) return 1;
      return 0;
    });

    const metaLines = [];
    for (const item of filteredInfobox) {
      if (metaLines.length >= 4) break;
      const key = item.key;
      const value = normalizeValue(item.value);
      if (!key || !value) continue;
      if (value.length > 30) continue;
      metaLines.push({ key, value });
    }

    return {
      id: raw.id,
      titleZh,
      titleJa,
      summary,
      cvName,
      cvAvatar,
      cvs: raw.cvs || [],
      featuredWork,
      works: raw.works || [],
      metaLines
    };
  }

  function preparePersonData(raw) {
    const titleZh = (raw.name_cn || raw.name || '').trim();
    const titleJa = raw.name_cn ? raw.name : '';
    const summary = processSummary(raw.summary || '');

    // 优先级与排除项按 bangumi archive 中真人 infobox 键频率统计得出：
    // 高频有意义字段优先，社交链接类与命名别名类一律排除（它们不适合占 meta 行）。
    // 优先级键按 bangumi archive 中真人 infobox 键频率统计排序，含常见变体。
    const PRIORITY_KEYS = [
      '性别', '性別',
      '生日',
      '卒日',
      '出生地', '出身地', '出身', '籍贯',
      '国籍',
      '血型',
      '身高', '体重',
      'BWH', '三围', '三圍',
      '职业', '職業',
      '事务所', '事務所', '经纪公司', '經紀公司', '唱片公司', '所属公司', '所属',
      '出道时间',
      '活跃年代',
      '星座',
      '教育程度',
      '配偶',
      '语言',
    ];
    // 命名别名类 + 明确的链接类键。链接字段种类繁多（事务所资料页/官网/HP/
    // FanClub…），无法穷举，故再叠加下方「值是 URL 则跳过」的兜底。
    const EXCLUDE_KEYS = [
      '简体中文名', '别名', '英文名', '日文名', '第二中文名',
      '罗马字', '纯假名', '昵称', '其他名义', '姓名',
      '引用来源',
      'Twitter', 'twitter', '推特', 'X', '链接', 'HP', 'Pixiv', 'pixiv',
      'Instagram', '微博', 'weibo', '官网', '官方网站', '官方站点', '主页',
      'Blog', 'blog', 'Website', 'imdb_id', 'bilibili', 'Facebook',
      'YouTube', 'niconico', '网站', 'FanClub',
    ];
    const isLinkKey = (k) => /资料页|资料|页面|主页|官网|官方|网站|site|web|link|HP|blog/i.test(k);

    const filteredInfobox = (raw.infobox || []).filter(item => {
      return item && item.key && !EXCLUDE_KEYS.includes(item.key) && !isLinkKey(item.key);
    });

    filteredInfobox.sort((a, b) => {
      const idxA = PRIORITY_KEYS.indexOf(a.key);
      const idxB = PRIORITY_KEYS.indexOf(b.key);
      const hasA = idxA !== -1;
      const hasB = idxB !== -1;
      if (hasA && hasB) return idxA - idxB;
      if (hasA) return -1;
      if (hasB) return 1;
      return 0;
    });

    const metaLines = [];
    for (const item of filteredInfobox) {
      if (metaLines.length >= 4) break;
      const key = item.key;
      const value = normalizeValue(item.value);
      if (!key || !value) continue;
      if (/^(https?:)?\/\//i.test(value)) continue;   // 值是 URL（链接字段）一律跳过
      if (value.length > 30) continue;
      metaLines.push({ key, value });
    }

    // 参与作品：去重、保留职务；渲染层最多取 5 部
    const seenWork = new Set();
    const works = [];
    for (const w of (raw.works || [])) {
      const name = (w.name || '').trim();
      if (!name || seenWork.has(name)) continue;
      seenWork.add(name);
      works.push({ name, role: (w.role || '').trim() });
    }

    return {
      id: raw.id,
      titleZh,
      titleJa,
      summary,
      metaLines,
      works,
    };
  }

  // 二维码重上色：把「黑码 / 白底」重绘为「浅色码 / 透明底」，用于沉浸(深色)风格。
  // 以灰度反相作为 alpha：越暗（码）越不透明，越亮（底）越透明，从而抠掉白底。
  function recolorQRLight(img, rgb) {
    const size = img.naturalWidth || 240;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, size, size);
    let imgData;
    try {
      imgData = x.getImageData(0, 0, size, size);
    } catch (_) {
      return img; // 被跨域污染无法读像素时回退原图，避免整卡报错
    }
    const d = imgData.data;
    const [r, g, b] = rgb;
    for (let i = 0; i < d.length; i += 4) {
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255 - lum;
    }
    x.putImageData(imgData, 0, 0);
    return c;
  }

  // 把带透明通道的图（如深色 logo）整体染成单色，保留原始 alpha 边缘。
  function tintImageToColor(img, color) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    return c;
  }

  // 统一页脚绘制。style: 'classic'(白底色块) | 'immersive'(取消白块 / 深色沉浸)。
  // 三种卡片(条目 / 角色 / 人物)共用；offsetY 用于角色/人物卡的动态高度增量。
  function drawFooter(ctx, opts) {
    const { qrImg, logoImg, tipText, urlText, offsetY = 0, style = 'classic' } = opts;
    const F = LAYOUT.footer;
    const immersive = style === 'immersive';
    const top = F.y + offsetY;

    const headColor = immersive ? LAYOUT.colors.textMain : LAYOUT.colors.footerDark;
    const subColor = immersive ? 'rgba(245,245,247,0.62)' : LAYOUT.colors.footerText;

    if (immersive) {
      // 不画白块——沿用上方统一背景；顶部加一条渐隐分隔线弱化与主体的拼接感
      ctx.save();
      const line = ctx.createLinearGradient(F.x, 0, F.x + F.w, 0);
      line.addColorStop(0, 'rgba(255,255,255,0)');
      line.addColorStop(0.5, 'rgba(255,255,255,0.12)');
      line.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = line;
      ctx.fillRect(F.x + 32, top, F.w - 64, 1);
      ctx.restore();
    } else {
      ctx.fillStyle = LAYOUT.colors.footerBg;
      ctx.fillRect(F.x, top, F.w, F.h);
    }

    // QR（qrY/tipY 为相对 footer 顶部的偏移，必须叠加 top）
    const qrAbsY = top + F.qrY;
    ctx.save();
    clipRoundRect(ctx, F.qrX, qrAbsY, F.qrSize, F.qrSize, F.qrRadius);
    if (!immersive) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(F.qrX, qrAbsY, F.qrSize, F.qrSize);
    }
    if (qrImg) {
      const drawQr = immersive ? recolorQRLight(qrImg, [245, 245, 247]) : qrImg;
      // 白色圆角底不变，二维码本身留更大内边距，方形码与圆角底更协调
      const qrPad = 11;
      ctx.drawImage(drawQr, F.qrX + qrPad, qrAbsY + qrPad, F.qrSize - qrPad * 2, F.qrSize - qrPad * 2);
    }
    ctx.restore();

    // QR 提示文字
    const tipAbsY = top + F.tipY;
    drawText(ctx, tipText, F.tipX, tipAbsY, {
      font: `700 14px ${FONT_STACK.cn}`,
      color: headColor,
    });
    drawText(ctx, urlText, F.tipX, tipAbsY + 20, {
      font: `12px ${FONT_STACK.mono}`,
      color: subColor,
    });

    // Logo（沉浸风格把深色 logo 染成浅色以适配深底）
    const logo = (immersive && logoImg) ? tintImageToColor(logoImg, headColor) : logoImg;
    if (logo) {
      const lr = F.logoW / logoImg.naturalWidth;
      const drawH = logoImg.naturalHeight * lr;
      const drawY = top + (F.h - drawH) / 2;
      ctx.drawImage(logo, F.logoX, drawY, F.logoW, drawH);
    } else {
      ctx.save();
      ctx.fillStyle = headColor;
      ctx.font = `900 20px ${FONT_STACK.cn}`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const midY = top + F.h / 2;
      ctx.fillText('bangumi', F.logoX + F.logoW - 18, midY);
      ctx.fillStyle = LAYOUT.colors.accent;
      ctx.beginPath();
      ctx.arc(F.logoX + F.logoW - 16, midY, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = headColor;
      ctx.fillText('.tv', F.logoX + F.logoW, midY);
      ctx.restore();
    }
  }

  async function renderCard(rawData, posterImg, qrImg, logoImg, opts = {}) {
    await document.fonts.ready;

    const data = prepareData(rawData);
    const { canvas, ctx } = createCanvas();
    const tainted = opts.tainted || !posterImg;
    const style = opts.style === 'immersive' ? 'immersive' : 'classic';

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
      data.releaseDate ? { strong: data.releaseDate, rest: ` ${data.releaseLabel}` } : null,
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
        kinsoku: true,
      });
    }

    // 10. Footer
    drawFooter(ctx, {
      qrImg, logoImg,
      tipText: '扫码查看条目',
      urlText: `bgm.tv/subject/${data.id}`,
      style,
    });

    return canvas;
  }

  async function renderCharacterCard(rawData, posterImg, qrImg, logoImg, cvImgs, opts = {}) {
    await document.fonts.ready;

    const data = prepareCharacterData(rawData);

    // Dynamic panel height — fit whichever side (CV or Works) is taller
    const workCount = Math.min(3, data.works.length);
    const isMultiWork = workCount > 1;
    const cvCount = Math.min(3, data.cvs.length);
    const isMultiCV = cvCount > 1;

    // CV block height: label(10) + gap(8) + N×row(32) + (N-1)×rowGap(10)
    const cvBlockH = isMultiCV
      ? 10 + 8 + cvCount * 32 + (cvCount - 1) * 10
      : 0;
    // Work block height: label(10+17) + N×rowSpacing(22)
    const workBlockH = isMultiWork
      ? 27 + workCount * 22
      : 0;
    const contentH = Math.max(cvBlockH, workBlockH, 55);   // 55 = min single-row height
    const panelPadV = 20;                                   // vertical padding inside panel
    const ph = Math.ceil(contentH + panelPadV * 2);
    // 卡片高度固定为 subject 页高度（720），面板增高不再撑高整卡：
    // 简介紧随面板底部并按剩余空间自适应行数，footer 始终固定在卡片底部。
    const cardH = LAYOUT.h;

    const { canvas, ctx } = createCanvas(LAYOUT.w, cardH);
    const tainted = opts.tainted || !posterImg;
    const style = opts.style === 'immersive' ? 'immersive' : 'classic';

    // 1. 背景
    ctx.save();
    if (!tainted && posterImg) {
      ctx.fillStyle = LAYOUT.colors.bg;
      ctx.fillRect(0, 0, LAYOUT.w, cardH);
      const blur = 40;
      if (canvasFilterSupported()) {
        ctx.filter = `blur(${blur}px) brightness(0.42)`;
        drawImageCover(ctx, posterImg, -blur, -blur, LAYOUT.w + blur * 2, cardH + blur * 2);
        ctx.filter = 'none';
      } else {
        drawBlurredBackground(ctx, posterImg, LAYOUT.w, cardH, blur);
      }
    } else {
      const grd = ctx.createLinearGradient(0, 0, LAYOUT.w, cardH);
      grd.addColorStop(0, LAYOUT.colors.fallbackGradient[0]);
      grd.addColorStop(0.45, LAYOUT.colors.fallbackGradient[1]);
      grd.addColorStop(1, LAYOUT.colors.fallbackGradient[2]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, LAYOUT.w, cardH);
    }
    ctx.restore();

    // 2. 暗色遮罩
    const overlay = ctx.createRadialGradient(LAYOUT.w / 2, 0, 0, LAYOUT.w / 2, cardH / 2, cardH);
    overlay.addColorStop(0, 'rgba(0,0,0,0.18)');
    overlay.addColorStop(0.65, 'rgba(0,0,0,0.52)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, LAYOUT.w, cardH);

    // 3. 角色封面
    if (!tainted && posterImg) {
      ctx.save();
      ctx.shadowColor = LAYOUT.poster.shadowColor;
      ctx.shadowBlur = LAYOUT.poster.shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = LAYOUT.poster.shadowY;
      roundRectPath(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      clipRoundRect(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      drawImageCover(ctx, posterImg, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, 'top');
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
      ctx.fillText('头像加载失败', LAYOUT.poster.x + LAYOUT.poster.w / 2, LAYOUT.poster.y + LAYOUT.poster.h / 2);
      ctx.restore();
    }

    // 4. 标题
    const titleFontSize = data.titleZh.length > 16 ? LAYOUT.title.mainSizeLong : LAYOUT.title.mainSize;
    const zhFont = `800 ${titleFontSize}px ${FONT_STACK.cn}`;
    const zhLineH = titleFontSize * LAYOUT.title.lineHeight;
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

    // 5. Meta 信息
    const metaMaxW = LAYOUT.w - 50 - LAYOUT.meta.x;
    data.metaLines.forEach((line, i) => {
      const y = LAYOUT.meta.y + i * LAYOUT.meta.lineHeight;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const label = line.key + ': ';
      const val = line.value;

      ctx.font = `400 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.fillText(label, LAYOUT.meta.x, y);
      const lw = ctx.measureText(label).width;

      ctx.font = `600 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textMain;

      const maxValW = metaMaxW - lw;
      let valText = val;
      if (ctx.measureText(val).width > maxValW) {
        const ell = '…';
        while (valText.length && ctx.measureText(valText + ell).width > maxValW) {
          valText = valText.slice(0, -1);
        }
        valText += ell;
      }
      ctx.fillText(valText, LAYOUT.meta.x + lw, y);
    });

    // 6. CV & Work Panel
    const px = 40;
    const py = 294;
    const pw = 420;
    const pradius = 24;

    fillRoundRect(ctx, px, py, pw, ph, pradius, LAYOUT.colors.panelBg);
    ctx.save();
    ctx.strokeStyle = LAYOUT.colors.panelBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, px, py, pw, ph, pradius);
    ctx.stroke();
    ctx.restore();

    const panelCenterY = py + ph / 2;

    // Pre-compute both sides' natural label tops so we can top-align them
    const _cvNaturalLabelY = isMultiCV
      ? panelCenterY - cvBlockH / 2                              // multi-CV block top
      : panelCenterY - 19;                                       // single-CV legacy offset
    const _wkNaturalLabelY = isMultiWork
      ? panelCenterY - (10 + 7 + 13 + (workCount - 1) * 22) / 2 // multi-work block top
      : panelCenterY - 19;                                       // single-work legacy offset
    // Both labels share the higher (smaller Y) of the two, giving top-alignment
    const sharedLabelY = workCount > 0
      ? Math.min(_cvNaturalLabelY, _wkNaturalLabelY)
      : _cvNaturalLabelY;

    if (data.cvs.length > 0) {
      ctx.textAlign = 'left';

      const avSize     = isMultiCV ? 32 : (cvImgs && cvImgs[0] ? 44 : 44);
      const avRadius   = avSize / 2;
      const nameIndent = 58 + avSize + 8;                // avatar left(58) + avatar + gap
      const noAvIndent = 60;
      const cvDividerX = 230;                            // 声优 / 出演作品 分界线
      const cvX        = isMultiCV
        ? (cvImgs && cvImgs.length > 0 ? nameIndent : noAvIndent)
        : (cvImgs && cvImgs[0] ? 114 : 60);
      // 多 CV 时名字右边界必须留在分界线左侧（含 12px 内边距），过长则截断加省略号
      const maxNameW   = isMultiCV
        ? cvDividerX - 12 - cvX
        : (cvImgs && cvImgs[0] ? 106 : 160);

      if (isMultiCV) {
        // Multiple CVs — larger avatars, exact vertical centering of whole block
        const rowH     = avSize;       // row height = avatar height
        const rowGap   = 10;           // gap between rows
        const labelFontSize = 10;
        const labelH   = labelFontSize;
        const labelGap = 8;            // gap between label and first row
        const fontSize = 15;

        // total height of the block so we can center it
        const totalBlockH = labelH + labelGap + cvCount * rowH + (cvCount - 1) * rowGap;
        const blockTop    = panelCenterY - totalBlockH / 2;

        // "声优 CV" label
        ctx.font      = `400 ${labelFontSize}px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.textBaseline = 'top';
        ctx.fillText('声优 CV', 58, sharedLabelY);

        for (let i = 0; i < cvCount; i++) {
          const cvName = data.cvs[i].name;
          const rowTop = blockTop + labelH + labelGap + i * (rowH + rowGap);
          const avY    = rowTop;                  // avatar top edge
          const cvImg  = cvImgs && cvImgs[i];

          // Draw circular avatar or grey placeholder
          if (cvImg) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(58 + avRadius, avY + avRadius, avRadius, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            drawImageCover(ctx, cvImg, 58, avY, avSize, avSize);
            ctx.restore();
          } else {
            fillRoundRect(ctx, 58, avY, avSize, avSize, avRadius, 'rgba(255,255,255,0.08)');
          }

          ctx.font = `700 ${fontSize}px ${FONT_STACK.cn}`;
          ctx.textBaseline = 'middle';
          let nameText = cvName;
          if (ctx.measureText(nameText).width > maxNameW) {
            const ell = '…';
            while (nameText.length && ctx.measureText(nameText + ell).width > maxNameW) {
              nameText = nameText.slice(0, -1);
            }
            nameText += ell;
          }
          ctx.fillStyle = LAYOUT.colors.textMain;
          ctx.fillText(nameText, cvX, avY + avRadius);  // vertically center name with avatar
        }
      } else {
        // Single CV: label and name vertically centered with large avatar (size 44x44)
        const cvImg = cvImgs && cvImgs[0];
        if (cvImg) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(58 + 22, panelCenterY, 22, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          drawImageCover(ctx, cvImg, 58, panelCenterY - 22, 44, 44);
          ctx.restore();
        }

        ctx.font = `400 10px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.textBaseline = 'top';
        ctx.fillText('声优 CV', cvX, sharedLabelY);

        const cvName = data.cvs[0].name;
        let fontSize = cvImg ? 15 : 16;
        ctx.font = `700 ${fontSize}px ${FONT_STACK.cn}`;
        let nameText = cvName;
        while (fontSize > 10 && ctx.measureText(nameText).width > maxNameW) {
          fontSize--;
          ctx.font = `700 ${fontSize}px ${FONT_STACK.cn}`;
        }
        if (ctx.measureText(nameText).width > maxNameW) {
          const ell = '…';
          while (nameText.length && ctx.measureText(nameText + ell).width > maxNameW) {
            nameText = nameText.slice(0, -1);
          }
          nameText += ell;
        }
        ctx.fillStyle = LAYOUT.colors.textMain;
        ctx.fillText(nameText, cvX, panelCenterY - 2);
      }

      drawVDivider(ctx, 230, py + 16, ph - 32, LAYOUT.divider2.alpha, 0.25, 0.75);

      if (workCount > 0) {
        ctx.textAlign = 'left';

        if (isMultiWork) {
          const spacing    = 22;
          // Block geometry: label(10) + gap(7) + rows occupying (N-1)*spacing + rowH
          // Row text is textBaseline='middle'; effective row height ≈ 13px (font size)
          const rowH       = 13;
          const workLabelH = 10;
          const workGap    = 7;   // gap from label bottom to first row top
          const workBlockH = workLabelH + workGap + rowH + (workCount - 1) * spacing;
          const workBlockTop = panelCenterY - workBlockH / 2;
          // firstWorkY = center of first row
          const firstWorkY = workBlockTop + workLabelH + workGap + rowH / 2;

          ctx.font = `400 10px ${FONT_STACK.cn}`;
          ctx.fillStyle = LAYOUT.colors.textSub;
          ctx.textBaseline = 'top';
          ctx.fillText('出演作品', 250, sharedLabelY);

          for (let i = 0; i < workCount; i++) {
            const w = data.works[i];
            const wy = firstWorkY + i * spacing;
            
            const role = w.role || '出演';
            ctx.font = `600 9px ${FONT_STACK.cn}`;
            const rw = ctx.measureText(role).width + 12;

            // Right align tags at x = 442
            const rx = 442 - rw;
            const maxWorkW = rx - 250 - 8;

            ctx.font = `700 13px ${FONT_STACK.cn}`;
            ctx.textBaseline = 'middle';
            let workText = w.name;
            if (ctx.measureText(workText).width > maxWorkW) {
              const ell = '…';
              while (workText.length && ctx.measureText(workText + ell).width > maxWorkW) {
                workText = workText.slice(0, -1);
              }
              workText += ell;
            }

            ctx.fillStyle = LAYOUT.colors.textMain;
            ctx.fillText(workText, 250, wy);

            const ry = wy - 7.5;
            const rh = 15;

            fillRoundRect(ctx, rx, ry, rw, rh, 4, LAYOUT.colors.tagBg);
            ctx.save();
            ctx.strokeStyle = LAYOUT.colors.tagBorder;
            ctx.lineWidth = 1;
            roundRectPath(ctx, rx, ry, rw, rh, 4);
            ctx.stroke();
            ctx.restore();

            ctx.font = `600 9px ${FONT_STACK.cn}`;
            ctx.fillStyle = LAYOUT.colors.accent;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(role, rx + rw / 2, ry + rh / 2);

            ctx.textAlign = 'left';
          }
        } else {
          const w = data.works[0];
          ctx.font = `400 10px ${FONT_STACK.cn}`;
          ctx.fillStyle = LAYOUT.colors.textSub;
          ctx.textBaseline = 'top';
          ctx.fillText('出演作品', 250, sharedLabelY);

          ctx.font = `700 13px ${FONT_STACK.cn}`;
          ctx.fillStyle = LAYOUT.colors.textMain;
          
          const workMaxW = 190;
          let workText = w.name;
          if (ctx.measureText(workText).width > workMaxW) {
            const ell = '…';
            while (workText.length && ctx.measureText(workText + ell).width > workMaxW) {
              workText = workText.slice(0, -1);
            }
            workText += ell;
          }
          ctx.fillText(workText, 250, panelCenterY - 2);

          const role = w.role || '出演';
          ctx.font = `600 9px ${FONT_STACK.cn}`;
          const rw = ctx.measureText(role).width;
          const rx = 250;
          const ry = panelCenterY + 18;
          const rh = 16;
          const rpad = 6;

          fillRoundRect(ctx, rx, ry, rw + rpad * 2, rh, 4, LAYOUT.colors.tagBg);
          ctx.save();
          ctx.strokeStyle = LAYOUT.colors.tagBorder;
          ctx.lineWidth = 1;
          roundRectPath(ctx, rx, ry, rw + rpad * 2, rh, 4);
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = LAYOUT.colors.accent;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(role, rx + rpad + rw / 2, ry + rh / 2);
        }
      }
    } else {
      const hasWork1 = !!data.works[0];
      const hasWork2 = !!data.works[1];

      if (hasWork1) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `400 10px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.fillText('出演作品', 60, py + 16);

        ctx.font = `700 13px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textMain;
        
        const wMaxW = 140;
        let w1Text = data.works[0].name;
        if (ctx.measureText(w1Text).width > wMaxW) {
          const ell = '…';
          while (w1Text.length && ctx.measureText(w1Text + ell).width > wMaxW) {
            w1Text = w1Text.slice(0, -1);
          }
          w1Text += ell;
        }
        ctx.fillText(w1Text, 60, py + 33);

        const r1 = data.works[0].role || '出演';
        ctx.font = `600 9px ${FONT_STACK.cn}`;
        const rw1 = ctx.measureText(r1).width;
        const rx1 = 60;
        const ry1 = py + 54;
        const rh = 16;
        const rpad = 6;

        fillRoundRect(ctx, rx1, ry1, rw1 + rpad * 2, rh, 4, LAYOUT.colors.tagBg);
        ctx.save();
        ctx.strokeStyle = LAYOUT.colors.tagBorder;
        ctx.lineWidth = 1;
        roundRectPath(ctx, rx1, ry1, rw1 + rpad * 2, rh, 4);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = LAYOUT.colors.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r1, rx1 + rpad + rw1 / 2, ry1 + rh / 2);
      }

      if (hasWork2) {
        drawVDivider(ctx, 240, py + 16, 58, LAYOUT.divider2.alpha, 0.25, 0.75);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `400 10px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.fillText('出演作品', 260, py + 16);

        ctx.font = `700 13px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textMain;
        
        const wMaxW = 140;
        let w2Text = data.works[1].name;
        if (ctx.measureText(w2Text).width > wMaxW) {
          const ell = '…';
          while (w2Text.length && ctx.measureText(w2Text + ell).width > wMaxW) {
            w2Text = w2Text.slice(0, -1);
          }
          w2Text += ell;
        }
        ctx.fillText(w2Text, 260, py + 33);

        const r2 = data.works[1].role || '出演';
        ctx.font = `600 9px ${FONT_STACK.cn}`;
        const rw2 = ctx.measureText(r2).width;
        const rx2 = 260;
        const ry2 = py + 54;
        const rh = 16;
        const rpad = 6;

        fillRoundRect(ctx, rx2, ry2, rw2 + rpad * 2, rh, 4, LAYOUT.colors.tagBg);
        ctx.save();
        ctx.strokeStyle = LAYOUT.colors.tagBorder;
        ctx.lineWidth = 1;
        roundRectPath(ctx, rx2, ry2, rw2 + rpad * 2, rh, 4);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = LAYOUT.colors.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r2, rx2 + rpad + rw2 / 2, ry2 + rh / 2);
      }

      if (!hasWork1 && !hasWork2) {
        ctx.font = `400 12px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.textSub;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('暂无出演作品信息', px + pw / 2, py + ph / 2);
      }
    }

    // 7. 简介（紧贴面板底部；与「面板上边 → 海报」的 26px 间距对称一致）
    if (data.summary) {
      const summaryY = py + ph + 26;
      const summaryMaxLines = Math.max(1, Math.min(8,
        Math.floor((LAYOUT.footer.y - summaryY - 12) / LAYOUT.summary.lineHeight)));
      drawText(ctx, data.summary, LAYOUT.summary.x, summaryY, {
        font: `400 ${LAYOUT.summary.size}px ${FONT_STACK.cn}`,
        color: 'rgba(245,245,247,0.70)',
        maxWidth: LAYOUT.summary.w,
        lineHeight: LAYOUT.summary.lineHeight,
        maxLines: summaryMaxLines,
        kinsoku: true,
      });
    }

    // 8. Footer（固定在卡片底部）
    drawFooter(ctx, {
      qrImg, logoImg,
      tipText: '扫码查看角色详情',
      urlText: `bgm.tv/character/${data.id}`,
      style,
    });

    return canvas;
  }



  async function renderPersonCard(rawData, posterImg, qrImg, logoImg, opts = {}) {
    await document.fonts.ready;

    const data = preparePersonData(rawData);

    // 动态面板高度：随参与作品条数增长（最多 5 部）
    const workCount = Math.min(5, data.works.length);
    const labelH = 10;
    const labelGap = 12;
    const rowH = 28;
    const contentH = Math.max(workCount > 0 ? labelH + labelGap + workCount * rowH : 55, 55);
    const panelPadV = 20;
    const ph = Math.ceil(contentH + panelPadV * 2);
    // 卡片高度固定为 subject 页高度（720），面板增高不再撑高整卡：
    // 简介紧随面板底部并按剩余空间自适应行数，footer 始终固定在卡片底部。
    const cardH = LAYOUT.h;

    const { canvas, ctx } = createCanvas(LAYOUT.w, cardH);
    const tainted = opts.tainted || !posterImg;
    const style = opts.style === 'immersive' ? 'immersive' : 'classic';

    // 1. 背景
    ctx.save();
    if (!tainted && posterImg) {
      ctx.fillStyle = LAYOUT.colors.bg;
      ctx.fillRect(0, 0, LAYOUT.w, cardH);
      const blur = 40;
      if (canvasFilterSupported()) {
        ctx.filter = `blur(${blur}px) brightness(0.42)`;
        drawImageCover(ctx, posterImg, -blur, -blur, LAYOUT.w + blur * 2, cardH + blur * 2);
        ctx.filter = 'none';
      } else {
        drawBlurredBackground(ctx, posterImg, LAYOUT.w, cardH, blur);
      }
    } else {
      const grd = ctx.createLinearGradient(0, 0, LAYOUT.w, cardH);
      grd.addColorStop(0, LAYOUT.colors.fallbackGradient[0]);
      grd.addColorStop(0.45, LAYOUT.colors.fallbackGradient[1]);
      grd.addColorStop(1, LAYOUT.colors.fallbackGradient[2]);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, LAYOUT.w, cardH);
    }
    ctx.restore();

    // 2. 暗色遮罩
    const overlay = ctx.createRadialGradient(LAYOUT.w / 2, 0, 0, LAYOUT.w / 2, cardH / 2, cardH);
    overlay.addColorStop(0, 'rgba(0,0,0,0.18)');
    overlay.addColorStop(0.65, 'rgba(0,0,0,0.52)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, LAYOUT.w, cardH);

    // 3. 人物头像
    if (!tainted && posterImg) {
      ctx.save();
      ctx.shadowColor = LAYOUT.poster.shadowColor;
      ctx.shadowBlur = LAYOUT.poster.shadowBlur;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = LAYOUT.poster.shadowY;
      roundRectPath(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.fill();
      ctx.shadowColor = 'transparent';
      clipRoundRect(ctx, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, LAYOUT.poster.radius);
      drawImageCover(ctx, posterImg, LAYOUT.poster.x, LAYOUT.poster.y, LAYOUT.poster.w, LAYOUT.poster.h, 'top');
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
      ctx.fillText('头像加载失败', LAYOUT.poster.x + LAYOUT.poster.w / 2, LAYOUT.poster.y + LAYOUT.poster.h / 2);
      ctx.restore();
    }

    // 4. 标题
    const titleFontSize = data.titleZh.length > 16 ? LAYOUT.title.mainSizeLong : LAYOUT.title.mainSize;
    const zhFont = `800 ${titleFontSize}px ${FONT_STACK.cn}`;
    const zhLineH = titleFontSize * LAYOUT.title.lineHeight;
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

    // 5. Meta 信息
    const metaMaxW = LAYOUT.w - 50 - LAYOUT.meta.x;
    data.metaLines.forEach((line, i) => {
      const y = LAYOUT.meta.y + i * LAYOUT.meta.lineHeight;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';

      const label = line.key + ': ';
      ctx.font = `400 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.fillText(label, LAYOUT.meta.x, y);
      const lw = ctx.measureText(label).width;

      ctx.font = `600 ${LAYOUT.meta.size}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textMain;
      const maxValW = metaMaxW - lw;
      let valText = line.value;
      if (ctx.measureText(valText).width > maxValW) {
        const ell = '…';
        while (valText.length && ctx.measureText(valText + ell).width > maxValW) {
          valText = valText.slice(0, -1);
        }
        valText += ell;
      }
      ctx.fillText(valText, LAYOUT.meta.x + lw, y);
    });

    // 6. 参与作品面板（全宽单栏）
    const px = 40;
    const py = 294;
    const pw = 420;
    const pradius = 24;

    fillRoundRect(ctx, px, py, pw, ph, pradius, LAYOUT.colors.panelBg);
    ctx.save();
    ctx.strokeStyle = LAYOUT.colors.panelBorder;
    ctx.lineWidth = 1;
    roundRectPath(ctx, px, py, pw, ph, pradius);
    ctx.stroke();
    ctx.restore();

    const panelCenterY = py + ph / 2;

    if (workCount > 0) {
      const blockH = labelH + labelGap + workCount * rowH;
      const blockTop = panelCenterY - blockH / 2;

      // 标签
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `400 ${labelH}px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.fillText('参与作品', px + 24, blockTop);

      const nameX = px + 24;
      const rightPad = 24;
      const firstRowCenter = blockTop + labelH + labelGap + rowH / 2;

      for (let i = 0; i < workCount; i++) {
        const w = data.works[i];
        const cy = firstRowCenter + i * rowH;

        // 右侧职务药丸
        const role = w.role || '出演';
        ctx.font = `600 10px ${FONT_STACK.cn}`;
        const rw = ctx.measureText(role).width;
        const pillPad = 8;
        const pillW = rw + pillPad * 2;
        const pillH = 18;
        const pillX = px + pw - rightPad - pillW;
        const pillY = cy - pillH / 2;

        // 作品名（左，按到药丸的间距截断）
        const nameMaxW = pillX - nameX - 12;
        ctx.font = `700 14px ${FONT_STACK.cn}`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        let nameText = w.name;
        if (ctx.measureText(nameText).width > nameMaxW) {
          const ell = '…';
          while (nameText.length && ctx.measureText(nameText + ell).width > nameMaxW) {
            nameText = nameText.slice(0, -1);
          }
          nameText += ell;
        }
        ctx.fillStyle = LAYOUT.colors.textMain;
        ctx.fillText(nameText, nameX, cy);

        fillRoundRect(ctx, pillX, pillY, pillW, pillH, 4, LAYOUT.colors.tagBg);
        ctx.save();
        ctx.strokeStyle = LAYOUT.colors.tagBorder;
        ctx.lineWidth = 1;
        roundRectPath(ctx, pillX, pillY, pillW, pillH, 4);
        ctx.stroke();
        ctx.restore();

        ctx.font = `600 10px ${FONT_STACK.cn}`;
        ctx.fillStyle = LAYOUT.colors.accent;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(role, pillX + pillW / 2, cy);
        ctx.textAlign = 'left';
      }
    } else {
      ctx.font = `400 12px ${FONT_STACK.cn}`;
      ctx.fillStyle = LAYOUT.colors.textSub;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无参与作品信息', px + pw / 2, panelCenterY);
    }

    // 7. 简介（紧贴面板底部；与「面板上边 → 海报」的 26px 间距对称一致）
    if (data.summary) {
      const summaryY = py + ph + 26;
      const summaryMaxLines = Math.max(1, Math.min(8,
        Math.floor((LAYOUT.footer.y - summaryY - 12) / LAYOUT.summary.lineHeight)));
      drawText(ctx, data.summary, LAYOUT.summary.x, summaryY, {
        font: `400 ${LAYOUT.summary.size}px ${FONT_STACK.cn}`,
        color: 'rgba(245,245,247,0.70)',
        maxWidth: LAYOUT.summary.w,
        lineHeight: LAYOUT.summary.lineHeight,
        maxLines: summaryMaxLines,
        kinsoku: true,
      });
    }

    // 8. Footer（固定在卡片底部）
    drawFooter(ctx, {
      qrImg, logoImg,
      tipText: '扫码查看人物详情',
      urlText: `bgm.tv/person/${data.id}`,
      style,
    });

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
    if (!isAllowedHost()) throw new Error('当前站点不在支持列表');

    const style = opts.style === 'immersive' ? 'immersive' : 'classic';
    const characterId = opts.id || parseCharacterId();
    const isChar = !!characterId && isCharacterPage();
    const personId = opts.id || parsePersonId();
    const isPerson = !!personId && isPersonPage();

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    if (isPerson) {
      const data = scrapePersonPage();
      const posterUrl = data.images?.large || data.images?.medium || '';

      const [posterImg, qrImg, logoImg] = await Promise.all([
        posterUrl ? loadImage(posterUrl, { crossOrigin: 'anonymous' }).catch(err => {
          console.warn('[share-card] 人物头像加载失败，使用降级布局', err.message);
          return null;
        }) : Promise.resolve(null),
        makeQRImage(personPageUrl(personId)).catch(err => {
          console.warn('[share-card] QR 加载失败', err.message);
          return null;
        }),
        loadLogoImage(),
      ]);

      const canvas = await renderPersonCard(data, posterImg, qrImg, logoImg, {
        tainted: !posterImg,
        style,
      });

      let blob;
      try {
        blob = await exportPNG(canvas);
      } catch (secErr) {
        console.warn('[share-card] toBlob 失败，尝试 toDataURL 降级', secErr.message);
        blob = await exportPNGFallback(canvas).catch(e2 => {
          throw new Error('图片导出失败：' + secErr.message);
        });
      }
      return { canvas, blob, id: personId, data };
    } else if (isChar) {
      const data = scrapeCharacterPage();
      const posterUrl = data.images?.large || data.images?.medium || '';
      const cvUrls = (data.cvs || []).slice(0, 3).map(c => c.avatar).filter(Boolean);

      const [posterImg, qrImg, logoImg, cvImgs] = await Promise.all([
        posterUrl ? loadImage(posterUrl, { crossOrigin: 'anonymous' }).catch(err => {
          console.warn('[share-card] 角色头像加载失败，使用降级布局', err.message);
          return null;
        }) : Promise.resolve(null),
        makeQRImage(characterPageUrl(characterId)).catch(err => {
          console.warn('[share-card] QR 加载失败', err.message);
          return null;
        }),
        loadLogoImage(),
        Promise.all(
          cvUrls.map(url => loadImage(url, { crossOrigin: 'anonymous' }).catch(err => {
            console.warn('[share-card] CV头像加载失败', url, err.message);
            return null;
          }))
        )
      ]);

      const canvas = await renderCharacterCard(data, posterImg, qrImg, logoImg, cvImgs, {
        tainted: !posterImg,
        style,
      });

      let blob;
      try {
        blob = await exportPNG(canvas);
      } catch (secErr) {
        console.warn('[share-card] toBlob 失败，尝试 toDataURL 降级', secErr.message);
        blob = await exportPNGFallback(canvas).catch(e2 => {
          throw new Error('图片导出失败：' + secErr.message);
        });
      }
      return { canvas, blob, id: characterId, data };
    } else {
      const id = opts.id || parseSubjectId();
      if (!id) throw new Error('未能识别条目 ID');

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
        style,
      });

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
  }

  // ========================================================================
  // 暴露
  // ========================================================================

  const BgmShareCardCore = {
    LAYOUT,
    FONT_STACK,
    logoUrl,
    parseSubjectId,
    parseCharacterId,
    parsePersonId,
    isAllowedHost,
    subjectPageUrl,
    characterPageUrl,
    isCharacterPage,
    personPageUrl,
    isPersonPage,
    pickPosterUrl,
    normalizeValue,
    pickStaff,
    mediaLabel,
    collectionLabels,
    fmtCount,
    processSummary,
    retry,
    scrapeSubjectPage,
    scrapeCharacterPage,
    scrapePersonPage,
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
    prepareCharacterData,
    preparePersonData,
    renderCard,
    renderCharacterCard,
    renderPersonCard,
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
