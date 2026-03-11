import { App, Modal, Setting, Notice } from 'obsidian';
import type WeChatPublisherPlugin from '../main';

export class ImageSettingsModal extends Modal {
    plugin: WeChatPublisherPlugin;

    constructor(app: App, plugin: WeChatPublisherPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '全局图片样式设置' });
        contentEl.createEl('p', { text: '在此处设置的全局样式将会应用到生成的微信排版中所有的插图身上（注：不包括封面图）。', cls: 'setting-item-description' });

        new Setting(contentEl)
            .setName('图片圆角')
            .setDesc('例如: 8px 或 10px。不需要请填 0px')
            .addText(text => text
                .setValue(this.plugin.settings.imageBorderRadius)
                .onChange(async (value) => {
                    this.plugin.settings.imageBorderRadius = value || '0px';
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('图片阴影 (Box Shadow)')
            .setDesc('例如: 0 4px 8px rgba(0,0,0,0.1)。不需要请填 none')
            .addText(text => text
                .setValue(this.plugin.settings.imageBoxShadow)
                .onChange(async (value) => {
                    this.plugin.settings.imageBoxShadow = value || 'none';
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('图片边框粗细')
            .setDesc('例如: 1px。不需要请填 0px')
            .addText(text => text
                .setValue(this.plugin.settings.imageBorderThickness)
                .onChange(async (value) => {
                    this.plugin.settings.imageBorderThickness = value || '0px';
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('图片边框颜色')
            .setDesc('例如: #e5e5e5。当边框粗细大于0时生效')
            .addText(text => text
                .setValue(this.plugin.settings.imageBorderColor)
                .onChange(async (value) => {
                    this.plugin.settings.imageBorderColor = value || '#e5e5e5';
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText('完成设置')
                    .setCta()
                    .onClick(() => {
                        this.close();
                        new Notice('✅ 图片全局样式已保存并即将生效！');
                    });
            });
    }

    onClose() {
        this.contentEl.empty();
    }
}
