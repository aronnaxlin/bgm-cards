# Bangumi 条目分享卡片

为 Bangumi 条目页 (`/subject/{id}`) 生成可下载 / 可复制的 PNG 分享卡片。

## 目录结构：源码 vs 成品

为避免“同名文件分不清哪个是源码、哪个是成品”，做如下命名区分：

| 路径 | 角色 | 说明 |
|---|---|---|
| `core.js` | 源码（共享核心） | 取数据、加载图片、canvas 绘制、导出 |
| `src/share-card.ui.shared.js` | 源码（共享 UI 层） | `createUI` 实现，三个发布环境共用同一份 |
| `src/share-card.native.src.js` | 源码（环境标记） | 仅含控制台直接粘贴版所需信息（无 header） |
| `src/share-card.tampermonkey.src.js` | 源码（环境标记） | 仅含 Tampermonkey 版 UserScript header |
| `src/share-card.bgm-gadget.src.js` | 源码（环境标记） | 仅含超合金组件版 UserScript header |
| `share-card.native.user.js` | 成品（可发布/粘贴） | 已内联 `core.js` + 共享 UI |
| `share-card.tampermonkey.user.js` | 成品（可发布/粘贴） | 已内联 `core.js` + 共享 UI |
| `share-card.bgm-gadget.js` | 成品（可发布/粘贴） | 已内联 `core.js` + 共享 UI（含第三方 QR API） |

约定：

- **`src/share-card.ui.shared.js`** 是唯一的 UI 层实现（`createUI`），三个环境的差异只在 UserScript header，不应该再各自维护一份 UI 代码。
- **`src/*.src.js`**（除共享文件外）现在只保留各环境的 UserScript header（原生版没有 header），**不可**直接运行——它依赖 `core.js` 和共享 UI。
- **根目录 `share-card.*`** 是 `build.js` 把 `core.js` + 共享 UI 依次内联到对应 header 后生成的单文件成品，发布时无需再加载其它文件。
- 改 UI 逻辑（按钮、弹窗、交互）只改 `share-card.ui.shared.js` 一处；改各环境的 `@match`/`@grant` 等才去改对应的 `*.src.js`。
- 改完 `core.js` 或 `src/*.js` 后务必跑 `node build.js` 重新生成成品。

## 支持域名

- `bgm.tv/subject/*`
- `bangumi.tv/subject/*`
- `chii.in/subject/*`

移动版 `/m/` 不注入。

## 安装方法

### Tampermonkey 版

1. 安装浏览器扩展 [Tampermonkey](https://www.tampermonkey.net/)。
2. 点击扩展图标 →「添加新脚本」。
3. 用 `share-card.tampermonkey.user.js` 的内容覆盖默认脚本。
4. 保存后访问任意 Bangumi 条目页，在「收藏盒」的分享区会出现「卡片」按钮；若你已收藏该条目，旁边还会出现「我的记录」按钮，生成主打你自己的状态/评分/短评的卡片。

### 原生脚本版（控制台测试）

1. 打开任意 Bangumi 条目页。
2. F12 打开控制台。
3. 粘贴 `share-card.native.user.js` 全部内容，回车。
4. 右栏分享区会出现「卡片」按钮。

### 超合金组件版

1. 进入 Bangumi 超合金组件管理页面。
2. 新建组件，将 `share-card.bgm-gadget.js` 内容粘贴到脚本区域。
3. 组件描述中声明「含第三方 API：api.qrserver.com」。
4. 保存后在条目页生效。

## 如何在控制台单独测试核心

```js
await BgmShareCardCore.generateShareCard().then(({ canvas, blob }) => {
  // 直接下载
  BgmShareCardCore.download(blob, 'test.png');
  // 或弹出预览
  document.body.appendChild(canvas);
});
```

## 构建发布文件

修改 `core.js` 或 `src/` 下的 UI 源码后，运行：

```bash
cd userscript
node build.js
```

脚本会读取：

- `core.js`
- `src/share-card.ui.shared.js`
- `src/share-card.native.src.js`
- `src/share-card.tampermonkey.src.js`
- `src/share-card.bgm-gadget.src.js`

并生成/覆盖：

- `share-card.native.user.js`
- `share-card.tampermonkey.user.js`
- `share-card.bgm-gadget.js`

生成的文件已内嵌 `core.js`，可直接发布或粘贴到 Tampermonkey / 超合金组件。

## 设计说明

- 卡片尺寸：500 × 720 px，按 `devicePixelRatio` 放大输出高清 PNG。
- 海报优先使用 `api.bgm.tv` 返回的 `images.medium`（即 `lain.bgm.tv/r/800/...`），实测在三域名均可 `crossOrigin` 无污点加载。
- Logo 从当前站点同域 `/img/logo_riff.png` 加载，避免跨域问题。
- QR 由 `api.qrserver.com` 生成。
- 字体使用系统字体栈，不加载外部 Web Font。
- 圆角统一走超椭圆（squircle，指数 2.2，`superellipsePath`），`canvasFilterSupported()` 探测不到时自动回退到二次贝塞尔圆角（`roundRectPath` 的 `n` 参数不传即走原逻辑）。
- 「我的记录」卡片（`kind: 'status'`）100% 走 DOM 抓取（`scrapeMyStatus`），不额外调用 `api.bgm.tv`：状态/个人评分/短评/进度取自条目页「收藏盒」隐藏表单，Bangumi 社区均分取自 `scrapeSubjectPage` 已抓的 `[property="v:average"]`。仅当已收藏该条目（`hasMyStatus()` 为真）时才注入入口按钮。

## 已知坑

1. **海报偶尔失败**：若 Bangumi 调整 CDN CORS 头，海报会 fallback 到无海报渐变布局。
2. **http 页面复制图片**：非安全上下文 `navigator.clipboard.write` 可能失败，脚本会提示改用下载。
3. **标签最多 6 个、简介最多 6 行**：防止卡片溢出。

## 开发

```bash
git clone https://github.com/aronnaxlin/bgm-cards.git
cd bgm-cards/userscript
```

编辑 `core.js` 或 `src/*.js` 后，运行 `node build.js` 重新生成发布文件。
