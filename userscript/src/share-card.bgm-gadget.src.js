// ==UserScript==
// @name         Bangumi 条目分享卡片（超合金组件版）
// @namespace    https://github.com/aronnaxlin/bgm-cards
// @version      1.0.0
// @author       aronnaxlin
// @description  在 Bangumi 条目页生成可下载 / 可复制的 PNG 分享卡片。含第三方二维码 API。
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
// ==/UserScript==

/**
 * Bangumi 超合金组件版
 * 约束：无外部 @require，无 GM API，单文件自包含。
 * UI 层实现见共享文件 share-card.ui.shared.js，由 build.js 拼接。
 */
