import { requestUrl } from 'obsidian';

/**
 * Manages WeChat access_token lifecycle: obtain, cache, and auto-refresh.
 */
export class TokenManager {
    private accessToken: string = '';
    private tokenExpiry: number = 0;

    constructor(
        private appId: string,
        private appSecret: string,
        private apiUrl: string = 'https://api.weixin.qq.com'
    ) { }

    updateCredentials(appId: string, appSecret: string, apiUrl: string = 'https://api.weixin.qq.com') {
        this.appId = appId;
        this.appSecret = appSecret;
        this.apiUrl = apiUrl;
        this.accessToken = '';
        this.tokenExpiry = 0;
    }

    /**
     * Get a valid access_token. Auto-refreshes if expired or about to expire.
     */
    async getToken(): Promise<string> {
        // Refresh if within 5 minutes of expiry
        if (this.accessToken && Date.now() < this.tokenExpiry - 5 * 60 * 1000) {
            return this.accessToken;
        }
        return await this.refreshToken();
    }

    /**
     * Force refresh the access_token from WeChat API.
     */
    async refreshToken(): Promise<string> {
        if (!this.appId || !this.appSecret) {
            throw new Error('未配置 AppID 或 AppSecret');
        }

        const url = `${this.apiUrl}/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;

        const response = await requestUrl({ url, method: 'GET' });
        const data = response.json;

        if (data.errcode) {
            if (data.errcode === 40164) {
                const ipMatch = data.errmsg.match(/invalid ip (\d+\.\d+\.\d+\.\d+)/);
                const ip = ipMatch ? ipMatch[1] : '未知 IP';
                throw new Error(`IP 白名单限制！此系统当前出口 IP 环境为 ${ip} ，请将此 IP 填入微信公众平台开发配置的白名单中。详细报错: [${data.errcode}] ${data.errmsg}`);
            }
            throw new Error(`获取 access_token 失败: [${data.errcode}] ${data.errmsg}`);
        }

        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + data.expires_in * 1000;
        return this.accessToken;
    }

    /**
     * Test connectivity with current credentials.
     */
    async testConnection(): Promise<boolean> {
        // Will throw an informative error if it fails
        await this.refreshToken();
        return true;
    }
}
