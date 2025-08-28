import { CacheManager } from '@fineprintai/cache';
import { MFAConfig, MFAMethod, MFAChallenge, MFAVerificationResult, MFASetupRequest, MFASetupResponse, MFAStats } from './types';
export declare class MFAManager {
    private cache;
    private config;
    private twilioClient?;
    private emailTransporter?;
    constructor(cache: CacheManager, config: MFAConfig);
    private initializeProviders;
    setupMFAMethod(userId: string, request: MFASetupRequest): Promise<MFASetupResponse>;
    verifyMFASetup(userId: string, methodId: string, code: string): Promise<boolean>;
    createMFAChallenge(userId: string, sessionId: string, methodId?: string, ipAddress?: string, userAgent?: string): Promise<MFAChallenge | null>;
    verifyMFAChallenge(challengeId: string, code: string, ipAddress?: string, userAgent?: string): Promise<MFAVerificationResult>;
    getUserMFAMethods(userId: string): Promise<MFAMethod[]>;
    disableMFAMethod(userId: string, methodId: string): Promise<boolean>;
    removeMFAMethod(userId: string, methodId: string): Promise<boolean>;
    isMFARequired(userId: string, context: 'login' | 'sensitive-operation' | 'new-device'): Promise<boolean>;
    private setupTOTP;
    private setupSMS;
    private setupEmail;
    private generateBackupCodes;
    private verifyBackupCode;
    private sendSMSCode;
    private sendEmailCode;
    private generateMFACode;
    private getCodeLength;
    private getCodeExpiry;
    private lockoutUser;
    getMFAStats(): Promise<MFAStats>;
    performMaintenance(): Promise<void>;
}
//# sourceMappingURL=mfaManager.d.ts.map