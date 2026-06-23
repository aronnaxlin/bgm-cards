# Bangumi 条目分享卡片

为 Bangumi 条目页（`/subject/{id}`）一键生成精致的 **PNG 分享卡片**，可下载或复制到剪贴板。

卡片整合了海报、中日文标题、评分与星级、RANK、收藏数（想看 / 在看 / 看过）、主创 Staff、标签、简介，以及指向条目的二维码。

> 这是一个**用户脚本**项目：装好脚本后，在条目页「收藏盒」的分享区会多出一个原生风格的「卡片」入口，点一下即可生成。

## 快速开始（用户脚本）

主推 **Tampermonkey** 版：

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 新建脚本，用 [`userscript/share-card.tampermonkey.user.js`](userscript/share-card.tampermonkey.user.js) 的内容覆盖。
3. 打开任意条目页（`bgm.tv` / `bangumi.tv` / `chii.in`），在「收藏盒」分享区点击「卡片」。

另外还提供两种发布形态：

- **控制台原生版** [`userscript/share-card.native.user.js`](userscript/share-card.native.user.js) —— F12 粘贴即用，无需扩展。
- **超合金组件版** [`userscript/share-card.bgm-gadget.js`](userscript/share-card.bgm-gadget.js) —— 粘贴到 Bangumi 超合金组件。

安装细节、构建方式、设计参数与已知问题见 **[userscript/README.md](userscript/README.md)**。

## 仓库结构

| 目录 | 内容 |
|---|---|
| [`userscript/`](userscript/) | **脚本（主项目）**：共享核心 `core.js`、三种发布形态、内联构建脚本 `build.js`、UI 源码 `src/*.src.js` |
| [`preview/`](preview/) | **网页预览** |
| `preview/share-card-live.html` | 数据驱动的实时预览：输入条目 ID，拉取真实 Bangumi API 数据即时渲染卡片。纯前端，浏览器打开即可（建议用本地静态服务器以避免接口跨域限制） |
| `preview/design-source/` | 卡片视觉设计稿 `Share Card.dc.html`（**唯一视觉标准**）及其运行时 `support.js` |

脚本里的 canvas 渲染（`userscript/core.js`）以 `preview/` 中的设计稿为基准复刻，二者视觉保持一致。

## 致谢 / 灵感来源

- **豆瓣**的条目分享卡片 —— 整体形态与「一张图说清一个条目」的思路深受其启发。
- [**mewt7401/Bangumi-topic-ShareCard**](https://github.com/mewt7401/Bangumi-topic-ShareCard) —— Bangumi 分享卡片的先行实现，给了本项目很多参考。

## 说明

二维码由 `api.qrserver.com` 生成，卡片数据来自 Bangumi 公开 API，仅供个人学习与分享使用。
