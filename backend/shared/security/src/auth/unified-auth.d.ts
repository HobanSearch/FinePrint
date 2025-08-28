import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
export interface AuthConfig {
    jwtSecret: string;
    jwtAccessExpiration: string;
    jwtRefreshExpiration: string;
    mfaSecret: string;
    sessionTimeout: number;
    maxConcurrentSessions: number;
    crossDeviceSync: boolean;
    biometricAuth: boolean;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    sessionId: string;
    deviceId: string;
    expiresAt: Date;
    platformTokens?: PlatformTokens;
}
export interface PlatformTokens {
    web: {
        httpOnlyCookie: string;
        csrfToken: string;
    };
    mobile: {
        secureToken: string;
        biometricHash?: string;
    };
    extension: {
        secureStorageToken: string;
        manifestPermissions: string[];
    };
}
export interface DeviceInfo {
    deviceId: string;
    deviceName: string;
    platform: 'web' | 'mobile' | 'extension';
    os: string;
    browser?: string;
    version: string;
    fingerprint: string;
    lastSeen: Date;
    trusted: boolean;
    location?: {
        country: string;
        city: string;
        ip: string;
    };
}
export interface SessionData {
    sessionId: string;
    userId: string;
    deviceId: string;
    platform: 'web' | 'mobile' | 'extension';
    createdAt: Date;
    lastActivity: Date;
    expiresAt: Date;
    ipAddress: string;
    userAgent: string;
    mfaVerified: boolean;
    riskScore: number;
    permissions: string[];
}
export interface BiometricData {
    userId: string;
    deviceId: string;
    biometricType: 'fingerprint' | 'faceId' | 'voiceId';
    hash: string;
    publicKey: string;
    enrolledAt: Date;
    lastUsed: Date;
}
export interface CrossDeviceSync {
    userId: string;
    sessionIds: string[];
    syncKey: string;
    lastSync: Date;
    conflictResolution: 'latest' | 'manual';
}
export declare class UnifiedAuthService {
    private redis;
    private prisma;
    private mfaService;
    private config;
    constructor(redis: Redis, prisma: PrismaClient, config: AuthConfig);
    authenticateUser(email: string, password: string, deviceInfo: DeviceInfo, options: {
        mfaToken?: string;
        biometricData?: string;
        trustDevice?: boolean;
        platform: 'web' | 'mobile' | 'extension';
    }): Promise<AuthTokens>;
    private generateTokens;
    private generatePlatformTokens;
    refreshTokens(refreshToken: string, deviceInfo: DeviceInfo): Promise<AuthTokens>;
    revokeTokens(sessionId: string, userId?: string): Promise<void>;
    setupBiometric(userId: string, deviceId: string, biometricType: 'fingerprint' | 'faceId' | 'voiceId', publicKey: string): Promise<string>;
    private verifyBiometric;
    syncCrossDeviceSessions(userId: string): Promise<SessionData[]>;
    getActiveSessions(userId: string): Promise<SessionData[]>;
    terminateSession(sessionId: string, userId: string): Promise<void>;
    verifyZeroTrust(token: string, requiredPermissions: string[]): Promise<boolean>;
    private verifyCredentials;
    private checkMFARequirement;
    private verifyMFA;
    private createSession;
    private calculateRiskScore;
    private parseTimeString;
    private storeTokens;
    private storeSession;
    private getSession;
    private invalidateSession;
    private updateSessionActivity;
    private generateSecureCookieToken;
    private encryptForKeystore;
    private encryptForExtension;
    private generateBiometricHash;
    private getExtensionPermissions;
    private getUserById;
    private revokeAllUserSessions;
    private updateCrossDeviceSync;
    private storeBiometricData;
    private getBiometricData;
    private updateBiometricLastUsed;
    private verifyBiometricSignature;
    private setupCrossDeviceSync;
    private getCrossDeviceSync;
    private getMFARecord;
    private trustDevice;
    private getUserPermissions;
    private requireAdditionalVerification;
    private logAuthAttempt;
}
export declare const createUnifiedAuth: (redis: Redis, prisma: PrismaClient, config: AuthConfig) => UnifiedAuthService;
//# sourceMappingURL=unified-auth.d.ts.map