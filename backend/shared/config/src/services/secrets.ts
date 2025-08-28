// Encrypted Secret Management Service
// Handles secure storage and retrieval of sensitive configuration values

import { PrismaClient } from '@prisma/client';
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';
import { EventEmitter } from 'events';

export interface SecretValue {
  key: string;
  value: string;
  description?: string;
  expiresAt?: Date;
}

export interface EncryptedSecret {
  id: string;
  key: string;
  description?: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
}

export class SecretManagementService extends EventEmitter {
  private prisma: PrismaClient;
  private encryptionKey: Buffer;
  private keyVersion: string;
  private algorithm = 'aes-256-gcm';

  constructor(prisma: PrismaClient, encryptionKey: string) {
    super();
    this.prisma = prisma;
    
    // Derive encryption key from provided key
    this.encryptionKey = pbkdf2Sync(encryptionKey, 'fineprintai-salt', 100000, 32, 'sha256');
    this.keyVersion = '1'; // Version for key rotation support
  }

  // Store encrypted secret
  async storeSecret(
    configurationId: string,
    secret: SecretValue,
    createdBy?: string
  ): Promise<EncryptedSecret> {
    // Encrypt the secret value
    const { encryptedValue, iv, authTag } = this.encryptValue(secret.value);

    // Store in database
    const storedSecret = await this.prisma.configurationSecret.create({
      data: {
        configurationId,
        key: secret.key,
        encryptedValue: `${encryptedValue}:${authTag}`,
        iv,
        keyVersion: this.keyVersion,
        description: secret.description,
        expiresAt: secret.expiresAt,
        createdBy,
      },
    });

    // Emit event
    this.emit('secretStored', {
      configurationId,
      key: secret.key,
      createdBy,
    });

    return this.mapToEncryptedSecret(storedSecret);
  }

  // Retrieve and decrypt secret
  async getSecret(
    configurationId: string,
    key: string,
    updateAccessTracking: boolean = true
  ): Promise<string | null> {
    const secret = await this.prisma.configurationSecret.findUnique({
      where: {
        configurationId_key: {
          configurationId,
          key,
        },
      },
    });

    if (!secret) {
      return null;
    }

    // Check if secret has expired
    if (secret.expiresAt && secret.expiresAt < new Date()) {
      // Clean up expired secret
      await this.deleteSecret(configurationId, key);
      return null;
    }

    // Update access tracking
    if (updateAccessTracking) {
      await this.prisma.configurationSecret.update({
        where: { id: secret.id },
        data: {
          lastAccessedAt: new Date(),
          accessCount: { increment: 1 },
        },
      });
    }

    // Decrypt the value
    try {
      const [encryptedValue, authTag] = secret.encryptedValue.split(':');
      const decryptedValue = this.decryptValue(encryptedValue, secret.iv, authTag);
      
      // Emit access event
      this.emit('secretAccessed', {
        configurationId,
        key,
        accessCount: secret.accessCount + 1,
      });

      return decryptedValue;
    } catch (error) {
      console.error('Failed to decrypt secret:', error);
      throw new Error('Failed to decrypt secret');
    }
  }

  // Get all secrets for a configuration (without values)
  async getSecretsForConfiguration(configurationId: string): Promise<EncryptedSecret[]> {
    const secrets = await this.prisma.configurationSecret.findMany({
      where: { configurationId },
      orderBy: { key: 'asc' },
    });

    return secrets.map(this.mapToEncryptedSecret);
  }

  // Get all secrets for a configuration with decrypted values
  async getSecretsWithValues(
    configurationId: string
  ): Promise<Record<string, string>> {
    const secrets = await this.prisma.configurationSecret.findMany({
      where: { 
        configurationId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    const decryptedSecrets: Record<string, string> = {};

    for (const secret of secrets) {
      try {
        const [encryptedValue, authTag] = secret.encryptedValue.split(':');
        const decryptedValue = this.decryptValue(encryptedValue, secret.iv, authTag);
        decryptedSecrets[secret.key] = decryptedValue;

        // Update access tracking
        await this.prisma.configurationSecret.update({
          where: { id: secret.id },
          data: {
            lastAccessedAt: new Date(),
            accessCount: { increment: 1 },
          },
        });
      } catch (error) {
        console.error(`Failed to decrypt secret ${secret.key}:`, error);
        // Continue with other secrets
      }
    }

    return decryptedSecrets;
  }

  // Update multiple secrets for a configuration
  async updateSecretsForConfiguration(
    configurationId: string,
    secrets: Record<string, string>,
    updatedBy?: string
  ): Promise<void> {
    const operations = Object.entries(secrets).map(async ([key, value]) => {
      const existingSecret = await this.prisma.configurationSecret.findUnique({
        where: {
          configurationId_key: {
            configurationId,
            key,
          },
        },
      });

      if (existingSecret) {
        // Update existing secret
        const { encryptedValue, iv, authTag } = this.encryptValue(value);
        
        await this.prisma.configurationSecret.update({
          where: { id: existingSecret.id },
          data: {
            encryptedValue: `${encryptedValue}:${authTag}`,
            iv,
            keyVersion: this.keyVersion,
          },
        });

        this.emit('secretUpdated', { configurationId, key, updatedBy });
      } else {
        // Create new secret
        await this.storeSecret(
          configurationId,
          { key, value },
          updatedBy
        );
      }
    });

    await Promise.all(operations);
  }

  // Update a single secret
  async updateSecret(
    configurationId: string,
    key: string,
    newValue: string,
    options: {
      description?: string;
      expiresAt?: Date;
      updatedBy?: string;
    } = {}
  ): Promise<EncryptedSecret> {
    const existingSecret = await this.prisma.configurationSecret.findUnique({
      where: {
        configurationId_key: {
          configurationId,
          key,
        },
      },
    });

    if (!existingSecret) {
      throw new Error(`Secret with key ${key} not found`);
    }

    // Encrypt new value
    const { encryptedValue, iv, authTag } = this.encryptValue(newValue);

    // Update secret
    const updatedSecret = await this.prisma.configurationSecret.update({
      where: { id: existingSecret.id },
      data: {
        encryptedValue: `${encryptedValue}:${authTag}`,
        iv,
        keyVersion: this.keyVersion,
        description: options.description ?? existingSecret.description,
        expiresAt: options.expiresAt ?? existingSecret.expiresAt,
      },
    });

    // Emit event
    this.emit('secretUpdated', {
      configurationId,
      key,
      updatedBy: options.updatedBy,
    });

    return this.mapToEncryptedSecret(updatedSecret);
  }

  // Delete a secret
  async deleteSecret(configurationId: string, key: string): Promise<void> {
    const secret = await this.prisma.configurationSecret.findUnique({
      where: {
        configurationId_key: {
          configurationId,
          key,
        },
      },
    });

    if (!secret) {
      throw new Error(`Secret with key ${key} not found`);
    }

    await this.prisma.configurationSecret.delete({
      where: { id: secret.id },
    });

    // Emit event
    this.emit('secretDeleted', {
      configurationId,
      key,
    });
  }

  // Rotate encryption key (for key rotation support)
  async rotateEncryptionKey(newEncryptionKey: string): Promise<void> {
    const newKey = pbkdf2Sync(newEncryptionKey, 'fineprintai-salt', 100000, 32, 'sha256');
    const newKeyVersion = String(parseInt(this.keyVersion) + 1);

    // Get all secrets that need re-encryption
    const secrets = await this.prisma.configurationSecret.findMany({
      where: {
        keyVersion: this.keyVersion,
      },
    });

    // Re-encrypt all secrets with new key
    for (const secret of secrets) {
      try {
        // Decrypt with old key
        const [encryptedValue, authTag] = secret.encryptedValue.split(':');
        const decryptedValue = this.decryptValue(encryptedValue, secret.iv, authTag);

        // Encrypt with new key
        const oldEncryptionKey = this.encryptionKey;
        this.encryptionKey = newKey;
        
        const { encryptedValue: newEncryptedValue, iv: newIv, authTag: newAuthTag } = this.encryptValue(decryptedValue);

        // Update secret in database
        await this.prisma.configurationSecret.update({
          where: { id: secret.id },
          data: {
            encryptedValue: `${newEncryptedValue}:${newAuthTag}`,
            iv: newIv,
            keyVersion: newKeyVersion,
          },
        });

        // Restore old key for remaining secrets
        this.encryptionKey = oldEncryptionKey;
      } catch (error) {
        console.error(`Failed to rotate encryption for secret ${secret.id}:`, error);
        // Continue with other secrets
      }
    }

    // Update current key version
    this.encryptionKey = newKey;
    this.keyVersion = newKeyVersion;

    // Emit event
    this.emit('encryptionKeyRotated', {
      newKeyVersion,
      secretsRotated: secrets.length,
    });
  }

  // Clean up expired secrets
  async cleanupExpiredSecrets(): Promise<number> {
    const result = await this.prisma.configurationSecret.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    if (result.count > 0) {
      this.emit('expiredSecretsCleanup', {
        deletedCount: result.count,
      });
    }

    return result.count;
  }

  // Get secret access statistics
  async getSecretAccessStatistics(
    configurationId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{
    totalSecrets: number;
    totalAccesses: number;
    mostAccessedSecrets: Array<{
      key: string;
      accessCount: number;
      lastAccessed: Date | null;
    }>;
    recentlyCreated: Array<{
      key: string;
      createdAt: Date;
    }>;
  }> {
    const where: any = {};
    
    if (configurationId) {
      where.configurationId = configurationId;
    }

    if (startDate || endDate) {
      where.lastAccessedAt = {};
      if (startDate) where.lastAccessedAt.gte = startDate;
      if (endDate) where.lastAccessedAt.lte = endDate;
    }

    const secrets = await this.prisma.configurationSecret.findMany({
      where,
      select: {
        key: true,
        accessCount: true,
        lastAccessedAt: true,
        createdAt: true,
      },
      orderBy: { accessCount: 'desc' },
    });

    const totalSecrets = secrets.length;
    const totalAccesses = secrets.reduce((sum, s) => sum + s.accessCount, 0);
    const mostAccessedSecrets = secrets.slice(0, 10).map(s => ({
      key: s.key,
      accessCount: s.accessCount,
      lastAccessed: s.lastAccessedAt,
    }));
    const recentlyCreated = secrets
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map(s => ({
        key: s.key,
        createdAt: s.createdAt,
      }));

    return {
      totalSecrets,
      totalAccesses,
      mostAccessedSecrets,
      recentlyCreated,
    };
  }

  // Private helper methods

  private encryptValue(value: string): { encryptedValue: string; iv: string; authTag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    
    let encryptedValue = cipher.update(value, 'utf8', 'hex');
    encryptedValue += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();

    return {
      encryptedValue,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  private decryptValue(encryptedValue: string, iv: string, authTag: string): string {
    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    
    let decryptedValue = decipher.update(encryptedValue, 'hex', 'utf8');
    decryptedValue += decipher.final('utf8');
    
    return decryptedValue;
  }

  private mapToEncryptedSecret(prismaSecret: any): EncryptedSecret {
    return {
      id: prismaSecret.id,
      key: prismaSecret.key,
      description: prismaSecret.description,
      expiresAt: prismaSecret.expiresAt,
      createdAt: prismaSecret.createdAt,
      updatedAt: prismaSecret.updatedAt,
      lastAccessedAt: prismaSecret.lastAccessedAt,
      accessCount: prismaSecret.accessCount,
    };
  }
}