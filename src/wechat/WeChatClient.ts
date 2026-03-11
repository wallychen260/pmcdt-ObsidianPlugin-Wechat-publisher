import { App, TFile, requestUrl } from 'obsidian';
import { TokenManager } from './TokenManager';

/**
 * WeChat Official Account API Client.
 * Handles material upload and draft publishing.
 */
export class WeChatClient {
    tokenManager: TokenManager;
    apiUrl: string;

    constructor(appId: string, appSecret: string, apiUrl: string = 'https://api.weixin.qq.com') {
        this.apiUrl = apiUrl;
        this.tokenManager = new TokenManager(appId, appSecret, apiUrl);
    }

    updateCredentials(appId: string, appSecret: string, apiUrl: string = 'https://api.weixin.qq.com') {
        this.apiUrl = apiUrl;
        this.tokenManager.updateCredentials(appId, appSecret, apiUrl);
    }

    /**
     * Upload an image to WeChat permanent material store.
     * Returns { media_id, url }.
     */
    async uploadImage(imageData: ArrayBuffer, filename: string): Promise<{ media_id: string; url: string }> {
        const token = await this.tokenManager.getToken();
        const url = `${this.apiUrl}/cgi-bin/material/add_material?access_token=${token}&type=image`;

        // Build multipart form data manually
        const boundary = '----WeChatPublisher' + Date.now();
        const ext = filename.split('.').pop()?.toLowerCase() || 'png';
        const mimeMap: Record<string, string> = {
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
            gif: 'image/gif', webp: 'image/webp',
        };
        const mime = mimeMap[ext] || 'image/png';

        const header = `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: ${mime}\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);
        const imageBytes = new Uint8Array(imageData);

        const body = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
        body.set(headerBytes, 0);
        body.set(imageBytes, headerBytes.length);
        body.set(footerBytes, headerBytes.length + imageBytes.length);

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: body.buffer,
        });

        const data = response.json;
        if (data.errcode) {
            throw new Error(`图片上传失败: [${data.errcode}] ${data.errmsg}`);
        }

        return { media_id: data.media_id, url: data.url };
    }

    /**
     * Upload a thumb image for article cover.
     */
    async uploadThumb(imageData: ArrayBuffer, filename: string): Promise<string> {
        const token = await this.tokenManager.getToken();
        const url = `${this.apiUrl}/cgi-bin/material/add_material?access_token=${token}&type=thumb`;

        const boundary = '----WeChatPublisher' + Date.now();
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="media"; filename="${filename}"\r\nContent-Type: image/jpeg\r\n\r\n`;
        const footer = `\r\n--${boundary}--\r\n`;

        const headerBytes = new TextEncoder().encode(header);
        const footerBytes = new TextEncoder().encode(footer);
        const imageBytes = new Uint8Array(imageData);

        const body = new Uint8Array(headerBytes.length + imageBytes.length + footerBytes.length);
        body.set(headerBytes, 0);
        body.set(imageBytes, headerBytes.length);
        body.set(footerBytes, headerBytes.length + imageBytes.length);

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: body.buffer,
        });

        const data = response.json;
        if (data.errcode) {
            throw new Error(`封面上传失败: [${data.errcode}] ${data.errmsg}`);
        }

        return data.media_id;
    }

    /**
     * Upload all images in the article HTML to WeChat, replacing src URLs.
     */
    async uploadArticleImages(html: string, app: App, sourceFile: TFile): Promise<string> {
        const imgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g;
        let result = html;
        let match;
        const processed = new Map<string, string>();

        while ((match = imgRegex.exec(html)) !== null) {
            const src = match[1];
            if (src.startsWith('data:') || processed.has(src)) continue;

            try {
                let imageData: ArrayBuffer | null = null;
                let filename = 'image.png';

                if (src.startsWith('obsidian-attachment://')) {
                    const attachmentName = decodeURIComponent(src.replace('obsidian-attachment://', ''));
                    const file = app.metadataCache.getFirstLinkpathDest(attachmentName, sourceFile.path);
                    if (file && file instanceof TFile) {
                        imageData = await app.vault.readBinary(file);
                        filename = file.name;
                    }
                } else if (src.startsWith('http://') || src.startsWith('https://')) {
                    const resp = await requestUrl({ url: src, method: 'GET' });
                    imageData = resp.arrayBuffer;
                    filename = src.split('/').pop()?.split('?')[0] || 'image.png';
                } else if (src.startsWith('app://') || src.startsWith('capacitor://')) {
                    let decoded = decodeURIComponent(src);
                    let path = decoded.replace(/(?:app|capacitor):\/\/[^\/]+/, '').replace(/^\/_capacitor_file_/, '').split('?')[0];
                    if (path.match(/^\/[a-zA-Z]:\//)) {
                        path = path.substring(1); // Windows drive letter fix
                    }
                    const basePath = (app.vault.adapter as any).getBasePath?.();
                    if (basePath && path.startsWith(basePath)) {
                        const relPath = path.substring(basePath.length).replace(/^[/\\]/, '');
                        const file = app.vault.getAbstractFileByPath(relPath);
                        if (file && file instanceof TFile) {
                            imageData = await app.vault.readBinary(file);
                            filename = file.name;
                        }
                    } else {
                        // Fallback to node fs if outside vault or resolving failed
                        try {
                            const fs = require('fs');
                            if (fs.existsSync(path)) {
                                const buffer = fs.readFileSync(path);
                                imageData = new Uint8Array(buffer).buffer;
                                filename = path.split(/[\/\\]/).pop() || 'image.png';
                            }
                        } catch (err) {
                            console.error('Failed to read absolute path', err);
                        }
                    }
                } else {
                    // Local relative path
                    const file = app.metadataCache.getFirstLinkpathDest(src, sourceFile.path);
                    if (file && file instanceof TFile) {
                        imageData = await app.vault.readBinary(file);
                        filename = file.name;
                    }
                }

                if (imageData) {
                    const uploaded = await this.uploadImage(imageData, filename);
                    processed.set(src, uploaded.url);
                    result = result.split(src).join(uploaded.url);
                }
            } catch (e) {
                console.error(`Failed to upload image: ${src}`, e);
                // Continue with other images
            }
        }

        return result;
    }

    /**
     * Create a new draft in WeChat's draft box.
     */
    async createDraft(params: {
        title: string;
        content: string;
        author?: string;
        digest?: string;
        thumbMediaId?: string;
    }): Promise<string> {
        const token = await this.tokenManager.getToken();
        const url = `${this.apiUrl}/cgi-bin/draft/add?access_token=${token}`;

        const article: Record<string, string | number> = {
            title: params.title,
            content: params.content,
            content_source_url: '',
            need_open_comment: 0,
            only_fans_can_comment: 0,
        };

        if (params.author) article.author = params.author;
        if (params.digest) article.digest = params.digest;
        if (params.thumbMediaId) {
            article.thumb_media_id = params.thumbMediaId;
        }

        const body = JSON.stringify({ articles: [article] });

        const response = await requestUrl({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        });

        const data = response.json;
        if (data.errcode) {
            throw new Error(`草稿创建失败: [${data.errcode}] ${data.errmsg}`);
        }

        return data.media_id; // Draft media_id
    }

    async testConnection(): Promise<boolean> {
        return this.tokenManager.testConnection();
    }
}
