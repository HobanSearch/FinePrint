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
exports.PasswordManager = void 0;
const bcrypt = __importStar(require("bcryptjs"));
const crypto = __importStar(require("crypto"));
const zxcvbn = __importStar(require("zxcvbn"));
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('password-manager');
const COMMON_PASSWORDS = new Set([
    'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
    'admin', 'letmein', 'welcome', 'monkey', 'password1', 'dragon',
    'master', 'hello', 'freedom', 'whatever', 'qazwsx', 'trustno1'
]);
class PasswordManager {
    cache;
    config;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
    }
    async hashPassword(password) {
        try {
            const salt = await bcrypt.genSalt(this.config.saltRounds);
            const hash = await bcrypt.hash(password, salt);
            const result = {
                hash,
                salt,
                algorithm: 'bcrypt',
                rounds: this.config.saltRounds,
                createdAt: new Date()
            };
            logger.debug('Password hashed successfully', {
                rounds: this.config.saltRounds
            });
            return result;
        }
        catch (error) {
            logger.error('Password hashing failed', { error });
            throw new Error('Password hashing failed');
        }
    }
    async verifyPassword(password, hash) {
        try {
            const isValid = await bcrypt.compare(password, hash);
            logger.debug('Password verification completed', {
                valid: isValid
            });
            return isValid;
        }
        catch (error) {
            logger.error('Password verification failed', { error });
            return false;
        }
    }
    async validatePassword(password, userInfo) {
        const result = {
            valid: true,
            score: 0,
            feedback: [],
            warnings: [],
            errors: []
        };
        try {
            if (password.length < this.config.minLength) {
                result.valid = false;
                result.errors.push(`Password must be at least ${this.config.minLength} characters long`);
            }
            if (password.length > this.config.maxLength) {
                result.valid = false;
                result.errors.push(`Password must not exceed ${this.config.maxLength} characters`);
            }
            if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
                result.valid = false;
                result.errors.push('Password must contain at least one uppercase letter');
            }
            if (this.config.requireLowercase && !/[a-z]/.test(password)) {
                result.valid = false;
                result.errors.push('Password must contain at least one lowercase letter');
            }
            if (this.config.requireNumbers && !/\d/.test(password)) {
                result.valid = false;
                result.errors.push('Password must contain at least one number');
            }
            if (this.config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
                result.valid = false;
                result.errors.push('Password must contain at least one special character');
            }
            if (this.config.preventCommonPasswords && COMMON_PASSWORDS.has(password.toLowerCase())) {
                result.valid = false;
                result.errors.push('Password is too common, please choose a different one');
            }
            if (this.config.preventUserInfoInPassword && userInfo) {
                const lowerPassword = password.toLowerCase();
                if (userInfo.email && lowerPassword.includes(userInfo.email.split('@')[0].toLowerCase())) {
                    result.valid = false;
                    result.errors.push('Password cannot contain your email address');
                }
                if (userInfo.name && lowerPassword.includes(userInfo.name.toLowerCase())) {
                    result.valid = false;
                    result.errors.push('Password cannot contain your name');
                }
                if (userInfo.username && lowerPassword.includes(userInfo.username.toLowerCase())) {
                    result.valid = false;
                    result.errors.push('Password cannot contain your username');
                }
            }
            const userInputs = userInfo ? [
                userInfo.email?.split('@')[0] || '',
                userInfo.name || '',
                userInfo.username || ''
            ].filter(Boolean) : [];
            const strengthResult = zxcvbn(password, userInputs);
            result.score = strengthResult.score;
            if (strengthResult.feedback.warning) {
                result.warnings.push(strengthResult.feedback.warning);
            }
            result.feedback.push(...strengthResult.feedback.suggestions);
            if (strengthResult.score < 2) {
                result.valid = false;
                result.errors.push('Password is too weak, please choose a stronger password');
            }
            else if (strengthResult.score < 3) {
                result.warnings.push('Consider using a stronger password');
            }
            logger.debug('Password validation completed', {
                valid: result.valid,
                score: result.score,
                errorsCount: result.errors.length,
                warningsCount: result.warnings.length
            });
            return result;
        }
        catch (error) {
            logger.error('Password validation failed', { error });
            return {
                valid: false,
                score: 0,
                feedback: [],
                warnings: [],
                errors: ['Password validation failed']
            };
        }
    }
    async storePasswordHistory(userId, passwordHash) {
        try {
            const historyKey = `password-history:${userId}`;
            const historyEntry = {
                hash: passwordHash.hash,
                createdAt: passwordHash.createdAt,
                algorithm: passwordHash.algorithm,
                rounds: passwordHash.rounds
            };
            await this.cache.lpush(historyKey, historyEntry);
            const historyList = await this.cache.lrange(historyKey, 0, -1);
            if (historyList.length > this.config.passwordHistoryCount) {
                await this.cache.getRawClient().ltrim(`fpa:${historyKey}`, 0, this.config.passwordHistoryCount - 1);
            }
            const maxAgeSeconds = this.config.maxPasswordAge * 24 * 60 * 60;
            await this.cache.expire(historyKey, maxAgeSeconds);
            logger.debug('Password stored in history', {
                userId: userId.substring(0, 8) + '...',
                historyCount: Math.min(historyList.length + 1, this.config.passwordHistoryCount)
            });
        }
        catch (error) {
            logger.error('Failed to store password history', { error, userId });
        }
    }
    async checkPasswordHistory(userId, password) {
        try {
            const historyKey = `password-history:${userId}`;
            const history = await this.cache.lrange(historyKey, 0, this.config.passwordHistoryCount - 1);
            for (const entry of history) {
                const historyEntry = entry;
                const isMatch = await bcrypt.compare(password, historyEntry.hash);
                if (isMatch) {
                    logger.info('Password reuse detected', {
                        userId: userId.substring(0, 8) + '...',
                        originalDate: historyEntry.createdAt
                    });
                    return true;
                }
            }
            return false;
        }
        catch (error) {
            logger.error('Failed to check password history', { error, userId });
            return false;
        }
    }
    async generatePasswordResetToken(userId, ipAddress, userAgent) {
        try {
            const token = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const resetToken = {
                userId,
                token: tokenHash,
                expiresAt: new Date(Date.now() + 30 * 60 * 1000),
                createdAt: new Date(),
                used: false,
                ipAddress,
                userAgent
            };
            await this.cache.set(`password-reset:${tokenHash}`, resetToken, 30 * 60);
            await this.cache.set(`password-reset-user:${userId}`, { tokenHash, createdAt: resetToken.createdAt }, 30 * 60);
            logger.info('Password reset token generated', {
                userId: userId.substring(0, 8) + '...',
                ipAddress
            });
            return token;
        }
        catch (error) {
            logger.error('Failed to generate password reset token', { error, userId });
            throw new Error('Password reset token generation failed');
        }
    }
    async validatePasswordResetToken(token) {
        try {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const resetToken = await this.cache.get(`password-reset:${tokenHash}`);
            if (!resetToken) {
                logger.warn('Invalid password reset token attempted', {
                    tokenHash: tokenHash.substring(0, 8) + '...'
                });
                return { valid: false };
            }
            if (resetToken.used) {
                logger.warn('Used password reset token attempted', {
                    userId: resetToken.userId.substring(0, 8) + '...',
                    tokenHash: tokenHash.substring(0, 8) + '...'
                });
                return { valid: false };
            }
            if (resetToken.expiresAt < new Date()) {
                logger.warn('Expired password reset token attempted', {
                    userId: resetToken.userId.substring(0, 8) + '...',
                    tokenHash: tokenHash.substring(0, 8) + '...'
                });
                return { valid: false };
            }
            resetToken.used = true;
            await this.cache.set(`password-reset:${tokenHash}`, resetToken, 30 * 60);
            logger.info('Password reset token validated and consumed', {
                userId: resetToken.userId.substring(0, 8) + '...'
            });
            return { valid: true, userId: resetToken.userId };
        }
        catch (error) {
            logger.error('Password reset token validation failed', { error });
            return { valid: false };
        }
    }
    async revokeUserPasswordResetTokens(userId) {
        try {
            const userTokenData = await this.cache.get(`password-reset-user:${userId}`);
            if (userTokenData) {
                await this.cache.del(`password-reset:${userTokenData.tokenHash}`);
                await this.cache.del(`password-reset-user:${userId}`);
                logger.info('Password reset tokens revoked for user', {
                    userId: userId.substring(0, 8) + '...'
                });
            }
        }
        catch (error) {
            logger.error('Failed to revoke password reset tokens', { error, userId });
        }
    }
    async logPasswordChange(userId, reason, success, ipAddress, userAgent, failureReason) {
        try {
            const event = {
                userId,
                timestamp: new Date(),
                ipAddress,
                userAgent,
                reason,
                success,
                failureReason
            };
            await this.cache.lpush('audit:password-changes', event);
            await this.cache.getRawClient().ltrim('fpa:audit:password-changes', 0, 999);
            await this.cache.lpush(`audit:password-changes:${userId}`, event);
            await this.cache.getRawClient().ltrim(`fpa:audit:password-changes:${userId}`, 0, 49);
            logger.info('Password change event logged', {
                userId: userId.substring(0, 8) + '...',
                reason,
                success
            });
        }
        catch (error) {
            logger.error('Failed to log password change event', { error, userId });
        }
    }
    async isPasswordExpired(userId, lastPasswordChange) {
        try {
            const maxAgeMs = this.config.maxPasswordAge * 24 * 60 * 60 * 1000;
            const passwordAge = Date.now() - lastPasswordChange.getTime();
            const expired = passwordAge > maxAgeMs;
            if (expired) {
                logger.info('Password expired detected', {
                    userId: userId.substring(0, 8) + '...',
                    ageInDays: Math.floor(passwordAge / (24 * 60 * 60 * 1000))
                });
            }
            return expired;
        }
        catch (error) {
            logger.error('Failed to check password expiration', { error, userId });
            return false;
        }
    }
    generateSecurePassword(length = 16) {
        const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const lowercase = 'abcdefghijklmnopqrstuvwxyz';
        const numbers = '0123456789';
        const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        let password = '';
        let chars = '';
        if (this.config.requireUppercase) {
            password += uppercase[crypto.randomInt(0, uppercase.length)];
            chars += uppercase;
        }
        if (this.config.requireLowercase) {
            password += lowercase[crypto.randomInt(0, lowercase.length)];
            chars += lowercase;
        }
        if (this.config.requireNumbers) {
            password += numbers[crypto.randomInt(0, numbers.length)];
            chars += numbers;
        }
        if (this.config.requireSpecialChars) {
            password += symbols[crypto.randomInt(0, symbols.length)];
            chars += symbols;
        }
        for (let i = password.length; i < length; i++) {
            password += chars[crypto.randomInt(0, chars.length)];
        }
        return password.split('').sort(() => 0.5 - Math.random()).join('');
    }
    async getPasswordStats() {
        try {
            const [totalChanges, resetTokens] = await Promise.all([
                this.cache.lrange('audit:password-changes', 0, -1).then(events => events.length),
                this.cache.keys('password-reset:*').then(keys => keys.length)
            ]);
            const recentEvents = await this.cache.lrange('audit:password-changes', 0, 99);
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentChanges = recentEvents.filter(event => {
                const changeEvent = event;
                return new Date(changeEvent.timestamp) > oneDayAgo;
            }).length;
            return {
                totalPasswordChanges: totalChanges,
                recentPasswordChanges: recentChanges,
                activeResetTokens: resetTokens,
                expiredPasswords: 0
            };
        }
        catch (error) {
            logger.error('Failed to get password stats', { error });
            return {
                totalPasswordChanges: 0,
                recentPasswordChanges: 0,
                activeResetTokens: 0,
                expiredPasswords: 0
            };
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting password maintenance');
            const resetTokenKeys = await this.cache.keys('password-reset:*');
            let cleanedTokens = 0;
            for (const key of resetTokenKeys) {
                const token = await this.cache.get(key);
                if (token && token.expiresAt < new Date()) {
                    await this.cache.del(key);
                    cleanedTokens++;
                }
            }
            logger.info('Password maintenance completed', {
                cleanedTokens
            });
        }
        catch (error) {
            logger.error('Password maintenance failed', { error });
        }
    }
}
exports.PasswordManager = PasswordManager;
//# sourceMappingURL=passwordManager.js.map