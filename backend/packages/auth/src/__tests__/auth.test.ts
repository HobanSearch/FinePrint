import { AuthManager, createDefaultAuthConfig, AuditEventType, AuditLevel } from '../index';
import { CacheManager } from '@fineprintai/cache';

describe('AuthManager', () => {
  let auth: AuthManager;
  let cache: CacheManager;

  beforeAll(() => {
    cache = new CacheManager('test-auth');
    const config = createDefaultAuthConfig();
    auth = new AuthManager(cache, config);
  });

  afterAll(async () => {
    await auth.shutdown();
  });

  describe('JWT Token Management', () => {
    test('should generate and validate access token', async () => {
      // Generate access token
      const token = await auth.jwt.generateAccessToken({
        sub: 'test-user-123',
        email: 'test@example.com',
        role: 'user',
        subscriptionTier: 'premium'
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      // Validate token
      const validation = await auth.jwt.validateAccessToken(token);
      expect(validation.valid).toBe(true);
      expect(validation.payload?.sub).toBe('test-user-123');
      expect(validation.payload?.email).toBe('test@example.com');
    });

    test('should generate and rotate refresh token', async () => {
      const userId = 'test-user-123';
      
      // Generate refresh token
      const { token: refreshToken, tokenId } = await auth.jwt.generateRefreshToken(
        userId,
        'device-fingerprint-123',
        '192.168.1.1',
        'Test User Agent'
      );

      expect(refreshToken).toBeDefined();
      expect(tokenId).toBeDefined();

      // Validate refresh token
      const validation = await auth.jwt.validateRefreshToken(refreshToken);
      expect(validation.valid).toBe(true);
      expect(validation.payload?.sub).toBe(userId);

      // Rotate refresh token
      const rotatedTokens = await auth.jwt.rotateRefreshToken(
        refreshToken,
        'device-fingerprint-123',
        '192.168.1.1',
        'Test User Agent'
      );

      expect(rotatedTokens).toBeDefined();
      expect(rotatedTokens?.accessToken).toBeDefined();
      expect(rotatedTokens?.refreshToken).toBeDefined();

      // Old token should be revoked
      const oldValidation = await auth.jwt.validateRefreshToken(refreshToken);
      expect(oldValidation.valid).toBe(false);
    });

    test('should get token statistics', async () => {
      const stats = await auth.jwt.getTokenStats();
      expect(stats).toHaveProperty('activeAccessTokens');
      expect(stats).toHaveProperty('activeRefreshTokens');
      expect(stats).toHaveProperty('blacklistedTokens');
    });
  });

  describe('Password Management', () => {
    test('should hash and verify password', async () => {
      const password = 'TestPassword123!';
      
      // Hash password
      const hashedPassword = await auth.password.hashPassword(password);
      expect(hashedPassword.hash).toBeDefined();
      expect(hashedPassword.algorithm).toBe('bcrypt');
      expect(hashedPassword.rounds).toBe(12);

      // Verify correct password
      const isValid = await auth.password.verifyPassword(password, hashedPassword.hash);
      expect(isValid).toBe(true);

      // Verify incorrect password
      const isInvalid = await auth.password.verifyPassword('WrongPassword', hashedPassword.hash);
      expect(isInvalid).toBe(false);
    });

    test('should validate password strength', async () => {
      // Test weak password
      const weakValidation = await auth.password.validatePassword('123', {
        email: 'test@example.com'
      });
      expect(weakValidation.valid).toBe(false);
      expect(weakValidation.errors.length).toBeGreaterThan(0);

      // Test strong password
      const strongValidation = await auth.password.validatePassword('StrongP@ssw0rd!', {
        email: 'test@example.com',
        name: 'Test User'
      });
      expect(strongValidation.valid).toBe(true);
      expect(strongValidation.score).toBeGreaterThanOrEqual(2);
    });

    test('should generate and validate reset token', async () => {
      const userId = 'test-user-123';
      
      // Generate reset token
      const resetToken = await auth.password.generatePasswordResetToken(
        userId,
        '192.168.1.1',
        'Test User Agent'
      );
      expect(resetToken).toBeDefined();

      // Validate reset token
      const validation = await auth.password.validatePasswordResetToken(resetToken);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);

      // Token should be consumed after validation
      const secondValidation = await auth.password.validatePasswordResetToken(resetToken);
      expect(secondValidation.valid).toBe(false);
    });
  });

  describe('Session Management', () => {
    test('should create and manage session', async () => {
      const userId = 'test-user-123';
      
      // Create session
      const session = await auth.session.createSession(
        userId,
        '192.168.1.1',
        'Test User Agent',
        'device-fingerprint-123',
        { theme: 'dark', language: 'en' }
      );

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(userId);
      expect(session.active).toBe(true);

      // Update session activity
      const updated = await auth.session.updateSessionActivity(
        session.id,
        'page_view',
        { page: '/dashboard' }
      );
      expect(updated).toBe(true);

      // Get session
      const retrievedSession = await auth.session.getSession(session.id);
      expect(retrievedSession).toBeDefined();
      expect(retrievedSession?.id).toBe(session.id);

      // Validate session
      const validation = await auth.session.validateSession(session.id);
      expect(validation.valid).toBe(true);
      expect(validation.userId).toBe(userId);

      // Terminate session
      const terminated = await auth.session.terminateSession(session.id, 'test_cleanup');
      expect(terminated).toBe(true);

      // Session should no longer be valid
      const invalidValidation = await auth.session.validateSession(session.id);
      expect(invalidValidation.valid).toBe(false);
    });

    test('should get session statistics', async () => {
      const stats = await auth.session.getSessionStats();
      expect(stats).toHaveProperty('totalActiveSessions');
      expect(stats).toHaveProperty('userActiveSessions');
      expect(stats).toHaveProperty('averageSessionDuration');
    });
  });

  describe('MFA Management', () => {
    test('should setup TOTP MFA', async () => {
      const userId = 'test-user-123';
      
      // Setup TOTP
      const setup = await auth.mfa.setupMFAMethod(userId, { type: 'totp' });
      expect(setup.method.type).toBe('totp');
      expect(setup.setupData?.secret).toBeDefined();
      expect(setup.setupData?.qrCode).toBeDefined();

      // Get user MFA methods
      const methods = await auth.mfa.getUserMFAMethods(userId);
      expect(methods.length).toBeGreaterThan(0);
      expect(methods[0].type).toBe('totp');
    });

    test('should setup SMS MFA', async () => {
      const userId = 'test-user-456';
      
      // Setup SMS (will fail in test environment without Twilio)
      try {
        const setup = await auth.mfa.setupMFAMethod(userId, { 
          type: 'sms',
          phoneNumber: '+1234567890'
        });
        expect(setup.method.type).toBe('sms');
      } catch (error) {
        // Expected to fail without SMS provider configuration
        expect(error.message).toContain('SMS provider not configured');
      }
    });

    test('should get MFA statistics', async () => {
      const stats = await auth.mfa.getMFAStats();
      expect(stats).toHaveProperty('totalUsers');
      expect(stats).toHaveProperty('enabledUsers');
      expect(stats).toHaveProperty('methodDistribution');
    });
  });

  describe('OAuth2 Management', () => {
    test('should generate OAuth2 authorization URL', async () => {
      // Mock OAuth2 config for testing
      const config = createDefaultAuthConfig();
      config.oauth.google.clientId = 'test-client-id';
      config.oauth.google.redirectUri = 'http://localhost:3000/auth/callback';
      
      const testAuth = new AuthManager(cache, config);
      
      const authResponse = await testAuth.oauth.generateAuthorizationUrl({
        provider: 'google',
        redirectUrl: '/dashboard'
      }, '192.168.1.1', 'Test User Agent');

      expect(authResponse.authorizationUrl).toContain('accounts.google.com');
      expect(authResponse.authorizationUrl).toContain('test-client-id');
      expect(authResponse.state).toBeDefined();
      expect(authResponse.nonce).toBeDefined();

      await testAuth.shutdown();
    });

    test('should get OAuth2 statistics', async () => {
      const stats = await auth.oauth.getOAuth2Stats();
      expect(stats).toHaveProperty('totalAccounts');
      expect(stats).toHaveProperty('accountsByProvider');
      expect(stats).toHaveProperty('linkedAccounts');
    });
  });

  describe('Rate Limiting', () => {
    test('should check rate limits', async () => {
      const request = {
        ip: '192.168.1.1',
        method: 'POST',
        path: '/auth/login',
        userId: 'test-user-123',
        userAgent: 'Test User Agent',
        headers: {},
        timestamp: new Date()
      };

      const rateLimitInfo = await auth.rateLimit.checkRateLimit(request);
      expect(rateLimitInfo.blocked).toBe(false);
      expect(rateLimitInfo.remaining).toBeGreaterThan(0);
      expect(rateLimitInfo.total).toBeGreaterThan(0);

      // Record successful result
      await auth.rateLimit.recordResult(rateLimitInfo.key, true, {
        responseTime: 150
      });
    });

    test('should block IP address', async () => {
      const testIP = '192.168.1.100';
      
      // Block IP
      await auth.rateLimit.blockIP(testIP, 60000, 'test_block', 'medium');
      
      // Check if IP is blocked
      const isBlocked = await auth.rateLimit.isIPBlocked(testIP);
      expect(isBlocked).toBe(true);

      // Unblock IP
      await auth.rateLimit.unblockIP(testIP);
      
      const isStillBlocked = await auth.rateLimit.isIPBlocked(testIP);
      expect(isStillBlocked).toBe(false);
    });

    test('should get rate limiting statistics', async () => {
      const stats = await auth.rateLimit.getStats();
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('blockedRequests');
      expect(stats).toHaveProperty('ruleStats');
    });
  });

  describe('Audit Logging', () => {
    test('should log audit events', async () => {
      // Log authentication event
      await auth.audit.logEvent(
        AuditEventType.LOGIN_SUCCESS,
        AuditLevel.INFO,
        {
          type: 'user',
          id: 'test-user-123',
          email: 'test@example.com',
          ipAddress: '192.168.1.1',
          userAgent: 'Test User Agent'
        },
        'user_login',
        'success',
        {
          loginMethod: 'password',
          mfaUsed: false
        },
        {
          type: 'user',
          id: 'test-user-123',
          name: 'test@example.com'
        },
        {
          requestId: 'test-req-123'
        }
      );

      // Log security event
      await auth.audit.logEvent(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        AuditLevel.WARN,
        {
          type: 'user',
          id: 'test-user-456',
          ipAddress: '192.168.1.100'
        },
        'suspicious_login_pattern',
        'failure',
        {
          pattern: 'multiple_failed_attempts',
          attemptCount: 5
        }
      );
    });

    test('should query audit events', async () => {
      const events = await auth.audit.queryEvents({
        startDate: new Date(Date.now() - 3600000), // Last hour
        types: [AuditEventType.LOGIN_SUCCESS, AuditEventType.SUSPICIOUS_ACTIVITY],
        limit: 10
      });

      expect(Array.isArray(events)).toBe(true);
      // Should have at least the events we just logged
      expect(events.length).toBeGreaterThan(0);
    });

    test('should get audit statistics', async () => {
      const stats = await auth.audit.getStats();
      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('eventsByType');
      expect(stats).toHaveProperty('eventsByLevel');
      expect(stats).toHaveProperty('recentEvents');
    });
  });

  describe('System Management', () => {
    test('should perform health check', async () => {
      const health = await auth.healthCheck();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(health.components).toHaveProperty('cache');
      expect(health.components).toHaveProperty('jwt');
      expect(health.components).toHaveProperty('session');
    });

    test('should get security status', async () => {
      const status = await auth.getSecurityStatus();
      expect(status).toHaveProperty('jwt');
      expect(status).toHaveProperty('sessions');
      expect(status).toHaveProperty('mfa');
      expect(status).toHaveProperty('oauth');
      expect(status).toHaveProperty('rateLimit');
      expect(status).toHaveProperty('audit');
    });

    test('should perform maintenance', async () => {
      const results = await auth.performMaintenance();
      expect(results).toHaveProperty('jwt');
      expect(results).toHaveProperty('password');
      expect(results).toHaveProperty('session');
      expect(results).toHaveProperty('mfa');
      expect(results).toHaveProperty('oauth');
      expect(results).toHaveProperty('rateLimit');
      expect(results).toHaveProperty('audit');
    });
  });

  describe('Integration Tests', () => {
    test('should handle complete authentication flow', async () => {
      const userId = 'integration-test-user';
      const email = 'integration@example.com';
      const password = 'IntegrationP@ss123!';
      const ipAddress = '192.168.1.200';
      const userAgent = 'Integration Test Agent';

      // 1. Hash password (registration)
      const hashedPassword = await auth.password.hashPassword(password);
      expect(hashedPassword.hash).toBeDefined();

      // 2. Create session (login)
      const session = await auth.session.createSession(
        userId,
        ipAddress,
        userAgent,
        'integration-device-fingerprint'
      );
      expect(session.active).toBe(true);

      // 3. Generate JWT tokens
      const accessToken = await auth.jwt.generateAccessToken({
        sub: userId,
        email,
        role: 'user',
        subscriptionTier: 'basic'
      });
      expect(accessToken).toBeDefined();

      // 4. Log authentication success
      await auth.audit.logEvent(
        AuditEventType.LOGIN_SUCCESS,
        AuditLevel.INFO,
        {
          type: 'user',
          id: userId,
          email,
          ipAddress,
          userAgent,
          sessionId: session.id
        },
        'complete_authentication_flow',
        'success',
        {
          method: 'password',
          sessionId: session.id
        }
      );

      // 5. Setup MFA for enhanced security
      const mfaSetup = await auth.mfa.setupMFAMethod(userId, { type: 'totp' });
      expect(mfaSetup.method.type).toBe('totp');

      // 6. Update session activity
      await auth.session.updateSessionActivity(
        session.id,
        'authentication_complete',
        { mfaSetup: true }
      );

      // 7. Validate everything is working
      const tokenValidation = await auth.jwt.validateAccessToken(accessToken);
      expect(tokenValidation.valid).toBe(true);

      const sessionValidation = await auth.session.validateSession(session.id);
      expect(sessionValidation.valid).toBe(true);

      // 8. Cleanup
      await auth.session.terminateSession(session.id, 'integration_test_cleanup');
    });

    test('should handle security incident flow', async () => {
      const suspiciousIP = '10.0.0.100';
      const userId = 'potential-victim-user';

      // 1. Multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        const request = {
          ip: suspiciousIP,
          method: 'POST',
          path: '/auth/login',
          userId,
          userAgent: 'Suspicious Agent',
          headers: {},
          timestamp: new Date()
        };

        const rateLimitInfo = await auth.rateLimit.checkRateLimit(request);
        
        // Record failed attempt
        await auth.rateLimit.recordResult(rateLimitInfo.key, false, {
          failureReason: 'invalid_credentials'
        });

        // Log failed attempt
        await auth.audit.logEvent(
          AuditEventType.LOGIN_FAILURE,
          AuditLevel.WARN,
          {
            type: 'anonymous',
            ipAddress: suspiciousIP,
            userAgent: 'Suspicious Agent'
          },
          'failed_login_attempt',
          'failure',
          {
            targetUserId: userId,
            attemptNumber: i + 1,
            reason: 'invalid_credentials'
          }
        );

        if (i >= 4) {
          // Should be rate limited by now
          expect(rateLimitInfo.blocked).toBe(true);
        }
      }

      // 2. Block the suspicious IP
      await auth.rateLimit.blockIP(
        suspiciousIP,
        3600000, // 1 hour
        'brute_force_attack_detected',
        'high'
      );

      // 3. Verify IP is blocked
      const isBlocked = await auth.rateLimit.isIPBlocked(suspiciousIP);
      expect(isBlocked).toBe(true);

      // 4. Log security incident
      await auth.audit.logEvent(
        AuditEventType.IP_BLOCKED,
        AuditLevel.CRITICAL,
        {
          type: 'system',
          id: 'security-system'
        },
        'ip_blocked_for_brute_force',
        'success',
        {
          blockedIP: suspiciousIP,
          reason: 'brute_force_attack_detected',
          failedAttempts: 6,
          blockDuration: 3600000
        }
      );

      // 5. Query security events
      const securityEvents = await auth.audit.queryEvents({
        startDate: new Date(Date.now() - 300000), // Last 5 minutes
        types: [AuditEventType.LOGIN_FAILURE, AuditEventType.IP_BLOCKED],
        ipAddresses: [suspiciousIP],
        limit: 20
      });

      expect(securityEvents.length).toBeGreaterThan(0);
      const blockedEvent = securityEvents.find(e => e.type === AuditEventType.IP_BLOCKED);
      expect(blockedEvent).toBeDefined();
    });
  });
});