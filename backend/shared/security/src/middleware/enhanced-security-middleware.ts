// Enhanced Security Middleware Integration
// Comprehensive security orchestration with all advanced components

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import * as Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// Import all security components
import { SecurityMiddleware, SecurityMiddlewareConfig } from './security-middleware';
import { createBotDetection, BotDetectionConfig } from '../security/bot-detection';
import { createFileUploadSecurity, FileUploadConfig } from '../security/file-upload-security';
import { createXSSProtection, XSSProtectionConfig } from '../security/xss-protection';
import { createAdvancedSecurityMonitor, SecurityMonitorConfig } from '../monitoring/advanced-security-monitor';
import { createValidationMiddleware, validationMiddleware } from '../validation/index';
import { securityHeaders } from '../headers/security-headers';
import { csrfProtection } from '../csrf/csrf-protection';
import { createRateLimiter } from '../rate-limiting/advanced-rate-limiter';
import { auditLogger } from '../audit/audit-logger';
import { SecurityError, SecurityUtils } from '../index';

export interface EnhancedSecurityConfig {
  // Core security middleware config
  core: Partial<SecurityMiddlewareConfig>;
  
  // Advanced component configs
  botDetection: Partial<BotDetectionConfig>;
  fileUpload: Partial<FileUploadConfig>;
  xssProtection: Partial<XSSProtectionConfig>;
  securityMonitor: Partial<SecurityMonitorConfig>;
  
  // Feature toggles
  features: {
    enableBotDetection: boolean;
    enableFileUploadSecurity: boolean;
    enableXSSProtection: boolean;
    enableAdvancedMonitoring: boolean;
    enableRealTimeBlocking: boolean;
    enableThreatIntelligence: boolean;
    enableBehavioralAnalysis: boolean;
    enableVulnerabilityScanning: boolean;
  };
  
  // Security levels
  securityLevel: 'basic' | 'standard' | 'enhanced' | 'maximum';
  
  // Environment
  environment: 'development' | 'staging' | 'production';
  
  // Custom security rules
  customRules: SecurityRule[];
  
  // Exemptions
  exemptPaths: string[];
  exemptIPs: string[];
  exemptUserAgents: string[];
}

export interface SecurityRule {
  name: string;
  priority: number;
  condition: (request: FastifyRequest) => boolean;
  action: 'allow' | 'deny' | 'log' | 'challenge' | 'captcha';
  message?: string;
}

export interface SecurityMetrics {
  totalRequests: number;
  blockedRequests: number;
  suspiciousRequests: number;
  captchaChallenges: number;
  rateLimitViolations: number;
  xssAttempts: number;
  sqlInjectionAttempts: number;
  csrfViolations: number;
  fileUploadBlocks: number;
  botDetections: number;
  threatIntelHits: number;
  averageRiskScore: number;
  activeThreats: number;
}

export class EnhancedSecurityMiddleware {
  private config: EnhancedSecurityConfig;
  private redis: Redis;
  private prisma?: PrismaClient;
  
  // Security components
  private coreMiddleware: SecurityMiddleware;
  private botDetection?: any;
  private fileUploadSecurity?: any;
  private xssProtection?: any;
  private securityMonitor?: any;
  private rateLimiter?: any;
  
  // Metrics
  private metrics: SecurityMetrics = {
    totalRequests: 0,
    blockedRequests: 0,
    suspiciousRequests: 0,
    captchaChallenges: 0,
    rateLimitViolations: 0,
    xssAttempts: 0,
    sqlInjectionAttempts: 0,
    csrfViolations: 0,
    fileUploadBlocks: 0,
    botDetections: 0,
    threatIntelHits: 0,
    averageRiskScore: 0,
    activeThreats: 0
  };

  constructor(
    redis: Redis,
    prisma?: PrismaClient,
    config: Partial<EnhancedSecurityConfig> = {}
  ) {
    this.redis = redis;
    this.prisma = prisma;
    
    // Set default configuration based on security level
    this.config = this.buildConfiguration(config);
    
    // Initialize components
    this.initializeSecurityComponents();
    
    // Start background processes
    this.startMetricsCollection();
    this.startThreatIntelligenceSync();
  }

  /**
   * Build configuration based on security level and custom settings
   */
  private buildConfiguration(config: Partial<EnhancedSecurityConfig>): EnhancedSecurityConfig {
    const securityLevel = config.securityLevel || 'enhanced';
    const environment = config.environment || 'production';
    
    // Base configuration templates
    const baseConfigs = {
      basic: {
        features: {
          enableBotDetection: false,
          enableFileUploadSecurity: true,
          enableXSSProtection: true,
          enableAdvancedMonitoring: false,
          enableRealTimeBlocking: false,
          enableThreatIntelligence: false,
          enableBehavioralAnalysis: false,
          enableVulnerabilityScanning: false
        }
      },
      standard: {
        features: {
          enableBotDetection: true,
          enableFileUploadSecurity: true,
          enableXSSProtection: true,
          enableAdvancedMonitoring: true,
          enableRealTimeBlocking: false,
          enableThreatIntelligence: false,
          enableBehavioralAnalysis: false,
          enableVulnerabilityScanning: false
        }
      },
      enhanced: {
        features: {
          enableBotDetection: true,
          enableFileUploadSecurity: true,
          enableXSSProtection: true,
          enableAdvancedMonitoring: true,
          enableRealTimeBlocking: true,
          enableThreatIntelligence: true,
          enableBehavioralAnalysis: true,
          enableVulnerabilityScanning: false
        }
      },
      maximum: {
        features: {
          enableBotDetection: true,
          enableFileUploadSecurity: true,
          enableXSSProtection: true,
          enableAdvancedMonitoring: true,
          enableRealTimeBlocking: true,
          enableThreatIntelligence: true,
          enableBehavioralAnalysis: true,
          enableVulnerabilityScanning: true
        }
      }
    };
    
    const baseConfig = baseConfigs[securityLevel];
    
    return {
      core: {
        enableRateLimiting: true,
        enableCSRFProtection: true,
        enableSecurityHeaders: true,
        enableInputValidation: true,
        enableSecurityMonitoring: true,
        enableAuditLogging: true,
        enableGDPRCompliance: true,
        enableDatabaseSecurity: true,
        enableMFA: true,
        securityLevel,
        environment,
        ...config.core
      },
      
      botDetection: {
        enabled: baseConfig.features.enableBotDetection,
        strictMode: securityLevel === 'maximum',
        captchaProvider: 'recaptcha',
        suspiciousThreshold: securityLevel === 'maximum' ? 50 : 70,
        blockThreshold: securityLevel === 'maximum' ? 70 : 85,
        challengeThreshold: securityLevel === 'maximum' ? 60 : 75,
        ...config.botDetection
      },
      
      fileUpload: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxFiles: 10,
        scanForMalware: securityLevel === 'maximum',
        validateFileSignature: true,
        enableVirusScan: false,
        ...config.fileUpload
      },
      
      xssProtection: {
        enabled: baseConfig.features.enableXSSProtection,
        strictMode: securityLevel === 'maximum',
        blockMode: securityLevel !== 'basic',
        trustedTypes: securityLevel === 'maximum',
        cspReportOnly: environment === 'development',
        ...config.xssProtection
      },
      
      securityMonitor: {
        enabled: baseConfig.features.enableAdvancedMonitoring,
        realTimeMonitoring: baseConfig.features.enableRealTimeBlocking,
        anomalyDetection: baseConfig.features.enableBehavioralAnalysis,
        automaticResponse: baseConfig.features.enableRealTimeBlocking && environment === 'production',
        threatIntelligence: baseConfig.features.enableThreatIntelligence,
        behavioralAnalysis: baseConfig.features.enableBehavioralAnalysis,
        retentionDays: 30,
        ...config.securityMonitor
      },
      
      features: {
        ...baseConfig.features,
        ...config.features
      },
      
      securityLevel,
      environment,
      customRules: config.customRules || [],
      exemptPaths: config.exemptPaths || ['/health', '/metrics', '/favicon.ico'],
      exemptIPs: config.exemptIPs || [],
      exemptUserAgents: config.exemptUserAgents || []
    };
  }

  /**
   * Initialize all security components
   */
  private initializeSecurityComponents(): void {
    // Core security middleware
    this.coreMiddleware = new SecurityMiddleware(this.redis, this.prisma!, this.config.core);
    
    // Bot detection
    if (this.config.features.enableBotDetection) {
      this.botDetection = createBotDetection(this.redis, this.config.botDetection);
    }
    
    // File upload security
    if (this.config.features.enableFileUploadSecurity) {
      this.fileUploadSecurity = createFileUploadSecurity(this.config.fileUpload);
    }
    
    // XSS protection
    if (this.config.features.enableXSSProtection) {
      this.xssProtection = createXSSProtection(this.config.xssProtection);
    }
    
    // Advanced security monitoring
    if (this.config.features.enableAdvancedMonitoring) {
      this.securityMonitor = createAdvancedSecurityMonitor(
        this.redis, 
        this.prisma, 
        this.config.securityMonitor
      );
    }
    
    // Rate limiter
    this.rateLimiter = createRateLimiter(this.redis);
  }

  /**
   * Register all security middleware with Fastify
   */
  async register(fastify: FastifyInstance): Promise<void> {
    // Register core security middleware first
    await this.coreMiddleware.register(fastify);
    
    // Security monitoring (if enabled)
    if (this.securityMonitor) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', this.securityMonitor.middleware());
      });
    }
    
    // XSS protection (if enabled)
    if (this.xssProtection) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', this.xssProtection.middleware());
      });
    }
    
    // Bot detection (if enabled)
    if (this.botDetection) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', this.botDetection.middleware());
      });
    }
    
    // File upload security (if enabled)
    if (this.fileUploadSecurity) {
      await fastify.register(async (fastify) => {
        fastify.addHook('preHandler', this.fileUploadSecurity.middleware());
      });
    }
    
    // Main orchestrator middleware
    await fastify.register(async (fastify) => {
      fastify.addHook('onRequest', this.orchestratorMiddleware());
    });
    
    // Enhanced security routes
    await this.registerEnhancedSecurityRoutes(fastify);
    
    // Enhanced error handler
    fastify.setErrorHandler(this.enhancedErrorHandler());
  }

  /**
   * Main orchestrator middleware
   */
  private orchestratorMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const startTime = Date.now();
      this.metrics.totalRequests++;
      
      try {
        // Skip exempt requests
        if (this.isExemptRequest(request)) {
          return;
        }
        
        // Apply custom rules
        await this.applyCustomRules(request, reply);
        
        // Collect security metrics
        await this.collectSecurityMetrics(request);
        
        // Add security context to request
        (request as any).securityContext = {
          startTime,
          securityLevel: this.config.securityLevel,
          riskScore: await this.calculateRequestRiskScore(request),
          threats: await this.identifyThreats(request)
        };
        
      } catch (error) {
        if (error instanceof SecurityError) {
          this.metrics.blockedRequests++;
          throw error;
        }
        throw error;
      }
    };
  }

  /**
   * Check if request should be exempt from security checks
   */
  private isExemptRequest(request: FastifyRequest): boolean {
    const ip = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const path = request.url;
    
    return (
      this.config.exemptPaths.some(exemptPath => path.startsWith(exemptPath)) ||
      this.config.exemptIPs.includes(ip) ||
      this.config.exemptUserAgents.some(ua => userAgent.includes(ua))
    );
  }

  /**
   * Apply custom security rules
   */
  private async applyCustomRules(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const sortedRules = this.config.customRules.sort((a, b) => a.priority - b.priority);
    
    for (const rule of sortedRules) {
      if (rule.condition(request)) {
        switch (rule.action) {
          case 'deny':
            throw new SecurityError(
              rule.message || `Access denied by security rule: ${rule.name}`,
              'CUSTOM_RULE_DENY',
              403
            );
            
          case 'captcha':
            if (this.botDetection) {
              await this.botDetection.requireCaptchaChallenge(request, reply);
            }
            break;
            
          case 'challenge':
            // Require additional authentication or verification
            break;
            
          case 'log':
            await auditLogger.logSecurity(
              'custom_rule_triggered',
              undefined,
              request,
              { ruleName: rule.name, action: rule.action }
            );
            break;
        }
      }
    }
  }

  /**
   * Collect security metrics from request
   */
  private async collectSecurityMetrics(request: FastifyRequest): Promise<void> {
    const securityContext = (request as any).securityContext;
    
    if (securityContext?.riskScore > 70) {
      this.metrics.suspiciousRequests++;
    }
    
    // Update average risk score
    this.metrics.averageRiskScore = (
      (this.metrics.averageRiskScore * (this.metrics.totalRequests - 1) + securityContext?.riskScore) /
      this.metrics.totalRequests
    );
  }

  /**
   * Calculate request risk score
   */
  private async calculateRequestRiskScore(request: FastifyRequest): Promise<number> {
    let score = 0;
    
    // Get scores from various components
    if (this.botDetection) {
      // Bot detection score would be available after bot detection middleware runs
      score += 0; // Placeholder
    }
    
    if (this.xssProtection) {
      // XSS detection score
      score += 0; // Placeholder
    }
    
    // Basic risk factors
    const ip = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    
    // IP reputation (simplified)
    if (await this.isHighRiskIP(ip)) {
      score += 30;
    }
    
    // User agent analysis
    if (this.isSuspiciousUserAgent(userAgent)) {
      score += 20;
    }
    
    // Path analysis
    if (this.isHighRiskPath(request.url)) {
      score += 15;
    }
    
    return Math.min(score, 100);
  }

  /**
   * Identify threats in request
   */
  private async identifyThreats(request: FastifyRequest): Promise<string[]> {
    const threats: string[] = [];
    
    // Check various threat indicators
    if (this.containsSQLInjection(request)) {
      threats.push('sql_injection');
      this.metrics.sqlInjectionAttempts++;
    }
    
    if (this.containsXSS(request)) {
      threats.push('xss_attempt');
      this.metrics.xssAttempts++;
    }
    
    if (await this.isKnownThreat(request)) {
      threats.push('known_threat');
      this.metrics.threatIntelHits++;
    }
    
    return threats;
  }

  /**
   * Register enhanced security routes
   */
  private async registerEnhancedSecurityRoutes(fastify: FastifyInstance): Promise<void> {
    // Security dashboard endpoint
    fastify.get('/api/security/dashboard', async (request, reply) => {
      return reply.send({
        success: true,
        data: {
          metrics: this.getSecurityMetrics(),
          config: {
            securityLevel: this.config.securityLevel,
            environment: this.config.environment,
            features: this.config.features
          },
          components: this.getComponentStatuses()
        }
      });
    });
    
    // Security alerts endpoint
    fastify.get('/api/security/alerts', async (request, reply) => {
      const alerts = this.securityMonitor?.getRecentAlerts() || [];
      return reply.send({ success: true, data: alerts });
    });
    
    // Block IP endpoint
    fastify.post('/api/security/block-ip', {
      preHandler: validationMiddleware.sanitizeNone
    }, async (request, reply) => {
      const { ip, reason, duration } = request.body as any;
      
      if (this.rateLimiter) {
        await this.rateLimiter.blockIP(ip, duration || 3600000); // 1 hour default
      }
      
      await auditLogger.logSecurity('ip_blocked', undefined, request, { ip, reason });
      
      return reply.send({ success: true, message: 'IP blocked successfully' });
    });
    
    // XSS report endpoint
    if (this.xssProtection) {
      fastify.post('/api/security/csp-report', this.xssProtection.createCSPReportHandler());
    }
    
    // Bot detection challenge endpoint
    if (this.botDetection) {
      fastify.post('/api/security/captcha-verify', this.botDetection.createCaptchaMiddleware());
    }
  }

  /**
   * Enhanced error handler
   */
  private enhancedErrorHandler() {
    return async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      // Log security errors with enhanced context
      if (error instanceof SecurityError) {
        await auditLogger.logSecurity(
          'security_error',
          (request as any).securityContext?.userId,
          request,
          {
            error: error.message,
            code: error.code,
            statusCode: error.statusCode,
            securityContext: (request as any).securityContext
          }
        );
        
        return reply.status(error.statusCode).send({
          success: false,
          error: error.code,
          message: error.message,
          timestamp: new Date().toISOString()
        });
      }
      
      // Handle other errors
      request.log.error('Unhandled error in security middleware', { error });
      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'An internal error occurred'
      });
    };
  }

  /**
   * Helper methods
   */
  private async isHighRiskIP(ip: string): Promise<boolean> {
    // Check against threat intelligence or reputation services
    const key = `threat:ip:${ip}`;
    const result = await this.redis.get(key);
    return result !== null;
  }

  private isSuspiciousUserAgent(userAgent: string): boolean {
    const suspiciousPatterns = [
      /bot/i, /crawler/i, /spider/i, /scraper/i,
      /sqlmap/i, /nikto/i, /burp/i, /nmap/i
    ];
    return suspiciousPatterns.some(pattern => pattern.test(userAgent));
  }

  private isHighRiskPath(path: string): boolean {
    const highRiskPaths = [
      '/admin', '/api/admin', '/api/auth/login',
      '/api/user/delete', '/wp-admin', '/.env'
    ];
    return highRiskPaths.some(riskPath => path.startsWith(riskPath));
  }

  private containsSQLInjection(request: FastifyRequest): boolean {
    const sqlPatterns = /union|select|insert|update|delete|drop|create|alter/i;
    const content = JSON.stringify({
      url: request.url,
      query: request.query,
      body: request.body
    });
    return sqlPatterns.test(content);
  }

  private containsXSS(request: FastifyRequest): boolean {
    const xssPatterns = /<script|javascript:|on\w+\s*=/i;
    const content = JSON.stringify({
      url: request.url,
      query: request.query,
      body: request.body
    });
    return xssPatterns.test(content);
  }

  private async isKnownThreat(request: FastifyRequest): Promise<boolean> {
    // Check against threat intelligence feeds
    return false; // Placeholder
  }

  /**
   * Start background processes
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Reset metrics periodically
      const keys = Object.keys(this.metrics) as (keyof SecurityMetrics)[];
      keys.forEach(key => {
        if (typeof this.metrics[key] === 'number' && key !== 'averageRiskScore') {
          this.metrics[key] = Math.floor(this.metrics[key] * 0.9); // Decay old metrics
        }
      });
    }, 60000); // Every minute
  }

  private startThreatIntelligenceSync(): void {
    if (!this.config.features.enableThreatIntelligence) return;
    
    setInterval(async () => {
      // Sync with threat intelligence feeds
      try {
        await this.syncThreatIntelligence();
      } catch (error) {
        console.error('Threat intelligence sync error:', error);
      }
    }, 30 * 60 * 1000); // Every 30 minutes
  }

  private async syncThreatIntelligence(): Promise<void> {
    // Implementation would sync with external threat feeds
    console.log('Syncing threat intelligence...');
  }

  /**
   * Public API methods
   */
  getSecurityMetrics(): SecurityMetrics {
    return { ...this.metrics };
  }

  getComponentStatuses() {
    return {
      coreMiddleware: true,
      botDetection: !!this.botDetection,
      fileUploadSecurity: !!this.fileUploadSecurity,
      xssProtection: !!this.xssProtection,
      securityMonitor: !!this.securityMonitor,
      rateLimiter: !!this.rateLimiter
    };
  }

  async addCustomRule(rule: SecurityRule): Promise<void> {
    this.config.customRules.push(rule);
    this.config.customRules.sort((a, b) => a.priority - b.priority);
  }

  async removeCustomRule(ruleName: string): Promise<boolean> {
    const index = this.config.customRules.findIndex(rule => rule.name === ruleName);
    if (index !== -1) {
      this.config.customRules.splice(index, 1);
      return true;
    }
    return false;
  }

  updateConfiguration(updates: Partial<EnhancedSecurityConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export factory function
export function createEnhancedSecurityMiddleware(
  redis: Redis,
  prisma?: PrismaClient,
  config?: Partial<EnhancedSecurityConfig>
): EnhancedSecurityMiddleware {
  return new EnhancedSecurityMiddleware(redis, prisma, config);
}
