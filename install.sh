#!/bin/bash
# WeChat Publisher Plugin Installer
# 将构建好的插件文件安装到 Obsidian Vault 的 plugins 目录

PLUGIN_DIR="$(dirname "$0")"
VAULT_PLUGIN_DIR="$PLUGIN_DIR/../.obsidian/plugins/wechat-publisher"

echo "📦 正在安装 WeChat Publisher 插件..."
echo "   源目录: $PLUGIN_DIR"
echo "   目标: $VAULT_PLUGIN_DIR"

mkdir -p "$VAULT_PLUGIN_DIR"

cp -f "$PLUGIN_DIR/main.js" "$VAULT_PLUGIN_DIR/main.js"
cp -f "$PLUGIN_DIR/manifest.json" "$VAULT_PLUGIN_DIR/manifest.json"
cp -f "$PLUGIN_DIR/styles.css" "$VAULT_PLUGIN_DIR/styles.css"

if [ $? -eq 0 ]; then
    echo "✅ 安装成功！请重启 Obsidian 使更改生效。"
else
    echo "❌ 安装失败，请检查文件权限。"
    exit 1
fi
