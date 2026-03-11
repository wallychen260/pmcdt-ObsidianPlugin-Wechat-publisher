import { App, Modal, Setting, Notice } from 'obsidian';
import type WeChatPublisherPlugin from '../main';
import type { WeChatTemplate } from '../settings';

export class TemplateSettingsModal extends Modal {
    plugin: WeChatPublisherPlugin;

    constructor(app: App, plugin: WeChatPublisherPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        this.display();
    }

    display() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: '微信排版模板设置' });
        contentEl.createEl('p', { text: '模板可全局控制排版的主题样式。', cls: 'setting-item-description' });

        let activeTemplate = this.plugin.settings.templates.find(t => t.id === this.plugin.settings.activeTemplateId);

        // Template Selection Header
        const headerEl = contentEl.createEl('div', { cls: 'template-modal-header', attr: { style: 'display: flex; gap: 10px; margin-bottom: 20px; align-items: center;' } });

        const selectEl = headerEl.createEl('select', { cls: 'dropdown' });

        const blankOption = selectEl.createEl('option', { value: 'blank', text: '空白模板 (无预设)' });
        if (this.plugin.settings.activeTemplateId === 'blank') blankOption.selected = true;

        this.plugin.settings.templates.forEach(t => {
            const option = selectEl.createEl('option', { value: t.id, text: t.name });
            if (activeTemplate && t.id === activeTemplate.id) option.selected = true;
        });

        selectEl.onchange = async () => {
            this.plugin.settings.activeTemplateId = selectEl.value;
            await this.plugin.saveSettings();
            this.display(); // re-render
        };

        const addBtn = headerEl.createEl('button', { text: '添加新模板' });
        addBtn.onclick = async () => {
            const newId = Date.now().toString();
            const newTemplate: WeChatTemplate = {
                id: newId,
                name: `新建模板 ${this.plugin.settings.templates.length + 1}`,
                headingFontSize: '',
                headingColor: '',
                textFontSize: '',
                marginTop: '',
                marginBottom: '',
                lineHeight: '',
                paddingSide: ''
            };
            this.plugin.settings.templates.push(newTemplate);
            this.plugin.settings.activeTemplateId = newId;
            await this.plugin.saveSettings();
            new Notice('已添加新模板');
            this.display();
        };

        const delBtn = headerEl.createEl('button', { text: '删除', cls: 'mod-warning' });
        if (!activeTemplate || this.plugin.settings.templates.length <= 1) delBtn.style.display = 'none';
        delBtn.onclick = async () => {
            if (!activeTemplate) return;
            this.plugin.settings.templates = this.plugin.settings.templates.filter(t => t.id !== activeTemplate.id);
            this.plugin.settings.activeTemplateId = this.plugin.settings.templates[0].id;
            await this.plugin.saveSettings();
            new Notice('模板已删除');
            this.display();
        };

        if (!activeTemplate) {
            contentEl.createEl('p', { text: '当前选择的是空白模板，不会应用任何预设排版样式。', attr: { style: 'color: var(--text-muted); margin-top: 20px; text-align: center;' } });
            return;
        }

        // Template Name
        new Setting(contentEl)
            .setName('模板名称')
            .addText(text => text
                .setValue(activeTemplate.name)
                .onChange(async (value) => {
                    activeTemplate.name = value || '未命名模板';
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('段落标题字号')
            .setDesc('如: 18px。留空则保持默认')
            .addText(text => text
                .setValue(activeTemplate.headingFontSize)
                .onChange(async (value) => {
                    activeTemplate.headingFontSize = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('段落标题颜色')
            .setDesc('如: #ff0000。留空则不改变颜色')
            .addText(text => {
                text.setValue(activeTemplate.headingColor)
                    .onChange(async (value) => {
                        activeTemplate.headingColor = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(contentEl)
            .setName('正文字号')
            .setDesc('如: 16px。留空保持默认')
            .addText(text => text
                .setValue(activeTemplate.textFontSize)
                .onChange(async (value) => {
                    activeTemplate.textFontSize = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('两端缩进')
            .setDesc('如: 0px, 8px, 16px。留空保持默认')
            .addText(text => text
                .setValue(activeTemplate.paddingSide)
                .onChange(async (value) => {
                    activeTemplate.paddingSide = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('段前距')
            .setDesc('如: 15px。留空保持默认')
            .addText(text => text
                .setValue(activeTemplate.marginTop)
                .onChange(async (value) => {
                    activeTemplate.marginTop = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('段后距')
            .setDesc('如: 15px。留空保持默认')
            .addText(text => text
                .setValue(activeTemplate.marginBottom)
                .onChange(async (value) => {
                    activeTemplate.marginBottom = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(contentEl)
            .setName('行间距')
            .setDesc('如: 1.75。留空保持默认')
            .addText(text => text
                .setValue(activeTemplate.lineHeight)
                .onChange(async (value) => {
                    activeTemplate.lineHeight = value;
                    await this.plugin.saveSettings();
                })
            );
    }

    onClose() {
        this.contentEl.empty();
    }
}
