// Comprehensive Security Middleware Integration
// Orchestrates all security components for complete protection

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import * as Redis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// Import all security components
import { mfaService } from '../auth/mfa';
import { kmsService } from '../encryption/kms';
import { inputSanitizer } from '../validation/input-sanitizer';
import { csrfProtection } from '../csrf/csrf-protection';
import { securityHeaders } from '../headers/security-headers';
import { createRateLimiter } from '../rate-limiting/advanced-rate-limiter';
import { createSecurityMonitor } from '../monitoring/security-monitor';
import { auditLogger } from '../audit/audit-logger';
import { gdprCompliance } from '../compliance/gdpr-compliance';
import { createDatabaseSecurity } from '../database/db-security';
import { 
  SecurityError, 
  AuthenticationError, 
  AuthorizationError, 
  ValidationError,
  SecurityUtils
} from '../index';

export interface SecurityMiddlewareConfig {
  // Feature toggles
  enableRateLimiting: boolean;
  enableCSRFProtection: boolean;
  enableSecurityHeaders: boolean;
  enableInputValidation: boolean;
  enableSecurityMonitoring: boolean;
  enableAuditLogging: boolean;
  enableGDPRCompliance: boolean;
  enableDatabaseSecurity: boolean;
  enableMFA: boolean;
  
  // Security levels
  securityLevel: 'basic' | 'standard' | 'enhanced' | 'maximum';
  
  // Environment settings
  environment: 'development' | 'staging' | 'production';
  
  // Custom configuration
  customRules: SecurityRule[];
  exemptPaths: string[];
  exemptIPs: string[];
}

export interface SecurityRule {
  name: string;
  condition: (request: FastifyRequest) => boolean;
  action: 'allow' | 'deny' | 'log' | 'challenge';
  priority: number;
  message?: string;
}

export interface SecurityContext {
  userId?: string;
  sessionId?: string;
  userAgent: string;
  sourceIP: string;
  riskScore: number;
  threatLevel: 'low' | 'medium' | 'high' | 'critical';
  mfaRequired: boolean;
  deviceTrusted: boolean;
  geoLocation?: {
    country: string;
    region: string;
    city: string;
  };
}

export class SecurityMiddleware {
  private config: SecurityMiddlewareConfig;
  private redis: Redis;
  private prisma: PrismaClient;
  private rateLimiter: any;
  private securityMonitor: any;
  private databaseSecurity: any;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: Partial<SecurityMiddlewareConfig> = {}
  ) {
    this.redis = redis;
    this.prisma = prisma;
    this.config = {
      enableRateLimiting: true,
      enableCSRFProtection: true,
      enableSecurityHeaders: true,
      enableInputValidation: true,
      enableSecurityMonitoring: true,
      enableAuditLogging: true,
      enableGDPRCompliance: true,
      enableDatabaseSecurity: true,
      enableMFA: true,
      securityLevel: 'enhanced',
      environment: 'production',
      customRules: [],
      exemptPaths: ['/health', '/metrics', '/favicon.ico'],
      exemptIPs: [],
      ...config
    };

    this.initializeSecurityComponents();
  }

  /**
   * Initialize all security components
   */
  private initializeSecurityComponents(): void {
    if (this.config.enableRateLimiting) {
      this.rateLimiter = createRateLimiter(this.redis);
    }

    if (this.config.enableSecurityMonitoring) {
      this.securityMonitor = createSecurityMonitor(this.redis);
    }

    if (this.config.enableDatabaseSecurity) {
      this.databaseSecurity = createDatabaseSecurity(this.prisma);
    }
  }

  /**
   * Register all security middleware with Fastify
   */
  async register(fastify: FastifyInstance): Promise<void> {
    // 1. Security Headers (first layer)
    if (this.config.enableSecurityHeaders) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', securityHeaders.middleware());
      });
    }

    // 2. Rate Limiting (second layer)
    if (this.config.enableRateLimiting) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', this.rateLimiter.middleware());
      });
    }

    // 3. Security Monitoring (third layer)
    if (this.config.enableSecurityMonitoring) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', this.securityMonitor.middleware());
      });
    }

    // 4. GDPR Compliance (fourth layer)
    if (this.config.enableGDPRCompliance) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', gdprCompliance.consentMiddleware());
      });
    }

    // 5. Input Validation (fifth layer)
    if (this.config.enableInputValidation) {
      await fastify.register(async (fastify) => {
        fastify.addHook('preValidation', this.inputValidationMiddleware());
      });
    }

    // 6. CSRF Protection (sixth layer)
    if (this.config.enableCSRFProtection) {
      await fastify.register(async (fastify) => {
        fastify.addHook('preHandler', csrfProtection.verifyTokenMiddleware());
        fastify.addHook('onSend', csrfProtection.setTokenMiddleware());
      });
    }

    // 7. Audit Logging (final layer)
    if (this.config.enableAuditLogging) {
      await fastify.register(async (fastify) => {
        fastify.addHook('onRequest', auditLogger.middleware());
      });
    }

    // Register security routes
    await this.registerSecurityRoutes(fastify);

    // Global error handler for security errors
    fastify.setErrorHandler(this.securityErrorHandler());
  }

  /**
   * Main security middleware that orchestrates all security checks
   */
  middleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip exempt paths
      if (this.isExemptPath(request.url)) {
        return;
      }

      // Skip exempt IPs
      const clientIP = SecurityUtils.extractClientIP(request);
      if (this.config.exemptIPs.includes(clientIP)) {
        return;
      }

      try {
        // Build security context
        const securityContext = await this.buildSecurityContext(request);

        // Apply custom security rules
        await this.applyCustomRules(request, reply, securityContext);

        // Check threat level and apply appropriate measures
        await this.applyThreatBasedSecurity(request, reply, securityContext);

        // Add security context to request
        (request as any).securityContext = securityContext;

      } catch (error) {
        if (error instanceof SecurityError) {
          throw error;
        }
        throw new SecurityError('Security validation failed', 'SECURITY_ERROR');
      }
    };
  }

  /**
   * Input validation middleware
   */
  private inputValidationMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === 'GET' || request.method === 'HEAD') {
        return; // Skip validation for read-only operations
      }

      try {
        // Validate request body
        if (request.body) {
          const sanitized = inputSanitizer.sanitizeJson(JSON.stringify(request.body));
          request.body = sanitized;
        }

        // Validate query parameters
        if (request.query && typeof request.query === 'object') {
          const sanitizedQuery: any = {};
          for (const [key, value] of Object.entries(request.query)) {
            if (typeof value === 'string') {
              sanitizedQuery[key] = inputSanitizer.sanitizeString(value, {
                removeHtml: true,
                removeSqlKeywords: true
              });
            } else {
              sanitizedQuery[key] = value;
            }
          }
          request.query = sanitizedQuery;
        }

        // Validate URL parameters
        if (request.params && typeof request.params === 'object') {
          const sanitizedParams: any = {};
          for (const [key, value] of Object.entries(request.params)) {
            if (typeof value === 'string') {
              sanitizedParams[key] = inputSanitizer.sanitizeString(value, {
                removeHtml: true,
                removeSqlKeywords: true,
                maxLength: 100
              });
            } else {
              sanitizedParams[key] = value;
            }
          }
          request.params = sanitizedParams;
        }

      } catch (error) {
        throw new ValidationError('Input validation failed: ' + error.message);
      }
    };
  }

  /**
   * Build security context for request
   */
  private async buildSecurityContext(request: FastifyRequest): Promise<SecurityContext> {
    const sourceIP = SecurityUtils.extractClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    const userId = this.extractUserId(request);
    const sessionId = this.extractSessionId(request);

    // Calculate risk score
    const riskScore = await this.calculateRiskScore(request, sourceIP, userAgent, userId);

    // Determine threat level
    const threatLevel = this.getThreatLevel(riskScore);

    // Check if MFA is required
    const mfaRequired = this.shouldRequireMFA(request, riskScore, userId);

    // Check if device is trusted
    const deviceTrusted = await this.isDeviceTrusted(userId, sourceIP, userAgent);

    return {
      userId,
      sessionId,
      userAgent,
      sourceIP,
      riskScore,
      threatLevel,
      mfaRequired,
      deviceTrusted
    };
  }

  /**
   * Calculate risk score for request
   */
  private async calculateRiskScore(
    request: FastifyRequest,
    sourceIP: string,
    userAgent: string,
    userId?: string
  ): Promise<number> {
    let score = 0;

    // Base score
    score += 1;

    // IP reputation check
    const ipReputation = await this.checkIPReputation(sourceIP);
    score += ipReputation * 2;

    // User agent analysis
    if (this.isSuspiciousUserAgent(userAgent)) {
      score += 3;
    }

    // Request patterns
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      score += 1;
    }

    // Path analysis
    if (this.isHighRiskPath(request.url)) {
      score += 2;
    }

    // Time-based analysis
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
      score += 1; // Activity outside normal hours
    }

    // User-specific factors
    if (userId) {
      const userRisk = await this.getUserRiskScore(userId);
      score += userRisk;
    }

    return Math.min(score, 10); // Cap at 10
  }

  /**
   * Apply custom security rules
   */
  private async applyCustomRules(
    request: FastifyRequest,
    reply: FastifyReply,
    context: SecurityContext
  ): Promise<void> {
    const sortedRules = this.config.customRules.sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (rule.condition(request)) {
        switch (rule.action) {
          case 'deny':
            throw new SecurityError(rule.message || 'Access denied by security rule', 'CUSTOM_RULE_DENY');
          
          case 'challenge':
            // Require additional authentication
            if (!context.mfaRequired) {
              context.mfaRequired = true;
            }
            break;
          
          case 'log':
            await this.securityMonitor?.logSecurityEvent({
              type: 'custom_rule_triggered',
              severity: 'medium',
              sourceIP: context.sourceIP,
              userAgent: context.userAgent,
              userId: context.userId,
              details: { ruleName: rule.name, action: rule.action }
            });
            break;
        }
      }
    }
  }

  /**
   * Apply threat-based security measures
   */
  private async applyThreatBasedSecurity(
    request: FastifyRequest,
    reply: FastifyReply,
    context: SecurityContext
  ): Promise<void> {
    switch (context.threatLevel) {
      case 'critical':
        // Block immediately
        throw new SecurityError('Request blocked due to critical threat level', 'CRITICAL_THREAT');

      case 'high':
        // Require MFA and additional verification
        context.mfaRequired = true;
        await this.requireAdditionalVerification(request, reply, context);
        break;

      case 'medium':
        // Require MFA for sensitive operations
        if (this.isSensitiveOperation(request)) {
          context.mfaRequired = true;
        }
        break;

      case 'low':
        // Allow with monitoring
        break;
    }
  }

  /**
   * Register security-related routes
   */
  private async registerSecurityRoutes(fastify: FastifyInstance): Promise<void> {
    // CSRF token endpoint
    fastify.get('/api/security/csrf-token', csrfProtection.getTokenHandler());

    // Security status endpoint
    fastify.get('/api/security/status', async (request, reply) => {
      const status = {
        timestamp: new Date().toISOString(),
        securityLevel: this.config.securityLevel,
        activeFeatures: this.getActiveFeatures(),
        threatLevel: 'low', // Would be dynamic based on current threats
        systemHealth: 'healthy'
      };
      
      return reply.send({ success: true, data: status });
    });

    // Security headers test endpoint
    fastify.get('/api/security/headers', securityHeaders.cspReportHandler());

    // MFA setup endpoints (if MFA is enabled)
    if (this.config.enableMFA) {
      fastify.post('/api/security/mfa/setup', async (request, reply) => {
        // MFA setup implementation
        return reply.send({ success: true, message: 'MFA setup initiated' });
      });
    }
  }

  /**
   * Security error handler
   */
  private securityErrorHandler() {
    return async (error: Error, request: FastifyRequest, reply: FastifyReply) => {
      // Log security errors
      await auditLogger.logSecurity(
        'security_error',
        this.extractUserId(request),
        request,
        {
          error: error.message,
          stack: error.stack,
          path: request.url,
          method: request.method
        }
      );

      if (error instanceof SecurityError) {
        return reply.status(error.statusCode).send({
          success: false,
          error: error.code,
          message: error.message
        });
      }

      if (error instanceof AuthenticationError) {
        return reply.status(401).send({
          success: false,
          error: 'AUTHENTICATION_REQUIRED',
          message: error.message
        });
      }

      if (error instanceof AuthorizationError) {
        return reply.status(403).send({
          success: false,
          error: 'ACCESS_DENIED',
          message: error.message
        });
      }

      if (error instanceof ValidationError) {
        return reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.message
        });
      }

      // Generic security error
      return reply.status(500).send({
        success: false,
        error: 'SECURITY_ERROR',
        message: 'A security error occurred'
      });
    };
  }

  // Helper methods
  private isExemptPath(path: string): boolean {
    return this.config.exemptPaths.some(exemptPath => path.startsWith(exemptPath));
  }

  private extractUserId(request: FastifyRequest): string | undefined {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token) as any;
        return decoded?.sub;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private extractSessionId(request: FastifyRequest): string | undefined {
    try {
      const authHeader = request.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.decode(token) as any;
        return decoded?.jti;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  private getThreatLevel(riskScore: number): 'low' | 'medium' | 'high' | 'critical' {
    if (riskScore >= 8) return 'critical';
    if (riskScore >= 6) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }

  private shouldRequireMFA(request: FastifyRequest, riskScore: number, userId?: string): boolean {
    // High risk score requires MFA
    if (riskScore >= 6) return true;

    // Sensitive operations require MFA
    if (this.isSensitiveOperation(request)) return true;

    // Admin operations require MFA
    if (request.url.startsWith('/api/admin')) return true;

    return false;
  }

  private async isDeviceTrusted(userId?: string, sourceIP?: string, userAgent?: string): Promise<boolean> {
    if (!userId || !sourceIP || !userAgent) return false;

    // Implementation would check trusted devices in database
    return false; // Conservative default
  }

  private async checkIPReputation(ip: string): Promise<number> {
    // Implementation would check IP against threat intelligence
    return 0; // Default to no additional risk
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
      '/api/admin', '/api/auth', '/api/user/delete',
      '/api/security', '/api/system'
    ];

    return highRiskPaths.some(riskPath => path.startsWith(riskPath));
  }

  private async getUserRiskScore(userId: string): Promise<number> {
    // Implementation would check user's historical risk factors
    return 0;
  }

  private async requireAdditionalVerification(
    request: FastifyRequest,
    reply: FastifyReply,
    context: SecurityContext
  ): Promise<void> {
    // Implementation would require additional verification steps
    // For now, just log the requirement
    await auditLogger.logSecurity(
      'additional_verification_required',
      context.userId,
      request,
      { riskScore: context.riskScore, threatLevel: context.threatLevel }
    );
  }

  private isSensitiveOperation(request: FastifyRequest): boolean {
    const sensitivePaths = [
      '/api/user/delete', '/api/user/export',
      '/api/admin', '/api/billing',
      '/api/documents/delete'
    ];

    const sensitiveMethods = ['DELETE', 'PUT'];

    return sensitivePaths.some(path => request.url.startsWith(path)) ||
           sensitiveMethods.includes(request.method);
  }

  private getActiveFeatures(): string[] {
    const features: string[] = [];
    
    if (this.config.enableRateLimiting) features.push('rate_limiting');
    if (this.config.enableCSRFProtection) features.push('csrf_protection');
    if (this.config.enableSecurityHeaders) features.push('security_headers');
    if (this.config.enableInputValidation) features.push('input_validation');
    if (this.config.enableSecurityMonitoring) features.push('security_monitoring');
    if (this.config.enableAuditLogging) features.push('audit_logging');
    if (this.config.enableGDPRCompliance) features.push('gdpr_compliance');
    if (this.config.enableDatabaseSecurity) features.push('database_security');
    if (this.config.enableMFA) features.push('mfa');

    return features;
  }
}

// Export factory function
export function createSecurityMiddleware(
  redis: Redis,
  prisma: PrismaClient,
  config?: Partial<SecurityMiddlewareConfig>
): SecurityMiddleware {
  return new SecurityMiddleware(redis, prisma, config);
}