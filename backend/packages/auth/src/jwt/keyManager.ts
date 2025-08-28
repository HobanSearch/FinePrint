import * as crypto from 'crypto';
import { promisify } from 'util';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import { JWTKeyPair, KeyRotationConfig } from './types';

const generateKeyPair = promisify(crypto.generateKeyPair);
const logger = createServiceLogger('jwt-key-manager');

export class JWTKeyManager {
  private cache: CacheManager;
  private config: KeyRotationConfig;
  private rotationTimer?: NodeJS.Timeout;

  constructor(cache: CacheManager, config: KeyRotationConfig) {
    this.cache = cache;
    this.config = config;
    
    if (config.autoRotate) {
      this.startAutoRotation();
    }
  }

  /**
   * Generate a new RSA key pair for JWT signing
   */
  async generateKeyPair(): Promise<JWTKeyPair> {
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

      const keyPair: JWTKeyPair = {
        publicKey: publicKey as string,
        privateKey: privateKey as string
      };

      logger.info('RSA key pair generated successfully');
      return keyPair;
    } catch (error) {
      logger.error('Failed to generate RSA key pair', { error });
      throw new Error('Key pair generation failed');
    }
  }

  /**
   * Get the current active key pair
   */
  async getCurrentKeyPair(): Promise<JWTKeyPair> {
    try {
      const cachedKeyPair = await this.cache.get<JWTKeyPair>('jwt:current-keypair');
      
      if (cachedKeyPair && await this.isKeyValid(cachedKeyPair)) {
        return cachedKeyPair;
      }

      // Generate new key pair if none exists or current is invalid
      const newKeyPair = await this.generateKeyPair();
      await this.storeKeyPair(newKeyPair, 'current');
      
      logger.info('New key pair generated and stored as current');
      return newKeyPair;
    } catch (error) {
      logger.error('Failed to get current key pair', { error });
      throw new Error('Cannot retrieve current key pair');
    }
  }

  /**
   * Get the previous key pair for token validation during rotation
   */
  async getPreviousKeyPair(): Promise<JWTKeyPair | null> {
    try {
      return await this.cache.get<JWTKeyPair>('jwt:previous-keypair');
    } catch (error) {
      logger.error('Failed to get previous key pair', { error });
      return null;
    }
  }

  /**
   * Rotate keys - make current key previous, generate new current
   */
  async rotateKeys(reason: string = 'scheduled-rotation'): Promise<void> {
    try {
      logger.info('Starting key rotation', { reason });

      const currentKeyPair = await this.cache.get<JWTKeyPair>('jwt:current-keypair');
      
      // Move current to previous
      if (currentKeyPair) {
        await this.storeKeyPair(currentKeyPair, 'previous');
        logger.info('Current key pair moved to previous');
      }

      // Generate new current key pair
      const newKeyPair = await this.generateKeyPair();
      await this.storeKeyPair(newKeyPair, 'current');

      // Store rotation metadata
      await this.cache.set('jwt:last-rotation', {
        timestamp: new Date().toISOString(),
        reason
      }, this.config.maxKeyAge);

      logger.info('Key rotation completed successfully', { reason });
      
      // Audit log
      await this.auditKeyRotation(reason);
    } catch (error) {
      logger.error('Key rotation failed', { error, reason });
      throw new Error('Key rotation failed');
    }
  }

  /**
   * Store key pair in cache with TTL
   */
  private async storeKeyPair(keyPair: JWTKeyPair, type: 'current' | 'previous'): Promise<void> {
    const cacheKey = `jwt:${type}-keypair`;
    const ttl = type === 'current' ? this.config.maxKeyAge : this.config.keyOverlapPeriod;
    
    await this.cache.set(cacheKey, keyPair, ttl);
  }

  /**
   * Check if a key pair is still valid (not expired)
   */
  private async isKeyValid(keyPair: JWTKeyPair): Promise<boolean> {
    try {
      const lastRotation = await this.cache.get('jwt:last-rotation');
      if (!lastRotation) return true; // No rotation history, key is valid
      
      const rotationTime = new Date(lastRotation.timestamp);
      const now = new Date();
      const keyAge = (now.getTime() - rotationTime.getTime()) / 1000; // in seconds
      
      return keyAge < this.config.maxKeyAge;
    } catch (error) {
      logger.error('Failed to validate key age', { error });
      return false;
    }
  }

  /**
   * Start automatic key rotation
   */
  private startAutoRotation(): void {
    const intervalMs = this.config.rotationIntervalHours * 60 * 60 * 1000;
    
    this.rotationTimer = setInterval(async () => {
      try {
        await this.rotateKeys('auto-rotation');
      } catch (error) {
        logger.error('Auto rotation failed', { error });
      }
    }, intervalMs);

    logger.info('Auto key rotation started', { 
      intervalHours: this.config.rotationIntervalHours 
    });
  }

  /**
   * Stop automatic key rotation
   */
  stopAutoRotation(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
      logger.info('Auto key rotation stopped');
    }
  }

  /**
   * Force immediate key rotation
   */
  async forceRotation(reason: string): Promise<void> {
    await this.rotateKeys(reason);
  }

  /**
   * Get key rotation status
   */
  async getRotationStatus(): Promise<{
    lastRotation?: Date;
    nextRotation?: Date;
    keyAge: number;
    autoRotationEnabled: boolean;
  }> {
    const lastRotation = await this.cache.get('jwt:last-rotation');
    const now = new Date();
    
    let keyAge = 0;
    let nextRotation: Date | undefined;
    
    if (lastRotation) {
      const rotationTime = new Date(lastRotation.timestamp);
      keyAge = (now.getTime() - rotationTime.getTime()) / 1000;
      
      if (this.config.autoRotate) {
        nextRotation = new Date(
          rotationTime.getTime() + (this.config.rotationIntervalHours * 60 * 60 * 1000)
        );
      }
    }

    return {
      lastRotation: lastRotation ? new Date(lastRotation.timestamp) : undefined,
      nextRotation,
      keyAge,
      autoRotationEnabled: this.config.autoRotate
    };
  }

  /**
   * Audit key rotation event
   */
  private async auditKeyRotation(reason: string): Promise<void> {
    try {
      const auditEvent = {
        event: 'jwt_key_rotation',
        reason,
        timestamp: new Date().toISOString(),
        keyAge: await this.getRotationStatus().then(s => s.keyAge)
      };

      await this.cache.lpush('audit:jwt-key-rotations', auditEvent);
      
      // Keep only last 100 rotation events
      await this.cache.getRawClient().ltrim('audit:jwt-key-rotations', 0, 99);
    } catch (error) {
      logger.error('Failed to audit key rotation', { error });
    }
  }

  /**
   * Cleanup - stop auto rotation and clear resources
   */
  async cleanup(): Promise<void> {
    this.stopAutoRotation();
    logger.info('JWT Key Manager cleanup completed');
  }
}