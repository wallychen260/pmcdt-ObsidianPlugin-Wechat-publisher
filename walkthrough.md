# Obsidian WeChat Publisher — 完成报告 & 使用指南

## 已完成的功能

| 功能 | 状态 |
|---|---|
| Markdown → 微信内联 HTML 转换 | ✅ |
| 侧边栏 375px 移动端预览面板 | ✅ |
| 3 套内置排版模板（默认 / 科技暗色 / 典雅宋体） | ✅ |
| 微信 Callout 组件（`wx-follow` / `wx-quote` / `wx-card` / `wx-note`） | ✅ |
| CSS 内联化引擎（juice） | ✅ |
| 图片处理（Obsidian 附件 / 本地 / 远程 → Base64） | ✅ |
| 一键复制为微信排版 HTML（剪贴板模式） | ✅ |
| 微信 API 推送到草稿箱（API 模式） | ✅ |
| Settings Tab（AppID/Secret/模板/模式/发布历史） | ✅ |
| 代码块语法高亮（highlight.js） | ✅ |
| Frontmatter 自动提取（title/author/cover/digest） | ✅ |
| 发布历史记录 | ✅ |

## 构建验证

```
✅ npm install — 54 packages installed
✅ npm run build — esbuild production bundle (main.js 1.5MB)
输出文件: main.js, manifest.json, styles.css
```

---

## 🚀 安装使用指南

### 第一步：安装插件到 Obsidian

1. 打开你的 Obsidian Vault 所在的文件夹
2. 进入 `.obsidian/plugins/` 目录（如果不存在 `plugins` 文件夹，手动新建一个）
3. 在 `plugins/` 下新建文件夹 `wechat-publisher`
4. 将以下 3 个文件复制到 `wechat-publisher/` 文件夹中：

```
从项目目录 project_ObsidianPlugin/ 复制：
  ├── main.js
  ├── manifest.json
  └── styles.css

目标位置:
  你的Vault/.obsidian/plugins/wechat-publisher/
  ├── main.js
  ├── manifest.json
  └── styles.css
```

5. **重启 Obsidian**
6. 进入 **设置 → 第三方插件**，关闭"安全模式"
7. 在已安装插件列表中找到 **WeChat Publisher**，点击启用开关 ✅

### 第二步：配置插件

进入 **设置 → WeChat Publisher**：

- **工作模式**：
  - 📋 **剪贴板模式**（推荐先用）：排版后复制 HTML，手动粘贴到微信后台
  - 🔗 **API 模式**：需要已认证的订阅号/服务号的 AppID 和 AppSecret
- **默认作者**：设置你的默认署名
- **默认模板**：选择默认排版风格

### 第三步：使用插件

#### 📖 预览排版效果
- 点击侧边栏的 💬 图标，打开微信预览面板
- 或使用命令面板 `Ctrl/Cmd + P` → 搜索 `WeChat Publisher: 打开预览面板`

#### 📋 复制排版 HTML（剪贴板模式）
1. 打开要发布的 Markdown 文件
2. 命令面板搜索 `WeChat Publisher: 复制为微信排版 HTML`
3. 打开微信公众号后台 → 新建图文 → `Ctrl/Cmd + V` 粘贴

#### 🚀 推送到草稿箱（API 模式）
1. 确保已在设置中填写 AppID/AppSecret 并通过连接测试
2. 打开要发布的 Markdown 文件
3. 命令面板搜索 `WeChat Publisher: 推送到草稿箱`
4. 等待成功提示，到微信后台检查草稿箱

#### 🎨 切换排版模板
- 在预览面板顶部的下拉菜单中切换
- 或命令面板 `WeChat Publisher: 切换排版模板` 快速轮换
- 内置 3 套模板：**默认模板** / **科技暗色** / **典雅宋体**

### Frontmatter 推荐格式

在文章开头添加（可选）：

```yaml
---
title: "你的文章标题"
author: "作者名"
cover: "assets/cover.jpg"
digest: "文章摘要，会显示在公众号列表中"
wx_template: "tech-dark"
---
```
