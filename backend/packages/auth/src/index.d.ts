import { CacheManager } from '@fineprintai/cache';
export { JWTKeyManager } from './jwt/keyManager';
export { JWTTokenManager } from './jwt/tokenManager';
export * from './jwt/types';
export { PasswordManager } from './password/passwordManager';
export * from './password/types';
export { SessionManager } from './session/sessionManager';
export * from './session/types';
export { MFAManager } from './mfa/mfaManager';
export * from './mfa/types';
export { OAuth2Manager } from './oauth/oauthManager';
export * from './oauth/types';
export { AuthRateLimiter } from './rateLimit/rateLimiter';
export * from './rateLimit/types';
export { AuditLogger } from './audit/auditLogger';
export * from './audit/types';
import { JWTManagerConfig, PasswordConfig, SessionConfig, MFAConfig, OAuth2Config, RateLimitConfig, AuditConfig } from './types';
export interface AuthConfig {
    jwt: JWTManagerConfig;
    password: PasswordConfig;
    session: SessionConfig;
    mfa: MFAConfig;
    oauth: OAuth2Config;
    rateLimit: RateLimitConfig;
    audit: AuditConfig;
}
export declare class AuthManager {
    private cache;
    private config;
    jwt: JWTTokenManager;
    password: PasswordManager;
    session: SessionManager;
    mfa: MFAManager;
    oauth: OAuth2Manager;
    rateLimit: AuthRateLimiter;
    audit: AuditLogger;
    constructor(cache: CacheManager, config: AuthConfig);
    getSecurityStatus(): Promise<{
        jwt: any;
        sessions: any;
        mfa: any;
        oauth: any;
        rateLimit: any;
        audit: any;
    }>;
    performMaintenance(): Promise<{
        jwt: void;
        password: void;
        session: void;
        mfa: void;
        oauth: void;
        rateLimit: void;
        audit: number;
    }>;
    shutdown(): Promise<void>;
    healthCheck(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        components: Record<string, 'healthy' | 'unhealthy'>;
        details: Record<string, any>;
    }>;
}
export declare function createDefaultAuthConfig(): AuthConfig;
import { AuditLevel, AuditEventType } from './audit/types';
export { AuditLevel, AuditEventType };
export default AuthManager;
//# sourceMappingURL=index.d.ts.map