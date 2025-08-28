import { JWTPayload, RefreshTokenPayload } from '@fineprintai/shared-types';
export interface JWTKeyPair {
    publicKey: string;
    privateKey: string;
}
export interface JWTOptions {
    algorithm: 'RS256';
    issuer: string;
    audience: string;
    accessTokenTTL: number;
    refreshTokenTTL: number;
}
export interface TokenValidationResult {
    valid: boolean;
    payload?: JWTPayload | RefreshTokenPayload;
    error?: string;
    expired?: boolean;
}
export interface RefreshTokenData {
    id: string;
    userId: string;
    tokenHash: string;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
    expiresAt: Date;
    createdAt: Date;
    lastUsedAt: Date;
    revoked: boolean;
    revokedAt?: Date;
    revokedReason?: string;
}
export interface AccessTokenData {
    jti: string;
    userId: string;
    sessionId: string;
    refreshTokenId: string;
    scopes: string[];
    createdAt: Date;
    expiresAt: Date;
}
export interface TokenBlacklistEntry {
    jti: string;
    userId: string;
    expiresAt: Date;
    reason: string;
    createdAt: Date;
}
export interface KeyRotationConfig {
    rotationIntervalHours: number;
    maxKeyAge: number;
    keyOverlapPeriod: number;
    autoRotate: boolean;
}
export interface JWTManagerConfig extends JWTOptions {
    keyRotation: KeyRotationConfig;
    blacklistEnabled: boolean;
    maxRefreshTokensPerUser: number;
    deviceTrackingEnabled: boolean;
}
//# sourceMappingURL=types.d.ts.map