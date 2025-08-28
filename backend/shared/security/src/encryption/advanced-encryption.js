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
exports.createAdvancedEncryption = exports.AdvancedEncryptionService = void 0;
const crypto = __importStar(require("crypto"));
const util_1 = require("util");
const scrypt = (0, util_1.promisify)(crypto.scrypt);
class AdvancedEncryptionService {
    config;
    keyCache;
    rotationPolicy;
    metrics;
    constructor(config, rotationPolicy) {
        this.config = config;
        this.keyCache = new Map();
        this.rotationPolicy = rotationPolicy;
        this.metrics = {
            encryptionOperations: 0,
            decryptionOperations: 0,
            keyRotations: 0,
            failedOperations: 0,
            averageEncryptionTime: 0,
            averageDecryptionTime: 0
        };
        if (rotationPolicy.autoRotate) {
            this.startKeyRotationScheduler();
        }
    }
    async encryptData(data, context) {
        const startTime = Date.now();
        try {
            const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
            const salt = crypto.randomBytes(this.config.saltLength);
            const iv = crypto.randomBytes(this.config.ivLength);
            const key = await this.deriveKey(salt, context);
            const cipher = crypto.createCipher(this.config.algorithm, key);
            cipher.setAAD(Buffer.from(JSON.stringify({
                platform: context.platform,
                sensitivity: context.sensitivity,
                timestamp: Date.now()
            })));
            let encrypted = cipher.update(dataBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const tag = cipher.getAuthTag();
            const keyId = this.generateKeyId(context);
            this.keyCache.set(keyId, key);
            const result = {
                data: encrypted.toString('base64'),
                algorithm: this.config.algorithm,
                iv: iv.toString('base64'),
                tag: tag.toString('base64'),
                salt: salt.toString('base64'),
                keyId,
                createdAt: new Date(),
                expiresAt: context.expiresIn ? new Date(Date.now() + context.expiresIn) : undefined
            };
            this.metrics.encryptionOperations++;
            this.updateAverageTime('encryption', Date.now() - startTime);
            return result;
        }
        catch (error) {
            this.metrics.failedOperations++;
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }
    async decryptData(encryptedData, context) {
        const startTime = Date.now();
        try {
            if (encryptedData.expiresAt && encryptedData.expiresAt > new Date()) {
                throw new Error('Encrypted data has expired');
            }
            let key = this.keyCache.get(encryptedData.keyId);
            if (!key) {
                const salt = Buffer.from(encryptedData.salt, 'base64');
                key = await this.deriveKey(salt, context);
                this.keyCache.set(encryptedData.keyId, key);
            }
            const iv = Buffer.from(encryptedData.iv, 'base64');
            const tag = Buffer.from(encryptedData.tag, 'base64');
            const data = Buffer.from(encryptedData.data, 'base64');
            const decipher = crypto.createDecipher(encryptedData.algorithm, key);
            decipher.setAAD(Buffer.from(JSON.stringify({
                platform: context.platform,
                timestamp: encryptedData.createdAt.getTime()
            })));
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(data);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            this.metrics.decryptionOperations++;
            this.updateAverageTime('decryption', Date.now() - startTime);
            return decrypted;
        }
        catch (error) {
            this.metrics.failedOperations++;
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }
    async encryptForPlatform(data, platform, options = {}) {
        switch (platform) {
            case 'web':
                return this.encryptForWeb(data, options);
            case 'mobile':
                return this.encryptForMobile(data, options);
            case 'extension':
                return this.encryptForExtension(data, options);
            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }
    }
    async encryptForWeb(data, options) {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encodedData = new TextEncoder().encode(data);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedData);
        return {
            encryptedData: Buffer.from(encrypted).toString('base64'),
            storageHint: {
                method: 'webCrypto',
                storage: options.useHardwareAcceleration ? 'indexedDB' : 'localStorage',
                iv: Buffer.from(iv).toString('base64')
            }
        };
    }
    async encryptForMobile(data, options) {
        const salt = crypto.randomBytes(32);
        const key = await scrypt(this.config.masterKey, salt, 32);
        const cipher = crypto.createCipher('aes-256-gcm', key);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        return {
            encryptedData: encrypted,
            storageHint: {
                method: 'keystore',
                biometricProtected: options.useBiometricProtection,
                secureEnclave: options.storeInSecureEnclave,
                salt: salt.toString('base64'),
                tag: tag.toString('hex')
            }
        };
    }
    async encryptForExtension(data, options) {
        const contextKey = crypto.createHash('sha256')
            .update(`${this.config.masterKey}:extension:${Date.now()}`)
            .digest();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', contextKey);
        cipher.setInitVector(iv);
        let encrypted = cipher.update(data, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return {
            encryptedData: encrypted,
            storageHint: {
                method: 'contextIsolated',
                manifestPermissions: ['storage', 'unlimitedStorage'],
                iv: iv.toString('hex')
            }
        };
    }
    async encryptDocument(documentData, metadata) {
        try {
            const documentKey = await this.generateDocumentKey(metadata);
            const encryptedDocument = await this.encryptData(documentData, {
                userId: metadata.userId,
                platform: 'web',
                sensitivity: this.mapClassificationToSensitivity(metadata.classification)
            });
            const metadataBuffer = Buffer.from(JSON.stringify(metadata));
            const encryptedMetadata = await this.encryptData(metadataBuffer, {
                userId: metadata.userId,
                platform: 'web',
                sensitivity: 'medium'
            });
            return {
                encryptedDocument,
                encryptedMetadata,
                keyId: documentKey.keyId
            };
        }
        catch (error) {
            throw new Error(`Document encryption failed: ${error.message}`);
        }
    }
    async encryptPII(piiData, userId, options) {
        try {
            let processedData = { ...piiData };
            let anonymized;
            let pseudonyms;
            if (options.anonymize) {
                anonymized = this.anonymizePII(processedData);
                processedData = anonymized;
            }
            if (options.pseudonymize) {
                const pseudonymResult = this.pseudonymizePII(processedData, userId);
                processedData = pseudonymResult.data;
                pseudonyms = pseudonymResult.pseudonyms;
            }
            const encrypted = await this.encryptData(JSON.stringify(processedData), {
                userId,
                platform: 'web',
                sensitivity: 'critical',
                expiresIn: options.retention * 24 * 60 * 60 * 1000
            });
            return {
                encrypted,
                anonymized,
                pseudonyms
            };
        }
        catch (error) {
            throw new Error(`PII encryption failed: ${error.message}`);
        }
    }
    async rotateKeys() {
        try {
            const startTime = Date.now();
            let rotatedKeys = 0;
            let migratedData = 0;
            const newMasterKey = crypto.randomBytes(32).toString('hex');
            const newKeyId = this.generateKeyId({ platform: 'web', sensitivity: 'high' });
            for (const [oldKeyId, oldKey] of this.keyCache.entries()) {
                const newKey = await this.deriveKeyFromMaster(newMasterKey, oldKeyId);
                this.keyCache.set(oldKeyId, newKey);
                rotatedKeys++;
            }
            this.config.masterKey = newMasterKey;
            this.metrics.keyRotations++;
            return {
                rotatedKeys,
                newKeyId,
                migratedData
            };
        }
        catch (error) {
            throw new Error(`Key rotation failed: ${error.message}`);
        }
    }
    async deriveKey(salt, context) {
        const keyMaterial = `${this.config.masterKey}:${context.userId || 'system'}:${context.platform}`;
        return await scrypt(keyMaterial, salt, this.config.keyLength);
    }
    generateKeyId(context) {
        const data = `${context.platform}:${context.sensitivity}:${Date.now()}`;
        return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
    }
    mapClassificationToSensitivity(classification) {
        switch (classification) {
            case 'public': return 'low';
            case 'internal': return 'medium';
            case 'confidential': return 'high';
            case 'restricted': return 'critical';
            default: return 'medium';
        }
    }
    async generateDocumentKey(metadata) {
        const keyMaterial = `${metadata.userId}:${metadata.documentId}:${metadata.classification}`;
        const salt = crypto.createHash('sha256').update(keyMaterial).digest();
        const key = await scrypt(this.config.masterKey, salt, 32);
        const keyId = this.generateKeyId(metadata);
        return { keyId, key };
    }
    anonymizePII(data) {
        const anonymized = { ...data };
        const piiFields = ['email', 'phone', 'ssn', 'address', 'name', 'dateOfBirth'];
        for (const field of piiFields) {
            if (anonymized[field]) {
                switch (field) {
                    case 'email':
                        anonymized[field] = this.maskEmail(anonymized[field]);
                        break;
                    case 'phone':
                        anonymized[field] = this.maskPhone(anonymized[field]);
                        break;
                    case 'ssn':
                        anonymized[field] = 'XXX-XX-XXXX';
                        break;
                    case 'name':
                        anonymized[field] = 'Anonymous User';
                        break;
                    default:
                        anonymized[field] = '[REDACTED]';
                }
            }
        }
        return anonymized;
    }
    pseudonymizePII(data, userId) {
        const pseudonymized = { ...data };
        const pseudonyms = {};
        const piiFields = ['email', 'phone', 'name'];
        for (const field of piiFields) {
            if (pseudonymized[field]) {
                const pseudonym = this.generatePseudonym(pseudonymized[field], userId);
                pseudonyms[field] = pseudonym;
                pseudonymized[field] = pseudonym;
            }
        }
        return { data: pseudonymized, pseudonyms };
    }
    generatePseudonym(value, userId) {
        const hash = crypto.createHmac('sha256', `${this.config.masterKey}:pseudonym`)
            .update(`${value}:${userId}`)
            .digest('hex');
        return `pseudo_${hash.substring(0, 12)}`;
    }
    maskEmail(email) {
        const [local, domain] = email.split('@');
        const maskedLocal = local.length > 2
            ? `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
            : '*'.repeat(local.length);
        return `${maskedLocal}@${domain}`;
    }
    maskPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        if (cleaned.length >= 10) {
            return `XXX-XXX-${cleaned.slice(-4)}`;
        }
        return 'XXX-XXXX';
    }
    startKeyRotationScheduler() {
        const intervalMs = this.rotationPolicy.rotationInterval * 24 * 60 * 60 * 1000;
        setInterval(async () => {
            try {
                await this.rotateKeys();
                console.log('Automatic key rotation completed successfully');
            }
            catch (error) {
                console.error('Automatic key rotation failed:', error);
            }
        }, intervalMs);
    }
    updateAverageTime(operation, time) {
        const currentAvg = operation === 'encryption'
            ? this.metrics.averageEncryptionTime
            : this.metrics.averageDecryptionTime;
        const operations = operation === 'encryption'
            ? this.metrics.encryptionOperations
            : this.metrics.decryptionOperations;
        const newAvg = ((currentAvg * (operations - 1)) + time) / operations;
        if (operation === 'encryption') {
            this.metrics.averageEncryptionTime = newAvg;
        }
        else {
            this.metrics.averageDecryptionTime = newAvg;
        }
    }
    async deriveKeyFromMaster(masterKey, keyId) {
        const salt = crypto.createHash('sha256').update(keyId).digest();
        return await scrypt(masterKey, salt, this.config.keyLength);
    }
    getMetrics() {
        return { ...this.metrics };
    }
    clearKeyCache() {
        this.keyCache.clear();
    }
}
exports.AdvancedEncryptionService = AdvancedEncryptionService;
const createAdvancedEncryption = (config, rotationPolicy) => {
    return new AdvancedEncryptionService(config, rotationPolicy);
};
exports.createAdvancedEncryption = createAdvancedEncryption;
//# sourceMappingURL=advanced-encryption.js.map