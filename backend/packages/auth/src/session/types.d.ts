export interface SessionConfig {
    ttl: number;
    extendOnActivity: boolean;
    maxConcurrentSessions: number;
    deviceTrackingEnabled: boolean;
    geoLocationTracking: boolean;
    suspiciousActivityDetection: boolean;
    sessionCookieName: string;
    secureSessionsOnly: boolean;
    sameSitePolicy: 'strict' | 'lax' | 'none';
}
export interface SessionData {
    id: string;
    userId: string;
    deviceFingerprint?: string;
    ipAddress?: string;
    userAgent?: string;
    location?: {
        country?: string;
        region?: string;
        city?: string;
        lat?: number;
        lon?: number;
    };
    createdAt: Date;
    lastActivityAt: Date;
    expiresAt: Date;
    active: boolean;
    data: Record<string, any>;
    securityFlags: {
        suspicious: boolean;
        riskScore: number;
        fraudulent: boolean;
        compromised: boolean;
    };
    deviceInfo?: {
        type: string;
        browser: string;
        browserVersion: string;
        os: string;
        osVersion: string;
        isMobile: boolean;
        isTablet: boolean;
        isDesktop: boolean;
    };
}
export interface SessionActivity {
    sessionId: string;
    userId: string;
    action: string;
    timestamp: Date;
    ipAddress?: string;
    userAgent?: string;
    resource?: string;
    metadata?: Record<string, any>;
}
export interface SuspiciousActivityRule {
    id: string;
    name: string;
    description: string;
    condition: (session: SessionData, activity: SessionActivity) => boolean;
    riskScore: number;
    action: 'log' | 'warn' | 'terminate' | 'require_mfa';
}
export interface SessionStats {
    totalActiveSessions: number;
    userActiveSessions: Record<string, number>;
    sessionsPerDevice: Record<string, number>;
    sessionsPerLocation: Record<string, number>;
    suspiciousSessions: number;
    averageSessionDuration: number;
}
export interface DeviceFingerprint {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    cookiesEnabled: boolean;
    doNotTrack: boolean;
    plugins: string[];
    canvas?: string;
    webgl?: string;
    hash: string;
}
//# sourceMappingURL=types.d.ts.map