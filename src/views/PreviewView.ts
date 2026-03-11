import { ItemView, WorkspaceLeaf, debounce, MarkdownRenderer, Component } from 'obsidian';
import type WeChatPublisherPlugin from '../main';
import { preserveMultipleNewlines } from '../core/MarkdownRenderer';

export const VIEW_TYPE_WECHAT_PREVIEW = 'wechat-preview-view';

export class PreviewView extends ItemView {
    plugin: WeChatPublisherPlugin;
    private previewContainer: HTMLElement | null = null;
    private phoneTitleEl: HTMLElement | null = null;
    private coverContainer: HTMLElement | null = null;
    private articleTitleEl: HTMLElement | null = null;
    private articleMetaEl: HTMLElement | null = null;
    private renderComponent: Component;

    constructor(leaf: WorkspaceLeaf, plugin: WeChatPublisherPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.renderComponent = new Component();
    }

    getViewType(): string {
        return VIEW_TYPE_WECHAT_PREVIEW;
    }

    getDisplayText(): string {
        return '微信公众号预览';
    }

    getIcon(): string {
        return 'message-circle';
    }

    async onOpen() {
        this.renderComponent.load();

        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('wx-preview-root');

        // --- Toolbar ---
        const toolbar = container.createEl('div', { cls: 'wx-preview-toolbar' });

        // Refresh button
        const refreshBtn = toolbar.createEl('button', { text: '刷新' });
        refreshBtn.addEventListener('click', () => this.updatePreview());

        // Copy button
        const copyBtn = toolbar.createEl('button', { text: '复制 HTML' });
        copyBtn.addEventListener('click', () => {
            this.plugin.copyToClipboardCommand();
        });

        // Push button
        const pushBtn = toolbar.createEl('button', { text: '推送到草稿箱', cls: 'mod-cta' });
        pushBtn.addEventListener('click', () => {
            this.plugin.pushToDraftCommand();
        });

        // --- Phone Frame ---
        const phoneFrame = container.createEl('div', { cls: 'wx-preview-phone-frame' });

        // Phone header bar
        const phoneHeader = phoneFrame.createEl('div', { cls: 'wx-preview-phone-header' });
        this.phoneTitleEl = phoneHeader.createEl('span', { text: '微信公众号', cls: 'wx-preview-phone-title' });

        this.coverContainer = phoneFrame.createEl('div', { cls: 'wx-preview-cover-container' });
        Object.assign(this.coverContainer.style, {
            position: 'relative',
            width: '100%',
            backgroundColor: '#f1f1f1',
            display: 'flex',
            flexDirection: 'column',
        });

        this.articleTitleEl = phoneFrame.createEl('div', { cls: 'wx-preview-article-title' });
        Object.assign(this.articleTitleEl.style, {
            padding: '15px 15px 0 15px',
            fontSize: '22px',
            fontWeight: 'bold',
            lineHeight: '1.4',
            color: 'var(--text-normal)'
        });

        this.articleMetaEl = phoneFrame.createEl('div', { cls: 'wx-preview-article-meta' });
        Object.assign(this.articleMetaEl.style, {
            padding: '10px 15px 5px 15px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        });

        // Content area
        this.previewContainer = phoneFrame.createEl('div', { cls: 'wx-preview-content markdown-reading-view markdown-preview-view markdown-rendered' });

        // Initial render
        this.updatePreview();

        // Listen for active file change
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.debouncedUpdate();
            })
        );

        // Listen for file content changes
        this.registerEvent(
            this.app.vault.on('modify', () => {
                this.debouncedUpdate();
            })
        );
    }

    private debouncedUpdate = debounce(() => {
        this.updatePreview();
    }, 300, true);

    async updatePreview() {
        if (!this.previewContainer) return;

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile || activeFile.extension !== 'md') {
            this.previewContainer.innerHTML = '<div style="padding:20px;color:#999;text-align:center;">请打开一个 Markdown 文件</div>';
            return;
        }

        try {
            const content = await this.app.vault.cachedRead(activeFile);
            const fm = this.plugin.parseFrontmatter(content);
            const title = this.plugin.getArticleTitle(content, activeFile, fm);

            if (this.phoneTitleEl) this.phoneTitleEl.innerText = title;
            if (this.articleTitleEl) this.articleTitleEl.innerText = title;

            if (this.coverContainer) {
                this.coverContainer.empty();
                const coverPathOrUrl = this.plugin.getCoverImagePath(content, activeFile, fm);
                const coverUrl = coverPathOrUrl ? this.plugin.getCoverImageResourcePath(coverPathOrUrl, activeFile) : null;

                if (coverUrl) {
                    const img = this.coverContainer.createEl('img');
                    img.src = coverUrl;
                    Object.assign(img.style, {
                        width: '100%',
                        maxHeight: '180px',
                        objectFit: 'cover',
                        display: 'block'
                    });
                } else {
                    const placeholder = this.coverContainer.createEl('div');
                    Object.assign(placeholder.style, {
                        width: '100%',
                        height: '140px',
                        backgroundColor: '#f5f5f5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        borderBottom: '1px solid #eaeaea'
                    });

                    const warningBox = placeholder.createEl('div');
                    Object.assign(warningBox.style, {
                        background: 'rgba(255, 77, 79, 0.1)',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        textAlign: 'center'
                    });

                    warningBox.createEl('span', { text: '默认取文档内第一张图作为封面图，若缺少封面图，将无法推送微信', attr: { style: 'color: #ff4d4f; font-size: 13px; font-weight: 500;' } });
                }
            }

            let md = content.replace(/^---\n[\s\S]*?\n---\n?/, ''); // Strip frontmatter
            md = preserveMultipleNewlines(md);

            if (this.articleMetaEl) {
                const author = fm.author || this.plugin.settings.defaultAuthor || '公众号作者';
                this.articleMetaEl.innerHTML = `
                    <span style="color: #576b95; font-size: 15px; font-weight: 500;">${author}</span>
                    <span style="color: var(--text-muted); font-size: 14px;">计算中...</span>
                `;
            }

            this.previewContainer.empty();

            // Use native Obsidian renderer for exact 1:1 preview inside the window
            await MarkdownRenderer.render(
                this.app,
                md,
                this.previewContainer,
                activeFile.path,
                this.renderComponent
            );

            // Wait for elements like images/embeds to load, remove cover if needed, then count words
            setTimeout(() => {
                if (!this.previewContainer) return;

                // If the first image was used as the cover, remove it from the preview body.
                if (!fm.cover) {
                    const firstImg = this.previewContainer.querySelector('img, .internal-embed');
                    if (firstImg) {
                        const p = firstImg.closest('p, .image-embed, .markdown-embed');
                        if (p && p.parentElement === this.previewContainer && p.textContent?.trim() === '') {
                            p.remove();
                        } else {
                            firstImg.remove();
                        }
                    }
                }

                // Pre-process: Wrap any root-level <br> elements in <p> to prevent WeChat from stripping them
                // WeChat's editor often discards standalone <br> elements that sit between block elements
                Array.from(this.previewContainer.childNodes).forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === 'BR') {
                        const p = document.createElement('p');
                        node.parentNode?.insertBefore(p, node);
                        p.appendChild(node);
                    }
                });

                // Match MarkdownRenderer logic: Split <p> tags containing <br> into separate <p> tags
                const paragraphsWithBr = Array.from(this.previewContainer.querySelectorAll('p')).filter(p => !p.closest('li') && p.querySelector('br'));
                paragraphsWithBr.forEach(p => {
                    if (p.textContent?.trim() === '' && !p.querySelector('img, .internal-embed')) return;

                    const htmlPieces = p.innerHTML.split(/<br[^>]*>/i);
                    if (htmlPieces.length > 1) {
                        const frag = document.createDocumentFragment();
                        htmlPieces.forEach(piece => {
                            const newP = document.createElement('p');
                            Array.from(p.attributes).forEach(attr => newP.setAttribute(attr.name, attr.value));
                            if (piece.trim() === '') {
                                newP.innerHTML = '&nbsp;';
                            } else {
                                newP.innerHTML = piece;
                            }
                            frag.appendChild(newP);
                        });
                        p.replaceWith(frag);
                    }
                });

                // Apply image styles to remaining images in the preview body
                const images = this.previewContainer.querySelectorAll('img');
                const { imageBorderRadius, imageBoxShadow, imageBorderColor, imageBorderThickness } = this.plugin.settings;
                images.forEach(img => {
                    if (imageBorderRadius && imageBorderRadius !== '0px') img.style.borderRadius = imageBorderRadius;
                    if (imageBoxShadow && imageBoxShadow !== 'none') img.style.boxShadow = imageBoxShadow;
                    if (imageBorderThickness && imageBorderThickness !== '0px' && imageBorderColor) {
                        img.style.border = `${imageBorderThickness} solid ${imageBorderColor}`;
                    }
                });

                // Apply active template styles using a scoped <style> block
                const activeTemplate = this.plugin.settings.activeTemplateId === 'blank' ? undefined : (this.plugin.settings.templates?.find(t => t.id === this.plugin.settings.activeTemplateId) || this.plugin.settings.templates?.[0]);
                if (activeTemplate) {
                    const { headingFontSize, headingColor, textFontSize, marginTop, marginBottom, lineHeight, paddingSide } = activeTemplate;
                    const styleEl = document.createElement('style');
                    styleEl.textContent = `
                        .wx-preview-content {
                            ${textFontSize ? `font-size: ${textFontSize} !important;` : ''}
                            ${lineHeight ? `line-height: ${lineHeight} !important;` : ''}
                        }
                        .wx-preview-content h1, .wx-preview-content h2, .wx-preview-content h3, .wx-preview-content h4, .wx-preview-content h5, .wx-preview-content h6 {
                            ${headingFontSize ? `font-size: ${headingFontSize} !important;` : ''}
                            ${headingColor ? `color: ${headingColor} !important;` : ''}
                            ${marginTop ? `margin-top: ${marginTop} !important;` : ''}
                            ${marginBottom ? `margin-bottom: ${marginBottom} !important;` : ''}
                            ${lineHeight ? `line-height: ${lineHeight} !important;` : ''}
                            ${paddingSide && paddingSide !== '0px' ? `padding-left: ${paddingSide} !important; padding-right: ${paddingSide} !important;` : ''}
                        }
                        .wx-preview-content p, .wx-preview-content li {
                            ${textFontSize ? `font-size: ${textFontSize} !important;` : ''}
                            ${lineHeight ? `line-height: ${lineHeight} !important;` : ''}
                            ${paddingSide && paddingSide !== '0px' ? `padding-left: ${paddingSide} !important; padding-right: ${paddingSide} !important;` : ''}
                        }
                    `;
                    this.previewContainer.appendChild(styleEl);

                    // Force empty paragraphs (spacers) to have real height, and selectively apply margins
                    const paragraphs = this.previewContainer.querySelectorAll('p');
                    paragraphs.forEach(p => {
                        const isSpacer = p.textContent?.trim() === '' && Array.from(p.children).every(c => c.tagName === 'BR' || c.tagName === 'SPAN') && !p.querySelector('img, .internal-embed');
                        if (marginTop) p.style.setProperty('margin-top', marginTop, 'important');
                        if (marginBottom) p.style.setProperty('margin-bottom', marginBottom, 'important');
                        
                        if (isSpacer) {
                            p.innerHTML = '&nbsp;';
                        }
                    });

                    // Clean up leading spaces safely in DOM
                    const walkAndClean = (node: Node) => {
                        if (node.nodeType === Node.TEXT_NODE) {
                            // If this text node follows a BR or SPAN (used as BR), or is the first child of a block element, trim its leading spaces
                            const prev = node.previousSibling;
                            const parent = node.parentElement;
                            const isPrevLineBreak = prev && (prev.nodeName === 'BR' || (prev.nodeName === 'SPAN' && (prev as HTMLElement).style.display === 'block'));
                            
                            if (isPrevLineBreak || (!prev && parent && ['P', 'LI', 'DIV'].includes(parent.tagName))) {
                                node.textContent = (node.textContent || '').replace(/^[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '');
                            }
                        } else if (node.nodeType === Node.ELEMENT_NODE) {
                            Array.from(node.childNodes).forEach(walkAndClean);
                        }
                    };
                    walkAndClean(this.previewContainer);
                }

                // Update word count using rendered text
                if (this.articleMetaEl) {
                    const author = fm.author || this.plugin.settings.defaultAuthor || '公众号作者';
                    const textContent = this.previewContainer.innerText || this.previewContainer.textContent || '';
                    const cleanText = textContent.replace(/[\s\n\r]/g, '');
                    const wordCount = cleanText.length;

                    this.articleMetaEl.innerHTML = `
                        <span style="color: #576b95; font-size: 15px; font-weight: 500;">${author}</span>
                        <span style="color: var(--text-muted); font-size: 14px;">共 ${wordCount} 字</span>
                    `;
                }
            }, 300);

        } catch (e) {
            console.error('WeChat Publisher: Preview render error', e);
            if (this.previewContainer) {
                this.previewContainer.innerHTML = `<div style="padding:20px;color:red;">渲染出错: ${e instanceof Error ? e.message : String(e)}</div>`;
            }
        }
    }

    async onClose() {
        this.renderComponent.unload();
    }
}
