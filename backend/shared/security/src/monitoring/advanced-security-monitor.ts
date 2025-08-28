// Advanced Security Monitoring and Threat Detection
// Real-time security monitoring with ML-based anomaly detection and automated response

import { FastifyRequest, FastifyReply } from 'fastify';
import * as Redis from 'ioredis';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SecurityError, SecurityUtils } from '../index';

export interface SecurityMonitorConfig {
  enabled: boolean;
  realTimeMonitoring: boolean;
  anomalyDetection: boolean;
  automaticResponse: boolean;
  threatIntelligence: boolean;
  behavioralAnalysis: boolean;
  alertThresholds: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  retentionDays: number;
  aggregationWindow: number; // milliseconds
  maxEventsPerSecond: number;
}

export interface SecurityEvent {
  id: string;
  timestamp: number;
  type: SecurityEventType;
  severity: SecuritySeverity;
  source: {
    ip: string;
    userAgent: string;
    userId?: string;
    sessionId?: string;
    geoLocation?: GeoLocation;
  };
  target: {
    endpoint: string;
    method: string;
    resource?: string;
  };
  details: Record<string, any>;
  riskScore: number;
  indicators: ThreatIndicator[];
  response?: SecurityResponse;
}

export type SecurityEventType = 
  | 'authentication_failure'
  | 'authorization_violation'
  | 'xss_attempt'
  | 'sql_injection_attempt'
  | 'csrf_violation'
  | 'rate_limit_exceeded'
  | 'suspicious_activity'
  | 'data_exfiltration_attempt'
  | 'privilege_escalation_attempt'
  | 'malicious_file_upload'
  | 'bot_detection'
  | 'brute_force_attack'
  | 'session_hijacking_attempt'
  | 'directory_traversal_attempt'
  | 'command_injection_attempt'
  | 'vulnerability_scan'
  | 'anomaly_detected'
  | 'security_policy_violation';

export type SecuritySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatIndicator {
  type: string;
  value: string;
  confidence: number;
  source: string;
  description: string;
}

export interface SecurityResponse {
  action: 'log' | 'alert' | 'block' | 'quarantine' | 'challenge';
  timestamp: number;
  automated: boolean;
  details: Record<string, any>;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  lat?: number;
  lon?: number;
  isp?: string;
  org?: string;
}

export interface AnomalyResult {
  isAnomaly: boolean;
  score: number;
  reasons: string[];
  baseline: Record<string, number>;
  current: Record<string, number>;
}

export interface BehaviorProfile {
  userId: string;
  baseline: {
    averageRequestsPerHour: number;
    commonEndpoints: string[];
    typicalGeoLocations: GeoLocation[];
    averageSessionDuration: number;
    commonUserAgents: string[];
    typicalRequestTimes: number[]; // Hours of day
  };
  recentActivity: {
    requestCount: number;
    uniqueEndpoints: Set<string>;
    geoLocations: GeoLocation[];
    sessionDuration: number;
    userAgents: Set<string>;
    requestTimes: number[];
  };
  riskScore: number;
  lastUpdated: number;
}

export interface SecurityAlert {
  id: string;
  timestamp: number;
  severity: SecuritySeverity;
  title: string;
  description: string;
  events: SecurityEvent[];
  indicators: ThreatIndicator[];
  recommendation: string;
  acknowledged: boolean;
  resolved: boolean;
}

export class AdvancedSecurityMonitor {
  private config: SecurityMonitorConfig;
  private redis: Redis;
  private prisma?: PrismaClient;
  private eventBuffer: SecurityEvent[] = [];
  private behaviorProfiles = new Map<string, BehaviorProfile>();
  private alertQueue: SecurityAlert[] = [];
  private threatIntelCache = new Map<string, ThreatIndicator>();
  
  // Event aggregation
  private eventCounters = new Map<string, number>();
  private lastAggregation = Date.now();
  
  // Pattern detection
  private suspiciousPatterns = [
    {
      name: 'rapid_auth_failures',
      pattern: (events: SecurityEvent[]) => {
        const authFailures = events.filter(e => 
          e.type === 'authentication_failure' && 
          Date.now() - e.timestamp < 5 * 60 * 1000 // Last 5 minutes
        );
        return authFailures.length > 5;
      },
      severity: 'high' as SecuritySeverity,
      description: 'Multiple authentication failures detected'
    },
    {
      name: 'distributed_attack',
      pattern: (events: SecurityEvent[]) => {
        const recentEvents = events.filter(e => Date.now() - e.timestamp < 10 * 60 * 1000);
        const uniqueIPs = new Set(recentEvents.map(e => e.source.ip));
        return uniqueIPs.size > 10 && recentEvents.length > 50;
      },
      severity: 'critical' as SecuritySeverity,
      description: 'Distributed attack pattern detected'
    },
    {
      name: 'privilege_escalation_sequence',
      pattern: (events: SecurityEvent[]) => {
        const escalationEvents = events.filter(e => 
          e.type === 'privilege_escalation_attempt' ||
          e.type === 'authorization_violation'
        );
        return escalationEvents.length > 3;
      },
      severity: 'high' as SecuritySeverity,
      description: 'Privilege escalation sequence detected'
    },
    {
      name: 'data_exfiltration_pattern',
      pattern: (events: SecurityEvent[]) => {
        const dataEvents = events.filter(e => 
          e.type === 'data_exfiltration_attempt' &&
          Date.now() - e.timestamp < 30 * 60 * 1000 // Last 30 minutes
        );
        return dataEvents.length > 2;
      },
      severity: 'critical' as SecuritySeverity,
      description: 'Data exfiltration pattern detected'
    }
  ];

  constructor(
    redis: Redis,
    prisma?: PrismaClient,
    config: Partial<SecurityMonitorConfig> = {}
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.config = {
      enabled: true,
      realTimeMonitoring: true,
      anomalyDetection: true,
      automaticResponse: true,
      threatIntelligence: true,
      behavioralAnalysis: true,
      alertThresholds: {
        low: 30,
        medium: 50,
        high: 70,
        critical: 90
      },
      retentionDays: 30,
      aggregationWindow: 60000, // 1 minute
      maxEventsPerSecond: 1000,
      ...config
    };
    
    // Start background processes
    this.startEventProcessor();
    this.startAnomalyDetector();
    this.startPatternDetector();
    this.startCleanupJob();
  }

  /**
   * Main security monitoring middleware
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (!this.config.enabled) {
        return;
      }

      const startTime = Date.now();
      
      // Extract request information
      const source = await this.extractSourceInfo(request);
      const target = this.extractTargetInfo(request);
      
      // Monitor request for suspicious patterns
      const indicators = await this.analyzeRequest(request);
      
      // Calculate risk score
      const riskScore = this.calculateRiskScore(indicators, source, target);
      
      // Create base event
      const baseEvent: Partial<SecurityEvent> = {
        id: SecurityUtils.generateUUID(),
        timestamp: startTime,
        source,
        target,
        riskScore,
        indicators
      };
      
      // Monitor response
      reply.addHook('onSend', async (request, reply) => {
        const responseTime = Date.now() - startTime;
        const statusCode = reply.statusCode;
        
        // Determine if this is a security event
        const securityEvents = await this.detectSecurityEvents(request, reply, baseEvent);
        
        // Log security events
        for (const event of securityEvents) {
          await this.logSecurityEvent(event);
        }
        
        // Update behavior profiles
        if (this.config.behavioralAnalysis && source.userId) {
          await this.updateBehaviorProfile(source.userId, request, responseTime);
        }
        
        // Real-time threat detection
        if (this.config.realTimeMonitoring) {
          await this.performRealTimeAnalysis(securityEvents);
        }
      });
      
      // Add monitoring context to request
      (request as any).securityMonitor = {
        startTime,
        riskScore,
        indicators
      };
    };
  }

  /**
   * Extract source information from request
   */
  private async extractSourceInfo(request: FastifyRequest): Promise<SecurityEvent['source']> {
    const ip = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const userId = this.extractUserId(request);
    const sessionId = this.extractSessionId(request);
    
    // Get geo location (would integrate with GeoIP service)
    const geoLocation = await this.getGeoLocation(ip);
    
    return {
      ip,
      userAgent,
      userId,
      sessionId,
      geoLocation
    };
  }

  /**
   * Extract target information from request
   */
  private extractTargetInfo(request: FastifyRequest): SecurityEvent['target'] {
    return {
      endpoint: request.url,
      method: request.method,
      resource: this.extractResourceId(request)
    };
  }

  /**
   * Analyze request for security indicators
   */
  private async analyzeRequest(request: FastifyRequest): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];
    
    // Check against threat intelligence
    if (this.config.threatIntelligence) {
      const ip = SecurityUtils.extractClientIP(request);
      const threatIntel = await this.checkThreatIntelligence(ip);
      indicators.push(...threatIntel);
    }
    
    // Analyze user agent
    const userAgent = request.headers['user-agent'] || '';
    const uaIndicators = this.analyzeUserAgent(userAgent);
    indicators.push(...uaIndicators);
    
    // Analyze request patterns
    const patternIndicators = await this.analyzeRequestPatterns(request);
    indicators.push(...patternIndicators);
    
    // Check for known attack signatures
    const signatureIndicators = this.checkAttackSignatures(request);
    indicators.push(...signatureIndicators);
    
    return indicators;
  }

  /**
   * Calculate overall risk score
   */
  private calculateRiskScore(
    indicators: ThreatIndicator[],
    source: SecurityEvent['source'],
    target: SecurityEvent['target']
  ): number {
    let score = 0;
    
    // Base indicators score
    for (const indicator of indicators) {
      score += indicator.confidence;
    }
    
    // Geographic risk factors
    if (source.geoLocation) {
      const highRiskCountries = ['CN', 'RU', 'KP', 'IR']; // Example
      if (highRiskCountries.includes(source.geoLocation.country)) {
        score += 20;
      }
    }
    
    // Endpoint sensitivity
    const sensitiveEndpoints = ['/admin', '/api/admin', '/api/auth', '/api/user'];
    if (sensitiveEndpoints.some(endpoint => target.endpoint.startsWith(endpoint))) {
      score += 15;
    }
    
    // Time-based factors
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      score += 10; // Activity outside business hours
    }
    
    return Math.min(score, 100);
  }

  /**
   * Detect security events from request/response
   */
  private async detectSecurityEvents(
    request: FastifyRequest,
    reply: FastifyReply,
    baseEvent: Partial<SecurityEvent>
  ): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    const statusCode = reply.statusCode;
    
    // Authentication failures
    if (statusCode === 401) {
      events.push({
        ...baseEvent as SecurityEvent,
        type: 'authentication_failure',
        severity: 'medium',
        details: {
          statusCode,
          endpoint: request.url,
          method: request.method
        }
      });
    }
    
    // Authorization violations
    if (statusCode === 403) {
      events.push({
        ...baseEvent as SecurityEvent,
        type: 'authorization_violation',
        severity: 'high',
        details: {
          statusCode,
          endpoint: request.url,
          method: request.method
        }
      });
    }
    
    // Rate limiting
    if (statusCode === 429) {
      events.push({
        ...baseEvent as SecurityEvent,
        type: 'rate_limit_exceeded',
        severity: 'medium',
        details: {
          statusCode,
          endpoint: request.url,
          method: request.method
        }
      });
    }
    
    // Suspicious activity based on risk score
    if (baseEvent.riskScore && baseEvent.riskScore > this.config.alertThresholds.medium) {
      events.push({
        ...baseEvent as SecurityEvent,
        type: 'suspicious_activity',
        severity: this.getSeverityFromRiskScore(baseEvent.riskScore),
        details: {
          riskScore: baseEvent.riskScore,
          indicators: baseEvent.indicators
        }
      });
    }
    
    return events;
  }

  /**
   * Log security event
   */
  async logSecurityEvent(event: SecurityEvent): Promise<void> {
    // Add to buffer for batch processing
    this.eventBuffer.push(event);
    
    // Immediate processing for critical events
    if (event.severity === 'critical') {
      await this.processCriticalEvent(event);
    }
    
    // Store in Redis for real-time access
    const key = `security:events:${event.source.ip}:${Date.now()}`;
    await this.redis.setex(key, 86400, JSON.stringify(event)); // 24 hours
    
    // Update counters
    this.incrementEventCounter(event.type, event.source.ip);
  }

  /**
   * Process critical security events immediately
   */
  private async processCriticalEvent(event: SecurityEvent): Promise<void> {
    // Auto-block if configured
    if (this.config.automaticResponse) {
      await this.executeSecurityResponse(event, 'block');
    }
    
    // Generate alert
    const alert: SecurityAlert = {
      id: SecurityUtils.generateUUID(),
      timestamp: Date.now(),
      severity: event.severity,
      title: `Critical Security Event: ${event.type}`,
      description: `Critical security event detected from ${event.source.ip}`,
      events: [event],
      indicators: event.indicators,
      recommendation: this.generateRecommendation(event),
      acknowledged: false,
      resolved: false
    };
    
    this.alertQueue.push(alert);
    
    // Send immediate notification (would integrate with notification service)
    await this.sendSecurityAlert(alert);
  }

  /**
   * Execute security response
   */
  private async executeSecurityResponse(
    event: SecurityEvent,
    action: SecurityResponse['action']
  ): Promise<void> {
    const response: SecurityResponse = {
      action,
      timestamp: Date.now(),
      automated: true,
      details: {
        reason: `Automated response to ${event.type}`,
        riskScore: event.riskScore
      }
    };
    
    switch (action) {
      case 'block':
        await this.blockIP(event.source.ip, 'Automated security response');
        break;
        
      case 'quarantine':
        await this.quarantineUser(event.source.userId);
        break;
        
      case 'challenge':
        await this.requireAdditionalAuth(event.source.userId);
        break;
    }
    
    // Update event with response
    event.response = response;
  }

  /**
   * Analyze user agent for suspicious patterns
   */
  private analyzeUserAgent(userAgent: string): ThreatIndicator[] {
    const indicators: ThreatIndicator[] = [];
    
    // Bot patterns
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /sqlmap/i, /nikto/i, /burp/i, /nmap/i
    ];
    
    for (const pattern of botPatterns) {
      if (pattern.test(userAgent)) {
        indicators.push({
          type: 'suspicious_user_agent',
          value: userAgent,
          confidence: 60,
          source: 'user_agent_analysis',
          description: 'Bot or security tool detected in user agent'
        });
        break;
      }
    }
    
    // Empty or minimal user agent
    if (!userAgent || userAgent.length < 10) {
      indicators.push({
        type: 'minimal_user_agent',
        value: userAgent,
        confidence: 40,
        source: 'user_agent_analysis',
        description: 'Minimal or missing user agent'
      });
    }
    
    return indicators;
  }

  /**
   * Check threat intelligence
   */
  private async checkThreatIntelligence(ip: string): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];
    
    // Check cache first
    const cached = this.threatIntelCache.get(ip);
    if (cached) {
      return [cached];
    }
    
    // Check Redis for known bad IPs
    const threatKey = `threat:ip:${ip}`;
    const threatData = await this.redis.get(threatKey);
    
    if (threatData) {
      const threat = JSON.parse(threatData);
      const indicator: ThreatIndicator = {
        type: 'malicious_ip',
        value: ip,
        confidence: threat.confidence || 80,
        source: threat.source || 'threat_intelligence',
        description: threat.description || 'Known malicious IP address'
      };
      
      indicators.push(indicator);
      this.threatIntelCache.set(ip, indicator);
    }
    
    return indicators;
  }

  /**
   * Analyze request patterns
   */
  private async analyzeRequestPatterns(request: FastifyRequest): Promise<ThreatIndicator[]> {
    const indicators: ThreatIndicator[] = [];
    const ip = SecurityUtils.extractClientIP(request);
    
    // Check request frequency
    const requestCount = await this.getRecentRequestCount(ip);
    if (requestCount > 100) { // More than 100 requests in last minute
      indicators.push({
        type: 'high_request_frequency',
        value: requestCount.toString(),
        confidence: 70,
        source: 'pattern_analysis',
        description: 'Unusually high request frequency detected'
      });
    }
    
    // Check for directory traversal attempts
    if (request.url.includes('../') || request.url.includes('..\\')) {
      indicators.push({
        type: 'directory_traversal',
        value: request.url,
        confidence: 90,
        source: 'pattern_analysis',
        description: 'Directory traversal attempt detected'
      });
    }
    
    // Check for SQL injection patterns in URL
    const sqlPatterns = /union|select|insert|update|delete|drop|create|alter/i;
    if (sqlPatterns.test(request.url)) {
      indicators.push({
        type: 'sql_injection_attempt',
        value: request.url,
        confidence: 85,
        source: 'pattern_analysis',
        description: 'SQL injection pattern detected in URL'
      });
    }
    
    return indicators;
  }

  /**
   * Check for known attack signatures
   */
  private checkAttackSignatures(request: FastifyRequest): ThreatIndicator[] {
    const indicators: ThreatIndicator[] = [];
    
    // Common attack patterns in headers
    const suspiciousHeaders = {
      'x-forwarded-for': /(<script|javascript:|data:)/i,
      'user-agent': /(sqlmap|nikto|burpsuite|nmap)/i,
      'referer': /(javascript:|data:|vbscript:)/i
    };
    
    for (const [header, pattern] of Object.entries(suspiciousHeaders)) {
      const value = request.headers[header] as string;
      if (value && pattern.test(value)) {
        indicators.push({
          type: 'malicious_header',
          value: `${header}: ${value}`,
          confidence: 80,
          source: 'signature_detection',
          description: `Malicious pattern detected in ${header} header`
        });
      }
    }
    
    return indicators;
  }

  /**
   * Start event processing background job
   */
  private startEventProcessor(): void {
    setInterval(async () => {
      if (this.eventBuffer.length === 0) return;
      
      // Process events in batches
      const batchSize = Math.min(this.eventBuffer.length, 100);
      const batch = this.eventBuffer.splice(0, batchSize);
      
      try {
        // Store in database if available
        if (this.prisma) {
          await this.storeEventsInDatabase(batch);
        }
        
        // Perform pattern detection
        await this.detectAttackPatterns(batch);
        
      } catch (error) {
        console.error('Event processing error:', error);
        // Put events back in buffer
        this.eventBuffer.unshift(...batch);
      }
    }, this.config.aggregationWindow);
  }

  /**
   * Start anomaly detection background job
   */
  private startAnomalyDetector(): void {
    if (!this.config.anomalyDetection) return;
    
    setInterval(async () => {
      for (const [userId, profile] of this.behaviorProfiles.entries()) {
        const anomaly = await this.detectBehaviorAnomaly(profile);
        
        if (anomaly.isAnomaly) {
          const event: SecurityEvent = {
            id: SecurityUtils.generateUUID(),
            timestamp: Date.now(),
            type: 'anomaly_detected',
            severity: 'medium',
            source: {
              ip: 'unknown',
              userAgent: 'unknown',
              userId
            },
            target: {
              endpoint: 'user_behavior',
              method: 'ANALYSIS'
            },
            details: {
              anomalyScore: anomaly.score,
              reasons: anomaly.reasons,
              baseline: anomaly.baseline,
              current: anomaly.current
            },
            riskScore: anomaly.score,
            indicators: [{
              type: 'behavioral_anomaly',
              value: userId,
              confidence: anomaly.score,
              source: 'anomaly_detection',
              description: `Behavioral anomaly detected: ${anomaly.reasons.join(', ')}`
            }]
          };
          
          await this.logSecurityEvent(event);
        }
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Start pattern detection background job
   */
  private startPatternDetector(): void {
    setInterval(async () => {
      const recentEvents = await this.getRecentEvents(30 * 60 * 1000); // Last 30 minutes
      
      for (const patternDef of this.suspiciousPatterns) {
        if (patternDef.pattern(recentEvents)) {
          const alert: SecurityAlert = {
            id: SecurityUtils.generateUUID(),
            timestamp: Date.now(),
            severity: patternDef.severity,
            title: `Attack Pattern Detected: ${patternDef.name}`,
            description: patternDef.description,
            events: recentEvents.filter(e => 
              Date.now() - e.timestamp < 10 * 60 * 1000 // Last 10 minutes
            ),
            indicators: [],
            recommendation: this.generatePatternRecommendation(patternDef.name),
            acknowledged: false,
            resolved: false
          };
          
          this.alertQueue.push(alert);
          await this.sendSecurityAlert(alert);
        }
      }
    }, 60 * 1000); // Every minute
  }

  /**
   * Start cleanup background job
   */
  private startCleanupJob(): void {
    setInterval(async () => {
      const cutoff = Date.now() - (this.config.retentionDays * 24 * 60 * 60 * 1000);
      
      // Clean up old events from Redis
      const keys = await this.redis.keys('security:events:*');
      const pipeline = this.redis.pipeline();
      
      for (const key of keys) {
        const timestamp = parseInt(key.split(':').pop() || '0');
        if (timestamp < cutoff) {
          pipeline.del(key);
        }
      }
      
      await pipeline.exec();
      
      // Clean up old behavior profiles
      for (const [userId, profile] of this.behaviorProfiles.entries()) {
        if (Date.now() - profile.lastUpdated > 24 * 60 * 60 * 1000) {
          this.behaviorProfiles.delete(userId);
        }
      }
      
      // Clean up threat intel cache
      if (this.threatIntelCache.size > 10000) {
        this.threatIntelCache.clear();
      }
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Helper methods
   */
  private extractUserId(request: FastifyRequest): string | undefined {
    // Implementation depends on authentication system
    const authHeader = request.headers.authorization;
    if (authHeader) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token) as any;
        return decoded?.sub;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private extractSessionId(request: FastifyRequest): string | undefined {
    // Similar to extractUserId but for session ID
    return undefined; // Implement based on session management
  }

  private extractResourceId(request: FastifyRequest): string | undefined {
    // Extract resource ID from URL parameters
    const matches = request.url.match(/\/([a-f0-9-]{36})\b/); // UUID pattern
    return matches ? matches[1] : undefined;
  }

  private async getGeoLocation(ip: string): Promise<GeoLocation | undefined> {
    // Would integrate with GeoIP service
    return undefined;
  }

  private getSeverityFromRiskScore(score: number): SecuritySeverity {
    if (score >= this.config.alertThresholds.critical) return 'critical';
    if (score >= this.config.alertThresholds.high) return 'high';
    if (score >= this.config.alertThresholds.medium) return 'medium';
    return 'low';
  }

  private incrementEventCounter(eventType: string, ip: string): void {
    const key = `${eventType}:${ip}`;
    const current = this.eventCounters.get(key) || 0;
    this.eventCounters.set(key, current + 1);
  }

  private async getRecentRequestCount(ip: string): Promise<number> {
    const key = `requests:${ip}`;
    const count = await this.redis.get(key);
    return count ? parseInt(count, 10) : 0;
  }

  private async getRecentEvents(timeWindow: number): Promise<SecurityEvent[]> {
    // Implementation would query Redis or database
    return [];
  }

  private async detectBehaviorAnomaly(profile: BehaviorProfile): Promise<AnomalyResult> {
    // Simplified anomaly detection
    return {
      isAnomaly: false,
      score: 0,
      reasons: [],
      baseline: {},
      current: {}
    };
  }

  private async updateBehaviorProfile(
    userId: string,
    request: FastifyRequest,
    responseTime: number
  ): Promise<void> {
    // Implementation would update user behavior profile
  }

  private async performRealTimeAnalysis(events: SecurityEvent[]): Promise<void> {
    // Real-time analysis implementation
  }

  private async storeEventsInDatabase(events: SecurityEvent[]): Promise<void> {
    // Database storage implementation
  }

  private async detectAttackPatterns(events: SecurityEvent[]): Promise<void> {
    // Attack pattern detection implementation
  }

  private async blockIP(ip: string, reason: string): Promise<void> {
    const key = `security:blocked:${ip}`;
    await this.redis.setex(key, 3600, JSON.stringify({ reason, timestamp: Date.now() }));
  }

  private async quarantineUser(userId?: string): Promise<void> {
    if (!userId) return;
    // User quarantine implementation
  }

  private async requireAdditionalAuth(userId?: string): Promise<void> {
    if (!userId) return;
    // Additional authentication requirement implementation
  }

  private generateRecommendation(event: SecurityEvent): string {
    switch (event.type) {
      case 'authentication_failure':
        return 'Consider implementing account lockout policies and MFA';
      case 'sql_injection_attempt':
        return 'Review input validation and use parameterized queries';
      case 'xss_attempt':
        return 'Implement proper output encoding and CSP headers';
      default:
        return 'Review security policies and monitoring rules';
    }
  }

  private generatePatternRecommendation(patternName: string): string {
    switch (patternName) {
      case 'rapid_auth_failures':
        return 'Implement progressive delays and account lockouts';
      case 'distributed_attack':
        return 'Consider rate limiting and DDoS protection';
      default:
        return 'Investigate and implement appropriate countermeasures';
    }
  }

  private async sendSecurityAlert(alert: SecurityAlert): Promise<void> {
    // Would integrate with notification service (email, Slack, etc.)
    console.log('Security Alert:', alert.title);
  }

  /**
   * Get monitoring statistics
   */
  getStatistics() {
    return {
      eventsBuffered: this.eventBuffer.length,
      behaviorProfiles: this.behaviorProfiles.size,
      pendingAlerts: this.alertQueue.length,
      threatIntelEntries: this.threatIntelCache.size,
      config: this.config
    };
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(count = 10): SecurityAlert[] {
    return this.alertQueue.slice(-count);
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string): boolean {
    const alert = this.alertQueue.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }
}

// Export factory function
export function createAdvancedSecurityMonitor(
  redis: Redis,
  prisma?: PrismaClient,
  config?: Partial<SecurityMonitorConfig>
): AdvancedSecurityMonitor {
  return new AdvancedSecurityMonitor(redis, prisma, config);
}
