# Obsidian WeChat Publisher

> 微信公众号排版与发布助手 — 在 Obsidian 内完成 **写作 → 排版预览 → 一键发布** 全流程闭环。

## ✨ 功能特性

- 🔄 **Markdown → 微信 HTML**：自动转换为微信公众号兼容的内联 CSS HTML
- 📱 **移动端实时预览**：375px 仿真面板，支持显示字数与作者信息，所见即所得
- 🎨 **动态排版样式**：支持在设置及工具栏中自定义模板样式（字体大小、颜色、行高、段间距等），摆脱固定模板限制
- 📋 **剪贴板模式**：排版后一键复制，粘贴到微信后台即可（适用所有公众号）
- 🚀 **API 推送模式**：一键推送到微信草稿箱（需已认证公众号），支持配置自建 API 代理地址以解决微信 IP 白名单限制
- 🖼️ **智能图片处理**：自动识别并上传各类图片，支持配置全局图片圆角、阴影和边框
- 💡 **代码高亮**：支持语法高亮度代码块渲染
- 🛠️ **编辑器浮动工具栏**：提供快捷设置入口，快速调整模板和图片样式
- 📝 **Frontmatter 支持**：自动提取标题、作者、封面、摘要

## 📦 安装

### 手动安装

1. 下载本项目的 `main.js`、`manifest.json`、`styles.css` 三个文件
2. 在你的 Obsidian Vault 目录下创建文件夹：
   ```
   .obsidian/plugins/wechat-publisher/
   ```
3. 将三个文件复制到该文件夹
4. 重启 Obsidian → **设置 → 第三方插件** → 关闭安全模式 → 启用 **WeChat Publisher**

### 从源码构建

```bash
git clone <repo-url>
cd project_ObsidianPlugin
npm install
npm run build
```

构建完成后将 `main.js`、`manifest.json`、`styles.css` 复制到 Vault 插件目录。

## 🚀 使用方法

### 预览排版

点击侧边栏 💬 图标，或使用命令面板 `Cmd/Ctrl + P`：

```
WeChat Publisher: 打开预览面板
```

预览面板顶部可切换排版模板，实时查看效果。

### 复制排版 HTML（剪贴板模式）

```
WeChat Publisher: 复制为微信排版 HTML
```

复制后到微信公众号后台 → 新建图文 → `Cmd/Ctrl + V` 粘贴。

### 推送到草稿箱（API 模式）

1. 在 **设置 → WeChat Publisher** 中切换到 API 模式
2. 输入公众号的 **AppID** 和 **AppSecret**
3. （可选）如服务器部署了反向代理解决 IP 白名单问题，请填写「自建 API 代理地址」
4. 点击「测试连接」确认授权成功
5. 使用命令或点击预览面板工具栏：
   ```
   WeChat Publisher: 推送到草稿箱
   ```

> ⚠️ API 模式仅对已认证的订阅号/服务号可用。个人未认证订阅号请使用剪贴板模式。

### 自定义排版样式

不再受限于固定的模板包，您可以通过顶部状态栏或设置面板，直接调整当前的排版参数，包括：
- 标题的大小、颜色、上下边距
- 正文的大小、行高
- 页边距
- 图片的圆角、阴影、边框厚度及颜色

所有样式修改将即时作用于预览面板，真正实现「所见即所得」。

## 📝 Frontmatter

在文章开头添加 YAML Frontmatter 控制发布参数（均为可选）：

```yaml
---
title: "文章标题"
author: "作者名"
cover: "assets/cover.jpg"
digest: "文章摘要"
wx_template: "tech-dark"
tags: [标签1, 标签2]
---
```

| 字段 | 说明 | 缺省行为 |
|---|---|---|
| `title` | 文章标题 | 取文档第一个 H1 或文件名 |
| `author` | 作者名 | 使用设置中的默认作者 |
| `cover` | 封面图路径 | 取文章首张图片 |
| `digest` | 摘要 | 自动截取正文前 120 字 |
| `wx_template` | 排版模板 ID | 使用设置中的默认模板 |

## 🧩 微信专属组件

使用 Obsidian Callout 语法创建微信公众号特有的排版组件：

```markdown
> [!wx-follow]
> 点击上方蓝字关注我们

> [!wx-quote]
> 一段精彩的引语 —— 作者

> [!wx-card]
> **知识卡片标题**
> 卡片正文内容

> [!wx-note color=green]
> 绿色提示信息块
```

## 🏗️ 项目结构

```
src/
├── main.ts                    # 插件入口
├── settings.ts                # 设置面板与配置类型
├── views/
│   └── PreviewView.ts         # 375px 实时预览面板
├── core/
│   ├── MarkdownRenderer.ts    # Markdown → 微信 HTML & CSS 内联引擎
│   └── ImageProcessor.ts      # 图片处理（剪贴板模式 Base64）
├── wechat/
│   ├── WeChatClient.ts        # 微信 API 及图片/草稿上传封装
│   └── TokenManager.ts        # Token 缓存管理
├── components/
│   ├── ImageSettingsModal.ts  # 图片排版样式设置弹窗
│   └── TemplateSettingsModal.ts # 动态模板参数设置弹窗
├── toolbar/
│   └── ToolbarManager.ts      # 编辑器顶部快捷操作栏
└── utils/
    ├── clipboard.ts           # 剪贴板工具
    └── crypto.ts              # 数据加密存储
```

## 🔒 安全与隐私

- `AppSecret` 在本地以加密方式存储，**不会上传到任何第三方服务器**
- 所有微信 API 请求直接从本地发出，不经过代理
- 插件代码完全开源，不包含任何远程上报逻辑

## 📄 License

MIT
