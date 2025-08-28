import { CacheManager } from '@fineprintai/cache';
import { PasswordConfig, PasswordValidationResult, PasswordHashResult } from './types';
export declare class PasswordManager {
    private cache;
    private config;
    constructor(cache: CacheManager, config: PasswordConfig);
    hashPassword(password: string): Promise<PasswordHashResult>;
    verifyPassword(password: string, hash: string): Promise<boolean>;
    validatePassword(password: string, userInfo?: {
        email?: string;
        name?: string;
        username?: string;
    }): Promise<PasswordValidationResult>;
    storePasswordHistory(userId: string, passwordHash: PasswordHashResult): Promise<void>;
    checkPasswordHistory(userId: string, password: string): Promise<boolean>;
    generatePasswordResetToken(userId: string, ipAddress?: string, userAgent?: string): Promise<string>;
    validatePasswordResetToken(token: string): Promise<{
        valid: boolean;
        userId?: string;
    }>;
    revokeUserPasswordResetTokens(userId: string): Promise<void>;
    logPasswordChange(userId: string, reason: 'user-initiated' | 'admin-reset' | 'security-required' | 'expired', success: boolean, ipAddress?: string, userAgent?: string, failureReason?: string): Promise<void>;
    isPasswordExpired(userId: string, lastPasswordChange: Date): Promise<boolean>;
    generateSecurePassword(length?: number): string;
    getPasswordStats(): Promise<{
        totalPasswordChanges: number;
        recentPasswordChanges: number;
        activeResetTokens: number;
        expiredPasswords: number;
    }>;
    performMaintenance(): Promise<void>;
}
//# sourceMappingURL=passwordManager.d.ts.map