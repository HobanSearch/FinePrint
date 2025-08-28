import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

import { config } from '@fineprintai/shared-config';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { NotificationPreferences } from '@fineprintai/shared-types';

const logger = createServiceLogger('preference-service');
const prisma = new PrismaClient();

export interface PreferenceUpdateRequest {
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  webhookEnabled?: boolean;
  webhookUrl?: string;
  webhookSecret?: string;
  analysisComplete?: boolean;
  documentChanges?: boolean;
  highRiskFindings?: boolean;
  weeklySummary?: boolean;
  marketingEmails?: boolean;
  securityAlerts?: boolean;
  billingUpdates?: boolean;
  systemMaintenance?: boolean;
  quietHoursEnabled?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  timezone?: string;
  batchingEnabled?: boolean;
  batchingInterval?: number;
  maxBatchSize?: number;
}

export interface ConsentRequest {
  consentGiven: boolean;
  consentTypes: string[];
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

export interface UnsubscribeRequest {
  type: 'all' | 'marketing' | 'transactional' | 'specific';
  categories?: string[];
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  source?: string;
}

class PreferenceService {
  private initialized = false;

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Test database connection
      await prisma.$connect();

      this.initialized = true;
      logger.info('Preference service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize preference service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      await prisma.$disconnect();
      this.initialized = false;
      logger.info('Preference service shut down successfully');
    } catch (error) {
      logger.error('Error during preference service shutdown', { error });
    }
  }

  // Get user notification preferences
  public async getUserPreferences(userId: string): Promise<NotificationPreferences | null> {
    try {
      const preferences = await prisma.notificationPreference.findUnique({
        where: { userId },
      });

      if (!preferences) {
        // Create default preferences for new users
        return this.createDefaultPreferences(userId);
      }

      return {
        userId: preferences.userId,
        emailEnabled: preferences.emailEnabled,
        browserEnabled: preferences.inAppEnabled, // Map to browserEnabled for backward compatibility
        webhookEnabled: preferences.webhookEnabled,
        webhookUrl: preferences.webhookUrl,
        analysisComplete: preferences.analysisComplete,
        documentChanges: preferences.documentChanges,
        highRiskFindings: preferences.highRiskFindings,
        weeklySummary: preferences.weeklySummary,
        marketingEmails: preferences.marketingEmails,
      };
    } catch (error) {
      logger.error('Failed to get user preferences', { error, userId });
      throw error;
    }
  }

  // Get detailed preferences (internal use)
  public async getDetailedUserPreferences(userId: string): Promise<any> {
    try {
      let preferences = await prisma.notificationPreference.findUnique({
        where: { userId },
      });

      if (!preferences) {
        preferences = await this.createDefaultPreferencesRecord(userId);
      }

      return preferences;
    } catch (error) {
      logger.error('Failed to get detailed user preferences', { error, userId });
      throw error;
    }
  }

  // Create default preferences for new users
  private async createDefaultPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const preferences = await this.createDefaultPreferencesRecord(userId);

      return {
        userId: preferences.userId,
        emailEnabled: preferences.emailEnabled,
        browserEnabled: preferences.inAppEnabled,
        webhookEnabled: preferences.webhookEnabled,
        webhookUrl: preferences.webhookUrl,
        analysisComplete: preferences.analysisComplete,
        documentChanges: preferences.documentChanges,
        highRiskFindings: preferences.highRiskFindings,
        weeklySummary: preferences.weeklySummary,
        marketingEmails: preferences.marketingEmails,
      };
    } catch (error) {
      logger.error('Failed to create default preferences', { error, userId });
      throw error;
    }
  }

  private async createDefaultPreferencesRecord(userId: string): Promise<any> {
    return prisma.notificationPreference.create({
      data: {
        id: uuidv4(),
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        webhookEnabled: false,
        analysisComplete: true,
        documentChanges: true,
        highRiskFindings: true,
        weeklySummary: true,
        marketingEmails: false,
        securityAlerts: true,
        billingUpdates: true,
        systemMaintenance: true,
        quietHoursEnabled: false,
        timezone: 'UTC',
        batchingEnabled: false,
        batchingInterval: 60,
        maxBatchSize: 10,
        consentGiven: false, // Must be explicitly set
        dataRetentionDays: 365,
      },
    });
  }

  // Update user preferences
  public async updateUserPreferences(
    userId: string,
    updates: PreferenceUpdateRequest
  ): Promise<NotificationPreferences> {
    try {
      // Ensure user preferences exist
      await this.getDetailedUserPreferences(userId);

      // Validate webhook URL if provided
      if (updates.webhookUrl && !this.isValidWebhookUrl(updates.webhookUrl)) {
        throw new Error('Invalid webhook URL format');
      }

      // Validate quiet hours format
      if (updates.quietHoursStart && !this.isValidTimeFormat(updates.quietHoursStart)) {
        throw new Error('Invalid quiet hours start time format (expected HH:mm)');
      }

      if (updates.quietHoursEnd && !this.isValidTimeFormat(updates.quietHoursEnd)) {
        throw new Error('Invalid quiet hours end time format (expected HH:mm)');
      }

      // Validate timezone
      if (updates.timezone && !this.isValidTimezone(updates.timezone)) {
        throw new Error('Invalid timezone');
      }

      // Validate batching settings
      if (updates.batchingInterval !== undefined && updates.batchingInterval < 1) {
        throw new Error('Batching interval must be at least 1 minute');
      }

      if (updates.maxBatchSize !== undefined && (updates.maxBatchSize < 1 || updates.maxBatchSize > 100)) {
        throw new Error('Max batch size must be between 1 and 100');
      }

      const updatedPreferences = await prisma.notificationPreference.update({
        where: { userId },
        data: {
          ...updates,
          updatedAt: new Date(),
        },
      });

      logger.info('User preferences updated', {
        userId,
        updates: Object.keys(updates),
      });

      return {
        userId: updatedPreferences.userId,
        emailEnabled: updatedPreferences.emailEnabled,
        browserEnabled: updatedPreferences.inAppEnabled,
        webhookEnabled: updatedPreferences.webhookEnabled,
        webhookUrl: updatedPreferences.webhookUrl,
        analysisComplete: updatedPreferences.analysisComplete,
        documentChanges: updatedPreferences.documentChanges,
        highRiskFindings: updatedPreferences.highRiskFindings,
        weeklySummary: updatedPreferences.weeklySummary,
        marketingEmails: updatedPreferences.marketingEmails,
      };
    } catch (error) {
      logger.error('Failed to update user preferences', { error, userId, updates });
      throw error;
    }
  }

  // Handle GDPR consent
  public async updateConsent(
    userId: string,
    consentRequest: ConsentRequest
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Ensure user preferences exist
      await this.getDetailedUserPreferences(userId);

      const updateData: any = {
        consentGiven: consentRequest.consentGiven,
        updatedAt: new Date(),
      };

      if (consentRequest.consentGiven) {
        updateData.consentDate = new Date();
        updateData.optOutDate = null; // Clear opt-out date if giving consent
      } else {
        updateData.optOutDate = new Date();
        // Disable all notifications when consent is withdrawn
        updateData.emailEnabled = false;
        updateData.pushEnabled = false;
        updateData.inAppEnabled = false;
        updateData.webhookEnabled = false;
        updateData.marketingEmails = false;
      }

      await prisma.notificationPreference.update({
        where: { userId },
        data: updateData,
      });

      // Log consent action for audit trail
      await this.logConsentAction(userId, consentRequest);

      const message = consentRequest.consentGiven
        ? 'Consent granted successfully'
        : 'Consent withdrawn and all notifications disabled';

      logger.info('User consent updated', {
        userId,
        consentGiven: consentRequest.consentGiven,
        source: consentRequest.source,
      });

      return { success: true, message };
    } catch (error) {
      logger.error('Failed to update consent', { error, userId, consentRequest });
      throw error;
    }
  }

  // Handle unsubscribe requests
  public async processUnsubscribe(
    userId: string,
    unsubscribeRequest: UnsubscribeRequest
  ): Promise<{ success: boolean; message: string }> {
    try {
      const userEmail = await this.getUserEmail(userId);
      if (!userEmail) {
        throw new Error('User not found');
      }

      // Create unsubscribe record
      await prisma.unsubscribeRecord.create({
        data: {
          id: uuidv4(),
          userId,
          email: userEmail,
          type: unsubscribeRequest.type,
          reason: unsubscribeRequest.reason,
          source: unsubscribeRequest.source || 'preferences_page',
          ipAddress: unsubscribeRequest.ipAddress,
          userAgent: unsubscribeRequest.userAgent,
        },
      });

      // Update preferences based on unsubscribe type
      const updateData: any = {};

      switch (unsubscribeRequest.type) {
        case 'all':
          updateData.emailEnabled = false;
          updateData.pushEnabled = false;
          updateData.inAppEnabled = false;
          updateData.webhookEnabled = false;
          updateData.marketingEmails = false;
          updateData.consentGiven = false;
          updateData.optOutDate = new Date();
          break;

        case 'marketing':
          updateData.marketingEmails = false;
          updateData.weeklySummary = false;
          break;

        case 'transactional':
          updateData.analysisComplete = false;
          updateData.documentChanges = false;
          updateData.highRiskFindings = false;
          updateData.securityAlerts = false;
          updateData.billingUpdates = false;
          updateData.systemMaintenance = false;
          break;

        case 'specific':
          // Handle specific category unsubscribes
          if (unsubscribeRequest.categories) {
            unsubscribeRequest.categories.forEach(category => {
              if (category in updateData) {
                updateData[category] = false;
              }
            });
          }
          break;
      }

      await prisma.notificationPreference.update({
        where: { userId },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
      });

      const messages = {
        all: 'Successfully unsubscribed from all notifications',
        marketing: 'Successfully unsubscribed from marketing emails',
        transactional: 'Successfully unsubscribed from transactional notifications',
        specific: 'Successfully unsubscribed from selected categories',
      };

      logger.info('User unsubscribed', {
        userId,
        type: unsubscribeRequest.type,
        categories: unsubscribeRequest.categories,
        source: unsubscribeRequest.source,
      });

      return {
        success: true,
        message: messages[unsubscribeRequest.type],
      };
    } catch (error) {
      logger.error('Failed to process unsubscribe', { error, userId, unsubscribeRequest });
      throw error;
    }
  }

  // Check if user can receive a specific type of notification
  public async canReceiveNotification(
    userId: string,
    notificationType: string,
    channel: 'email' | 'push' | 'in_app' | 'webhook'
  ): Promise<boolean> {
    try {
      const preferences = await this.getDetailedUserPreferences(userId);

      // Check GDPR consent
      if (!preferences.consentGiven) {
        return false;
      }

      // Check channel preferences
      const channelEnabled = {
        email: preferences.emailEnabled,
        push: preferences.pushEnabled,
        in_app: preferences.inAppEnabled,
        webhook: preferences.webhookEnabled,
      };

      if (!channelEnabled[channel]) {
        return false;
      }

      // Check notification type preferences
      const typeMapping: Record<string, string> = {
        analysis_complete: 'analysisComplete',
        document_changed: 'documentChanges',
        high_risk_finding: 'highRiskFindings',
        weekly_summary: 'weeklySummary',
        marketing_email: 'marketingEmails',
        security_alert: 'securityAlerts',
        billing_update: 'billingUpdates',
        system_maintenance: 'systemMaintenance',
      };

      const prefKey = typeMapping[notificationType];
      if (prefKey && !preferences[prefKey]) {
        return false;
      }

      // Check quiet hours
      if (preferences.quietHoursEnabled && channel === 'push') {
        const now = new Date();
        const userTimezone = preferences.timezone || 'UTC';
        
        if (this.isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd, userTimezone)) {
          return false;
        }
      }

      // Check unsubscribe records
      const userEmail = await this.getUserEmail(userId);
      if (userEmail) {
        const unsubscribed = await this.checkUnsubscribeStatus(userEmail, notificationType);
        if (unsubscribed) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('Failed to check notification permission', { error, userId, notificationType, channel });
      return false; // Fail closed for privacy
    }
  }

  // Check if user should receive batched notifications
  public async shouldBatchNotifications(userId: string): Promise<{
    shouldBatch: boolean;
    batchInterval: number;
    maxBatchSize: number;
  }> {
    try {
      const preferences = await this.getDetailedUserPreferences(userId);

      return {
        shouldBatch: preferences.batchingEnabled,
        batchInterval: preferences.batchingInterval,
        maxBatchSize: preferences.maxBatchSize,
      };
    } catch (error) {
      logger.error('Failed to check batching preferences', { error, userId });
      return {
        shouldBatch: false,
        batchInterval: 60,
        maxBatchSize: 10,
      };
    }
  }

  // Get user preferences for export (GDPR compliance)
  public async exportUserData(userId: string): Promise<any> {
    try {
      const [preferences, unsubscribes, consentLog] = await Promise.all([
        prisma.notificationPreference.findUnique({ where: { userId } }),
        prisma.unsubscribeRecord.findMany({ where: { userId } }),
        // This would be a separate consent log table in a real implementation
        Promise.resolve([]),
      ]);

      return {
        preferences,
        unsubscribeHistory: unsubscribes,
        consentHistory: consentLog,
        exportedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to export user data', { error, userId });
      throw error;
    }
  }

  // Delete user data (GDPR right to be forgotten)
  public async deleteUserData(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      await prisma.$transaction([
        prisma.notificationPreference.deleteMany({ where: { userId } }),
        prisma.unsubscribeRecord.deleteMany({ where: { userId } }),
        // Delete related notification data
        prisma.notification.deleteMany({ where: { userId } }),
      ]);

      logger.info('User data deleted', { userId });

      return {
        success: true,
        message: 'All user notification data has been permanently deleted',
      };
    } catch (error) {
      logger.error('Failed to delete user data', { error, userId });
      throw error;
    }
  }

  // Helper methods
  private async logConsentAction(userId: string, consentRequest: ConsentRequest): Promise<void> {
    // In a real implementation, this would log to a dedicated consent audit table
    logger.info('Consent action logged', {
      userId,
      action: consentRequest.consentGiven ? 'consent_given' : 'consent_withdrawn',
      consentTypes: consentRequest.consentTypes,
      source: consentRequest.source,
      ipAddress: consentRequest.ipAddress,
      userAgent: consentRequest.userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  private async getUserEmail(userId: string): Promise<string | null> {
    // This would typically fetch from a users table
    // For now, return a mock email
    return `user-${userId}@example.com`;
  }

  private async checkUnsubscribeStatus(email: string, notificationType?: string): Promise<boolean> {
    const unsubscribe = await prisma.unsubscribeRecord.findFirst({
      where: {
        email,
        OR: [
          { type: 'all' },
          { type: 'transactional' },
          ...(notificationType && notificationType.includes('marketing') 
            ? [{ type: 'marketing' }] 
            : []
          ),
        ],
      },
    });

    return !!unsubscribe;
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return ['http:', 'https:'].includes(parsedUrl.protocol);
    } catch {
      return false;
    }
  }

  private isValidTimeFormat(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  private isInQuietHours(
    now: Date,
    quietStart: string | null,
    quietEnd: string | null,
    timezone: string
  ): boolean {
    if (!quietStart || !quietEnd) return false;

    try {
      // Convert current time to user's timezone
      const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
      const currentHour = userTime.getHours();
      const currentMinute = userTime.getMinutes();
      const currentTime = currentHour * 60 + currentMinute;

      // Parse quiet hours
      const [startHour, startMinute] = quietStart.split(':').map(Number);
      const [endHour, endMinute] = quietEnd.split(':').map(Number);
      const startTime = startHour * 60 + startMinute;
      const endTime = endHour * 60 + endMinute;

      // Handle quiet hours that span midnight
      if (startTime > endTime) {
        return currentTime >= startTime || currentTime <= endTime;
      } else {
        return currentTime >= startTime && currentTime <= endTime;
      }
    } catch (error) {
      logger.error('Failed to check quiet hours', { error, timezone, quietStart, quietEnd });
      return false;
    }
  }

  // Analytics methods
  public async getPreferenceStats(): Promise<{
    totalUsers: number;
    consentRate: number;
    channelPreferences: Record<string, number>;
    notificationTypePreferences: Record<string, number>;
  }> {
    try {
      const stats = await prisma.notificationPreference.aggregate({
        _count: { _all: true },
        _avg: {
          emailEnabled: true,
          pushEnabled: true,
          inAppEnabled: true,
          webhookEnabled: true,
          consentGiven: true,
        },
      });

      const typeStats = await prisma.notificationPreference.aggregate({
        _avg: {
          analysisComplete: true,
          documentChanges: true,
          highRiskFindings: true,
          weeklySummary: true,
          marketingEmails: true,
        },
      });

      return {
        totalUsers: stats._count._all,
        consentRate: (stats._avg.consentGiven || 0) * 100,
        channelPreferences: {
          email: Math.round((stats._avg.emailEnabled || 0) * 100),
          push: Math.round((stats._avg.pushEnabled || 0) * 100),
          inApp: Math.round((stats._avg.inAppEnabled || 0) * 100),
          webhook: Math.round((stats._avg.webhookEnabled || 0) * 100),
        },
        notificationTypePreferences: {
          analysisComplete: Math.round((typeStats._avg.analysisComplete || 0) * 100),
          documentChanges: Math.round((typeStats._avg.documentChanges || 0) * 100),
          highRiskFindings: Math.round((typeStats._avg.highRiskFindings || 0) * 100),
          weeklySummary: Math.round((typeStats._avg.weeklySummary || 0) * 100),
          marketingEmails: Math.round((typeStats._avg.marketingEmails || 0) * 100),
        },
      };
    } catch (error) {
      logger.error('Failed to get preference stats', { error });
      throw error;
    }
  }
}

export const preferenceService = new PreferenceService();