# PRD：Obsidian 微信公众号排版与发布插件

## 1. 项目概述

- **项目名称**：Obsidian WeChat Publisher
- **核心目标**：在 Obsidian 内实现 **写作 → 排版预览 → 推送到微信公众号草稿箱** 的全流程闭环。
- **项目背景**：当前从 Obsidian Markdown 到微信公众号发布，需要经历"复制 → 第三方排版工具(如 mdnice) → 粘贴到微信后台 → 重新上传图片"的碎片化流程。本插件将这些步骤集成为一体化操作。

> [!IMPORTANT]
> **微信 API 权限说明**：微信公众号的「素材管理」和「草稿箱」API 仅对 **已认证的订阅号/服务号** 开放。个人未认证订阅号无法使用 API 推送功能。因此插件必须提供**两种工作模式**：
> 1. **API 模式**（已认证号）：全自动上传图片 + 推送草稿箱。
> 2. **剪贴板模式**（通用兜底）：将排版完成的 HTML 一键复制到系统剪贴板，用户手动粘贴到微信公众号后台编辑器。

---

## 2. Frontmatter 规范

插件通过读取文档的 YAML Frontmatter 获取文章元信息。以下为标准字段定义：

```yaml
---
title: "文章标题"              # 必填，优先使用；缺省则取文档第一个 H1
author: "作者名"               # 选填，缺省使用插件全局设置中的默认作者
cover: "assets/cover.jpg"      # 选填，封面图路径（相对于文档）；缺省取文章首张图片
digest: "这是文章的摘要"        # 选填，微信要求的文章摘要；缺省自动截取正文前 120 字
tags: [标签1, 标签2]           # 选填，暂留扩展
wx_template: "tech-dark"       # 选填，指定排版模板名称；缺省使用插件默认模板
---
```

---

## 3. 核心功能

### 3.1 排版预览面板

**功能描述**：提供一个独立的侧边栏面板（Obsidian Leaf View），实时预览当前文档在微信公众号移动端的最终渲染效果。

| 功能项 | 说明 |
|---|---|
| 实时同步 | 编辑区内容变动或切换标签页时，预览面板自动刷新（Debounce 300ms） |
| 移动端仿真 | 面板宽度固定为 375px，模拟手机微信阅读宽度 |
| 文章元数据 | 在预览顶部展示文章标题、提取的封面图（如果未设置提示缺失）、作者及实时字数统计 |
| 面板工具栏 | 顶部提供「刷新」、「复制 HTML」和「推送到草稿箱」的快捷操作按钮 |

**交互入口**：
- Ribbon 图标按钮（侧边栏图标）
- Command Palette：`WeChat Publisher: 打开预览面板`
- 右键菜单：`微信公众号预览`

### 3.2 排版模板系统

**功能描述**：将 Markdown 转换为微信兼容的内联 CSS HTML，支持多模板切换与自定义。

#### 3.2.1 Markdown → HTML 转换

- 使用 `marked` 库解析 Markdown 为 HTML AST。
- 对以下 Markdown 元素做微信专项适配：

| Markdown 元素 | 微信适配处理 |
|---|---|
| 标题 `# ~ ######` | 渲染为 `<section>` 包裹的标题块，附带装饰线/序号等模板样式 |
| 代码块 ` ```lang ``` ` | 渲染为带语法高亮（`highlight.js`）的 `<pre>` 块，使用内联色值 |
| 图片 `![](url)` | 触发图片上传流程（详见 3.3），替换为微信图床 URL |
| Obsidian 内嵌 `![[img.png]]` | 解析 Vault 附件路径，读取本地文件后同样走上传流程 |
| 表格 | 渲染为内联样式的 `<table>`，自动添加边框和交替行背景色 |
| 脚注 `[^1]` | 转换为文末注释列表 |
| 数学公式 `$...$` | 渲染为 SVG 或图片内嵌（微信不支持 MathJax/KaTeX） |

#### 3.2.2 CSS 内联化引擎

微信公众号编辑器会**剥离所有 `<style>` 和 `<link>` 标签**，因此样式必须以 `style=""` 属性内联到每个 HTML 元素上。

**处理流程**：
1. 加载当前选中的模板 CSS 文件。
2. 使用 `juice` 库将 CSS 规则匹配到 HTML 元素并写入 `style` 属性。
3. 清理无效的 CSS 属性（如 `position`, `display: flex` 等微信不支持的属性）。
4. 输出最终内联化 HTML 字符串。

#### 3.2.3 动态模板系统

摒弃传统的静态 CSS 文件模板加载方式，转为**动态可配置样式系统**。用户可以直接在插件设置或编辑器工具栏中，针对不同元素进行可视化调整。支持用户保存并切换多个配置组合（模板）：

- **支持的排版参数**：
  - 标题（H1~H6）：自定义字体大小、颜色、上下边距、行高、页面左右边距。
  - 正文（p）：自定义字体大小、行高、页面左右边距。
  - 图片（img）：自定义圆角半径、阴影效果、边框颜色及厚度。

- **工作机制**：在 Markdown 转换为 HTML 后，组件会动态生成一套包含 `!important` 的作用域 CSS 覆盖默认样式，并将其作为内联样式。这既保证了极高的可定制性，又兼容了微信严苛的 CSS 过滤规则。

#### 3.2.4 微信专属组件（Callout 映射）

利用 Obsidian 的 Callout 语法扩展微信公众号常用的排版组件：

```markdown
> [!wx-follow]
> 点击上方蓝字关注我们

> [!wx-quote]
> 这是一段精彩的引语 —— 作者名

> [!wx-card]
> **重点知识卡片标题**
> 这里是卡片的具体内容描述文字。

> [!wx-note color=green]
> 这是一个绿色提示块
```

渲染规则：

| Callout 类型 | 渲染为 |
|---|---|
| `[!wx-follow]` | 顶部关注引导条（带公众号头像+蓝色文字样式） |
| `[!wx-quote]` | 居中斜体引语块（带左竖线装饰） |
| `[!wx-card]` | 圆角卡片容器（带阴影和背景色） |
| `[!wx-note]` | 彩色提示信息块，支持 `color` 参数 |

### 3.3 图片处理

#### 3.3.1 图片识别

插件需要识别以下三类图片来源：

| 来源 | 语法 | 处理方式 |
|---|---|---|
| 标准 Markdown 外链 | `![](https://...)` | 下载到本地临时目录后上传微信 |
| 标准 Markdown 本地路径 | `![](./assets/img.png)` | 直接读取文件上传微信 |
| Obsidian 内嵌附件 | `![[image.png]]` | 通过 Vault API 解析实际路径后读取上传 |

#### 3.3.2 上传与替换流程

```
识别图片 → 格式/体积预检 → 上传到微信永久素材 → 获取微信 media_id 和 URL → 替换原始 HTML 中的 src
```

**预检规则**：

| 检查项 | 限制 | 处理策略 |
|---|---|---|
| 文件体积 | 微信限制单张 ≤ 10MB | 超限时自动压缩（调整质量/分辨率），压缩后仍超限则弹窗警告 |
| 图片格式 | 微信支持 JPG/PNG/GIF | SVG → 自动转为 PNG；WebP → 自动转为 JPG |
| GIF 动图 | 微信支持但体积限制严格 | 仅做体积预检，不做格式转换 |

#### 3.3.3 剪贴板模式下的图片处理

在剪贴板模式（无 API 权限）下，图片**无法**自动上传。此时：
- 将图片转为 Base64 Data URI 内嵌到 HTML 中（微信后台粘贴时能自动识别并上传）。
- 如 Base64 体积过大导致粘贴失败，则保留原始路径并弹窗提示用户手动上传。

### 3.4 微信公众号 API 对接

#### 3.4.1 账号配置（插件 Settings Tab）

在 Obsidian 设置 → 第三方插件 → WeChat Publisher 中，提供以下配置项：

| 配置项 | 类型 | 说明 |
|---|---|---|
| AppID | text input | 微信公众号的 AppID |
| AppSecret | password input | 微信公众号的 AppSecret（输入后隐藏显示，加密存储） |
| 自建 API 代理地址 | text input | 解决微信 IP 白名单问题（如：填写 Nginx 反向代理地址），缺省直连官网 |
| 工作模式 | radio | 切换 API 模式或剪贴板模式 |
| 默认作者 | text input | Frontmatter 缺省时使用的作者名 |
| 连接测试 | button | 点击后尝试获取 access_token 验证配置是否正确 |

**凭证安全方案**：
- `AppSecret` 在 `data.json` 中以 AES-256 加密存储（密钥派生自设备唯一标识）。
- 优先尝试使用系统级密钥存储（macOS Keychain），不可用时回退到加密文件方案。
- 插件代码中不包含任何远程上报逻辑。

#### 3.4.2 Access Token 管理

- 调用 `https://api.weixin.qq.com/cgi-bin/token` 获取 `access_token`。
- 本地缓存 Token，有效期 7200 秒（2 小时），过期前 5 分钟自动续期。
- 所有 API 请求通过 Obsidian 的 `requestUrl()` 发出（规避浏览器 CORS 限制）。

#### 3.4.3 核心 API 调用流程

```
┌─────────────────────────────────────────────────────────┐
│  1. 获取/刷新 access_token                               │
│     POST /cgi-bin/token                                  │
│                                                         │
│  2. 上传文章图片（逐张）                                   │
│     POST /cgi-bin/material/add_material?type=image       │
│     → 返回 media_id + url                                │
│                                                         │
│  3. 上传封面图                                            │
│     POST /cgi-bin/material/add_material?type=thumb       │
│     → 返回 thumb_media_id                                │
│                                                         │
│  4. 新建草稿                                              │
│     POST /cgi-bin/draft/add                              │
│     → 请求体包含：title, author, digest,                  │
│       content(内联HTML), thumb_media_id                   │
│     → 返回 media_id（草稿ID）                             │
│                                                         │
│  5. 推送成功 → Notice 通知 + 跳转链接                      │
│     https://mp.weixin.qq.com                             │
└─────────────────────────────────────────────────────────┘
```

#### 3.4.4 错误处理

| 错误场景 | 处理策略 |
|---|---|
| AppID/AppSecret 错误 | 弹出 Notice 提示"授权失败，请检查 AppID 和 AppSecret" |
| access_token 过期 | 自动刷新后重试当前请求（最多重试 1 次） |
| 图片上传失败 | 跳过该图片，继续处理其余图片，最终汇总报告失败列表 |
| 网络超时 | 弹出 Notice 提示"网络请求超时"，支持用户手动重试 |
| 草稿推送失败 | 弹出 Notice 展示微信返回的错误码和错误信息 |
| API 权限不足 | 提示"当前公众号无此接口权限"，建议切换到剪贴板模式 |

### 3.5 一键复制（剪贴板模式）

当用户选择剪贴板模式或 API 调用失败降级时：

1. 完成 Markdown → HTML 转换和 CSS 内联化。
2. 图片采用 Base64 内嵌处理。
3. 将最终 HTML 写入系统剪贴板。
4. 弹出 Notice："排版 HTML 已复制到剪贴板，请到微信公众号后台粘贴"。

**Command**：`WeChat Publisher: 复制为微信排版 HTML`

---

## 4. 插件 UI 与交互汇总

### 4.1 命令列表 (Command Palette)

| 命令 | 功能 |
|---|---|
| `WeChat Publisher: 打开预览面板` | 打开/聚焦侧边栏预览面板 |
| `WeChat Publisher: 推送到草稿箱` | 执行完整的排版 + 上传 + 推送流程 |
| `WeChat Publisher: 复制为微信排版 HTML` | 排版后复制到剪贴板（剪贴板模式） |
| `WeChat Publisher: 切换排版模板` | 弹出模板选择器快速切换 |

### 4.2 Ribbon 图标

侧边栏固定一个图标按钮（微信风格图标），点击打开预览面板。

### 4.3 浮动工具栏 (Editor Toolbar)

在 Markdown 编辑器顶部动态注入快速操作栏（Toolbar），支持：
- 快速打开**图片样式设置**弹窗。
- 快速打开**模板排版设置**弹窗，实时修改并预览结果。

### 4.4 右键菜单

在编辑器右键菜单中增加：
- 微信公众号预览
- 推送到草稿箱
- 复制为微信排版 HTML

---

## 5. 技术架构

```
src/
├── main.ts                    # 插件入口：注册命令、视图、设置及工具栏
├── settings.ts                # 设置面板 (AppID/Secret/样式模板等)
├── views/
│   └── PreviewView.ts         # 侧边栏 375px 实时预览面板 (ItemView)
├── core/
│   ├── MarkdownRenderer.ts    # Markdown → HTML 转换及 CSS 内联化引擎
│   └── ImageProcessor.ts      # 图片识别 / Blob 转换 / Base64 编码
├── wechat/
│   ├── WeChatClient.ts        # 微信 API 封装（素材上传 / 草稿新建）
│   └── TokenManager.ts        # access_token 获取与缓存
├── components/
│   ├── ImageSettingsModal.ts  # 图片样式动态设置模态框
│   └── TemplateSettingsModal.ts # 排版参数动态设置模态框
├── toolbar/
│   └── ToolbarManager.ts      # 编辑器顶部悬浮工具栏注入与管理
└── utils/
    ├── clipboard.ts           # 剪贴板写入操作
    └── crypto.ts              # AppSecret 加密/解密
```

**关键技术依赖**：

| 依赖 | 用途 |
|---|---|
| `marked` | Markdown → HTML 解析 |
| `juice` | CSS → Inline Style 转换 |
| `highlight.js` | 代码块语法高亮 |
| Obsidian `requestUrl` | 发起微信 API 请求（免 CORS） |
| Obsidian `Vault API` | 读取本地附件文件 |

---

## 6. 非功能性需求

| 需求项 | 要求 |
|---|---|
| 大文件性能 | 包含 50 张图片的长文，完整处理流程应在 60 秒内完成 |
| 预览刷新 | 编辑后预览面板更新延迟 ≤ 500ms |
| 发布历史 | 本地记录每次推送日志（时间、文章标题、目标账号、结果状态），存于 `data.json` |
| 兼容性 | 支持 Obsidian 桌面端 v1.4+（Windows / macOS / Linux） |
| 国际化 | 初版仅支持中文界面 |

---

## 7. 里程碑规划

### Phase 1：基础排版与预览（预计 2 周）

| 交付物 | 验收标准 |
|---|---|
| Markdown → 内联 CSS HTML 引擎 | 能正确转换标题/段落/列表/代码块/表格/图片 |
| 预览面板 | 侧边栏 375px 宽度面板，实时同步渲染 |
| 默认模板 × 1 | 包含完整的排版样式规则 |
| 剪贴板复制 | 一键复制后粘贴到微信后台，格式不丢失 |

### Phase 2：微信 API 全流程打通（预计 2 周）

| 交付物 | 验收标准 |
|---|---|
| Settings Tab | 能录入 AppID/AppSecret 并通过连接测试 |
| Token 管理 | 自动获取、缓存、续期 access_token |
| 图片上传 | 本地图/外链图/Obsidian 附件均能成功上传并替换 URL |
| 草稿推送 | 一键推送后，微信后台草稿箱出现对应文章 |

### Phase 3：体验完善与模板库（预计 1~2 周）

| 交付物 | 验收标准 |
|---|---|
| 多模板支持 | ≥ 3 套内置模板 + 用户自定义模板加载 |
| 微信组件 Callout | 4 种 `[!wx-*]` 组件正确渲染 |
| 封面/摘要自动提取 | 从 Frontmatter 或正文自动提取，无需手动填写 |
| 图片预检与压缩 | 超限图片自动压缩，SVG/WebP 自动转格式 |
| 发布历史记录 | 设置页可查看历史推送记录 |
