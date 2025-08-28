import { CacheManager } from '@fineprintai/cache';
import { OAuth2Config, OAuth2Provider, OAuth2AuthorizationRequest, OAuth2AuthorizationResponse, OAuth2TokenRequest, OAuth2TokenResponse, OAuth2UserInfo, OAuth2Account, OAuth2AuthResult, OAuth2Stats } from './types';
export declare class OAuth2Manager {
    private cache;
    private config;
    private providers;
    constructor(cache: CacheManager, config: OAuth2Config);
    private initializeProviders;
    getProviders(): OAuth2Provider[];
    generateAuthorizationUrl(request: OAuth2AuthorizationRequest, ipAddress?: string, userAgent?: string): Promise<OAuth2AuthorizationResponse>;
    exchangeCodeForTokens(request: OAuth2TokenRequest, ipAddress?: string, userAgent?: string): Promise<OAuth2TokenResponse>;
    getUserInfo(provider: string, accessToken: string): Promise<OAuth2UserInfo>;
    authenticateUser(request: OAuth2TokenRequest, ipAddress?: string, userAgent?: string): Promise<OAuth2AuthResult>;
    linkAccount(linkToken: string, userId: string, confirmEmail: string): Promise<OAuth2AuthResult>;
    unlinkAccount(userId: string, accountId: string): Promise<boolean>;
    getUserAccounts(userId: string): Promise<OAuth2Account[]>;
    refreshAccessToken(accountId: string): Promise<OAuth2TokenResponse | null>;
    private getAccountByProviderAndId;
    private getUserByEmail;
    private getClientId;
    private getClientSecret;
    private getRedirectUri;
    private checkRateLimit;
    getOAuth2Stats(): Promise<OAuth2Stats>;
    performMaintenance(): Promise<void>;
}
//# sourceMappingURL=oauthManager.d.ts.map