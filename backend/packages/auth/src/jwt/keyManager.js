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
exports.JWTKeyManager = void 0;
const crypto = __importStar(require("crypto"));
const util_1 = require("util");
const logger_1 = require("@fineprintai/logger");
const generateKeyPair = (0, util_1.promisify)(crypto.generateKeyPair);
const logger = (0, logger_1.createServiceLogger)('jwt-key-manager');
class JWTKeyManager {
    cache;
    config;
    rotationTimer;
    constructor(cache, config) {
        this.cache = cache;
        this.config = config;
        if (config.autoRotate) {
            this.startAutoRotation();
        }
    }
    async generateKeyPair() {
        try {
            logger.info('Generating new RSA key pair');
            const { publicKey, privateKey } = await generateKeyPair('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
            });
            const keyPair = {
                publicKey: publicKey,
                privateKey: privateKey
            };
            logger.info('RSA key pair generated successfully');
            return keyPair;
        }
        catch (error) {
            logger.error('Failed to generate RSA key pair', { error });
            throw new Error('Key pair generation failed');
        }
    }
    async getCurrentKeyPair() {
        try {
            const cachedKeyPair = await this.cache.get('jwt:current-keypair');
            if (cachedKeyPair && await this.isKeyValid(cachedKeyPair)) {
                return cachedKeyPair;
            }
            const newKeyPair = await this.generateKeyPair();
            await this.storeKeyPair(newKeyPair, 'current');
            logger.info('New key pair generated and stored as current');
            return newKeyPair;
        }
        catch (error) {
            logger.error('Failed to get current key pair', { error });
            throw new Error('Cannot retrieve current key pair');
        }
    }
    async getPreviousKeyPair() {
        try {
            return await this.cache.get('jwt:previous-keypair');
        }
        catch (error) {
            logger.error('Failed to get previous key pair', { error });
            return null;
        }
    }
    async rotateKeys(reason = 'scheduled-rotation') {
        try {
            logger.info('Starting key rotation', { reason });
            const currentKeyPair = await this.cache.get('jwt:current-keypair');
            if (currentKeyPair) {
                await this.storeKeyPair(currentKeyPair, 'previous');
                logger.info('Current key pair moved to previous');
            }
            const newKeyPair = await this.generateKeyPair();
            await this.storeKeyPair(newKeyPair, 'current');
            await this.cache.set('jwt:last-rotation', {
                timestamp: new Date().toISOString(),
                reason
            }, this.config.maxKeyAge);
            logger.info('Key rotation completed successfully', { reason });
            await this.auditKeyRotation(reason);
        }
        catch (error) {
            logger.error('Key rotation failed', { error, reason });
            throw new Error('Key rotation failed');
        }
    }
    async storeKeyPair(keyPair, type) {
        const cacheKey = `jwt:${type}-keypair`;
        const ttl = type === 'current' ? this.config.maxKeyAge : this.config.keyOverlapPeriod;
        await this.cache.set(cacheKey, keyPair, ttl);
    }
    async isKeyValid(keyPair) {
        try {
            const lastRotation = await this.cache.get('jwt:last-rotation');
            if (!lastRotation)
                return true;
            const rotationTime = new Date(lastRotation.timestamp);
            const now = new Date();
            const keyAge = (now.getTime() - rotationTime.getTime()) / 1000;
            return keyAge < this.config.maxKeyAge;
        }
        catch (error) {
            logger.error('Failed to validate key age', { error });
            return false;
        }
    }
    startAutoRotation() {
        const intervalMs = this.config.rotationIntervalHours * 60 * 60 * 1000;
        this.rotationTimer = setInterval(async () => {
            try {
                await this.rotateKeys('auto-rotation');
            }
            catch (error) {
                logger.error('Auto rotation failed', { error });
            }
        }, intervalMs);
        logger.info('Auto key rotation started', {
            intervalHours: this.config.rotationIntervalHours
        });
    }
    stopAutoRotation() {
        if (this.rotationTimer) {
            clearInterval(this.rotationTimer);
            this.rotationTimer = undefined;
            logger.info('Auto key rotation stopped');
        }
    }
    async forceRotation(reason) {
        await this.rotateKeys(reason);
    }
    async getRotationStatus() {
        const lastRotation = await this.cache.get('jwt:last-rotation');
        const now = new Date();
        let keyAge = 0;
        let nextRotation;
        if (lastRotation) {
            const rotationTime = new Date(lastRotation.timestamp);
            keyAge = (now.getTime() - rotationTime.getTime()) / 1000;
            if (this.config.autoRotate) {
                nextRotation = new Date(rotationTime.getTime() + (this.config.rotationIntervalHours * 60 * 60 * 1000));
            }
        }
        return {
            lastRotation: lastRotation ? new Date(lastRotation.timestamp) : undefined,
            nextRotation,
            keyAge,
            autoRotationEnabled: this.config.autoRotate
        };
    }
    async auditKeyRotation(reason) {
        try {
            const auditEvent = {
                event: 'jwt_key_rotation',
                reason,
                timestamp: new Date().toISOString(),
                keyAge: await this.getRotationStatus().then(s => s.keyAge)
            };
            await this.cache.lpush('audit:jwt-key-rotations', auditEvent);
            await this.cache.getRawClient().ltrim('audit:jwt-key-rotations', 0, 99);
        }
        catch (error) {
            logger.error('Failed to audit key rotation', { error });
        }
    }
    async cleanup() {
        this.stopAutoRotation();
        logger.info('JWT Key Manager cleanup completed');
    }
}
exports.JWTKeyManager = JWTKeyManager;
//# sourceMappingURL=keyManager.js.map