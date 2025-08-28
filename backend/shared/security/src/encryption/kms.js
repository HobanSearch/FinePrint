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
exports.kmsService = exports.KeyManagementService = exports.KeyPurpose = void 0;
const crypto = __importStar(require("crypto"));
const argon2 = __importStar(require("argon2"));
const index_1 = require("../index");
var KeyPurpose;
(function (KeyPurpose) {
    KeyPurpose["DATA_ENCRYPTION"] = "data_encryption";
    KeyPurpose["TOKEN_SIGNING"] = "token_signing";
    KeyPurpose["DATABASE_ENCRYPTION"] = "database_encryption";
    KeyPurpose["FILE_ENCRYPTION"] = "file_encryption";
    KeyPurpose["PII_ENCRYPTION"] = "pii_encryption";
    KeyPurpose["BACKUP_ENCRYPTION"] = "backup_encryption";
})(KeyPurpose || (exports.KeyPurpose = KeyPurpose = {}));
class KeyManagementService {
    keys = new Map();
    masterKey;
    keyDerivationSalt;
    constructor(masterPassword) {
        this.initializeMasterKey(masterPassword);
        this.keyDerivationSalt = crypto.randomBytes(32);
    }
    async initializeMasterKey(masterPassword) {
        if (masterPassword) {
            this.masterKey = await argon2.hash(masterPassword, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16,
                timeCost: 3,
                parallelism: 1,
                hashLength: 32,
                raw: true
            });
        }
        else {
            this.masterKey = crypto.randomBytes(32);
        }
    }
    async generateKey(purpose, algorithm = 'aes-256-gcm') {
        try {
            const keyId = this.generateKeyId();
            const keyMaterial = crypto.randomBytes(32);
            const key = {
                keyId,
                algorithm,
                keyMaterial,
                createdAt: new Date(),
                isActive: true,
                purpose
            };
            key.keyMaterial = this.encryptKeyMaterial(keyMaterial);
            this.keys.set(keyId, key);
            return keyId;
        }
        catch (error) {
            throw new index_1.EncryptionError('Failed to generate encryption key');
        }
    }
    async encryptData(data, keyId) {
        const key = this.keys.get(keyId);
        if (!key || !key.isActive) {
            throw new index_1.EncryptionError('Encryption key not found or inactive');
        }
        try {
            const keyMaterial = this.decryptKeyMaterial(key.keyMaterial);
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipher(key.algorithm, keyMaterial);
            cipher.setAAD(Buffer.from(keyId));
            const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
            let encrypted = cipher.update(dataBuffer);
            encrypted = Buffer.concat([encrypted, cipher.final()]);
            const tag = key.algorithm.includes('gcm') ? cipher.getAuthTag() : undefined;
            return {
                encryptedData: encrypted.toString('base64'),
                keyId,
                algorithm: key.algorithm,
                iv: iv.toString('base64'),
                tag: tag?.toString('base64')
            };
        }
        catch (error) {
            throw new index_1.EncryptionError('Failed to encrypt data');
        }
    }
    async decryptData(request) {
        const key = this.keys.get(request.keyId);
        if (!key) {
            throw new index_1.EncryptionError('Decryption key not found');
        }
        try {
            const keyMaterial = this.decryptKeyMaterial(key.keyMaterial);
            const decipher = crypto.createDecipher(request.algorithm, keyMaterial);
            decipher.setAAD(Buffer.from(request.keyId));
            if (request.tag) {
                decipher.setAuthTag(Buffer.from(request.tag, 'base64'));
            }
            const encryptedData = Buffer.from(request.encryptedData, 'base64');
            let decrypted = decipher.update(encryptedData);
            decrypted = Buffer.concat([decrypted, decipher.final()]);
            return decrypted;
        }
        catch (error) {
            throw new index_1.EncryptionError('Failed to decrypt data');
        }
    }
    async encryptPII(data, keyId) {
        if (!keyId) {
            keyId = await this.getOrCreateKey(KeyPurpose.PII_ENCRYPTION);
        }
        const jsonData = JSON.stringify(data);
        return this.encryptData(jsonData, keyId);
    }
    async decryptPII(request) {
        const decryptedBuffer = await this.decryptData(request);
        const jsonData = decryptedBuffer.toString('utf8');
        return JSON.parse(jsonData);
    }
    async encryptDatabaseField(value, tableName, fieldName) {
        const keyId = await this.getOrCreateKey(KeyPurpose.DATABASE_ENCRYPTION);
        const additionalData = `${tableName}.${fieldName}`;
        const result = await this.encryptData(value, keyId);
        return `${result.keyId}:${result.iv}:${result.encryptedData}:${result.tag || ''}`;
    }
    async decryptDatabaseField(encryptedValue) {
        const parts = encryptedValue.split(':');
        if (parts.length < 3) {
            throw new index_1.EncryptionError('Invalid encrypted database field format');
        }
        const request = {
            keyId: parts[0],
            iv: parts[1],
            encryptedData: parts[2],
            algorithm: 'aes-256-gcm',
            tag: parts[3] || undefined
        };
        const decryptedBuffer = await this.decryptData(request);
        return decryptedBuffer.toString('utf8');
    }
    async rotateKey(oldKeyId) {
        const oldKey = this.keys.get(oldKeyId);
        if (!oldKey) {
            throw new index_1.EncryptionError('Key not found for rotation');
        }
        try {
            const newKeyId = await this.generateKey(oldKey.purpose, oldKey.algorithm);
            oldKey.isActive = false;
            oldKey.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            return newKeyId;
        }
        catch (error) {
            throw new index_1.EncryptionError('Failed to rotate key');
        }
    }
    async getOrCreateKey(purpose) {
        for (const [keyId, key] of this.keys.entries()) {
            if (key.purpose === purpose && key.isActive) {
                return keyId;
            }
        }
        return this.generateKey(purpose);
    }
    generateKeyId() {
        const timestamp = Date.now().toString(36);
        const random = crypto.randomBytes(8).toString('hex');
        return `key_${timestamp}_${random}`;
    }
    encryptKeyMaterial(keyMaterial) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
        let encrypted = cipher.update(keyMaterial);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, encrypted, tag]);
    }
    decryptKeyMaterial(encryptedKeyMaterial) {
        const iv = encryptedKeyMaterial.slice(0, 16);
        const tag = encryptedKeyMaterial.slice(-16);
        const encrypted = encryptedKeyMaterial.slice(16, -16);
        const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
        decipher.setAuthTag(tag);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted;
    }
    getRotationPolicies() {
        return [
            {
                purpose: KeyPurpose.DATA_ENCRYPTION,
                rotationIntervalDays: 90,
                maxKeyAge: 365,
                autoRotate: true
            },
            {
                purpose: KeyPurpose.TOKEN_SIGNING,
                rotationIntervalDays: 30,
                maxKeyAge: 90,
                autoRotate: true
            },
            {
                purpose: KeyPurpose.PII_ENCRYPTION,
                rotationIntervalDays: 180,
                maxKeyAge: 730,
                autoRotate: true
            },
            {
                purpose: KeyPurpose.DATABASE_ENCRYPTION,
                rotationIntervalDays: 365,
                maxKeyAge: 1095,
                autoRotate: false
            }
        ];
    }
    getKeysForRotation() {
        const policies = this.getRotationPolicies();
        const keysToRotate = [];
        for (const [keyId, key] of this.keys.entries()) {
            if (!key.isActive)
                continue;
            const policy = policies.find(p => p.purpose === key.purpose);
            if (!policy?.autoRotate)
                continue;
            const keyAge = Date.now() - key.createdAt.getTime();
            const maxAge = policy.rotationIntervalDays * 24 * 60 * 60 * 1000;
            if (keyAge > maxAge) {
                keysToRotate.push(keyId);
            }
        }
        return keysToRotate;
    }
    async exportKey(keyId, backupPassword) {
        const key = this.keys.get(keyId);
        if (!key) {
            throw new index_1.EncryptionError('Key not found for export');
        }
        const backupKey = await argon2.hash(backupPassword, {
            type: argon2.argon2id,
            memoryCost: 2 ** 16,
            timeCost: 3,
            parallelism: 1,
            hashLength: 32,
            raw: true
        });
        const keyData = JSON.stringify({
            keyId: key.keyId,
            algorithm: key.algorithm,
            purpose: key.purpose,
            createdAt: key.createdAt.toISOString(),
            keyMaterial: key.keyMaterial.toString('base64')
        });
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-gcm', backupKey);
        let encrypted = cipher.update(keyData, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const tag = cipher.getAuthTag();
        const exportData = Buffer.concat([iv, encrypted, tag]);
        return exportData.toString('base64');
    }
    async importKey(exportedKey, backupPassword) {
        try {
            const backupKey = await argon2.hash(backupPassword, {
                type: argon2.argon2id,
                memoryCost: 2 ** 16,
                timeCost: 3,
                parallelism: 1,
                hashLength: 32,
                raw: true
            });
            const exportData = Buffer.from(exportedKey, 'base64');
            const iv = exportData.slice(0, 16);
            const tag = exportData.slice(-16);
            const encrypted = exportData.slice(16, -16);
            const decipher = crypto.createDecipher('aes-256-gcm', backupKey);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, undefined, 'utf8');
            decrypted += decipher.final('utf8');
            const keyData = JSON.parse(decrypted);
            const key = {
                keyId: keyData.keyId,
                algorithm: keyData.algorithm,
                purpose: keyData.purpose,
                createdAt: new Date(keyData.createdAt),
                keyMaterial: Buffer.from(keyData.keyMaterial, 'base64'),
                isActive: false
            };
            this.keys.set(key.keyId, key);
            return key.keyId;
        }
        catch (error) {
            throw new index_1.EncryptionError('Failed to import key');
        }
    }
}
exports.KeyManagementService = KeyManagementService;
exports.kmsService = new KeyManagementService(process.env.KMS_MASTER_PASSWORD);
//# sourceMappingURL=kms.js.map