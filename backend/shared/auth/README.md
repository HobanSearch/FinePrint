# Fine Print AI - Enterprise Authentication & Authorization System

A comprehensive, production-ready authentication and authorization system designed for Fine Print AI's autonomous business operations platform. This system provides enterprise-grade security features including multi-factor authentication, zero-trust architecture, risk-based access control, and specialized authentication for AI agents.

## 🏗️ Architecture Overview

The authentication system is built as a modular, microservices-oriented architecture with the following core components:

### Core Services

- **🔐 AuthenticationService**: Multi-factor authentication with WebAuthn, TOTP, SMS, and biometric support
- **🛡️ AuthorizationService**: RBAC/ABAC with fine-grained permissions and dynamic policy evaluation
- **🎫 TokenService**: Secure JWT management with automatic rotation and revocation
- **📱 SessionService**: Distributed session management with cross-device synchronization
- **📜 CertificateService**: mTLS certificate management with automatic rotation
- **🎯 RiskAssessmentService**: Behavioral analysis and threat detection with ML integration

### Security Features

- **Zero Trust Architecture**: Never trust, always verify approach
- **Multi-Factor Authentication**: TOTP, SMS, Email, WebAuthn, Biometrics
- **Risk-Based Authentication**: Adaptive security based on behavioral analysis
- **Device Fingerprinting**: Advanced device identification and trust management
- **Geolocation Analysis**: Location-based access control with impossible travel detection
- **Threat Intelligence**: Real-time threat detection with multiple intelligence feeds
- **Certificate-Based Authentication**: mTLS for service-to-service communication
- **Agent Authentication**: Specialized authentication for AI agents and autonomous services

## 🚀 Quick Start

### Installation

```bash
npm install @fineprintai/shared-auth
```

### Basic Usage

```typescript
import { 
  createAuthSystem, 
  createDefaultAuthConfig,
  AuthSystem 
} from '@fineprintai/shared-auth';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';

// Initialize dependencies
const redis = new Redis(process.env.REDIS_URL);
const prisma = new PrismaClient();
const logger = new LoggerService();
const configService = new ConfigService();

// Create auth system with default configuration
const config = createDefaultAuthConfig('production');
const authSystem = createAuthSystem(
  redis,
  prisma,
  config,
  logger,
  configService
);

// Authenticate a user
const authResult = await authSystem.authentication.authenticateUser({
  email: 'user@example.com',
  password: 'securePassword123',
  deviceInfo: {
    deviceId: 'device-123',
    fingerprint: 'device-fingerprint',
    name: 'User Device',
    type: 'desktop',
    os: 'macOS',
    browser: 'Chrome',
    version: '120.0',
    trusted: false
  },
  userAgent: 'Mozilla/5.0...',
  ipAddress: '192.168.1.100',
  trustDevice: true
});

if (authResult.result === 'success') {
  console.log('Authentication successful:', authResult.tokens);
} else {
  console.log('Authentication failed:', authResult.result);
}
```

### Fastify Integration

```typescript
import Fastify from 'fastify';

const fastify = Fastify();

// Register authentication routes
await authSystem.registerRoutes(fastify);

// Use authentication middleware
fastify.addHook('preHandler', async (request, reply) => {
  if (request.url.startsWith('/api/protected')) {
    // Authenticate request
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      reply.code(401).send({ error: 'Authentication required' });
      return;
    }

    const validation = await authSystem.token.validateToken(token, {
      checkRevocation: true,
      updateUsage: true
    });

    if (!validation.valid) {
      reply.code(401).send({ error: 'Invalid token' });
      return;
    }

    request.user = validation.payload;
  }
});

await fastify.listen({ port: 3000 });
```

## 📚 Detailed Documentation

### Authentication Service

The `AuthenticationService` handles user authentication with multiple factors and security checks:

```typescript
// Multi-factor authentication
const mfaChallenge = await authSystem.authentication.setupWebAuthn(
  userId,
  deviceInfo
);

// Agent authentication
const agentAuth = await authSystem.authentication.authenticateAgent(
  apiKey,
  certificate,
  requestSignature
);
```

### Authorization Service

The `AuthorizationService` provides RBAC and ABAC with contextual evaluation:

```typescript
// Check permissions
const accessDecision = await authSystem.authorization.checkPermission({
  subject: {
    userId: 'user-123',
    roles: ['pro_user'],
    sessionId: 'session-456'
  },
  resource: {
    id: 'document-789',
    type: 'document',
    ownerId: 'user-123'
  },
  action: 'document:read',
  environment: {
    timestamp: new Date(),
    ipAddress: '192.168.1.100'
  }
});

// Grant role
await authSystem.authorization.grantRole(
  userId,
  'team_admin',
  requestContext
);
```

### Token Service

The `TokenService` manages JWT tokens with security features:

```typescript
// Generate tokens
const tokens = await authSystem.token.generateTokens(
  user,
  authContext,
  { customClaim: 'value' }
);

// Validate token
const validation = await authSystem.token.validateToken(
  accessToken,
  {
    checkRevocation: true,
    requireFingerprint: true,
    expectedFingerprint: deviceFingerprint
  }
);

// Revoke token
await authSystem.token.revokeToken(
  refreshToken,
  'User requested logout'
);
```

### Session Service

The `SessionService` manages distributed sessions with security features:

```typescript
// Create session
const session = await authSystem.session.createSession(
  authContext,
  tokens,
  { persistent: true, trustDevice: true }
);

// Update activity
await authSystem.session.updateSessionActivity(
  sessionId,
  {
    action: 'document_viewed',
    endpoint: '/api/documents/123',
    method: 'GET'
  }
);

// Get user sessions
const sessions = await authSystem.session.getUserSessions(userId);
```

### Certificate Service

The `CertificateService` manages mTLS certificates for service authentication:

```typescript
// Issue certificate
const certificate = await authSystem.certificate.issueCertificate({
  commonName: 'dspy-agent.fineprintai.com',
  certificateType: 'agent',
  agentId: 'dspy-001',
  validityPeriod: 365,
  keyUsage: ['digitalSignature', 'keyEncipherment'],
  extendedKeyUsage: ['clientAuth', 'serverAuth']
});

// Validate certificate
const validation = await authSystem.certificate.validateCertificate(
  certificatePem,
  {
    checkRevocation: true,
    validateHostname: 'dspy-agent.fineprintai.com'
  }
);

// Rotate certificates
const rotationResult = await authSystem.certificate.rotateCertificates({
  dryRun: false,
  certificateTypes: ['agent']
});
```

### Risk Assessment Service

The `RiskAssessmentService` performs behavioral analysis and threat detection:

```typescript
// Assess login risk
const riskAssessment = await authSystem.riskAssessment.assessLoginRisk({
  userId: 'user-123',
  email: 'user@example.com',
  deviceInfo: deviceInfo,
  ipAddress: '192.168.1.100',
  userAgent: userAgent,
  isNewDevice: false,
  lastLoginAt: new Date(),
  failedAttempts: 0,
  location: geoLocation
});

if (riskAssessment.blocked) {
  console.log('Access blocked due to high risk:', riskAssessment.factors);
}
```

## 🔧 Configuration

### Environment-Specific Configuration

```typescript
// Development configuration
const devConfig = createDefaultAuthConfig('development');

// Production configuration  
const prodConfig = createDefaultAuthConfig('production');

// Custom configuration
const customConfig: AuthSystemConfig = {
  authentication: {
    passwordMinLength: 12,
    maxLoginAttempts: 3,
    lockoutDuration: 1800,
    mfa: {
      required: true,
      allowedMethods: ['totp', 'webauthn'],
      totpIssuer: 'Fine Print AI',
      backupCodesCount: 10,
      rememberDeviceDuration: 2592000
    },
    webauthn: {
      enabled: true,
      rpName: 'Fine Print AI',
      rpID: 'fineprintai.com',
      origin: 'https://fineprintai.com',
      timeout: 60000,
      userVerification: 'required'
    },
    riskAssessment: {
      enabled: true,
      strictMode: true,
      blockedCountries: ['CN', 'RU', 'KP', 'IR'],
      maxRiskScore: 70
    }
  },
  // ... other configuration sections
};
```

### Redis Configuration

```typescript
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true
});
```

### Database Configuration

```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  log: ['query', 'info', 'warn', 'error']
});
```

## 🔒 Security Features

### Zero Trust Architecture

The system implements a zero-trust security model:

- **Identity Verification**: Every request is authenticated and authorized
- **Device Trust**: Device fingerprinting and trust scoring
- **Network Security**: All communications use TLS/mTLS
- **Micro-Segmentation**: Fine-grained access controls
- **Continuous Monitoring**: Real-time threat detection

### Multi-Factor Authentication

Comprehensive MFA support:

- **TOTP**: Time-based one-time passwords (Google Authenticator, Authy)
- **WebAuthn**: Hardware security keys and biometrics
- **SMS**: SMS-based verification codes
- **Email**: Email-based verification codes
- **Backup Codes**: Recovery codes for account access

### Risk-Based Authentication

Adaptive security based on risk factors:

- **Behavioral Analysis**: User behavior patterns and anomalies
- **Geolocation**: Location-based access control
- **Device Analysis**: Device fingerprinting and trust
- **Network Analysis**: IP reputation and threat intelligence
- **Temporal Analysis**: Time-based access patterns

### Agent Authentication

Specialized authentication for AI agents:

- **Certificate-Based**: mTLS certificates for agent identity
- **API Key Authentication**: Secure API keys with rotation
- **Service Discovery**: Secure agent registration and discovery
- **Rate Limiting**: Per-agent rate limiting and quotas
- **Permission Management**: Fine-grained agent permissions

## 📊 Monitoring and Metrics

### Health Monitoring

```typescript
// Check system health
const health = await authSystem.getHealthStatus();
console.log('System status:', health.status);
console.log('Service health:', health.services);
```

### Metrics Collection

```typescript
// Get system metrics
const metrics = await authSystem.getMetrics();
console.log('Authentication metrics:', metrics.authentication);
console.log('Authorization metrics:', metrics.authorization);
console.log('Token metrics:', metrics.tokens);
```

### Audit Logging

All authentication and authorization events are logged:

- **Authentication Attempts**: Success/failure with context
- **Authorization Decisions**: Permission grants/denials
- **Token Operations**: Generation, validation, revocation
- **Session Management**: Creation, updates, termination
- **Certificate Operations**: Issuance, validation, revocation
- **Risk Assessments**: Risk scores and factors

## 🧪 Testing

### Unit Tests

```bash
npm test
```

### Integration Tests

```bash
npm run test:integration
```

### Security Tests

```bash
npm run test:security
```

### Load Tests

```bash
npm run test:load
```

## 🚀 Deployment

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fineprintai-auth
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fineprintai-auth
  template:
    metadata:
      labels:
        app: fineprintai-auth
    spec:
      containers:
      - name: auth
        image: fineprintai/auth:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: redis-url
```

## 🔧 Development

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+
- TypeScript 5+

### Setup

```bash
# Clone repository
git clone https://github.com/fineprintai/fineprintai.git
cd fineprintai/backend/shared/auth

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Start development
npm run dev
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## 📋 API Reference

### Authentication Endpoints

- `POST /auth/login` - User login
- `POST /auth/logout` - User logout  
- `POST /auth/refresh` - Refresh tokens
- `POST /auth/mfa/setup` - Setup MFA
- `POST /auth/mfa/verify` - Verify MFA
- `POST /auth/webauthn/register` - Register WebAuthn credential
- `POST /auth/webauthn/authenticate` - Authenticate with WebAuthn

### Authorization Endpoints

- `GET /auth/permissions` - Get user permissions
- `POST /auth/permissions/check` - Check specific permission
- `POST /auth/roles/grant` - Grant role to user
- `POST /auth/roles/revoke` - Revoke role from user

### Session Endpoints

- `GET /auth/sessions` - Get user sessions
- `DELETE /auth/sessions/:id` - Terminate session
- `DELETE /auth/sessions` - Terminate all sessions

### Certificate Endpoints

- `POST /auth/certificates` - Issue certificate
- `GET /auth/certificates/:id` - Get certificate
- `POST /auth/certificates/:id/revoke` - Revoke certificate
- `POST /auth/certificates/rotate` - Rotate certificates

### Agent Endpoints

- `POST /auth/agents/authenticate` - Authenticate agent
- `POST /auth/agents/register` - Register agent
- `GET /auth/agents/:id/status` - Get agent status

## 🔍 Troubleshooting

### Common Issues

1. **Token Validation Failures**
   - Check token expiration
   - Verify JWT signature
   - Ensure proper audience/issuer

2. **Session Issues**
   - Check Redis connectivity
   - Verify session configuration
   - Check session expiration

3. **Certificate Problems**
   - Verify certificate chain
   - Check certificate expiration
   - Ensure proper key usage

4. **Risk Assessment Blocks**
   - Review risk factors
   - Check geolocation settings
   - Verify device trust

### Debug Mode

Enable debug logging:

```typescript
const config = createDefaultAuthConfig('development');
config.system.debug = true;
```

### Performance Tuning

- Enable Redis caching
- Optimize database queries
- Configure connection pooling
- Enable compression
- Use CDN for static assets

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Support

- Documentation: https://docs.fineprintai.com/auth
- Issues: https://github.com/fineprintai/fineprintai/issues
- Security: security@fineprintai.com
- Support: support@fineprintai.com

---

**Fine Print AI Authentication System** - Enterprise-grade security for autonomous AI business operations.