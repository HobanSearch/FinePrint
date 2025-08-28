import { CacheManager } from '@fineprintai/cache';
import { SessionConfig, SessionData, SessionStats, DeviceFingerprint } from './types';
export declare class SessionManager {
    private cache;
    private config;
    private suspiciousActivityRules;
    constructor(cache: CacheManager, config: SessionConfig);
    createSession(userId: string, ipAddress?: string, userAgent?: string, deviceFingerprint?: string, initialData?: Record<string, any>): Promise<SessionData>;
    getSession(sessionId: string): Promise<SessionData | null>;
    updateSessionActivity(sessionId: string, action: string, metadata?: Record<string, any>): Promise<boolean>;
    updateSessionData(sessionId: string, data: Record<string, any>): Promise<boolean>;
    terminateSession(sessionId: string, reason?: string): Promise<boolean>;
    terminateAllUserSessions(userId: string, reason?: string, excludeSessionId?: string): Promise<number>;
    getUserSessions(userId: string): Promise<SessionData[]>;
    validateSession(sessionId: string): Promise<{
        valid: boolean;
        userId?: string;
        session?: SessionData;
    }>;
    generateDeviceFingerprint(components: Partial<DeviceFingerprint>): string;
    getSessionStats(): Promise<SessionStats>;
    private manageConcurrentSessions;
    private parseDeviceInfo;
    private getLocationFromIP;
    private initializeSuspiciousActivityRules;
    private analyzeSuspiciousActivity;
    private checkSuspiciousActivity;
    private logSessionActivity;
    performMaintenance(): Promise<void>;
}
//# sourceMappingURL=sessionManager.d.ts.map