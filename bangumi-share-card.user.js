// ==UserScript==
// @name         Bangumi Share Card
// @namespace    https://github.com/aronnaxlin/bgm-cards
// @version      0.1.0
// @description  在 Bangumi 条目页生成可下载/复制的分享卡片
// @author       aronnax
// @match        https://bgm.tv/subject/*
// @match        https://www.bgm.tv/subject/*
// @match        https://bangumi.tv/subject/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const $ = window.jQuery || window.$;
  if (!$ || typeof $.fn !== 'object') {
    // 页面没有 jQuery 时不注入，保持超合金环境稳定
    return;
  }

  // 跳过移动端页面
  if (/^\/m(\/|$)/.test(location.pathname)) return;

  const subjectMatch = location.pathname.match(/^\/subject\/(\d+)/);
  if (!subjectMatch) return;
  const subjectId = subjectMatch[1];
  const subjectUrl = `https://bgm.tv/subject/${subjectId}`;

  const API_BASE = 'https://api.bgm.tv/v0/subjects';

  const FONT_SANS = '"Noto Sans JP", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';
  const FONT_MONO = '"JetBrains Mono", "SF Mono", "Fira Code", Consolas, "Noto Sans SC", "PingFang SC", "Microsoft YaHei", monospace';

  const ACCENT = '#F09199';

  // ---------------- 工具函数 ----------------

  /**
   * 带 503/网络错误 重试的 fetch 封装
   */
  async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    const baseDelay = 500;
    let lastErr;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        const res = await fetch(url, options);
        if (res.status === 503 || res.status === 504 || res.status === 429) {
          throw new Error(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
      } catch (err) {
        lastErr = err;
        const isRetryable = err.message && /^(HTTP 503|HTTP 504|HTTP 429|fetch|network|Failed to fetch)/i.test(err.message);
        if (!isRetryable || i === maxRetries) throw lastErr;
        await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, i)));
      }
    }
    throw lastErr;
  }

  /**
   * 检测图片是否可以在 canvas 中安全使用（不会被跨域污染）
   */
  function testImageCORS(url) {
    return new Promise(resolve => {
      if (!url) return resolve(false);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () {
        const c = document.createElement('canvas');
        c.width = 1; c.height = 1;
        const ctx = c.getContext('2d');
        try {
          ctx.drawImage(img, 0, 0, 1, 1);
          ctx.getImageData(0, 0, 1, 1);
          resolve(true);
        } catch (e) {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  /**
   * 加载图片
   */
  function loadImage(url, crossOrigin = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`无法加载图片：${url}`));
      img.src = url;
    });
  }

  // 暴露独立可测试的辅助函数
  window.BgmShareCardUtils = {
    testImageCORS,
    fetchWithRetry,
    loadImage,
    subjectId,
    subjectUrl,
  };

  // ---------------- UI 注入 ----------------

  const STYLE_ID = 'bgm-share-card-style';
  if (!document.getElementById(STYLE_ID)) {
    $('<style>')
      .attr('id', STYLE_ID)
      .html(`
        #bgm-share-card-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: 12px;
          padding: 6px 14px;
          background: ${ACCENT};
          color: #fff;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          text-decoration: none;
          line-height: 1;
          transition: transform .1s ease, box-shadow .1s ease;
          box-shadow: 0 4px 14px rgba(240, 145, 153, 0.35);
        }
        #bgm-share-card-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 6px 18px rgba(240, 145, 153, 0.45);
        }
        #bgm-share-card-btn:active {
          transform: translateY(0);
        }
        .bgm-share-modal {
          position: fixed;
          inset: 0;
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(6px);
          padding: 24px;
          font-family: ${FONT_SANS};
        }
        .bgm-share-modal-box {
          position: relative;
          max-width: 560px;
          width: 100%;
          max-height: 90vh;
          overflow: auto;
          background: #1e1e24;
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 32px 80px rgba(0,0,0,0.55);
          color: #f5f5f7;
        }
        .bgm-share-modal-close {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
          color: #fff;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
        }
        .bgm-share-modal-close:hover { background: rgba(255,255,255,0.18); }
        .bgm-share-modal-title {
          font-size: 18px;
          font-weight: 700;
          margin: 0 0 16px;
        }
        .bgm-share-canvas-wrap {
          display: flex;
          justify-content: center;
          background: #121216;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .bgm-share-canvas-wrap canvas {
          max-width: 100%;
          max-height: 55vh;
          border-radius: 12px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        }
        .bgm-share-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 10px;
        }
        .bgm-share-actions button {
          flex: 1;
          padding: 12px 16px;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: opacity .15s ease;
        }
        .bgm-share-actions button:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .bgm-share-download { background: ${ACCENT}; color: #fff; }
        .bgm-share-copy { background: rgba(255,255,255,0.12); color: #fff; }
        .bgm-share-hint {
          font-size: 12px;
          color: #888;
          text-align: center;
          margin: 0;
        }
        .bgm-share-error {
          color: ${ACCENT};
          font-size: 13px;
          text-align: center;
          margin-top: 8px;
        }
      `)
      .appendTo('head');
  }

  function injectButton() {
    if (document.getElementById('bgm-share-card-btn')) return;
    const $btn = $('<a id="bgm-share-card-btn">分享卡片</a>');
    $btn.on('click', openModal);

    // 优先挂在条目导航栏；找不到时作为浮动按钮
    const $nav = $('.subjectNav');
    if ($nav.length) {
      $nav.append($btn);
    } else {
      const $header = $('#headerSubject, .header, #header');
      if ($header.length) {
        $header.append($btn.css({ position: 'absolute', top: '16px', right: '16px' }));
      } else {
        $btn.css({
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 99999,
        }).appendTo('body');
      }
    }
  }

  // ---------------- 弹窗逻辑 ----------------

  let currentCanvas = null;

  function openModal() {
    closeModal();
    const $modal = $(`
      <div class="bgm-share-modal" id="bgm-share-modal">
        <div class="bgm-share-modal-box">
          <button class="bgm-share-modal-close" aria-label="关闭">×</button>
          <h3 class="bgm-share-modal-title">分享卡片</h3>
          <div class="bgm-share-canvas-wrap" id="bgm-share-canvas-wrap">
            <p style="color:#888;font-size:13px;">正在生成卡片…</p>
          </div>
          <div class="bgm-share-actions">
            <button class="bgm-share-download" disabled>下载图片</button>
            <button class="bgm-share-copy" disabled>复制到剪贴板</button>
          </div>
          <p class="bgm-share-hint">二维码由 api.qrserver.com 生成 · 卡片尺寸 1080×1350</p>
          <p class="bgm-share-error" id="bgm-share-error"></p>
        </div>
      </div>
    `);
    $('body').append($modal);
    $modal.on('click', function (e) {
      if (e.target === this) closeModal();
    });
    $modal.find('.bgm-share-modal-close').on('click', closeModal);
    $modal.find('.bgm-share-download').on('click', downloadCard);
    $modal.find('.bgm-share-copy').on('click', copyCard);

    buildCard();
  }

  function closeModal() {
    $('#bgm-share-modal').remove();
    currentCanvas = null;
  }

  function setError(msg) {
    $('#bgm-share-error').text(msg);
    $('#bgm-share-modal .bgm-share-actions button').prop('disabled', true);
  }

  function setReady(canvas) {
    currentCanvas = canvas;
    $('#bgm-share-canvas-wrap').empty().append(canvas);
    $('#bgm-share-modal .bgm-share-actions button').prop('disabled', false);
  }

  // ---------------- 卡片生成 ----------------

  async function buildCard() {
    try {
      const data = await fetchWithRetry(`${API_BASE}/${subjectId}`);

      const posterUrl = data.images?.large || data.images?.common || data.images?.medium || '';
      let posterImg = null;
      if (posterUrl) {
        const usable = await testImageCORS(posterUrl);
        if (usable) {
          try { posterImg = await loadImage(posterUrl); } catch (e) { posterImg = null; }
        }
      }

      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(subjectUrl)}&color=000000&bgcolor=ffffff`;
      const qrImg = await loadImage(qrUrl);

      const canvas = drawCard(data, posterImg, qrImg);
      setReady(canvas);
    } catch (err) {
      setError(`生成失败：${err.message || '未知错误'}`);
      // eslint-disable-next-line no-console
      console.error('[Bangumi Share Card]', err);
    }
  }

  // ---------------- Canvas 绘制 ----------------

  function roundRectPath(ctx, x, y, w, h, r) {
    let tl, tr, br, bl;
    if (Array.isArray(r)) {
      [tl, tr, br, bl] = r;
    } else {
      tl = tr = br = bl = Math.min(r, w / 2, h / 2);
    }
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
    ctx.lineTo(x + w, y + h - br);
    ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    ctx.lineTo(x + bl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
    ctx.lineTo(x, y + tl);
    ctx.quadraticCurveTo(x, y, x + tl, y);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r, fillStyle) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawCover(ctx, img, W, H) {
    const iw = img.width, ih = img.height;
    const scale = Math.max(W / iw, H / ih);
    const sw = W / scale, sh = H / scale;
    const sx = (iw - sw) / 2, sy = (ih - sh) / 2;
    ctx.filter = 'blur(40px) brightness(0.45)';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    ctx.filter = 'none';
  }

  function wrapText(ctx, text, maxWidth) {
    const chars = String(text || '').split('');
    const lines = [];
    let line = '';
    for (const ch of chars) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function clampLines(ctx, text, maxWidth, maxLines) {
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return lines;
    let line = lines.slice(0, maxLines).join('');
    while (line.length > 1 && ctx.measureText(line + '…').width > maxWidth) {
      line = line.slice(0, -1);
    }
    return [line + '…'];
  }

  function formatStars(score) {
    if (score == null || isNaN(score)) return '☆☆☆☆☆';
    const val = Math.max(0, Math.min(10, Number(score))) / 2;
    const rounded = Math.round(val);
    return '★'.repeat(rounded) + '☆'.repeat(5 - rounded);
  }

  function formatCount(n) {
    const num = Number(n) || 0;
    return num.toLocaleString('en-US');
  }

  function dateVerb(platform) {
    const p = String(platform || '').toLowerCase();
    if (/tv|动画|anime|番剧/.test(p)) return '放送';
    if (/movie|剧场版|电影|film/.test(p)) return '上映';
    if (/game|游戏/.test(p)) return '发售';
    return '发售';
  }

  function drawCard(data, posterImg, qrImg) {
    const W = 1080, H = 1350, R = 24;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 裁剪为圆角矩形画布
    ctx.save();
    roundRectPath(ctx, 0, 0, W, H, R);
    ctx.clip();

    // 背景
    if (posterImg) {
      drawCover(ctx, posterImg, W, H);
    } else {
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#1a1a2e');
      grad.addColorStop(0.45, '#16213e');
      grad.addColorStop(1, '#0f3460');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    // 暗角遮罩
    const overlay = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H / 2, H);
    overlay.addColorStop(0, 'rgba(0,0,0,0.2)');
    overlay.addColorStop(0.7, 'rgba(0,0,0,0.55)');
    overlay.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();

    // 布局常量
    const padX = 96, padY = 96;
    const posterW = 400, posterH = 600, posterR = 24;
    const gap = 64;
    const infoX = padX + posterW + gap;
    const infoW = W - padX - infoX;
    const footerH = 120;
    const footerY = H - footerH;

    // 海报
    if (posterImg) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 60;
      ctx.shadowOffsetY = 24;
      roundRectPath(ctx, padX, padY, posterW, posterH, posterR);
      ctx.clip();
      ctx.drawImage(posterImg, padX, padY, posterW, posterH);
      ctx.restore();
    } else {
      fillRoundRect(ctx, padX, padY, posterW, posterH, posterR, 'rgba(255,255,255,0.06)');
      ctx.save();
      roundRectPath(ctx, padX, padY, posterW, posterH, posterR);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([12, 12]);
      ctx.lineWidth = 2;
      ctx.strokeRect(padX + 20, padY + 20, posterW - 40, posterH - 40);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font = `500 22px ${FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.fillText('海报暂无法跨域加载', padX + posterW / 2, padY + posterH / 2);
    }

    // 标题（中文优先，日文作为副标题）
    const mainTitle = data.name_cn || data.name || '';
    const subTitle = data.name_cn && data.name ? data.name : '';

    let titleY = padY + 12;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    let mainSize = 52;
    ctx.font = `800 ${mainSize}px ${FONT_SANS}`;
    let mainLines = clampLines(ctx, mainTitle, infoW, 2);
    if (mainLines.length > 2 || wrapText(ctx, mainTitle, infoW).length > 2) {
      mainSize = 42;
      ctx.font = `800 ${mainSize}px ${FONT_SANS}`;
      mainLines = clampLines(ctx, mainTitle, infoW, 2);
    }
    ctx.fillStyle = '#f5f5f7';
    mainLines.forEach((line, i) => {
      ctx.fillText(line, infoX, titleY + (i + 1) * mainSize * 1.25);
    });

    if (subTitle) {
      const subY = titleY + mainLines.length * mainSize * 1.25 + 18;
      ctx.fillStyle = '#a0a0b0';
      ctx.font = `500 26px ${FONT_SANS}`;
      const subLines = clampLines(ctx, subTitle, infoW, 1);
      subLines.forEach((line, i) => {
        ctx.fillText(line, infoX, subY + i * 34);
      });
      titleY = subY + 34;
    } else {
      titleY = titleY + mainLines.length * mainSize * 1.25 + 16;
    }

    // 信息行
    const infoRowY = titleY + 18;
    ctx.beginPath();
    ctx.moveTo(infoX, infoRowY);
    ctx.lineTo(infoX + infoW, infoRowY);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const score = data.rating?.score;
    const total = data.rating?.total;
    const scoreText = score != null ? Number(score).toFixed(1) : '--';

    const ratingX = infoX;
    const ratingY = infoRowY + 18;
    ctx.fillStyle = ACCENT;
    ctx.font = `800 72px ${FONT_MONO}`;
    ctx.fillText(scoreText, ratingX, ratingY + 72);

    ctx.fillStyle = ACCENT;
    ctx.font = `500 22px ${FONT_SANS}`;
    ctx.fillText(formatStars(score), ratingX, ratingY + 72 + 34);

    ctx.fillStyle = '#a0a0b0';
    ctx.font = `500 16px ${FONT_MONO}`;
    ctx.fillText(`${formatCount(total)} 人评分`, ratingX, ratingY + 72 + 64);

    const dividerX = ratingX + 142;
    ctx.beginPath();
    ctx.moveTo(dividerX, ratingY + 12);
    ctx.lineTo(dividerX, ratingY + 12 + 78);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const metaX = dividerX + 22;
    const metaY = ratingY + 28;
    ctx.fillStyle = '#a0a0b0';
    ctx.font = `500 20px ${FONT_MONO}`;
    ctx.textBaseline = 'alphabetic';
    const date = data.date || '';
    const platform = data.platform || '';
    const eps = data.eps;
    const epsText = eps != null && eps > 0 ? ` · ${eps} 话` : '';
    const tagText = (data.tags && data.tags[0] && data.tags[0].name) ? data.tags[0].name : '';

    [
      date ? { text: date, bold: true, suffix: ` ${dateVerb(platform)}` } : null,
      platform ? { text: platform, bold: true, suffix: epsText } : null,
      tagText ? { text: tagText, bold: false, suffix: '' } : null,
    ].filter(Boolean).forEach((item, i) => {
      const y = metaY + i * 34;
      let x = metaX;
      if (item.bold) {
        ctx.font = `700 20px ${FONT_MONO}`;
        ctx.fillStyle = '#f5f5f7';
      } else {
        ctx.font = `500 20px ${FONT_MONO}`;
        ctx.fillStyle = '#a0a0b0';
      }
      ctx.fillText(item.text, x, y);
      x += ctx.measureText(item.text).width;
      if (item.suffix) {
        ctx.font = `500 20px ${FONT_MONO}`;
        ctx.fillStyle = '#a0a0b0';
        ctx.fillText(item.suffix, x, y);
      }
    });

    const infoRowBottom = metaY + 2 * 34 + 10;
    ctx.beginPath();
    ctx.moveTo(infoX, infoRowBottom);
    ctx.lineTo(infoX + infoW, infoRowBottom);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();

    // 简介
    const summaryY = Math.max(padY + posterH + 48, infoRowBottom + 48);
    const summaryW = W - 2 * padX;
    const summaryFont = 26;
    const summaryLineHeight = 44;
    ctx.fillStyle = 'rgba(245,245,247,0.72)';
    ctx.font = `400 ${summaryFont}px ${FONT_SANS}`;
    const summaryLines = clampLines(ctx, data.summary || '', summaryW, 3);
    summaryLines.forEach((line, i) => {
      ctx.fillText(line, padX, summaryY + i * summaryLineHeight + summaryFont);
    });

    // 底部信息条
    fillRoundRect(ctx, 0, footerY, W, footerH, [0, 0, R, R], '#f4f4f5');

    const qrWrapSize = 88;
    const qrPadding = 8;
    const qrX = padX;
    const qrY = footerY + (footerH - qrWrapSize) / 2;
    fillRoundRect(ctx, qrX, qrY, qrWrapSize, qrWrapSize, 12, '#ffffff');
    ctx.save();
    roundRectPath(ctx, qrX + qrPadding, qrY + qrPadding, qrWrapSize - qrPadding * 2, qrWrapSize - qrPadding * 2, 4);
    ctx.clip();
    ctx.drawImage(qrImg, qrX + qrPadding, qrY + qrPadding, qrWrapSize - qrPadding * 2, qrWrapSize - qrPadding * 2);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font = `500 18px ${FONT_SANS}`;
    ctx.textAlign = 'left';
    ctx.fillText('扫码查看条目', qrX + qrWrapSize + 18, qrY + 34);
    ctx.fillStyle = '#111';
    ctx.font = `700 22px ${FONT_MONO}`;
    ctx.fillText(`bgm.tv/subject/${subjectId}`, qrX + qrWrapSize + 18, qrY + 66);

    const brandX = W - padX;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#222';
    ctx.font = `900 40px ${FONT_SANS}`;
    const brandText = 'bangumi.tv';
    const dotIndex = brandText.indexOf('.');
    ctx.fillText(brandText.slice(0, dotIndex), brandX - ctx.measureText(brandText.slice(dotIndex)).width, footerY + 58);
    ctx.fillStyle = ACCENT;
    ctx.fillText('.', brandX, footerY + 58);
    ctx.fillStyle = '#222';
    ctx.fillText(brandText.slice(dotIndex + 1), brandX, footerY + 58);

    ctx.fillStyle = '#999';
    ctx.font = `500 18px ${FONT_MONO}`;
    ctx.fillText(`#${subjectId}`, brandX, footerY + 92);

    return canvas;
  }

  // ---------------- 导出 ----------------

  function downloadCard() {
    if (!currentCanvas) return;
    currentCanvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bgm-share-${subjectId}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  async function copyCard() {
    if (!currentCanvas) return;
    try {
      const blob = await new Promise((resolve, reject) => {
        currentCanvas.toBlob(b => (b ? resolve(b) : reject(new Error('无法导出图片'))), 'image/png');
      });
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      const $btn = $('#bgm-share-modal .bgm-share-copy');
      const old = $btn.text();
      $btn.text('已复制');
      setTimeout(() => $btn.text(old), 1500);
    } catch (err) {
      setError(`复制失败：${err.message}`);
    }
  }

  // ---------------- 启动 ----------------

  injectButton();
})();
