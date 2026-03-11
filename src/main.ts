import { Plugin, Notice, TFile, requestUrl } from 'obsidian';
import { WeChatPublisherSettingTab, WeChatPublisherSettings, DEFAULT_SETTINGS, PublishRecord } from './settings';
import { renderToWeChatHtml } from './core/MarkdownRenderer';
import { processImagesForClipboard } from './core/ImageProcessor';
import { WeChatClient } from './wechat/WeChatClient';
import { copyToClipboard } from './utils/clipboard';
import { decrypt } from './utils/crypto';
import { PreviewView, VIEW_TYPE_WECHAT_PREVIEW } from './views/PreviewView';
import { ToolbarManager } from './toolbar/ToolbarManager';

interface FrontmatterData {
    title?: string;
    author?: string;
    cover?: string;
    digest?: string;
    tags?: string[];
}

export default class WeChatPublisherPlugin extends Plugin {
    settings: WeChatPublisherSettings = DEFAULT_SETTINGS;
    wechatClient!: WeChatClient;
    toolbarManager!: ToolbarManager;

    async onload() {
        await this.loadSettings();

        this.wechatClient = new WeChatClient(
            this.settings.appId,
            decrypt(this.settings.appSecretEncrypted),
            this.settings.apiProxyUrl
        );

        // Register preview view
        this.registerView(
            VIEW_TYPE_WECHAT_PREVIEW,
            (leaf) => new PreviewView(leaf, this)
        );

        // Initialize ToolbarManager
        this.toolbarManager = new ToolbarManager(this.app, this);
        this.toolbarManager.onload();

        // Ribbon icon
        this.addRibbonIcon('message-circle', '微信公众号预览', () => {
            this.activatePreviewView();
        });

        // Commands
        this.addCommand({
            id: 'open-preview',
            name: '打开预览面板',
            callback: () => this.activatePreviewView(),
        });

        this.addCommand({
            id: 'copy-wechat-html',
            name: '复制为微信排版 HTML',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (file?.extension === 'md') {
                    if (!checking) this.copyToClipboardCommand();
                    return true;
                }
                return false;
            },
        });

        this.addCommand({
            id: 'push-to-draft',
            name: '推送到草稿箱',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();
                if (file?.extension === 'md') {
                    if (!checking) this.pushToDraftCommand();
                    return true;
                }
                return false;
            },
        });

        // Register context menu
        this.registerEvent(
            this.app.workspace.on('file-menu', (menu, file) => {
                if (file instanceof TFile && file.extension === 'md') {
                    menu.addItem((item) => {
                        item.setTitle('微信公众号预览')
                            .setIcon('message-circle')
                            .onClick(() => this.activatePreviewView());
                    });
                    menu.addItem((item) => {
                        item.setTitle('推送到草稿箱')
                            .setIcon('upload')
                            .onClick(() => this.pushToDraftCommand());
                    });
                    menu.addItem((item) => {
                        item.setTitle('复制为微信排版 HTML')
                            .setIcon('clipboard-copy')
                            .onClick(() => this.copyToClipboardCommand());
                    });
                }
            })
        );

        // Settings tab
        this.addSettingTab(new WeChatPublisherSettingTab(this.app, this));
    }

    async onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        if (this.toolbarManager) {
            this.toolbarManager.onunload();
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    updateWeChatClient() {
        this.wechatClient.updateCredentials(
            this.settings.appId,
            decrypt(this.settings.appSecretEncrypted),
            this.settings.apiProxyUrl
        );
    }

    /**
     * Open or focus the preview panel.
     */
    async activatePreviewView() {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_WECHAT_PREVIEW);
        if (existing.length) {
            this.app.workspace.revealLeaf(existing[0]);
            return;
        }

        const leaf = this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({
                type: VIEW_TYPE_WECHAT_PREVIEW,
                active: true,
            });
            this.app.workspace.revealLeaf(leaf);
        }
    }

    /**
     * Parse frontmatter from the current file content.
     */
    parseFrontmatter(content: string): FrontmatterData {
        const match = content.match(/^---\n([\s\S]*?)\n---/);
        if (!match) return {};

        const fm: FrontmatterData = {};
        const lines = match[1].split('\n');
        for (const line of lines) {
            const colonIdx = line.indexOf(':');
            if (colonIdx === -1) continue;
            const key = line.substring(0, colonIdx).trim();
            const value = line.substring(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
            switch (key) {
                case 'title': fm.title = value; break;
                case 'author': fm.author = value; break;
                case 'cover': fm.cover = value; break;
                case 'digest': fm.digest = value; break;
                case 'tags':
                    if (value.startsWith('[')) {
                        fm.tags = value.slice(1, -1).split(',').map(t => t.trim());
                    }
                    break;
            }
        }
        return fm;
    }

    /**
     * Get article title: frontmatter title > filename.
     */
    getArticleTitle(content: string, file: TFile, fm: FrontmatterData): string {
        if (fm.title) return fm.title;
        return file.basename;
    }

    /**
     * Get article digest: frontmatter digest > first 120 chars of body.
     */
    getDigest(content: string, fm: FrontmatterData): string {
        if (fm.digest) return fm.digest;
        const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^#.*$/gm, '').trim();
        const plain = body.replace(/[*_`\[\]()#>!|]/g, '').replace(/\n+/g, ' ').trim();
        return plain.substring(0, 120);
    }

    /**
     * Get cover image path or URL from frontmatter or content.
     */
    getCoverImagePath(content: string, file: TFile, fm: FrontmatterData): string | undefined {
        let coverPathOrUrl = fm.cover;

        if (!coverPathOrUrl) {
            const cache = this.app.metadataCache.getFileCache(file);
            const firstEmbed = cache?.embeds?.find(e => /\.(png|jpe?g|gif|webp)$/i.test(e.link));
            if (firstEmbed) {
                coverPathOrUrl = firstEmbed.link;
            } else {
                const mdImageMatch = content.match(/!\[.*?\]\((.*?)\)/);
                if (mdImageMatch) {
                    coverPathOrUrl = mdImageMatch[1];
                } else {
                    const htmlImgMatch = content.match(/<img\s+[^>]*src="([^"]+)"/i);
                    if (htmlImgMatch && !htmlImgMatch[1].startsWith('data:')) {
                        coverPathOrUrl = htmlImgMatch[1];
                    }
                }
            }
        }
        return coverPathOrUrl;
    }

    /**
     * Get accessible resource path for a cover image.
     */
    getCoverImageResourcePath(coverPathOrUrl: string, file: TFile): string | null {
        if (!coverPathOrUrl) return null;
        if (coverPathOrUrl.startsWith('http://') || coverPathOrUrl.startsWith('https://') || coverPathOrUrl.startsWith('data:')) {
            return coverPathOrUrl;
        }

        let targetPath = coverPathOrUrl;
        if (coverPathOrUrl.startsWith('obsidian-attachment://')) {
            targetPath = decodeURIComponent(coverPathOrUrl.replace('obsidian-attachment://', ''));
        }

        const coverFile = this.app.metadataCache.getFirstLinkpathDest(targetPath, file.path);
        if (coverFile instanceof TFile) {
            return this.app.vault.getResourcePath(coverFile);
        }
        return null;
    }

    /**
     * Helper to render current file structure
     */
    private async renderCurrentFilePrecheck(): Promise<{ content: string; file: TFile; fm: FrontmatterData } | null> {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== 'md') {
            new Notice('请先打开一个 Markdown 文件');
            return null;
        }
        const content = await this.app.vault.read(file);
        const fm = this.parseFrontmatter(content);
        return { content, file, fm };
    }

    /**
     * Command: Copy rendered HTML to clipboard.
     */
    async copyToClipboardCommand() {
        const data = await this.renderCurrentFilePrecheck();
        if (!data) return;

        const notice = new Notice('⏳ 正在生成排版及图片转换...', 0);

        try {
            const activeTemplate = this.settings.activeTemplateId === 'blank' ? undefined : (this.settings.templates?.find(t => t.id === this.settings.activeTemplateId) || this.settings.templates?.[0]);

            // Render native HTML with inline computed styles
            const rendered = await renderToWeChatHtml(this.app, data.content, data.file, {
                removeFirstImage: !data.fm.cover,
                imageStyles: {
                    borderRadius: this.settings.imageBorderRadius,
                    boxShadow: this.settings.imageBoxShadow,
                    borderColor: this.settings.imageBorderColor,
                    borderThickness: this.settings.imageBorderThickness
                },
                template: activeTemplate
            });
            // Process images for clipboard (Base64)
            const processedHtml = await processImagesForClipboard(rendered.html, this.app, data.file);

            await copyToClipboard(processedHtml);
            notice.hide();
            new Notice('✅ 排版 HTML 已复制到剪贴板，请到微信后台粘贴');
        } catch (e) {
            notice.hide();
            new Notice(`❌ 复制失败: ${e instanceof Error ? e.message : '未知错误'}`);
            console.error(e);
        }
    }

    /**
     * Command: Push article to WeChat draft box.
     */
    async pushToDraftCommand() {
        if (this.settings.workMode !== 'api') {
            new Notice('当前为剪贴板模式，请在设置中切换到 API 模式后重试');
            return;
        }

        if (!this.settings.appId || !this.settings.appSecretEncrypted) {
            new Notice('请先在设置中配置 AppID 和 AppSecret');
            return;
        }

        const data = await this.renderCurrentFilePrecheck();
        if (!data) return;

        const notice = new Notice('⏳ 正在处理并推送到微信草稿箱...', 0);

        try {
            this.updateWeChatClient();

            const activeTemplate = this.settings.activeTemplateId === 'blank' ? undefined : (this.settings.templates?.find(t => t.id === this.settings.activeTemplateId) || this.settings.templates?.[0]);

            // Render native HTML with inline computed styles
            const rendered = await renderToWeChatHtml(this.app, data.content, data.file, {
                removeFirstImage: !data.fm.cover,
                imageStyles: {
                    borderRadius: this.settings.imageBorderRadius,
                    boxShadow: this.settings.imageBoxShadow,
                    borderColor: this.settings.imageBorderColor,
                    borderThickness: this.settings.imageBorderThickness
                },
                template: activeTemplate
            });

            // Upload article images and replace URLs
            const htmlWithImages = await this.wechatClient.uploadArticleImages(
                rendered.html, this.app, data.file
            );

            const title = this.getArticleTitle(data.content, data.file, data.fm);
            const author = data.fm.author || this.settings.defaultAuthor;
            const digest = this.getDigest(data.content, data.fm);

            // Upload cover image
            let thumbMediaId: string | undefined;

            // Collect all possible cover candidates to try in order of priority, avoiding duplicates
            const rawCandidates = [
                data.fm.cover,
                rendered.firstImageUrl,
                this.getCoverImagePath(data.content, data.file, data.fm)
            ].filter(Boolean) as string[];
            const candidateCovers = Array.from(new Set(rawCandidates));

            let lastAttemptedPath = '';
            let lastUploadError: string | null = null;

            for (const coverPathOrUrl of candidateCovers) {
                if (thumbMediaId) break; // Already successfully uploaded
                lastAttemptedPath = coverPathOrUrl;

                try {
                    let coverData: ArrayBuffer | null = null;
                    let filename = 'cover.png';

                    if (coverPathOrUrl.startsWith('http://') || coverPathOrUrl.startsWith('https://')) {
                        // Remote URL
                        const resp = await requestUrl({ url: coverPathOrUrl, method: 'GET' });
                        coverData = resp.arrayBuffer;
                        filename = coverPathOrUrl.split('/').pop()?.split('?')[0] || 'cover.png';

                    } else if (coverPathOrUrl.startsWith('obsidian-attachment://')) {
                        // Obsidian attachment protocol
                        const attachmentName = decodeURIComponent(coverPathOrUrl.replace('obsidian-attachment://', ''));
                        const coverFile = this.app.metadataCache.getFirstLinkpathDest(attachmentName, data.file.path);
                        if (coverFile && coverFile instanceof TFile) {
                            coverData = await this.app.vault.readBinary(coverFile);
                            filename = coverFile.name;
                        }

                    } else if (coverPathOrUrl.startsWith('app://') || coverPathOrUrl.startsWith('capacitor://')) {
                        // Obsidian internal app:// resource path
                        let decoded = decodeURIComponent(coverPathOrUrl);
                        let path = decoded.replace(/(?:app|capacitor):\/\/[^\/]+/, '').replace(/^\/_capacitor_file_/, '').split('?')[0];
                        if (path.match(/^\/[a-zA-Z]:\//)) path = path.substring(1);
                        const basePath = (this.app.vault.adapter as any).getBasePath?.();
                        if (basePath && path.startsWith(basePath)) {
                            const relPath = path.substring(basePath.length).replace(/^[\/\\]/, '');
                            const f = this.app.vault.getAbstractFileByPath(relPath);
                            if (f && f instanceof TFile) {
                                coverData = await this.app.vault.readBinary(f);
                                filename = f.name;
                            }
                        } else {
                            try {
                                const fs = require('fs');
                                if (fs.existsSync(path)) {
                                    const buf = fs.readFileSync(path);
                                    coverData = new Uint8Array(buf).buffer;
                                    filename = path.split(/[\/\\]/).pop() || 'cover.png';
                                }
                            } catch (fsErr) {
                                console.error('Cover: fallback fs read failed', fsErr);
                            }
                        }

                    } else {
                        // Wiki-link or relative path
                        const cleanPath = coverPathOrUrl.split('|')[0].trim();
                        const coverFile = this.app.metadataCache.getFirstLinkpathDest(cleanPath, data.file.path);
                        if (coverFile && coverFile instanceof TFile) {
                            coverData = await this.app.vault.readBinary(coverFile);
                            filename = coverFile.name;
                        } else {
                            console.warn('Cover: could not resolve path:', cleanPath);
                        }
                    }

                    if (coverData) {
                        // Check file size for WeChat thumb limit (2MB for articles usually, but some are 64KB)
                        if (coverData.byteLength > 2.5 * 1024 * 1024) {
                            throw new Error(`图片文件体积过大(${(coverData.byteLength / 1024 / 1024).toFixed(1)}MB)，微信限制封面图需小于2MB。请压缩图片或更换封面。`);
                        }

                        try {
                            thumbMediaId = await this.wechatClient.uploadThumb(coverData, filename);
                            lastUploadError = null; // Success!
                        } catch (uploadObjErr) {
                            // Catch actual API errors
                            throw uploadObjErr;
                        }
                    } else {
                        lastUploadError = `找不到文件或无法读取图片数据`;
                        console.warn('Cover: coverData is null for candidate:', coverPathOrUrl);
                    }
                } catch (e) {
                    lastUploadError = e instanceof Error ? e.message : String(e);
                    console.error('Cover upload failed for candidate:', coverPathOrUrl, e);
                }
            }

            if (!thumbMediaId) {
                let errStr = "微信文章推送失败，因缺少可用封面图。";
                if (lastUploadError) {
                    errStr = `尝试提取封面图 [${lastAttemptedPath}] 失败：${lastUploadError}`;
                } else if (lastAttemptedPath) {
                    errStr = `尝试提取封面图 [${lastAttemptedPath}] 失败，找不到文件。`;
                }
                throw new Error(errStr);
            }

            // Create draft
            const mediaId = await this.wechatClient.createDraft({
                title,
                content: htmlWithImages,
                author,
                digest,
                thumbMediaId,
            });

            // Record success
            this.addPublishRecord({ timestamp: Date.now(), title, status: 'success', mediaId });

            notice.hide();
            new Notice('✅ 文章已推送到微信草稿箱！\n点击前往微信公众平台查看', 8000);

        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : '未知错误';
            const title = this.getArticleTitle(data.content, data.file, data.fm);
            this.addPublishRecord({ timestamp: Date.now(), title, status: 'failed', error: errorMsg });

            notice.hide();

            if (errorMsg.includes('权限') || errorMsg.includes('48001')) {
                new Notice('❌ 当前公众号无此接口权限，建议切换到剪贴板模式', 8000);
            } else {
                new Notice(`❌ 推送失败: ${errorMsg}`, 8000);
            }
        }
    }

    private async addPublishRecord(record: PublishRecord) {
        this.settings.publishHistory.push(record);
        // Keep only last 50 records
        if (this.settings.publishHistory.length > 50) {
            this.settings.publishHistory = this.settings.publishHistory.slice(-50);
        }
        await this.saveSettings();
    }
}
