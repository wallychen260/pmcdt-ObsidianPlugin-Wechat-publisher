import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type WeChatPublisherPlugin from './main';
import { encrypt, decrypt } from './utils/crypto';

export interface WeChatTemplate {
    id: string;
    name: string;
    headingFontSize: string;
    headingColor: string;
    textFontSize: string;
    marginTop: string;
    marginBottom: string;
    lineHeight: string;
    paddingSide: string;
}

export interface WeChatPublisherSettings {
    appId: string;
    appSecretEncrypted: string;
    apiProxyUrl: string;
    defaultAuthor: string;
    workMode: 'api' | 'clipboard';
    publishHistory: PublishRecord[];
    imageBorderRadius: string;
    imageBoxShadow: string;
    imageBorderColor: string;
    imageBorderThickness: string;
    templates: WeChatTemplate[];
    activeTemplateId: string;
}

export interface PublishRecord {
    timestamp: number;
    title: string;
    status: 'success' | 'failed';
    mediaId?: string;
    error?: string;
}

export const DEFAULT_SETTINGS: WeChatPublisherSettings = {
    appId: '',
    appSecretEncrypted: '',
    apiProxyUrl: 'https://api.weixin.qq.com',
    defaultAuthor: '',
    workMode: 'clipboard',
    publishHistory: [],
    imageBorderRadius: '8px',
    imageBoxShadow: 'none',
    imageBorderColor: '#e5e5e5',
    imageBorderThickness: '0px',
    templates: [{
        id: 'default',
        name: '默认模板',
        headingFontSize: '',
        headingColor: '',
        textFontSize: '',
        marginTop: '',
        marginBottom: '',
        lineHeight: '',
        paddingSide: ''
    }],
    activeTemplateId: 'default'
};

export class WeChatPublisherSettingTab extends PluginSettingTab {
    plugin: WeChatPublisherPlugin;
    private appSecretInput: string = '';

    constructor(app: App, plugin: WeChatPublisherPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '微信公众号排版发布助手 设置' });

        // --- Work Mode ---
        containerEl.createEl('h3', { text: '工作模式' });

        new Setting(containerEl)
            .setName('工作模式')
            .setDesc('API 模式需要已认证的公众号；剪贴板模式适用于所有公众号')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('clipboard', '📋 剪贴板模式（通用）')
                    .addOption('api', '🔗 API 模式（需认证公众号）')
                    .setValue(this.plugin.settings.workMode)
                    .onChange(async (value) => {
                        this.plugin.settings.workMode = value as 'api' | 'clipboard';
                        await this.plugin.saveSettings();
                        this.display(); // Re-render to show/hide API fields
                    });
            });

        // --- API Settings (only shown in API mode) ---
        if (this.plugin.settings.workMode === 'api') {
            containerEl.createEl('h3', { text: '微信公众号授权' });

            new Setting(containerEl)
                .setName('AppID')
                .setDesc('微信公众号的 AppID')
                .addText(text => {
                    text
                        .setPlaceholder('请输入 AppID')
                        .setValue(this.plugin.settings.appId)
                        .onChange(async (value) => {
                            this.plugin.settings.appId = value.trim();
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('AppSecret')
                .setDesc('微信公众号的 AppSecret（加密存储于本地，不会上传到任何服务器）')
                .addText(text => {
                    const currentSecret = decrypt(this.plugin.settings.appSecretEncrypted);
                    text
                        .setPlaceholder('请输入 AppSecret')
                        .setValue(currentSecret)
                        .inputEl.type = 'password';
                    text.onChange(async (value) => {
                        this.appSecretInput = value.trim();
                        this.plugin.settings.appSecretEncrypted = encrypt(this.appSecretInput);
                        await this.plugin.saveSettings();
                    });
                });

            new Setting(containerEl)
                .setName('自建 API 代理地址 (解决 IP 白名单问题)')
                .setDesc('默认: https://api.weixin.qq.com。如果通过云函数代理了请求，填写代理的 URL')
                .addText(text => {
                    text
                        .setPlaceholder('https://api.weixin.qq.com')
                        .setValue(this.plugin.settings.apiProxyUrl || 'https://api.weixin.qq.com')
                        .onChange(async (value) => {
                            let val = value.trim();
                            // remove trailing slash if any
                            if (val.endsWith('/')) val = val.slice(0, -1);
                            this.plugin.settings.apiProxyUrl = val || 'https://api.weixin.qq.com';
                            await this.plugin.saveSettings();
                        });
                });

            new Setting(containerEl)
                .setName('连接测试')
                .setDesc('验证 AppID 和 AppSecret 是否正确')
                .addButton(button => {
                    button
                        .setButtonText('测试连接')
                        .setCta()
                        .onClick(async () => {
                            button.setButtonText('测试中...');
                            button.setDisabled(true);
                            try {
                                this.plugin.updateWeChatClient();
                                const success = await this.plugin.wechatClient.testConnection();
                                if (success) {
                                    new Notice('✅ 连接成功！公众号授权验证通过');
                                } else {
                                    new Notice('❌ 连接失败，请检查 AppID 和 AppSecret');
                                }
                            } catch (e) {
                                new Notice(`❌ 连接失败: ${e instanceof Error ? e.message : '未知错误'}`);
                            }
                            button.setButtonText('测试连接');
                            button.setDisabled(false);
                        });
                });
        }

        // --- General Settings ---
        containerEl.createEl('h3', { text: '通用设置' });

        new Setting(containerEl)
            .setName('默认作者')
            .setDesc('Frontmatter 中未指定 author 时使用的默认作者名')
            .addText(text => {
                text
                    .setPlaceholder('作者名')
                    .setValue(this.plugin.settings.defaultAuthor)
                    .onChange(async (value) => {
                        this.plugin.settings.defaultAuthor = value;
                        await this.plugin.saveSettings();
                    });
            });

        // Image Settings have been moved to the editor top toolbar modal

        // --- Publish History ---
        if (this.plugin.settings.publishHistory.length > 0) {
            containerEl.createEl('h3', { text: '发布历史' });

            const historyContainer = containerEl.createEl('div', { cls: 'wx-publish-history' });
            const recentHistory = this.plugin.settings.publishHistory.slice(-10).reverse();

            for (const record of recentHistory) {
                const item = historyContainer.createEl('div', { cls: 'wx-history-item' });
                const date = new Date(record.timestamp);
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                const statusIcon = record.status === 'success' ? '✅' : '❌';
                item.createEl('span', { text: `${statusIcon} ${dateStr} — ${record.title}` });
            }

            new Setting(containerEl)
                .setName('清除历史')
                .addButton(button => {
                    button.setButtonText('清除所有记录').onClick(async () => {
                        this.plugin.settings.publishHistory = [];
                        await this.plugin.saveSettings();
                        this.display();
                    });
                });
        }
    }
}
