// Key Management Service (KMS) Implementation
// Handles encryption keys, data encryption at rest, and key rotation

import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { SecurityError, EncryptionError } from '../index';

export interface EncryptionResult {
  encryptedData: string;
  keyId: string;
  algorithm: string;
  iv: string;
  tag?: string;
}

export interface DecryptionRequest {
  encryptedData: string;
  keyId: string;
  algorithm: string;
  iv: string;
  tag?: string;
}

export interface EncryptionKey {
  keyId: string;
  algorithm: string;
  keyMaterial: Buffer;
  createdAt: Date;
  expiresAt?: Date;
  isActive: boolean;
  purpose: KeyPurpose;
}

export enum KeyPurpose {
  DATA_ENCRYPTION = 'data_encryption',
  TOKEN_SIGNING = 'token_signing',
  DATABASE_ENCRYPTION = 'database_encryption',
  FILE_ENCRYPTION = 'file_encryption',
  PII_ENCRYPTION = 'pii_encryption',
  BACKUP_ENCRYPTION = 'backup_encryption'
}

export interface KeyRotationPolicy {
  purpose: KeyPurpose;
  rotationIntervalDays: number;
  maxKeyAge: number;
  autoRotate: boolean;
}

export class KeyManagementService {
  private keys: Map<string, EncryptionKey> = new Map();
  private masterKey: Buffer;
  private keyDerivationSalt: Buffer;

  constructor(masterPassword?: string) {
    this.initializeMasterKey(masterPassword);
    this.keyDerivationSalt = crypto.randomBytes(32);
  }

  /**
   * Initialize master key from password or generate new one
   */
  private async initializeMasterKey(masterPassword?: string): Promise<void> {
    if (masterPassword) {
      // Derive master key from password using Argon2
      this.masterKey = await argon2.hash(masterPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16, // 64 MB
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
        raw: true
      }) as Buffer;
    } else {
      // Generate random master key
      this.masterKey = crypto.randomBytes(32);
    }
  }

  /**
   * Generate new encryption key
   */
  async generateKey(purpose: KeyPurpose, algorithm: string = 'aes-256-gcm'): Promise<string> {
    try {
      const keyId = this.generateKeyId();
      const keyMaterial = crypto.randomBytes(32); // 256-bit key
      
      const key: EncryptionKey = {
        keyId,
        algorithm,
        keyMaterial,
        createdAt: new Date(),
        isActive: true,
        purpose
      };

      // Encrypt key material with master key before storing
      key.keyMaterial = this.encryptKeyMaterial(keyMaterial);
      
      this.keys.set(keyId, key);
      
      return keyId;
    } catch (error) {
      throw new EncryptionError('Failed to generate encryption key');
    }
  }

  /**
   * Encrypt data with specified key
   */
  async encryptData(data: string | Buffer, keyId: string): Promise<EncryptionResult> {
    const key = this.keys.get(keyId);
    if (!key || !key.isActive) {
      throw new EncryptionError('Encryption key not found or inactive');
    }

    try {
      // Decrypt key material
      const keyMaterial = this.decryptKeyMaterial(key.keyMaterial);
      
      // Generate random IV
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const cipher = crypto.createCipher(key.algorithm, keyMaterial);
      cipher.setAAD(Buffer.from(keyId)); // Additional authenticated data
      
      // Encrypt data
      const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      let encrypted = cipher.update(dataBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // Get authentication tag for GCM mode
      const tag = key.algorithm.includes('gcm') ? cipher.getAuthTag() : undefined;
      
      return {
        encryptedData: encrypted.toString('base64'),
        keyId,
        algorithm: key.algorithm,
        iv: iv.toString('base64'),
        tag: tag?.toString('base64')
      };
    } catch (error) {
      throw new EncryptionError('Failed to encrypt data');
    }
  }

  /**
   * Decrypt data with specified key
   */
  async decryptData(request: DecryptionRequest): Promise<Buffer> {
    const key = this.keys.get(request.keyId);
    if (!key) {
      throw new EncryptionError('Decryption key not found');
    }

    try {
      // Decrypt key material
      const keyMaterial = this.decryptKeyMaterial(key.keyMaterial);
      
      // Create decipher
      const decipher = crypto.createDecipher(request.algorithm, keyMaterial);
      decipher.setAAD(Buffer.from(request.keyId)); // Additional authenticated data
      
      // Set authentication tag for GCM mode
      if (request.tag) {
        decipher.setAuthTag(Buffer.from(request.tag, 'base64'));
      }
      
      // Decrypt data
      const encryptedData = Buffer.from(request.encryptedData, 'base64');
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted;
    } catch (error) {
      throw new EncryptionError('Failed to decrypt data');
    }
  }

  /**
   * Encrypt sensitive PII data
   */
  async encryptPII(data: any, keyId?: string): Promise<EncryptionResult> {
    // Use dedicated PII encryption key
    if (!keyId) {
      keyId = await this.getOrCreateKey(KeyPurpose.PII_ENCRYPTION);
    }
    
    const jsonData = JSON.stringify(data);
    return this.encryptData(jsonData, keyId);
  }

  /**
   * Decrypt sensitive PII data
   */
  async decryptPII(request: DecryptionRequest): Promise<any> {
    const decryptedBuffer = await this.decryptData(request);
    const jsonData = decryptedBuffer.toString('utf8');
    return JSON.parse(jsonData);
  }

  /**
   * Encrypt database field
   */
  async encryptDatabaseField(value: string, tableName: string, fieldName: string): Promise<string> {
    const keyId = await this.getOrCreateKey(KeyPurpose.DATABASE_ENCRYPTION);
    const additionalData = `${tableName}.${fieldName}`;
    
    // Add additional authenticated data for context
    const result = await this.encryptData(value, keyId);
    
    // Return formatted encrypted string for database storage
    return `${result.keyId}:${result.iv}:${result.encryptedData}:${result.tag || ''}`;
  }

  /**
   * Decrypt database field
   */
  async decryptDatabaseField(encryptedValue: string): Promise<string> {
    const parts = encryptedValue.split(':');
    if (parts.length < 3) {
      throw new EncryptionError('Invalid encrypted database field format');
    }

    const request: DecryptionRequest = {
      keyId: parts[0],
      iv: parts[1],
      encryptedData: parts[2],
      algorithm: 'aes-256-gcm',
      tag: parts[3] || undefined
    };

    const decryptedBuffer = await this.decryptData(request);
    return decryptedBuffer.toString('utf8');
  }

  /**
   * Rotate encryption key
   */
  async rotateKey(oldKeyId: string): Promise<string> {
    const oldKey = this.keys.get(oldKeyId);
    if (!oldKey) {
      throw new EncryptionError('Key not found for rotation');
    }

    try {
      // Generate new key with same purpose
      const newKeyId = await this.generateKey(oldKey.purpose, oldKey.algorithm);
      
      // Mark old key as inactive
      oldKey.isActive = false;
      oldKey.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      
      return newKeyId;
    } catch (error) {
      throw new EncryptionError('Failed to rotate key');
    }
  }

  /**
   * Get or create key for specific purpose
   */
  private async getOrCreateKey(purpose: KeyPurpose): Promise<string> {
    // Find active key for purpose
    for (const [keyId, key] of this.keys.entries()) {
      if (key.purpose === purpose && key.isActive) {
        return keyId;
      }
    }

    // Create new key if none found
    return this.generateKey(purpose);
  }

  /**
   * Generate unique key ID
   */
  private generateKeyId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `key_${timestamp}_${random}`;
  }

  /**
   * Encrypt key material with master key
   */
  private encryptKeyMaterial(keyMaterial: Buffer): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-gcm', this.masterKey);
    
    let encrypted = cipher.update(keyMaterial);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    
    const tag = cipher.getAuthTag();
    
    // Combine IV, encrypted data, and tag
    return Buffer.concat([iv, encrypted, tag]);
  }

  /**
   * Decrypt key material with master key
   */
  private decryptKeyMaterial(encryptedKeyMaterial: Buffer): Buffer {
    const iv = encryptedKeyMaterial.slice(0, 16);
    const tag = encryptedKeyMaterial.slice(-16);
    const encrypted = encryptedKeyMaterial.slice(16, -16);
    
    const decipher = crypto.createDecipher('aes-256-gcm', this.masterKey);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted;
  }

  /**
   * Get key rotation policies
   */
  getRotationPolicies(): KeyRotationPolicy[] {
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

  /**
   * Check which keys need rotation
   */
  getKeysForRotation(): string[] {
    const policies = this.getRotationPolicies();
    const keysToRotate: string[] = [];
    
    for (const [keyId, key] of this.keys.entries()) {
      if (!key.isActive) continue;
      
      const policy = policies.find(p => p.purpose === key.purpose);
      if (!policy?.autoRotate) continue;
      
      const keyAge = Date.now() - key.createdAt.getTime();
      const maxAge = policy.rotationIntervalDays * 24 * 60 * 60 * 1000;
      
      if (keyAge > maxAge) {
        keysToRotate.push(keyId);
      }
    }
    
    return keysToRotate;
  }

  /**
   * Export key for backup (encrypted)
   */
  async exportKey(keyId: string, backupPassword: string): Promise<string> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new EncryptionError('Key not found for export');
    }

    // Encrypt key with backup password
    const backupKey = await argon2.hash(backupPassword, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
      raw: true
    }) as Buffer;

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

  /**
   * Import key from backup
   */
  async importKey(exportedKey: string, backupPassword: string): Promise<string> {
    try {
      // Derive backup key
      const backupKey = await argon2.hash(backupPassword, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16,
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
        raw: true
      }) as Buffer;

      const exportData = Buffer.from(exportedKey, 'base64');
      const iv = exportData.slice(0, 16);
      const tag = exportData.slice(-16);
      const encrypted = exportData.slice(16, -16);

      const decipher = crypto.createDecipher('aes-256-gcm', backupKey);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const keyData = JSON.parse(decrypted);

      // Recreate key
      const key: EncryptionKey = {
        keyId: keyData.keyId,
        algorithm: keyData.algorithm,
        purpose: keyData.purpose,
        createdAt: new Date(keyData.createdAt),
        keyMaterial: Buffer.from(keyData.keyMaterial, 'base64'),
        isActive: false // Imported keys are inactive by default
      };

      this.keys.set(key.keyId, key);
      return key.keyId;
    } catch (error) {
      throw new EncryptionError('Failed to import key');
    }
  }
}

// Export singleton instance
export const kmsService = new KeyManagementService(process.env.KMS_MASTER_PASSWORD);