/**
 * Fine Print AI - Comprehensive Cross-Platform Security Module
 * Enterprise-grade security implementation for web, mobile, and extension platforms
 */

// Core security exports
export * from './auth/unified-auth';
export * from './auth/mfa';
export * from './encryption/advanced-encryption';
export * from './compliance/unified-compliance';
export * from './monitoring/advanced-threat-detection';

// Platform-specific security
export * from './platform/web-security';
export * from './platform/mobile-security';
export * from './platform/extension-security';

// Existing security components
export * from './middleware/enhanced-security-middleware';
export * from './validation/zod-schemas';
export * from './security/xss-protection';
export * from './security/bot-detection';
export * from './security/file-upload-security';
export * from './monitoring/security-monitor';
export * from './audit/audit-logger';

// Security configuration interfaces
export interface CrossPlatformSecurityConfig {
  // Authentication configuration
  auth: {
    jwtSecret: string;
    jwtAccessExpiration: string;
    jwtRefreshExpiration: string;
    mfaSecret: string;
    sessionTimeout: number;
    maxConcurrentSessions: number;
    crossDeviceSync: boolean;
    biometricAuth: boolean;
  };

  // Encryption configuration
  encryption: {
    algorithm: string;
    keyLength: number;
    ivLength: number;
    tagLength: number;
    saltLength: number;
    iterations: number;
    masterKey: string;
    kmsEndpoint?: string;
    hsmEnabled: boolean;
    rotationInterval: number;
    gracePeriod: number;
    maxKeyAge: number;
    autoRotate: boolean;
  };

  // Compliance configuration
  compliance: {
    gdpr: {
      enabled: boolean;
      dataRetentionDays: number;
      consentRequired: boolean;
      rightToErasure: boolean;
      dataPortability: boolean;
      privacyByDesign: boolean;
    };
    ccpa: {
      enabled: boolean;
      saleOptOut: boolean;
      dataDisclosure: boolean;
      consumerRights: boolean;
    };
    hipaa: {
      enabled: boolean;
      baaRequired: boolean;
      auditLogging: boolean;
      accessControls: boolean;
      encryptionRequired: boolean;
    };
    sox: {
      enabled: boolean;
      auditTrails: boolean;
      changeControls: boolean;
      accessReviews: boolean;
    };
    fedramp: {
      enabled: boolean;
      securityLevel: 'low' | 'moderate' | 'high';
      continuousMonitoring: boolean;
      incidentResponse: boolean;
    };
  };

  // Monitoring configuration
  monitoring: {
    anomalyDetection: {
      enabled: boolean;
      sensitivity: 'low' | 'medium' | 'high';
      learningPeriod: number;
      alertThreshold: number;
    };
    behavioralAnalysis: {
      enabled: boolean;
      userProfilingEnabled: boolean;
      deviceTrackingEnabled: boolean;
      locationAnalysisEnabled: boolean;
    };
    realTimeMonitoring: {
      enabled: boolean;
      samplingRate: number;
      bufferSize: number;
      processingInterval: number;
    };
    incidentResponse: {
      autoBlocking: boolean;
      escalationEnabled: boolean;
      notificationChannels: string[];
      responseTimeouts: Record<string, number>;
    };
    threatIntelligence: {
      enabled: boolean;
      feeds: string[];
      updateInterval: number;
      confidence_threshold: number;
    };
  };

  // Platform-specific configurations
  platforms: {
    web: {
      csp: {
        enabled: boolean;
        strict: boolean;
        reportUri?: string;
        directives: Record<string, string[]>;
      };
      cookies: {
        secure: boolean;
        httpOnly: boolean;
        sameSite: 'strict' | 'lax' | 'none';
        maxAge: number;
      };
      https: {
        enforce: boolean;
        hsts: {
          enabled: boolean;
          maxAge: number;
          includeSubDomains: boolean;
          preload: boolean;
        };
      };
    };

    mobile: {
      certificatePinning: {
        enabled: boolean;
        pins: string[];
        backupPins: string[];
        enforceOnSubdomains: boolean;
        reportFailures: boolean;
      };
      deviceIntegrity: {
        jailbreakDetection: boolean;
        rootDetection: boolean;
        debuggerDetection: boolean;
        emulatorDetection: boolean;
        hookingDetection: boolean;
      };
      secureStorage: {
        useKeychain: boolean;
        useKeystore: boolean;
        biometricProtection: boolean;
        encryptionAlgorithm: string;
      };
    };

    extension: {
      permissions: {
        minimal: boolean;
        requestedPermissions: string[];
        optionalPermissions: string[];
        hostPermissions: string[];
      };
      contentSecurity: {
        isolatedWorlds: boolean;
        sandboxing: boolean;
        cspEnabled: boolean;
        strictMode: boolean;
      };
      communication: {
        encryptMessages: boolean;
        validateOrigin: boolean;
        rateLimit: boolean;
        messageTimeout: number;
      };
    };
  };
}

// Security error class
export class SecurityError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly timestamp: Date;

  constructor(message: string, code: string, statusCode: number = 403) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date();
  }
}

// Main security service factory
export class CrossPlatformSecurityService {
  private config: CrossPlatformSecurityConfig;
  private redis: any;
  private prisma: any;
  
  // Service instances
  public readonly auth: any;
  public readonly encryption: any;
  public readonly compliance: any;
  public readonly monitoring: any;
  public readonly webSecurity: any;
  public readonly mobileSecurity: any;
  public readonly extensionSecurity: any;

  constructor(
    redis: any,
    prisma: any,
    config: CrossPlatformSecurityConfig
  ) {
    this.config = config;
    this.redis = redis;
    this.prisma = prisma;

    // Initialize core services
    this.initializeCoreServices();
    
    // Initialize platform-specific services
    this.initializePlatformServices();

    // Setup cross-service integration
    this.setupServiceIntegration();
  }

  private initializeCoreServices(): void {
    // Authentication service
    this.auth = require('./auth/unified-auth').createUnifiedAuth(
      this.redis, 
      this.prisma, 
      this.config.auth
    );

    // Encryption service
    this.encryption = require('./encryption/advanced-encryption').createAdvancedEncryption(
      this.config.encryption,
      {
        rotationInterval: this.config.encryption.rotationInterval,
        gracePeriod: this.config.encryption.gracePeriod,
        maxKeyAge: this.config.encryption.maxKeyAge,
        autoRotate: this.config.encryption.autoRotate
      }
    );

    // Compliance service
    this.compliance = require('./compliance/unified-compliance').createUnifiedCompliance(
      this.redis,
      this.prisma,
      this.encryption,
      this.config.compliance
    );

    // Monitoring service
    this.monitoring = require('./monitoring/advanced-threat-detection').createAdvancedThreatDetection(
      this.redis,
      this.prisma,
      this.config.monitoring
    );
  }

  private initializePlatformServices(): void {
    // Web security
    this.webSecurity = require('./platform/web-security').createWebSecurity(
      this.config.platforms.web
    );

    // Mobile security
    this.mobileSecurity = require('./platform/mobile-security').createMobileSecurity(
      this.config.platforms.mobile
    );

    // Extension security
    this.extensionSecurity = require('./platform/extension-security').createExtensionSecurity(
      this.config.platforms.extension
    );
  }

  private setupServiceIntegration(): void {
    // Connect monitoring to compliance
    this.monitoring.on('securityEvent', async (event: any) => {
      if (event.type === 'data_access' || event.type === 'configuration_change') {
        await this.compliance.logAuditEvent({
          action: event.action,
          resource: event.resource,
          userId: event.userId,
          platform: event.source,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          result: event.result,
          riskLevel: this.mapSeverityToRiskLevel(event.severity),
          complianceFrameworks: this.getApplicableFrameworks(),
          metadata: event.metadata
        });
      }
    });

    // Connect auth to monitoring
    this.auth.on('authEvent', async (event: any) => {
      await this.monitoring.processSecurityEvent({
        type: 'authentication',
        severity: event.result === 'success' ? 'info' : 'warning',
        source: event.platform,
        userId: event.userId,
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        action: event.action,
        resource: 'auth',
        result: event.result,
        metadata: event.metadata
      });
    });

    // Connect platform services to core monitoring
    ['webSecurity', 'mobileSecurity', 'extensionSecurity'].forEach(platform => {
      if (this[platform] && this[platform].on) {
        this[platform].on('securityEvent', async (event: any) => {
          await this.monitoring.processSecurityEvent({
            ...event,
            source: platform.replace('Security', '')
          });
        });
      }
    });
  }

  /**
   * Get comprehensive security status across all platforms
   */
  async getSecurityStatus(): Promise<{
    overall: 'secure' | 'warning' | 'critical';
    score: number;
    platforms: Record<string, any>;
    compliance: any;
    threats: any;
  }> {
    const [
      complianceStatus,
      threatStatus,
      webMetrics,
      authMetrics,
      encryptionMetrics
    ] = await Promise.all([
      this.compliance.monitorCompliance(),
      this.monitoring.getMetrics(),
      this.webSecurity?.getMetrics?.() || {},
      this.auth.getMetrics?.() || {},
      this.encryption.getMetrics()
    ]);

    const overallScore = this.calculateOverallScore({
      compliance: complianceStatus.score,
      threats: threatStatus.riskScoreDistribution,
      platforms: { web: webMetrics }
    });

    return {
      overall: this.mapScoreToStatus(overallScore),
      score: overallScore,
      platforms: {
        web: webMetrics,
        mobile: {},
        extension: {}
      },
      compliance: complianceStatus,
      threats: threatStatus
    };
  }

  /**
   * Perform comprehensive security assessment
   */
  async performSecurityAssessment(): Promise<{
    timestamp: Date;
    assessment: {
      authentication: any;
      encryption: any;
      compliance: any;
      monitoring: any;
      platforms: any;
    };
    recommendations: string[];
    actionItems: Array<{
      priority: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      dueDate: Date;
    }>;
  }> {
    const assessment = {
      authentication: await this.assessAuthentication(),
      encryption: await this.assessEncryption(),
      compliance: await this.assessCompliance(),
      monitoring: await this.assessMonitoring(),
      platforms: await this.assessPlatforms()
    };

    const recommendations = this.generateRecommendations(assessment);
    const actionItems = this.generateActionItems(assessment);

    return {
      timestamp: new Date(),
      assessment,
      recommendations,
      actionItems
    };
  }

  // Private helper methods
  private mapSeverityToRiskLevel(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity) {
      case 'info': return 'low';
      case 'warning': return 'medium';
      case 'high': return 'high';
      case 'critical': return 'critical';
      default: return 'medium';
    }
  }

  private getApplicableFrameworks(): string[] {
    const frameworks: string[] = [];
    if (this.config.compliance.gdpr.enabled) frameworks.push('GDPR');
    if (this.config.compliance.ccpa.enabled) frameworks.push('CCPA');
    if (this.config.compliance.hipaa.enabled) frameworks.push('HIPAA');
    if (this.config.compliance.sox.enabled) frameworks.push('SOX');
    if (this.config.compliance.fedramp.enabled) frameworks.push('FedRAMP');
    return frameworks;
  }

  private calculateOverallScore(metrics: any): number {
    // Weighted scoring algorithm
    const weights = {
      compliance: 0.3,
      threats: 0.25,
      platforms: 0.25,
      auth: 0.2
    };

    let score = 0;
    score += metrics.compliance * weights.compliance;
    // Additional scoring logic...

    return Math.min(Math.max(score, 0), 100);
  }

  private mapScoreToStatus(score: number): 'secure' | 'warning' | 'critical' {
    if (score >= 85) return 'secure';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  // Assessment methods (placeholder implementations)
  private async assessAuthentication(): Promise<any> { return {}; }
  private async assessEncryption(): Promise<any> { return {}; }
  private async assessCompliance(): Promise<any> { return {}; }
  private async assessMonitoring(): Promise<any> { return {}; }
  private async assessPlatforms(): Promise<any> { return {}; }
  private generateRecommendations(assessment: any): string[] { return []; }
  private generateActionItems(assessment: any): any[] { return []; }
}

// Factory function for creating the main security service
export const createCrossPlatformSecurity = (
  redis: any,
  prisma: any,
  config: CrossPlatformSecurityConfig
) => {
  return new CrossPlatformSecurityService(redis, prisma, config);
};

// Default configuration for all environments
export const createDefaultSecurityConfig = (
  environment: 'development' | 'staging' | 'production'
): CrossPlatformSecurityConfig => {
  const baseConfig: CrossPlatformSecurityConfig = {
    auth: {
      jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
      jwtAccessExpiration: '15m',
      jwtRefreshExpiration: '7d',
      mfaSecret: process.env.MFA_SECRET || 'default-mfa-secret',
      sessionTimeout: 86400000, // 24 hours
      maxConcurrentSessions: 5,
      crossDeviceSync: true,
      biometricAuth: true
    },
    encryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 12,
      tagLength: 16,
      saltLength: 32,
      iterations: 100000,
      masterKey: process.env.MASTER_ENCRYPTION_KEY || 'default-master-key',
      hsmEnabled: environment === 'production',
      rotationInterval: environment === 'production' ? 90 : 365,
      gracePeriod: 30,
      maxKeyAge: 365,
      autoRotate: environment === 'production'
    },
    compliance: {
      gdpr: {
        enabled: environment !== 'development',
        dataRetentionDays: 365,
        consentRequired: true,
        rightToErasure: true,
        dataPortability: true,
        privacyByDesign: true
      },
      ccpa: {
        enabled: environment === 'production',
        saleOptOut: true,
        dataDisclosure: true,
        consumerRights: true
      },
      hipaa: {
        enabled: false, // Enable per customer requirement
        baaRequired: true,
        auditLogging: true,
        accessControls: true,
        encryptionRequired: true
      },
      sox: {
        enabled: false, // Enable for enterprise customers
        auditTrails: true,
        changeControls: true,
        accessReviews: true
      },
      fedramp: {
        enabled: false, // Enable for government customers
        securityLevel: 'moderate',
        continuousMonitoring: true,
        incidentResponse: true
      }
    },
    monitoring: {
      anomalyDetection: {
        enabled: true,
        sensitivity: environment === 'production' ? 'high' : 'medium',
        learningPeriod: 30,
        alertThreshold: 85
      },
      behavioralAnalysis: {
        enabled: environment !== 'development',
        userProfilingEnabled: true,
        deviceTrackingEnabled: true,
        locationAnalysisEnabled: true
      },
      realTimeMonitoring: {
        enabled: true,
        samplingRate: environment === 'production' ? 100 : 50,
        bufferSize: 1000,
        processingInterval: 10
      },
      incidentResponse: {
        autoBlocking: environment === 'production',
        escalationEnabled: true,
        notificationChannels: ['email', 'slack'],
        responseTimeouts: { low: 3600, medium: 1800, high: 300, critical: 60 }
      },
      threatIntelligence: {
        enabled: environment !== 'development',
        feeds: ['misp'],
        updateInterval: 24,
        confidence_threshold: 70
      }
    },
    platforms: {
      web: require('./platform/web-security').defaultWebSecurityConfig,
      mobile: require('./platform/mobile-security').defaultMobileSecurityConfig,
      extension: require('./platform/extension-security').defaultExtensionSecurityConfig
    }
  };

  // Environment-specific overrides
  if (environment === 'development') {
    baseConfig.platforms.web.https.enforce = false;
    baseConfig.platforms.web.csp.strict = false;
    baseConfig.platforms.mobile.deviceIntegrity.jailbreakDetection = false;
  }

  return baseConfig;
};

// Export default configuration
export const defaultSecurityConfig = createDefaultSecurityConfig('production');