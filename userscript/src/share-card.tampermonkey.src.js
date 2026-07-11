// ==UserScript==
// @name         Bangumi 条目分享卡片
// @name:en      Bangumi Subject Share Card
// @namespace    https://github.com/aronnaxlin/bgm-cards
// @version      1.1.0
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
// @match        *://bgm.tv/person/*
// @match        *://bangumi.tv/person/*
// @match        *://chii.in/person/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/**
 * Bangumi 条目分享卡片 - Tampermonkey 版
 * UI 层实现见共享文件 share-card.ui.shared.js，由 build.js 拼接。
 */
