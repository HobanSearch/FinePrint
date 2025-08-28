/**
 * Fine Print AI - Authorization Service
 * Enterprise-grade authorization system with RBAC, ABAC, and fine-grained permissions
 */

import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { newEnforcer, Enforcer } from 'casbin';
import * as ACL from 'acl';
import { LoggerService } from '../../logger/src/services/logger-service';
import { ConfigService } from '../../config/src/services/configuration';

export interface AuthorizationConfig {
  // RBAC Configuration
  rbac: {
    enabled: boolean;
    hierarchicalRoles: boolean;
    roleInheritance: boolean;
    defaultRole: string;
    maxRolesPerUser: number;
  };

  // ABAC Configuration
  abac: {
    enabled: boolean;
    strictMode: boolean;
    contextualEvaluation: boolean;
    dynamicPolicies: boolean;
    attributeExpiration: number;
  };

  // Permission Configuration
  permissions: {
    cacheEnabled: boolean;
    cacheTTL: number;
    inheritanceEnabled: boolean;
    negativePermissions: boolean;
    wildcardSupport: boolean;
  };

  // Resource Access Control
  resources: {
    hierarchicalResources: boolean;
    ownershipValidation: boolean;
    temporaryAccess: boolean;
    accessLogging: boolean;
  };

  // Policy Configuration
  policies: {
    dynamicEvaluation: boolean;
    contextAware: boolean;
    timeBasedAccess: boolean;
    locationBasedAccess: boolean;
    deviceBasedAccess: boolean;
  };
}

export enum Permission {
  // User Management
  USER_CREATE = 'user:create',
  USER_READ = 'user:read',
  USER_UPDATE = 'user:update',
  USER_DELETE = 'user:delete',
  USER_LIST = 'user:list',
  USER_MANAGE_ROLES = 'user:manage_roles',
  USER_IMPERSONATE = 'user:impersonate',

  // Document Management
  DOCUMENT_CREATE = 'document:create',
  DOCUMENT_READ = 'document:read',
  DOCUMENT_UPDATE = 'document:update',
  DOCUMENT_DELETE = 'document:delete',
  DOCUMENT_LIST = 'document:list',
  DOCUMENT_SHARE = 'document:share',
  DOCUMENT_EXPORT = 'document:export',
  DOCUMENT_ANALYZE = 'document:analyze',

  // Analysis Management
  ANALYSIS_CREATE = 'analysis:create',
  ANALYSIS_READ = 'analysis:read',
  ANALYSIS_UPDATE = 'analysis:update',
  ANALYSIS_DELETE = 'analysis:delete',
  ANALYSIS_LIST = 'analysis:list',
  ANALYSIS_EXPORT = 'analysis:export',
  ANALYSIS_MANAGE_TEMPLATES = 'analysis:manage_templates',

  // Team Management
  TEAM_CREATE = 'team:create',
  TEAM_READ = 'team:read',
  TEAM_UPDATE = 'team:update',
  TEAM_DELETE = 'team:delete',
  TEAM_LIST = 'team:list',
  TEAM_MANAGE_MEMBERS = 'team:manage_members',
  TEAM_MANAGE_PERMISSIONS = 'team:manage_permissions',

  // Organization Management
  ORG_READ = 'org:read',
  ORG_UPDATE = 'org:update',
  ORG_MANAGE_BILLING = 'org:manage_billing',
  ORG_MANAGE_SETTINGS = 'org:manage_settings',
  ORG_MANAGE_INTEGRATIONS = 'org:manage_integrations',
  ORG_VIEW_ANALYTICS = 'org:view_analytics',

  // System Administration
  ADMIN_USER_MANAGEMENT = 'admin:user_management',
  ADMIN_SYSTEM_CONFIG = 'admin:system_config',
  ADMIN_SECURITY_SETTINGS = 'admin:security_settings',
  ADMIN_AUDIT_LOGS = 'admin:audit_logs',
  ADMIN_SYSTEM_MONITORING = 'admin:system_monitoring',
  ADMIN_BACKUP_RESTORE = 'admin:backup_restore',

  // AI Agent Permissions
  AGENT_EXECUTE = 'agent:execute',
  AGENT_MANAGE = 'agent:manage',
  AGENT_CONFIGURE = 'agent:configure',
  AGENT_MONITOR = 'agent:monitor',
  AGENT_DEPLOY = 'agent:deploy',

  // API Access
  API_READ = 'api:read',
  API_WRITE = 'api:write',
  API_ADMIN = 'api:admin',
  API_RATE_LIMIT_OVERRIDE = 'api:rate_limit_override',

  // Integration Permissions
  INTEGRATION_READ = 'integration:read',
  INTEGRATION_WRITE = 'integration:write',
  INTEGRATION_CONFIGURE = 'integration:configure',
  INTEGRATION_DELETE = 'integration:delete'
}

export enum Role {
  // User Roles
  FREE_USER = 'free_user',
  PRO_USER = 'pro_user',
  ENTERPRISE_USER = 'enterprise_user',

  // Team Roles
  TEAM_MEMBER = 'team_member',
  TEAM_LEAD = 'team_lead',
  TEAM_ADMIN = 'team_admin',

  // Organization Roles
  ORG_MEMBER = 'org_member',
  ORG_ADMIN = 'org_admin',
  ORG_OWNER = 'org_owner',

  // System Roles
  SYSTEM_ADMIN = 'system_admin',
  SECURITY_ADMIN = 'security_admin',
  SUPPORT_AGENT = 'support_agent',

  // AI Agent Roles
  AI_AGENT = 'ai_agent',
  AGENT_SUPERVISOR = 'agent_supervisor',
  AGENT_ADMIN = 'agent_admin'
}

export interface AuthorizationContext {
  userId: string;
  sessionId?: string;
  roles: Role[];
  teams?: string[];
  organizations?: string[];
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country: string;
    region: string;
    city: string;
  };
  timestamp: Date;
  riskScore?: number;
  attributes?: Record<string, any>;
}

export interface ResourceContext {
  id: string;
  type: string;
  ownerId?: string;
  teamId?: string;
  organizationId?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  attributes?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AccessRequest {
  subject: AuthorizationContext;
  resource: ResourceContext;
  action: Permission | string;
  environment?: {
    timestamp: Date;
    ipAddress?: string;
    deviceType?: string;
    location?: any;
    riskScore?: number;
  };
}

export interface AccessDecision {
  granted: boolean;
  reason: string;
  conditions?: AccessCondition[];
  ttl?: number;
  denyReason?: string;
  requiredAttributes?: string[];
  suggestedActions?: string[];
}

export interface AccessCondition {
  type: 'time' | 'location' | 'device' | 'mfa' | 'approval' | 'audit';
  requirement: any;
  validUntil?: Date;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  effect: 'permit' | 'deny';
  subject: PolicyPattern;
  resource: PolicyPattern;
  action: PolicyPattern;
  condition?: PolicyCondition;
  priority: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyPattern {
  type: 'exact' | 'wildcard' | 'regex' | 'attribute';
  value: string | string[];
  attributes?: Record<string, any>;
}

export interface PolicyCondition {
  type: 'and' | 'or' | 'not';
  conditions: Array<{
    attribute: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains' | 'matches';
    value: any;
  }>;
}

export interface RoleDefinition {
  id: string;
  name: Role;
  displayName: string;
  description: string;
  permissions: Permission[];
  inherits?: Role[];
  conditions?: PolicyCondition[];
  metadata?: Record<string, any>;
  isSystemRole: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class AuthorizationService extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: AuthorizationConfig;
  private logger: LoggerService;
  private configService: ConfigService;
  private casbin?: Enforcer;
  private acl?: ACL.Acl;
  
  // Cache for frequently accessed permissions
  private permissionCache: Map<string, { permissions: Permission[]; expiry: number }> = new Map();
  private roleCache: Map<string, { roles: Role[]; expiry: number }> = new Map();

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: AuthorizationConfig,
    logger: LoggerService,
    configService: ConfigService
  ) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
    this.configService = configService;

    this.initializeAuthorizationEngines();
  }

  /**
   * Initialize authorization engines (Casbin for ABAC, ACL for RBAC)
   */
  private async initializeAuthorizationEngines(): Promise<void> {
    try {
      if (this.config.abac.enabled) {
        // Initialize Casbin for ABAC
        this.casbin = await newEnforcer('path/to/model.conf', 'path/to/policy.csv');
        this.logger.info('Casbin ABAC engine initialized');
      }

      if (this.config.rbac.enabled) {
        // Initialize ACL for RBAC
        this.acl = new ACL(new ACL.redisBackend(this.redis, 'fineprintai_acl'));
        await this.initializeDefaultRoles();
        this.logger.info('ACL RBAC engine initialized');
      }
    } catch (error) {
      this.logger.error('Failed to initialize authorization engines', { error: error.message });
      throw error;
    }
  }

  /**
   * Check if a user has permission to perform an action on a resource
   */
  async checkPermission(request: AccessRequest): Promise<AccessDecision> {
    try {
      const startTime = Date.now();

      // Check cache first if enabled
      const cacheKey = this.generateCacheKey(request);
      if (this.config.permissions.cacheEnabled) {
        const cached = await this.getCachedDecision(cacheKey);
        if (cached) {
          return cached;
        }
      }

      let decision: AccessDecision;

      // Use ABAC if enabled and applicable
      if (this.config.abac.enabled && this.casbin) {
        decision = await this.evaluateABAC(request);
      } 
      // Fallback to RBAC
      else if (this.config.rbac.enabled && this.acl) {
        decision = await this.evaluateRBAC(request);
      } 
      // Use simple permission-based check
      else {
        decision = await this.evaluateSimplePermissions(request);
      }

      // Apply additional policy checks
      decision = await this.applyPolicyConditions(request, decision);

      // Cache the decision if enabled
      if (this.config.permissions.cacheEnabled && decision.granted) {
        await this.cacheDecision(cacheKey, decision);
      }

      // Log access attempt
      await this.logAccessAttempt(request, decision);

      // Emit authorization event
      this.emit('authorization', {
        userId: request.subject.userId,
        resource: request.resource.type,
        action: request.action,
        granted: decision.granted,
        duration: Date.now() - startTime
      });

      return decision;

    } catch (error) {
      this.logger.error('Authorization check failed', { 
        error: error.message, 
        userId: request.subject.userId,
        resource: request.resource.type,
        action: request.action
      });

      return {
        granted: false,
        reason: 'Authorization system error',
        denyReason: error.message
      };
    }
  }

  /**
   * Evaluate access using Attribute-Based Access Control (ABAC)
   */
  private async evaluateABAC(request: AccessRequest): Promise<AccessDecision> {
    if (!this.casbin) {
      throw new Error('Casbin not initialized');
    }

    try {
      // Build subject attributes
      const subjectAttributes = {
        id: request.subject.userId,
        roles: request.subject.roles,
        teams: request.subject.teams || [],
        organizations: request.subject.organizations || [],
        riskScore: request.subject.riskScore || 0,
        ...request.subject.attributes
      };

      // Build resource attributes
      const resourceAttributes = {
        id: request.resource.id,
        type: request.resource.type,
        ownerId: request.resource.ownerId,
        teamId: request.resource.teamId,
        organizationId: request.resource.organizationId,
        classification: request.resource.classification || 'internal',
        ...request.resource.attributes
      };

      // Build environment attributes
      const environmentAttributes = {
        timestamp: request.environment?.timestamp || new Date(),
        ipAddress: request.environment?.ipAddress,
        deviceType: request.environment?.deviceType,
        location: request.environment?.location,
        riskScore: request.environment?.riskScore || 0
      };

      // Evaluate using Casbin
      const allowed = await this.casbin.enforce(
        subjectAttributes,
        resourceAttributes,
        request.action,
        environmentAttributes
      );

      if (allowed) {
        return {
          granted: true,
          reason: 'ABAC policy permits access'
        };
      } else {
        return {
          granted: false,
          reason: 'ABAC policy denies access',
          denyReason: 'Access denied by attribute-based policy'
        };
      }

    } catch (error) {
      this.logger.error('ABAC evaluation failed', { error: error.message });
      return {
        granted: false,
        reason: 'ABAC evaluation error',
        denyReason: error.message
      };
    }
  }

  /**
   * Evaluate access using Role-Based Access Control (RBAC)
   */
  private async evaluateRBAC(request: AccessRequest): Promise<AccessDecision> {
    if (!this.acl) {
      throw new Error('ACL not initialized');
    }

    try {
      const userId = request.subject.userId;
      const resource = request.resource.type;
      const permission = request.action.toString();

      // Check direct permission
      const allowed = await this.acl.isAllowed(userId, resource, permission);

      if (allowed) {
        return {
          granted: true,
          reason: 'RBAC grants access'
        };
      }

      // Check role-based permissions
      const userRoles = await this.getUserRoles(userId);
      for (const role of userRoles) {
        const roleAllowed = await this.acl.isAllowed(role, resource, permission);
        if (roleAllowed) {
          return {
            granted: true,
            reason: `RBAC grants access via role: ${role}`
          };
        }
      }

      return {
        granted: false,
        reason: 'RBAC denies access',
        denyReason: 'No matching role or direct permission found'
      };

    } catch (error) {
      this.logger.error('RBAC evaluation failed', { error: error.message });
      return {
        granted: false,
        reason: 'RBAC evaluation error',
        denyReason: error.message
      };
    }
  }

  /**
   * Evaluate access using simple permission-based checks
   */
  private async evaluateSimplePermissions(request: AccessRequest): Promise<AccessDecision> {
    try {
      const userPermissions = await this.getUserPermissions(request.subject.userId);
      const requiredPermission = request.action as Permission;

      // Check direct permission
      if (userPermissions.includes(requiredPermission)) {
        return {
          granted: true,
          reason: 'Direct permission grants access'
        };
      }

      // Check wildcard permissions if enabled
      if (this.config.permissions.wildcardSupport) {
        const wildcardPermissions = userPermissions.filter(p => p.includes('*'));
        for (const wildcardPerm of wildcardPermissions) {
          if (this.matchesWildcard(requiredPermission, wildcardPerm)) {
            return {
              granted: true,
              reason: `Wildcard permission grants access: ${wildcardPerm}`
            };
          }
        }
      }

      // Check resource ownership if applicable
      if (this.config.resources.ownershipValidation && request.resource.ownerId === request.subject.userId) {
        const ownerPermissions = await this.getOwnerPermissions(request.resource.type);
        if (ownerPermissions.includes(requiredPermission)) {
          return {
            granted: true,
            reason: 'Resource ownership grants access'
          };
        }
      }

      return {
        granted: false,
        reason: 'No matching permissions found',
        denyReason: 'User lacks required permissions'
      };

    } catch (error) {
      this.logger.error('Permission evaluation failed', { error: error.message });
      return {
        granted: false,
        reason: 'Permission evaluation error',
        denyReason: error.message
      };
    }
  }

  /**
   * Apply additional policy conditions to access decision
   */
  private async applyPolicyConditions(
    request: AccessRequest,
    decision: AccessDecision
  ): Promise<AccessDecision> {
    if (!decision.granted) {
      return decision;
    }

    const conditions: AccessCondition[] = [];

    // Time-based access control
    if (this.config.policies.timeBasedAccess) {
      const timeCondition = await this.evaluateTimeCondition(request);
      if (timeCondition && !timeCondition.satisfied) {
        return {
          granted: false,
          reason: 'Time-based access control denies access',
          denyReason: 'Access not allowed at this time'
        };
      }
      if (timeCondition?.condition) {
        conditions.push(timeCondition.condition);
      }
    }

    // Location-based access control
    if (this.config.policies.locationBasedAccess && request.subject.location) {
      const locationCondition = await this.evaluateLocationCondition(request);
      if (locationCondition && !locationCondition.satisfied) {
        return {
          granted: false,
          reason: 'Location-based access control denies access',
          denyReason: 'Access not allowed from this location'
        };
      }
      if (locationCondition?.condition) {
        conditions.push(locationCondition.condition);
      }
    }

    // Device-based access control
    if (this.config.policies.deviceBasedAccess && request.subject.deviceId) {
      const deviceCondition = await this.evaluateDeviceCondition(request);
      if (deviceCondition && !deviceCondition.satisfied) {
        return {
          granted: false,
          reason: 'Device-based access control denies access',
          denyReason: 'Access not allowed from this device'
        };
      }
      if (deviceCondition?.condition) {
        conditions.push(deviceCondition.condition);
      }
    }

    // Risk-based access control
    if (request.subject.riskScore && request.subject.riskScore > 70) {
      conditions.push({
        type: 'mfa',
        requirement: 'Multi-factor authentication required for high-risk access'
      });
    }

    return {
      ...decision,
      conditions: conditions.length > 0 ? conditions : undefined
    };
  }

  /**
   * Grant role to user
   */
  async grantRole(userId: string, role: Role, context?: AuthorizationContext): Promise<void> {
    try {
      if (!this.acl) {
        throw new Error('ACL not initialized');
      }

      // Check if requester has permission to grant roles
      if (context) {
        const canGrantRoles = await this.checkPermission({
          subject: context,
          resource: { id: userId, type: 'user' },
          action: Permission.USER_MANAGE_ROLES
        });

        if (!canGrantRoles.granted) {
          throw new Error('Insufficient permissions to grant roles');
        }
      }

      // Grant role
      await this.acl.addUserRoles(userId, [role]);

      // Clear cache
      this.clearUserCache(userId);

      // Log role grant
      this.logger.info('Role granted', { userId, role, grantedBy: context?.userId });

      // Emit role change event
      this.emit('roleGranted', { userId, role, grantedBy: context?.userId });

    } catch (error) {
      this.logger.error('Failed to grant role', { error: error.message, userId, role });
      throw error;
    }
  }

  /**
   * Revoke role from user
   */
  async revokeRole(userId: string, role: Role, context?: AuthorizationContext): Promise<void> {
    try {
      if (!this.acl) {
        throw new Error('ACL not initialized');
      }

      // Check if requester has permission to revoke roles
      if (context) {
        const canRevokeRoles = await this.checkPermission({
          subject: context,
          resource: { id: userId, type: 'user' },
          action: Permission.USER_MANAGE_ROLES
        });

        if (!canRevokeRoles.granted) {
          throw new Error('Insufficient permissions to revoke roles');
        }
      }

      // Revoke role
      await this.acl.removeUserRoles(userId, [role]);

      // Clear cache
      this.clearUserCache(userId);

      // Log role revocation
      this.logger.info('Role revoked', { userId, role, revokedBy: context?.userId });

      // Emit role change event
      this.emit('roleRevoked', { userId, role, revokedBy: context?.userId });

    } catch (error) {
      this.logger.error('Failed to revoke role', { error: error.message, userId, role });
      throw error;
    }
  }

  /**
   * Get user's roles
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      // Check cache first
      const cached = this.roleCache.get(userId);
      if (cached && cached.expiry > Date.now()) {
        return cached.roles;
      }

      let roles: Role[] = [];

      if (this.acl) {
        const aclRoles = await this.acl.userRoles(userId);
        roles = aclRoles as Role[];
      } else {
        // Fallback to database query
        roles = await this.getRolesFromDatabase(userId);
      }

      // Cache the result
      this.roleCache.set(userId, {
        roles,
        expiry: Date.now() + (this.config.permissions.cacheTTL * 1000)
      });

      return roles;

    } catch (error) {
      this.logger.error('Failed to get user roles', { error: error.message, userId });
      return [];
    }
  }

  /**
   * Get user's permissions
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      // Check cache first
      const cached = this.permissionCache.get(userId);
      if (cached && cached.expiry > Date.now()) {
        return cached.permissions;
      }

      const permissions = new Set<Permission>();

      // Get roles
      const roles = await this.getUserRoles(userId);

      // Get permissions for each role
      for (const role of roles) {
        const rolePermissions = await this.getRolePermissions(role);
        rolePermissions.forEach(p => permissions.add(p));
      }

      // Get direct permissions
      const directPermissions = await this.getDirectUserPermissions(userId);
      directPermissions.forEach(p => permissions.add(p));

      const result = Array.from(permissions);

      // Cache the result
      this.permissionCache.set(userId, {
        permissions: result,
        expiry: Date.now() + (this.config.permissions.cacheTTL * 1000)
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to get user permissions', { error: error.message, userId });
      return [];
    }
  }

  // Helper methods

  private generateCacheKey(request: AccessRequest): string {
    return `auth:${request.subject.userId}:${request.resource.type}:${request.resource.id}:${request.action}`;
  }

  private async getCachedDecision(key: string): Promise<AccessDecision | null> {
    try {
      const cached = await this.redis.get(key);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async cacheDecision(key: string, decision: AccessDecision): Promise<void> {
    try {
      await this.redis.setex(key, this.config.permissions.cacheTTL, JSON.stringify(decision));
    } catch (error) {
      this.logger.warn('Failed to cache decision', { error: error.message });
    }
  }

  private clearUserCache(userId: string): void {
    this.permissionCache.delete(userId);
    this.roleCache.delete(userId);
  }

  private matchesWildcard(permission: Permission, wildcard: string): boolean {
    const pattern = wildcard.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(permission);
  }

  private async logAccessAttempt(request: AccessRequest, decision: AccessDecision): Promise<void> {
    if (this.config.resources.accessLogging) {
      this.logger.info('Access attempt', {
        userId: request.subject.userId,
        resource: request.resource,
        action: request.action,
        granted: decision.granted,
        reason: decision.reason,
        timestamp: new Date()
      });
    }
  }

  // Placeholder methods for various operations
  private async initializeDefaultRoles(): Promise<void> {
    // Implementation would set up default roles and permissions
  }

  private async evaluateTimeCondition(request: AccessRequest): Promise<any> {
    // Implementation would check time-based access rules
    return null;
  }

  private async evaluateLocationCondition(request: AccessRequest): Promise<any> {
    // Implementation would check location-based access rules
    return null;
  }

  private async evaluateDeviceCondition(request: AccessRequest): Promise<any> {
    // Implementation would check device-based access rules
    return null;
  }

  private async getRolesFromDatabase(userId: string): Promise<Role[]> {
    // Implementation would query database for user roles
    return [];
  }

  private async getRolePermissions(role: Role): Promise<Permission[]> {
    // Implementation would get permissions for a role
    return [];
  }

  private async getDirectUserPermissions(userId: string): Promise<Permission[]> {
    // Implementation would get direct user permissions
    return [];
  }

  private async getOwnerPermissions(resourceType: string): Promise<Permission[]> {
    // Implementation would get owner permissions for resource type
    return [];
  }
}

export const createAuthorizationService = (
  redis: Redis,
  prisma: PrismaClient,
  config: AuthorizationConfig,
  logger: LoggerService,
  configService: ConfigService
) => {
  return new AuthorizationService(redis, prisma, config, logger, configService);
};