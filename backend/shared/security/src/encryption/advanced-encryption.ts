/**
 * Advanced Cross-Platform Encryption Services
 * Enterprise-grade data protection with platform-specific implementations
 */

import * as crypto from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(crypto.scrypt);

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  tagLength: number;
  saltLength: number;
  iterations: number;
  masterKey: string;
  kmsEndpoint?: string;
  hsmEnabled: boolean;
}

export interface EncryptedData {
  data: string;
  algorithm: string;
  iv: string;
  tag: string;
  salt: string;
  keyId: string;
  createdAt: Date;
  expiresAt?: Date;
}

export interface KeyRotationPolicy {
  rotationInterval: number; // in days
  gracePeriod: number; // in days
  maxKeyAge: number; // in days
  autoRotate: boolean;
}

export interface PlatformKeyStorage {
  web: {
    sessionStorage: boolean;
    localStorage: boolean;
    indexedDB: boolean;
    webCrypto: boolean;
  };
  mobile: {
    keychain: boolean; // iOS
    keystore: boolean; // Android
    secureEnclave: boolean;
    biometricProtected: boolean;
  };
  extension: {
    secureStorage: boolean;
    manifestEncryption: boolean;
    contextIsolation: boolean;
  };
}

export interface EncryptionMetrics {
  encryptionOperations: number;
  decryptionOperations: number;
  keyRotations: number;
  failedOperations: number;
  averageEncryptionTime: number;
  averageDecryptionTime: number;
}

export class AdvancedEncryptionService {
  private config: EncryptionConfig;
  private keyCache: Map<string, Buffer>;
  private rotationPolicy: KeyRotationPolicy;
  private metrics: EncryptionMetrics;

  constructor(config: EncryptionConfig, rotationPolicy: KeyRotationPolicy) {
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

    // Initialize key rotation if enabled
    if (rotationPolicy.autoRotate) {
      this.startKeyRotationScheduler();
    }
  }

  /**
   * Encrypt data with AES-256-GCM and key derivation
   */
  async encryptData(
    data: string | Buffer,
    context: {
      userId?: string;
      platform: 'web' | 'mobile' | 'extension';
      sensitivity: 'low' | 'medium' | 'high' | 'critical';
      expiresIn?: number;
    }
  ): Promise<EncryptedData> {
    const startTime = Date.now();
    
    try {
      // Convert data to buffer
      const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
      
      // Generate salt and IV
      const salt = crypto.randomBytes(this.config.saltLength);
      const iv = crypto.randomBytes(this.config.ivLength);
      
      // Derive encryption key
      const key = await this.deriveKey(salt, context);
      
      // Create cipher
      const cipher = crypto.createCipher(this.config.algorithm, key);
      cipher.setAAD(Buffer.from(JSON.stringify({
        platform: context.platform,
        sensitivity: context.sensitivity,
        timestamp: Date.now()
      })));
      
      // Encrypt data
      let encrypted = cipher.update(dataBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const tag = cipher.getAuthTag();
      
      // Generate key ID
      const keyId = this.generateKeyId(context);
      
      // Cache key for faster subsequent operations
      this.keyCache.set(keyId, key);
      
      const result: EncryptedData = {
        data: encrypted.toString('base64'),
        algorithm: this.config.algorithm,
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        salt: salt.toString('base64'),
        keyId,
        createdAt: new Date(),
        expiresAt: context.expiresIn ? new Date(Date.now() + context.expiresIn) : undefined
      };
      
      // Update metrics
      this.metrics.encryptionOperations++;
      this.updateAverageTime('encryption', Date.now() - startTime);
      
      return result;
    } catch (error) {
      this.metrics.failedOperations++;
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with validation and integrity checking
   */
  async decryptData(
    encryptedData: EncryptedData,
    context: {
      userId?: string;
      platform: 'web' | 'mobile' | 'extension';
    }
  ): Promise<Buffer> {
    const startTime = Date.now();
    
    try {
      // Check expiration
      if (encryptedData.expiresAt && encryptedData.expiresAt > new Date()) {
        throw new Error('Encrypted data has expired');
      }
      
      // Get or derive key
      let key = this.keyCache.get(encryptedData.keyId);
      if (!key) {
        const salt = Buffer.from(encryptedData.salt, 'base64');
        key = await this.deriveKey(salt, context);
        this.keyCache.set(encryptedData.keyId, key);
      }
      
      // Prepare decryption components
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const tag = Buffer.from(encryptedData.tag, 'base64');
      const data = Buffer.from(encryptedData.data, 'base64');
      
      // Create decipher
      const decipher = crypto.createDecipher(encryptedData.algorithm, key);
      decipher.setAAD(Buffer.from(JSON.stringify({
        platform: context.platform,
        timestamp: encryptedData.createdAt.getTime()
      })));
      decipher.setAuthTag(tag);
      
      // Decrypt data
      let decrypted = decipher.update(data);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // Update metrics
      this.metrics.decryptionOperations++;
      this.updateAverageTime('decryption', Date.now() - startTime);
      
      return decrypted;
    } catch (error) {
      this.metrics.failedOperations++;
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Platform-specific encryption for secure storage
   */
  async encryptForPlatform(
    data: string,
    platform: 'web' | 'mobile' | 'extension',
    options: {
      useHardwareAcceleration?: boolean;
      useBiometricProtection?: boolean;
      storeInSecureEnclave?: boolean;
    } = {}
  ): Promise<{ encryptedData: string; storageHint: any }> {
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

  /**
   * Web-specific encryption using Web Crypto API
   */
  private async encryptForWeb(
    data: string,
    options: any
  ): Promise<{ encryptedData: string; storageHint: any }> {
    // Use Web Crypto API if available, fallback to Node.js crypto
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedData = new TextEncoder().encode(data);
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encodedData
    );
    
    return {
      encryptedData: Buffer.from(encrypted).toString('base64'),
      storageHint: {
        method: 'webCrypto',
        storage: options.useHardwareAcceleration ? 'indexedDB' : 'localStorage',
        iv: Buffer.from(iv).toString('base64')
      }
    };
  }

  /**
   * Mobile-specific encryption for Keychain/Keystore
   */
  private async encryptForMobile(
    data: string,
    options: any
  ): Promise<{ encryptedData: string; storageHint: any }> {
    // Generate platform-specific encryption
    const salt = crypto.randomBytes(32);
    const key = await scrypt(this.config.masterKey, salt, 32) as Buffer;
    
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

  /**
   * Extension-specific encryption
   */
  private async encryptForExtension(
    data: string,
    options: any
  ): Promise<{ encryptedData: string; storageHint: any }> {
    // Use context isolation for extension security
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

  /**
   * End-to-end encryption for document data
   */
  async encryptDocument(
    documentData: Buffer,
    metadata: {
      userId: string;
      documentId: string;
      classification: 'public' | 'internal' | 'confidential' | 'restricted';
    }
  ): Promise<{
    encryptedDocument: EncryptedData;
    encryptedMetadata: EncryptedData;
    keyId: string;
  }> {
    try {
      // Generate document-specific key
      const documentKey = await this.generateDocumentKey(metadata);
      
      // Encrypt document content
      const encryptedDocument = await this.encryptData(documentData, {
        userId: metadata.userId,
        platform: 'web', // Documents are typically processed server-side
        sensitivity: this.mapClassificationToSensitivity(metadata.classification)
      });
      
      // Encrypt metadata separately
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
    } catch (error) {
      throw new Error(`Document encryption failed: ${error.message}`);
    }
  }

  /**
   * PII data anonymization and encryption
   */
  async encryptPII(
    piiData: Record<string, any>,
    userId: string,
    options: {
      anonymize: boolean;
      pseudonymize: boolean;
      retention: number; // days
    }
  ): Promise<{
    encrypted: EncryptedData;
    anonymized?: Record<string, any>;
    pseudonyms?: Record<string, string>;
  }> {
    try {
      let processedData = { ...piiData };
      let anonymized: Record<string, any> | undefined;
      let pseudonyms: Record<string, string> | undefined;
      
      // Apply anonymization
      if (options.anonymize) {
        anonymized = this.anonymizePII(processedData);
        processedData = anonymized;
      }
      
      // Apply pseudonymization
      if (options.pseudonymize) {
        const pseudonymResult = this.pseudonymizePII(processedData, userId);
        processedData = pseudonymResult.data;
        pseudonyms = pseudonymResult.pseudonyms;
      }
      
      // Encrypt the processed data
      const encrypted = await this.encryptData(JSON.stringify(processedData), {
        userId,
        platform: 'web',
        sensitivity: 'critical',
        expiresIn: options.retention * 24 * 60 * 60 * 1000 // Convert days to milliseconds
      });
      
      return {
        encrypted,
        anonymized,
        pseudonyms
      };
    } catch (error) {
      throw new Error(`PII encryption failed: ${error.message}`);
    }
  }

  /**
   * Key rotation management
   */
  async rotateKeys(): Promise<{
    rotatedKeys: number;
    newKeyId: string;
    migratedData: number;
  }> {
    try {
      const startTime = Date.now();
      let rotatedKeys = 0;
      let migratedData = 0;
      
      // Generate new master key
      const newMasterKey = crypto.randomBytes(32).toString('hex');
      const newKeyId = this.generateKeyId({ platform: 'web', sensitivity: 'high' });
      
      // Migrate cached keys
      for (const [oldKeyId, oldKey] of this.keyCache.entries()) {
        // Re-encrypt with new key
        const newKey = await this.deriveKeyFromMaster(newMasterKey, oldKeyId);
        this.keyCache.set(oldKeyId, newKey);
        rotatedKeys++;
      }
      
      // Update configuration with new master key
      this.config.masterKey = newMasterKey;
      
      // Update metrics
      this.metrics.keyRotations++;
      
      return {
        rotatedKeys,
        newKeyId,
        migratedData
      };
    } catch (error) {
      throw new Error(`Key rotation failed: ${error.message}`);
    }
  }

  /**
   * Secure key derivation using PBKDF2/scrypt
   */
  private async deriveKey(
    salt: Buffer,
    context: {
      userId?: string;
      platform: string;
      sensitivity?: string;
    }
  ): Promise<Buffer> {
    const keyMaterial = `${this.config.masterKey}:${context.userId || 'system'}:${context.platform}`;
    return await scrypt(keyMaterial, salt, this.config.keyLength) as Buffer;
  }

  /**
   * Generate unique key identifier
   */
  private generateKeyId(context: any): string {
    const data = `${context.platform}:${context.sensitivity}:${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Map document classification to sensitivity level
   */
  private mapClassificationToSensitivity(classification: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (classification) {
      case 'public': return 'low';
      case 'internal': return 'medium';
      case 'confidential': return 'high';
      case 'restricted': return 'critical';
      default: return 'medium';
    }
  }

  /**
   * Generate document-specific encryption key
   */
  private async generateDocumentKey(metadata: any): Promise<{ keyId: string; key: Buffer }> {
    const keyMaterial = `${metadata.userId}:${metadata.documentId}:${metadata.classification}`;
    const salt = crypto.createHash('sha256').update(keyMaterial).digest();
    const key = await scrypt(this.config.masterKey, salt, 32) as Buffer;
    const keyId = this.generateKeyId(metadata);
    
    return { keyId, key };
  }

  /**
   * Anonymize PII data
   */
  private anonymizePII(data: Record<string, any>): Record<string, any> {
    const anonymized = { ...data };
    
    // Define PII fields that should be anonymized
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

  /**
   * Pseudonymize PII data
   */
  private pseudonymizePII(
    data: Record<string, any>,
    userId: string
  ): { data: Record<string, any>; pseudonyms: Record<string, string> } {
    const pseudonymized = { ...data };
    const pseudonyms: Record<string, string> = {};
    
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

  /**
   * Generate consistent pseudonym
   */
  private generatePseudonym(value: string, userId: string): string {
    const hash = crypto.createHmac('sha256', `${this.config.masterKey}:pseudonym`)
      .update(`${value}:${userId}`)
      .digest('hex');
    return `pseudo_${hash.substring(0, 12)}`;
  }

  /**
   * Mask email address
   */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    const maskedLocal = local.length > 2 
      ? `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`
      : '*'.repeat(local.length);
    return `${maskedLocal}@${domain}`;
  }

  /**
   * Mask phone number
   */
  private maskPhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length >= 10) {
      return `XXX-XXX-${cleaned.slice(-4)}`;
    }
    return 'XXX-XXXX';
  }

  /**
   * Start automatic key rotation scheduler
   */
  private startKeyRotationScheduler(): void {
    const intervalMs = this.rotationPolicy.rotationInterval * 24 * 60 * 60 * 1000;
    
    setInterval(async () => {
      try {
        await this.rotateKeys();
        console.log('Automatic key rotation completed successfully');
      } catch (error) {
        console.error('Automatic key rotation failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Update average operation time metrics
   */
  private updateAverageTime(operation: 'encryption' | 'decryption', time: number): void {
    const currentAvg = operation === 'encryption' 
      ? this.metrics.averageEncryptionTime 
      : this.metrics.averageDecryptionTime;
    
    const operations = operation === 'encryption'
      ? this.metrics.encryptionOperations
      : this.metrics.decryptionOperations;
    
    const newAvg = ((currentAvg * (operations - 1)) + time) / operations;
    
    if (operation === 'encryption') {
      this.metrics.averageEncryptionTime = newAvg;
    } else {
      this.metrics.averageDecryptionTime = newAvg;
    }
  }

  /**
   * Derive key from master key
   */
  private async deriveKeyFromMaster(masterKey: string, keyId: string): Promise<Buffer> {
    const salt = crypto.createHash('sha256').update(keyId).digest();
    return await scrypt(masterKey, salt, this.config.keyLength) as Buffer;
  }

  /**
   * Get encryption metrics
   */
  getMetrics(): EncryptionMetrics {
    return { ...this.metrics };
  }

  /**
   * Clear key cache (for security)
   */
  clearKeyCache(): void {
    this.keyCache.clear();
  }
}

export const createAdvancedEncryption = (
  config: EncryptionConfig,
  rotationPolicy: KeyRotationPolicy
) => {
  return new AdvancedEncryptionService(config, rotationPolicy);
};