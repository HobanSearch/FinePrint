/**
 * Fine Print AI - Authentication & Authorization Types
 * Central type definitions for the authentication system
 */

// Re-export service-specific types
export * from '../services/authentication-service';
export * from '../services/authorization-service';
export * from '../services/token-service';
export * from '../services/session-service';
export * from '../services/certificate-service';
export * from '../services/risk-assessment-service';

// Common types used across services
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

export interface AuditLog extends BaseEntity {
  entityType: string;
  entityId: string;
  action: string;
  changes?: Record<string, { before: any; after: any }>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface SecurityEvent extends BaseEntity {
  type: 'authentication' | 'authorization' | 'token' | 'session' | 'certificate' | 'risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  sessionId?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  description: string;
  details?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface SecurityMetric {
  name: string;
  value: number;
  unit?: string;
  timestamp: Date;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface UserContext {
  userId: string;
  email?: string;
  roles: string[];
  permissions: string[];
  sessionId?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: GeoLocation;
  riskScore?: number;
  attributes?: Record<string, any>;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  accuracy?: number;
  source?: 'geoip' | 'gps' | 'network' | 'manual';
}

export interface DeviceFingerprint {
  id: string;
  hash: string;
  userAgent: string;
  screenResolution?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  cookiesEnabled?: boolean;
  doNotTrack?: boolean;
  plugins?: string[];
  fonts?: string[];
  canvas?: string;
  webgl?: string;
  audio?: string;
  confidence: number;
  createdAt: Date;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

export interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  responseTime?: number;
  details?: {
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      data?: any;
    }>;
  };
}

export interface ServiceDependency {
  name: string;
  type: 'database' | 'cache' | 'external_api' | 'message_queue' | 'file_system';
  url?: string;
  required: boolean;
  timeout?: number;
  retries?: number;
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
    timeout: number;
  };
}

// Error types
export class AuthenticationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly retryable: boolean;

  constructor(message: string, code: string, statusCode: number = 401, retryable: boolean = false) {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

export class AuthorizationError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly requiredPermissions?: string[];

  constructor(message: string, code: string, statusCode: number = 403, requiredPermissions?: string[]) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = statusCode;
    this.requiredPermissions = requiredPermissions;
  }
}

export class TokenError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly tokenType?: string;

  constructor(message: string, code: string, statusCode: number = 401, tokenType?: string) {
    super(message);
    this.name = 'TokenError';
    this.code = code;
    this.statusCode = statusCode;
    this.tokenType = tokenType;
  }
}

export class SessionError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly sessionId?: string;

  constructor(message: string, code: string, statusCode: number = 401, sessionId?: string) {
    super(message);
    this.name = 'SessionError';
    this.code = code;
    this.statusCode = statusCode;
    this.sessionId = sessionId;
  }
}

export class CertificateError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly certificateId?: string;

  constructor(message: string, code: string, statusCode: number = 400, certificateId?: string) {
    super(message);
    this.name = 'CertificateError';
    this.code = code;
    this.statusCode = statusCode;
    this.certificateId = certificateId;
  }
}

export class RiskAssessmentError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly riskScore?: number;

  constructor(message: string, code: string, statusCode: number = 403, riskScore?: number) {
    super(message);
    this.name = 'RiskAssessmentError';
    this.code = code;
    this.statusCode = statusCode;
    this.riskScore = riskScore;
  }
}

// Configuration types
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: 4 | 6;
  connectTimeout?: number;
  commandTimeout?: number;
  retryDelayOnClusterDown?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

export interface DatabaseConfig {
  url: string;
  ssl?: boolean;
  connectionLimit?: number;
  idleTimeout?: number;
  acquireTimeout?: number;
  createTimeout?: number;
  destroyTimeout?: number;
  reapInterval?: number;
  createRetryInterval?: number;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  format: 'json' | 'text';
  outputs: Array<{
    type: 'console' | 'file' | 'syslog' | 'elasticsearch';
    config?: any;
  }>;
  enableSensitiveDataLogging?: boolean;
  maskSensitiveFields?: string[];
}

export interface MonitoringConfig {
  enabled: boolean;
  metrics?: {
    enabled: boolean;
    endpoint?: string;
    interval?: number;
    labels?: Record<string, string>;
  };
  tracing?: {
    enabled: boolean;
    endpoint?: string;
    sampleRate?: number;
    serviceName?: string;
    serviceVersion?: string;
  };
  alerting?: {
    enabled: boolean;
    rules?: Array<{
      name: string;
      condition: string;
      threshold: number;
      duration: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
      notifications: string[];
    }>;
  };
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: Date;
    requestId: string;
    processingTime?: number;
    rateLimit?: RateLimitInfo;
  };
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    displayName?: string;
    role: string;
    permissions: string[];
    emailVerified: boolean;
    mfaEnabled: boolean;
    lastLoginAt?: Date;
  };
  tokens: {
    accessToken: string;
    refreshToken?: string;
    tokenType: string;
    expiresIn: number;
  };
  session: {
    id: string;
    expiresAt: Date;
    deviceTrusted: boolean;
  };
  security: {
    riskScore: number;
    requiresMfa: boolean;
    trustedDevice: boolean;
    location?: GeoLocation;
  };
}

// Integration types
export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string[];
  responseType: string;
  grantType: string;
  redirectUri: string;
  enabled: boolean;
}

export interface LDAPConfig {
  url: string;
  bindDN: string;
  bindPassword: string;
  searchBase: string;
  searchFilter: string;
  attributes: {
    username: string;
    email: string;
    displayName: string;
    groups: string;
  };
  groupSearchBase?: string;
  groupSearchFilter?: string;
  tls?: {
    enabled: boolean;
    rejectUnauthorized: boolean;
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export interface VaultConfig {
  endpoint: string;
  token?: string;
  roleId?: string;
  secretId?: string;
  authMethod: 'token' | 'approle' | 'kubernetes' | 'aws' | 'azure';
  mount: string;
  namespace?: string;
  timeout?: number;
  retries?: number;
}

// Agent-specific types
export interface AgentConfig {
  id: string;
  name: string;
  type: 'dspy' | 'lora' | 'knowledge_graph' | 'general';
  version: string;
  description?: string;
  capabilities: string[];
  resources: {
    cpu?: string;
    memory?: string;
    gpu?: string;
    storage?: string;
  };
  networking: {
    ports: number[];
    protocols: string[];
    endpoints: string[];
  };
  security: {
    certificateRequired: boolean;
    mutualTLS: boolean;
    apiKeyRequired: boolean;
    rateLimits: {
      requests: number;
      window: number; // seconds
    };
    allowedIPs?: string[];
    blockedIPs?: string[];
  };
  monitoring: {
    healthCheck: {
      enabled: boolean;
      endpoint?: string;
      interval?: number;
      timeout?: number;
    };
    metrics: {
      enabled: boolean;
      endpoint?: string;
      labels?: Record<string, string>;
    };
  };
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AgentStatus {
  id: string;
  status: 'online' | 'offline' | 'starting' | 'stopping' | 'error';
  lastSeen: Date;
  version: string;
  uptime: number;
  health: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Array<{
      name: string;
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      lastCheck: Date;
    }>;
  };
  metrics?: {
    cpu: number;
    memory: number;
    disk: number;
    network: {
      in: number;
      out: number;
    };
    requests: {
      total: number;
      success: number;
      error: number;
      avgResponseTime: number;
    };
  };
  configuration?: Record<string, any>;
  metadata?: Record<string, any>;
}

// Export utility types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type RequiredKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;