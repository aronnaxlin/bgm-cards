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
// @match        *://bgm.tv/character/*
// @match        *://bangumi.tv/character/*
// @match        *://chii.in/character/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Bangumi 条目分享卡片 - Tampermonkey 版 UI 源码
 * 由 build.js 内联 core.js 后生成发布文件。
 */

function createUI(core) {
  const ns = 'bgm-share-card';

  function ensureStyles() {
    if (document.getElementById(`${ns}-styles`)) return;
    const style = document.createElement('style');
    style.id = `${ns}-styles`;
    style.textContent = `
      .${ns}-trigger { cursor: pointer; }
      .${ns}-trigger-btn { cursor: pointer; }
      .${ns}-ico {
        display: inline-block !important;
        width: 16px !important;
        height: 16px !important;
        vertical-align: -3px !important;
        background: center / 15px no-repeat url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F09199' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='16' rx='3'/%3E%3Ccircle cx='8.5' cy='10' r='1.5'/%3E%3Cpath d='M21 16l-5-5L5 20'/%3E%3C/svg%3E") !important;
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
      core.download(blob, `bgm-share-card-${core.parseSubjectId() || core.parseCharacterId()}.png`);
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
    if (document.querySelector(`.${ns}-trigger, .${ns}-pill, .${ns}-trigger-btn`)) return;

    if (core.parseCharacterId()) {
      const navTabs = document.querySelector('ul.navTabs');
      if (navTabs) {
        const li = document.createElement('li');
        li.className = 'collect center';
        li.style.marginLeft = 'auto';
        const span = document.createElement('span');
        span.className = 'collect action';
        const a = document.createElement('a');
        a.className = `icon icon-m ${ns}-trigger-btn`;
        a.href = 'javascript:void(0);';
        a.innerHTML = `<span class="ico ${ns}-ico">&nbsp;</span><span class="title">分享卡片</span>`;
        a.style.cursor = 'pointer';
        a.addEventListener('click', (e) => { e.preventDefault(); runGenerate(); });
        span.appendChild(a);
        li.appendChild(span);
        const collectLi = navTabs.querySelector('li.collect');
        if (collectLi) {
          collectLi.before(li);
          collectLi.style.setProperty('margin-left', '0px', 'important');
        } else {
          navTabs.appendChild(li);
        }
        return;
      }
    }

    const shareBtn = document.querySelector('.shareBtn');
    if (shareBtn) {
      // 仿原生「复制 / 分享」入口：插在「复制」之后、社交分享之前
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
      if (core.parseSubjectId() || core.parseCharacterId()) injectButton();
    },
  };
}
