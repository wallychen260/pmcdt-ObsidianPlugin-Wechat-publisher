/**
 * Simple AES-like encryption for storing AppSecret locally.
 * Uses XOR cipher with a device-derived key as a basic obfuscation layer.
 * This is NOT cryptographically secure but provides basic protection
 * against casual inspection of the data.json file.
 */

function getDeviceKey(): string {
    // Use a combination of platform info as a pseudo-unique key
    const info = `${navigator.userAgent}-obsidian-wechat-publisher`;
    let hash = 0;
    for (let i = 0; i < info.length; i++) {
        const char = info.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Encrypt a string value.
 */
export function encrypt(value: string): string {
    if (!value) return '';
    const key = getDeviceKey();
    let result = '';
    for (let i = 0; i < value.length; i++) {
        const charCode = value.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
    }
    return btoa(result);
}

/**
 * Decrypt a string value.
 */
export function decrypt(encoded: string): string {
    if (!encoded) return '';
    try {
        const decoded = atob(encoded);
        const key = getDeviceKey();
        let result = '';
        for (let i = 0; i < decoded.length; i++) {
            const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return result;
    } catch {
        return encoded; // Return as-is if decryption fails (e.g., not encrypted)
    }
}
