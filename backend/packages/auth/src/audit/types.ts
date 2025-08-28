export interface AuditConfig {
  enabled: boolean;
  storage: 'redis' | 'database' | 'file' | 'elasticsearch';
  retention: {
    days: number;
    maxEntries: number;
  };
  levels: AuditLevel[];
  sensitiveFields: string[];
  encryption: {
    enabled: boolean;
    key?: string;
  };
  forwarding: {
    enabled: boolean;
    endpoints: string[];
    headers: Record<string, string>;
  };
}

export enum AuditLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum AuditEventType {
  // Authentication events
  LOGIN_ATTEMPT = 'auth.login.attempt',
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  
  // Password events
  PASSWORD_CHANGE = 'auth.password.change',
  PASSWORD_RESET_REQUEST = 'auth.password.reset.request',
  PASSWORD_RESET_CONFIRM = 'auth.password.reset.confirm',
  PASSWORD_EXPIRED = 'auth.password.expired',
  
  // Token events
  TOKEN_ISSUED = 'auth.token.issued',
  TOKEN_REFRESHED = 'auth.token.refreshed',
  TOKEN_REVOKED = 'auth.token.revoked',
  TOKEN_EXPIRED = 'auth.token.expired',
  TOKEN_BLACKLISTED = 'auth.token.blacklisted',
  
  // Session events
  SESSION_CREATED = 'auth.session.created',
  SESSION_TERMINATED = 'auth.session.terminated',
  SESSION_EXPIRED = 'auth.session.expired',
  SESSION_SUSPICIOUS = 'auth.session.suspicious',
  
  // MFA events
  MFA_SETUP = 'auth.mfa.setup',
  MFA_ENABLED = 'auth.mfa.enabled',
  MFA_DISABLED = 'auth.mfa.disabled',
  MFA_CHALLENGE = 'auth.mfa.challenge',
  MFA_SUCCESS = 'auth.mfa.success',
  MFA_FAILURE = 'auth.mfa.failure',
  MFA_LOCKOUT = 'auth.mfa.lockout',
  
  // OAuth events
  OAUTH_AUTHORIZATION = 'auth.oauth.authorization',
  OAUTH_TOKEN_EXCHANGE = 'auth.oauth.token_exchange',
  OAUTH_ACCOUNT_LINK = 'auth.oauth.account_link',
  OAUTH_ACCOUNT_UNLINK = 'auth.oauth.account_unlink',
  
  // Security events
  RATE_LIMIT_EXCEEDED = 'security.rate_limit.exceeded',
  SUSPICIOUS_ACTIVITY = 'security.suspicious_activity',
  BRUTE_FORCE_ATTEMPT = 'security.brute_force.attempt',
  IP_BLOCKED = 'security.ip.blocked',
  IP_UNBLOCKED = 'security.ip.unblocked',
  
  // Admin events
  USER_CREATED = 'admin.user.created',
  USER_DELETED = 'admin.user.deleted',
  USER_BANNED = 'admin.user.banned',
  USER_UNBANNED = 'admin.user.unbanned',
  PERMISSIONS_CHANGED = 'admin.permissions.changed',
  
  // System events
  SYSTEM_STARTUP = 'system.startup',
  SYSTEM_SHUTDOWN = 'system.shutdown',
  CONFIG_CHANGED = 'system.config.changed',
  MAINTENANCE_STARTED = 'system.maintenance.started',
  MAINTENANCE_COMPLETED = 'system.maintenance.completed'
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: AuditEventType;
  level: AuditLevel;
  actor: AuditActor;
  resource?: AuditResource;
  action: string;
  outcome: 'success' | 'failure' | 'pending';
  details: Record<string, any>;
  context: AuditContext;
  metadata: AuditMetadata;
}

export interface AuditActor {
  type: 'user' | 'system' | 'service' | 'admin' | 'anonymous';
  id?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface AuditResource {
  type: 'user' | 'session' | 'token' | 'mfa_method' | 'oauth_account' | 'system';
  id?: string;
  name?: string;
  properties?: Record<string, any>;
}

export interface AuditContext {
  requestId?: string;
  correlationId?: string;
  service: string;
  version: string;
  environment: string;
  traceId?: string;
  spanId?: string;
}

export interface AuditMetadata {
  encrypted: boolean;
  compressed: boolean;
  signature?: string;
  hash?: string;
  retention: Date;
  tags: string[];
}

export interface AuditQuery {
  startDate?: Date;
  endDate?: Date;
  types?: AuditEventType[];
  levels?: AuditLevel[];
  actorIds?: string[];
  actorTypes?: string[];
  outcomes?: ('success' | 'failure' | 'pending')[];
  resourceIds?: string[];
  resourceTypes?: string[];
  ipAddresses?: string[];
  limit?: number;
  offset?: number;
  sortBy?: 'timestamp' | 'type' | 'level';
  sortOrder?: 'asc' | 'desc';
}

export interface AuditStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsByLevel: Record<string, number>;
  eventsByOutcome: Record<string, number>;
  eventsByActor: Record<string, number>;
  recentEvents: AuditEvent[];
  topRiskyEvents: AuditEvent[];
  anomalies: AuditAnomaly[];
}

export interface AuditAnomaly {
  id: string;
  type: 'unusual_volume' | 'new_location' | 'suspicious_pattern' | 'failed_attempts';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  firstSeen: Date;
  lastSeen: Date;
  count: number;
  relatedEvents: string[];
  context: Record<string, any>;
}

export interface AuditAlert {
  id: string;
  name: string;
  description: string;
  condition: (events: AuditEvent[]) => boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldownPeriod: number; // in seconds
  enabled: boolean;
  lastTriggered?: Date;
  triggerCount: number;
}