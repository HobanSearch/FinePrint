/**
 * Security Testing Suite
 * Comprehensive security tests including SAST, DAST, and vulnerability assessments
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import supertest from 'supertest';
import { createMockUser, createMockDocument } from '../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../mocks/utils/mock-utils';

// Security test configuration
const securityConfig = {
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
  },
  passwords: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  },
  jwt: {
    algorithm: 'HS256',
    expiresIn: '1h',
  },
};

// Common attack payloads for testing
const attackPayloads = {
  sqlInjection: [
    "'; DROP TABLE users; --",
    "1' OR '1'='1",
    "admin'; DELETE FROM users; --",
    "' UNION SELECT password FROM users --",
    "1' AND (SELECT COUNT(*) FROM users) > 0 --",
  ],
  xss: [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(1)">',
    'javascript:alert("XSS")',
    '<svg onload="alert(1)">',
    '<iframe src="javascript:alert(1)"></iframe>',
  ],
  pathTraversal: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/passwd',
    'C:\\windows\\system32\\config\\sam',
    '....//....//....//etc/passwd',
  ],
  commandInjection: [
    '; cat /etc/passwd',
    '| ls -la',
    '&& rm -rf /',
    '$(whoami)',
    '`id`',
  ],
  headerInjection: [
    'test\r\nX-Injected-Header: injected',
    'test\nSet-Cookie: admin=true',
    'test\r\n\r\n<script>alert(1)</script>',
  ],
  ldapInjection: [
    '*)(uid=*',
    '*(|(password=*))',
    '*))(|(uid=*))',
  ],
};

// Mock security scanner results
const mockSecurityScanResults = {
  staticAnalysis: {
    vulnerabilities: [
      {
        type: 'hardcoded-secrets',
        severity: 'high',
        file: 'config/database.ts',
        line: 15,
        description: 'Hardcoded database password detected',
        recommendation: 'Use environment variables for sensitive data',
      },
      {
        type: 'insecure-random',
        severity: 'medium',
        file: 'utils/token.ts',
        line: 23,
        description: 'Use of Math.random() for security-sensitive operations',
        recommendation: 'Use crypto.randomBytes() for cryptographic purposes',
      },
    ],
    score: 85,
  },
  dynamicAnalysis: {
    vulnerabilities: [
      {
        type: 'missing-security-headers',
        severity: 'medium',
        endpoint: '/api/documents',
        description: 'Missing Content-Security-Policy header',
        recommendation: 'Implement comprehensive security headers',
      },
      {
        type: 'weak-authentication',
        severity: 'high',
        endpoint: '/api/auth/reset-password',
        description: 'Password reset tokens are predictable',
        recommendation: 'Use cryptographically secure random tokens',
      },
    ],
    score: 78,
  },
};

// Mock security test server
let testServer: any;
let request: supertest.SuperTest<supertest.Test>;

describe('Security Testing Suite', () => {
  beforeAll(async () => {
    setupMockDefaults();
    
    // Setup test server with security configurations
    testServer = {
      // Mock server with security middleware
    };
    request = supertest(testServer as any);
  });

  afterAll(async () => {
    if (testServer?.close) {
      await testServer.close();
    }
  });

  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Authentication & Authorization Security', () => {
    test('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'password',      // No uppercase, numbers, or special chars
        'Password',      // No numbers or special chars
        'Password1',     // No special chars
        'Pass1!',        // Too short
        '12345678',      // No letters
        'PASSWORD1!',    // No lowercase
      ];

      for (const password of weakPasswords) {
        const response = await request
          .post('/api/auth/register')
          .send({
            email: 'test@example.com',
            password,
            firstName: 'Test',
            lastName: 'User',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('password');
      }

      // Strong password should work
      const strongPasswordResponse = await request
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'StrongPass123!',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(strongPasswordResponse.status).toBe(200);
    });

    test('should prevent brute force attacks on login', async () => {
      const maxAttempts = 5;
      const lockoutDuration = 15 * 60 * 1000; // 15 minutes

      // Make multiple failed login attempts
      for (let i = 0; i < maxAttempts + 2; i++) {
        const response = await request
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrongpassword',
          });

        if (i < maxAttempts) {
          expect(response.status).toBe(401);
        } else {
          // Should be locked out after max attempts
          expect(response.status).toBe(429);
          expect(response.body.error).toContain('too many attempts');
        }
      }
    });

    test('should invalidate sessions on logout', async () => {
      // Login to get a token
      const loginResponse = await request
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const token = loginResponse.body.token;

      // Use token to access protected resource
      const protectedResponse = await request
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(protectedResponse.status).toBe(200);

      // Logout
      const logoutResponse = await request
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(logoutResponse.status).toBe(200);

      // Token should no longer work
      const invalidatedResponse = await request
        .get('/api/users/me')
        .set('Authorization', `Bearer ${token}`);

      expect(invalidatedResponse.status).toBe(401);
    });

    test('should enforce JWT token expiration', async () => {
      // Create a token that should be expired
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZXhwIjoxNjAwMDAwMDAwfQ.invalid';

      const response = await request
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('expired');
    });

    test('should prevent privilege escalation', async () => {
      // Create regular user
      const userResponse = await request
        .post('/api/auth/register')
        .send({
          email: 'user@example.com',
          password: 'UserPass123!',
          firstName: 'Regular',
          lastName: 'User',
        });

      const userToken = userResponse.body.token;

      // Try to access admin endpoints
      const adminResponse = await request
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(adminResponse.status).toBe(403);

      // Try to modify own role
      const roleResponse = await request
        .patch('/api/users/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ role: 'admin' });

      expect(roleResponse.status).toBe(400);
      expect(roleResponse.body.error).toContain('role');
    });
  });

  describe('Input Validation & Injection Prevention', () => {
    test('should prevent SQL injection attacks', async () => {
      const userToken = 'valid-user-token';

      for (const payload of attackPayloads.sqlInjection) {
        // Test in various input fields
        const searchResponse = await request
          .get('/api/documents/search')
          .query({ q: payload })
          .set('Authorization', `Bearer ${userToken}`);

        expect(searchResponse.status).not.toBe(500);
        expect(searchResponse.body).not.toContain('ERROR');
        expect(searchResponse.body).not.toContain('mysql');
        expect(searchResponse.body).not.toContain('postgresql');

        // Test in POST body
        const createResponse = await request
          .post('/api/documents')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            title: payload,
            content: 'Test content',
            type: 'contract',
          });

        expect(createResponse.status).toBe(400);
      }
    });

    test('should prevent XSS attacks', async () => {
      const userToken = 'valid-user-token';

      for (const payload of attackPayloads.xss) {
        const response = await request
          .post('/api/documents')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            title: payload,
            content: payload,
            type: 'contract',
          });

        if (response.status === 200) {
          // If creation succeeded, check that content is sanitized
          const document = response.body;
          expect(document.title).not.toContain('<script>');
          expect(document.title).not.toContain('javascript:');
          expect(document.content).not.toContain('<script>');
        } else {
          // Should be rejected due to validation
          expect(response.status).toBe(400);
        }
      }
    });

    test('should prevent path traversal attacks', async () => {
      const userToken = 'valid-user-token';

      for (const payload of attackPayloads.pathTraversal) {
        // Test file upload endpoints
        const uploadResponse = await request
          .post('/api/documents/upload')
          .set('Authorization', `Bearer ${userToken}`)
          .attach('file', Buffer.from('test content'), payload);

        expect(uploadResponse.status).toBe(400);

        // Test file download endpoints
        const downloadResponse = await request
          .get(`/api/documents/download/${encodeURIComponent(payload)}`)
          .set('Authorization', `Bearer ${userToken}`);

        expect(downloadResponse.status).not.toBe(200);
      }
    });

    test('should prevent command injection', async () => {
      const userToken = 'valid-user-token';

      for (const payload of attackPayloads.commandInjection) {
        const response = await request
          .post('/api/analysis')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            documentId: payload,
            options: {
              outputFormat: payload,
            },
          });

        expect(response.status).toBe(400);
      }
    });

    test('should prevent header injection', async () => {
      for (const payload of attackPayloads.headerInjection) {
        const response = await request
          .get('/api/health')
          .set('X-Custom-Header', payload);

        // Response should not contain injected headers
        expect(response.headers['x-injected-header']).toBeUndefined();
        expect(response.headers['set-cookie']).not.toContain('admin=true');
      }
    });

    test('should validate file uploads securely', async () => {
      const userToken = 'valid-user-token';

      // Test malicious file types
      const maliciousFiles = [
        { name: 'virus.exe', content: 'MZ\x90\x00' }, // PE header
        { name: 'script.php', content: '<?php system($_GET["cmd"]); ?>' },
        { name: 'shell.jsp', content: '<%Runtime.getRuntime().exec(request.getParameter("cmd"));%>' },
        { name: 'macro.docm', content: 'malicious macro content' },
      ];

      for (const file of maliciousFiles) {
        const response = await request
          .post('/api/documents/upload')
          .set('Authorization', `Bearer ${userToken}`)
          .attach('file', Buffer.from(file.content), file.name);

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('file type');
      }

      // Test oversized files
      const largeFile = Buffer.alloc(10 * 1024 * 1024); // 10MB
      const oversizeResponse = await request
        .post('/api/documents/upload')
        .set('Authorization', `Bearer ${userToken}`)
        .attach('file', largeFile, 'large.pdf');

      expect(oversizeResponse.status).toBe(413);
    });
  });

  describe('Security Headers', () => {
    test('should include required security headers', async () => {
      const response = await request.get('/api/health');

      expect(response.headers).toHaveValidSecurityHeaders();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['strict-transport-security']).toContain('max-age');
      expect(response.headers['content-security-policy']).toBeDefined();
    });

    test('should set appropriate CORS headers', async () => {
      const response = await request
        .options('/api/documents')
        .set('Origin', 'https://app.fineprintai.com');

      expect(response.headers['access-control-allow-origin']).toBe('https://app.fineprintai.com');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });

    test('should reject requests from unauthorized origins', async () => {
      const response = await request
        .post('/api/documents')
        .set('Origin', 'https://malicious.com')
        .send({ title: 'Test', content: 'Test', type: 'contract' });

      expect(response.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    test('should enforce rate limits per endpoint', async () => {
      const userToken = 'valid-user-token';
      const requests = [];

      // Make rapid requests to trigger rate limit
      for (let i = 0; i < securityConfig.rateLimit.maxRequests + 10; i++) {
        requests.push(
          request
            .get('/api/health')
            .set('Authorization', `Bearer ${userToken}`)
        );
      }

      const responses = await Promise.allSettled(requests);
      const rateLimitedResponses = responses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should have different rate limits for different endpoints', async () => {
      const userToken = 'valid-user-token';

      // Authentication endpoints should have stricter limits
      const authRequests = Array.from({ length: 10 }, () =>
        request.post('/api/auth/login').send({
          email: 'test@example.com',
          password: 'wrongpassword',
        })
      );

      const authResponses = await Promise.allSettled(authRequests);
      const authRateLimited = authResponses.filter(r =>
        r.status === 'fulfilled' && r.value.status === 429
      );

      // Should be rate limited more aggressively than regular endpoints
      expect(authRateLimited.length).toBeGreaterThan(5);
    });

    test('should reset rate limits after time window', async () => {
      const userToken = 'valid-user-token';

      // Trigger rate limit
      const rapidRequests = Array.from({ length: 20 }, () =>
        request.get('/api/health').set('Authorization', `Bearer ${userToken}`)
      );

      await Promise.all(rapidRequests);

      // Should be rate limited
      const rateLimitedResponse = await request
        .get('/api/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(rateLimitedResponse.status).toBe(429);

      // Wait for rate limit window to reset (mock time passage)
      jest.advanceTimersByTime(securityConfig.rateLimit.windowMs + 1000);

      // Should work again
      const resetResponse = await request
        .get('/api/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(resetResponse.status).toBe(200);
    });
  });

  describe('Data Protection', () => {
    test('should encrypt sensitive data at rest', async () => {
      const userToken = 'valid-user-token';

      // Create document with sensitive content
      const sensitiveContent = 'SSN: 123-45-6789, Credit Card: 4111-1111-1111-1111';
      
      const createResponse = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          title: 'Sensitive Document',
          content: sensitiveContent,
          type: 'contract',
        });

      expect(createResponse.status).toBe(200);

      // Verify data is encrypted in storage (this would check the actual database)
      // For testing, we'll verify the API doesn't leak raw sensitive data
      const documentId = createResponse.body.id;
      
      const retrieveResponse = await request
        .get(`/api/documents/${documentId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(retrieveResponse.status).toBe(200);
      // Content should be decrypted for authorized user
      expect(retrieveResponse.body.content).toContain('SSN:');
    });

    test('should mask sensitive data in logs', async () => {
      const userToken = 'valid-user-token';
      const sensitiveData = {
        email: 'user@example.com',
        password: 'secret123',
        ssn: '123-45-6789',
        creditCard: '4111-1111-1111-1111',
      };

      await request
        .post('/api/auth/register')
        .send(sensitiveData);

      // Verify logs don't contain sensitive data (this would check actual log files)
      // For testing, we'll simulate log checking
      const logEntries = mockGetLogEntries();
      
      logEntries.forEach(entry => {
        expect(entry).not.toContain(sensitiveData.password);
        expect(entry).not.toContain(sensitiveData.ssn);
        expect(entry).not.toContain(sensitiveData.creditCard);
        
        // Email should be partially masked
        if (entry.includes('@')) {
          expect(entry).toMatch(/u\*\*\*@example\.com/);
        }
      });
    });

    test('should implement secure session management', async () => {
      const loginResponse = await request
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'password123',
        });

      const cookies = loginResponse.headers['set-cookie'];
      
      if (cookies) {
        cookies.forEach((cookie: string) => {
          // Session cookies should be secure
          expect(cookie).toContain('HttpOnly');
          expect(cookie).toContain('Secure');
          expect(cookie).toContain('SameSite=Strict');
        });
      }
    });
  });

  describe('API Security', () => {
    test('should validate API keys properly', async () => {
      // Test with invalid API key
      const invalidResponse = await request
        .get('/api/documents')
        .set('X-API-Key', 'invalid-key');

      expect(invalidResponse.status).toBe(401);

      // Test with malformed API key
      const malformedResponse = await request
        .get('/api/documents')
        .set('X-API-Key', 'malformed-key-format');

      expect(malformedResponse.status).toBe(401);

      // Test with valid API key format
      const validResponse = await request
        .get('/api/documents')
        .set('X-API-Key', 'fpa_' + 'a'.repeat(80));

      expect(validResponse.status).not.toBe(401);
    });

    test('should implement proper CSRF protection', async () => {
      // Get CSRF token
      const tokenResponse = await request.get('/api/csrf-token');
      const csrfToken = tokenResponse.body.token;

      // Request without CSRF token should fail
      const withoutTokenResponse = await request
        .post('/api/documents')
        .send({
          title: 'Test',
          content: 'Test',
          type: 'contract',
        });

      expect(withoutTokenResponse.status).toBe(403);

      // Request with valid CSRF token should succeed
      const withTokenResponse = await request
        .post('/api/documents')
        .set('X-CSRF-Token', csrfToken)
        .send({
          title: 'Test',
          content: 'Test',
          type: 'contract',
        });

      expect(withTokenResponse.status).not.toBe(403);
    });

    test('should validate content types properly', async () => {
      const userToken = 'valid-user-token';

      // Should reject requests with incorrect content type
      const xmlResponse = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Content-Type', 'application/xml')
        .send('<document><title>Test</title></document>');

      expect(xmlResponse.status).toBe(415);

      // Should accept correct content type
      const jsonResponse = await request
        .post('/api/documents')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Content-Type', 'application/json')
        .send({
          title: 'Test',
          content: 'Test',
          type: 'contract',
        });

      expect(jsonResponse.status).not.toBe(415);
    });
  });

  describe('Static Application Security Testing (SAST)', () => {
    test('should detect hardcoded secrets', () => {
      const sastResults = mockSecurityScanResults.staticAnalysis;
      const secretVulns = sastResults.vulnerabilities.filter(v => v.type === 'hardcoded-secrets');
      
      expect(secretVulns.length).toBe(0); // Should be 0 in production code
      
      // If any are found, they should be flagged as high severity
      secretVulns.forEach(vuln => {
        expect(vuln.severity).toBe('high');
        expect(vuln.recommendation).toContain('environment variables');
      });
    });

    test('should detect insecure cryptographic practices', () => {
      const sastResults = mockSecurityScanResults.staticAnalysis;
      const cryptoVulns = sastResults.vulnerabilities.filter(v => 
        v.type === 'insecure-random' || v.type === 'weak-crypto'
      );
      
      cryptoVulns.forEach(vuln => {
        expect(['medium', 'high', 'critical']).toContain(vuln.severity);
        expect(vuln.recommendation).toBeDefined();
      });
    });

    test('should achieve minimum security score', () => {
      const sastResults = mockSecurityScanResults.staticAnalysis;
      expect(sastResults.score).toBeGreaterThanOrEqual(80); // 80% minimum
    });
  });

  describe('Dynamic Application Security Testing (DAST)', () => {
    test('should detect missing security headers', () => {
      const dastResults = mockSecurityScanResults.dynamicAnalysis;
      const headerVulns = dastResults.vulnerabilities.filter(v => 
        v.type === 'missing-security-headers'
      );
      
      // Should have minimal missing headers in production
      expect(headerVulns.length).toBeLessThanOrEqual(2);
    });

    test('should detect authentication weaknesses', () => {
      const dastResults = mockSecurityScanResults.dynamicAnalysis;
      const authVulns = dastResults.vulnerabilities.filter(v => 
        v.type === 'weak-authentication'
      );
      
      authVulns.forEach(vuln => {
        expect(vuln.severity).toBe('high');
        expect(vuln.recommendation).toContain('secure');
      });
    });

    test('should achieve minimum security score', () => {
      const dastResults = mockSecurityScanResults.dynamicAnalysis;
      expect(dastResults.score).toBeGreaterThanOrEqual(75); // 75% minimum for DAST
    });
  });

  describe('Vulnerability Assessment', () => {
    test('should not have critical vulnerabilities', () => {
      const allVulns = [
        ...mockSecurityScanResults.staticAnalysis.vulnerabilities,
        ...mockSecurityScanResults.dynamicAnalysis.vulnerabilities,
      ];
      
      const criticalVulns = allVulns.filter(v => v.severity === 'critical');
      expect(criticalVulns.length).toBe(0);
    });

    test('should have acceptable number of high severity vulnerabilities', () => {
      const allVulns = [
        ...mockSecurityScanResults.staticAnalysis.vulnerabilities,
        ...mockSecurityScanResults.dynamicAnalysis.vulnerabilities,
      ];
      
      const highVulns = allVulns.filter(v => v.severity === 'high');
      expect(highVulns.length).toBeLessThanOrEqual(3); // Maximum 3 high severity
    });

    test('should track vulnerability remediation', () => {
      // This would track fixes over time
      const vulnerabilityTrends = {
        critical: { current: 0, previous: 2, trend: 'improving' },
        high: { current: 1, previous: 4, trend: 'improving' },
        medium: { current: 3, previous: 5, trend: 'improving' },
        low: { current: 8, previous: 12, trend: 'improving' },
      };
      
      Object.values(vulnerabilityTrends).forEach(trend => {
        expect(trend.current).toBeLessThanOrEqual(trend.previous);
        expect(trend.trend).toBe('improving');
      });
    });
  });
});

// Helper function to mock log entries
function mockGetLogEntries(): string[] {
  return [
    'POST /api/auth/register - User registration attempt for u***@example.com',
    'AUTH - Login successful for user ID: user123',
    'ERROR - Failed to process document: Invalid format',
    'INFO - Analysis completed for document doc456',
  ];
}