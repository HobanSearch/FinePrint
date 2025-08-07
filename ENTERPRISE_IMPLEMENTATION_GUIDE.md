# Enterprise Features Implementation Guide

This document provides a comprehensive guide for implementing and using the enterprise features in Fine Print AI.

## Overview

The enterprise features transform Fine Print AI into a fully-featured, enterprise-grade platform with:

- **Multi-tenant organization management** with hierarchical structure
- **Advanced RBAC** with granular permissions
- **SAML/SSO integration** with major identity providers
- **MFA support** with TOTP and SMS
- **Advanced reporting** with PDF/CSV exports
- **GDPR/CCPA compliance** features
- **Enterprise security monitoring**
- **Session management** with security controls
- **White-label customization**
- **Comprehensive audit trails**

## Architecture

### Frontend Components

The enterprise features are organized into the following component structure:

```
frontend/src/components/enterprise/
├── admin/
│   └── AdminDashboard.tsx          # Enterprise admin dashboard
├── auth/
│   ├── MFASetup.tsx               # Multi-factor authentication setup
│   └── SAMLConfiguration.tsx      # SAML/SSO configuration
├── branding/
│   └── BrandingCustomizer.tsx     # White-label customization
├── compliance/
│   └── ComplianceCenter.tsx       # GDPR/CCPA compliance features
├── reporting/
│   └── ReportGenerator.tsx        # Advanced reporting system
└── security/
    ├── SecurityMonitoring.tsx     # Security event monitoring
    └── SessionManager.tsx         # Session management
```

### State Management

Enterprise features use a dedicated Zustand slice (`enterprise`) that manages:

- Organization data and settings
- User roles and permissions
- Security events and monitoring
- Compliance requests and audit logs
- Report templates and generated reports
- MFA and session configurations

### Type Definitions

Comprehensive TypeScript types are defined in `/frontend/src/types/enterprise.ts`:

- Organization and user management types
- RBAC permissions and roles
- SAML/SSO configuration types
- Security and audit types
- Compliance and export types
- Branding and customization types

## Implementation Guide

### 1. Multi-Tenant Organization Management

#### Features
- Hierarchical organization structure
- Role-based access control (RBAC)
- User invitation and management
- Subscription tier management
- Resource isolation

#### Implementation
```typescript
// Set current organization context
enterprise.setCurrentOrganization(organization)

// Fetch organization users
await enterprise.fetchOrganizationUsers(orgId)

// Invite new user with specific role
await enterprise.inviteUser(email, OrganizationRole.ANALYST, permissions)

// Update user role and permissions
await enterprise.updateUserRole(userId, newRole, newPermissions)
```

#### Roles Available
- `SUPER_ADMIN`: Full system access
- `ORG_ADMIN`: Organization administration
- `COMPLIANCE_MANAGER`: Compliance oversight
- `LEGAL_ANALYST`: Advanced analysis features
- `SENIOR_ANALYST`: Standard analysis with sharing
- `ANALYST`: Basic analysis features
- `VIEWER`: Read-only access
- `AUDITOR`: Audit trail access
- `GUEST`: Limited access

### 2. SAML/SSO Integration

#### Supported Providers
- SAML 2.0 (Generic)
- Azure Active Directory
- Google Workspace
- Okta
- OneLogin
- Auth0

#### Configuration
The SAML configuration component supports:
- Metadata import/export
- Attribute mapping
- User provisioning (JIT)
- Security settings (encryption, signing)
- Domain restrictions

#### Implementation
```typescript
// Create SSO provider
const provider = await enterprise.createSSOProvider({
  name: 'Azure AD',
  type: 'saml',
  configuration: samlConfig,
  enabled: true
})

// Test connection
const result = await enterprise.testSSOConnection(providerId)
```

### 3. Multi-Factor Authentication

#### Supported Methods
- TOTP (Time-based One-Time Password)
- SMS verification
- Backup codes
- Trusted devices

#### Organization Policy
Admins can configure:
- Required roles for MFA
- Grace period for setup
- Backup code policies
- Trusted device settings

#### Implementation
```typescript
// Setup MFA for user
const setup = await enterprise.setupMFA('totp')
const { qrCode, backupCodes } = setup

// Verify MFA code
await enterprise.verifyMFA(code, method)

// Update organization MFA policy
await enterprise.updateMFAConfig({
  enabled: true,
  requiredForRoles: [OrganizationRole.ORG_ADMIN],
  gracePeriod: 24
})
```

### 4. Advanced Reporting

#### Report Types
- **Analysis Reports**: Document analysis summaries
- **Compliance Reports**: GDPR/CCPA compliance status
- **Usage Reports**: System usage metrics
- **Security Reports**: Security events and incidents

#### Export Formats
- PDF with custom branding
- CSV for data analysis
- Excel workbooks
- JSON for API integration

#### Implementation
```typescript
// Create report template
const template = await enterprise.createReportTemplate({
  name: 'Monthly Analysis Report',
  type: 'analysis',
  format: 'pdf',
  branding: true,
  schedule: {
    enabled: true,
    frequency: 'monthly',
    recipients: ['admin@company.com']
  }
})

// Generate report
const report = await enterprise.generateReport(templateId, filters)

// Download report
await enterprise.downloadReport(reportId)
```

### 5. GDPR/CCPA Compliance

#### Features
- Data export requests (right to portability)
- Data deletion requests (right to erasure)
- Audit trail export
- Consent tracking
- Automated data retention

#### Implementation
```typescript
// Request data export
const exportRequest = await enterprise.requestDataExport('gdpr', {
  includeDocuments: true,
  includeAnalyses: true,
  format: 'json'
})

// Request data deletion
const deletionRequest = await enterprise.requestDataDeletion({
  reason: 'User requested account deletion',
  deletionScope: {
    userData: true,
    documents: true,
    analyses: true
  }
})

// Export audit logs
const downloadUrl = await enterprise.exportAuditLogs('csv', filters)
```

### 6. Security Monitoring

#### Event Types Monitored
- Suspicious login attempts
- Brute force attacks
- Data exfiltration attempts
- Privilege escalation
- Malware detection
- System intrusions

#### Alert Configuration
- Custom alert rules
- Multiple notification channels
- Severity-based filtering
- Geographic monitoring

#### Implementation
```typescript
// Fetch security events
await enterprise.fetchSecurityEvents()

// Acknowledge security event
await enterprise.acknowledgeSecurityEvent(eventId)

// Resolve security event
await enterprise.resolveSecurityEvent(eventId, resolution)

// Create alert rule
const rule = {
  name: 'High Severity Events',
  severity: 'high',
  threshold: 5,
  timeWindow: 60,
  channels: [AlertChannel.EMAIL, AlertChannel.SLACK]
}
```

### 7. Session Management

#### Security Features
- IP address binding
- User agent verification
- Concurrent session limits
- Idle and absolute timeouts
- Geographic monitoring
- Device fingerprinting

#### Implementation
```typescript
// Fetch active sessions
await enterprise.fetchActiveSessions()

// Terminate specific session
await enterprise.terminateSession(sessionId)

// Update session settings
await enterprise.updateOrganization(orgId, {
  settings: {
    sessionSettings: {
      maxConcurrentSessions: 3,
      idleTimeout: 30,
      absoluteTimeout: 480,
      ipBinding: true
    }
  }
})
```

### 8. White-Label Customization

#### Customizable Elements
- Brand colors (primary/secondary)
- Company logo and favicon
- Login page background
- Custom CSS styling
- Custom domain
- Support contact information

#### Implementation
```typescript
// Update organization branding
await enterprise.updateOrganization(orgId, {
  branding: {
    primaryColor: '#3B82F6',
    secondaryColor: '#64748B',
    logoUrl: 'https://cdn.company.com/logo.png',
    companyName: 'Acme Corporation',
    customDomain: 'legal.acme.com'
  }
})

// Generate custom CSS
const css = generateBrandingCSS(brandingConfig)
```

## Security Considerations

### Zero-Trust Architecture
- All API endpoints require authentication
- Role-based authorization on every request
- Input validation and sanitization
- Rate limiting and DDoS protection

### Data Protection
- Encryption at rest (AES-256)
- Encryption in transit (TLS 1.3)
- Key management system integration
- PII tokenization where applicable

### Audit Requirements
- All actions logged with user attribution
- Tamper-resistant audit trail
- Long-term retention (7 years default)
- Export capabilities for compliance

### OWASP Top 10 Mitigation
- Injection prevention (parameterized queries)
- Authentication and session management
- XSS protection (CSP headers)
- CSRF protection (tokens)
- Security misconfiguration prevention
- Sensitive data exposure prevention
- Access control enforcement
- Known vulnerability scanning
- Logging and monitoring
- Component vulnerability management

## Deployment Guide

### Environment Variables
```bash
# SAML/SSO Configuration
SAML_CERT_PATH=/path/to/certificates
SAML_PRIVATE_KEY_PATH=/path/to/private-key

# MFA Configuration
MFA_ISSUER=Fine Print AI
TOTP_WINDOW=1

# Email Configuration
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key

# Redis for session management
REDIS_URL=redis://localhost:6379

# Database encryption
DB_ENCRYPTION_KEY=your-32-byte-encryption-key
```

### Database Migrations
Run the enterprise database migrations:
```sql
-- Organization tables
CREATE TABLE organizations (...);
CREATE TABLE organization_users (...);
CREATE TABLE organization_settings (...);

-- Security tables
CREATE TABLE security_events (...);
CREATE TABLE audit_logs (...);
CREATE TABLE user_sessions (...);

-- Compliance tables
CREATE TABLE data_export_requests (...);
CREATE TABLE data_deletion_requests (...);

-- Reporting tables
CREATE TABLE report_templates (...);
CREATE TABLE generated_reports (...);
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fineprintai-enterprise
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fineprintai-enterprise
  template:
    metadata:
      labels:
        app: fineprintai-enterprise
    spec:
      containers:
      - name: frontend
        image: fineprintai/frontend:enterprise
        env:
        - name: VITE_ENTERPRISE_FEATURES
          value: "true"
        - name: VITE_SAML_ENABLED
          value: "true"
      - name: backend
        image: fineprintai/backend:enterprise
        env:
        - name: ENTERPRISE_FEATURES
          value: "true"
        - name: DB_ENCRYPTION_ENABLED
          value: "true"
```

## Usage Examples

### Admin Dashboard Integration
```typescript
import { AdminDashboard } from '@/components/enterprise/admin/AdminDashboard'

// In your admin route
<Route 
  path="/admin" 
  element={
    <ProtectedRoute requiredRole="org_admin">
      <AdminDashboard />
    </ProtectedRoute>
  } 
/>
```

### SAML Configuration
```typescript
import { SAMLConfiguration } from '@/components/enterprise/auth/SAMLConfiguration'

// Configure SAML for organization
<SAMLConfiguration
  provider={ssoProvider}
  onSave={handleSAMLSave}
  onTest={handleSAMLTest}
  onDelete={handleSAMLDelete}
/>
```

### Compliance Center
```typescript
import { ComplianceCenter } from '@/components/enterprise/compliance/ComplianceCenter'

// GDPR/CCPA compliance management
<ComplianceCenter />
```

### Security Monitoring
```typescript
import { SecurityMonitoring } from '@/components/enterprise/security/SecurityMonitoring'

// Real-time security monitoring
<SecurityMonitoring />
```

## API Integration

### REST API Endpoints
```
# Organization Management
GET    /api/v1/enterprise/organizations
POST   /api/v1/enterprise/organizations
PUT    /api/v1/enterprise/organizations/:id
DELETE /api/v1/enterprise/organizations/:id

# User Management
GET    /api/v1/enterprise/organizations/:id/users
POST   /api/v1/enterprise/organizations/:id/users/invite
PUT    /api/v1/enterprise/organizations/:id/users/:userId
DELETE /api/v1/enterprise/organizations/:id/users/:userId

# Security Events
GET    /api/v1/enterprise/security-events
POST   /api/v1/enterprise/security-events/:id/acknowledge
POST   /api/v1/enterprise/security-events/:id/resolve

# Compliance
POST   /api/v1/privacy/data-export
POST   /api/v1/privacy/data-deletion
GET    /api/v1/enterprise/audit-logs
POST   /api/v1/enterprise/audit-logs/export

# Reporting
GET    /api/v1/enterprise/reports/templates
POST   /api/v1/enterprise/reports/templates
POST   /api/v1/enterprise/reports/generate
GET    /api/v1/enterprise/reports/:id/download
```

### WebSocket Events
```typescript
// Real-time security events
ws.on('security_event', (event) => {
  enterprise.addSecurityEvent(event)
})

// User activity updates
ws.on('user_activity', (activity) => {
  enterprise.updateUserActivity(activity)
})

// System health updates
ws.on('system_health', (health) => {
  enterprise.updateSystemHealth(health)
})
```

## Testing

### Unit Tests
```typescript
// Test enterprise slice
describe('Enterprise Store', () => {
  it('should fetch organizations', async () => {
    const { result } = renderHook(() => useEnterprise())
    await act(async () => {
      await result.current.fetchOrganizations()
    })
    expect(result.current.organizations).toHaveLength(1)
  })
})
```

### Integration Tests
```typescript
// Test SAML authentication flow
describe('SAML Authentication', () => {
  it('should authenticate user via SAML', async () => {
    // Test SAML login flow
    const response = await request(app)
      .post('/auth/saml/login')
      .send(samlResponse)
    
    expect(response.status).toBe(200)
    expect(response.body.user).toBeDefined()
  })
})
```

### E2E Tests
```typescript
// Test complete enterprise workflow
test('Enterprise Admin Workflow', async ({ page }) => {
  // Login as enterprise admin
  await page.goto('/login')
  await page.fill('[data-testid="email"]', 'admin@enterprise.com')
  await page.fill('[data-testid="password"]', 'password')
  await page.click('[data-testid="login-button"]')
  
  // Navigate to admin dashboard
  await page.click('[data-testid="admin-nav"]')
  await expect(page.locator('[data-testid="admin-dashboard"]')).toBeVisible()
  
  // Test user management
  await page.click('[data-testid="manage-users"]')
  await page.click('[data-testid="invite-user"]')
  await page.fill('[data-testid="user-email"]', 'newuser@enterprise.com')
  await page.selectOption('[data-testid="user-role"]', 'analyst')
  await page.click('[data-testid="send-invitation"]')
  
  // Verify invitation was sent
  await expect(page.locator('[data-testid="success-message"]')).toContainText('Invitation sent')
})
```

## Support and Maintenance

### Monitoring Checklist
- [ ] System health metrics
- [ ] Security event processing
- [ ] SAML/SSO connectivity
- [ ] Database performance
- [ ] Session management
- [ ] Audit log retention
- [ ] Report generation
- [ ] Email delivery

### Troubleshooting

#### Common Issues

1. **SAML Authentication Failures**
   - Check certificate validity
   - Verify attribute mappings
   - Review IdP configuration
   - Check network connectivity

2. **MFA Setup Issues**
   - Verify TOTP time synchronization
   - Check SMS provider configuration
   - Review backup code generation

3. **Performance Issues**
   - Monitor database query performance
   - Check Redis session storage
   - Review audit log retention
   - Optimize report generation

4. **Security Alerts**
   - Review alert rule configuration
   - Check notification delivery
   - Verify event source accuracy
   - Update threat detection rules

### Backup and Recovery

#### Data Backup
- Organization configurations
- User roles and permissions
- Audit logs and security events
- Report templates and schedules
- SAML/SSO certificates

#### Recovery Procedures
1. Database restoration
2. Certificate re-installation
3. Configuration restoration
4. Service restart
5. Health check verification

This implementation provides enterprise-grade security, compliance, and management features while maintaining the core functionality and user experience of Fine Print AI.