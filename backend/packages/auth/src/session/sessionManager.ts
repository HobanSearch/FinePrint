import * as crypto from 'crypto';
import { UAParser } from 'ua-parser-js';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  SessionConfig,
  SessionData,
  SessionActivity,
  SuspiciousActivityRule,
  SessionStats,
  DeviceFingerprint
} from './types';

const logger = createServiceLogger('session-manager');

export class SessionManager {
  private cache: CacheManager;
  private config: SessionConfig;
  private suspiciousActivityRules: SuspiciousActivityRule[] = [];

  constructor(cache: CacheManager, config: SessionConfig) {
    this.cache = cache;
    this.config = config;
    this.initializeSuspiciousActivityRules();
  }

  /**
   * Create a new session
   */
  async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    deviceFingerprint?: string,
    initialData?: Record<string, any>
  ): Promise<SessionData> {
    try {
      const sessionId = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + (this.config.ttl * 1000));

      // Parse device info from user agent
      const deviceInfo = this.parseDeviceInfo(userAgent);
      
      // Generate location data (if enabled and available)
      const location = this.config.geoLocationTracking 
        ? await this.getLocationFromIP(ipAddress)
        : undefined;

      const sessionData: SessionData = {
        id: sessionId,
        userId,
        deviceFingerprint,
        ipAddress,
        userAgent,
        location,
        createdAt: now,
        lastActivityAt: now,
        expiresAt,
        active: true,
        data: initialData || {},
        securityFlags: {
          suspicious: false,
          riskScore: 0,
          fraudulent: false,
          compromised: false
        },
        deviceInfo
      };

      // Check for suspicious activity
      if (this.config.suspiciousActivityDetection) {
        await this.analyzeSuspiciousActivity(sessionData);
      }

      // Store session
      await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);

      // Manage concurrent sessions
      await this.manageConcurrentSessions(userId, sessionId);

      // Track session by user
      await this.cache.sadd(`user-sessions:${userId}`, sessionId);
      await this.cache.expire(`user-sessions:${userId}`, this.config.ttl);

      // Log session creation
      await this.logSessionActivity(sessionId, userId, 'session_created', {
        deviceInfo: deviceInfo.browser,
        location: location?.city
      });

      logger.info('Session created', {
        sessionId: sessionId.substring(0, 8) + '...',
        userId: userId.substring(0, 8) + '...',
        ipAddress,
        deviceType: deviceInfo.type
      });

      return sessionData;
    } catch (error) {
      logger.error('Failed to create session', { error, userId });
      throw new Error('Session creation failed');
    }
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionData = await this.cache.get<SessionData>(`session:${sessionId}`);
      
      if (!sessionData) {
        return null;
      }

      // Check if session is expired
      if (sessionData.expiresAt < new Date()) {
        await this.terminateSession(sessionId, 'expired');
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session', { error, sessionId });
      return null;
    }
  }

  /**
   * Update session activity and extend TTL if configured
   */
  async updateSessionActivity(
    sessionId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      
      if (!sessionData) {
        return false;
      }

      const now = new Date();
      sessionData.lastActivityAt = now;

      // Extend session TTL if configured
      if (this.config.extendOnActivity) {
        sessionData.expiresAt = new Date(now.getTime() + (this.config.ttl * 1000));
        await this.cache.expire(`session:${sessionId}`, this.config.ttl);
      }

      // Update session data
      await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);

      // Log activity
      await this.logSessionActivity(sessionId, sessionData.userId, action, metadata);

      // Check for suspicious activity
      if (this.config.suspiciousActivityDetection) {
        const activity: SessionActivity = {
          sessionId,
          userId: sessionData.userId,
          action,
          timestamp: now,
          ipAddress: sessionData.ipAddress,
          userAgent: sessionData.userAgent,
          metadata
        };

        await this.checkSuspiciousActivity(sessionData, activity);
      }

      logger.debug('Session activity updated', {
        sessionId: sessionId.substring(0, 8) + '...',
        action
      });

      return true;
    } catch (error) {
      logger.error('Failed to update session activity', { error, sessionId });
      return false;
    }
  }

  /**
   * Update session data
   */
  async updateSessionData(
    sessionId: string,
    data: Record<string, any>
  ): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      
      if (!sessionData) {
        return false;
      }

      // Merge new data with existing data
      sessionData.data = { ...sessionData.data, ...data };

      // Update session
      await this.cache.set(`session:${sessionId}`, sessionData, this.config.ttl);

      logger.debug('Session data updated', {
        sessionId: sessionId.substring(0, 8) + '...',
        dataKeys: Object.keys(data)
      });

      return true;
    } catch (error) {
      logger.error('Failed to update session data', { error, sessionId });
      return false;
    }
  }

  /**
   * Terminate session
   */
  async terminateSession(sessionId: string, reason: string = 'manual'): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);
      
      if (!sessionData) {
        return false;
      }

      // Remove session from storage
      await this.cache.del(`session:${sessionId}`);

      // Remove from user sessions set
      await this.cache.srem(`user-sessions:${sessionData.userId}`, sessionId);

      // Log termination
      await this.logSessionActivity(sessionId, sessionData.userId, 'session_terminated', {
        reason,
        duration: Date.now() - sessionData.createdAt.getTime()
      });

      logger.info('Session terminated', {
        sessionId: sessionId.substring(0, 8) + '...',
        userId: sessionData.userId.substring(0, 8) + '...',
        reason
      });

      return true;
    } catch (error) {
      logger.error('Failed to terminate session', { error, sessionId });
      return false;
    }
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateAllUserSessions(
    userId: string,
    reason: string = 'security-action',
    excludeSessionId?: string
  ): Promise<number> {
    try {
      const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
      let terminatedCount = 0;

      for (const sessionId of sessionIds) {
        if (excludeSessionId && sessionId === excludeSessionId) {
          continue;
        }

        const success = await this.terminateSession(sessionId, reason);
        if (success) terminatedCount++;
      }

      logger.info('All user sessions terminated', {
        userId: userId.substring(0, 8) + '...',
        count: terminatedCount,
        reason
      });

      return terminatedCount;
    } catch (error) {
      logger.error('Failed to terminate all user sessions', { error, userId });
      return 0;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
      const sessions: SessionData[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData) {
          sessions.push(sessionData);
        }
      }

      return sessions.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
    } catch (error) {
      logger.error('Failed to get user sessions', { error, userId });
      return [];
    }
  }

  /**
   * Validate session and get user ID
   */
  async validateSession(sessionId: string): Promise<{ valid: boolean; userId?: string; session?: SessionData }> {
    try {
      const sessionData = await this.getSession(sessionId);
      
      if (!sessionData) {
        return { valid: false };
      }

      if (!sessionData.active) {
        return { valid: false };
      }

      if (sessionData.securityFlags.compromised || sessionData.securityFlags.fraudulent) {
        await this.terminateSession(sessionId, 'security-violation');
        return { valid: false };
      }

      return {
        valid: true,
        userId: sessionData.userId,
        session: sessionData
      };
    } catch (error) {
      logger.error('Session validation failed', { error, sessionId });
      return { valid: false };
    }
  }

  /**
   * Generate device fingerprint hash
   */
  generateDeviceFingerprint(components: Partial<DeviceFingerprint>): string {
    const fingerprint = [
      components.userAgent || '',
      components.screenResolution || '',
      components.timezone || '',
      components.language || '',
      components.platform || '',
      components.cookiesEnabled?.toString() || '',
      components.doNotTrack?.toString() || '',
      components.plugins?.join(',') || '',
      components.canvas || '',
      components.webgl || ''
    ].join('|');

    const hash = crypto.createHash('sha256').update(fingerprint).digest('hex');
    
    logger.debug('Device fingerprint generated', {
      hash: hash.substring(0, 16) + '...'
    });

    return hash;
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<SessionStats> {
    try {
      const sessionKeys = await this.cache.keys('session:*');
      const userSessionKeys = await this.cache.keys('user-sessions:*');
      
      let totalActiveSessions = 0;
      let suspiciousSessions = 0;
      let totalDuration = 0;
      const userActiveSessions: Record<string, number> = {};
      const sessionsPerDevice: Record<string, number> = {};
      const sessionsPerLocation: Record<string, number> = {};

      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        if (sessionData && sessionData.active) {
          totalActiveSessions++;
          
          // Count suspicious sessions
          if (sessionData.securityFlags.suspicious) {
            suspiciousSessions++;
          }

          // Calculate duration
          const duration = Date.now() - sessionData.createdAt.getTime();
          totalDuration += duration;

          // Count by user
          userActiveSessions[sessionData.userId] = (userActiveSessions[sessionData.userId] || 0) + 1;

          // Count by device
          if (sessionData.deviceInfo?.type) {
            sessionsPerDevice[sessionData.deviceInfo.type] = (sessionsPerDevice[sessionData.deviceInfo.type] || 0) + 1;
          }

          // Count by location
          if (sessionData.location?.country) {
            sessionsPerLocation[sessionData.location.country] = (sessionsPerLocation[sessionData.location.country] || 0) + 1;
          }
        }
      }

      const averageSessionDuration = totalActiveSessions > 0 ? totalDuration / totalActiveSessions : 0;

      return {
        totalActiveSessions,
        userActiveSessions,
        sessionsPerDevice,
        sessionsPerLocation,
        suspiciousSessions,
        averageSessionDuration
      };
    } catch (error) {
      logger.error('Failed to get session stats', { error });
      return {
        totalActiveSessions: 0,
        userActiveSessions: {},
        sessionsPerDevice: {},
        sessionsPerLocation: {},
        suspiciousSessions: 0,
        averageSessionDuration: 0
      };
    }
  }

  /**
   * Manage concurrent session limits
   */
  private async manageConcurrentSessions(userId: string, newSessionId: string): Promise<void> {
    try {
      const sessionIds = await this.cache.smembers(`user-sessions:${userId}`);
      
      if (sessionIds.length >= this.config.maxConcurrentSessions) {
        // Find oldest sessions to terminate
        const sessions: { id: string; lastActivity: Date }[] = [];
        
        for (const sessionId of sessionIds) {
          const sessionData = await this.getSession(sessionId);
          if (sessionData) {
            sessions.push({
              id: sessionId,
              lastActivity: sessionData.lastActivityAt
            });
          }
        }

        // Sort by last activity (oldest first)
        sessions.sort((a, b) => a.lastActivity.getTime() - b.lastActivity.getTime());

        // Terminate oldest sessions to make room
        const sessionsToTerminate = sessions.length - this.config.maxConcurrentSessions + 1;
        
        for (let i = 0; i < sessionsToTerminate; i++) {
          await this.terminateSession(sessions[i].id, 'concurrent-session-limit');
        }

        logger.info('Concurrent session limit enforced', {
          userId: userId.substring(0, 8) + '...',
          terminatedSessions: sessionsToTerminate
        });
      }
    } catch (error) {
      logger.error('Failed to manage concurrent sessions', { error, userId });
    }
  }

  /**
   * Parse device information from user agent
   */
  private parseDeviceInfo(userAgent?: string): SessionData['deviceInfo'] {
    if (!userAgent) {
      return undefined;
    }

    try {
      const parser = new UAParser(userAgent);
      const result = parser.getResult();

      return {
        type: result.device.type || 'desktop',
        browser: result.browser.name || 'unknown',
        browserVersion: result.browser.version || 'unknown',
        os: result.os.name || 'unknown',
        osVersion: result.os.version || 'unknown',
        isMobile: result.device.type === 'mobile',
        isTablet: result.device.type === 'tablet',
        isDesktop: !result.device.type || result.device.type === 'desktop'
      };
    } catch (error) {
      logger.error('Failed to parse device info', { error, userAgent });
      return undefined;
    }
  }

  /**
   * Get location from IP address (mock implementation)
   */
  private async getLocationFromIP(ipAddress?: string): Promise<SessionData['location']> {
    if (!ipAddress) {
      return undefined;
    }

    // In production, integrate with a GeoIP service like MaxMind
    // This is a mock implementation
    return {
      country: 'US',
      region: 'CA',
      city: 'San Francisco',
      lat: 37.7749,
      lon: -122.4194
    };
  }

  /**
   * Initialize suspicious activity detection rules
   */
  private initializeSuspiciousActivityRules(): void {
    this.suspiciousActivityRules = [
      {
        id: 'rapid-location-change',
        name: 'Rapid Location Change',
        description: 'Session location changed too quickly to be physically possible',
        condition: (session, activity) => {
          // Implement geolocation-based detection
          return false; // Placeholder
        },
        riskScore: 8,
        action: 'terminate'
      },
      {
        id: 'unusual-device',
        name: 'Unusual Device',
        description: 'Login from a device type not previously used',
        condition: (session, activity) => {
          // Implement device fingerprinting detection
          return false; // Placeholder
        },
        riskScore: 5,
        action: 'warn'
      },
      {
        id: 'high-frequency-requests',
        name: 'High Frequency Requests',
        description: 'Unusually high number of requests in short time',
        condition: (session, activity) => {
          // Implement rate-based detection
          return false; // Placeholder
        },
        riskScore: 6,
        action: 'require_mfa'
      }
    ];
  }

  /**
   * Analyze session for suspicious activity on creation
   */
  private async analyzeSuspiciousActivity(sessionData: SessionData): Promise<void> {
    try {
      let riskScore = 0;
      const reasons: string[] = [];

      // Check for multiple sessions from different locations
      const userSessions = await this.getUserSessions(sessionData.userId);
      if (userSessions.length > 0 && sessionData.location) {
        const hasDistantSession = userSessions.some(session => {
          if (!session.location) return false;
          // Simple distance check (in production, use proper geolocation calculation)
          const latDiff = Math.abs((session.location.lat || 0) - (sessionData.location!.lat || 0));
          const lonDiff = Math.abs((session.location.lon || 0) - (sessionData.location!.lon || 0));
          return latDiff > 5 || lonDiff > 5; // Rough distance check
        });

        if (hasDistantSession) {
          riskScore += 7;
          reasons.push('Multiple distant locations');
        }
      }

      // Check for new device type
      const deviceTypeCounts = userSessions.reduce((acc, session) => {
        const deviceType = session.deviceInfo?.type || 'unknown';
        acc[deviceType] = (acc[deviceType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const currentDeviceType = sessionData.deviceInfo?.type || 'unknown';
      if (!deviceTypeCounts[currentDeviceType]) {
        riskScore += 3;
        reasons.push('New device type');
      }

      // Update security flags
      if (riskScore >= 7) {
        sessionData.securityFlags.suspicious = true;
        sessionData.securityFlags.riskScore = riskScore;
        
        logger.warn('Suspicious session detected', {
          sessionId: sessionData.id.substring(0, 8) + '...',
          userId: sessionData.userId.substring(0, 8) + '...',
          riskScore,
          reasons
        });
      }
    } catch (error) {
      logger.error('Failed to analyze suspicious activity', { error });
    }
  }

  /**
   * Check for suspicious activity during session
   */
  private async checkSuspiciousActivity(sessionData: SessionData, activity: SessionActivity): Promise<void> {
    try {
      for (const rule of this.suspiciousActivityRules) {
        if (rule.condition(sessionData, activity)) {
          sessionData.securityFlags.riskScore += rule.riskScore;
          
          if (sessionData.securityFlags.riskScore >= 10) {
            sessionData.securityFlags.suspicious = true;
          }

          logger.warn('Suspicious activity detected', {
            rule: rule.name,
            sessionId: sessionData.id.substring(0, 8) + '...',
            riskScore: rule.riskScore,
            action: rule.action
          });

          // Take action based on rule
          if (rule.action === 'terminate') {
            await this.terminateSession(sessionData.id, 'suspicious-activity');
          }

          break; // Only apply first matching rule
        }
      }
    } catch (error) {
      logger.error('Failed to check suspicious activity', { error });
    }
  }

  /**
   * Log session activity
   */
  private async logSessionActivity(
    sessionId: string,
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const activity: SessionActivity = {
        sessionId,
        userId,
        action,
        timestamp: new Date(),
        metadata
      };

      // Store in general activity log
      await this.cache.lpush('audit:session-activities', activity);
      
      // Keep only last 1000 activities
      await this.cache.getRawClient().ltrim('fpa:audit:session-activities', 0, 999);

      // Store user-specific activity
      await this.cache.lpush(`audit:session-activities:${userId}`, activity);
      
      // Keep only last 100 activities per user
      await this.cache.getRawClient().ltrim(`fpa:audit:session-activities:${userId}`, 0, 99);
    } catch (error) {
      logger.error('Failed to log session activity', { error });
    }
  }

  /**
   * Cleanup expired sessions and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting session maintenance');

      const sessionKeys = await this.cache.keys('session:*');
      let cleanedSessions = 0;

      for (const key of sessionKeys) {
        const sessionData = await this.cache.get<SessionData>(key);
        
        if (sessionData && sessionData.expiresAt < new Date()) {
          await this.terminateSession(sessionData.id, 'expired');
          cleanedSessions++;
        }
      }

      logger.info('Session maintenance completed', {
        cleanedSessions
      });
    } catch (error) {
      logger.error('Session maintenance failed', { error });
    }
  }
}