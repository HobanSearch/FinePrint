import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';

// JWT utilities
export { JWTKeyManager } from './jwt/keyManager';
export { JWTTokenManager } from './jwt/tokenManager';
export * from './jwt/types';

// Password management
export { PasswordManager } from './password/passwordManager';
export * from './password/types';

// Session management
export { SessionManager } from './session/sessionManager';
export * from './session/types';

// MFA support
export { MFAManager } from './mfa/mfaManager';
export * from './mfa/types';

// OAuth2 integrations
export { OAuth2Manager } from './oauth/oauthManager';
export * from './oauth/types';

// Rate limiting
export { AuthRateLimiter } from './rateLimit/rateLimiter';
export * from './rateLimit/types';

// Audit logging
export { AuditLogger } from './audit/auditLogger';
export * from './audit/types';

// Configuration interfaces
import { 
  JWTManagerConfig,
  PasswordConfig,
  SessionConfig,
  MFAConfig,
  OAuth2Config,
  RateLimitConfig,
  AuditConfig
} from './types';

const logger = createServiceLogger('auth-manager');

/**
 * Complete authentication and security configuration
 */
export interface AuthConfig {
  jwt: JWTManagerConfig;
  password: PasswordConfig;
  session: SessionConfig;
  mfa: MFAConfig;
  oauth: OAuth2Config;
  rateLimit: RateLimitConfig;
  audit: AuditConfig;
}

/**
 * Main authentication manager that orchestrates all auth components
 */
export class AuthManager {
  private cache: CacheManager;
  private config: AuthConfig;
  
  public jwt: JWTTokenManager;
  public password: PasswordManager;
  public session: SessionManager;
  public mfa: MFAManager;
  public oauth: OAuth2Manager;
  public rateLimit: AuthRateLimiter;
  public audit: AuditLogger;

  constructor(cache: CacheManager, config: AuthConfig) {
    this.cache = cache;
    this.config = config;

    // Initialize all managers
    this.jwt = new JWTTokenManager(cache, config.jwt);
    this.password = new PasswordManager(cache, config.password);
    this.session = new SessionManager(cache, config.session);
    this.mfa = new MFAManager(cache, config.mfa);
    this.oauth = new OAuth2Manager(cache, config.oauth);
    this.rateLimit = new AuthRateLimiter(cache, config.rateLimit);
    this.audit = new AuditLogger(cache, config.audit);

    logger.info('Auth Manager initialized with all components');
  }

  /**
   * Get comprehensive security status
   */
  async getSecurityStatus(): Promise<{
    jwt: any;
    sessions: any;
    mfa: any;
    oauth: any;
    rateLimit: any;
    audit: any;
  }> {
    try {
      const [jwtStats, sessionStats, mfaStats, oauthStats, rateLimitStats, auditStats] = await Promise.all([
        this.jwt.getTokenStats(),
        this.session.getSessionStats(),
        this.mfa.getMFAStats(),
        this.oauth.getOAuth2Stats(),
        this.rateLimit.getStats(),
        this.audit.getStats()
      ]);

      return {
        jwt: jwtStats,
        sessions: sessionStats,
        mfa: mfaStats,
        oauth: oauthStats,
        rateLimit: rateLimitStats,
        audit: auditStats
      };
    } catch (error) {
      logger.error('Failed to get security status', { error });
      throw new Error('Security status retrieval failed');
    }
  }

  /**
   * Perform maintenance on all auth components
   */
  async performMaintenance(): Promise<{
    jwt: void;
    password: void;
    session: void;
    mfa: void;
    oauth: void;
    rateLimit: void;
    audit: number;
  }> {
    try {
      logger.info('Starting comprehensive auth maintenance');

      const results = await Promise.allSettled([
        this.jwt.performMaintenance(),
        this.password.performMaintenance(),
        this.session.performMaintenance(),
        this.mfa.performMaintenance(),
        this.oauth.performMaintenance(),
        this.rateLimit.performMaintenance(),
        this.audit.cleanup()
      ]);

      const maintenanceResults = {
        jwt: results[0].status === 'fulfilled' ? results[0].value : undefined,
        password: results[1].status === 'fulfilled' ? results[1].value : undefined,
        session: results[2].status === 'fulfilled' ? results[2].value : undefined,
        mfa: results[3].status === 'fulfilled' ? results[3].value : undefined,
        oauth: results[4].status === 'fulfilled' ? results[4].value : undefined,
        rateLimit: results[5].status === 'fulfilled' ? results[5].value : undefined,
        audit: results[6].status === 'fulfilled' ? results[6].value : 0
      };

      // Log any failed maintenance operations
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const componentNames = ['jwt', 'password', 'session', 'mfa', 'oauth', 'rateLimit', 'audit'];
          logger.error(`Maintenance failed for ${componentNames[index]}`, { 
            error: result.reason 
          });
        }
      });

      logger.info('Auth maintenance completed');
      return maintenanceResults;
    } catch (error) {
      logger.error('Auth maintenance failed', { error });
      throw new Error('Maintenance operation failed');
    }
  }

  /**
   * Gracefully shutdown all auth components
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down Auth Manager');

      // Cleanup JWT key manager
      await this.jwt.cleanup();

      logger.info('Auth Manager shutdown completed');
    } catch (error) {
      logger.error('Auth Manager shutdown failed', { error });
      throw new Error('Shutdown failed');
    }
  }

  /**
   * Health check for all auth components
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, 'healthy' | 'unhealthy'>;
    details: Record<string, any>;
  }> {
    try {
      const checks = {
        cache: 'healthy' as 'healthy' | 'unhealthy',
        jwt: 'healthy' as 'healthy' | 'unhealthy',
        session: 'healthy' as 'healthy' | 'unhealthy',
        mfa: 'healthy' as 'healthy' | 'unhealthy',
        oauth: 'healthy' as 'healthy' | 'unhealthy',
        rateLimit: 'healthy' as 'healthy' | 'unhealthy',
        audit: 'healthy' as 'healthy' | 'unhealthy'
      };

      const details: Record<string, any> = {};

      // Check cache connectivity
      try {
        const cacheHealth = await this.cache.ping();
        checks.cache = cacheHealth ? 'healthy' : 'unhealthy';
        details.cache = { connected: cacheHealth };
      } catch (error) {
        checks.cache = 'unhealthy';
        details.cache = { error: error.message };
      }

      // Check JWT functionality
      try {
        const jwtStatus = await this.jwt.getTokenStats();
        checks.jwt = 'healthy';
        details.jwt = { activeTokens: jwtStatus.activeAccessTokens + jwtStatus.activeRefreshTokens };
      } catch (error) {
        checks.jwt = 'unhealthy';
        details.jwt = { error: error.message };
      }

      // Check session management
      try {
        const sessionStatus = await this.session.getSessionStats();
        checks.session = 'healthy';
        details.session = { activeSessions: sessionStatus.totalActiveSessions };
      } catch (error) {
        checks.session = 'unhealthy';
        details.session = { error: error.message };
      }

      // Check MFA
      try {
        const mfaStatus = await this.mfa.getMFAStats();
        checks.mfa = 'healthy';
        details.mfa = { enabledUsers: mfaStatus.enabledUsers };
      } catch (error) {
        checks.mfa = 'unhealthy';
        details.mfa = { error: error.message };
      }

      // Check OAuth
      try {
        const oauthStatus = await this.oauth.getOAuth2Stats();
        checks.oauth = 'healthy';
        details.oauth = { totalAccounts: oauthStatus.totalAccounts };
      } catch (error) {
        checks.oauth = 'unhealthy';
        details.oauth = { error: error.message };
      }

      // Check rate limiting
      try {
        const rateLimitStatus = await this.rateLimit.getStats();
        checks.rateLimit = 'healthy';
        details.rateLimit = { totalRequests: rateLimitStatus.totalRequests };
      } catch (error) {
        checks.rateLimit = 'unhealthy';
        details.rateLimit = { error: error.message };
      }

      // Check audit logging
      try {
        const auditStatus = await this.audit.getStats();
        checks.audit = 'healthy';
        details.audit = { totalEvents: auditStatus.totalEvents };
      } catch (error) {
        checks.audit = 'unhealthy';
        details.audit = { error: error.message };
      }

      // Determine overall status
      const unhealthyComponents = Object.values(checks).filter(status => status === 'unhealthy').length;
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

      if (unhealthyComponents === 0) {
        overallStatus = 'healthy';
      } else if (unhealthyComponents <= 2) {
        overallStatus = 'degraded';
      } else {
        overallStatus = 'unhealthy';
      }

      return {
        status: overallStatus,
        components: checks,
        details
      };
    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        status: 'unhealthy',
        components: {
          cache: 'unhealthy',
          jwt: 'unhealthy',
          session: 'unhealthy',
          mfa: 'unhealthy',
          oauth: 'unhealthy',
          rateLimit: 'unhealthy',
          audit: 'unhealthy'
        },
        details: { error: error.message }
      };
    }
  }
}

/**
 * Create default auth configuration
 */
export function createDefaultAuthConfig(): AuthConfig {
  return {
    jwt: {
      algorithm: 'RS256',
      issuer: 'fineprintai',
      audience: 'fineprintai-users',
      accessTokenTTL: 900, // 15 minutes
      refreshTokenTTL: 2592000, // 30 days
      keyRotation: {
        rotationIntervalHours: 24,
        maxKeyAge: 172800, // 48 hours
        keyOverlapPeriod: 86400, // 24 hours
        autoRotate: true
      },
      blacklistEnabled: true,
      maxRefreshTokensPerUser: 5,
      deviceTrackingEnabled: true
    },
    password: {
      saltRounds: 12,
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true,
      preventCommonPasswords: true,
      preventUserInfoInPassword: true,
      maxPasswordAge: 90, // 90 days
      passwordHistoryCount: 5
    },
    session: {
      ttl: 3600, // 1 hour
      extendOnActivity: true,
      maxConcurrentSessions: 5,
      deviceTrackingEnabled: true,
      geoLocationTracking: true,
      suspiciousActivityDetection: true,
      sessionCookieName: 'fpa_session',
      secureSessionsOnly: true,
      sameSitePolicy: 'strict'
    },
    mfa: {
      totp: {
        enabled: true,
        issuer: 'FinePrint AI',
        window: 2,
        stepSize: 30
      },
      sms: {
        enabled: true,
        provider: 'twilio',
        from: '+1234567890',
        rateLimitPerHour: 10,
        codeLength: 6,
        codeExpiry: 300 // 5 minutes
      },
      email: {
        enabled: true,
        from: 'security@fineprintai.com',
        rateLimitPerHour: 10,
        codeLength: 6,
        codeExpiry: 300, // 5 minutes
        template: 'mfa-verification'
      },
      backup: {
        enabled: true,
        codeCount: 10,
        codeLength: 8
      },
      enforcement: {
        requireForNewDevices: true,
        requireForSensitiveOperations: true,
        maxFailedAttempts: 5,
        lockoutDuration: 900 // 15 minutes
      }
    },
    oauth: {
      google: {
        enabled: true,
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
        scopes: ['openid', 'email', 'profile']
      },
      microsoft: {
        enabled: true,
        clientId: process.env.MICROSOFT_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
        redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
        scopes: ['openid', 'email', 'profile'],
        tenantId: 'common'
      },
      security: {
        stateExpiry: 600, // 10 minutes
        nonceExpiry: 600, // 10 minutes
        maxRetries: 3,
        rateLimitPerHour: 20
      }
    },
    rateLimit: {
      rules: [
        {
          id: 'login-attempts',
          name: 'Login Attempts',
          endpoint: '/auth/login',
          method: 'POST',
          windowMs: 900000, // 15 minutes
          max: 5,
          blockDuration: 900000 // 15 minutes
        },
        {
          id: 'password-reset',
          name: 'Password Reset',
          endpoint: '/auth/password/reset',
          method: 'POST',
          windowMs: 3600000, // 1 hour
          max: 3,
          blockDuration: 3600000 // 1 hour
        },
        {
          id: 'mfa-attempts',
          name: 'MFA Attempts',
          endpoint: '/auth/mfa/verify',
          method: 'POST',
          windowMs: 300000, // 5 minutes
          max: 5,
          blockDuration: 900000 // 15 minutes
        },
        {
          id: 'oauth-requests',
          name: 'OAuth Requests',
          endpoint: /\/auth\/oauth\/.*/,
          windowMs: 3600000, // 1 hour
          max: 20
        }
      ],
      storage: 'redis',
      keyGenerator: (req) => `${req.ip}:${req.path}`,
      headers: {
        total: 'X-RateLimit-Limit',
        remaining: 'X-RateLimit-Remaining',
        reset: 'X-RateLimit-Reset',
        retryAfter: 'Retry-After'
      }
    },
    audit: {
      enabled: true,
      storage: 'redis',
      retention: {
        days: 90,
        maxEntries: 1000000
      },
      levels: [AuditLevel.INFO, AuditLevel.WARN, AuditLevel.ERROR, AuditLevel.CRITICAL],
      sensitiveFields: ['password', 'token', 'secret', 'key', 'credential'],
      encryption: {
        enabled: false // Enable in production with proper key management
      },
      forwarding: {
        enabled: false,
        endpoints: [],
        headers: {}
      }
    }
  };
}

// Import and re-export types
import { 
  AuditLevel,
  AuditEventType
} from './audit/types';

export { AuditLevel, AuditEventType };

// Export default instance creator
export default AuthManager;