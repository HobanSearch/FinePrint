/**
 * Privacy and consent management system
 */

import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import crypto from 'crypto';
import {
  UserConsent,
  ConsentLevel,
  RetentionPolicy,
  ImplicitFeedbackEvent,
  ExplicitFeedbackEvent
} from '../types';

export class PrivacyManager {
  private redis: Redis;
  private logger: Logger;
  private encryptionKey: Buffer;
  private retentionPolicies: Map<string, RetentionPolicy>;
  private consentCache: Map<string, UserConsent>;

  constructor(redis: Redis, logger: Logger, encryptionKey?: string) {
    this.redis = redis;
    this.logger = logger.child({ component: 'PrivacyManager' });
    this.encryptionKey = Buffer.from(
      encryptionKey || process.env.ENCRYPTION_KEY || 'default-encryption-key-change-me-32',
      'utf-8'
    ).slice(0, 32);
    this.retentionPolicies = new Map();
    this.consentCache = new Map();
    
    this.initializeRetentionPolicies();
  }

  /**
   * Initialize default retention policies
   */
  private initializeRetentionPolicies(): void {
    // GDPR-compliant default retention policies
    this.retentionPolicies.set('implicit', {
      dataType: 'implicit',
      retentionDays: 90,
      anonymizeAfterDays: 30,
      deleteAfterDays: 90
    });
    
    this.retentionPolicies.set('explicit', {
      dataType: 'explicit',
      retentionDays: 365,
      anonymizeAfterDays: 180,
      deleteAfterDays: 365
    });
    
    this.retentionPolicies.set('personal', {
      dataType: 'personal',
      retentionDays: 730, // 2 years
      anonymizeAfterDays: 365,
      deleteAfterDays: 730,
      exceptions: ['legal_holds', 'active_accounts']
    });
    
    this.retentionPolicies.set('analytics', {
      dataType: 'analytics',
      retentionDays: 1095, // 3 years
      anonymizeAfterDays: 90,
      deleteAfterDays: 1095
    });
  }

  /**
   * Record user consent
   */
  async recordConsent(
    userId: string,
    consentLevels: ConsentLevel[],
    ipAddress?: string,
    userAgent?: string
  ): Promise<UserConsent> {
    const consentId = uuidv4();
    const timestamp = new Date();
    const expiresAt = new Date(timestamp.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
    
    const consent: UserConsent = {
      userId,
      consentId,
      timestamp,
      consentLevels,
      ipAddress: ipAddress ? this.hashIpAddress(ipAddress) : undefined,
      userAgent,
      expiresAt,
      withdrawable: true
    };
    
    // Store in Redis
    await this.redis.setex(
      `consent:${userId}`,
      365 * 24 * 60 * 60, // 1 year TTL
      JSON.stringify(consent)
    );
    
    // Store consent history
    await this.redis.lpush(
      `consent:history:${userId}`,
      JSON.stringify(consent)
    );
    
    // Update cache
    this.consentCache.set(userId, consent);
    
    // Create audit log
    await this.createAuditLog('consent_granted', userId, consent);
    
    this.logger.info({ userId, consentLevels }, 'User consent recorded');
    
    return consent;
  }

  /**
   * Check if user has given consent for specific level
   */
  async checkConsent(userId: string, level: ConsentLevel): Promise<boolean> {
    // Check cache first
    let consent = this.consentCache.get(userId);
    
    if (!consent) {
      // Check Redis
      const consentData = await this.redis.get(`consent:${userId}`);
      if (consentData) {
        consent = JSON.parse(consentData);
        this.consentCache.set(userId, consent);
      }
    }
    
    if (!consent) {
      return level === 'essential'; // Essential is always allowed
    }
    
    // Check if consent has expired
    if (new Date(consent.expiresAt) < new Date()) {
      this.logger.debug({ userId }, 'Consent has expired');
      return level === 'essential';
    }
    
    // Check if user has consented to this level
    return consent.consentLevels.includes(level) || consent.consentLevels.includes('all');
  }

  /**
   * Withdraw consent
   */
  async withdrawConsent(userId: string): Promise<void> {
    // Remove active consent
    await this.redis.del(`consent:${userId}`);
    
    // Clear cache
    this.consentCache.delete(userId);
    
    // Create audit log
    await this.createAuditLog('consent_withdrawn', userId, {});
    
    // Trigger data deletion workflow
    await this.scheduleDataDeletion(userId);
    
    this.logger.info({ userId }, 'User consent withdrawn');
  }

  /**
   * Update consent preferences
   */
  async updateConsent(
    userId: string,
    consentLevels: ConsentLevel[]
  ): Promise<UserConsent> {
    const existingConsent = await this.getConsent(userId);
    
    if (!existingConsent) {
      throw new Error('No existing consent found');
    }
    
    // Record new consent
    const newConsent = await this.recordConsent(
      userId,
      consentLevels,
      existingConsent.ipAddress,
      existingConsent.userAgent
    );
    
    // Create audit log for update
    await this.createAuditLog('consent_updated', userId, {
      old: existingConsent.consentLevels,
      new: consentLevels
    });
    
    return newConsent;
  }

  /**
   * Get user consent
   */
  async getConsent(userId: string): Promise<UserConsent | null> {
    const consentData = await this.redis.get(`consent:${userId}`);
    return consentData ? JSON.parse(consentData) : null;
  }

  /**
   * Get consent history
   */
  async getConsentHistory(userId: string): Promise<UserConsent[]> {
    const history = await this.redis.lrange(`consent:history:${userId}`, 0, -1);
    return history.map(h => JSON.parse(h));
  }

  /**
   * Anonymize feedback event
   */
  async anonymizeFeedback(event: ImplicitFeedbackEvent | ExplicitFeedbackEvent): Promise<any> {
    const anonymized = { ...event };
    
    // Remove or hash personal identifiers
    if ('userId' in anonymized && anonymized.userId) {
      anonymized.userId = this.hashUserId(anonymized.userId);
    }
    
    // Anonymize session ID after retention period
    const shouldAnonymizeSession = await this.shouldAnonymize('implicit', event.timestamp);
    if (shouldAnonymizeSession) {
      anonymized.sessionId = this.hashSessionId(anonymized.sessionId);
    }
    
    // Remove IP addresses and user agents from metadata
    if (anonymized.metadata) {
      delete anonymized.metadata.ipAddress;
      delete anonymized.metadata.userAgent;
      
      // Generalize location data
      if (anonymized.metadata.location) {
        delete anonymized.metadata.location.city;
        // Keep only country and region for analytics
      }
    }
    
    // Remove email from follow-up if present
    if ('followUp' in anonymized && anonymized.followUp?.email) {
      delete anonymized.followUp.email;
    }
    
    return anonymized;
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData: string): string {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Hash user ID for anonymization
   */
  private hashUserId(userId: string): string {
    return crypto
      .createHash('sha256')
      .update(userId + process.env.SALT || 'default-salt')
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Hash session ID for anonymization
   */
  private hashSessionId(sessionId: string): string {
    return crypto
      .createHash('sha256')
      .update(sessionId + process.env.SALT || 'default-salt')
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Hash IP address for privacy
   */
  private hashIpAddress(ip: string): string {
    // Keep first two octets for geographic analysis, hash the rest
    const parts = ip.split('.');
    if (parts.length === 4) {
      const hashedPart = crypto
        .createHash('sha256')
        .update(parts.slice(2).join('.'))
        .digest('hex')
        .substring(0, 8);
      return `${parts[0]}.${parts[1]}.x.${hashedPart}`;
    }
    return 'anonymous';
  }

  /**
   * Check if data should be anonymized based on retention policy
   */
  private async shouldAnonymize(dataType: string, timestamp: Date): Promise<boolean> {
    const policy = this.retentionPolicies.get(dataType);
    if (!policy || !policy.anonymizeAfterDays) return false;
    
    const age = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60 * 24);
    return age > policy.anonymizeAfterDays;
  }

  /**
   * Export user data (GDPR right to data portability)
   */
  async exportUserData(userId: string): Promise<any> {
    const data: any = {
      userId,
      exportDate: new Date(),
      consent: await this.getConsent(userId),
      consentHistory: await this.getConsentHistory(userId),
      feedback: [],
      analytics: []
    };
    
    // Collect all user feedback
    const feedbackKeys = await this.redis.keys(`feedback:*:${userId}`);
    for (const key of feedbackKeys) {
      const feedbackData = await this.redis.get(key);
      if (feedbackData) {
        data.feedback.push(JSON.parse(feedbackData));
      }
    }
    
    // Collect analytics data
    const analyticsKeys = await this.redis.keys(`analytics:*:${userId}`);
    for (const key of analyticsKeys) {
      const analyticsData = await this.redis.get(key);
      if (analyticsData) {
        data.analytics.push(JSON.parse(analyticsData));
      }
    }
    
    // Create audit log
    await this.createAuditLog('data_exported', userId, {
      recordCount: data.feedback.length + data.analytics.length
    });
    
    this.logger.info({ userId }, 'User data exported');
    
    return data;
  }

  /**
   * Delete user data (GDPR right to erasure)
   */
  async deleteUserData(userId: string): Promise<void> {
    // Delete consent
    await this.redis.del(`consent:${userId}`);
    await this.redis.del(`consent:history:${userId}`);
    
    // Delete feedback
    const feedbackKeys = await this.redis.keys(`feedback:*:${userId}`);
    if (feedbackKeys.length > 0) {
      await this.redis.del(...feedbackKeys);
    }
    
    // Delete analytics
    const analyticsKeys = await this.redis.keys(`analytics:*:${userId}`);
    if (analyticsKeys.length > 0) {
      await this.redis.del(...analyticsKeys);
    }
    
    // Delete sessions
    const sessionKeys = await this.redis.keys(`session:*:${userId}`);
    if (sessionKeys.length > 0) {
      await this.redis.del(...sessionKeys);
    }
    
    // Clear cache
    this.consentCache.delete(userId);
    
    // Create audit log
    await this.createAuditLog('data_deleted', userId, {
      timestamp: new Date()
    });
    
    this.logger.info({ userId }, 'User data deleted');
  }

  /**
   * Schedule data deletion based on retention policy
   */
  private async scheduleDataDeletion(userId: string): Promise<void> {
    // Add to deletion queue
    await this.redis.zadd(
      'privacy:deletion_queue',
      Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days grace period
      userId
    );
  }

  /**
   * Process deletion queue
   */
  async processDeletionQueue(): Promise<void> {
    const now = Date.now();
    const userIds = await this.redis.zrangebyscore('privacy:deletion_queue', 0, now);
    
    for (const userId of userIds) {
      try {
        await this.deleteUserData(userId);
        await this.redis.zrem('privacy:deletion_queue', userId);
      } catch (error) {
        this.logger.error({ error, userId }, 'Failed to delete user data');
      }
    }
  }

  /**
   * Apply retention policies
   */
  async applyRetentionPolicies(): Promise<void> {
    for (const [dataType, policy] of this.retentionPolicies) {
      await this.applyRetentionPolicy(dataType, policy);
    }
  }

  /**
   * Apply specific retention policy
   */
  private async applyRetentionPolicy(
    dataType: string,
    policy: RetentionPolicy
  ): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.deleteAfterDays);
    
    // Find data older than retention period
    const pattern = this.getDataPattern(dataType);
    const keys = await this.redis.keys(pattern);
    
    let deletedCount = 0;
    let anonymizedCount = 0;
    
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (!data) continue;
      
      const parsed = JSON.parse(data);
      const timestamp = new Date(parsed.timestamp || parsed.createdAt);
      
      // Check if should delete
      if (timestamp < cutoffDate) {
        // Check for exceptions
        if (policy.exceptions && await this.hasException(parsed, policy.exceptions)) {
          continue;
        }
        
        await this.redis.del(key);
        deletedCount++;
      } else if (policy.anonymizeAfterDays) {
        // Check if should anonymize
        const anonymizeCutoff = new Date();
        anonymizeCutoff.setDate(anonymizeCutoff.getDate() - policy.anonymizeAfterDays);
        
        if (timestamp < anonymizeCutoff && !parsed.anonymized) {
          const anonymized = await this.anonymizeFeedback(parsed);
          anonymized.anonymized = true;
          await this.redis.set(key, JSON.stringify(anonymized));
          anonymizedCount++;
        }
      }
    }
    
    if (deletedCount > 0 || anonymizedCount > 0) {
      this.logger.info({
        dataType,
        deletedCount,
        anonymizedCount
      }, 'Retention policy applied');
    }
  }

  /**
   * Get data pattern for retention policy
   */
  private getDataPattern(dataType: string): string {
    switch (dataType) {
      case 'implicit':
        return 'implicit:*';
      case 'explicit':
        return 'feedback:*';
      case 'personal':
        return 'user:*';
      case 'analytics':
        return 'analytics:*';
      default:
        return '*';
    }
  }

  /**
   * Check if data has retention exception
   */
  private async hasException(data: any, exceptions: string[]): Promise<boolean> {
    for (const exception of exceptions) {
      switch (exception) {
        case 'legal_holds':
          if (data.legalHold) return true;
          break;
        case 'active_accounts':
          if (data.userId) {
            const isActive = await this.redis.exists(`user:active:${data.userId}`);
            if (isActive) return true;
          }
          break;
      }
    }
    return false;
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(
    action: string,
    userId: string,
    details: any
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date(),
      action,
      userId,
      details,
      ip: details.ipAddress || 'system',
      userAgent: details.userAgent || 'system'
    };
    
    await this.redis.lpush('privacy:audit_log', JSON.stringify(logEntry));
    await this.redis.ltrim('privacy:audit_log', 0, 9999); // Keep last 10000 entries
  }

  /**
   * Get audit log
   */
  async getAuditLog(userId?: string, limit: number = 100): Promise<any[]> {
    const logs = await this.redis.lrange('privacy:audit_log', 0, limit - 1);
    const parsed = logs.map(l => JSON.parse(l));
    
    if (userId) {
      return parsed.filter(l => l.userId === userId);
    }
    
    return parsed;
  }

  /**
   * Generate privacy report
   */
  async generatePrivacyReport(): Promise<any> {
    const report = {
      timestamp: new Date(),
      consents: {
        total: 0,
        active: 0,
        withdrawn: 0,
        expired: 0
      },
      dataRetention: {
        implicit: 0,
        explicit: 0,
        personal: 0,
        analytics: 0
      },
      deletions: {
        scheduled: 0,
        completed: 0
      },
      anonymization: {
        pending: 0,
        completed: 0
      }
    };
    
    // Count consents
    const consentKeys = await this.redis.keys('consent:*');
    report.consents.total = consentKeys.length;
    
    for (const key of consentKeys) {
      const consent = await this.redis.get(key);
      if (consent) {
        const parsed = JSON.parse(consent);
        if (new Date(parsed.expiresAt) < new Date()) {
          report.consents.expired++;
        } else {
          report.consents.active++;
        }
      }
    }
    
    // Count data by type
    for (const dataType of ['implicit', 'explicit', 'personal', 'analytics']) {
      const pattern = this.getDataPattern(dataType);
      const keys = await this.redis.keys(pattern);
      report.dataRetention[dataType as keyof typeof report.dataRetention] = keys.length;
    }
    
    // Count scheduled deletions
    report.deletions.scheduled = await this.redis.zcard('privacy:deletion_queue');
    
    return report;
  }
}