export interface MFAConfig {
    totp: {
        enabled: boolean;
        issuer: string;
        window: number;
        stepSize: number;
    };
    sms: {
        enabled: boolean;
        provider: 'twilio' | 'aws-sns';
        from: string;
        rateLimitPerHour: number;
        codeLength: number;
        codeExpiry: number;
    };
    email: {
        enabled: boolean;
        from: string;
        rateLimitPerHour: number;
        codeLength: number;
        codeExpiry: number;
        template: string;
    };
    backup: {
        enabled: boolean;
        codeCount: number;
        codeLength: number;
    };
    enforcement: {
        requireForNewDevices: boolean;
        requireForSensitiveOperations: boolean;
        maxFailedAttempts: number;
        lockoutDuration: number;
    };
}
export interface MFAMethod {
    id: string;
    userId: string;
    type: 'totp' | 'sms' | 'email' | 'backup';
    enabled: boolean;
    verified: boolean;
    createdAt: Date;
    lastUsedAt?: Date;
    metadata: {
        secret?: string;
        qrCode?: string;
        phoneNumber?: string;
        countryCode?: string;
        email?: string;
        codes?: string[];
        usedCodes?: string[];
    };
}
export interface MFAChallenge {
    id: string;
    userId: string;
    sessionId: string;
    type: 'totp' | 'sms' | 'email' | 'backup';
    code?: string;
    createdAt: Date;
    expiresAt: Date;
    verified: boolean;
    attempts: number;
    maxAttempts: number;
    ipAddress?: string;
    userAgent?: string;
}
export interface MFAVerificationResult {
    success: boolean;
    challengeId?: string;
    method?: MFAMethod;
    error?: string;
    remainingAttempts?: number;
    lockoutUntil?: Date;
}
export interface MFASetupRequest {
    type: 'totp' | 'sms' | 'email';
    phoneNumber?: string;
    email?: string;
}
export interface MFASetupResponse {
    method: MFAMethod;
    setupData?: {
        qrCode?: string;
        secret?: string;
        backupCodes?: string[];
    };
}
export interface BackupCode {
    code: string;
    used: boolean;
    usedAt?: Date;
}
export interface MFAStats {
    totalUsers: number;
    enabledUsers: number;
    methodDistribution: Record<string, number>;
    verificationAttempts: number;
    successfulVerifications: number;
    failedVerifications: number;
    lockedOutUsers: number;
}
//# sourceMappingURL=types.d.ts.map