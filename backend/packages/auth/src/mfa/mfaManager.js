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
exports.MFAManager = void 0;
const crypto = __importStar(require("crypto"));
const speakeasy = __importStar(require("speakeasy"));
const qrcode = __importStar(require("qrcode"));
const twilio_1 = require("twilio");
const nodemailer = __importStar(require("nodemailer"));
const logger_1 = require("@fineprintai/logger");
const logger = (0, logger_1.createServiceLogger)('mfa-manager');
class MFAManager {
    cache;
    config;
    twilioClient;
    emailTransporter;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        this.initializeProviders();
    }
    initializeProviders() {
        if (this.config.sms.enabled && this.config.sms.provider === 'twilio') {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;
            if (accountSid && authToken) {
                this.twilioClient = new twilio_1.Twilio(accountSid, authToken);
                logger.info('Twilio SMS provider initialized');
            }
            else {
                logger.warn('Twilio credentials not found, SMS MFA disabled');
            }
        }
        if (this.config.email.enabled) {
            this.emailTransporter = nodemailer.createTransporter({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
            logger.info('Email MFA provider initialized');
        }
    }
    async setupMFAMethod(userId, request) {
        try {
            const methodId = crypto.randomUUID();
            let method;
            let setupData = {};
            switch (request.type) {
                case 'totp':
                    method = await this.setupTOTP(userId, methodId);
                    setupData.secret = method.metadata.secret;
                    setupData.qrCode = method.metadata.qrCode;
                    break;
                case 'sms':
                    if (!request.phoneNumber) {
                        throw new Error('Phone number required for SMS MFA');
                    }
                    method = await this.setupSMS(userId, methodId, request.phoneNumber);
                    break;
                case 'email':
                    if (!request.email) {
                        throw new Error('Email address required for email MFA');
                    }
                    method = await this.setupEmail(userId, methodId, request.email);
                    break;
                default:
                    throw new Error('Unsupported MFA method type');
            }
            if (this.config.backup.enabled && request.type === 'totp') {
                setupData.backupCodes = await this.generateBackupCodes(userId);
            }
            await this.cache.set(`mfa-method:${methodId}`, method, 0);
            await this.cache.sadd(`user-mfa-methods:${userId}`, methodId);
            logger.info('MFA method setup initiated', {
                userId: userId.substring(0, 8) + '...',
                type: request.type,
                methodId: methodId.substring(0, 8) + '...'
            });
            return { method, setupData };
        }
        catch (error) {
            logger.error('MFA method setup failed', { error, userId, type: request.type });
            throw new Error(`MFA setup failed: ${error.message}`);
        }
    }
    async verifyMFASetup(userId, methodId, code) {
        try {
            const method = await this.cache.get(`mfa-method:${methodId}`);
            if (!method || method.userId !== userId) {
                return false;
            }
            let verified = false;
            switch (method.type) {
                case 'totp':
                    if (method.metadata.secret) {
                        verified = speakeasy.totp.verify({
                            secret: method.metadata.secret,
                            encoding: 'base32',
                            token: code,
                            window: this.config.totp.window
                        });
                    }
                    break;
                case 'sms':
                case 'email':
                    const storedCode = await this.cache.get(`mfa-setup-code:${methodId}`);
                    verified = storedCode === code;
                    break;
            }
            if (verified) {
                method.verified = true;
                method.enabled = true;
                await this.cache.set(`mfa-method:${methodId}`, method, 0);
                logger.info('MFA method verified and enabled', {
                    userId: userId.substring(0, 8) + '...',
                    methodId: methodId.substring(0, 8) + '...',
                    type: method.type
                });
            }
            return verified;
        }
        catch (error) {
            logger.error('MFA setup verification failed', { error, userId, methodId });
            return false;
        }
    }
    async createMFAChallenge(userId, sessionId, methodId, ipAddress, userAgent) {
        try {
            const lockout = await this.cache.get(`mfa-lockout:${userId}`);
            if (lockout && new Date(lockout.until) > new Date()) {
                logger.warn('MFA challenge blocked due to lockout', {
                    userId: userId.substring(0, 8) + '...',
                    lockoutUntil: lockout.until
                });
                return null;
            }
            const methods = await this.getUserMFAMethods(userId);
            const enabledMethods = methods.filter(m => m.enabled && m.verified);
            if (enabledMethods.length === 0) {
                logger.warn('No enabled MFA methods for user', {
                    userId: userId.substring(0, 8) + '...'
                });
                return null;
            }
            let selectedMethod;
            if (methodId) {
                selectedMethod = enabledMethods.find(m => m.id === methodId) || enabledMethods[0];
            }
            else {
                selectedMethod = enabledMethods[0];
            }
            const challengeId = crypto.randomUUID();
            const challenge = {
                id: challengeId,
                userId,
                sessionId,
                type: selectedMethod.type,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (selectedMethod.type === 'totp' ? 300000 : this.getCodeExpiry(selectedMethod.type) * 1000)),
                verified: false,
                attempts: 0,
                maxAttempts: this.config.enforcement.maxFailedAttempts,
                ipAddress,
                userAgent
            };
            if (selectedMethod.type === 'sms' || selectedMethod.type === 'email') {
                const code = this.generateMFACode(this.getCodeLength(selectedMethod.type));
                challenge.code = code;
                if (selectedMethod.type === 'sms') {
                    await this.sendSMSCode(selectedMethod.metadata.phoneNumber, code);
                }
                else {
                    await this.sendEmailCode(selectedMethod.metadata.email, code);
                }
            }
            await this.cache.set(`mfa-challenge:${challengeId}`, challenge, Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000));
            logger.info('MFA challenge created', {
                userId: userId.substring(0, 8) + '...',
                challengeId: challengeId.substring(0, 8) + '...',
                type: selectedMethod.type
            });
            return challenge;
        }
        catch (error) {
            logger.error('Failed to create MFA challenge', { error, userId });
            return null;
        }
    }
    async verifyMFAChallenge(challengeId, code, ipAddress, userAgent) {
        try {
            const challenge = await this.cache.get(`mfa-challenge:${challengeId}`);
            if (!challenge) {
                return { success: false, error: 'Invalid challenge' };
            }
            if (challenge.verified) {
                return { success: false, error: 'Challenge already verified' };
            }
            if (challenge.expiresAt < new Date()) {
                return { success: false, error: 'Challenge expired' };
            }
            if (challenge.attempts >= challenge.maxAttempts) {
                await this.lockoutUser(challenge.userId, 'max-attempts-exceeded');
                return {
                    success: false,
                    error: 'Too many failed attempts',
                    lockoutUntil: new Date(Date.now() + (this.config.enforcement.lockoutDuration * 1000))
                };
            }
            challenge.attempts++;
            await this.cache.set(`mfa-challenge:${challengeId}`, challenge, Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000));
            let verified = false;
            let method;
            const methods = await this.getUserMFAMethods(challenge.userId);
            method = methods.find(m => m.type === challenge.type && m.enabled && m.verified);
            if (!method) {
                return { success: false, error: 'MFA method not found' };
            }
            switch (challenge.type) {
                case 'totp':
                    if (method.metadata.secret) {
                        verified = speakeasy.totp.verify({
                            secret: method.metadata.secret,
                            encoding: 'base32',
                            token: code,
                            window: this.config.totp.window
                        });
                    }
                    break;
                case 'sms':
                case 'email':
                    verified = challenge.code === code;
                    break;
                case 'backup':
                    verified = await this.verifyBackupCode(challenge.userId, code);
                    break;
            }
            if (verified) {
                challenge.verified = true;
                method.lastUsedAt = new Date();
                await Promise.all([
                    this.cache.set(`mfa-challenge:${challengeId}`, challenge, 300),
                    this.cache.set(`mfa-method:${method.id}`, method, 0)
                ]);
                logger.info('MFA challenge verified successfully', {
                    userId: challenge.userId.substring(0, 8) + '...',
                    challengeId: challengeId.substring(0, 8) + '...',
                    type: challenge.type
                });
                return {
                    success: true,
                    challengeId,
                    method
                };
            }
            else {
                logger.warn('MFA challenge verification failed', {
                    userId: challenge.userId.substring(0, 8) + '...',
                    challengeId: challengeId.substring(0, 8) + '...',
                    attempts: challenge.attempts,
                    remainingAttempts: challenge.maxAttempts - challenge.attempts
                });
                return {
                    success: false,
                    error: 'Invalid code',
                    remainingAttempts: challenge.maxAttempts - challenge.attempts
                };
            }
        }
        catch (error) {
            logger.error('MFA challenge verification failed', { error, challengeId });
            return { success: false, error: 'Verification failed' };
        }
    }
    async getUserMFAMethods(userId) {
        try {
            const methodIds = await this.cache.smembers(`user-mfa-methods:${userId}`);
            const methods = [];
            for (const methodId of methodIds) {
                const method = await this.cache.get(`mfa-method:${methodId}`);
                if (method) {
                    const sanitizedMethod = { ...method };
                    if (sanitizedMethod.metadata.secret) {
                        delete sanitizedMethod.metadata.secret;
                    }
                    if (sanitizedMethod.metadata.codes) {
                        delete sanitizedMethod.metadata.codes;
                    }
                    methods.push(sanitizedMethod);
                }
            }
            return methods.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        catch (error) {
            logger.error('Failed to get user MFA methods', { error, userId });
            return [];
        }
    }
    async disableMFAMethod(userId, methodId) {
        try {
            const method = await this.cache.get(`mfa-method:${methodId}`);
            if (!method || method.userId !== userId) {
                return false;
            }
            method.enabled = false;
            await this.cache.set(`mfa-method:${methodId}`, method, 0);
            logger.info('MFA method disabled', {
                userId: userId.substring(0, 8) + '...',
                methodId: methodId.substring(0, 8) + '...',
                type: method.type
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to disable MFA method', { error, userId, methodId });
            return false;
        }
    }
    async removeMFAMethod(userId, methodId) {
        try {
            const method = await this.cache.get(`mfa-method:${methodId}`);
            if (!method || method.userId !== userId) {
                return false;
            }
            await this.cache.del(`mfa-method:${methodId}`);
            await this.cache.srem(`user-mfa-methods:${userId}`, methodId);
            logger.info('MFA method removed', {
                userId: userId.substring(0, 8) + '...',
                methodId: methodId.substring(0, 8) + '...',
                type: method.type
            });
            return true;
        }
        catch (error) {
            logger.error('Failed to remove MFA method', { error, userId, methodId });
            return false;
        }
    }
    async isMFARequired(userId, context) {
        try {
            const methods = await this.getUserMFAMethods(userId);
            const hasEnabledMFA = methods.some(m => m.enabled && m.verified);
            if (!hasEnabledMFA) {
                return false;
            }
            switch (context) {
                case 'new-device':
                    return this.config.enforcement.requireForNewDevices;
                case 'sensitive-operation':
                    return this.config.enforcement.requireForSensitiveOperations;
                case 'login':
                default:
                    return true;
            }
        }
        catch (error) {
            logger.error('Failed to check MFA requirement', { error, userId, context });
            return false;
        }
    }
    async setupTOTP(userId, methodId) {
        const secret = speakeasy.generateSecret({
            name: `FinePrint AI (${userId.substring(0, 8)})`,
            issuer: this.config.totp.issuer,
            length: 32
        });
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        return {
            id: methodId,
            userId,
            type: 'totp',
            enabled: false,
            verified: false,
            createdAt: new Date(),
            metadata: {
                secret: secret.base32,
                qrCode: qrCodeUrl
            }
        };
    }
    async setupSMS(userId, methodId, phoneNumber) {
        const cleanPhone = phoneNumber.replace(/\D/g, '');
        const countryCode = cleanPhone.startsWith('1') ? '+1' : '+1';
        const code = this.generateMFACode(this.config.sms.codeLength);
        await this.cache.set(`mfa-setup-code:${methodId}`, code, this.config.sms.codeExpiry);
        if (this.twilioClient) {
            await this.sendSMSCode(phoneNumber, code);
        }
        return {
            id: methodId,
            userId,
            type: 'sms',
            enabled: false,
            verified: false,
            createdAt: new Date(),
            metadata: {
                phoneNumber,
                countryCode
            }
        };
    }
    async setupEmail(userId, methodId, email) {
        const code = this.generateMFACode(this.config.email.codeLength);
        await this.cache.set(`mfa-setup-code:${methodId}`, code, this.config.email.codeExpiry);
        await this.sendEmailCode(email, code);
        return {
            id: methodId,
            userId,
            type: 'email',
            enabled: false,
            verified: false,
            createdAt: new Date(),
            metadata: {
                email
            }
        };
    }
    async generateBackupCodes(userId) {
        const codes = [];
        const codeStrings = [];
        for (let i = 0; i < this.config.backup.codeCount; i++) {
            const code = this.generateMFACode(this.config.backup.codeLength);
            codes.push({
                code,
                used: false
            });
            codeStrings.push(code);
        }
        await this.cache.set(`backup-codes:${userId}`, codes, 0);
        return codeStrings;
    }
    async verifyBackupCode(userId, code) {
        try {
            const backupCodes = await this.cache.get(`backup-codes:${userId}`);
            if (!backupCodes) {
                return false;
            }
            const matchingCode = backupCodes.find(bc => bc.code === code && !bc.used);
            if (matchingCode) {
                matchingCode.used = true;
                matchingCode.usedAt = new Date();
                await this.cache.set(`backup-codes:${userId}`, backupCodes, 0);
                logger.info('Backup code used', {
                    userId: userId.substring(0, 8) + '...'
                });
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error('Failed to verify backup code', { error, userId });
            return false;
        }
    }
    async sendSMSCode(phoneNumber, code) {
        if (!this.twilioClient) {
            throw new Error('SMS provider not configured');
        }
        try {
            await this.twilioClient.messages.create({
                body: `Your FinePrint AI verification code is: ${code}`,
                from: this.config.sms.from,
                to: phoneNumber
            });
            logger.info('SMS verification code sent', {
                phoneNumber: phoneNumber.substring(0, 5) + '***'
            });
        }
        catch (error) {
            logger.error('Failed to send SMS code', { error, phoneNumber });
            throw new Error('SMS delivery failed');
        }
    }
    async sendEmailCode(email, code) {
        if (!this.emailTransporter) {
            throw new Error('Email provider not configured');
        }
        try {
            await this.emailTransporter.sendMail({
                from: this.config.email.from,
                to: email,
                subject: 'FinePrint AI - Verification Code',
                html: `
          <h2>FinePrint AI Verification</h2>
          <p>Your verification code is: <strong>${code}</strong></p>
          <p>This code will expire in ${Math.floor(this.config.email.codeExpiry / 60)} minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        `
            });
            logger.info('Email verification code sent', {
                email: email.substring(0, 3) + '***'
            });
        }
        catch (error) {
            logger.error('Failed to send email code', { error, email });
            throw new Error('Email delivery failed');
        }
    }
    generateMFACode(length) {
        const digits = '0123456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += digits[crypto.randomInt(0, digits.length)];
        }
        return code;
    }
    getCodeLength(type) {
        switch (type) {
            case 'sms':
                return this.config.sms.codeLength;
            case 'email':
                return this.config.email.codeLength;
            case 'backup':
                return this.config.backup.codeLength;
            default:
                return 6;
        }
    }
    getCodeExpiry(type) {
        switch (type) {
            case 'sms':
                return this.config.sms.codeExpiry;
            case 'email':
                return this.config.email.codeExpiry;
            default:
                return 300;
        }
    }
    async lockoutUser(userId, reason) {
        try {
            const lockoutUntil = new Date(Date.now() + (this.config.enforcement.lockoutDuration * 1000));
            await this.cache.set(`mfa-lockout:${userId}`, { until: lockoutUntil, reason }, this.config.enforcement.lockoutDuration);
            logger.warn('User locked out from MFA', {
                userId: userId.substring(0, 8) + '...',
                reason,
                until: lockoutUntil
            });
        }
        catch (error) {
            logger.error('Failed to lockout user', { error, userId });
        }
    }
    async getMFAStats() {
        try {
            const userMethodKeys = await this.cache.keys('user-mfa-methods:*');
            const methodKeys = await this.cache.keys('mfa-method:*');
            let totalUsers = userMethodKeys.length;
            let enabledUsers = 0;
            const methodDistribution = {};
            for (const key of methodKeys) {
                const method = await this.cache.get(key);
                if (method && method.enabled && method.verified) {
                    methodDistribution[method.type] = (methodDistribution[method.type] || 0) + 1;
                    const userHasMFA = await this.cache.sismember(`user-mfa-methods:${method.userId}`, method.id);
                    if (userHasMFA) {
                        enabledUsers++;
                    }
                }
            }
            const recentChallenges = await this.cache.lrange('audit:mfa-challenges', 0, 999);
            const verificationAttempts = recentChallenges.length;
            const successfulVerifications = recentChallenges.filter(c => c.success).length;
            const failedVerifications = verificationAttempts - successfulVerifications;
            const lockoutKeys = await this.cache.keys('mfa-lockout:*');
            const lockedOutUsers = lockoutKeys.length;
            return {
                totalUsers,
                enabledUsers,
                methodDistribution,
                verificationAttempts,
                successfulVerifications,
                failedVerifications,
                lockedOutUsers
            };
        }
        catch (error) {
            logger.error('Failed to get MFA stats', { error });
            return {
                totalUsers: 0,
                enabledUsers: 0,
                methodDistribution: {},
                verificationAttempts: 0,
                successfulVerifications: 0,
                failedVerifications: 0,
                lockedOutUsers: 0
            };
        }
    }
    async performMaintenance() {
        try {
            logger.info('Starting MFA maintenance');
            const challengeKeys = await this.cache.keys('mfa-challenge:*');
            let cleanedChallenges = 0;
            for (const key of challengeKeys) {
                const challenge = await this.cache.get(key);
                if (challenge && challenge.expiresAt < new Date()) {
                    await this.cache.del(key);
                    cleanedChallenges++;
                }
            }
            const setupCodeKeys = await this.cache.keys('mfa-setup-code:*');
            let cleanedSetupCodes = 0;
            for (const key of setupCodeKeys) {
                const ttl = await this.cache.ttl(key);
                if (ttl === -1 || ttl === 0) {
                    await this.cache.del(key);
                    cleanedSetupCodes++;
                }
            }
            logger.info('MFA maintenance completed', {
                cleanedChallenges,
                cleanedSetupCodes
            });
        }
        catch (error) {
            logger.error('MFA maintenance failed', { error });
        }
    }
}
exports.MFAManager = MFAManager;
//# sourceMappingURL=mfaManager.js.map