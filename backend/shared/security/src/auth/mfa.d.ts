export interface MFASetupRequest {
    userId: string;
    type: MFAType;
    phoneNumber?: string;
    email?: string;
}
export interface MFAVerifyRequest {
    userId: string;
    token: string;
    type: MFAType;
    deviceId?: string;
    trustDevice?: boolean;
}
export declare enum MFAType {
    TOTP = "totp",
    SMS = "sms",
    EMAIL = "email",
    BACKUP_CODES = "backup_codes"
}
export interface MFASecret {
    secret: string;
    qrCodeUrl?: string;
    backupCodes?: string[];
}
export interface TrustedDevice {
    deviceId: string;
    deviceName: string;
    createdAt: Date;
    lastUsedAt: Date;
    ipAddress: string;
    userAgent: string;
}
export declare class MFAService {
    private readonly appName;
    private readonly issuer;
    setupTOTP(userId: string, email: string): Promise<MFASecret>;
    verifyTOTP(token: string, secret: string, window?: number): boolean;
    generateBackupCodes(count?: number): string[];
    verifyBackupCode(code: string, validCodes: string[]): boolean;
    generateSMSToken(): string;
    verifySMSEmailToken(token: string, storedToken: string, createdAt: Date, expirationMinutes?: number): boolean;
    generateDeviceFingerprint(userAgent: string, ipAddress: string): string;
    createTrustedDevice(userAgent: string, ipAddress: string, deviceName?: string): TrustedDevice;
    private parseDeviceName;
    shouldRequireMFA(context: {
        userId: string;
        ipAddress: string;
        userAgent: string;
        lastLoginAt?: Date;
        isNewDevice: boolean;
        isHighRiskAction: boolean;
        suspiciousActivity: boolean;
    }): boolean;
    generateRecoveryCodes(count?: number): string[];
    encryptSecret(secret: string, masterKey: string): string;
    decryptSecret(encryptedSecret: string, masterKey: string): string;
    checkMFARateLimit(userId: string, attempts: number, windowMinutes?: number): boolean;
    generateTimeBasedChallenge(): string;
}
export interface MFARecord {
    userId: string;
    type: MFAType;
    secret?: string;
    phoneNumber?: string;
    email?: string;
    backupCodes?: string[];
    isEnabled: boolean;
    createdAt: Date;
    lastUsedAt?: Date;
    failedAttempts: number;
    lockedUntil?: Date;
}
export interface MFAAttempt {
    userId: string;
    type: MFAType;
    success: boolean;
    ipAddress: string;
    userAgent: string;
    deviceId?: string;
    createdAt: Date;
}
export declare const mfaService: MFAService;
//# sourceMappingURL=mfa.d.ts.map