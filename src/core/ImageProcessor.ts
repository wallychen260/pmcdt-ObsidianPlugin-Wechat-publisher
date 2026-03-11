import { App, TFile, requestUrl } from 'obsidian';

/**
 * Image processor: identifies images in HTML, converts to Base64 or uploads to WeChat.
 */

interface ImageInfo {
    originalSrc: string;
    type: 'local' | 'remote' | 'obsidian-attachment' | 'app';
    filename: string;
}

/**
 * Extract all image sources from rendered HTML.
 */
export function extractImages(html: string): ImageInfo[] {
    const images: ImageInfo[] = [];
    const imgRegex = /<img\s+[^>]*src="([^"]+)"[^>]*>/g;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1];
        if (src.startsWith('obsidian-attachment://')) {
            const filename = decodeURIComponent(src.replace('obsidian-attachment://', ''));
            images.push({ originalSrc: src, type: 'obsidian-attachment', filename });
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
            const filename = src.split('/').pop() || 'image';
            images.push({ originalSrc: src, type: 'remote', filename });
        } else if (src.startsWith('app://') || src.startsWith('capacitor://')) {
            let decoded = decodeURIComponent(src);
            let path = decoded.replace(/(?:app|capacitor):\/\/[^\/]+/, '').replace(/^\/_capacitor_file_/, '').split('?')[0];
            if (path.match(/^\/[a-zA-Z]:\//)) {
                path = path.substring(1);
            }
            images.push({ originalSrc: src, type: 'app', filename: path });
        } else if (!src.startsWith('data:')) {
            images.push({ originalSrc: src, type: 'local', filename: src });
        }
    }

    return images;
}

/**
 * Read a local/attachment image file and return as Base64 data URI.
 */
export async function imageToBase64(app: App, imagePath: string, sourceFile: TFile): Promise<string | null> {
    try {
        // Try to resolve as relative to the source file
        const resolvedFile = app.metadataCache.getFirstLinkpathDest(imagePath, sourceFile.path);
        if (resolvedFile && resolvedFile instanceof TFile) {
            const data = await app.vault.readBinary(resolvedFile);
            const ext = resolvedFile.extension.toLowerCase();
            const mimeMap: Record<string, string> = {
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
                svg: 'image/svg+xml',
            };
            const mime = mimeMap[ext] || 'image/png';
            const base64 = arrayBufferToBase64(data);
            return `data:${mime};base64,${base64}`;
        }
        return null;
    } catch (e) {
        console.error(`Failed to read image: ${imagePath}`, e);
        return null;
    }
}

/**
 * Read absolute path and return Base64.
 */
export async function absoluteImageToBase64(path: string): Promise<string | null> {
    try {
        const fs = require('fs');
        if (fs.existsSync(path)) {
            const buffer = fs.readFileSync(path);
            const ext = path.split('.').pop()?.toLowerCase();
            const mimeMap: Record<string, string> = {
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                gif: 'image/gif',
                webp: 'image/webp',
            };
            const mime = mimeMap[ext || 'png'] || 'image/png';
            const base64 = buffer.toString('base64');
            return `data:${mime};base64,${base64}`;
        }
        return null;
    } catch (e) {
        console.error('Failed to read absolute image', e);
        return null;
    }
}

/**
 * Download a remote image and return as Base64 data URI.
 */
export async function remoteImageToBase64(url: string): Promise<string | null> {
    try {
        const response = await requestUrl({ url, method: 'GET' });
        const contentType = response.headers['content-type'] || 'image/png';
        const base64 = arrayBufferToBase64(response.arrayBuffer);
        return `data:${contentType};base64,${base64}`;
    } catch (e) {
        console.error(`Failed to download remote image: ${url}`, e);
        return null;
    }
}

/**
 * Process all images in HTML: resolve attachments and remote images to Base64.
 * Used in clipboard mode.
 */
export async function processImagesForClipboard(
    html: string,
    app: App,
    sourceFile: TFile
): Promise<string> {
    const images = extractImages(html);
    let result = html;

    for (const img of images) {
        let base64: string | null = null;

        switch (img.type) {
            case 'obsidian-attachment':
                base64 = await imageToBase64(app, img.filename, sourceFile);
                break;
            case 'local':
                base64 = await imageToBase64(app, img.filename, sourceFile);
                break;
            case 'app':
                const basePath = (app.vault.adapter as any).getBasePath?.();
                if (basePath && img.filename.startsWith(basePath)) {
                    const relPath = img.filename.substring(basePath.length).replace(/^[/\\]/, '');
                    base64 = await imageToBase64(app, relPath, sourceFile);
                } else {
                    base64 = await absoluteImageToBase64(img.filename);
                }
                break;
            case 'remote':
                base64 = await remoteImageToBase64(img.originalSrc);
                break;
        }

        if (base64) {
            result = result.replace(img.originalSrc, base64);
        }
    }

    return result;
}

/**
 * Convert ArrayBuffer to Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
