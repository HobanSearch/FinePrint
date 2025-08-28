/**
 * Fine Print AI - Session Service
 * Enterprise-grade distributed session management with Redis storage and security features
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import * as geoip from 'geoip-lite';
import * as UAParser from 'ua-parser-js';
import { LoggerService } from '../../logger/src/services/logger-service';
import { ConfigService } from '../../config/src/services/configuration';

export interface SessionConfig {
  // Session Settings
  session: {
    ttl: number; // session time-to-live in seconds
    maxAge: number; // maximum session age in seconds
    slidingExpiration: boolean; // extend session on activity
    maxConcurrentSessions: number; // max sessions per user
    sessionIdLength: number; // length of session ID
    cookieName: string; // session cookie name
  };

  // Security Settings
  security: {
    requireSecureCookies: boolean;
    httpOnlyCookies: boolean;
    sameSiteCookies: 'strict' | 'lax' | 'none';
    sessionHijackingProtection: boolean;
    deviceFingerprinting: boolean;
    ipValidation: boolean;
    userAgentValidation: boolean;
    locationTracking: boolean;
    anomalyDetection: boolean;
  };

  // Storage Settings
  storage: {
    prefix: string; // Redis key prefix
    compression: boolean;
    encryption: boolean;
    encryptionKey?: string;
    persistentSessions: boolean; // store in database
    cleanupInterval: number; // cleanup expired sessions interval
  };

  // Cross-Device Settings
  crossDevice: {
    enabled: boolean;
    syncInterval: number; // sync interval in seconds
    maxDevices: number; // max devices per user
    deviceTrustDuration: number; // device trust duration
    conflictResolution: 'latest' | 'merge' | 'manual';
  };

  // Audit Settings
  audit: {
    logSessionEvents: boolean;
    trackActivity: boolean;
    detailedLogging: boolean;
    retentionPeriod: number; // audit log retention in days
  };
}

export interface SessionData {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: 'web' | 'mobile' | 'extension' | 'api' | 'agent';
  
  // Timestamps
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  
  // Security Context
  ipAddress: string;
  userAgent: string;
  deviceFingerprint?: string;
  location?: GeoLocation;
  riskScore: number;
  
  // Authentication Context
  authenticationMethods: string[];
  mfaVerified: boolean;
  trustedDevice: boolean;
  
  // Session State
  permissions: string[];
  roles: string[];
  attributes: Record<string, any>;
  flags: SessionFlags;
  
  // Activity Tracking
  activityCount: number;
  lastAction?: string;
  lastEndpoint?: string;
  
  // Cross-Device Sync
  syncedDevices?: string[];
  lastSyncAt?: Date;
  
  // Metadata
  clientVersion?: string;
  appVersion?: string;
  metadata: Record<string, any>;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp?: string;
  org?: string;
}

export interface SessionFlags {
  isActive: boolean;
  isExpired: boolean;
  isRevoked: boolean;
  isSuspicious: boolean;
  requiresReauth: boolean;
  isAdminSession: boolean;
  isServiceSession: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  os: string;
  browser: string;
  version: string;
  fingerprint: string;
  trusted: boolean;
  firstSeen: Date;
  lastSeen: Date;
}

export interface SessionActivity {
  sessionId: string;
  timestamp: Date;
  action: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  bytes?: number;
  metadata?: Record<string, any>;
}

export interface SessionSummary {
  sessionId: string;
  userId: string;
  platform: string;
  device: DeviceInfo;
  location: GeoLocation;
  duration: number;
  activityCount: number;
  riskScore: number;
  flags: SessionFlags;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  revokedSessions: number;
  averageDuration: number;
  averageRiskScore: number;
  topPlatforms: Array<{ platform: string; count: number }>;
  topLocations: Array<{ location: string; count: number }>;
  anomalousActivities: number;
}

export class SessionService extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: SessionConfig;
  private logger: LoggerService;
  private configService: ConfigService;
  
  // Active sessions cache
  private activeSessionsCache: Map<string, SessionData> = new Map();
  
  // Device fingerprinting cache
  private deviceCache: Map<string, DeviceInfo> = new Map();
  
  // Cleanup timer
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: SessionConfig,
    logger: LoggerService,
    configService: ConfigService
  ) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
    this.configService = configService;

    this.initializeSessionManagement();
  }

  /**
   * Create a new session
   */
  async createSession(
    context: any,
    tokens?: any,
    options?: {
      persistent?: boolean;
      trustDevice?: boolean;
      extendExpiration?: boolean;
    }
  ): Promise<SessionData> {
    try {
      const sessionId = this.generateSessionId();
      const now = new Date();
      
      // Parse device information
      const deviceInfo = await this.parseDeviceInfo(context.userAgent, context.deviceId);
      
      // Get geolocation
      const location = await this.getGeoLocation(context.ipAddress);
      
      // Generate device fingerprint
      const deviceFingerprint = await this.generateDeviceFingerprint(
        context.userAgent,
        context.ipAddress,
        deviceInfo
      );

      // Calculate session expiration
      const expiresAt = new Date(
        now.getTime() + (this.config.session.ttl * 1000)
      );

      // Create session data
      const sessionData: SessionData = {
        sessionId,
        userId: context.userId,
        deviceId: context.deviceId || deviceInfo.deviceId,
        platform: context.platform || 'web',
        
        // Timestamps
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        
        // Security Context
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        deviceFingerprint,
        location,
        riskScore: context.riskScore || 0,
        
        // Authentication Context
        authenticationMethods: context.authenticationMethods || ['password'],
        mfaVerified: context.mfaVerified || false,
        trustedDevice: options?.trustDevice || false,
        
        // Session State
        permissions: context.permissions || [],
        roles: context.roles || [],
        attributes: context.attributes || {},
        flags: {
          isActive: true,
          isExpired: false,
          isRevoked: false,
          isSuspicious: false,
          requiresReauth: false,
          isAdminSession: context.roles?.includes('admin') || false,
          isServiceSession: context.platform === 'agent'
        },
        
        // Activity Tracking
        activityCount: 0,
        
        // Metadata
        clientVersion: context.clientVersion,
        appVersion: context.appVersion,
        metadata: context.metadata || {}
      };

      // Check concurrent session limits
      await this.enforceConcurrentSessionLimits(context.userId);

      // Store session in Redis
      await this.storeSession(sessionData);

      // Store in database if persistent sessions enabled
      if (this.config.storage.persistentSessions || options?.persistent) {
        await this.persistSession(sessionData);
      }

      // Cache session locally
      this.activeSessionsCache.set(sessionId, sessionData);

      // Setup cross-device sync if enabled
      if (this.config.crossDevice.enabled) {
        await this.setupCrossDeviceSync(sessionData);
      }

      // Log session creation
      this.logger.info('Session created', {
        sessionId,
        userId: context.userId,
        platform: sessionData.platform,
        ipAddress: context.ipAddress,
        riskScore: sessionData.riskScore
      });

      // Emit session creation event
      this.emit('sessionCreated', sessionData);

      return sessionData;

    } catch (error) {
      this.logger.error('Session creation failed', { 
        error: error.message, 
        userId: context.userId 
      });
      throw error;
    }
  }

  /**
   * Retrieve a session by ID
   */
  async getSession(sessionId: string, options?: {
    updateActivity?: boolean;
    validateSecurity?: boolean;
  }): Promise<SessionData | null> {
    try {
      // Check local cache first
      let session = this.activeSessionsCache.get(sessionId);
      
      if (!session) {
        // Load from Redis
        session = await this.loadSession(sessionId);
        
        if (!session) {
          return null;
        }
        
        // Cache locally
        this.activeSessionsCache.set(sessionId, session);
      }

      // Check if session is expired
      if (session.expiresAt < new Date()) {
        session.flags.isExpired = true;
        await this.expireSession(sessionId);
        return null;
      }

      // Perform security validation if requested
      if (options?.validateSecurity) {
        const securityValid = await this.validateSessionSecurity(session);
        if (!securityValid) {
          session.flags.isSuspicious = true;
          await this.flagSuspiciousSession(sessionId, 'Security validation failed');
          return null;
        }
      }

      // Update activity if requested
      if (options?.updateActivity) {
        await this.updateSessionActivity(sessionId);
      }

      return session;

    } catch (error) {
      this.logger.error('Session retrieval failed', { 
        error: error.message, 
        sessionId 
      });
      return null;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(
    sessionId: string,
    activity?: {
      action?: string;
      endpoint?: string;
      method?: string;
      statusCode?: number;
      duration?: number;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      const now = new Date();
      
      // Update session data
      session.lastActivityAt = now;
      session.activityCount += 1;
      
      if (activity) {
        session.lastAction = activity.action;
        session.lastEndpoint = activity.endpoint;
      }

      // Extend session expiration if sliding expiration is enabled
      if (this.config.session.slidingExpiration) {
        session.expiresAt = new Date(now.getTime() + (this.config.session.ttl * 1000));
      }

      // Update stored session
      await this.storeSession(session);
      
      // Update local cache
      this.activeSessionsCache.set(sessionId, session);

      // Log activity if detailed logging is enabled
      if (this.config.audit.trackActivity && activity) {
        await this.logSessionActivity(sessionId, {
          timestamp: now,
          action: activity.action || 'unknown',
          endpoint: activity.endpoint,
          method: activity.method,
          statusCode: activity.statusCode,
          duration: activity.duration,
          metadata: activity.metadata
        });
      }

      // Anomaly detection
      if (this.config.security.anomalyDetection) {
        await this.detectSessionAnomalies(session);
      }

    } catch (error) {
      this.logger.error('Session activity update failed', { 
        error: error.message, 
        sessionId 
      });
      throw error;
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string, reason?: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      // Mark session as revoked
      session.flags.isRevoked = true;
      session.flags.isActive = false;

      // Update stored session
      await this.storeSession(session);
      
      // Remove from active cache
      this.activeSessionsCache.delete(sessionId);

      // Add to revoked sessions set
      await this.redis.sadd(
        `${this.config.storage.prefix}:revoked`,
        sessionId
      );

      // Log session revocation
      this.logger.info('Session revoked', {
        sessionId,
        userId: session.userId,
        reason: reason || 'Manual revocation'
      });

      // Emit session revocation event
      this.emit('sessionRevoked', {
        sessionId,
        userId: session.userId,
        reason
      });

    } catch (error) {
      this.logger.error('Session revocation failed', { 
        error: error.message, 
        sessionId 
      });
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string, options?: {
    includeExpired?: boolean;
    includeRevoked?: boolean;
  }): Promise<SessionSummary[]> {
    try {
      const pattern = `${this.config.storage.prefix}:session:${userId}:*`;
      const keys = await this.redis.keys(pattern);
      
      const sessions: SessionSummary[] = [];
      
      for (const key of keys) {
        const sessionData = await this.redis.get(key);
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          
          // Filter based on options
          if (!options?.includeExpired && session.flags.isExpired) continue;
          if (!options?.includeRevoked && session.flags.isRevoked) continue;
          
          // Get device info
          const deviceInfo = await this.getDeviceInfo(session.deviceId);
          
          sessions.push({
            sessionId: session.sessionId,
            userId: session.userId,
            platform: session.platform,
            device: deviceInfo || {
              deviceId: session.deviceId,
              name: 'Unknown Device',
              type: 'unknown',
              os: 'Unknown',
              browser: 'Unknown',
              version: 'Unknown',
              fingerprint: session.deviceFingerprint || '',
              trusted: session.trustedDevice,
              firstSeen: session.createdAt,
              lastSeen: session.lastActivityAt
            },
            location: session.location!,
            duration: session.lastActivityAt.getTime() - session.createdAt.getTime(),
            activityCount: session.activityCount,
            riskScore: session.riskScore,
            flags: session.flags,
            createdAt: session.createdAt,
            lastActivityAt: session.lastActivityAt,
            expiresAt: session.expiresAt
          });
        }
      }
      
      // Sort by last activity (most recent first)
      sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
      
      return sessions;

    } catch (error) {
      this.logger.error('Failed to get user sessions', { 
        error: error.message, 
        userId 
      });
      return [];
    }
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateAllUserSessions(
    userId: string, 
    excludeSessionId?: string,
    reason?: string
  ): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId, {
        includeExpired: false,
        includeRevoked: false
      });

      let terminatedCount = 0;

      for (const sessionSummary of sessions) {
        if (excludeSessionId && sessionSummary.sessionId === excludeSessionId) {
          continue;
        }

        await this.revokeSession(sessionSummary.sessionId, reason);
        terminatedCount++;
      }

      this.logger.info('All user sessions terminated', {
        userId,
        terminatedCount,
        excludedSession: excludeSessionId,
        reason
      });

      return terminatedCount;

    } catch (error) {
      this.logger.error('Failed to terminate user sessions', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId?: string): Promise<SessionStats> {
    try {
      const pattern = userId 
        ? `${this.config.storage.prefix}:session:${userId}:*`
        : `${this.config.storage.prefix}:session:*`;
      
      const keys = await this.redis.keys(pattern);
      
      let totalSessions = 0;
      let activeSessions = 0;
      let expiredSessions = 0;
      let revokedSessions = 0;
      let totalDuration = 0;
      let totalRiskScore = 0;
      let anomalousActivities = 0;
      
      const platformCounts: Record<string, number> = {};
      const locationCounts: Record<string, number> = {};
      
      for (const key of keys) {
        const sessionData = await this.redis.get(key);
        if (sessionData) {
          const session: SessionData = JSON.parse(sessionData);
          
          totalSessions++;
          
          if (session.flags.isActive && !session.flags.isExpired && !session.flags.isRevoked) {
            activeSessions++;
          }
          
          if (session.flags.isExpired) expiredSessions++;
          if (session.flags.isRevoked) revokedSessions++;
          if (session.flags.isSuspicious) anomalousActivities++;
          
          totalDuration += session.lastActivityAt.getTime() - session.createdAt.getTime();
          totalRiskScore += session.riskScore;
          
          // Platform statistics
          platformCounts[session.platform] = (platformCounts[session.platform] || 0) + 1;
          
          // Location statistics
          if (session.location) {
            const locationKey = `${session.location.country}-${session.location.city}`;
            locationCounts[locationKey] = (locationCounts[locationKey] || 0) + 1;
          }
        }
      }
      
      return {
        totalSessions,
        activeSessions,
        expiredSessions,
        revokedSessions,
        averageDuration: totalSessions > 0 ? totalDuration / totalSessions : 0,
        averageRiskScore: totalSessions > 0 ? totalRiskScore / totalSessions : 0,
        topPlatforms: Object.entries(platformCounts)
          .map(([platform, count]) => ({ platform, count }))
          .sort((a, b) => b.count - a.count),
        topLocations: Object.entries(locationCounts)
          .map(([location, count]) => ({ location, count }))
          .sort((a, b) => b.count - a.count),
        anomalousActivities
      };

    } catch (error) {
      this.logger.error('Failed to get session statistics', { error: error.message });
      throw error;
    }
  }

  /**
   * Initialize session management
   */
  private async initializeSessionManagement(): Promise<void> {
    try {
      // Setup cleanup timer
      this.setupCleanupTimer();
      
      // Load active sessions into cache
      await this.loadActiveSessions();
      
      this.logger.info('Session management initialized', {
        cleanupInterval: this.config.storage.cleanupInterval,
        maxConcurrentSessions: this.config.session.maxConcurrentSessions
      });

    } catch (error) {
      this.logger.error('Session management initialization failed', { 
        error: error.message 
      });
      throw error;
    }
  }

  // Helper methods (implementation would be more detailed in production)

  private generateSessionId(): string {
    return crypto.randomBytes(this.config.session.sessionIdLength).toString('hex');
  }

  private async parseDeviceInfo(userAgent: string, deviceId?: string): Promise<DeviceInfo> {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();
    
    return {
      deviceId: deviceId || crypto.randomUUID(),
      name: `${result.browser.name} on ${result.os.name}`,
      type: result.device.type as any || 'desktop',
      os: result.os.name || 'Unknown',
      browser: result.browser.name || 'Unknown',
      version: result.browser.version || 'Unknown',
      fingerprint: crypto.createHash('sha256').update(userAgent).digest('hex'),
      trusted: false,
      firstSeen: new Date(),
      lastSeen: new Date()
    };
  }

  private async getGeoLocation(ipAddress: string): Promise<GeoLocation | undefined> {
    const geoData = geoip.lookup(ipAddress);
    if (!geoData) return undefined;
    
    return {
      country: geoData.country,
      region: geoData.region,
      city: geoData.city,
      latitude: geoData.ll[0],
      longitude: geoData.ll[1],
      timezone: geoData.timezone
    };
  }

  private async generateDeviceFingerprint(
    userAgent: string,
    ipAddress: string,
    deviceInfo: DeviceInfo
  ): Promise<string> {
    const data = `${userAgent}:${ipAddress}:${deviceInfo.os}:${deviceInfo.browser}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private async storeSession(session: SessionData): Promise<void> {
    const key = `${this.config.storage.prefix}:session:${session.userId}:${session.sessionId}`;
    const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
    
    let data = JSON.stringify(session);
    
    if (this.config.storage.encryption && this.config.storage.encryptionKey) {
      data = await this.encryptData(data);
    }
    
    if (this.config.storage.compression) {
      data = await this.compressData(data);
    }
    
    await this.redis.setex(key, ttl, data);
  }

  private async loadSession(sessionId: string): Promise<SessionData | null> {
    const pattern = `${this.config.storage.prefix}:session:*:${sessionId}`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) return null;
    
    let data = await this.redis.get(keys[0]);
    if (!data) return null;
    
    if (this.config.storage.compression) {
      data = await this.decompressData(data);
    }
    
    if (this.config.storage.encryption && this.config.storage.encryptionKey) {
      data = await this.decryptData(data);
    }
    
    return JSON.parse(data);
  }

  // Placeholder methods for various operations
  private async enforceConcurrentSessionLimits(userId: string): Promise<void> {
    // Implementation would enforce session limits
  }

  private async persistSession(session: SessionData): Promise<void> {
    // Implementation would store session in database
  }

  private async setupCrossDeviceSync(session: SessionData): Promise<void> {
    // Implementation would setup cross-device synchronization
  }

  private async expireSession(sessionId: string): Promise<void> {
    // Implementation would expire session
  }

  private async validateSessionSecurity(session: SessionData): Promise<boolean> {
    // Implementation would validate session security
    return true;
  }

  private async flagSuspiciousSession(sessionId: string, reason: string): Promise<void> {
    // Implementation would flag suspicious session
  }

  private async logSessionActivity(sessionId: string, activity: SessionActivity): Promise<void> {
    // Implementation would log session activity
  }

  private async detectSessionAnomalies(session: SessionData): Promise<void> {
    // Implementation would detect session anomalies
  }

  private async getDeviceInfo(deviceId: string): Promise<DeviceInfo | null> {
    // Implementation would get device info
    return null;
  }

  private setupCleanupTimer(): void {
    // Implementation would setup cleanup timer
  }

  private async loadActiveSessions(): Promise<void> {
    // Implementation would load active sessions
  }

  private async encryptData(data: string): Promise<string> {
    // Implementation would encrypt data
    return data;
  }

  private async decryptData(data: string): Promise<string> {
    // Implementation would decrypt data
    return data;
  }

  private async compressData(data: string): Promise<string> {
    // Implementation would compress data
    return data;
  }

  private async decompressData(data: string): Promise<string> {
    // Implementation would decompress data
    return data;
  }
}

export const createSessionService = (
  redis: Redis,
  prisma: PrismaClient,
  config: SessionConfig,
  logger: LoggerService,
  configService: ConfigService
) => {
  return new SessionService(redis, prisma, config, logger, configService);
};