import { App, MarkdownView, Notice, Editor, Menu, setIcon } from 'obsidian';
import type WeChatPublisherPlugin from '../main';
import { ImageSettingsModal } from '../components/ImageSettingsModal';
import { TemplateSettingsModal } from '../components/TemplateSettingsModal';

export class ToolbarManager {
    plugin: WeChatPublisherPlugin;
    app: App;
    private toolbarEl: HTMLElement | null = null;
    private activeView: MarkdownView | null = null;
    private fontSizeSpan: HTMLElement | null = null;

    // Store bound event handlers to remove them later
    private onEditorInteractionBound = this.onEditorInteraction.bind(this);

    constructor(app: App, plugin: WeChatPublisherPlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    // Bind event to track view changes and inject toolbar
    onload() {
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => this.checkAndInjectToolbar())
        );
        this.plugin.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.checkAndInjectToolbar())
        );
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', () => this.checkAndInjectToolbar())
        );

        // Initial check
        this.app.workspace.onLayoutReady(() => {
            this.checkAndInjectToolbar();
        });
    }

    onunload() {
        this.removeToolbar();
    }

    private checkAndInjectToolbar() {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);

        if (view === this.activeView && this.toolbarEl && this.toolbarEl.parentElement) {
            // Already injected in the current view
            return;
        }

        this.removeToolbar();
        this.activeView = view;

        if (view) {
            this.injectToolbar(view);
            // Attach event listeners for selection/cursor changes
            view.contentEl.addEventListener('mouseup', this.onEditorInteractionBound);
            view.contentEl.addEventListener('keyup', this.onEditorInteractionBound);
        }
    }

    private removeToolbar() {
        if (this.activeView) {
            this.activeView.contentEl.removeEventListener('mouseup', this.onEditorInteractionBound);
            this.activeView.contentEl.removeEventListener('keyup', this.onEditorInteractionBound);
        }

        if (this.toolbarEl) {
            this.toolbarEl.remove();
            this.toolbarEl = null;
        }
        this.fontSizeSpan = null;
    }

    private injectToolbar(view: MarkdownView) {
        // We inject it into the view-content so it stays sticky above the editor
        const viewContent = view.containerEl.querySelector('.view-content');
        if (!viewContent) return;

        this.toolbarEl = document.createElement('div');
        this.toolbarEl.addClass('wechat-publisher-toolbar');
        this.buildToolbarContent(this.toolbarEl);

        // Prepend so it appears at the very top of the editing area
        viewContent.insertBefore(this.toolbarEl, viewContent.firstChild);
    }

    private buildToolbarContent(container: HTMLElement) {
        // --- Left side: Formatting ---
        const leftGroup = container.createEl('div', { cls: 'wx-toolbar-group' });

        // Font Size Dropdown
        const fontSizeBtn = leftGroup.createEl('button', { cls: 'wx-toolbar-btn', title: '字号' });
        this.fontSizeSpan = fontSizeBtn.createEl('span', { text: '17px' });

        fontSizeBtn.onclick = (e) => {
            const menu = new Menu();
            ['12', '14', '15', '16', '17', '18', '20', '24'].forEach(size => {
                menu.addItem((item) => {
                    item.setTitle(`${size}px`);
                    // Apply exact style to dropdown item
                    const titleEl = (item as any).titleEl as HTMLElement;
                    if (titleEl) {
                        titleEl.style.fontSize = `${size}px`;
                        titleEl.style.lineHeight = '1.5';
                    }
                    item.onClick(() => {
                        this.applyInlineStyle(`font-size: ${size}px;`);
                        if (this.fontSizeSpan) this.fontSizeSpan.innerText = `${size}px`;
                    });
                });
            });
            menu.showAtMouseEvent(e);
        };

        // Bold
        const boldBtn = this.createButton(leftGroup, 'B', '加粗', () => {
            this.wrapSelectionWith('**', '**');
        });
        Object.assign(boldBtn.style, { fontWeight: '600', fontSize: '15px' });

        // Underline
        const underlineBtn = this.createButton(leftGroup, 'U', '下划线', () => {
            this.wrapSelectionWith('<u>', '</u>');
        });
        Object.assign(underlineBtn.style, { textDecoration: 'underline', fontSize: '15px' });

        // Strikethrough
        const strikeBtn = this.createButton(leftGroup, 'S', '删除线', () => {
            this.wrapSelectionWith('~~', '~~');
        });
        Object.assign(strikeBtn.style, { textDecoration: 'line-through', fontSize: '15px' });

        // Color
        const colorInputContainer = leftGroup.createEl('span', { cls: 'wx-color-picker-wrapper', title: '字体颜色' });
        const colorTextSpan = colorInputContainer.createEl('span', { text: 'A', cls: 'wx-color-picker-text', title: '字体颜色' });
        const colorInput = colorInputContainer.createEl('input', { type: 'color', cls: 'wx-toolbar-color', title: '字体颜色' });
        colorInput.value = '#000000';
        colorInput.addEventListener('change', (e) => {
            const color = (e.target as HTMLInputElement).value;
            this.applyInlineStyle(`color: ${color};`);
            colorTextSpan.style.borderBottomColor = color;
        });

        // Text align Dropdown
        const alignBtn = this.createIconButton(leftGroup, 'align-left', '对齐方式', (e) => {
            const menu = new Menu();

            menu.addItem(item => {
                item.setIcon('align-left').setTitle('左对齐').onClick(() => this.applyBlockStyle('text-align: left;'));
            });
            menu.addItem(item => {
                item.setIcon('align-center').setTitle('居中对齐').onClick(() => this.applyBlockStyle('text-align: center;'));
            });
            menu.addItem(item => {
                item.setIcon('align-right').setTitle('右对齐').onClick(() => this.applyBlockStyle('text-align: right;'));
            });
            menu.addItem(item => {
                item.setIcon('align-justify').setTitle('两端对齐').onClick(() => this.applyBlockStyle('text-align: justify;'));
            });
            menu.showAtMouseEvent(e);
        });

        // Margin Top
        this.createIconButton(leftGroup, 'arrow-up-to-line', '段前距', (e) => {
            const menu = new Menu();
            ['0', '8', '16', '24', '32', '40', '48'].forEach(size => {
                menu.addItem(item => {
                    item.setTitle(`段前 ${size}px`).onClick(() => this.applyBlockStyle(`margin-top: ${size}px;`));
                });
            });
            menu.showAtMouseEvent(e);
        });

        // Margin Bottom
        this.createIconButton(leftGroup, 'arrow-down-to-line', '段后距', (e) => {
            const menu = new Menu();
            ['0', '8', '16', '24', '32', '40', '48'].forEach(size => {
                menu.addItem(item => {
                    item.setTitle(`段后 ${size}px`).onClick(() => this.applyBlockStyle(`margin-bottom: ${size}px;`));
                });
            });
            menu.showAtMouseEvent(e);
        });

        // Line Height
        this.createIconButton(leftGroup, 'move-vertical', '行间距', (e) => {
            const menu = new Menu();
            ['1', '1.2', '1.5', '1.6', '1.75', '2', '2.5', '3', '4', '5'].forEach(size => {
                menu.addItem(item => {
                    item.setTitle(`${size} 倍`).onClick(() => this.applyBlockStyle(`line-height: ${size};`));
                });
            });
            menu.showAtMouseEvent(e);
        });

        // Indent (edges)
        this.createIconButton(leftGroup, 'align-justify', '两端缩进', (e) => {
            const menu = new Menu();
            ['0', '8', '16', '32', '48'].forEach(size => {
                menu.addItem(item => {
                    item.setTitle(`缩进 ${size}px`).onClick(() => {
                        this.applyBlockStyle(`padding-left: ${size}px; padding-right: ${size}px;`);
                    });
                });
            });
            menu.showAtMouseEvent(e);
        });

        // Ordered List
        this.createIconButton(leftGroup, 'list-ordered', '有序列表', () => {
            const editor = this.getEditor();
            if (!editor) return;
            const cursor = editor.getCursor();
            const line = editor.getLine(cursor.line);
            editor.replaceRange('1. ', { line: cursor.line, ch: 0 });
        });

        // Templates
        this.createIconButton(leftGroup, 'layout-template', '排版模板', () => {
            new TemplateSettingsModal(this.app, this.plugin).open();
        });

        // Image Settings
        const imgBtn = this.createIconButton(leftGroup, 'image', '图片全局样式', () => {
            new ImageSettingsModal(this.app, this.plugin).open();
        });

        // --- Spacer to fill width ---
        container.createEl('div', { cls: 'wx-toolbar-spacer' });
    }

    private createButton(parent: HTMLElement, text: string, title: string, onClick: (e: MouseEvent) => void): HTMLElement {
        const btn = parent.createEl('button', { text, title, cls: 'wx-toolbar-btn' });
        btn.onclick = onClick;
        return btn;
    }

    private createIconButton(parent: HTMLElement, iconId: string, title: string, onClick: (e: MouseEvent) => void): HTMLElement {
        const btn = parent.createEl('button', { title, cls: 'wx-toolbar-btn' });
        setIcon(btn, iconId);
        btn.onclick = onClick;
        return btn;
    }

    private getEditor(): Editor | null {
        if (!this.activeView) {
            new Notice('找不到活动编辑器');
            return null;
        }
        return this.activeView.editor;
    }

    private onEditorInteraction() {
        // Use a small timeout to let the editor update its cursor/selection state
        setTimeout(() => this.updateToolbarState(), 50);
    }

    private updateToolbarState() {
        const editor = this.getEditor();
        if (!editor || !this.fontSizeSpan) return;

        const selection = editor.getSelection();
        let currentSize = '17px'; // default size

        // If selection itself contains a font-size tag
        if (selection && selection.match(/font-size:\s*(\d+)px/i)) {
            const match = selection.match(/font-size:\s*(\d+)px/i);
            if (match && match[1]) {
                currentSize = `${match[1]}px`;
            }
        } else {
            // Find if cursor is inside a span with font-size
            const cursor = editor.getCursor();
            const lineText = editor.getLine(cursor.line);
            const textBeforeCursor = lineText.substring(0, cursor.ch);

            // Match all starting span tags with font-size before the cursor
            const matches = [...textBeforeCursor.matchAll(/<span[^>]*style=["'][^"']*font-size:\s*(\d+)px[^"']*["'][^>]*>/gi)];
            if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                const textAfterSpan = textBeforeCursor.substring(lastMatch.index! + lastMatch[0].length);
                // If the span is NOT closed before the cursor, we are currently inside it
                if (!textAfterSpan.includes('</span>')) {
                    currentSize = `${lastMatch[1]}px`;
                }
            }
        }

        if (this.fontSizeSpan.innerText !== currentSize) {
            this.fontSizeSpan.innerText = currentSize;
        }
    }

    // Applies an HTML span tag with the given style to the selected text
    private applyInlineStyle(styleAttr: string) {
        const editor = this.getEditor();
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) {
            new Notice('请先选中一段文字');
            return;
        }

        const newText = `<span style="${styleAttr}">${selection}</span>`;
        editor.replaceSelection(newText);
    }

    // Wraps the selected text in a div/section with block styles
    private applyBlockStyle(styleAttr: string) {
        const editor = this.getEditor();
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) {
            // Apply to whole current paragraph if no selection
            const cursor = editor.getCursor();
            const lineHtml = `<section style="${styleAttr}">\n\n${editor.getLine(cursor.line)}\n\n</section>`;
            editor.setLine(cursor.line, lineHtml);
            return;
        }

        const newText = `\n<section style="${styleAttr}">\n\n${selection}\n\n</section>\n`;
        editor.replaceSelection(newText);
    }

    private wrapSelectionWith(before: string, after: string) {
        const editor = this.getEditor();
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) {
            new Notice('请先选中文字');
            return;
        }

        editor.replaceSelection(`${before}${selection}${after}`);
    }
}
