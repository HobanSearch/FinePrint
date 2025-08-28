// Security Monitoring and Intrusion Detection System
// Real-time threat detection, anomaly detection, and incident response

import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
import { SecurityUtils } from '../index';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: SecuritySeverity;
  timestamp: Date;
  sourceIP: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  details: any;
  riskScore: number;
  blocked: boolean;
}

export enum SecurityEventType {
  // Authentication events
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  PASSWORD_CHANGE = 'password_change',
  MFA_SETUP = 'mfa_setup',
  MFA_SUCCESS = 'mfa_success',
  MFA_FAILURE = 'mfa_failure',
  ACCOUNT_LOCKED = 'account_locked',
  
  // Authorization events
  ACCESS_DENIED = 'access_denied',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  
  // Input validation
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION = 'sql_injection',
  PATH_TRAVERSAL = 'path_traversal',
  COMMAND_INJECTION = 'command_injection',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  DDoS_ATTACK = 'ddos_attack',
  
  // Data access
  SENSITIVE_DATA_ACCESS = 'sensitive_data_access',
  DATA_EXPORT = 'data_export',
  BULK_DOWNLOAD = 'bulk_download',
  
  // System events
  SYSTEM_ERROR = 'system_error',
  CONFIGURATION_CHANGE = 'configuration_change',
  SERVICE_RESTART = 'service_restart',
  
  // Anomalies
  SUSPICIOUS_BEHAVIOR = 'suspicious_behavior',
  LOCATION_ANOMALY = 'location_anomaly',
  TIME_ANOMALY = 'time_anomaly',
  UNUSUAL_TRAFFIC = 'unusual_traffic'
}

export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export interface ThreatIntelligence {
  maliciousIPs: Set<string>;
  knownAttackers: Set<string>;
  suspiciousUserAgents: Set<string>;
  blockedCountries: Set<string>;
  honeypotTokens: Set<string>;
}

export interface AnomalyDetectionConfig {
  enabled: boolean;
  sensitivity: number; // 0-1, higher = more sensitive
  windowSize: number; // minutes
  thresholds: {
    requestRate: number;
    errorRate: number;
    geolocationChange: boolean;
    unusualHours: boolean;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  eventTypes: SecurityEventType[];
  conditions: AlertCondition[];
  actions: AlertAction[];
  enabled: boolean;
  cooldownMinutes: number;
}

export interface AlertCondition {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'regex';
  value: any;
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'block_ip' | 'disable_user';
  config: any;
}

export class SecurityMonitor {
  private redis: Redis;
  private threatIntel: ThreatIntelligence;
  private alertRules: AlertRule[] = [];
  private anomalyConfig: AnomalyDetectionConfig;
  private readonly eventKeyPrefix = 'security:event:';
  private readonly alertKeyPrefix = 'security:alert:';
  private readonly metricsKeyPrefix = 'security:metrics:';

  constructor(redisClient: Redis) {
    this.redis = redisClient;
    this.threatIntel = {
      maliciousIPs: new Set(),
      knownAttackers: new Set(),
      suspiciousUserAgents: new Set(),
      blockedCountries: new Set(),
      honeypotTokens: new Set()
    };

    this.anomalyConfig = {
      enabled: true,
      sensitivity: 0.7,
      windowSize: 60, // 1 hour
      thresholds: {
        requestRate: 1000,
        errorRate: 0.1, // 10%
        geolocationChange: true,
        unusualHours: true
      }
    };

    this.initializeDefaultRules();
    this.startThreatIntelUpdate();
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: Partial<SecurityEvent>): Promise<void> {
    const securityEvent: SecurityEvent = {
      id: SecurityUtils.generateUUID(),
      timestamp: new Date(),
      riskScore: 0,
      blocked: false,
      ...event
    } as SecurityEvent;

    // Calculate risk score
    securityEvent.riskScore = this.calculateRiskScore(securityEvent);

    // Check threat intelligence
    await this.checkThreatIntelligence(securityEvent);

    // Store event in Redis
    const eventKey = `${this.eventKeyPrefix}${securityEvent.id}`;
    await this.redis.setex(
      eventKey,
      7 * 24 * 60 * 60, // 7 days retention
      JSON.stringify(securityEvent)
    );

    // Update metrics
    await this.updateSecurityMetrics(securityEvent);

    // Check alert rules
    await this.processAlertRules(securityEvent);

    // Perform anomaly detection
    if (this.anomalyConfig.enabled) {
      await this.detectAnomalies(securityEvent);
    }

    // Log to application logger
    this.logToApplication(securityEvent);
  }

  /**
   * Middleware for automatic security monitoring
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      const clientIP = SecurityUtils.extractClientIP(request);
      const userAgent = request.headers['user-agent'] || '';

      // Check if IP is in threat intelligence
      if (this.threatIntel.maliciousIPs.has(clientIP)) {
        await this.logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
          severity: SecuritySeverity.HIGH,
          sourceIP: clientIP,
          userAgent,
          details: { reason: 'malicious_ip', ip: clientIP },
          blocked: true
        });

        throw new Error('Access denied');
      }

      // Check for suspicious user agents
      if (this.threatIntel.suspiciousUserAgents.has(userAgent)) {
        await this.logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
          severity: SecuritySeverity.MEDIUM,
          sourceIP: clientIP,
          userAgent,
          details: { reason: 'suspicious_user_agent', userAgent },
          blocked: false
        });
      }

      // Monitor request processing
      reply.addHook('onSend', async (request, reply, payload) => {
        const responseTime = Date.now() - startTime;
        const statusCode = reply.statusCode;

        // Log suspicious patterns
        if (statusCode >= 400) {
          await this.logSecurityEvent({
            type: SecurityEventType.SYSTEM_ERROR,
            severity: statusCode >= 500 ? SecuritySeverity.HIGH : SecuritySeverity.MEDIUM,
            sourceIP: clientIP,
            userAgent,
            details: {
              path: request.url,
              method: request.method,
              statusCode,
              responseTime
            }
          });
        }

        // Check for potential DDoS
        if (responseTime > 5000) { // 5 seconds
          await this.logSecurityEvent({
            type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
            severity: SecuritySeverity.MEDIUM,
            sourceIP: clientIP,
            userAgent,
            details: {
              reason: 'slow_response',
              responseTime,
              path: request.url
            }
          });
        }
      });
    };
  }

  /**
   * Calculate risk score for event
   */
  private calculateRiskScore(event: SecurityEvent): number {
    let score = 0;

    // Base score by event type
    const eventTypeScores: { [key in SecurityEventType]: number } = {
      [SecurityEventType.LOGIN_SUCCESS]: 1,
      [SecurityEventType.LOGIN_FAILURE]: 3,
      [SecurityEventType.LOGOUT]: 1,
      [SecurityEventType.PASSWORD_CHANGE]: 2,
      [SecurityEventType.MFA_SETUP]: 2,
      [SecurityEventType.MFA_SUCCESS]: 1,
      [SecurityEventType.MFA_FAILURE]: 4,
      [SecurityEventType.ACCOUNT_LOCKED]: 5,
      [SecurityEventType.ACCESS_DENIED]: 4,
      [SecurityEventType.PRIVILEGE_ESCALATION]: 8,
      [SecurityEventType.UNAUTHORIZED_ACCESS]: 7,
      [SecurityEventType.XSS_ATTEMPT]: 6,
      [SecurityEventType.SQL_INJECTION]: 8,
      [SecurityEventType.PATH_TRAVERSAL]: 7,
      [SecurityEventType.COMMAND_INJECTION]: 9,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 3,
      [SecurityEventType.DDoS_ATTACK]: 7,
      [SecurityEventType.SENSITIVE_DATA_ACCESS]: 4,
      [SecurityEventType.DATA_EXPORT]: 3,
      [SecurityEventType.BULK_DOWNLOAD]: 5,
      [SecurityEventType.SYSTEM_ERROR]: 2,
      [SecurityEventType.CONFIGURATION_CHANGE]: 3,
      [SecurityEventType.SERVICE_RESTART]: 2,
      [SecurityEventType.SUSPICIOUS_BEHAVIOR]: 5,
      [SecurityEventType.LOCATION_ANOMALY]: 4,
      [SecurityEventType.TIME_ANOMALY]: 3,
      [SecurityEventType.UNUSUAL_TRAFFIC]: 4
    };

    score += eventTypeScores[event.type] || 0;

    // Severity multiplier
    const severityMultipliers = {
      [SecuritySeverity.LOW]: 1,
      [SecuritySeverity.MEDIUM]: 2,
      [SecuritySeverity.HIGH]: 3,
      [SecuritySeverity.CRITICAL]: 5
    };

    score *= severityMultipliers[event.severity];

    // IP reputation adjustment
    if (this.threatIntel.maliciousIPs.has(event.sourceIP)) {
      score += 5;
    }

    // User agent reputation
    if (event.userAgent && this.threatIntel.suspiciousUserAgents.has(event.userAgent)) {
      score += 3;
    }

    // Known attacker
    if (event.userId && this.threatIntel.knownAttackers.has(event.userId)) {
      score += 10;
    }

    return Math.min(score, 10); // Cap at 10
  }

  /**
   * Check event against threat intelligence
   */
  private async checkThreatIntelligence(event: SecurityEvent): Promise<void> {
    // Check IP reputation
    if (this.threatIntel.maliciousIPs.has(event.sourceIP)) {
      event.riskScore += 5;
      event.details.threatIntel = 'malicious_ip';
    }

    // Check honeypot tokens
    if (event.details && typeof event.details === 'object') {
      const eventStr = JSON.stringify(event.details);
      for (const token of this.threatIntel.honeypotTokens) {
        if (eventStr.includes(token)) {
          event.riskScore = 10;
          event.severity = SecuritySeverity.CRITICAL;
          event.details.threatIntel = 'honeypot_trigger';
          break;
        }
      }
    }
  }

  /**
   * Update security metrics
   */
  private async updateSecurityMetrics(event: SecurityEvent): Promise<void> {
    const now = new Date();
    const hourKey = `${this.metricsKeyPrefix}hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    const dayKey = `${this.metricsKeyPrefix}day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    const pipeline = this.redis.pipeline();

    // Increment counters
    pipeline.hincrby(hourKey, event.type, 1);
    pipeline.hincrby(hourKey, 'total', 1);
    pipeline.hincrby(dayKey, event.type, 1);
    pipeline.hincrby(dayKey, 'total', 1);

    // Set expiration
    pipeline.expire(hourKey, 7 * 24 * 60 * 60); // 7 days
    pipeline.expire(dayKey, 30 * 24 * 60 * 60); // 30 days

    // Track risk scores
    pipeline.lpush(`${this.metricsKeyPrefix}risk_scores`, event.riskScore);
    pipeline.ltrim(`${this.metricsKeyPrefix}risk_scores`, 0, 999); // Keep last 1000

    await pipeline.exec();
  }

  /**
   * Process alert rules
   */
  private async processAlertRules(event: SecurityEvent): Promise<void> {
    for (const rule of this.alertRules) {
      if (!rule.enabled || !rule.eventTypes.includes(event.type)) {
        continue;
      }

      // Check cooldown
      const cooldownKey = `${this.alertKeyPrefix}cooldown:${rule.id}`;
      const cooldownExists = await this.redis.exists(cooldownKey);
      if (cooldownExists) {
        continue;
      }

      // Check conditions
      const conditionsMet = rule.conditions.every(condition => 
        this.evaluateCondition(event, condition)
      );

      if (conditionsMet) {
        // Execute actions
        for (const action of rule.actions) {
          await this.executeAlertAction(event, action);
        }

        // Set cooldown
        await this.redis.setex(
          cooldownKey,
          rule.cooldownMinutes * 60,
          event.id
        );
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(event: SecurityEvent, condition: AlertCondition): boolean {
    const value = this.getEventValue(event, condition.field);

    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return typeof value === 'string' && value.includes(condition.value);
      case 'greater_than':
        return typeof value === 'number' && value > condition.value;
      case 'less_than':
        return typeof value === 'number' && value < condition.value;
      case 'regex':
        return typeof value === 'string' && new RegExp(condition.value).test(value);
      default:
        return false;
    }
  }

  /**
   * Get event value by field path
   */
  private getEventValue(event: SecurityEvent, field: string): any {
    const parts = field.split('.');
    let value: any = event;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Execute alert action
   */
  private async executeAlertAction(event: SecurityEvent, action: AlertAction): Promise<void> {
    switch (action.type) {
      case 'email':
        // Send email alert (implement with your email service)
        console.log('EMAIL ALERT:', event);
        break;
        
      case 'webhook':
        // Send webhook (implement with HTTP client)
        console.log('WEBHOOK ALERT:', event);
        break;
        
      case 'slack':
        // Send Slack message (implement with Slack API)
        console.log('SLACK ALERT:', event);
        break;
        
      case 'block_ip':
        this.threatIntel.maliciousIPs.add(event.sourceIP);
        await this.redis.sadd('blocked_ips', event.sourceIP);
        break;
        
      case 'disable_user':
        if (event.userId) {
          // Disable user account (implement with your user service)
          console.log('DISABLE USER:', event.userId);
        }
        break;
    }
  }

  /**
   * Detect anomalies in security events
   */
  private async detectAnomalies(event: SecurityEvent): Promise<void> {
    // Request rate anomaly
    const rateKey = `${this.metricsKeyPrefix}rate:${event.sourceIP}`;
    const requestCount = await this.redis.incr(rateKey);
    await this.redis.expire(rateKey, this.anomalyConfig.windowSize * 60);

    if (requestCount > this.anomalyConfig.thresholds.requestRate) {
      await this.logSecurityEvent({
        type: SecurityEventType.UNUSUAL_TRAFFIC,
        severity: SecuritySeverity.HIGH,
        sourceIP: event.sourceIP,
        userAgent: event.userAgent,
        details: {
          reason: 'high_request_rate',
          count: requestCount,
          threshold: this.anomalyConfig.thresholds.requestRate
        }
      });
    }

    // Error rate anomaly
    if (event.type === SecurityEventType.SYSTEM_ERROR) {
      const errorKey = `${this.metricsKeyPrefix}errors:${event.sourceIP}`;
      const totalKey = `${this.metricsKeyPrefix}total:${event.sourceIP}`;
      
      const errorCount = await this.redis.incr(errorKey);
      const totalCount = await this.redis.get(totalKey) || '1';
      const errorRate = errorCount / parseInt(totalCount);

      if (errorRate > this.anomalyConfig.thresholds.errorRate) {
        await this.logSecurityEvent({
          type: SecurityEventType.SUSPICIOUS_BEHAVIOR,
          severity: SecuritySeverity.MEDIUM,
          sourceIP: event.sourceIP,
          userAgent: event.userAgent,
          details: {
            reason: 'high_error_rate',
            errorRate,
            threshold: this.anomalyConfig.thresholds.errorRate
          }
        });
      }
    }
  }

  /**
   * Log to application logger
   */
  private logToApplication(event: SecurityEvent): void {
    const logData = {
      eventId: event.id,
      type: event.type,
      severity: event.severity,
      sourceIP: event.sourceIP,
      riskScore: event.riskScore,
      blocked: event.blocked,
      details: SecurityUtils.sanitizeForLog(event.details)
    };

    if (event.severity === SecuritySeverity.CRITICAL) {
      console.error('CRITICAL SECURITY EVENT:', logData);
    } else if (event.severity === SecuritySeverity.HIGH) {
      console.warn('HIGH SECURITY EVENT:', logData);
    } else {
      console.info('SECURITY EVENT:', logData);
    }
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // Multiple failed logins
    this.alertRules.push({
      id: 'multiple-failed-logins',
      name: 'Multiple Failed Login Attempts',
      eventTypes: [SecurityEventType.LOGIN_FAILURE],
      conditions: [
        { field: 'riskScore', operator: 'greater_than', value: 5 }
      ],
      actions: [
        { type: 'email', config: { recipient: 'security@fineprintai.com' } },
        { type: 'block_ip', config: {} }
      ],
      enabled: true,
      cooldownMinutes: 15
    });

    // SQL injection attempts
    this.alertRules.push({
      id: 'sql-injection',
      name: 'SQL Injection Attempt',
      eventTypes: [SecurityEventType.SQL_INJECTION],
      conditions: [],
      actions: [
        { type: 'email', config: { recipient: 'security@fineprintai.com' } },
        { type: 'webhook', config: { url: 'https://hooks.slack.com/...' } },
        { type: 'block_ip', config: {} }
      ],
      enabled: true,
      cooldownMinutes: 5
    });

    // Critical events
    this.alertRules.push({
      id: 'critical-events',
      name: 'Critical Security Events',
      eventTypes: [
        SecurityEventType.PRIVILEGE_ESCALATION,
        SecurityEventType.COMMAND_INJECTION,
        SecurityEventType.UNAUTHORIZED_ACCESS
      ],
      conditions: [
        { field: 'severity', operator: 'equals', value: SecuritySeverity.CRITICAL }
      ],
      actions: [
        { type: 'email', config: { recipient: 'security@fineprintai.com' } },
        { type: 'slack', config: { channel: '#security-alerts' } },
        { type: 'webhook', config: { url: 'https://security.fineprintai.com/webhook' } }
      ],
      enabled: true,
      cooldownMinutes: 1
    });
  }

  /**
   * Start threat intelligence updates
   */
  private startThreatIntelUpdate(): void {
    // Update threat intelligence every hour
    setInterval(async () => {
      try {
        await this.updateThreatIntelligence();
      } catch (error) {
        console.error('Threat intelligence update failed:', error);
      }
    }, 60 * 60 * 1000); // 1 hour

    // Initial update
    this.updateThreatIntelligence();
  }

  /**
   * Update threat intelligence data
   */
  private async updateThreatIntelligence(): Promise<void> {
    // In a real implementation, you would fetch from external threat feeds
    // For now, we'll use some example malicious IPs
    const exampleMaliciousIPs = [
      '192.168.1.100', // Example internal IP for testing
      '10.0.0.50',     // Another example
      // Add real threat intelligence sources here
    ];

    for (const ip of exampleMaliciousIPs) {
      this.threatIntel.maliciousIPs.add(ip);
    }

    // Suspicious user agents
    const suspiciousUserAgents = [
      'sqlmap',
      'nikto',
      'nmap',
      'masscan',
      'w3af',
      'burp',
      'crawler'
    ];

    for (const ua of suspiciousUserAgents) {
      this.threatIntel.suspiciousUserAgents.add(ua);
    }

    // Generate honeypot tokens
    for (let i = 0; i < 10; i++) {
      const token = SecurityUtils.generateSecureRandom(16);
      this.threatIntel.honeypotTokens.add(token);
    }
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(timeframe: 'hour' | 'day' = 'hour'): Promise<any> {
    const now = new Date();
    let key: string;

    if (timeframe === 'hour') {
      key = `${this.metricsKeyPrefix}hour:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
    } else {
      key = `${this.metricsKeyPrefix}day:${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    }

    return this.redis.hgetall(key);
  }

  /**
   * Get recent security events
   */
  async getRecentEvents(limit: number = 100): Promise<SecurityEvent[]> {
    const keys = await this.redis.keys(`${this.eventKeyPrefix}*`);
    const events: SecurityEvent[] = [];

    for (const key of keys.slice(0, limit)) {
      const eventData = await this.redis.get(key);
      if (eventData) {
        events.push(JSON.parse(eventData));
      }
    }

    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }
}

// Export factory function
export function createSecurityMonitor(redisClient: Redis): SecurityMonitor {
  return new SecurityMonitor(redisClient);
}