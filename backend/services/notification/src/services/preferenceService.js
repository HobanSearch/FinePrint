"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferenceService = void 0;
const client_1 = require("@prisma/client");
const uuid_1 = require("uuid");
const logger_1 = require("@fineprintai/shared-logger");
const logger = (0, logger_1.createServiceLogger)('preference-service');
const prisma = new client_1.PrismaClient();
class PreferenceService {
    initialized = false;
    async initialize() {
        if (this.initialized)
            return;
        try {
            await prisma.$connect();
            this.initialized = true;
            logger.info('Preference service initialized successfully');
        }
        catch (error) {
            logger.error('Failed to initialize preference service', { error });
            throw error;
        }
    }
    async shutdown() {
        if (!this.initialized)
            return;
        try {
            await prisma.$disconnect();
            this.initialized = false;
            logger.info('Preference service shut down successfully');
        }
        catch (error) {
            logger.error('Error during preference service shutdown', { error });
        }
    }
    async getUserPreferences(userId) {
        try {
            const preferences = await prisma.notificationPreference.findUnique({
                where: { userId },
            });
            if (!preferences) {
                return this.createDefaultPreferences(userId);
            }
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
        }
        catch (error) {
            logger.error('Failed to get user preferences', { error, userId });
            throw error;
        }
    }
    async getDetailedUserPreferences(userId) {
        try {
            let preferences = await prisma.notificationPreference.findUnique({
                where: { userId },
            });
            if (!preferences) {
                preferences = await this.createDefaultPreferencesRecord(userId);
            }
            return preferences;
        }
        catch (error) {
            logger.error('Failed to get detailed user preferences', { error, userId });
            throw error;
        }
    }
    async createDefaultPreferences(userId) {
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
        }
        catch (error) {
            logger.error('Failed to create default preferences', { error, userId });
            throw error;
        }
    }
    async createDefaultPreferencesRecord(userId) {
        return prisma.notificationPreference.create({
            data: {
                id: (0, uuid_1.v4)(),
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
                consentGiven: false,
                dataRetentionDays: 365,
            },
        });
    }
    async updateUserPreferences(userId, updates) {
        try {
            await this.getDetailedUserPreferences(userId);
            if (updates.webhookUrl && !this.isValidWebhookUrl(updates.webhookUrl)) {
                throw new Error('Invalid webhook URL format');
            }
            if (updates.quietHoursStart && !this.isValidTimeFormat(updates.quietHoursStart)) {
                throw new Error('Invalid quiet hours start time format (expected HH:mm)');
            }
            if (updates.quietHoursEnd && !this.isValidTimeFormat(updates.quietHoursEnd)) {
                throw new Error('Invalid quiet hours end time format (expected HH:mm)');
            }
            if (updates.timezone && !this.isValidTimezone(updates.timezone)) {
                throw new Error('Invalid timezone');
            }
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
        }
        catch (error) {
            logger.error('Failed to update user preferences', { error, userId, updates });
            throw error;
        }
    }
    async updateConsent(userId, consentRequest) {
        try {
            await this.getDetailedUserPreferences(userId);
            const updateData = {
                consentGiven: consentRequest.consentGiven,
                updatedAt: new Date(),
            };
            if (consentRequest.consentGiven) {
                updateData.consentDate = new Date();
                updateData.optOutDate = null;
            }
            else {
                updateData.optOutDate = new Date();
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
        }
        catch (error) {
            logger.error('Failed to update consent', { error, userId, consentRequest });
            throw error;
        }
    }
    async processUnsubscribe(userId, unsubscribeRequest) {
        try {
            const userEmail = await this.getUserEmail(userId);
            if (!userEmail) {
                throw new Error('User not found');
            }
            await prisma.unsubscribeRecord.create({
                data: {
                    id: (0, uuid_1.v4)(),
                    userId,
                    email: userEmail,
                    type: unsubscribeRequest.type,
                    reason: unsubscribeRequest.reason,
                    source: unsubscribeRequest.source || 'preferences_page',
                    ipAddress: unsubscribeRequest.ipAddress,
                    userAgent: unsubscribeRequest.userAgent,
                },
            });
            const updateData = {};
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
        }
        catch (error) {
            logger.error('Failed to process unsubscribe', { error, userId, unsubscribeRequest });
            throw error;
        }
    }
    async canReceiveNotification(userId, notificationType, channel) {
        try {
            const preferences = await this.getDetailedUserPreferences(userId);
            if (!preferences.consentGiven) {
                return false;
            }
            const channelEnabled = {
                email: preferences.emailEnabled,
                push: preferences.pushEnabled,
                in_app: preferences.inAppEnabled,
                webhook: preferences.webhookEnabled,
            };
            if (!channelEnabled[channel]) {
                return false;
            }
            const typeMapping = {
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
            if (preferences.quietHoursEnabled && channel === 'push') {
                const now = new Date();
                const userTimezone = preferences.timezone || 'UTC';
                if (this.isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd, userTimezone)) {
                    return false;
                }
            }
            const userEmail = await this.getUserEmail(userId);
            if (userEmail) {
                const unsubscribed = await this.checkUnsubscribeStatus(userEmail, notificationType);
                if (unsubscribed) {
                    return false;
                }
            }
            return true;
        }
        catch (error) {
            logger.error('Failed to check notification permission', { error, userId, notificationType, channel });
            return false;
        }
    }
    async shouldBatchNotifications(userId) {
        try {
            const preferences = await this.getDetailedUserPreferences(userId);
            return {
                shouldBatch: preferences.batchingEnabled,
                batchInterval: preferences.batchingInterval,
                maxBatchSize: preferences.maxBatchSize,
            };
        }
        catch (error) {
            logger.error('Failed to check batching preferences', { error, userId });
            return {
                shouldBatch: false,
                batchInterval: 60,
                maxBatchSize: 10,
            };
        }
    }
    async exportUserData(userId) {
        try {
            const [preferences, unsubscribes, consentLog] = await Promise.all([
                prisma.notificationPreference.findUnique({ where: { userId } }),
                prisma.unsubscribeRecord.findMany({ where: { userId } }),
                Promise.resolve([]),
            ]);
            return {
                preferences,
                unsubscribeHistory: unsubscribes,
                consentHistory: consentLog,
                exportedAt: new Date().toISOString(),
            };
        }
        catch (error) {
            logger.error('Failed to export user data', { error, userId });
            throw error;
        }
    }
    async deleteUserData(userId) {
        try {
            await prisma.$transaction([
                prisma.notificationPreference.deleteMany({ where: { userId } }),
                prisma.unsubscribeRecord.deleteMany({ where: { userId } }),
                prisma.notification.deleteMany({ where: { userId } }),
            ]);
            logger.info('User data deleted', { userId });
            return {
                success: true,
                message: 'All user notification data has been permanently deleted',
            };
        }
        catch (error) {
            logger.error('Failed to delete user data', { error, userId });
            throw error;
        }
    }
    async logConsentAction(userId, consentRequest) {
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
    async getUserEmail(userId) {
        return `user-${userId}@example.com`;
    }
    async checkUnsubscribeStatus(email, notificationType) {
        const unsubscribe = await prisma.unsubscribeRecord.findFirst({
            where: {
                email,
                OR: [
                    { type: 'all' },
                    { type: 'transactional' },
                    ...(notificationType && notificationType.includes('marketing')
                        ? [{ type: 'marketing' }]
                        : []),
                ],
            },
        });
        return !!unsubscribe;
    }
    isValidWebhookUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return ['http:', 'https:'].includes(parsedUrl.protocol);
        }
        catch {
            return false;
        }
    }
    isValidTimeFormat(time) {
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
        return timeRegex.test(time);
    }
    isValidTimezone(timezone) {
        try {
            Intl.DateTimeFormat(undefined, { timeZone: timezone });
            return true;
        }
        catch {
            return false;
        }
    }
    isInQuietHours(now, quietStart, quietEnd, timezone) {
        if (!quietStart || !quietEnd)
            return false;
        try {
            const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            const currentHour = userTime.getHours();
            const currentMinute = userTime.getMinutes();
            const currentTime = currentHour * 60 + currentMinute;
            const [startHour, startMinute] = quietStart.split(':').map(Number);
            const [endHour, endMinute] = quietEnd.split(':').map(Number);
            const startTime = startHour * 60 + startMinute;
            const endTime = endHour * 60 + endMinute;
            if (startTime > endTime) {
                return currentTime >= startTime || currentTime <= endTime;
            }
            else {
                return currentTime >= startTime && currentTime <= endTime;
            }
        }
        catch (error) {
            logger.error('Failed to check quiet hours', { error, timezone, quietStart, quietEnd });
            return false;
        }
    }
    async getPreferenceStats() {
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
        }
        catch (error) {
            logger.error('Failed to get preference stats', { error });
            throw error;
        }
    }
}
exports.preferenceService = new PreferenceService();
//# sourceMappingURL=preferenceService.js.map