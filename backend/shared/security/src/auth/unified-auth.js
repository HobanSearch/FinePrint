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
exports.createUnifiedAuth = exports.UnifiedAuthService = void 0;
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
const mfa_1 = require("./mfa");
const index_1 = require("../index");
class UnifiedAuthService {
    redis;
    prisma;
    mfaService;
    config;
    constructor(redis, prisma, config) {
        this.redis = redis;
        this.prisma = prisma;
        this.mfaService = new mfa_1.MFAService();
        this.config = config;
    }
    async authenticateUser(email, password, deviceInfo, options) {
        try {
            const user = await this.verifyCredentials(email, password);
            if (!user) {
                throw new index_1.SecurityError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
            }
            const mfaRequired = await this.checkMFARequirement(user.id, deviceInfo);
            if (mfaRequired && !options.mfaToken && !options.biometricData) {
                throw new index_1.SecurityError('MFA required', 'AUTH_MFA_REQUIRED');
            }
            if (options.mfaToken) {
                const mfaValid = await this.verifyMFA(user.id, options.mfaToken);
                if (!mfaValid) {
                    throw new index_1.SecurityError('Invalid MFA token', 'AUTH_INVALID_MFA');
                }
            }
            if (options.biometricData) {
                const biometricValid = await this.verifyBiometric(user.id, deviceInfo.deviceId, options.biometricData);
                if (!biometricValid) {
                    throw new index_1.SecurityError('Invalid biometric data', 'AUTH_INVALID_BIOMETRIC');
                }
            }
            const sessionId = await this.createSession(user.id, deviceInfo, options.platform);
            const tokens = await this.generateTokens(user, sessionId, deviceInfo, options.platform);
            if (options.trustDevice) {
                await this.trustDevice(user.id, deviceInfo);
            }
            if (this.config.crossDeviceSync) {
                await this.setupCrossDeviceSync(user.id, sessionId);
            }
            return tokens;
        }
        catch (error) {
            await this.logAuthAttempt(email, deviceInfo, false, error.message);
            throw error;
        }
    }
    async generateTokens(user, sessionId, deviceInfo, platform) {
        const now = new Date();
        const accessExpiry = new Date(now.getTime() + this.parseTimeString(this.config.jwtAccessExpiration));
        const refreshExpiry = new Date(now.getTime() + this.parseTimeString(this.config.jwtRefreshExpiration));
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
            sessionId,
            deviceId: deviceInfo.deviceId,
            platform,
            iat: Math.floor(now.getTime() / 1000),
            exp: Math.floor(accessExpiry.getTime() / 1000)
        };
        const accessToken = jwt.sign(payload, this.config.jwtSecret, { algorithm: 'HS256' });
        const refreshToken = jwt.sign({ sub: user.id, sessionId, type: 'refresh' }, this.config.jwtSecret, { expiresIn: this.config.jwtRefreshExpiration });
        const platformTokens = await this.generatePlatformTokens(accessToken, refreshToken, platform, deviceInfo);
        await this.storeTokens(sessionId, {
            accessToken,
            refreshToken,
            expiresAt: accessExpiry,
            platformTokens
        });
        return {
            accessToken,
            refreshToken,
            sessionId,
            deviceId: deviceInfo.deviceId,
            expiresAt: accessExpiry,
            platformTokens
        };
    }
    async generatePlatformTokens(accessToken, refreshToken, platform, deviceInfo) {
        const platformTokens = {};
        switch (platform) {
            case 'web':
                const csrfToken = crypto.randomBytes(32).toString('hex');
                platformTokens.web = {
                    httpOnlyCookie: this.generateSecureCookieToken(accessToken),
                    csrfToken
                };
                await this.redis.setex(`csrf:${csrfToken}`, 3600, accessToken);
                break;
            case 'mobile':
                const secureToken = await this.encryptForKeystore(accessToken, deviceInfo.deviceId);
                platformTokens.mobile = {
                    secureToken,
                    biometricHash: await this.generateBiometricHash(deviceInfo.deviceId)
                };
                break;
            case 'extension':
                const extensionToken = await this.encryptForExtension(accessToken);
                platformTokens.extension = {
                    secureStorageToken: extensionToken,
                    manifestPermissions: this.getExtensionPermissions()
                };
                break;
        }
        return platformTokens;
    }
    async refreshTokens(refreshToken, deviceInfo) {
        try {
            const decoded = jwt.verify(refreshToken, this.config.jwtSecret);
            if (decoded.type !== 'refresh') {
                throw new index_1.SecurityError('Invalid refresh token type', 'AUTH_INVALID_REFRESH_TOKEN');
            }
            const session = await this.getSession(decoded.sessionId);
            if (!session) {
                throw new index_1.SecurityError('Session not found', 'AUTH_SESSION_NOT_FOUND');
            }
            if (session.deviceId !== deviceInfo.deviceId) {
                throw new index_1.SecurityError('Device mismatch', 'AUTH_DEVICE_MISMATCH');
            }
            const user = await this.getUserById(decoded.sub);
            const newTokens = await this.generateTokens(user, decoded.sessionId, deviceInfo, session.platform);
            await this.updateSessionActivity(decoded.sessionId);
            return newTokens;
        }
        catch (error) {
            throw new index_1.SecurityError('Token refresh failed', 'AUTH_REFRESH_FAILED');
        }
    }
    async revokeTokens(sessionId, userId) {
        try {
            await this.redis.del(`tokens:${sessionId}`);
            await this.invalidateSession(sessionId);
            if (userId) {
                await this.revokeAllUserSessions(userId);
            }
            if (this.config.crossDeviceSync && userId) {
                await this.updateCrossDeviceSync(userId);
            }
        }
        catch (error) {
            throw new index_1.SecurityError('Token revocation failed', 'AUTH_REVOKE_FAILED');
        }
    }
    async setupBiometric(userId, deviceId, biometricType, publicKey) {
        try {
            const biometricHash = crypto
                .createHmac('sha256', this.config.mfaSecret)
                .update(`${userId}:${deviceId}:${biometricType}`)
                .digest('hex');
            const biometricData = {
                userId,
                deviceId,
                biometricType,
                hash: biometricHash,
                publicKey,
                enrolledAt: new Date(),
                lastUsed: new Date()
            };
            await this.storeBiometricData(biometricData);
            return biometricHash;
        }
        catch (error) {
            throw new index_1.SecurityError('Biometric setup failed', 'AUTH_BIOMETRIC_SETUP_FAILED');
        }
    }
    async verifyBiometric(userId, deviceId, biometricData) {
        try {
            const storedBiometric = await this.getBiometricData(userId, deviceId);
            if (!storedBiometric) {
                return false;
            }
            const isValid = await this.verifyBiometricSignature(biometricData, storedBiometric.publicKey);
            if (isValid) {
                await this.updateBiometricLastUsed(userId, deviceId);
            }
            return isValid;
        }
        catch (error) {
            return false;
        }
    }
    async syncCrossDeviceSessions(userId) {
        try {
            const syncData = await this.getCrossDeviceSync(userId);
            if (!syncData) {
                return [];
            }
            const sessions = [];
            for (const sessionId of syncData.sessionIds) {
                const session = await this.getSession(sessionId);
                if (session) {
                    sessions.push(session);
                }
            }
            return sessions;
        }
        catch (error) {
            throw new index_1.SecurityError('Cross-device sync failed', 'AUTH_SYNC_FAILED');
        }
    }
    async getActiveSessions(userId) {
        try {
            const sessionKeys = await this.redis.keys(`session:${userId}:*`);
            const sessions = [];
            for (const key of sessionKeys) {
                const sessionData = await this.redis.get(key);
                if (sessionData) {
                    sessions.push(JSON.parse(sessionData));
                }
            }
            return sessions.filter(session => session.expiresAt > new Date());
        }
        catch (error) {
            throw new index_1.SecurityError('Failed to get active sessions', 'AUTH_SESSIONS_FAILED');
        }
    }
    async terminateSession(sessionId, userId) {
        try {
            const session = await this.getSession(sessionId);
            if (!session || session.userId !== userId) {
                throw new index_1.SecurityError('Session not found or unauthorized', 'AUTH_SESSION_UNAUTHORIZED');
            }
            await this.invalidateSession(sessionId);
            await this.redis.del(`tokens:${sessionId}`);
        }
        catch (error) {
            throw error;
        }
    }
    async verifyZeroTrust(token, requiredPermissions) {
        try {
            const decoded = jwt.verify(token, this.config.jwtSecret);
            const session = await this.getSession(decoded.sessionId);
            if (!session) {
                return false;
            }
            if (session.expiresAt < new Date()) {
                return false;
            }
            const hasPermissions = requiredPermissions.every(permission => session.permissions.includes(permission));
            if (!hasPermissions) {
                return false;
            }
            if (session.riskScore > 70) {
                return await this.requireAdditionalVerification(session);
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    async verifyCredentials(email, password) {
        return { id: 'user-id', email, role: 'user' };
    }
    async checkMFARequirement(userId, deviceInfo) {
        return this.mfaService.shouldRequireMFA({
            userId,
            ipAddress: deviceInfo.location?.ip || '',
            userAgent: deviceInfo.browser || '',
            isNewDevice: !deviceInfo.trusted,
            isHighRiskAction: false,
            suspiciousActivity: false
        });
    }
    async verifyMFA(userId, token) {
        const mfaRecord = await this.getMFARecord(userId);
        if (!mfaRecord) {
            return false;
        }
        return this.mfaService.verifyTOTP(token, mfaRecord.secret);
    }
    async createSession(userId, deviceInfo, platform) {
        const sessionId = crypto.randomUUID();
        const session = {
            sessionId,
            userId,
            deviceId: deviceInfo.deviceId,
            platform: platform,
            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt: new Date(Date.now() + this.config.sessionTimeout),
            ipAddress: deviceInfo.location?.ip || '',
            userAgent: deviceInfo.browser || '',
            mfaVerified: false,
            riskScore: this.calculateRiskScore(deviceInfo),
            permissions: await this.getUserPermissions(userId)
        };
        await this.storeSession(session);
        return sessionId;
    }
    calculateRiskScore(deviceInfo) {
        let score = 0;
        if (!deviceInfo.trusted)
            score += 30;
        if (!deviceInfo.location)
            score += 20;
        if (deviceInfo.platform === 'mobile')
            score += 10;
        return Math.min(score, 100);
    }
    parseTimeString(timeString) {
        const unit = timeString.slice(-1);
        const value = parseInt(timeString.slice(0, -1));
        switch (unit) {
            case 'm': return value * 60 * 1000;
            case 'h': return value * 60 * 60 * 1000;
            case 'd': return value * 24 * 60 * 60 * 1000;
            default: return parseInt(timeString);
        }
    }
    async storeTokens(sessionId, tokens) {
        await this.redis.setex(`tokens:${sessionId}`, 3600, JSON.stringify(tokens));
    }
    async storeSession(session) {
        await this.redis.setex(`session:${session.userId}:${session.sessionId}`, this.config.sessionTimeout / 1000, JSON.stringify(session));
    }
    async getSession(sessionId) {
        const sessionData = await this.redis.get(`session:*:${sessionId}`);
        return sessionData ? JSON.parse(sessionData) : null;
    }
    async invalidateSession(sessionId) {
        const keys = await this.redis.keys(`session:*:${sessionId}`);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }
    async updateSessionActivity(sessionId) {
        const session = await this.getSession(sessionId);
        if (session) {
            session.lastActivity = new Date();
            await this.storeSession(session);
        }
    }
    generateSecureCookieToken(token) { return token; }
    async encryptForKeystore(token, deviceId) { return token; }
    async encryptForExtension(token) { return token; }
    async generateBiometricHash(deviceId) { return ''; }
    getExtensionPermissions() { return []; }
    async getUserById(id) { return {}; }
    async revokeAllUserSessions(userId) { }
    async updateCrossDeviceSync(userId) { }
    async storeBiometricData(data) { }
    async getBiometricData(userId, deviceId) { return null; }
    async updateBiometricLastUsed(userId, deviceId) { }
    async verifyBiometricSignature(data, publicKey) { return false; }
    async setupCrossDeviceSync(userId, sessionId) { }
    async getCrossDeviceSync(userId) { return null; }
    async getMFARecord(userId) { return null; }
    async trustDevice(userId, deviceInfo) { }
    async getUserPermissions(userId) { return []; }
    async requireAdditionalVerification(session) { return false; }
    async logAuthAttempt(email, deviceInfo, success, error) { }
}
exports.UnifiedAuthService = UnifiedAuthService;
const createUnifiedAuth = (redis, prisma, config) => {
    return new UnifiedAuthService(redis, prisma, config);
};
exports.createUnifiedAuth = createUnifiedAuth;
//# sourceMappingURL=unified-auth.js.map