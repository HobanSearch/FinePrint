# @fineprintai/auth

Enterprise-grade authentication and security package for Fine Print AI. This package provides a comprehensive security solution with JWT token management, password security, session management, multi-factor authentication, OAuth2 integrations, rate limiting, and audit logging.

## Features

- **JWT Token Management**: RS256 signing with automatic key rotation and refresh token handling
- **Password Security**: bcrypt hashing with strength validation and history tracking
- **Session Management**: Redis-based sessions with device tracking and suspicious activity detection
- **Multi-Factor Authentication**: TOTP, SMS, and email MFA with backup codes
- **OAuth2 Integration**: Google and Microsoft OAuth2 with account linking
- **Rate Limiting**: Advanced rate limiting with suspicious activity pattern detection
- **Audit Logging**: Comprehensive security event logging with anomaly detection
- **Enterprise Security**: OWASP Top 10 compliance, encryption, and monitoring

## Installation

```bash
npm install @fineprintai/auth
```

## Quick Start

```typescript
import { AuthManager, createDefaultAuthConfig } from '@fineprintai/auth';
import { CacheManager } from '@fineprintai/cache';

// Initialize with Redis cache
const cache = new CacheManager('auth');
const config = createDefaultAuthConfig();

// Create auth manager
const auth = new AuthManager(cache, config);

// Example: Create a user session
const session = await auth.session.createSession(
  'user-id-123',
  '192.168.1.1',
  'Mozilla/5.0...'
);

// Example: Generate JWT tokens
const accessToken = await auth.jwt.generateAccessToken({
  sub: 'user-id-123',
  email: 'user@example.com',
  role: 'user',
  subscriptionTier: 'premium'
});

// Example: Setup MFA
const mfaSetup = await auth.mfa.setupMFAMethod('user-id-123', {
  type: 'totp'
});
```

## Core Components

### JWT Token Management

```typescript
// Generate access token
const accessToken = await auth.jwt.generateAccessToken({
  sub: userId,
  email: user.email,
  role: user.role,
  subscriptionTier: user.tier
});

// Generate refresh token
const { token: refreshToken } = await auth.jwt.generateRefreshToken(
  userId,
  deviceFingerprint,
  ipAddress,
  userAgent
);

// Validate token
const validation = await auth.jwt.validateAccessToken(token);
if (validation.valid) {
  console.log('User ID:', validation.payload.sub);
}

// Rotate refresh token
const newTokens = await auth.jwt.rotateRefreshToken(
  oldRefreshToken,
  deviceFingerprint,
  ipAddress,
  userAgent
);
```

### Password Management

```typescript
// Hash password
const hashedPassword = await auth.password.hashPassword('userPassword123!');

// Verify password
const isValid = await auth.password.verifyPassword('userPassword123!', hashedPassword.hash);

// Validate password strength
const validation = await auth.password.validatePassword('newPassword', {
  email: 'user@example.com',
  name: 'John Doe'
});

if (!validation.valid) {
  console.log('Password errors:', validation.errors);
}

// Generate reset token
const resetToken = await auth.password.generatePasswordResetToken(
  userId,
  ipAddress,
  userAgent
);
```

### Session Management

```typescript
// Create session
const session = await auth.session.createSession(
  userId,
  ipAddress,
  userAgent,
  deviceFingerprint,
  { theme: 'dark', language: 'en' }
);

// Update session activity
await auth.session.updateSessionActivity(
  session.id,
  'page_view',
  { page: '/dashboard' }
);

// Get user sessions
const userSessions = await auth.session.getUserSessions(userId);

// Terminate session
await auth.session.terminateSession(session.id, 'user_logout');
```

### Multi-Factor Authentication

```typescript
// Setup TOTP MFA
const totpSetup = await auth.mfa.setupMFAMethod(userId, { type: 'totp' });
console.log('QR Code:', totpSetup.setupData.qrCode);

// Verify setup
const verified = await auth.mfa.verifyMFASetup(userId, totpSetup.method.id, '123456');

// Create MFA challenge
const challenge = await auth.mfa.createMFAChallenge(
  userId,
  sessionId,
  methodId,
  ipAddress,
  userAgent
);

// Verify MFA challenge
const verification = await auth.mfa.verifyMFAChallenge(
  challenge.id,
  '123456',
  ipAddress,
  userAgent
);
```

### OAuth2 Integration

```typescript
// Generate authorization URL
const authResponse = await auth.oauth.generateAuthorizationUrl({
  provider: 'google',
  redirectUrl: '/auth/callback'
}, ipAddress, userAgent);

console.log('Redirect to:', authResponse.authorizationUrl);

// Exchange code for tokens
const tokens = await auth.oauth.exchangeCodeForTokens({
  provider: 'google',
  code: 'auth_code_from_callback',
  state: authResponse.state
}, ipAddress, userAgent);

// Authenticate user
const authResult = await auth.oauth.authenticateUser({
  provider: 'google',
  code: 'auth_code',
  state: 'state_value'
}, ipAddress, userAgent);

if (authResult.success) {
  console.log('User:', authResult.user);
}
```

### Rate Limiting

```typescript
// Check rate limit
const rateLimitInfo = await auth.rateLimit.checkRateLimit({
  ip: '192.168.1.1',
  method: 'POST',
  path: '/auth/login',
  userId: 'user-123',
  userAgent: 'Mozilla/5.0...',
  headers: {},
  timestamp: new Date()
});

if (rateLimitInfo.blocked) {
  console.log('Rate limited. Retry after:', rateLimitInfo.retryAfter);
} else {
  console.log('Remaining requests:', rateLimitInfo.remaining);
}

// Record request result
await auth.rateLimit.recordResult(rateLimitInfo.key, true, { 
  responseTime: 250 
});

// Block IP address
await auth.rateLimit.blockIP(
  '192.168.1.100',
  3600000, // 1 hour
  'brute_force_detected',
  'high'
);
```

### Audit Logging

```typescript
// Log authentication event
await auth.audit.logEvent(
  AuditEventType.LOGIN_SUCCESS,
  AuditLevel.INFO,
  {
    type: 'user',
    id: userId,
    email: user.email,
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0...',
    sessionId: session.id
  },
  'user_login',
  'success',
  {
    loginMethod: 'password',
    mfaUsed: true,
    deviceType: 'desktop'
  },
  {
    type: 'user',
    id: userId,
    name: user.email
  },
  {
    requestId: 'req-123',
    correlationId: 'corr-456'
  }
);

// Query audit events
const events = await auth.audit.queryEvents({
  startDate: new Date(Date.now() - 86400000), // Last 24 hours
  types: [AuditEventType.LOGIN_FAILURE, AuditEventType.LOGIN_SUCCESS],
  actorIds: [userId],
  limit: 50
});

console.log('User login events:', events);

// Get security statistics
const stats = await auth.audit.getStats();
console.log('Security overview:', stats);
```

## Configuration

### Complete Configuration Example

```typescript
import { AuthConfig, AuditLevel } from '@fineprintai/auth';

const config: AuthConfig = {
  jwt: {
    algorithm: 'RS256',
    issuer: 'your-app',
    audience: 'your-users',
    accessTokenTTL: 900, // 15 minutes
    refreshTokenTTL: 2592000, // 30 days
    keyRotation: {
      rotationIntervalHours: 24,
      maxKeyAge: 172800,
      keyOverlapPeriod: 86400,
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
    maxPasswordAge: 90,
    passwordHistoryCount: 5
  },
  session: {
    ttl: 3600,
    extendOnActivity: true,
    maxConcurrentSessions: 5,
    deviceTrackingEnabled: true,
    geoLocationTracking: true,
    suspiciousActivityDetection: true,
    sessionCookieName: 'app_session',
    secureSessionsOnly: true,
    sameSitePolicy: 'strict'
  },
  mfa: {
    totp: {
      enabled: true,
      issuer: 'Your App',
      window: 2,
      stepSize: 30
    },
    sms: {
      enabled: true,
      provider: 'twilio',
      from: '+1234567890',
      rateLimitPerHour: 10,
      codeLength: 6,
      codeExpiry: 300
    },
    email: {
      enabled: true,
      from: 'security@yourapp.com',
      rateLimitPerHour: 10,
      codeLength: 6,
      codeExpiry: 300,
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
      lockoutDuration: 900
    }
  },
  oauth: {
    google: {
      enabled: true,
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_REDIRECT_URI!,
      scopes: ['openid', 'email', 'profile']
    },
    microsoft: {
      enabled: true,
      clientId: process.env.MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
      redirectUri: process.env.MICROSOFT_REDIRECT_URI!,
      scopes: ['openid', 'email', 'profile'],
      tenantId: 'common'
    },
    security: {
      stateExpiry: 600,
      nonceExpiry: 600,
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
        windowMs: 900000,
        max: 5,
        blockDuration: 900000
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
    sensitiveFields: ['password', 'token', 'secret'],
    encryption: {
      enabled: true,
      key: process.env.AUDIT_ENCRYPTION_KEY
    },
    forwarding: {
      enabled: false,
      endpoints: [],
      headers: {}
    }
  }
};

const auth = new AuthManager(cache, config);
```

## Environment Variables

```bash
# OAuth2 Configuration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=https://yourapp.com/auth/oauth/google/callback

MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_REDIRECT_URI=https://yourapp.com/auth/oauth/microsoft/callback

# SMS Provider (Twilio)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token

# Email Configuration
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password

# Security
AUDIT_ENCRYPTION_KEY=your_32_byte_hex_key
```

## Security Best Practices

### 1. Token Security
- Use RS256 algorithm for JWT signing
- Implement automatic key rotation
- Enable token blacklisting
- Set appropriate TTL values

### 2. Password Security
- Use bcrypt with salt rounds ≥ 12
- Enforce strong password policies
- Implement password history
- Set password expiration

### 3. Session Security
- Enable secure cookies only
- Implement SameSite policies
- Track device fingerprints
- Monitor suspicious activity

### 4. MFA Security
- Require MFA for sensitive operations
- Implement account lockout policies
- Use secure random code generation
- Provide backup codes

### 5. Rate Limiting
- Implement progressive delays
- Monitor for attack patterns
- Use IP and user-based limiting
- Block malicious actors

### 6. Audit Security
- Log all security events
- Monitor for anomalies
- Implement real-time alerts
- Retain logs per compliance requirements

## Monitoring and Maintenance

### Health Checks

```typescript
// Check overall system health
const health = await auth.healthCheck();
console.log('System status:', health.status);
console.log('Component health:', health.components);

// Get security statistics
const securityStatus = await auth.getSecurityStatus();
console.log('Security overview:', securityStatus);
```

### Maintenance Operations

```typescript
// Perform regular maintenance
const maintenanceResults = await auth.performMaintenance();
console.log('Maintenance completed:', maintenanceResults);

// Clean up expired data
const cleanedEvents = await auth.audit.cleanup();
console.log('Cleaned audit events:', cleanedEvents);
```

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [Fine Print AI Repository](https://github.com/fineprintai/fineprintai)
- Documentation: [Auth Package Docs](https://docs.fineprintai.com/auth)
- Email: security@fineprintai.com