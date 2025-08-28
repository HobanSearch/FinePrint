import { CacheManager } from '@fineprintai/cache';
import { JWTPayload } from '@fineprintai/shared-types';
import { JWTManagerConfig, TokenValidationResult } from './types';
export declare class JWTTokenManager {
    private keyManager;
    private cache;
    private config;
    constructor(cache: CacheManager, config: JWTManagerConfig);
    generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>): Promise<string>;
    generateRefreshToken(userId: string, deviceFingerprint?: string, ipAddress?: string, userAgent?: string): Promise<{
        token: string;
        tokenId: string;
    }>;
    validateAccessToken(token: string): Promise<TokenValidationResult>;
    validateRefreshToken(token: string): Promise<TokenValidationResult>;
    rotateRefreshToken(oldToken: string, deviceFingerprint?: string, ipAddress?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        tokenId: string;
    } | null>;
    revokeRefreshToken(tokenId: string, reason?: string): Promise<boolean>;
    revokeAllUserRefreshTokens(userId: string, reason?: string): Promise<number>;
    blacklistAccessToken(jti: string, userId: string, reason: string): Promise<boolean>;
    private isTokenBlacklisted;
    private validateTokenWithKey;
    private manageUserRefreshTokens;
    getTokenStats(): Promise<{
        activeAccessTokens: number;
        activeRefreshTokens: number;
        blacklistedTokens: number;
        rotationStatus: any;
    }>;
    performMaintenance(): Promise<void>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=tokenManager.d.ts.map