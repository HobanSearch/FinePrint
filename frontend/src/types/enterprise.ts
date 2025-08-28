/**
 * Enterprise Features Type Definitions
 * Comprehensive types for multi-tenant organization management, 
 * SAML/SSO integration, and advanced enterprise features.
 */

// Organization Management
export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string;
  tier: SubscriptionTier;
  status: OrganizationStatus;
  settings: OrganizationSettings;
  branding: OrganizationBranding;
  compliance: ComplianceSettings;
  createdAt: Date;
  updatedAt: Date;
  parentOrganizationId?: string;
  childOrganizations?: Organization[];
  users: OrganizationUser[];
  apiKeys: OrganizationApiKey[];
  metadata: Record<string, any>;
}

export interface OrganizationUser {
  id: string;
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  permissions: Permission[];
  status: UserStatus;
  invitedBy?: string;
  invitedAt?: Date;
  joinedAt?: Date;
  lastActiveAt?: Date;
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  };
}

export interface OrganizationSettings {
  allowUserRegistration: boolean;
  requireEmailVerification: boolean;
  passwordPolicy: PasswordPolicy;
  sessionSettings: SessionSettings;
  ipWhitelist: string[];
  allowedDomains: string[];
  ssoEnabled: boolean;
  samlConfig?: SAMLConfiguration;
  mfaRequired: boolean;
  auditLogRetention: number; // days
  dataRetention: number; // days
  maxUsers: number;
  maxDocuments: number;
  maxAnalysesPerMonth: number;
}

export interface OrganizationBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  customCSS?: string;
  customDomain?: string;
  companyName: string;
  supportEmail: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  customFavicon?: string;
  loginPageBackground?: string;
}

// Enhanced RBAC System
export enum OrganizationRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  COMPLIANCE_MANAGER = 'compliance_manager',
  LEGAL_ANALYST = 'legal_analyst',
  SENIOR_ANALYST = 'senior_analyst',
  ANALYST = 'analyst',
  VIEWER = 'viewer',
  AUDITOR = 'auditor',
  GUEST = 'guest'
}

export enum Permission {
  // Organization Management
  ORG_READ = 'org:read',
  ORG_WRITE = 'org:write',
  ORG_DELETE = 'org:delete',
  ORG_MANAGE_USERS = 'org:manage_users',
  ORG_MANAGE_SETTINGS = 'org:manage_settings',
  ORG_MANAGE_BILLING = 'org:manage_billing',
  ORG_VIEW_AUDIT = 'org:view_audit',

  // User Management
  USER_READ = 'user:read',
  USER_WRITE = 'user:write',
  USER_DELETE = 'user:delete',
  USER_INVITE = 'user:invite',
  USER_MANAGE_ROLES = 'user:manage_roles',
  USER_VIEW_ACTIVITY = 'user:view_activity',

  // Document Management
  DOCUMENT_READ = 'document:read',
  DOCUMENT_WRITE = 'document:write',
  DOCUMENT_DELETE = 'document:delete',
  DOCUMENT_SHARE = 'document:share',
  DOCUMENT_EXPORT = 'document:export',
  DOCUMENT_BATCH_UPLOAD = 'document:batch_upload',

  // Analysis Management
  ANALYSIS_READ = 'analysis:read',
  ANALYSIS_WRITE = 'analysis:write',
  ANALYSIS_DELETE = 'analysis:delete',
  ANALYSIS_EXPORT = 'analysis:export',
  ANALYSIS_SHARE = 'analysis:share',
  ANALYSIS_APPROVE = 'analysis:approve',
  ANALYSIS_BULK_OPERATIONS = 'analysis:bulk_operations',

  // Reporting & Export
  REPORT_READ = 'report:read',
  REPORT_CREATE = 'report:create',
  REPORT_DELETE = 'report:delete',
  REPORT_SCHEDULE = 'report:schedule',
  REPORT_EXPORT_ALL = 'report:export_all',

  // System Administration
  SYSTEM_READ = 'system:read',
  SYSTEM_WRITE = 'system:write',
  SYSTEM_AUDIT = 'system:audit',
  SYSTEM_BACKUP = 'system:backup',
  SYSTEM_MONITORING = 'system:monitoring',

  // Compliance & Legal
  COMPLIANCE_READ = 'compliance:read',
  COMPLIANCE_WRITE = 'compliance:write',
  COMPLIANCE_EXPORT = 'compliance:export',
  COMPLIANCE_AUDIT = 'compliance:audit',

  // API & Integration
  API_READ = 'api:read',
  API_WRITE = 'api:write',
  API_MANAGE_KEYS = 'api:manage_keys',
  WEBHOOK_MANAGE = 'webhook:manage'
}

export interface RoleDefinition {
  role: OrganizationRole;
  permissions: Permission[];
  description: string;
  level: number; // For hierarchy
}

// SAML/SSO Configuration
export interface SAMLConfiguration {
  enabled: boolean;
  entityId: string;
  ssoUrl: string;
  x509Certificate: string;
  signatureAlgorithm: 'sha1' | 'sha256';
  nameIdFormat: string;
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    role?: string;
    department?: string;
  };
  encryptAssertions: boolean;
  signRequests: boolean;
  autoProvision: boolean;
  defaultRole: OrganizationRole;
  domainRestriction?: string[];
}

export interface OIDCConfiguration {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  scope: string[];
  responseType: string;
  autoProvision: boolean;
  defaultRole: OrganizationRole;
  userInfoMapping: {
    email: string;
    name: string;
    picture?: string;
    role?: string;
  };
}

export interface SSOProvider {
  id: string;
  name: string;
  type: 'saml' | 'oidc' | 'oauth2';
  enabled: boolean;
  organizationId: string;
  configuration: SAMLConfiguration | OIDCConfiguration;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Multi-Factor Authentication
export interface MFAConfiguration {
  enabled: boolean;
  requiredForRoles: OrganizationRole[];
  methods: MFAMethod[];
  gracePeriod: number; // hours
  backupCodes: boolean;
  trustedDevices: boolean;
  rememberDuration: number; // days
}

export interface MFAMethod {
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  enabled: boolean;
  priority: number;
}

export interface UserMFAStatus {
  enabled: boolean;
  methods: {
    type: MFAMethod['type'];
    verified: boolean;
    lastUsed?: Date;
  }[];
  backupCodes: number;
  trustedDevices: TrustedDevice[];
}

export interface TrustedDevice {
  id: string;
  name: string;
  fingerprint: string;
  addedAt: Date;
  lastUsed: Date;
  ipAddress: string;
  userAgent: string;
}

// Session Management
export interface SessionSettings {
  maxConcurrentSessions: number;
  idleTimeout: number; // minutes
  absoluteTimeout: number; // minutes
  requireSecureCookies: boolean;
  ipBinding: boolean;
  userAgentBinding: boolean;
  notifyOnNewSession: boolean;
}

export interface UserSession {
  id: string;
  userId: string;
  organizationId: string;
  deviceInfo: {
    browser: string;
    os: string;
    device: string;
    fingerprint: string;
  };
  ipAddress: string;
  location?: {
    country: string;
    region: string;
    city: string;
  };
  userAgent: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  isCurrent: boolean;
  status: 'active' | 'expired' | 'terminated';
}

// Audit & Compliance
export interface AuditLog {
  id: string;
  organizationId: string;
  userId?: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details: Record<string, any>;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: AuditCategory;
  tags: string[];
}

export enum AuditAction {
  // Authentication
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  PASSWORD_CHANGE = 'auth.password.change',
  MFA_SETUP = 'auth.mfa.setup',
  MFA_VERIFY = 'auth.mfa.verify',

  // User Management
  USER_CREATE = 'user.create',
  USER_UPDATE = 'user.update',
  USER_DELETE = 'user.delete',
  USER_INVITE = 'user.invite',
  USER_ROLE_CHANGE = 'user.role.change',

  // Document Management
  DOCUMENT_UPLOAD = 'document.upload',
  DOCUMENT_VIEW = 'document.view',
  DOCUMENT_DELETE = 'document.delete',
  DOCUMENT_EXPORT = 'document.export',

  // Analysis
  ANALYSIS_START = 'analysis.start',
  ANALYSIS_COMPLETE = 'analysis.complete',
  ANALYSIS_EXPORT = 'analysis.export',
  ANALYSIS_SHARE = 'analysis.share',

  // System
  SYSTEM_CONFIG_CHANGE = 'system.config.change',
  SYSTEM_BACKUP = 'system.backup',
  SYSTEM_RESTORE = 'system.restore',

  // Data Export/Import
  DATA_EXPORT = 'data.export',
  DATA_IMPORT = 'data.import',
  DATA_DELETE = 'data.delete'
}

export enum AuditCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  USER_MANAGEMENT = 'user_management',
  DOCUMENT_MANAGEMENT = 'document_management',
  ANALYSIS = 'analysis',
  SYSTEM_ADMINISTRATION = 'system_administration',
  DATA_PRIVACY = 'data_privacy',
  COMPLIANCE = 'compliance',
  SECURITY = 'security'
}

// Compliance Features
export interface ComplianceSettings {
  gdprEnabled: boolean;
  ccpaEnabled: boolean;
  soc2Compliance: boolean;
  dataRetentionPeriod: number; // days
  automaticDataDeletion: boolean;
  consentTracking: boolean;
  rightToErasure: boolean;
  dataPortability: boolean;
  auditLogRetention: number; // days
  encryptionAtRest: boolean;
  encryptionInTransit: boolean;
}

export interface DataExportRequest {
  id: string;
  userId: string;
  organizationId: string;
  type: 'gdpr' | 'ccpa' | 'general';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  includeDocuments: boolean;
  includeAnalyses: boolean;
  includeAuditLogs: boolean;
  format: 'json' | 'csv' | 'pdf';
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  organizationId: string;
  type: 'user_requested' | 'compliance' | 'retention_policy';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  scheduledFor: Date;
  completedAt?: Date;
  deletionScope: {
    userData: boolean;
    documents: boolean;
    analyses: boolean;
    auditLogs: boolean;
  };
  verification: {
    required: boolean;
    code?: string;
    expiresAt?: Date;
    verifiedAt?: Date;
  };
}

// Advanced Export & Reporting
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  type: 'analysis' | 'compliance' | 'usage' | 'security';
  format: 'pdf' | 'csv' | 'xlsx' | 'json';
  template: Record<string, any>; // Report template configuration
  filters: ReportFilters;
  schedule?: ReportSchedule;
  branding: boolean;
  watermark: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReportFilters {
  dateRange?: {
    start: Date;
    end: Date;
  };
  users?: string[];
  departments?: string[];
  documentTypes?: string[];
  riskLevels?: string[];
  tags?: string[];
  customFilters?: Record<string, any>;
}

export interface ReportSchedule {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dayOfWeek?: number; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  time: string; // HH:MM format
  timezone: string;
  recipients: string[];
  deliveryMethod: 'email' | 'webhook' | 'download';
  retainFor: number; // days
}

export interface GeneratedReport {
  id: string;
  templateId: string;
  organizationId: string;
  name: string;
  format: string;
  status: 'generating' | 'completed' | 'failed';
  fileUrl?: string;
  fileSizeBytes?: number;
  generatedAt: Date;
  expiresAt: Date;
  downloadCount: number;
  generatedBy: string;
  metadata: Record<string, any>;
}

// Security & Monitoring
export interface SecurityEvent {
  id: string;
  organizationId: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  details: Record<string, any>;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  detectedAt: Date;
  status: 'new' | 'investigating' | 'resolved' | 'dismissed';
  assignedTo?: string;
  resolution?: string;
  resolvedAt?: Date;
}

export enum SecurityEventType {
  SUSPICIOUS_LOGIN = 'suspicious_login',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  UNUSUAL_ACCESS_PATTERN = 'unusual_access_pattern',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_EXFILTRATION = 'data_exfiltration',
  MALWARE_DETECTED = 'malware_detected',
  INSIDER_THREAT = 'insider_threat',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  UNAUTHORIZED_API_ACCESS = 'unauthorized_api_access',
  SYSTEM_INTRUSION = 'system_intrusion'
}

export interface SecurityAlert {
  id: string;
  eventId: string;
  organizationId: string;
  title: string;
  message: string;
  severity: SecurityEvent['severity'];
  channels: AlertChannel[];
  sentAt: Date;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export enum AlertChannel {
  EMAIL = 'email',
  SMS = 'sms',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  IN_APP = 'in_app'
}

// API & Integration
export interface OrganizationApiKey {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  permissions: Permission[];
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
  };
  ipWhitelist?: string[];
  referrerWhitelist?: string[];
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdBy: string;
  createdAt: Date;
  status: 'active' | 'revoked' | 'expired';
}

export interface WebhookEndpoint {
  id: string;
  organizationId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  enabled: boolean;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    maxBackoffSeconds: number;
  };
  headers?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  failureCount: number;
}

export enum WebhookEvent {
  ANALYSIS_COMPLETED = 'analysis.completed',
  DOCUMENT_UPLOADED = 'document.uploaded',
  USER_INVITED = 'user.invited',
  SECURITY_ALERT = 'security.alert',
  COMPLIANCE_VIOLATION = 'compliance.violation',
  USAGE_LIMIT_REACHED = 'usage.limit_reached'
}

// Subscription & Billing
export enum SubscriptionTier {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
  CUSTOM = 'custom'
}

export enum OrganizationStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
  EXPIRED = 'expired',
  PENDING = 'pending'
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',
  SUSPENDED = 'suspended'
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  prohibitedPatterns: string[];
  historyCount: number; // Prevent reusing last N passwords
  maxAge: number; // Days before password expires
  minAge: number; // Days before password can be changed again
}

// Usage Analytics
export interface UsageMetrics {
  organizationId: string;
  period: {
    start: Date;
    end: Date;
  };
  users: {
    total: number;
    active: number;
    new: number;
  };
  documents: {
    uploaded: number;
    analyzed: number;
    totalSize: number;
  };
  analyses: {
    total: number;
    successful: number;
    failed: number;
    averageProcessingTime: number;
  };
  api: {
    requests: number;
    errors: number;
    rateLimitHits: number;
  };
  storage: {
    used: number;
    limit: number;
    percentage: number;
  };
}