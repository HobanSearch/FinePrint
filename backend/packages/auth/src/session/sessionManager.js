"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const crypto = __importStar(require("crypto"));
const ua_parser_js_1 = require("ua-parser-js");
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('session-manager');
class SessionManager {
    cache;
    config;
    suspiciousActivityRules = [];
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.initializeSuspiciousActivityRules();
    }
    async createSession(userId, ipAddress, userAgent, deviceFingerprint, initialData) {
        try {
            const sessionId = crypto.randomUUID();
            const now = new Date();
            const expiresAt = new Date(now.getTime() + (this.config.ttl * 1000));
            const deviceInfo = this.parseDeviceInfo(userAgent);
            const location = this.config.geoLocationTracking
                ? await this.getLocationFromIP(ipAddress)
                : undefined;
            const sessionData = {
                id: sessionId,
                userId,
                deviceFingerprint,
                ipAddress,
                userAgent,
                location,
                createdAt: now,
                lastActivityAt: now,
                expiresAt,
                active: true,
                data: initialData || {},
                securityFlags: {
                    suspicious: false,
                    riskScore: 0,
                    fraudulent: false,
                    compromised: false
                },
                deviceInfo
            };
            if (this.config.suspiciousActivityDetection) {
                await this.analyzeSuspiciousActivity(sessionData);
            }
            await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);
            await this.manageConcurrentSessions(userId, sessionId);
            await this.cache.sadd(`user-sessions:${userId}`, sessionId);
            await this.cache.expire(`user-sessions:${userId}`, this.config.ttl);
            await this.logSessionActivity(sessionId, userId, 'session_created', {
                deviceInfo: deviceInfo.browser,
                location: location?.city
            });
            logger.info('Session created', {
                sessionId: sessionId.substring(0, 8) + '...',
                userId: userId.substring(0, 8) + '...',
                ipAddress,
                deviceType: deviceInfo.type
            });
            return sessionData;
        }
        catch (error) {
            logger.error('Failed to create session', { error, userId });
            throw new Error('Session creation failed');
        }
    }
    async getSession(sessionId) {
        try {
            const sessionData = await this.cache.get(`session:${sessionId}`);
            if (!sessionData) {
                return null;
            }
            if (sessionData.expiresAt < new Date()) {
                await this.terminateSession(sessionId, 'expired');
                return null;
            }
            return sessionData;
        }
        catch (error) {
            logger.error('Failed to get session', { error, sessionId });
            return null;
        }
    }
    async updateSessionActivity(sessionId, action, metadata) {
        try {
            const sessionData = await this.getSession(sessionId);
            if (!sessionData) {
                return false;
            }
            const now = new Date();
            sessionData.lastActivityAt = now;
            if (this.config.extendOnActivity) {
                sessionData.expiresAt = new Date(now.getTime() + (this.config.ttl * 1000));
                await this.cache.expire(`session:${sessionId}`, this.config.ttl);
            }
            await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);
            await this.logSessionActivity(sessionId, sessionData.userId, action, metadata);
            if (this.config.suspiciousActivityDetection) {
                const activity = {
                    sessionId,
                    userId: sessionData.userId,
                    action,
                    timestamp: now,
                    ipAddress: sessionData.ipAddress,
                    userAgent: sessionData.userAgent,
                    metadata
                };
                await this.checkSuspiciousActivity(sessionData, activity);
            }
            logger.debug('Session activity updated', {
                sessionId: sessionId.substring(0, 8) + '...',
                action
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to update session activity', { error, sessionId });
            return false;
        }
    }
    async updateSessionData(sessionId, data) {
        try {
            const sessionData = await this.getSession(sessionId);
            if (!sessionData) {
                return false;
            }
            sessionData.data = { ...sessionData.data, ...data };
            await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);
            logger.debug('Session data updated', {
                sessionId: sessionId.substring(0, 8) + '...',
                dataKeys: Object.keys(data)
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to update session data', { error, sessionId });
            return false;
        }
    }
    async terminateSession(sessionId, reason = 'manual') {
        try {
            const sessionData = await this.getSession(sessionId);
            if (!sessionData) {
                return false;
            }
            await this.cache.del(`session:${sessionId}`);
            await this.cache.srem(`user-sessions:${sessionData.userId}`, sessionId);
            await this.logSessionActivity(sessionId, sessionData.userId, 'session_terminated', {
                reason,
                duration: Date.now() - sessionData.createdAt.getTime()
            });
            logger.info('Session terminated', {
                sessionId: sessionId.substring(0, 8) + '...',
                userId: sessionData.userId.substring(0, 8) + '...',
                reason
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to terminate session', { error, sessionId });
            return false;
        }
    }
    async terminateAllUserSessions(userId, reason = 'security-action', excludeSessionId) {
        try {
            const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
            let terminatedCount = 0;
            for (const sessionId of sessionIds) {
                if (excludeSessionId && sessionId === excludeSessionId) {
                    continue;
                }
                const success = await this.terminateSession(sessionId, reason);
                if (success)
                    terminatedCount++;
            }
            logger.info('All user sessions terminated', {
                userId: userId.substring(0, 8) + '...',
                count: terminatedCount,
                reason
            });
            return terminatedCount;
        }
        catch (error) {
            logger.error('Failed to terminate all user sessions', { error, userId });
            return 0;
        }
    }
    async getUserSessions(userId) {
        try {
            const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
            const sessions = [];
            for (const sessionId of sessionIds) {
                const sessionData = await this.getSession(sessionId);
                if (sessionData) {
                    sessions.push(sessionData);
                }
            }
            return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
        }
        catch (error) {
            logger.error('Failed to get user sessions', { error, userId });
            return [];
        }
    }
    async validateSession(sessionId) {
        try {
            const sessionData = await this.getSession(sessionId);
            if (!sessionData) {
                return { valid: false };
            }
            if (!sessionData.active) {
                return { valid: false };
            }
            if (sessionData.securityFlags.compromised || sessionData.securityFlags.fraudulent) {
                await this.terminateSession(sessionId, 'security-violation');
                return { valid: false };
            }
            return {
                valid: true,
                userId: sessionData.userId,
                session: sessionData
            };
        }
        catch (error) {
            logger.error('Session validation failed', { error, sessionId });
            return { valid: false };
        }
    }
    generateDeviceFingerprint(components) {
        const fingerprint = [
            components.userAgent || '',
            components.screenResolution || '',
            components.timezone || '',
            components.language || '',
            components.platform || '',
            components.cookiesEnabled?.toString() || '',
            components.doNotTrack?.toString() || '',
            components.plugins?.join(',') || '',
            components.canvas || '',
            components.webgl || ''
        ].join('|');
        const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');
        logger.debug('Device fingerprint generated', {
            hash: hash.substring(0, 16) + '...'
        });
        return hash;
    }
    async getSessionStats() {
        try {
            const sessionKeys = await this.cache.keys('session:*');
            const userSessionKeys = await this.cache.keys('user-sessions:*');
            let totalActiveSessions = 0;
            let suspiciousSessions = 0;
            let totalDuration = 0;
            const userActiveSessions = {};
            const sessionsPerDevice = {};
            const sessionsPerLocation = {};
            for (const key of sessionKeys) {
                const sessionData = await this.cache.get(key);
                if (sessionData && sessionData.active) {
                    totalActiveSessions++;
                    if (sessionData.securityFlags.suspicious) {
                        suspiciousSessions++;
                    }
                    const duration = Date.now() - sessionData.createdAt.getTime();
                    totalDuration += duration;
                    userActiveSessions[sessionData.userId] = (userActiveSessions[sessionData.userId] || 0) + 1;
                    if (sessionData.deviceInfo?.type) {
                        sessionsPerDevice[sessionData.deviceInfo.type] = (sessionsPerDevice[sessionData.deviceInfo.type] || 0) + 1;
                    }
                    if (sessionData.location?.country) {
                        sessionsPerLocation[sessionData.location.country] = (sessionsPerLocation[sessionData.location.country] || 0) + 1;
                    }
                }
            }
            const averageSessionDuration = totalActiveSessions > 0 ? totalDuration / totalActiveSessions : 0;
            return {
                totalActiveSessions,
                userActiveSessions,
                sessionsPerDevice,
                sessionsPerLocation,
                suspiciousSessions,
                averageSessionDuration
            };
        }
        catch (error) {
            logger.error('Failed to get session stats', { error });
            return {
                totalActiveSessions: 0,
                userActiveSessions: {},
                sessionsPerDevice: {},
                sessionsPerLocation: {},
                suspiciousSessions: 0,
                averageSessionDuration: 0
            };
        }
    }
    async manageConcurrentSessions(userId, newSessionId) {
        try {
            const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
            if (sessionIds.length >= this.config.maxConcurrentSessions) {
                const sessions = [];
                for (const sessionId of sessionIds) {
                    const sessionData = await this.getSession(sessionId);
                    if (sessionData) {
                        sessions.push({
                            id: sessionId,
                            lastActivity: sessionData.lastActivityAt
                        });
                    }
                }
                sessions.sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());
                const sessionsToTerminate = sessions.length - this.config.maxConcurrentSessions + 1;
                for (let i = 0; i < sessionsToTerminate; i++) {
                    await this.terminateSession(sessions[i].id, 'concurrent-session-limit');
                }
                logger.info('Concurrent session limit enforced', {
                    userId: userId.substring(0, 8) + '...',
                    terminatedSessions: sessionsToTerminate
                });
            }
        }
        catch (error) {
            logger.error('Failed to manage concurrent sessions', { error, userId });
        }
    }
    parseDeviceInfo(userAgent) {
        if (!userAgent) {
            return undefined;
        }
        try {
            const parser = new ua_parser_js_1.UAParser(userAgent);
            const result = parser.getResult();
            return {
                type: result.device.type || 'desktop',
                browser: result.browser.name || 'unknown',
                browserVersion: result.browser.version || 'unknown',
                os: result.os.name || 'unknown',
                osVersion: result.os.version || 'unknown',
                isMobile: result.device.type === 'mobile',
                isTablet: result.device.type === 'tablet',
                isDesktop: !result.device.type || result.device.type === 'desktop'
            };
        }
        catch (error) {
            logger.error('Failed to parse device info', { error, userAgent });
            return undefined;
        }
    }
    async getLocationFromIP(ipAddress) {
        if (!ipAddress) {
            return undefined;
        }
        return {
            country: 'US',
            region: 'CA',
            city: 'San Francisco',
            lat: 37.7749,
            lon: -122.4194
        };
    }
    initializeSuspiciousActivityRules() {
        this.suspiciousActivityRules = [
            {
                id: 'rapid-location-change',
                name: 'Rapid Location Change',
                description: 'Session location changed too quickly to be physically possible',
                condition: (session, activity) => {
                    return false;
                },
                riskScore: 8,
                action: 'terminate'
            },
            {
                id: 'unusual-device',
                name: 'Unusual Device',
                description: 'Login from a device type not previously used',
                condition: (session, activity) => {
                    return false;
                },
                riskScore: 5,
                action: 'warn'
            },
            {
                id: 'high-frequency-requests',
                name: 'High Frequency Requests',
                description: 'Unusually high number of requests in short time',
                condition: (session, activity) => {
                    return false;
                },
                riskScore: 6,
                action: 'require_mfa'
            }
        ];
    }
    async analyzeSuspiciousActivity(sessionData) {
        try {
            let riskScore = 0;
            const reasons = [];
            const userSessions = await this.getUserSessions(sessionData.userId);
            if (userSessions.length > 0 && sessionData.location) {
                const hasDistantSession = userSessions.some(session => {
                    if (!session.location)
                        return false;
                    const latDiff = Math.abs((session.location.lat || 0) - (sessionData.location.lat || 0));
                    const lonDiff = Math.abs((session.location.lon || 0) - (sessionData.location.lon || 0));
                    return latDiff > 5 || lonDiff > 5;
                });
                if (hasDistantSession) {
                    riskScore += 7;
                    reasons.push('Multiple distant locations');
                }
            }
            const deviceTypeCounts = userSessions.reduce((acc, session) => {
                const deviceType = session.deviceInfo?.type || 'unknown';
                acc[deviceType] = (acc[deviceType] || 0) + 1;
                return acc;
            }, {});
            const currentDeviceType = sessionData.deviceInfo?.type || 'unknown';
            if (!deviceTypeCounts[currentDeviceType]) {
                riskScore += 3;
                reasons.push('New device type');
            }
            if (riskScore >= 7) {
                sessionData.securityFlags.suspicious = true;
                sessionData.securityFlags.riskScore = riskScore;
                logger.warn('Suspicious session detected', {
                    sessionId: sessionData.id.substring(0, 8) + '...',
                    userId: sessionData.userId.substring(0, 8) + '...',
                    riskScore,
                    reasons
                });
            }
        }
        catch (error) {
            logger.error('Failed to analyze suspicious activity', { error });
        }
    }
    async checkSuspiciousActivity(sessionData, activity) {
        try {
            for (const rule of this.suspiciousActivityRules) {
                if (rule.condition(sessionData, activity)) {
                    sessionData.securityFlags.riskScore += rule.riskScore;
                    if (sessionData.securityFlags.riskScore >= 10) {
                        sessionData.securityFlags.suspicious = true;
                    }
                    logger.warn('Suspicious activity detected', {
                        rule: rule.name,
                        sessionId: sessionData.id.substring(0, 8) + '...',
                        riskScore: rule.riskScore,
                        action: rule.action
                    });
                    if (rule.action === 'terminate') {
                        await this.terminateSession(sessionData.id, 'suspicious-activity');
                    }
                    break;
                }
            }
        }
        catch (error) {
            logger.error('Failed to check suspicious activity', { error });
        }
    }
    async logSessionActivity(sessionId, userId, action, metadata) {
        try {
            const activity = {
                sessionId,
                userId,
                action,
                timestamp: new Date(),
                metadata
            };
            await this.cache.lpush('audit:session-activities', activity);
            await this.cache.getRawClient().ltrim('fpa:audit:session-activities', 0, 999);
            await this.cache.lpush(`audit:session-activities:${userId}`, activity);
            await this.cache.getRawClient().ltrim(`fpa:audit:session-activities:${userId}`, 0, 99);
        }
        catch (error) {
            logger.error('Failed to log session activity', { error });
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting session maintenance');
            const sessionKeys = await this.cache.keys('session:*');
            let cleanedSessions = 0;
            for (const key of sessionKeys) {
                const sessionData = await this.cache.get(key);
                if (sessionData && sessionData.expiresAt < new Date()) {
                    await this.terminateSession(sessionData.id, 'expired');
                    cleanedSessions++;
                }
            }
            logger.info('Session maintenance completed', {
                cleanedSessions
            });
        }
        catch (error) {
            logger.error('Session maintenance failed', { error });
        }
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=sessionManager.js.map