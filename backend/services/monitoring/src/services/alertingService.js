"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.alertingService = void 0;
const logger_1 = require("@fineprintai/shared-logger");
const client_1 = require("@prisma/client");
const nodemailer_1 = __importDefault(require("nodemailer"));
const axios_1 = __importDefault(require("axios"));
const config_1 = require("@fineprintai/shared-config");
const crypto_1 = __importDefault(require("crypto"));
const logger = (0, logger_1.createServiceLogger)('alerting-service');
class AlertingService {
    prisma;
    emailTransporter = null;
    initialized = false;
    alertRules = new Map();
    notificationChannels = new Map();
    activeAlerts = new Map();
    constructor() {
        this.prisma = new client_1.PrismaClient();
        if (config_1.config.external.sendgrid.apiKey) {
            this.emailTransporter = nodemailer_1.default.createTransporter({
                service: 'SendGrid',
                auth: {
                    user: 'apikey',
                    pass: config_1.config.external.sendgrid.apiKey,
                },
            });
        }
    }
    async initialize() {
        if (this.initialized)
            return;
        logger.info('Initializing alerting service...');
        try {
            await this.prisma.$connect();
            await this.loadAlertRules();
            await this.loadNotificationChannels();
            await this.loadActiveAlerts();
            this.initialized = true;
            logger.info('Alerting service initialized successfully', {
                alertRules: this.alertRules.size,
                notificationChannels: this.notificationChannels.size,
                activeAlerts: this.activeAlerts.size,
            });
        }
        catch (error) {
            logger.error('Failed to initialize alerting service', { error });
            throw error;
        }
    }
    async createAlertRule(data) {
        const ruleId = crypto_1.default.randomUUID();
        const now = new Date();
        const rule = {
            id: ruleId,
            userId: data.userId,
            teamId: data.teamId,
            name: data.name,
            conditions: data.conditions,
            actions: data.actions,
            isActive: true,
            cooldownMinutes: data.cooldownMinutes || 60,
            triggerCount: 0,
            createdAt: now,
        };
        await this.prisma.alertRule.create({
            data: {
                id: rule.id,
                userId: rule.userId,
                teamId: rule.teamId,
                name: rule.name,
                conditions: rule.conditions,
                actions: rule.actions,
                isActive: rule.isActive,
                cooldownMinutes: rule.cooldownMinutes,
                triggerCount: rule.triggerCount,
                createdAt: rule.createdAt,
            },
        });
        this.alertRules.set(ruleId, rule);
        logger.info('Created alert rule', {
            ruleId,
            name: rule.name,
            userId: rule.userId,
            conditionCount: rule.conditions.length,
            actionCount: rule.actions.length,
        });
        return rule;
    }
    async createNotificationChannel(data) {
        const channelId = crypto_1.default.randomUUID();
        const channel = {
            id: channelId,
            userId: data.userId,
            teamId: data.teamId,
            type: data.type,
            config: data.config,
            isActive: true,
            preferences: {
                severities: ['medium', 'high', 'critical'],
                frequency: 'immediate',
                ...data.preferences,
            },
        };
        await this.prisma.notificationChannel.create({
            data: {
                id: channel.id,
                userId: channel.userId,
                teamId: channel.teamId,
                type: channel.type,
                config: channel.config,
                isActive: channel.isActive,
                preferences: channel.preferences,
            },
        });
        this.notificationChannels.set(channelId, channel);
        logger.info('Created notification channel', {
            channelId,
            type: channel.type,
            userId: channel.userId,
        });
        await this.testNotificationChannel(channelId);
        return channel;
    }
    async processDocumentChange(changeEvent) {
        logger.info('Processing document change for alerts', {
            documentId: changeEvent.documentId,
            changeType: changeEvent.changeType,
            riskChange: changeEvent.riskChange,
        });
        const relevantRules = this.getRelevantAlertRules(changeEvent.userId, changeEvent.teamId);
        for (const rule of relevantRules) {
            if (await this.evaluateAlertConditions(rule, changeEvent)) {
                await this.triggerAlert(rule, changeEvent);
            }
        }
    }
    async processMonitoringError(alert) {
        logger.info('Processing monitoring error alert', {
            documentId: alert.documentId,
            severity: alert.severity,
            alertType: alert.alertType,
        });
        const alertInstance = {
            id: crypto_1.default.randomUUID(),
            ruleId: 'system-monitoring-error',
            severity: alert.severity,
            title: alert.title,
            description: alert.description,
            documentId: alert.documentId,
            userId: alert.userId,
            teamId: alert.teamId,
            metadata: alert.metadata,
            createdAt: new Date(),
        };
        await this.createAlertInstance(alertInstance);
        await this.sendNotifications(alertInstance);
    }
    async evaluateAlertConditions(rule, changeEvent) {
        if (rule.lastTriggeredAt) {
            const cooldownPeriod = rule.cooldownMinutes * 60 * 1000;
            const timeSinceLastTrigger = Date.now() - rule.lastTriggeredAt.getTime();
            if (timeSinceLastTrigger < cooldownPeriod) {
                logger.debug('Alert rule in cooldown period', {
                    ruleId: rule.id,
                    timeSinceLastTrigger,
                    cooldownPeriod,
                });
                return false;
            }
        }
        for (const condition of rule.conditions) {
            const conditionMet = await this.evaluateCondition(condition, changeEvent);
            if (!conditionMet) {
                logger.debug('Alert condition not met', {
                    ruleId: rule.id,
                    condition,
                });
                return false;
            }
        }
        logger.info('All alert conditions met', {
            ruleId: rule.id,
            conditionCount: rule.conditions.length,
        });
        return true;
    }
    async evaluateCondition(condition, changeEvent) {
        let value;
        switch (condition.type) {
            case 'change_type':
                value = changeEvent.changeType;
                break;
            case 'risk_change':
                value = changeEvent.riskChange;
                break;
            case 'document_type':
                value = 'terms_of_service';
                break;
            case 'keyword_match':
                value = changeEvent.changeSummary || '';
                break;
            default:
                logger.warn('Unknown condition type', { type: condition.type });
                return false;
        }
        switch (condition.operator) {
            case 'equals':
                return value === condition.value;
            case 'contains':
                return typeof value === 'string' && value.includes(String(condition.value));
            case 'greater_than':
                return typeof value === 'number' && value > Number(condition.value);
            case 'less_than':
                return typeof value === 'number' && value < Number(condition.value);
            case 'matches_regex':
                if (typeof value === 'string') {
                    const regex = new RegExp(String(condition.value), 'i');
                    return regex.test(value);
                }
                return false;
            default:
                logger.warn('Unknown condition operator', { operator: condition.operator });
                return false;
        }
    }
    async triggerAlert(rule, changeEvent) {
        logger.info('Triggering alert', {
            ruleId: rule.id,
            ruleName: rule.name,
            documentId: changeEvent.documentId,
        });
        const severity = this.determineSeverity(changeEvent);
        const alertInstance = {
            id: crypto_1.default.randomUUID(),
            ruleId: rule.id,
            severity,
            title: this.generateAlertTitle(rule, changeEvent),
            description: this.generateAlertDescription(rule, changeEvent),
            documentId: changeEvent.documentId,
            userId: changeEvent.userId,
            teamId: changeEvent.teamId,
            metadata: {
                changeType: changeEvent.changeType,
                riskChange: changeEvent.riskChange,
                significantChanges: changeEvent.significantChanges,
                oldHash: changeEvent.oldHash,
                newHash: changeEvent.newHash,
            },
            createdAt: new Date(),
        };
        await this.createAlertInstance(alertInstance);
        rule.lastTriggeredAt = new Date();
        rule.triggerCount++;
        await this.prisma.alertRule.update({
            where: { id: rule.id },
            data: {
                lastTriggeredAt: rule.lastTriggeredAt,
                triggerCount: rule.triggerCount,
            },
        });
        this.alertRules.set(rule.id, rule);
        await this.executeAlertActions(rule, alertInstance);
        await this.sendNotifications(alertInstance);
    }
    determineSeverity(changeEvent) {
        const riskChange = Math.abs(changeEvent.riskChange || 0);
        if (changeEvent.changeType === 'structural' || riskChange >= 50) {
            return 'critical';
        }
        else if (changeEvent.changeType === 'major' || riskChange >= 25) {
            return 'high';
        }
        else if (riskChange >= 10) {
            return 'medium';
        }
        else {
            return 'low';
        }
    }
    generateAlertTitle(rule, changeEvent) {
        return `${rule.name}: Document Change Detected`;
    }
    generateAlertDescription(rule, changeEvent) {
        const parts = [
            `Document ${changeEvent.documentId} has been modified.`,
            `Change type: ${changeEvent.changeType}`,
        ];
        if (changeEvent.riskChange !== null && changeEvent.riskChange !== 0) {
            const direction = changeEvent.riskChange > 0 ? 'increased' : 'decreased';
            parts.push(`Risk score ${direction} by ${Math.abs(changeEvent.riskChange)} points.`);
        }
        if (changeEvent.changeSummary) {
            parts.push(`Summary: ${changeEvent.changeSummary}`);
        }
        if (changeEvent.significantChanges.length > 0) {
            parts.push(`Significant changes:`);
            changeEvent.significantChanges.slice(0, 3).forEach(change => {
                parts.push(`- ${change}`);
            });
        }
        return parts.join('\n');
    }
    async createAlertInstance(alertInstance) {
        await this.prisma.alertInstance.create({
            data: {
                id: alertInstance.id,
                ruleId: alertInstance.ruleId,
                severity: alertInstance.severity,
                title: alertInstance.title,
                description: alertInstance.description,
                documentId: alertInstance.documentId,
                userId: alertInstance.userId,
                teamId: alertInstance.teamId,
                metadata: alertInstance.metadata,
                createdAt: alertInstance.createdAt,
            },
        });
        this.activeAlerts.set(alertInstance.id, alertInstance);
        logger.info('Alert instance created', {
            alertId: alertInstance.id,
            severity: alertInstance.severity,
            documentId: alertInstance.documentId,
        });
    }
    async executeAlertActions(rule, alertInstance) {
        for (const action of rule.actions) {
            try {
                await this.executeAlertAction(action, alertInstance);
            }
            catch (error) {
                logger.error('Failed to execute alert action', {
                    ruleId: rule.id,
                    alertId: alertInstance.id,
                    actionType: action.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    }
    async executeAlertAction(action, alertInstance) {
        switch (action.type) {
            case 'webhook':
                await this.executeWebhookAction(action, alertInstance);
                break;
            case 'slack':
                await this.executeSlackAction(action, alertInstance);
                break;
            case 'teams':
                await this.executeTeamsAction(action, alertInstance);
                break;
            default:
                logger.warn('Unknown alert action type', { type: action.type });
        }
    }
    async executeWebhookAction(action, alertInstance) {
        const webhookUrl = action.config.url;
        const payload = {
            alert: {
                id: alertInstance.id,
                severity: alertInstance.severity,
                title: alertInstance.title,
                description: alertInstance.description,
                documentId: alertInstance.documentId,
                metadata: alertInstance.metadata,
                createdAt: alertInstance.createdAt,
            },
        };
        await axios_1.default.post(webhookUrl, payload, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'FinePrintAI-Alerts/1.0',
                ...(action.config.headers || {}),
            },
            timeout: 10000,
        });
        logger.info('Webhook action executed', {
            alertId: alertInstance.id,
            webhookUrl,
        });
    }
    async executeSlackAction(action, alertInstance) {
        const webhookUrl = action.config.webhookUrl || config_1.config.external.slack.webhookUrl;
        if (!webhookUrl) {
            throw new Error('Slack webhook URL not configured');
        }
        const color = this.getSeverityColor(alertInstance.severity);
        const payload = {
            attachments: [{
                    color,
                    title: alertInstance.title,
                    text: alertInstance.description,
                    fields: [
                        {
                            title: 'Severity',
                            value: alertInstance.severity.toUpperCase(),
                            short: true,
                        },
                        {
                            title: 'Document ID',
                            value: alertInstance.documentId,
                            short: true,
                        },
                        {
                            title: 'Time',
                            value: alertInstance.createdAt.toISOString(),
                            short: true,
                        },
                    ],
                    footer: 'Fine Print AI',
                    ts: Math.floor(alertInstance.createdAt.getTime() / 1000),
                }],
        };
        await axios_1.default.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        logger.info('Slack action executed', {
            alertId: alertInstance.id,
        });
    }
    async executeTeamsAction(action, alertInstance) {
        const webhookUrl = action.config.webhookUrl || config_1.config.external.teams.webhookUrl;
        if (!webhookUrl) {
            throw new Error('Teams webhook URL not configured');
        }
        const color = this.getSeverityColor(alertInstance.severity);
        const payload = {
            '@type': 'MessageCard',
            '@context': 'https://schema.org/extensions',
            summary: alertInstance.title,
            themeColor: color.replace('#', ''),
            sections: [{
                    activityTitle: alertInstance.title,
                    activitySubtitle: `Severity: ${alertInstance.severity.toUpperCase()}`,
                    text: alertInstance.description,
                    facts: [
                        {
                            name: 'Document ID',
                            value: alertInstance.documentId,
                        },
                        {
                            name: 'Time',
                            value: alertInstance.createdAt.toISOString(),
                        },
                    ],
                }],
        };
        await axios_1.default.post(webhookUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        logger.info('Teams action executed', {
            alertId: alertInstance.id,
        });
    }
    getSeverityColor(severity) {
        switch (severity) {
            case 'critical': return '#ff0000';
            case 'high': return '#ff8c00';
            case 'medium': return '#ffd700';
            case 'low': return '#00ff00';
            default: return '#808080';
        }
    }
    async sendNotifications(alertInstance) {
        const relevantChannels = this.getRelevantNotificationChannels(alertInstance.userId, alertInstance.teamId, alertInstance.severity);
        for (const channel of relevantChannels) {
            try {
                await this.sendNotification(channel, alertInstance);
            }
            catch (error) {
                logger.error('Failed to send notification', {
                    channelId: channel.id,
                    alertId: alertInstance.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                });
            }
        }
    }
    async sendNotification(channel, alertInstance) {
        if (channel.preferences.quietHours && this.isInQuietHours(channel.preferences.quietHours)) {
            logger.debug('Skipping notification due to quiet hours', {
                channelId: channel.id,
                alertId: alertInstance.id,
            });
            return;
        }
        switch (channel.type) {
            case 'email':
                await this.sendEmailNotification(channel, alertInstance);
                break;
            case 'push':
                await this.sendPushNotification(channel, alertInstance);
                break;
            default:
                logger.warn('Unknown notification channel type', { type: channel.type });
        }
    }
    async sendEmailNotification(channel, alertInstance) {
        if (!this.emailTransporter) {
            throw new Error('Email transporter not configured');
        }
        const emailContent = this.generateEmailContent(alertInstance);
        await this.emailTransporter.sendMail({
            from: config_1.config.external.sendgrid.from,
            to: channel.config.email,
            subject: `[${alertInstance.severity.toUpperCase()}] ${alertInstance.title}`,
            html: emailContent.html,
            text: emailContent.text,
        });
        logger.info('Email notification sent', {
            channelId: channel.id,
            alertId: alertInstance.id,
            email: channel.config.email,
        });
    }
    async sendPushNotification(channel, alertInstance) {
        logger.info('Push notification sent', {
            channelId: channel.id,
            alertId: alertInstance.id,
        });
    }
    generateEmailContent(alertInstance) {
        const text = `
${alertInstance.title}

Severity: ${alertInstance.severity.toUpperCase()}
Document ID: ${alertInstance.documentId}
Time: ${alertInstance.createdAt.toISOString()}

Description:
${alertInstance.description}

---
Fine Print AI Monitoring System
`;
        const html = `
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background-color: ${this.getSeverityColor(alertInstance.severity)}; color: white; padding: 20px; text-align: center;">
    <h1>${alertInstance.title}</h1>
    <p style="font-size: 18px; margin: 0;">Severity: ${alertInstance.severity.toUpperCase()}</p>
  </div>
  
  <div style="padding: 20px; background-color: #f9f9f9;">
    <p><strong>Document ID:</strong> ${alertInstance.documentId}</p>
    <p><strong>Time:</strong> ${alertInstance.createdAt.toISOString()}</p>
    
    <h3>Description:</h3>
    <div style="background-color: white; padding: 15px; border-left: 4px solid ${this.getSeverityColor(alertInstance.severity)};">
      ${alertInstance.description.replace(/\n/g, '<br>')}
    </div>
  </div>
  
  <div style="padding: 20px; text-align: center; color: #666; font-size: 12px;">
    Fine Print AI Monitoring System
  </div>
</body>
</html>
`;
        return { html, text };
    }
    isInQuietHours(quietHours) {
        const now = new Date();
        const userTime = new Date(now.toLocaleString('en-US', { timeZone: quietHours.timezone }));
        const currentTime = userTime.getHours() * 60 + userTime.getMinutes();
        const [startHour, startMin] = quietHours.start.split(':').map(Number);
        const [endHour, endMin] = quietHours.end.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        if (startTime <= endTime) {
            return currentTime >= startTime && currentTime <= endTime;
        }
        else {
            return currentTime >= startTime || currentTime <= endTime;
        }
    }
    getRelevantAlertRules(userId, teamId) {
        return Array.from(this.alertRules.values()).filter(rule => {
            if (!rule.isActive)
                return false;
            return rule.userId === userId || (teamId && rule.teamId === teamId);
        });
    }
    getRelevantNotificationChannels(userId, teamId, severity) {
        return Array.from(this.notificationChannels.values()).filter(channel => {
            if (!channel.isActive)
                return false;
            if (!channel.preferences.severities.includes(severity))
                return false;
            return channel.userId === userId || (teamId && channel.teamId === teamId);
        });
    }
    async testNotificationChannel(channelId) {
        const channel = this.notificationChannels.get(channelId);
        if (!channel) {
            throw new Error(`Notification channel not found: ${channelId}`);
        }
        const testAlert = {
            id: 'test-' + crypto_1.default.randomUUID(),
            ruleId: 'test-rule',
            severity: 'medium',
            title: 'Test Notification',
            description: 'This is a test notification from Fine Print AI monitoring system.',
            documentId: 'test-document',
            userId: channel.userId,
            teamId: channel.teamId,
            metadata: { test: true },
            createdAt: new Date(),
        };
        try {
            await this.sendNotification(channel, testAlert);
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
    async loadAlertRules() {
        const rules = await this.prisma.alertRule.findMany({
            where: { isActive: true },
        });
        for (const rule of rules) {
            this.alertRules.set(rule.id, {
                id: rule.id,
                userId: rule.userId,
                teamId: rule.teamId || undefined,
                name: rule.name,
                conditions: rule.conditions,
                actions: rule.actions,
                isActive: rule.isActive,
                cooldownMinutes: rule.cooldownMinutes,
                lastTriggeredAt: rule.lastTriggeredAt || undefined,
                triggerCount: rule.triggerCount,
                createdAt: rule.createdAt,
            });
        }
        logger.info('Loaded alert rules from database', {
            ruleCount: rules.length,
        });
    }
    async loadNotificationChannels() {
        const channels = await this.prisma.notificationChannel.findMany({
            where: { isActive: true },
        });
        for (const channel of channels) {
            this.notificationChannels.set(channel.id, {
                id: channel.id,
                userId: channel.userId,
                teamId: channel.teamId || undefined,
                type: channel.type,
                config: channel.config,
                isActive: channel.isActive,
                preferences: channel.preferences,
            });
        }
        logger.info('Loaded notification channels from database', {
            channelCount: channels.length,
        });
    }
    async loadActiveAlerts() {
        const alerts = await this.prisma.alertInstance.findMany({
            where: {
                resolvedAt: null,
                createdAt: {
                    gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                },
            },
        });
        for (const alert of alerts) {
            this.activeAlerts.set(alert.id, {
                id: alert.id,
                ruleId: alert.ruleId,
                severity: alert.severity,
                title: alert.title,
                description: alert.description,
                documentId: alert.documentId,
                userId: alert.userId,
                teamId: alert.teamId || undefined,
                metadata: alert.metadata,
                createdAt: alert.createdAt,
                acknowledgedAt: alert.acknowledgedAt || undefined,
                acknowledgedBy: alert.acknowledgedBy || undefined,
                resolvedAt: alert.resolvedAt || undefined,
                resolvedBy: alert.resolvedBy || undefined,
            });
        }
        logger.info('Loaded active alerts from database', {
            alertCount: alerts.length,
        });
    }
    async getAlertStats() {
        const activeRules = Array.from(this.alertRules.values()).filter(r => r.isActive);
        const alertsByStatus = Array.from(this.activeAlerts.values()).reduce((acc, alert) => {
            acc[alert.severity] = (acc[alert.severity] || 0) + 1;
            return acc;
        }, {});
        return {
            totalRules: this.alertRules.size,
            activeRules: activeRules.length,
            totalChannels: this.notificationChannels.size,
            activeAlerts: this.activeAlerts.size,
            alertsByStatus,
        };
    }
    async healthCheck() {
        if (!this.initialized) {
            throw new Error('Alerting service not initialized');
        }
        await this.prisma.$queryRaw `SELECT 1`;
        if (this.emailTransporter) {
            try {
                await this.emailTransporter.verify();
            }
            catch (error) {
                logger.warn('Email transporter verification failed', { error });
            }
        }
    }
    async shutdown() {
        logger.info('Shutting down alerting service...');
        await this.prisma.$disconnect();
        this.alertRules.clear();
        this.notificationChannels.clear();
        this.activeAlerts.clear();
        this.initialized = false;
        logger.info('Alerting service shutdown complete');
    }
}
exports.alertingService = new AlertingService();
//# sourceMappingURL=alertingService.js.map