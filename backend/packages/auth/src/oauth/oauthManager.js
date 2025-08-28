"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuth2Manager = void 0;
const crypto = __importStar(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('oauth-manager');
class OAuth2Manager {
    cache;
    config;
    providers = new Map();
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.initializeProviders();
    }
    initializeProviders() {
        if (this.config.google.enabled) {
            this.providers.set('google', {
                id: 'google',
                name: 'Google',
                authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
                scopes: this.config.google.scopes,
                enabled: true
            });
            logger.info('Google OAuth2 provider initialized');
        }
        if (this.config.microsoft.enabled) {
            const tenantId = this.config.microsoft.tenantId || 'common';
            this.providers.set('microsoft', {
                id: 'microsoft',
                name: 'Microsoft',
                authorizationUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
                tokenUrl: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
                userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
                scopes: this.config.microsoft.scopes,
                enabled: true
            });
            logger.info('Microsoft OAuth2 provider initialized');
        }
    }
    getProviders() {
        return Array.from(this.providers.values()).filter(p => p.enabled);
    }
    async generateAuthorizationUrl(request, ipAddress, userAgent) {
        try {
            const provider = this.providers.get(request.provider);
            if (!provider) {
                throw new Error(`Provider ${request.provider} not found or not enabled`);
            }
            await this.checkRateLimit(ipAddress);
            const state = crypto.randomUUID();
            const nonce = crypto.randomBytes(16).toString('hex');
            const oauthState = {
                id: state,
                provider: request.provider,
                nonce,
                redirectUrl: request.redirectUrl,
                userId: request.userId,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (this.config.security.stateExpiry * 1000)),
                ipAddress,
                userAgent
            };
            await this.cache.set(`oauth-state:${state}`, oauthState, this.config.security.stateExpiry);
            const scopes = request.scopes || provider.scopes;
            const params = new URLSearchParams({
                client_id: this.getClientId(request.provider),
                redirect_uri: this.getRedirectUri(request.provider),
                response_type: 'code',
                scope: scopes.join(' '),
                state,
                nonce,
                access_type: 'offline',
                prompt: 'consent'
            });
            const authorizationUrl = `${provider.authorizationUrl}?${params.toString()}`;
            logger.info('OAuth2 authorization URL generated', {
                provider: request.provider,
                state: state.substring(0, 8) + '...',
                ipAddress
            });
            return {
                authorizationUrl,
                state,
                nonce
            };
        }
        catch (error) {
            logger.error('Failed to generate OAuth2 authorization URL', {
                error,
                provider: request.provider
            });
            throw new Error(`Authorization URL generation failed: ${error.message}`);
        }
    }
    async exchangeCodeForTokens(request, ipAddress, userAgent) {
        try {
            const provider = this.providers.get(request.provider);
            if (!provider) {
                throw new Error(`Provider ${request.provider} not found`);
            }
            const oauthState = await this.cache.get(`oauth-state:${request.state}`);
            if (!oauthState) {
                throw new Error('Invalid or expired OAuth2 state');
            }
            if (oauthState.provider !== request.provider) {
                throw new Error('Provider mismatch in OAuth2 state');
            }
            if (ipAddress && oauthState.ipAddress && oauthState.ipAddress !== ipAddress) {
                logger.warn('OAuth2 IP address mismatch', {
                    expected: oauthState.ipAddress,
                    actual: ipAddress,
                    state: request.state.substring(0, 8) + '...'
                });
            }
            const tokenParams = {
                client_id: this.getClientId(request.provider),
                client_secret: this.getClientSecret(request.provider),
                code: request.code,
                grant_type: 'authorization_code',
                redirect_uri: this.getRedirectUri(request.provider)
            };
            const response = await axios_1.default.post(provider.tokenUrl, tokenParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            const tokenResponse = {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token,
                expiresIn: response.data.expires_in,
                tokenType: response.data.token_type,
                scope: response.data.scope,
                idToken: response.data.id_token
            };
            await this.cache.del(`oauth-state:${request.state}`);
            logger.info('OAuth2 tokens exchanged successfully', {
                provider: request.provider,
                hasRefreshToken: !!tokenResponse.refreshToken,
                expiresIn: tokenResponse.expiresIn
            });
            return tokenResponse;
        }
        catch (error) {
            logger.error('Failed to exchange OAuth2 code for tokens', {
                error: error.response?.data || error.message,
                provider: request.provider
            });
            throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
        }
    }
    async getUserInfo(provider, accessToken) {
        try {
            const providerConfig = this.providers.get(provider);
            if (!providerConfig) {
                throw new Error(`Provider ${provider} not found`);
            }
            const response = await axios_1.default.get(providerConfig.userInfoUrl, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            const rawData = response.data;
            let userInfo;
            switch (provider) {
                case 'google':
                    userInfo = {
                        id: rawData.id,
                        email: rawData.email,
                        emailVerified: rawData.verified_email,
                        name: rawData.name,
                        givenName: rawData.given_name,
                        familyName: rawData.family_name,
                        picture: rawData.picture,
                        locale: rawData.locale,
                        provider: 'google',
                        rawData
                    };
                    break;
                case 'microsoft':
                    userInfo = {
                        id: rawData.id,
                        email: rawData.mail || rawData.userPrincipalName,
                        emailVerified: true,
                        name: rawData.displayName,
                        givenName: rawData.givenName,
                        familyName: rawData.surname,
                        picture: rawData.photo?.value,
                        locale: rawData.preferredLanguage,
                        provider: 'microsoft',
                        rawData
                    };
                    break;
                default:
                    throw new Error(`Unsupported provider: ${provider}`);
            }
            logger.info('OAuth2 user info retrieved', {
                provider,
                userId: userInfo.id,
                email: userInfo.email.substring(0, 3) + '***'
            });
            return userInfo;
        }
        catch (error) {
            logger.error('Failed to get OAuth2 user info', {
                error: error.response?.data || error.message,
                provider
            });
            throw new Error(`User info retrieval failed: ${error.message}`);
        }
    }
    async authenticateUser(request, ipAddress, userAgent) {
        try {
            const tokens = await this.exchangeCodeForTokens(request, ipAddress, userAgent);
            const userInfo = await this.getUserInfo(request.provider, tokens.accessToken);
            let existingAccount = await this.getAccountByProviderAndId(request.provider, userInfo.id);
            let isNewUser = false;
            let user;
            if (existingAccount) {
                existingAccount.lastUsedAt = new Date();
                existingAccount.accessToken = tokens.accessToken;
                existingAccount.refreshToken = tokens.refreshToken;
                existingAccount.expiresAt = tokens.expiresIn
                    ? new Date(Date.now() + (tokens.expiresIn * 1000))
                    : undefined;
                await this.cache.set(`oauth-account:${existingAccount.id}`, existingAccount, 0);
                user = {
                    id: existingAccount.userId,
                    email: existingAccount.email,
                    name: existingAccount.name,
                    picture: existingAccount.picture,
                    isNewUser: false
                };
                logger.info('Existing OAuth2 user authenticated', {
                    provider: request.provider,
                    userId: user.id.substring(0, 8) + '...',
                    email: user.email.substring(0, 3) + '***'
                });
            }
            else {
                const existingUser = await this.getUserByEmail(userInfo.email);
                if (existingUser) {
                    const linkToken = crypto.randomUUID();
                    await this.cache.set(`oauth-link:${linkToken}`, {
                        userInfo,
                        tokens,
                        provider: request.provider,
                        existingUserId: existingUser.id
                    }, 3600);
                    return {
                        success: false,
                        requiresLinking: true,
                        linkToken,
                        error: 'Account linking required'
                    };
                }
                const newUserId = crypto.randomUUID();
                const accountId = crypto.randomUUID();
                const newAccount = {
                    id: accountId,
                    userId: newUserId,
                    provider: request.provider,
                    providerAccountId: userInfo.id,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresAt: tokens.expiresIn
                        ? new Date(Date.now() + (tokens.expiresIn * 1000))
                        : undefined,
                    tokenType: tokens.tokenType,
                    scope: tokens.scope,
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    metadata: {
                        locale: userInfo.locale,
                        emailVerified: userInfo.emailVerified
                    }
                };
                await Promise.all([
                    this.cache.set(`oauth-account:${accountId}`, newAccount, 0),
                    this.cache.sadd(`user-oauth-accounts:${newUserId}`, accountId),
                    this.cache.set(`oauth-account-by-provider:${request.provider}:${userInfo.id}`, accountId, 0)
                ]);
                user = {
                    id: newUserId,
                    email: userInfo.email,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    isNewUser: true
                };
                existingAccount = newAccount;
                isNewUser = true;
                logger.info('New OAuth2 user created and authenticated', {
                    provider: request.provider,
                    userId: user.id.substring(0, 8) + '...',
                    email: user.email.substring(0, 3) + '***'
                });
            }
            return {
                success: true,
                user,
                account: existingAccount,
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken || '',
                    expiresIn: tokens.expiresIn
                }
            };
        }
        catch (error) {
            logger.error('OAuth2 authentication failed', {
                error: error.message,
                provider: request.provider
            });
            return {
                success: false,
                error: error.message
            };
        }
    }
    async linkAccount(linkToken, userId, confirmEmail) {
        try {
            const linkData = await this.cache.get(`oauth-link:${linkToken}`);
            if (!linkData) {
                throw new Error('Invalid or expired link token');
            }
            if (linkData.existingUserId !== userId) {
                throw new Error('User ID mismatch');
            }
            if (linkData.userInfo.email !== confirmEmail) {
                throw new Error('Email mismatch');
            }
            const accountId = crypto.randomUUID();
            const linkedAccount = {
                id: accountId,
                userId,
                provider: linkData.provider,
                providerAccountId: linkData.userInfo.id,
                email: linkData.userInfo.email,
                name: linkData.userInfo.name,
                picture: linkData.userInfo.picture,
                accessToken: linkData.tokens.accessToken,
                refreshToken: linkData.tokens.refreshToken,
                expiresAt: linkData.tokens.expiresIn
                    ? new Date(Date.now() + (linkData.tokens.expiresIn * 1000))
                    : undefined,
                tokenType: linkData.tokens.tokenType,
                scope: linkData.tokens.scope,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                metadata: {
                    locale: linkData.userInfo.locale,
                    emailVerified: linkData.userInfo.emailVerified,
                    linkedAt: new Date()
                }
            };
            await Promise.all([
                this.cache.set(`oauth-account:${accountId}`, linkedAccount, 0),
                this.cache.sadd(`user-oauth-accounts:${userId}`, accountId),
                this.cache.set(`oauth-account-by-provider:${linkData.provider}:${linkData.userInfo.id}`, accountId, 0),
                this.cache.del(`oauth-link:${linkToken}`)
            ]);
            logger.info('OAuth2 account linked successfully', {
                provider: linkData.provider,
                userId: userId.substring(0, 8) + '...',
                accountId: accountId.substring(0, 8) + '...'
            });
            return {
                success: true,
                user: {
                    id: userId,
                    email: linkData.userInfo.email,
                    name: linkData.userInfo.name,
                    picture: linkData.userInfo.picture,
                    isNewUser: false
                },
                account: linkedAccount,
                tokens: {
                    accessToken: linkData.tokens.accessToken,
                    refreshToken: linkData.tokens.refreshToken || '',
                    expiresIn: linkData.tokens.expiresIn
                }
            };
        }
        catch (error) {
            logger.error('OAuth2 account linking failed', { error, linkToken });
            return {
                success: false,
                error: error.message
            };
        }
    }
    async unlinkAccount(userId, accountId) {
        try {
            const account = await this.cache.get(`oauth-account:${accountId}`);
            if (!account || account.userId !== userId) {
                return false;
            }
            await Promise.all([
                this.cache.del(`oauth-account:${accountId}`),
                this.cache.srem(`user-oauth-accounts:${userId}`, accountId),
                this.cache.del(`oauth-account-by-provider:${account.provider}:${account.providerAccountId}`)
            ]);
            logger.info('OAuth2 account unlinked', {
                provider: account.provider,
                userId: userId.substring(0, 8) + '...',
                accountId: accountId.substring(0, 8) + '...'
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to unlink OAuth2 account', { error, userId, accountId });
            return false;
        }
    }
    async getUserAccounts(userId) {
        try {
            const accountIds = await this.cache.smembers(`user-oauth-accounts:${userId}`);
            const accounts = [];
            for (const accountId of accountIds) {
                const account = await this.cache.get(`oauth-account:${accountId}`);
                if (account) {
                    const sanitizedAccount = { ...account };
                    delete sanitizedAccount.accessToken;
                    delete sanitizedAccount.refreshToken;
                    accounts.push(sanitizedAccount);
                }
            }
            return accounts.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        catch (error) {
            logger.error('Failed to get user OAuth2 accounts', { error, userId });
            return [];
        }
    }
    async refreshAccessToken(accountId) {
        try {
            const account = await this.cache.get(`oauth-account:${accountId}`);
            if (!account || !account.refreshToken) {
                return null;
            }
            const provider = this.providers.get(account.provider);
            if (!provider) {
                return null;
            }
            const tokenParams = {
                client_id: this.getClientId(account.provider),
                client_secret: this.getClientSecret(account.provider),
                refresh_token: account.refreshToken,
                grant_type: 'refresh_token'
            };
            const response = await axios_1.default.post(provider.tokenUrl, tokenParams, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });
            const tokens = {
                accessToken: response.data.access_token,
                refreshToken: response.data.refresh_token || account.refreshToken,
                expiresIn: response.data.expires_in,
                tokenType: response.data.token_type,
                scope: response.data.scope
            };
            account.accessToken = tokens.accessToken;
            account.refreshToken = tokens.refreshToken;
            account.expiresAt = new Date(Date.now() + (tokens.expiresIn * 1000));
            account.lastUsedAt = new Date();
            await this.cache.set(`oauth-account:${accountId}`, account, 0);
            logger.info('OAuth2 access token refreshed', {
                provider: account.provider,
                accountId: accountId.substring(0, 8) + '...'
            });
            return tokens;
        }
        catch (error) {
            logger.error('Failed to refresh OAuth2 access token', {
                error: error.response?.data || error.message,
                accountId
            });
            return null;
        }
    }
    async getAccountByProviderAndId(provider, providerAccountId) {
        try {
            const accountId = await this.cache.get(`oauth-account-by-provider:${provider}:${providerAccountId}`);
            if (!accountId) {
                return null;
            }
            return await this.cache.get(`oauth-account:${accountId}`);
        }
        catch (error) {
            logger.error('Failed to get OAuth2 account by provider', { error, provider, providerAccountId });
            return null;
        }
    }
    async getUserByEmail(email) {
        return null;
    }
    getClientId(provider) {
        switch (provider) {
            case 'google':
                return this.config.google.clientId;
            case 'microsoft':
                return this.config.microsoft.clientId;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    getClientSecret(provider) {
        switch (provider) {
            case 'google':
                return this.config.google.clientSecret;
            case 'microsoft':
                return this.config.microsoft.clientSecret;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    getRedirectUri(provider) {
        switch (provider) {
            case 'google':
                return this.config.google.redirectUri;
            case 'microsoft':
                return this.config.microsoft.redirectUri;
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    async checkRateLimit(ipAddress) {
        if (!ipAddress)
            return;
        const key = `oauth-rate-limit:${ipAddress}`;
        const current = await this.cache.get(key) || 0;
        if (current >= this.config.security.rateLimitPerHour) {
            throw new Error('Rate limit exceeded for OAuth2 requests');
        }
        await this.cache.increment(key);
        await this.cache.expire(key, 3600);
    }
    async getOAuth2Stats() {
        try {
            const accountKeys = await this.cache.keys('oauth-account:*');
            const userAccountKeys = await this.cache.keys('user-oauth-accounts:*');
            let totalAccounts = 0;
            const accountsByProvider = {};
            let linkedAccounts = 0;
            for (const key of accountKeys) {
                const account = await this.cache.get(key);
                if (account) {
                    totalAccounts++;
                    accountsByProvider[account.provider] = (accountsByProvider[account.provider] || 0) + 1;
                    if (account.metadata.linkedAt) {
                        linkedAccounts++;
                    }
                }
            }
            const recentLogins = 0;
            const failedAttempts = 0;
            return {
                totalAccounts,
                accountsByProvider,
                recentLogins,
                failedAttempts,
                linkedAccounts
            };
        }
        catch (error) {
            logger.error('Failed to get OAuth2 stats', { error });
            return {
                totalAccounts: 0,
                accountsByProvider: {},
                recentLogins: 0,
                failedAttempts: 0,
                linkedAccounts: 0
            };
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting OAuth2 maintenance');
            const stateKeys = await this.cache.keys('oauth-state:*');
            let cleanedStates = 0;
            for (const key of stateKeys) {
                const state = await this.cache.get(key);
                if (state && state.expiresAt < new Date()) {
                    await this.cache.del(key);
                    cleanedStates++;
                }
            }
            const linkKeys = await this.cache.keys('oauth-link:*');
            let cleanedLinks = 0;
            for (const key of linkKeys) {
                const ttl = await this.cache.ttl(key);
                if (ttl === -1 || ttl === 0) {
                    await this.cache.del(key);
                    cleanedLinks++;
                }
            }
            logger.info('OAuth2 maintenance completed', {
                cleanedStates,
                cleanedLinks
            });
        }
        catch (error) {
            logger.error('OAuth2 maintenance failed', { error });
        }
    }
}
exports.OAuth2Manager = OAuth2Manager;
//# sourceMappingURL=oauthManager.js.map