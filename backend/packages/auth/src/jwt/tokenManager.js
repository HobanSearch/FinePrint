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
exports.JWTTokenManager = void 0;
const jwt = __importStar(require("jsonwebtoken"));
const crypto = __importStar(require("crypto"));
const logger_1 = require("@fineprintai/logger");
const keyManager_1 = require("./keyManager");
const logger = (0, logger_1.createServiceLogger)('jwt-token-manager');
class JWTTokenManager {
    keyManager;
    cache;
    config;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.keyManager = new keyManager_1.JWTKeyManager(cache, config.keyRotation);
    }
    async generateAccessToken(payload) {
        try {
            const keyPair = await this.keyManager.getCurrentKeyPair();
            const jti = crypto.randomUUID();
            const now = Math.floor(Date.now() / 1000);
            const fullPayload = {
                ...payload,
                iat: now,
                exp: now + this.config.accessTokenTTL,
                type: 'access',
                jti
            };
            const token = jwt.sign(fullPayload, keyPair.privateKey, {
                algorithm: this.config.algorithm,
                issuer: this.config.issuer,
                audience: this.config.audience
            });
            if (this.config.blacklistEnabled) {
                const tokenData = {
                    jti,
                    userId: payload.sub,
                    sessionId: payload.sessionId || crypto.randomUUID(),
                    refreshTokenId: payload.refreshTokenId || '',
                    scopes: payload.scopes || [],
                    createdAt: new Date(),
                    expiresAt: new Date((now + this.config.accessTokenTTL) * 1000)
                };
                await this.cache.set(`access-token:${jti}`, tokenData, this.config.accessTokenTTL);
            }
            logger.info('Access token generated', {
                userId: payload.sub,
                jti: jti.substring(0, 8) + '...'
            });
            return token;
        }
        catch (error) {
            logger.error('Failed to generate access token', { error, userId: payload.sub });
            throw new Error('Access token generation failed');
        }
    }
    async generateRefreshToken(userId, deviceFingerprint, ipAddress, userAgent) {
        try {
            const tokenId = crypto.randomUUID();
            const tokenSecret = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
            const now = Math.floor(Date.now() / 1000);
            const refreshPayload = {
                sub: userId,
                tokenId,
                iat: now,
                exp: now + this.config.refreshTokenTTL
            };
            const keyPair = await this.keyManager.getCurrentKeyPair();
            const token = jwt.sign(refreshPayload, keyPair.privateKey, {
                algorithm: this.config.algorithm,
                issuer: this.config.issuer,
                audience: this.config.audience
            });
            const refreshTokenData = {
                id: tokenId,
                userId,
                tokenHash,
                deviceFingerprint,
                ipAddress,
                userAgent,
                expiresAt: new Date((now + this.config.refreshTokenTTL) * 1000),
                createdAt: new Date(),
                lastUsedAt: new Date(),
                revoked: false
            };
            await this.cache.set(`refresh-token:${tokenId}`, refreshTokenData, this.config.refreshTokenTTL);
            await this.manageUserRefreshTokens(userId, tokenId);
            logger.info('Refresh token generated', {
                userId,
                tokenId: tokenId.substring(0, 8) + '...',
                deviceFingerprint: deviceFingerprint?.substring(0, 8) + '...'
            });
            return { token, tokenId };
        }
        catch (error) {
            logger.error('Failed to generate refresh token', { error, userId });
            throw new Error('Refresh token generation failed');
        }
    }
    async validateAccessToken(token) {
        try {
            let result = await this.validateTokenWithKey(token, 'current');
            if (!result.valid && result.error?.includes('invalid signature')) {
                result = await this.validateTokenWithKey(token, 'previous');
            }
            if (!result.valid) {
                return result;
            }
            const payload = result.payload;
            if (this.config.blacklistEnabled && payload.jti) {
                const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
                if (isBlacklisted) {
                    logger.warn('Attempted use of blacklisted token', {
                        jti: payload.jti.substring(0, 8) + '...',
                        userId: payload.sub
                    });
                    return { valid: false, error: 'Token blacklisted' };
                }
            }
            if (payload.type !== 'access') {
                return { valid: false, error: 'Invalid token type' };
            }
            logger.debug('Access token validated successfully', {
                userId: payload.sub,
                jti: payload.jti?.substring(0, 8) + '...'
            });
            return { valid: true, payload };
        }
        catch (error) {
            logger.error('Access token validation error', { error });
            return { valid: false, error: 'Token validation failed' };
        }
    }
    async validateRefreshToken(token) {
        try {
            let result = await this.validateTokenWithKey(token, 'current');
            if (!result.valid && result.error?.includes('invalid signature')) {
                result = await this.validateTokenWithKey(token, 'previous');
            }
            if (!result.valid) {
                return result;
            }
            const payload = result.payload;
            const tokenData = await this.cache.get(`refresh-token:${payload.tokenId}`);
            if (!tokenData) {
                return { valid: false, error: 'Refresh token not found' };
            }
            if (tokenData.revoked) {
                logger.warn('Attempted use of revoked refresh token', {
                    tokenId: payload.tokenId.substring(0, 8) + '...',
                    userId: payload.sub,
                    revokedReason: tokenData.revokedReason
                });
                return { valid: false, error: 'Refresh token revoked' };
            }
            tokenData.lastUsedAt = new Date();
            await this.cache.set(`refresh-token:${payload.tokenId}`, tokenData, this.config.refreshTokenTTL);
            logger.debug('Refresh token validated successfully', {
                userId: payload.sub,
                tokenId: payload.tokenId.substring(0, 8) + '...'
            });
            return { valid: true, payload };
        }
        catch (error) {
            logger.error('Refresh token validation error', { error });
            return { valid: false, error: 'Refresh token validation failed' };
        }
    }
    async rotateRefreshToken(oldToken, deviceFingerprint, ipAddress, userAgent) {
        try {
            const validation = await this.validateRefreshToken(oldToken);
            if (!validation.valid || !validation.payload) {
                logger.warn('Invalid refresh token provided for rotation');
                return null;
            }
            const oldPayload = validation.payload;
            await this.revokeRefreshToken(oldPayload.tokenId, 'token-rotation');
            const { token: newRefreshToken, tokenId } = await this.generateRefreshToken(oldPayload.sub, deviceFingerprint, ipAddress, userAgent);
            const newAccessToken = await this.generateAccessToken({
                sub: oldPayload.sub,
                email: '',
                role: '',
                subscriptionTier: '',
                refreshTokenId: tokenId
            });
            logger.info('Refresh token rotated successfully', {
                userId: oldPayload.sub,
                oldTokenId: oldPayload.tokenId.substring(0, 8) + '...',
                newTokenId: tokenId.substring(0, 8) + '...'
            });
            return {
                accessToken: newAccessToken,
                refreshToken: newRefreshToken,
                tokenId
            };
        }
        catch (error) {
            logger.error('Refresh token rotation failed', { error });
            return null;
        }
    }
    async revokeRefreshToken(tokenId, reason = 'manual-revocation') {
        try {
            const tokenData = await this.cache.get(`refresh-token:${tokenId}`);
            if (!tokenData) {
                logger.warn('Attempted to revoke non-existent refresh token', { tokenId });
                return false;
            }
            tokenData.revoked = true;
            tokenData.revokedAt = new Date();
            tokenData.revokedReason = reason;
            await this.cache.set(`refresh-token:${tokenId}`, tokenData, this.config.refreshTokenTTL);
            logger.info('Refresh token revoked', {
                tokenId: tokenId.substring(0, 8) + '...',
                userId: tokenData.userId,
                reason
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to revoke refresh token', { error, tokenId });
            return false;
        }
    }
    async revokeAllUserRefreshTokens(userId, reason = 'security-action') {
        try {
            const userTokensKey = `user-refresh-tokens:${userId}`;
            const tokenIds = await this.cache.smembers(userTokensKey);
            let revokedCount = 0;
            for (const tokenId of tokenIds) {
                const success = await this.revokeRefreshToken(tokenId, reason);
                if (success)
                    revokedCount++;
            }
            logger.info('Revoked all user refresh tokens', {
                userId,
                count: revokedCount,
                reason
            });
            return revokedCount;
        }
        catch (error) {
            logger.error('Failed to revoke all user refresh tokens', { error, userId });
            return 0;
        }
    }
    async blacklistAccessToken(jti, userId, reason) {
        if (!this.config.blacklistEnabled) {
            return false;
        }
        try {
            const tokenData = await this.cache.get(`access-token:${jti}`);
            if (!tokenData) {
                logger.warn('Attempted to blacklist non-existent access token', { jti });
                return false;
            }
            const blacklistEntry = {
                jti,
                userId,
                expiresAt: tokenData.expiresAt,
                reason,
                createdAt: new Date()
            };
            const ttl = Math.max(0, Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000));
            await this.cache.set(`blacklist:${jti}`, blacklistEntry, ttl);
            logger.info('Access token blacklisted', {
                jti: jti.substring(0, 8) + '...',
                userId,
                reason
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to blacklist access token', { error, jti });
            return false;
        }
    }
    async isTokenBlacklisted(jti) {
        if (!this.config.blacklistEnabled) {
            return false;
        }
        try {
            const entry = await this.cache.get(`blacklist:${jti}`);
            return entry !== null;
        }
        catch (error) {
            logger.error('Failed to check token blacklist', { error, jti });
            return false;
        }
    }
    async validateTokenWithKey(token, keyType) {
        try {
            const keyPair = keyType === 'current'
                ? await this.keyManager.getCurrentKeyPair()
                : await this.keyManager.getPreviousKeyPair();
            if (!keyPair) {
                return { valid: false, error: 'Signing key not available' };
            }
            const payload = jwt.verify(token, keyPair.publicKey, {
                algorithms: [this.config.algorithm],
                issuer: this.config.issuer,
                audience: this.config.audience
            });
            return { valid: true, payload };
        }
        catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                return { valid: false, error: 'Token expired', expired: true };
            }
            if (error instanceof jwt.JsonWebTokenError) {
                return { valid: false, error: error.message };
            }
            return { valid: false, error: 'Token validation failed' };
        }
    }
    async manageUserRefreshTokens(userId, newTokenId) {
        try {
            const userTokensKey = `user-refresh-tokens:${userId}`;
            await this.cache.sadd(userTokensKey, newTokenId);
            const tokenIds = await this.cache.smembers(userTokensKey);
            if (tokenIds.length > this.config.maxRefreshTokensPerUser) {
                const tokensToRevoke = tokenIds.slice(0, tokenIds.length - this.config.maxRefreshTokensPerUser);
                for (const tokenId of tokensToRevoke) {
                    await this.revokeRefreshToken(tokenId, 'token-limit-exceeded');
                    await this.cache.srem(userTokensKey, tokenId);
                }
                logger.info('Excess refresh tokens revoked', {
                    userId,
                    revokedCount: tokensToRevoke.length
                });
            }
            await this.cache.expire(userTokensKey, this.config.refreshTokenTTL);
        }
        catch (error) {
            logger.error('Failed to manage user refresh tokens', { error, userId });
        }
    }
    async getTokenStats() {
        try {
            const [accessCount, refreshCount, blacklistCount, rotationStatus] = await Promise.all([
                this.cache.keys('access-token:*').then(keys => keys.length),
                this.cache.keys('refresh-token:*').then(keys => keys.length),
                this.cache.keys('blacklist:*').then(keys => keys.length),
                this.keyManager.getRotationStatus()
            ]);
            return {
                activeAccessTokens: accessCount,
                activeRefreshTokens: refreshCount,
                blacklistedTokens: blacklistCount,
                rotationStatus
            };
        }
        catch (error) {
            logger.error('Failed to get token stats', { error });
            return {
                activeAccessTokens: 0,
                activeRefreshTokens: 0,
                blacklistedTokens: 0,
                rotationStatus: null
            };
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting token maintenance');
            const blacklistKeys = await this.cache.keys('blacklist:*');
            let cleanedCount = 0;
            for (const key of blacklistKeys) {
                const entry = await this.cache.get(key);
                if (entry && entry.expiresAt < new Date()) {
                    await this.cache.del(key);
                    cleanedCount++;
                }
            }
            logger.info('Token maintenance completed', {
                cleanedBlacklistEntries: cleanedCount
            });
        }
        catch (error) {
            logger.error('Token maintenance failed', { error });
        }
    }
    async cleanup() {
        await this.keyManager.cleanup();
        logger.info('JWT Token Manager cleanup completed');
    }
}
exports.JWTTokenManager = JWTTokenManager;
//# sourceMappingURL=tokenManager.js.map