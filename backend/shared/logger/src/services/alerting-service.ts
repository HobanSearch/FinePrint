/**
 * Comprehensive AlertingService for Fine Print AI
 * Provides configurable alerts, notifications, and escalation management
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import nodemailer from 'nodemailer';
import {
  AlertRule,
  AlertCondition,
  AlertSeverity,
  AlertChannel,
  AlertData,
  LogEntry,
  MetricData,
  AnomalyDetection,
  ServiceType,
  Environment,
  BusinessInsight,
} from '../types';
import { LoggerService } from './logger-service';
import { MetricsService } from './metrics-service';

interface AlertingConfig {
  serviceName: string;
  environment: Environment;
  enableEmailAlerts: boolean;
  enableSlackAlerts: boolean;
  enableWebhookAlerts: boolean;
  enableSMSAlerts: boolean;
  enablePagerDutyAlerts: boolean;
  defaultEmailFrom: string;
  smtpConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
  slackWebhookUrl?: string;
  pagerDutyApiKey?: string;
  twilioConfig?: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
  };
  maxAlertsPerHour: number;
  escalationDelayMinutes: number;
  alertRetentionDays: number;
}

interface ActiveAlert {
  id: string;
  ruleId: string;
  data: AlertData;
  escalationLevel: number;
  nextEscalationTime?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  suppressedUntil?: Date;
  notificationsSent: Array<{
    channel: AlertChannel;
    sentAt: Date;
    success: boolean;
    error?: string;
  }>;
}

interface AlertStatistics {
  totalAlerts: number;
  alertsBySeverity: Record<AlertSeverity, number>;
  alertsByRule: Record<string, number>;
  meanTimeToAcknowledge: number;
  meanTimeToResolve: number;
  falsePositiveRate: number;
  escalationRate: number;
  notificationSuccessRate: number;
}

interface EscalationPolicy {
  id: string;
  name: string;
  rules: Array<{
    level: number;
    delay: number; // minutes
    channels: AlertChannel[];
    conditions?: {
      severity?: AlertSeverity[];
      tags?: string[];
      timeOfDay?: { start: string; end: string };
      dayOfWeek?: number[];
    };
  }>;
}

export class AlertingService extends EventEmitter {
  private config: AlertingConfig;
  private logger?: LoggerService;
  private metricsService?: MetricsService;
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, ActiveAlert> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private alertHistory: AlertData[] = [];
  private alertThrottleMap: Map<string, Date> = new Map();
  private emailTransporter?: nodemailer.Transporter;
  private escalationCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(config: AlertingConfig) {
    super();
    this.config = config;
    this.setupDefaultRules();
    this.setupDefaultEscalationPolicies();
  }

  /**
   * Initialize the alerting service
   */
  async initialize(logger?: LoggerService, metricsService?: MetricsService): Promise<void> {
    this.logger = logger;
    this.metricsService = metricsService;

    try {
      // Initialize email transport
      if (this.config.enableEmailAlerts && this.config.smtpConfig) {
        await this.initializeEmailTransport();
      }

      // Setup intervals
      this.setupEscalationChecking();
      this.setupCleanup();

      this.initialized = true;

      this.logger?.info('Alerting service initialized', {
        service: 'alerting-service' as ServiceType,
        environment: this.config.environment,
        enabledChannels: {
          email: this.config.enableEmailAlerts,
          slack: this.config.enableSlackAlerts,
          webhook: this.config.enableWebhookAlerts,
          sms: this.config.enableSMSAlerts,
          pagerduty: this.config.enablePagerDutyAlerts,
        },
      });

      this.emit('initialized');
    } catch (error) {
      this.logger?.error('Failed to initialize alerting service', {
        service: 'alerting-service' as ServiceType,
        environment: this.config.environment,
      }, error as Error);

      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Add an alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    
    this.logger?.debug('Alert rule added', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
    });

    this.emit('rule-added', rule);
  }

  /**
   * Remove an alert rule
   */
  removeAlertRule(ruleId: string): void {
    this.alertRules.delete(ruleId);
    
    this.logger?.debug('Alert rule removed', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      ruleId,
    });

    this.emit('rule-removed', { ruleId });
  }

  /**
   * Update an alert rule
   */
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>): void {
    const existingRule = this.alertRules.get(ruleId);
    if (!existingRule) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    const updatedRule = { ...existingRule, ...updates };
    this.alertRules.set(ruleId, updatedRule);

    this.logger?.debug('Alert rule updated', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      ruleId,
      updates: Object.keys(updates),
    });

    this.emit('rule-updated', updatedRule);
  }

  /**
   * Get all alert rules
   */
  getAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }

  /**
   * Process a log entry for alerts
   */
  processLogEntry(logEntry: LogEntry): void {
    if (!this.initialized) return;

    this.alertRules.forEach((rule, ruleId) => {
      if (!rule.enabled) return;

      if (this.evaluateLogCondition(rule.condition, logEntry)) {
        this.triggerAlert(rule, {
          value: 1,
          threshold: 1,
          context: logEntry.context,
          sourceData: logEntry,
        });
      }
    });
  }

  /**
   * Process a metric for alerts
   */
  processMetric(metricData: MetricData): void {
    if (!this.initialized) return;

    this.alertRules.forEach((rule, ruleId) => {
      if (!rule.enabled) return;

      if (this.evaluateMetricCondition(rule.condition, metricData)) {
        this.triggerAlert(rule, {
          value: metricData.value,
          threshold: rule.condition.threshold as number,
          context: metricData.context,
          sourceData: metricData,
        });
      }
    });
  }

  /**
   * Process an anomaly for alerts
   */
  processAnomaly(anomaly: AnomalyDetection): void {
    if (!this.initialized) return;

    // Find rules that apply to anomalies
    this.alertRules.forEach((rule, ruleId) => {
      if (!rule.enabled) return;
      
      if (rule.condition.metric === anomaly.metric || rule.condition.metric === 'anomaly_detected') {
        this.triggerAlert(rule, {
          value: anomaly.currentValue,
          threshold: anomaly.baseline,
          context: anomaly.context,
          sourceData: anomaly,
        });
      }
    });
  }

  /**
   * Process a business insight for alerts
   */
  processBusinessInsight(insight: BusinessInsight): void {
    if (!this.initialized) return;

    // Create alert for high-impact insights
    if (insight.impact === 'high' || insight.impact === 'critical') {
      const rule: AlertRule = {
        id: `insight-${insight.type}`,
        name: `Business Insight: ${insight.type}`,
        description: 'Automatically generated rule for business insights',
        condition: {
          metric: 'business_insight',
          operator: '==',
          threshold: insight.type,
          timeWindow: 0,
          evaluationInterval: 0,
        },
        severity: insight.impact === 'critical' ? 'critical' : 'error',
        channels: this.getDefaultChannelsForSeverity(insight.impact === 'critical' ? 'critical' : 'error'),
        throttle: 30, // 30 minutes
        enabled: true,
        tags: ['business', insight.type],
      };

      this.triggerAlert(rule, {
        value: insight.confidence,
        threshold: 0.5,
        context: {
          service: 'analytics-service' as ServiceType,
          environment: this.config.environment,
          requestId: uuidv4(),
        },
        sourceData: insight,
      });
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): void {
    const activeAlert = this.activeAlerts.get(alertId);
    if (!activeAlert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    activeAlert.acknowledgedBy = acknowledgedBy;
    activeAlert.acknowledgedAt = new Date();

    this.logger?.info('Alert acknowledged', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      alertId,
      acknowledgedBy,
    });

    this.emit('alert-acknowledged', {
      alertId,
      acknowledgedBy,
      acknowledgedAt: activeAlert.acknowledgedAt,
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolvedBy: string): void {
    const activeAlert = this.activeAlerts.get(alertId);
    if (!activeAlert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    activeAlert.resolvedAt = new Date();
    activeAlert.data.resolved = true;
    activeAlert.data.resolvedAt = activeAlert.resolvedAt;

    // Move to history
    this.alertHistory.push(activeAlert.data);
    this.activeAlerts.delete(alertId);

    this.logger?.info('Alert resolved', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      alertId,
      resolvedBy,
    });

    this.emit('alert-resolved', {
      alertId,
      resolvedBy,
      resolvedAt: activeAlert.resolvedAt,
    });
  }

  /**
   * Suppress an alert for a duration
   */
  suppressAlert(alertId: string, durationMinutes: number): void {
    const activeAlert = this.activeAlerts.get(alertId);
    if (!activeAlert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    activeAlert.suppressedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);

    this.logger?.info('Alert suppressed', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      alertId,
      suppressedUntil: activeAlert.suppressedUntil,
    });

    this.emit('alert-suppressed', {
      alertId,
      suppressedUntil: activeAlert.suppressedUntil,
    });
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): ActiveAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): AlertStatistics {
    const allAlerts = [...this.alertHistory, ...Array.from(this.activeAlerts.values()).map(a => a.data)];
    
    const stats: AlertStatistics = {
      totalAlerts: allAlerts.length,
      alertsBySeverity: {
        info: 0,
        warning: 0,
        error: 0,
        critical: 0,
      },
      alertsByRule: {},
      meanTimeToAcknowledge: 0,
      meanTimeToResolve: 0,
      falsePositiveRate: 0,
      escalationRate: 0,
      notificationSuccessRate: 0,
    };

    let totalAckTime = 0;
    let totalResolveTime = 0;
    let acknowledgedCount = 0;
    let resolvedCount = 0;
    let escalatedCount = 0;
    let successfulNotifications = 0;
    let totalNotifications = 0;

    allAlerts.forEach(alert => {
      stats.alertsBySeverity[alert.severity]++;
      stats.alertsByRule[alert.ruleId] = (stats.alertsByRule[alert.ruleId] || 0) + 1;

      const activeAlert = this.activeAlerts.get(alert.id);
      if (activeAlert) {
        if (activeAlert.acknowledgedAt) {
          acknowledgedCount++;
          totalAckTime += activeAlert.acknowledgedAt.getTime() - alert.timestamp.getTime();
        }
        
        if (activeAlert.resolvedAt) {
          resolvedCount++;
          totalResolveTime += activeAlert.resolvedAt.getTime() - alert.timestamp.getTime();
        }

        if (activeAlert.escalationLevel > 0) {
          escalatedCount++;
        }

        activeAlert.notificationsSent.forEach(notification => {
          totalNotifications++;
          if (notification.success) {
            successfulNotifications++;
          }
        });
      }
    });

    if (acknowledgedCount > 0) {
      stats.meanTimeToAcknowledge = totalAckTime / acknowledgedCount / (1000 * 60); // minutes
    }

    if (resolvedCount > 0) {
      stats.meanTimeToResolve = totalResolveTime / resolvedCount / (1000 * 60); // minutes
    }

    stats.escalationRate = allAlerts.length > 0 ? escalatedCount / allAlerts.length : 0;
    stats.notificationSuccessRate = totalNotifications > 0 ? successfulNotifications / totalNotifications : 0;

    return stats;
  }

  /**
   * Trigger an alert
   */
  private triggerAlert(
    rule: AlertRule,
    details: {
      value: number | string;
      threshold: number | string;
      context: any;
      sourceData: any;
    }
  ): void {
    // Check throttling
    const throttleKey = `${rule.id}:${JSON.stringify(details.context)}`;
    const lastAlert = this.alertThrottleMap.get(throttleKey);
    const now = new Date();

    if (lastAlert && (now.getTime() - lastAlert.getTime()) < (rule.throttle * 60 * 1000)) {
      return; // Throttled
    }

    this.alertThrottleMap.set(throttleKey, now);

    // Create alert data
    const alertData: AlertData = {
      id: uuidv4(),
      ruleId: rule.id,
      severity: rule.severity,
      title: this.generateAlertTitle(rule, details),
      description: this.generateAlertDescription(rule, details),
      timestamp: now,
      context: details.context,
      value: details.value,
      threshold: details.threshold,
      resolved: false,
    };

    // Create active alert
    const activeAlert: ActiveAlert = {
      id: alertData.id,
      ruleId: rule.id,
      data: alertData,
      escalationLevel: 0,
      notificationsSent: [],
    };

    this.activeAlerts.set(alertData.id, activeAlert);

    // Send notifications
    this.sendNotifications(rule, alertData);

    // Setup escalation if needed
    this.setupEscalation(activeAlert, rule);

    this.logger?.warn('Alert triggered', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      alertId: alertData.id,
      ruleId: rule.id,
      severity: alertData.severity,
      title: alertData.title,
    });

    this.emit('alert-triggered', alertData);
  }

  /**
   * Send notifications for an alert
   */
  private async sendNotifications(rule: AlertRule, alertData: AlertData): Promise<void> {
    const activeAlert = this.activeAlerts.get(alertData.id);
    if (!activeAlert) return;

    for (const channel of rule.channels) {
      try {
        let success = false;
        let error: string | undefined;

        switch (channel.type) {
          case 'email':
            success = await this.sendEmailNotification(channel, alertData);
            break;
          case 'slack':
            success = await this.sendSlackNotification(channel, alertData);
            break;
          case 'webhook':
            success = await this.sendWebhookNotification(channel, alertData);
            break;
          case 'sms':
            success = await this.sendSMSNotification(channel, alertData);
            break;
          case 'pagerduty':
            success = await this.sendPagerDutyNotification(channel, alertData);
            break;
        }

        activeAlert.notificationsSent.push({
          channel,
          sentAt: new Date(),
          success,
          error,
        });

        if (success) {
          this.logger?.debug('Notification sent successfully', {
            service: 'alerting-service' as ServiceType,
            environment: this.config.environment,
            alertId: alertData.id,
            channelType: channel.type,
          });
        }

      } catch (notificationError) {
        const error = notificationError as Error;
        activeAlert.notificationsSent.push({
          channel,
          sentAt: new Date(),
          success: false,
          error: error.message,
        });

        this.logger?.error('Failed to send notification', {
          service: 'alerting-service' as ServiceType,
          environment: this.config.environment,
          alertId: alertData.id,
          channelType: channel.type,
        }, error);
      }
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(channel: AlertChannel, alertData: AlertData): Promise<boolean> {
    if (!this.config.enableEmailAlerts || !this.emailTransporter) {
      return false;
    }

    const mailOptions = {
      from: this.config.defaultEmailFrom,
      to: channel.config.to,
      subject: `[${alertData.severity.toUpperCase()}] ${alertData.title}`,
      html: this.generateEmailTemplate(alertData),
    };

    await this.emailTransporter.sendMail(mailOptions);
    return true;
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(channel: AlertChannel, alertData: AlertData): Promise<boolean> {
    if (!this.config.enableSlackAlerts || !this.config.slackWebhookUrl) {
      return false;
    }

    const payload = {
      text: `Alert: ${alertData.title}`,
      attachments: [
        {
          color: this.getSlackColor(alertData.severity),
          fields: [
            { title: 'Severity', value: alertData.severity.toUpperCase(), short: true },
            { title: 'Service', value: alertData.context.service, short: true },
            { title: 'Description', value: alertData.description, short: false },
            { title: 'Value', value: String(alertData.value), short: true },
            { title: 'Threshold', value: String(alertData.threshold), short: true },
          ],
          ts: Math.floor(alertData.timestamp.getTime() / 1000),
        },
      ],
    };

    const response = await fetch(this.config.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.ok;
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(channel: AlertChannel, alertData: AlertData): Promise<boolean> {
    if (!this.config.enableWebhookAlerts) {
      return false;
    }

    const payload = {
      alert: alertData,
      timestamp: new Date().toISOString(),
      service: this.config.serviceName,
      environment: this.config.environment,
    };

    const response = await fetch(channel.config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(channel.config.headers || {}),
      },
      body: JSON.stringify(payload),
    });

    return response.ok;
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(channel: AlertChannel, alertData: AlertData): Promise<boolean> {
    if (!this.config.enableSMSAlerts || !this.config.twilioConfig) {
      return false;
    }

    // This would integrate with Twilio or another SMS service
    // Placeholder implementation
    return true;
  }

  /**
   * Send PagerDuty notification
   */
  private async sendPagerDutyNotification(channel: AlertChannel, alertData: AlertData): Promise<boolean> {
    if (!this.config.enablePagerDutyAlerts || !this.config.pagerDutyApiKey) {
      return false;
    }

    // This would integrate with PagerDuty API
    // Placeholder implementation
    return true;
  }

  /**
   * Setup escalation for an alert
   */
  private setupEscalation(activeAlert: ActiveAlert, rule: AlertRule): void {
    // Find appropriate escalation policy
    const escalationPolicy = this.findEscalationPolicy(rule);
    if (!escalationPolicy) return;

    const firstLevel = escalationPolicy.rules.find(r => r.level === 1);
    if (firstLevel) {
      activeAlert.nextEscalationTime = new Date(Date.now() + firstLevel.delay * 60 * 1000);
    }
  }

  /**
   * Find escalation policy for a rule
   */
  private findEscalationPolicy(rule: AlertRule): EscalationPolicy | undefined {
    // For now, return the default escalation policy
    return this.escalationPolicies.get('default');
  }

  /**
   * Check for escalations
   */
  private checkEscalations(): void {
    const now = new Date();

    this.activeAlerts.forEach((activeAlert, alertId) => {
      if (activeAlert.acknowledgedAt || activeAlert.resolvedAt) {
        return; // Don't escalate acknowledged or resolved alerts
      }

      if (activeAlert.suppressedUntil && now < activeAlert.suppressedUntil) {
        return; // Don't escalate suppressed alerts
      }

      if (activeAlert.nextEscalationTime && now >= activeAlert.nextEscalationTime) {
        this.escalateAlert(activeAlert);
      }
    });
  }

  /**
   * Escalate an alert
   */
  private escalateAlert(activeAlert: ActiveAlert): void {
    const rule = this.alertRules.get(activeAlert.ruleId);
    if (!rule) return;

    const escalationPolicy = this.findEscalationPolicy(rule);
    if (!escalationPolicy) return;

    activeAlert.escalationLevel++;
    const nextLevel = escalationPolicy.rules.find(r => r.level === activeAlert.escalationLevel + 1);
    
    if (nextLevel) {
      activeAlert.nextEscalationTime = new Date(Date.now() + nextLevel.delay * 60 * 1000);
      
      // Send escalation notifications
      nextLevel.channels.forEach(async (channel) => {
        try {
          await this.sendEscalationNotification(channel, activeAlert.data, activeAlert.escalationLevel);
        } catch (error) {
          this.logger?.error('Failed to send escalation notification', {
            service: 'alerting-service' as ServiceType,
            environment: this.config.environment,
            alertId: activeAlert.id,
            escalationLevel: activeAlert.escalationLevel,
          }, error as Error);
        }
      });
    }

    this.logger?.warn('Alert escalated', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      alertId: activeAlert.id,
      escalationLevel: activeAlert.escalationLevel,
    });

    this.emit('alert-escalated', {
      alertId: activeAlert.id,
      escalationLevel: activeAlert.escalationLevel,
    });
  }

  /**
   * Send escalation notification
   */
  private async sendEscalationNotification(
    channel: AlertChannel,
    alertData: AlertData,
    escalationLevel: number
  ): Promise<void> {
    const escalatedAlert = {
      ...alertData,
      title: `[ESCALATED L${escalationLevel}] ${alertData.title}`,
      description: `This alert has been escalated to level ${escalationLevel}.\n\n${alertData.description}`,
    };

    switch (channel.type) {
      case 'email':
        await this.sendEmailNotification(channel, escalatedAlert);
        break;
      case 'slack':
        await this.sendSlackNotification(channel, escalatedAlert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(channel, escalatedAlert);
        break;
      case 'sms':
        await this.sendSMSNotification(channel, escalatedAlert);
        break;
      case 'pagerduty':
        await this.sendPagerDutyNotification(channel, escalatedAlert);
        break;
    }
  }

  /**
   * Evaluate log condition
   */
  private evaluateLogCondition(condition: AlertCondition, logEntry: LogEntry): boolean {
    const { operator, threshold } = condition;
    
    // For log entries, we typically check message content or log level
    if (typeof threshold === 'string') {
      const value = logEntry.message.toLowerCase();
      const thresholdStr = threshold.toLowerCase();
      
      switch (operator) {
        case '==':
          return value === thresholdStr;
        case '!=':
          return value !== thresholdStr;
        case 'contains':
          return value.includes(thresholdStr);
        case 'regex':
          return new RegExp(thresholdStr).test(value);
        default:
          return false;
      }
    }
    
    return false;
  }

  /**
   * Evaluate metric condition
   */
  private evaluateMetricCondition(condition: AlertCondition, metricData: MetricData): boolean {
    if (condition.metric !== metricData.name && condition.metric !== 'any') {
      return false;
    }

    const { operator, threshold } = condition;
    const value = metricData.value;
    
    if (typeof threshold === 'number') {
      switch (operator) {
        case '>':
          return value > threshold;
        case '<':
          return value < threshold;
        case '>=':
          return value >= threshold;
        case '<=':
          return value <= threshold;
        case '==':
          return value === threshold;
        case '!=':
          return value !== threshold;
        default:
          return false;
      }
    }

    return false;
  }

  /**
   * Generate alert title
   */
  private generateAlertTitle(
    rule: AlertRule,
    details: { value: number | string; threshold: number | string; context: any }
  ): string {
    return `${rule.name}: ${details.value} ${rule.condition.operator} ${details.threshold}`;
  }

  /**
   * Generate alert description
   */
  private generateAlertDescription(
    rule: AlertRule,
    details: { value: number | string; threshold: number | string; context: any }
  ): string {
    return `${rule.description}\n\nCurrent value: ${details.value}\nThreshold: ${details.threshold}\nService: ${details.context.service}`;
  }

  /**
   * Generate email template
   */
  private generateEmailTemplate(alertData: AlertData): string {
    return `
      <h2>Alert: ${alertData.title}</h2>
      <p><strong>Severity:</strong> ${alertData.severity.toUpperCase()}</p>
      <p><strong>Service:</strong> ${alertData.context.service}</p>
      <p><strong>Time:</strong> ${alertData.timestamp.toISOString()}</p>
      <p><strong>Description:</strong></p>
      <p>${alertData.description}</p>
      <p><strong>Current Value:</strong> ${alertData.value}</p>
      <p><strong>Threshold:</strong> ${alertData.threshold}</p>
      <hr>
      <p><small>Generated by Fine Print AI Alerting Service</small></p>
    `;
  }

  /**
   * Get Slack color for severity
   */
  private getSlackColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'error':
        return 'warning';
      case 'warning':
        return 'warning';
      default:
        return 'good';
    }
  }

  /**
   * Get default channels for severity
   */
  private getDefaultChannelsForSeverity(severity: AlertSeverity): AlertChannel[] {
    const channels: AlertChannel[] = [];

    if (this.config.enableEmailAlerts) {
      channels.push({
        type: 'email',
        config: { to: 'ops@fineprintai.com' },
      });
    }

    if (this.config.enableSlackAlerts && (severity === 'error' || severity === 'critical')) {
      channels.push({
        type: 'slack',
        config: {},
      });
    }

    if (this.config.enablePagerDutyAlerts && severity === 'critical') {
      channels.push({
        type: 'pagerduty',
        config: {},
      });
    }

    return channels;
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'high-error-rate',
        name: 'High Error Rate',
        description: 'Error rate exceeds 5%',
        condition: {
          metric: 'error_rate',
          operator: '>',
          threshold: 0.05,
          timeWindow: 5,
          evaluationInterval: 60,
        },
        severity: 'error',
        channels: this.getDefaultChannelsForSeverity('error'),
        throttle: 30,
        enabled: true,
        tags: ['errors', 'performance'],
      },
      {
        id: 'critical-service-down',
        name: 'Critical Service Down',
        description: 'Critical service is not responding',
        condition: {
          metric: 'service_availability',
          operator: '<',
          threshold: 0.95,
          timeWindow: 2,
          evaluationInterval: 30,
        },
        severity: 'critical',
        channels: this.getDefaultChannelsForSeverity('critical'),
        throttle: 15,
        enabled: true,
        tags: ['availability', 'critical'],
      },
      {
        id: 'high-response-time',
        name: 'High Response Time',
        description: 'API response time exceeds 5 seconds',
        condition: {
          metric: 'response_time_p95',
          operator: '>',
          threshold: 5000,
          timeWindow: 10,
          evaluationInterval: 60,
        },
        severity: 'warning',
        channels: this.getDefaultChannelsForSeverity('warning'),
        throttle: 60,
        enabled: true,
        tags: ['performance', 'latency'],
      },
    ];

    defaultRules.forEach(rule => {
      this.addAlertRule(rule);
    });
  }

  /**
   * Setup default escalation policies
   */
  private setupDefaultEscalationPolicies(): void {
    const defaultPolicy: EscalationPolicy = {
      id: 'default',
      name: 'Default Escalation Policy',
      rules: [
        {
          level: 1,
          delay: 15, // 15 minutes
          channels: this.getDefaultChannelsForSeverity('warning'),
        },
        {
          level: 2,
          delay: 30, // 30 minutes after level 1
          channels: this.getDefaultChannelsForSeverity('error'),
        },
        {
          level: 3,
          delay: 60, // 60 minutes after level 2
          channels: this.getDefaultChannelsForSeverity('critical'),
        },
      ],
    };

    this.escalationPolicies.set(defaultPolicy.id, defaultPolicy);
  }

  /**
   * Initialize email transport
   */
  private async initializeEmailTransport(): Promise<void> {
    if (!this.config.smtpConfig) return;

    this.emailTransporter = nodemailer.createTransporter(this.config.smtpConfig);
    
    // Verify connection
    await this.emailTransporter.verify();
    
    this.logger?.debug('Email transport initialized', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
      smtpHost: this.config.smtpConfig.host,
    });
  }

  /**
   * Setup escalation checking interval
   */
  private setupEscalationChecking(): void {
    this.escalationCheckInterval = setInterval(() => {
      this.checkEscalations();
    }, 60000); // Check every minute
  }

  /**
   * Setup cleanup interval
   */
  private setupCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldAlerts();
    }, 24 * 60 * 60 * 1000); // Daily cleanup
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const cutoffDate = new Date(Date.now() - this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    
    this.alertHistory = this.alertHistory.filter(alert => alert.timestamp > cutoffDate);
    
    // Cleanup throttle map
    this.alertThrottleMap.forEach((timestamp, key) => {
      if (timestamp < cutoffDate) {
        this.alertThrottleMap.delete(key);
      }
    });
  }

  /**
   * Shutdown alerting service
   */
  async shutdown(): Promise<void> {
    this.logger?.info('Alerting service shutting down', {
      service: 'alerting-service' as ServiceType,
      environment: this.config.environment,
    });

    // Clear intervals
    if (this.escalationCheckInterval) {
      clearInterval(this.escalationCheckInterval);
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Close email transporter
    if (this.emailTransporter) {
      this.emailTransporter.close();
    }

    this.emit('shutdown');
  }
}