import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { alertLogger as logger } from '../utils/logger';

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  source: string;
  service?: string;
  timestamp: Date;
  fingerprint: string; // For deduplication
  labels: Record<string, string>;
  annotations: Record<string, string>;
  status: 'firing' | 'resolved' | 'silenced';
  resolvedAt?: Date;
  silencedUntil?: Date;
  notificationsSent: NotificationRecord[];
  groupKey?: string; // For grouping related alerts
}

export interface NotificationRecord {
  channel: string;
  sentAt: Date;
  recipient: string;
  status: 'sent' | 'failed' | 'pending';
  error?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  query: string; // Prometheus query
  condition: 'above' | 'below' | 'equal' | 'not_equal';
  threshold: number;
  duration: number; // How long condition must be true
  severity: 'critical' | 'warning' | 'info';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  channels: string[]; // Notification channels
  enabled: boolean;
  lastEvaluation?: Date;
  lastFired?: Date;
}

export interface Silence {
  id: string;
  matchers: Array<{
    name: string;
    value: string;
    isRegex: boolean;
  }>;
  startsAt: Date;
  endsAt: Date;
  createdBy: string;
  comment: string;
}

export interface AlertGroup {
  groupKey: string;
  alerts: Alert[];
  labels: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Alerting Engine for Fine Print AI
 * Manages alert lifecycle, routing, and notifications
 */
export class AlertingEngine extends EventEmitter {
  private alerts: Map<string, Alert>;
  private rules: Map<string, AlertRule>;
  private silences: Map<string, Silence>;
  private alertGroups: Map<string, AlertGroup>;
  private deduplicationCache: Map<string, Date>;
  private notificationQueue: Alert[];
  private evaluationInterval?: NodeJS.Timeout;
  private processingInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.alerts = new Map();
    this.rules = new Map();
    this.silences = new Map();
    this.alertGroups = new Map();
    this.deduplicationCache = new Map();
    this.notificationQueue = [];
    
    this.initializeDefaultRules();
  }

  private initializeDefaultRules(): void {
    // High Error Rate Rule
    this.rules.set('high-error-rate', {
      id: 'high-error-rate',
      name: 'High Error Rate',
      query: 'sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))',
      condition: 'above',
      threshold: 0.01, // 1%
      duration: 300000, // 5 minutes
      severity: 'critical',
      labels: {
        team: 'platform',
        category: 'availability',
      },
      annotations: {
        summary: 'High error rate detected',
        description: 'Error rate is above 1% for more than 5 minutes',
        runbook: '/runbooks/high-error-rate',
      },
      channels: ['pagerduty', 'slack'],
      enabled: true,
    });

    // High Latency Rule
    this.rules.set('high-latency', {
      id: 'high-latency',
      name: 'High Latency',
      query: 'histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))',
      condition: 'above',
      threshold: 0.2, // 200ms
      duration: 300000, // 5 minutes
      severity: 'warning',
      labels: {
        team: 'platform',
        category: 'performance',
      },
      annotations: {
        summary: 'High latency detected',
        description: 'P95 latency is above 200ms for more than 5 minutes',
      },
      channels: ['slack'],
      enabled: true,
    });

    // Model Inference Failure Rule
    this.rules.set('model-inference-failure', {
      id: 'model-inference-failure',
      name: 'Model Inference Failure',
      query: 'sum(rate(model_inference_errors_total[5m])) / sum(rate(model_inference_latency_seconds_count[5m]))',
      condition: 'above',
      threshold: 0.05, // 5%
      duration: 180000, // 3 minutes
      severity: 'critical',
      labels: {
        team: 'ml',
        category: 'ai',
      },
      annotations: {
        summary: 'High model inference failure rate',
        description: 'Model inference error rate is above 5%',
        runbook: '/runbooks/model-inference-failure',
      },
      channels: ['pagerduty', 'slack'],
      enabled: true,
    });

    // Memory Usage Rule
    this.rules.set('high-memory-usage', {
      id: 'high-memory-usage',
      name: 'High Memory Usage',
      query: 'instance:node_memory_utilization:ratio',
      condition: 'above',
      threshold: 0.85, // 85%
      duration: 600000, // 10 minutes
      severity: 'warning',
      labels: {
        team: 'platform',
        category: 'resources',
      },
      annotations: {
        summary: 'High memory usage detected',
        description: 'Memory usage is above 85% for more than 10 minutes',
      },
      channels: ['slack'],
      enabled: true,
    });

    // Error Budget Burn Rate Rule
    this.rules.set('error-budget-burn-rate', {
      id: 'error-budget-burn-rate',
      name: 'High Error Budget Burn Rate',
      query: 'error_budget_burn_rate{window="1h"}',
      condition: 'above',
      threshold: 14.4, // 14.4x burn rate
      duration: 300000, // 5 minutes
      severity: 'critical',
      labels: {
        team: 'platform',
        category: 'slo',
      },
      annotations: {
        summary: 'Error budget burn rate is too high',
        description: 'Service is burning error budget at an unsustainable rate',
      },
      channels: ['pagerduty', 'slack'],
      enabled: true,
    });

    // Service Down Rule
    this.rules.set('service-down', {
      id: 'service-down',
      name: 'Service Down',
      query: 'up',
      condition: 'equal',
      threshold: 0,
      duration: 60000, // 1 minute
      severity: 'critical',
      labels: {
        team: 'platform',
        category: 'availability',
      },
      annotations: {
        summary: 'Service is down',
        description: 'Service health check is failing',
      },
      channels: ['pagerduty', 'slack', 'email'],
      enabled: true,
    });

    // Database Connection Pool Exhaustion
    this.rules.set('db-pool-exhaustion', {
      id: 'db-pool-exhaustion',
      name: 'Database Connection Pool Exhaustion',
      query: 'database_pool_connections{status="waiting"}',
      condition: 'above',
      threshold: 5,
      duration: 120000, // 2 minutes
      severity: 'warning',
      labels: {
        team: 'platform',
        category: 'database',
      },
      annotations: {
        summary: 'Database connection pool near exhaustion',
        description: 'More than 5 connections waiting for pool',
        runbook: '/runbooks/db-pool-exhaustion',
      },
      channels: ['slack'],
      enabled: true,
    });

    // Queue Depth Rule
    this.rules.set('high-queue-depth', {
      id: 'high-queue-depth',
      name: 'High Queue Depth',
      query: 'training_job_queue_size',
      condition: 'above',
      threshold: 100,
      duration: 900000, // 15 minutes
      severity: 'warning',
      labels: {
        team: 'ml',
        category: 'processing',
      },
      annotations: {
        summary: 'High queue depth detected',
        description: 'Training job queue has more than 100 pending jobs',
      },
      channels: ['slack'],
      enabled: true,
    });
  }

  async start(): Promise<void> {
    logger.info('Starting alerting engine');
    
    // Start rule evaluation
    this.evaluationInterval = setInterval(() => {
      this.evaluateRules();
    }, 30000); // Every 30 seconds
    
    // Start alert processing
    this.processingInterval = setInterval(() => {
      this.processAlerts();
    }, 10000); // Every 10 seconds
    
    this.emit('started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping alerting engine');
    
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    this.emit('stopped');
  }

  private async evaluateRules(): Promise<void> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      try {
        const shouldFire = await this.evaluateRule(rule);
        
        if (shouldFire) {
          await this.fireAlert(rule);
        }
        
        rule.lastEvaluation = new Date();
      } catch (error) {
        logger.error(`Failed to evaluate rule ${rule.id}`, error);
      }
    }
  }

  private async evaluateRule(rule: AlertRule): Promise<boolean> {
    // In production, this would query Prometheus
    // For now, simulate evaluation with random values
    const value = Math.random() * 0.02; // 0-2% for error rate rules
    
    switch (rule.condition) {
      case 'above':
        return value > rule.threshold;
      case 'below':
        return value < rule.threshold;
      case 'equal':
        return Math.abs(value - rule.threshold) < 0.001;
      case 'not_equal':
        return Math.abs(value - rule.threshold) >= 0.001;
      default:
        return false;
    }
  }

  private async fireAlert(rule: AlertRule): Promise<void> {
    const fingerprint = this.generateFingerprint(rule);
    
    // Check deduplication
    if (this.isDuplicate(fingerprint)) {
      return;
    }
    
    const alert: Alert = {
      id: uuidv4(),
      title: rule.name,
      description: rule.annotations.description || rule.name,
      severity: rule.severity,
      source: 'alerting-engine',
      timestamp: new Date(),
      fingerprint,
      labels: { ...rule.labels },
      annotations: { ...rule.annotations },
      status: 'firing',
      notificationsSent: [],
    };
    
    // Check if alert should be silenced
    if (this.isSilenced(alert)) {
      alert.status = 'silenced';
      logger.info(`Alert silenced: ${alert.title}`);
    } else {
      // Add to notification queue
      this.notificationQueue.push(alert);
    }
    
    // Store alert
    this.alerts.set(alert.id, alert);
    
    // Update deduplication cache
    this.deduplicationCache.set(fingerprint, new Date());
    
    // Group alert if applicable
    this.groupAlert(alert);
    
    rule.lastFired = new Date();
    
    this.emit('alert-fired', alert);
    logger.info(`Alert fired: ${alert.title}`, { alert });
  }

  private generateFingerprint(rule: AlertRule): string {
    // Generate unique fingerprint for deduplication
    const components = [
      rule.id,
      rule.query,
      String(rule.threshold),
      JSON.stringify(rule.labels),
    ];
    
    return components.join(':');
  }

  private isDuplicate(fingerprint: string): boolean {
    const lastSeen = this.deduplicationCache.get(fingerprint);
    if (!lastSeen) return false;
    
    const timeSinceLastSeen = Date.now() - lastSeen.getTime();
    return timeSinceLastSeen < config.alerting.deduplicationWindow;
  }

  private isSilenced(alert: Alert): boolean {
    const now = new Date();
    
    for (const silence of this.silences.values()) {
      if (silence.startsAt <= now && silence.endsAt >= now) {
        // Check if alert matches silence matchers
        const matches = silence.matchers.every(matcher => {
          const value = alert.labels[matcher.name] || alert.annotations[matcher.name];
          
          if (matcher.isRegex) {
            const regex = new RegExp(matcher.value);
            return regex.test(value || '');
          } else {
            return value === matcher.value;
          }
        });
        
        if (matches) {
          alert.silencedUntil = silence.endsAt;
          return true;
        }
      }
    }
    
    return false;
  }

  private groupAlert(alert: Alert): void {
    // Generate group key based on labels
    const groupingLabels = ['team', 'service', 'category'];
    const groupKey = groupingLabels
      .map(label => `${label}:${alert.labels[label] || 'unknown'}`)
      .join(',');
    
    alert.groupKey = groupKey;
    
    let group = this.alertGroups.get(groupKey);
    if (!group) {
      group = {
        groupKey,
        alerts: [],
        labels: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      // Extract common labels
      groupingLabels.forEach(label => {
        if (alert.labels[label]) {
          group!.labels[label] = alert.labels[label];
        }
      });
      
      this.alertGroups.set(groupKey, group);
    }
    
    group.alerts.push(alert);
    group.updatedAt = new Date();
    
    // Limit group size
    if (group.alerts.length > 100) {
      group.alerts.shift(); // Remove oldest
    }
  }

  async processAlerts(): Promise<void> {
    // Process notification queue
    while (this.notificationQueue.length > 0) {
      const alert = this.notificationQueue.shift()!;
      await this.sendNotifications(alert);
    }
    
    // Check for resolved alerts
    await this.checkResolvedAlerts();
    
    // Clean up old alerts
    this.cleanupOldAlerts();
  }

  private async sendNotifications(alert: Alert): Promise<void> {
    const channels = this.getNotificationChannels(alert);
    
    for (const channel of channels) {
      try {
        await this.sendToChannel(channel, alert);
        
        alert.notificationsSent.push({
          channel,
          sentAt: new Date(),
          recipient: this.getRecipient(channel, alert),
          status: 'sent',
        });
        
        logger.info(`Notification sent`, { 
          alert: alert.id, 
          channel,
          severity: alert.severity 
        });
      } catch (error) {
        logger.error(`Failed to send notification`, { 
          alert: alert.id, 
          channel, 
          error 
        });
        
        alert.notificationsSent.push({
          channel,
          sentAt: new Date(),
          recipient: this.getRecipient(channel, alert),
          status: 'failed',
          error: String(error),
        });
      }
    }
  }

  private getNotificationChannels(alert: Alert): string[] {
    // Determine channels based on severity and configuration
    const severityConfig = config.alerting.severityLevels[alert.severity];
    return severityConfig.notifyChannels;
  }

  private async sendToChannel(channel: string, alert: Alert): Promise<void> {
    switch (channel) {
      case 'pagerduty':
        await this.sendToPagerDuty(alert);
        break;
      case 'slack':
        await this.sendToSlack(alert);
        break;
      case 'email':
        await this.sendEmail(alert);
        break;
      case 'webhook':
        await this.sendWebhook(alert);
        break;
      default:
        logger.warn(`Unknown notification channel: ${channel}`);
    }
  }

  private async sendToPagerDuty(alert: Alert): Promise<void> {
    // In production, integrate with PagerDuty API
    logger.info('Sending to PagerDuty', { alert: alert.id });
  }

  private async sendToSlack(alert: Alert): Promise<void> {
    // In production, integrate with Slack API
    const message = {
      text: `🚨 *${alert.title}*`,
      attachments: [{
        color: alert.severity === 'critical' ? 'danger' : 
               alert.severity === 'warning' ? 'warning' : 'good',
        fields: [
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Service',
            value: alert.service || 'Unknown',
            short: true,
          },
          {
            title: 'Description',
            value: alert.description,
            short: false,
          },
        ],
        footer: 'Fine Print AI SRE',
        ts: Math.floor(alert.timestamp.getTime() / 1000),
      }],
    };
    
    logger.info('Sending to Slack', { alert: alert.id, message });
  }

  private async sendEmail(alert: Alert): Promise<void> {
    // In production, integrate with email service
    logger.info('Sending email', { alert: alert.id });
  }

  private async sendWebhook(alert: Alert): Promise<void> {
    // In production, send to configured webhook
    const payload = {
      alert: {
        id: alert.id,
        title: alert.title,
        description: alert.description,
        severity: alert.severity,
        timestamp: alert.timestamp,
        labels: alert.labels,
        annotations: alert.annotations,
      },
    };
    
    logger.info('Sending webhook', { alert: alert.id, payload });
  }

  private getRecipient(channel: string, alert: Alert): string {
    // Determine recipient based on channel and alert
    const team = alert.labels.team || 'platform';
    
    switch (channel) {
      case 'pagerduty':
        return `${team}-oncall`;
      case 'slack':
        return `#${team}-alerts`;
      case 'email':
        return `${team}@fineprint.ai`;
      default:
        return 'unknown';
    }
  }

  private async checkResolvedAlerts(): Promise<void> {
    for (const alert of this.alerts.values()) {
      if (alert.status === 'firing') {
        // Check if alert condition is still true
        const rule = Array.from(this.rules.values())
          .find(r => r.name === alert.title);
        
        if (rule) {
          const stillFiring = await this.evaluateRule(rule);
          
          if (!stillFiring) {
            alert.status = 'resolved';
            alert.resolvedAt = new Date();
            
            this.emit('alert-resolved', alert);
            logger.info(`Alert resolved: ${alert.title}`);
          }
        }
      }
    }
  }

  private cleanupOldAlerts(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.status === 'resolved' || alert.status === 'silenced') {
        const age = now - alert.timestamp.getTime();
        if (age > maxAge) {
          this.alerts.delete(id);
        }
      }
    }
    
    // Clean up deduplication cache
    for (const [fingerprint, timestamp] of this.deduplicationCache.entries()) {
      const age = now - timestamp.getTime();
      if (age > config.alerting.deduplicationWindow) {
        this.deduplicationCache.delete(fingerprint);
      }
    }
  }

  // Public methods
  async createAlert(params: {
    title: string;
    description: string;
    severity: 'critical' | 'warning' | 'info';
    source: string;
    service?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  }): Promise<Alert> {
    const alert: Alert = {
      id: uuidv4(),
      title: params.title,
      description: params.description,
      severity: params.severity,
      source: params.source,
      service: params.service,
      timestamp: new Date(),
      fingerprint: `manual:${params.title}:${Date.now()}`,
      labels: params.labels || {},
      annotations: params.annotations || {},
      status: 'firing',
      notificationsSent: [],
    };
    
    this.alerts.set(alert.id, alert);
    this.notificationQueue.push(alert);
    
    this.emit('alert-created', alert);
    
    return alert;
  }

  async createSilence(params: {
    matchers: Array<{
      name: string;
      value: string;
      isRegex: boolean;
    }>;
    duration: number; // in milliseconds
    comment: string;
    createdBy: string;
  }): Promise<Silence> {
    const now = new Date();
    const silence: Silence = {
      id: uuidv4(),
      matchers: params.matchers,
      startsAt: now,
      endsAt: new Date(now.getTime() + params.duration),
      createdBy: params.createdBy,
      comment: params.comment,
    };
    
    this.silences.set(silence.id, silence);
    
    logger.info(`Silence created`, { silence });
    
    return silence;
  }

  async checkErrorRate(): Promise<void> {
    // Called from main service to trigger error rate check
    const rule = this.rules.get('high-error-rate');
    if (rule && rule.enabled) {
      const shouldFire = await this.evaluateRule(rule);
      if (shouldFire) {
        await this.fireAlert(rule);
      }
    }
  }

  getAlerts(filter?: {
    status?: string;
    severity?: string;
    service?: string;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());
    
    if (filter) {
      if (filter.status) {
        alerts = alerts.filter(a => a.status === filter.status);
      }
      if (filter.severity) {
        alerts = alerts.filter(a => a.severity === filter.severity);
      }
      if (filter.service) {
        alerts = alerts.filter(a => a.service === filter.service);
      }
    }
    
    return alerts.sort((a, b) => 
      b.timestamp.getTime() - a.timestamp.getTime()
    );
  }

  getAlertGroups(): AlertGroup[] {
    return Array.from(this.alertGroups.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
}