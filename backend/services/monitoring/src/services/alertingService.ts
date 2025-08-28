import { createServiceLogger } from '@fineprintai/shared-logger';
import { PrismaClient } from '@prisma/client';
import { DocumentChangeDetected, MonitoringAlert } from '@fineprintai/shared-types';
import nodemailer from 'nodemailer';
import axios from 'axios';
import { config } from '@fineprintai/shared-config';
import crypto from 'crypto';

const logger = createServiceLogger('alerting-service');

interface AlertRule {
  id: string;
  userId: string;
  teamId?: string;
  name: string;
  conditions: AlertCondition[];
  actions: AlertAction[];
  isActive: boolean;
  cooldownMinutes: number;
  lastTriggeredAt?: Date;
  triggerCount: number;
  createdAt: Date;
}

interface AlertCondition {
  type: 'change_type' | 'risk_change' | 'document_type' | 'keyword_match';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'matches_regex';
  value: string | number;
}

interface AlertAction {
  type: 'email' | 'slack' | 'teams' | 'webhook' | 'push_notification';
  config: Record<string, any>;
}

interface AlertInstance {
  id: string;
  ruleId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  documentId: string;
  userId: string;
  teamId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

interface NotificationChannel {
  id: string;
  userId: string;
  teamId?: string;
  type: 'email' | 'slack' | 'teams' | 'push';
  config: Record<string, any>;
  isActive: boolean;
  preferences: {
    severities: ('low' | 'medium' | 'high' | 'critical')[];
    quietHours?: {
      start: string; // HH:MM format
      end: string;   // HH:MM format
      timezone: string;
    };
    frequency: 'immediate' | 'hourly' | 'daily';
  };
}

class AlertingService {
  private prisma: PrismaClient;
  private emailTransporter: nodemailer.Transporter | null = null;
  private initialized = false;
  private alertRules = new Map<string, AlertRule>();
  private notificationChannels = new Map<string, NotificationChannel>();
  private activeAlerts = new Map<string, AlertInstance>();

  constructor() {
    this.prisma = new PrismaClient();
    
    // Initialize email transporter if configured
    if (config.external.sendgrid.apiKey) {
      this.emailTransporter = nodemailer.createTransporter({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: config.external.sendgrid.apiKey,
        },
      });
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

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
    } catch (error) {
      logger.error('Failed to initialize alerting service', { error });
      throw error;
    }
  }

  async createAlertRule(data: {
    userId: string;
    teamId?: string;
    name: string;
    conditions: AlertCondition[];
    actions: AlertAction[];
    cooldownMinutes?: number;
  }): Promise<AlertRule> {
    const ruleId = crypto.randomUUID();
    const now = new Date();

    const rule: AlertRule = {
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

  async createNotificationChannel(data: {
    userId: string;
    teamId?: string;
    type: NotificationChannel['type'];
    config: Record<string, any>;
    preferences?: Partial<NotificationChannel['preferences']>;
  }): Promise<NotificationChannel> {
    const channelId = crypto.randomUUID();

    const channel: NotificationChannel = {
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

    // Test the notification channel
    await this.testNotificationChannel(channelId);

    return channel;
  }

  async processDocumentChange(changeEvent: DocumentChangeDetected): Promise<void> {
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

  async processMonitoringError(alert: MonitoringAlert): Promise<void> {
    logger.info('Processing monitoring error alert', {
      documentId: alert.documentId,
      severity: alert.severity,
      alertType: alert.alertType,
    });

    // Create alert instance for monitoring errors
    const alertInstance: AlertInstance = {
      id: crypto.randomUUID(),
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

  private async evaluateAlertConditions(
    rule: AlertRule,
    changeEvent: DocumentChangeDetected
  ): Promise<boolean> {
    // Check if rule is in cooldown period
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

    // Evaluate all conditions (AND logic)
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

  private async evaluateCondition(
    condition: AlertCondition,
    changeEvent: DocumentChangeDetected
  ): Promise<boolean> {
    let value: any;

    // Extract value based on condition type
    switch (condition.type) {
      case 'change_type':
        value = changeEvent.changeType;
        break;
      case 'risk_change':
        value = changeEvent.riskChange;
        break;
      case 'document_type':
        // This would require additional context about the document
        value = 'terms_of_service'; // Default assumption
        break;
      case 'keyword_match':
        value = changeEvent.changeSummary || '';
        break;
      default:
        logger.warn('Unknown condition type', { type: condition.type });
        return false;
    }

    // Apply operator
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

  private async triggerAlert(rule: AlertRule, changeEvent: DocumentChangeDetected): Promise<void> {
    logger.info('Triggering alert', {
      ruleId: rule.id,
      ruleName: rule.name,
      documentId: changeEvent.documentId,
    });

    // Determine alert severity based on change
    const severity = this.determineSeverity(changeEvent);

    // Create alert instance
    const alertInstance: AlertInstance = {
      id: crypto.randomUUID(),
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

    // Update rule statistics
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

    // Execute alert actions
    await this.executeAlertActions(rule, alertInstance);

    // Send notifications
    await this.sendNotifications(alertInstance);
  }

  private determineSeverity(changeEvent: DocumentChangeDetected): 'low' | 'medium' | 'high' | 'critical' {
    const riskChange = Math.abs(changeEvent.riskChange || 0);
    
    if (changeEvent.changeType === 'structural' || riskChange >= 50) {
      return 'critical';
    } else if (changeEvent.changeType === 'major' || riskChange >= 25) {
      return 'high';
    } else if (riskChange >= 10) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private generateAlertTitle(rule: AlertRule, changeEvent: DocumentChangeDetected): string {
    return `${rule.name}: Document Change Detected`;
  }

  private generateAlertDescription(rule: AlertRule, changeEvent: DocumentChangeDetected): string {
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

  private async createAlertInstance(alertInstance: AlertInstance): Promise<void> {
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

  private async executeAlertActions(rule: AlertRule, alertInstance: AlertInstance): Promise<void> {
    for (const action of rule.actions) {
      try {
        await this.executeAlertAction(action, alertInstance);
      } catch (error) {
        logger.error('Failed to execute alert action', {
          ruleId: rule.id,
          alertId: alertInstance.id,
          actionType: action.type,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async executeAlertAction(action: AlertAction, alertInstance: AlertInstance): Promise<void> {
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

  private async executeWebhookAction(action: AlertAction, alertInstance: AlertInstance): Promise<void> {
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

    await axios.post(webhookUrl, payload, {
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

  private async executeSlackAction(action: AlertAction, alertInstance: AlertInstance): Promise<void> {
    const webhookUrl = action.config.webhookUrl || config.external.slack.webhookUrl;
    
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

    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    logger.info('Slack action executed', {
      alertId: alertInstance.id,
    });
  }

  private async executeTeamsAction(action: AlertAction, alertInstance: AlertInstance): Promise<void> {
    const webhookUrl = action.config.webhookUrl || config.external.teams.webhookUrl;
    
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

    await axios.post(webhookUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    logger.info('Teams action executed', {
      alertId: alertInstance.id,
    });
  }

  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical': return '#ff0000';
      case 'high': return '#ff8c00';
      case 'medium': return '#ffd700';
      case 'low': return '#00ff00';
      default: return '#808080';
    }
  }

  private async sendNotifications(alertInstance: AlertInstance): Promise<void> {
    const relevantChannels = this.getRelevantNotificationChannels(
      alertInstance.userId,
      alertInstance.teamId,
      alertInstance.severity
    );

    for (const channel of relevantChannels) {
      try {
        await this.sendNotification(channel, alertInstance);
      } catch (error) {
        logger.error('Failed to send notification', {
          channelId: channel.id,
          alertId: alertInstance.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  private async sendNotification(
    channel: NotificationChannel,
    alertInstance: AlertInstance
  ): Promise<void> {
    // Check quiet hours
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

  private async sendEmailNotification(
    channel: NotificationChannel,
    alertInstance: AlertInstance
  ): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not configured');
    }

    const emailContent = this.generateEmailContent(alertInstance);

    await this.emailTransporter.sendMail({
      from: config.external.sendgrid.from,
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

  private async sendPushNotification(
    channel: NotificationChannel,
    alertInstance: AlertInstance
  ): Promise<void> {
    // Implementation would depend on your push notification service
    // This is a placeholder for push notification logic
    logger.info('Push notification sent', {
      channelId: channel.id,
      alertId: alertInstance.id,
    });
  }

  private generateEmailContent(alertInstance: AlertInstance): { html: string; text: string } {
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

  private isInQuietHours(quietHours: NonNullable<NotificationChannel['preferences']['quietHours']>): boolean {
    const now = new Date();
    const userTime = new Date(now.toLocaleString('en-US', { timeZone: quietHours.timezone }));
    const currentTime = userTime.getHours() * 60 + userTime.getMinutes();
    
    const [startHour, startMin] = quietHours.start.split(':').map(Number);
    const [endHour, endMin] = quietHours.end.split(':').map(Number);
    
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    } else {
      // Quiet hours span midnight
      return currentTime >= startTime || currentTime <= endTime;
    }
  }

  private getRelevantAlertRules(userId: string, teamId?: string): AlertRule[] {
    return Array.from(this.alertRules.values()).filter(rule => {
      if (!rule.isActive) return false;
      return rule.userId === userId || (teamId && rule.teamId === teamId);
    });
  }

  private getRelevantNotificationChannels(
    userId: string,
    teamId: string | undefined,
    severity: AlertInstance['severity']
  ): NotificationChannel[] {
    return Array.from(this.notificationChannels.values()).filter(channel => {
      if (!channel.isActive) return false;
      if (!channel.preferences.severities.includes(severity)) return false;
      return channel.userId === userId || (teamId && channel.teamId === teamId);
    });
  }

  async testNotificationChannel(channelId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const channel = this.notificationChannels.get(channelId);
    if (!channel) {
      throw new Error(`Notification channel not found: ${channelId}`);
    }

    const testAlert: AlertInstance = {
      id: 'test-' + crypto.randomUUID(),
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
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async loadAlertRules(): Promise<void> {
    const rules = await this.prisma.alertRule.findMany({
      where: { isActive: true },
    });

    for (const rule of rules) {
      this.alertRules.set(rule.id, {
        id: rule.id,
        userId: rule.userId,
        teamId: rule.teamId || undefined,
        name: rule.name,
        conditions: rule.conditions as AlertCondition[],
        actions: rule.actions as AlertAction[],
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

  private async loadNotificationChannels(): Promise<void> {
    const channels = await this.prisma.notificationChannel.findMany({
      where: { isActive: true },
    });

    for (const channel of channels) {
      this.notificationChannels.set(channel.id, {
        id: channel.id,
        userId: channel.userId,
        teamId: channel.teamId || undefined,
        type: channel.type as NotificationChannel['type'],
        config: channel.config as Record<string, any>,
        isActive: channel.isActive,
        preferences: channel.preferences as NotificationChannel['preferences'],
      });
    }

    logger.info('Loaded notification channels from database', {
      channelCount: channels.length,
    });
  }

  private async loadActiveAlerts(): Promise<void> {
    const alerts = await this.prisma.alertInstance.findMany({
      where: {
        resolvedAt: null,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
        },
      },
    });

    for (const alert of alerts) {
      this.activeAlerts.set(alert.id, {
        id: alert.id,
        ruleId: alert.ruleId,
        severity: alert.severity as AlertInstance['severity'],
        title: alert.title,
        description: alert.description,
        documentId: alert.documentId,
        userId: alert.userId,
        teamId: alert.teamId || undefined,
        metadata: alert.metadata as Record<string, any>,
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

  async getAlertStats(): Promise<{
    totalRules: number;
    activeRules: number;
    totalChannels: number;
    activeAlerts: number;
    alertsByseverity: Record<string, number>;
  }> {
    const activeRules = Array.from(this.alertRules.values()).filter(r => r.isActive);
    const alertsByStatus = Array.from(this.activeAlerts.values()).reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRules: this.alertRules.size,
      activeRules: activeRules.length,
      totalChannels: this.notificationChannels.size,
      activeAlerts: this.activeAlerts.size,
      alertsByStatus,
    };
  }

  async healthCheck(): Promise<void> {
    if (!this.initialized) {
      throw new Error('Alerting service not initialized');
    }

    // Test database connection
    await this.prisma.$queryRaw`SELECT 1`;

    // Test email transporter if configured
    if (this.emailTransporter) {
      try {
        await this.emailTransporter.verify();
      } catch (error) {
        logger.warn('Email transporter verification failed', { error });
      }
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down alerting service...');
    
    await this.prisma.$disconnect();
    this.alertRules.clear();
    this.notificationChannels.clear();
    this.activeAlerts.clear();
    this.initialized = false;
    
    logger.info('Alerting service shutdown complete');
  }
}

export const alertingService = new AlertingService();