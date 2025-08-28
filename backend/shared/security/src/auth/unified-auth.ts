/**
 * Unified Cross-Platform Authentication System
 * Enterprise-grade authentication with JWT management, biometric support, and cross-device synchronization
 */

import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { MFAService, MFAType } from './mfa';
import { SecurityError } from '../index';

export interface AuthConfig {
  jwtSecret: string;
  jwtAccessExpiration: string;
  jwtRefreshExpiration: string;
  mfaSecret: string;
  sessionTimeout: number;
  maxConcurrentSessions: number;
  crossDeviceSync: boolean;
  biometricAuth: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  deviceId: string;
  expiresAt: Date;
  platformTokens?: PlatformTokens;
}

export interface PlatformTokens {
  web: {
    httpOnlyCookie: string;
    csrfToken: string;
  };
  mobile: {
    secureToken: string;
    biometricHash?: string;
  };
  extension: {
    secureStorageToken: string;
    manifestPermissions: string[];
  };
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: 'web' | 'mobile' | 'extension';
  os: string;
  browser?: string;
  version: string;
  fingerprint: string;
  lastSeen: Date;
  trusted: boolean;
  location?: {
    country: string;
    city: string;
    ip: string;
  };
}

export interface SessionData {
  sessionId: string;
  userId: string;
  deviceId: string;
  platform: 'web' | 'mobile' | 'extension';
  createdAt: Date;
  lastActivity: Date;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
  mfaVerified: boolean;
  riskScore: number;
  permissions: string[];
}

export interface BiometricData {
  userId: string;
  deviceId: string;
  biometricType: 'fingerprint' | 'faceId' | 'voiceId';
  hash: string;
  publicKey: string;
  enrolledAt: Date;
  lastUsed: Date;
}

export interface CrossDeviceSync {
  userId: string;
  sessionIds: string[];
  syncKey: string;
  lastSync: Date;
  conflictResolution: 'latest' | 'manual';
}

export class UnifiedAuthService {
  private redis: Redis;
  private prisma: PrismaClient;
  private mfaService: MFAService;
  private config: AuthConfig;

  constructor(redis: Redis, prisma: PrismaClient, config: AuthConfig) {
    this.redis = redis;
    this.prisma = prisma;
    this.mfaService = new MFAService();
    this.config = config;
  }

  /**
   * Authenticate user with platform-specific token generation
   */
  async authenticateUser(
    email: string,
    password: string,
    deviceInfo: DeviceInfo,
    options: {
      mfaToken?: string;
      biometricData?: string;
      trustDevice?: boolean;
      platform: 'web' | 'mobile' | 'extension';
    }
  ): Promise<AuthTokens> {
    try {
      // Verify user credentials
      const user = await this.verifyCredentials(email, password);
      if (!user) {
        throw new SecurityError('Invalid credentials', 'AUTH_INVALID_CREDENTIALS');
      }

      // Check if MFA is required
      const mfaRequired = await this.checkMFARequirement(user.id, deviceInfo);
      if (mfaRequired && !options.mfaToken && !options.biometricData) {
        throw new SecurityError('MFA required', 'AUTH_MFA_REQUIRED');
      }

      // Verify MFA if provided
      if (options.mfaToken) {
        const mfaValid = await this.verifyMFA(user.id, options.mfaToken);
        if (!mfaValid) {
          throw new SecurityError('Invalid MFA token', 'AUTH_INVALID_MFA');
        }
      }

      // Verify biometric data if provided
      if (options.biometricData) {
        const biometricValid = await this.verifyBiometric(user.id, deviceInfo.deviceId, options.biometricData);
        if (!biometricValid) {
          throw new SecurityError('Invalid biometric data', 'AUTH_INVALID_BIOMETRIC');
        }
      }

      // Generate session and tokens
      const sessionId = await this.createSession(user.id, deviceInfo, options.platform);
      const tokens = await this.generateTokens(user, sessionId, deviceInfo, options.platform);

      // Handle device trust
      if (options.trustDevice) {
        await this.trustDevice(user.id, deviceInfo);
      }

      // Setup cross-device sync if enabled
      if (this.config.crossDeviceSync) {
        await this.setupCrossDeviceSync(user.id, sessionId);
      }

      return tokens;
    } catch (error) {
      await this.logAuthAttempt(email, deviceInfo, false, error.message);
      throw error;
    }
  }

  /**
   * Generate platform-specific JWT tokens
   */
  private async generateTokens(
    user: any,
    sessionId: string,
    deviceInfo: DeviceInfo,
    platform: 'web' | 'mobile' | 'extension'
  ): Promise<AuthTokens> {
    const now = new Date();
    const accessExpiry = new Date(now.getTime() + this.parseTimeString(this.config.jwtAccessExpiration));
    const refreshExpiry = new Date(now.getTime() + this.parseTimeString(this.config.jwtRefreshExpiration));

    // Base JWT payload
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId,
      deviceId: deviceInfo.deviceId,
      platform,
      iat: Math.floor(now.getTime() / 1000),
      exp: Math.floor(accessExpiry.getTime() / 1000)
    };

    // Generate tokens
    const accessToken = jwt.sign(payload, this.config.jwtSecret, { algorithm: 'HS256' });
    const refreshToken = jwt.sign(
      { sub: user.id, sessionId, type: 'refresh' },
      this.config.jwtSecret,
      { expiresIn: this.config.jwtRefreshExpiration }
    );

    // Generate platform-specific tokens
    const platformTokens = await this.generatePlatformTokens(accessToken, refreshToken, platform, deviceInfo);

    // Store tokens in Redis
    await this.storeTokens(sessionId, {
      accessToken,
      refreshToken,
      expiresAt: accessExpiry,
      platformTokens
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      deviceId: deviceInfo.deviceId,
      expiresAt: accessExpiry,
      platformTokens
    };
  }

  /**
   * Generate platform-specific token variants
   */
  private async generatePlatformTokens(
    accessToken: string,
    refreshToken: string,
    platform: 'web' | 'mobile' | 'extension',
    deviceInfo: DeviceInfo
  ): Promise<PlatformTokens> {
    const platformTokens: any = {};

    switch (platform) {
      case 'web':
        // Generate HttpOnly cookie token and CSRF token
        const csrfToken = crypto.randomBytes(32).toString('hex');
        platformTokens.web = {
          httpOnlyCookie: this.generateSecureCookieToken(accessToken),
          csrfToken
        };
        await this.redis.setex(`csrf:${csrfToken}`, 3600, accessToken);
        break;

      case 'mobile':
        // Generate secure token for keychain/keystore
        const secureToken = await this.encryptForKeystore(accessToken, deviceInfo.deviceId);
        platformTokens.mobile = {
          secureToken,
          biometricHash: await this.generateBiometricHash(deviceInfo.deviceId)
        };
        break;

      case 'extension':
        // Generate token for extension secure storage
        const extensionToken = await this.encryptForExtension(accessToken);
        platformTokens.extension = {
          secureStorageToken: extensionToken,
          manifestPermissions: this.getExtensionPermissions()
        };
        break;
    }

    return platformTokens;
  }

  /**
   * Refresh authentication tokens
   */
  async refreshTokens(refreshToken: string, deviceInfo: DeviceInfo): Promise<AuthTokens> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.config.jwtSecret) as any;
      if (decoded.type !== 'refresh') {
        throw new SecurityError('Invalid refresh token type', 'AUTH_INVALID_REFRESH_TOKEN');
      }

      // Check session exists
      const session = await this.getSession(decoded.sessionId);
      if (!session) {
        throw new SecurityError('Session not found', 'AUTH_SESSION_NOT_FOUND');
      }

      // Verify device matches
      if (session.deviceId !== deviceInfo.deviceId) {
        throw new SecurityError('Device mismatch', 'AUTH_DEVICE_MISMATCH');
      }

      // Generate new tokens
      const user = await this.getUserById(decoded.sub);
      const newTokens = await this.generateTokens(user, decoded.sessionId, deviceInfo, session.platform);

      // Update session activity
      await this.updateSessionActivity(decoded.sessionId);

      return newTokens;
    } catch (error) {
      throw new SecurityError('Token refresh failed', 'AUTH_REFRESH_FAILED');
    }
  }

  /**
   * Revoke tokens and invalidate session
   */
  async revokeTokens(sessionId: string, userId?: string): Promise<void> {
    try {
      // Remove tokens from Redis
      await this.redis.del(`tokens:${sessionId}`);
      
      // Invalidate session
      await this.invalidateSession(sessionId);

      // If userId provided, optionally revoke all sessions
      if (userId) {
        await this.revokeAllUserSessions(userId);
      }

      // Update cross-device sync
      if (this.config.crossDeviceSync && userId) {
        await this.updateCrossDeviceSync(userId);
      }
    } catch (error) {
      throw new SecurityError('Token revocation failed', 'AUTH_REVOKE_FAILED');
    }
  }

  /**
   * Setup biometric authentication
   */
  async setupBiometric(
    userId: string,
    deviceId: string,
    biometricType: 'fingerprint' | 'faceId' | 'voiceId',
    publicKey: string
  ): Promise<string> {
    try {
      // Generate biometric hash
      const biometricHash = crypto
        .createHmac('sha256', this.config.mfaSecret)
        .update(`${userId}:${deviceId}:${biometricType}`)
        .digest('hex');

      // Store biometric data
      const biometricData: BiometricData = {
        userId,
        deviceId,
        biometricType,
        hash: biometricHash,
        publicKey,
        enrolledAt: new Date(),
        lastUsed: new Date()
      };

      await this.storeBiometricData(biometricData);

      return biometricHash;
    } catch (error) {
      throw new SecurityError('Biometric setup failed', 'AUTH_BIOMETRIC_SETUP_FAILED');
    }
  }

  /**
   * Verify biometric authentication
   */
  private async verifyBiometric(userId: string, deviceId: string, biometricData: string): Promise<boolean> {
    try {
      const storedBiometric = await this.getBiometricData(userId, deviceId);
      if (!storedBiometric) {
        return false;
      }

      // Verify biometric signature
      const isValid = await this.verifyBiometricSignature(biometricData, storedBiometric.publicKey);
      
      if (isValid) {
        // Update last used
        await this.updateBiometricLastUsed(userId, deviceId);
      }

      return isValid;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cross-device session synchronization
   */
  async syncCrossDeviceSessions(userId: string): Promise<SessionData[]> {
    try {
      const syncData = await this.getCrossDeviceSync(userId);
      if (!syncData) {
        return [];
      }

      const sessions: SessionData[] = [];
      for (const sessionId of syncData.sessionIds) {
        const session = await this.getSession(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    } catch (error) {
      throw new SecurityError('Cross-device sync failed', 'AUTH_SYNC_FAILED');
    }
  }

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessionKeys = await this.redis.keys(`session:${userId}:*`);
      const sessions: SessionData[] = [];

      for (const key of sessionKeys) {
        const sessionData = await this.redis.get(key);
        if (sessionData) {
          sessions.push(JSON.parse(sessionData));
        }
      }

      return sessions.filter(session => session.expiresAt > new Date());
    } catch (error) {
      throw new SecurityError('Failed to get active sessions', 'AUTH_SESSIONS_FAILED');
    }
  }

  /**
   * Terminate specific session
   */
  async terminateSession(sessionId: string, userId: string): Promise<void> {
    try {
      const session = await this.getSession(sessionId);
      if (!session || session.userId !== userId) {
        throw new SecurityError('Session not found or unauthorized', 'AUTH_SESSION_UNAUTHORIZED');
      }

      await this.invalidateSession(sessionId);
      await this.redis.del(`tokens:${sessionId}`);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Zero-trust verification
   */
  async verifyZeroTrust(token: string, requiredPermissions: string[]): Promise<boolean> {
    try {
      // Verify JWT token
      const decoded = jwt.verify(token, this.config.jwtSecret) as any;
      
      // Get session data
      const session = await this.getSession(decoded.sessionId);
      if (!session) {
        return false;
      }

      // Check session validity
      if (session.expiresAt < new Date()) {
        return false;
      }

      // Verify permissions
      const hasPermissions = requiredPermissions.every(permission => 
        session.permissions.includes(permission)
      );

      if (!hasPermissions) {
        return false;
      }

      // Risk-based verification
      if (session.riskScore > 70) {
        // Require additional verification for high-risk sessions
        return await this.requireAdditionalVerification(session);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Helper methods
  private async verifyCredentials(email: string, password: string): Promise<any> {
    // Implementation would verify against database
    // This is a placeholder
    return { id: 'user-id', email, role: 'user' };
  }

  private async checkMFARequirement(userId: string, deviceInfo: DeviceInfo): Promise<boolean> {
    return this.mfaService.shouldRequireMFA({
      userId,
      ipAddress: deviceInfo.location?.ip || '',
      userAgent: deviceInfo.browser || '',
      isNewDevice: !deviceInfo.trusted,
      isHighRiskAction: false,
      suspiciousActivity: false
    });
  }

  private async verifyMFA(userId: string, token: string): Promise<boolean> {
    // Get user's MFA secret from database
    const mfaRecord = await this.getMFARecord(userId);
    if (!mfaRecord) {
      return false;
    }

    return this.mfaService.verifyTOTP(token, mfaRecord.secret);
  }

  private async createSession(userId: string, deviceInfo: DeviceInfo, platform: string): Promise<string> {
    const sessionId = crypto.randomUUID();
    const session: SessionData = {
      sessionId,
      userId,
      deviceId: deviceInfo.deviceId,
      platform: platform as any,
      createdAt: new Date(),
      lastActivity: new Date(),
      expiresAt: new Date(Date.now() + this.config.sessionTimeout),
      ipAddress: deviceInfo.location?.ip || '',
      userAgent: deviceInfo.browser || '',
      mfaVerified: false,
      riskScore: this.calculateRiskScore(deviceInfo),
      permissions: await this.getUserPermissions(userId)
    };

    await this.storeSession(session);
    return sessionId;
  }

  private calculateRiskScore(deviceInfo: DeviceInfo): number {
    let score = 0;
    
    // New device increases risk
    if (!deviceInfo.trusted) score += 30;
    
    // Unknown location increases risk
    if (!deviceInfo.location) score += 20;
    
    // Mobile platform has different risk profile
    if (deviceInfo.platform === 'mobile') score += 10;
    
    return Math.min(score, 100);
  }

  private parseTimeString(timeString: string): number {
    const unit = timeString.slice(-1);
    const value = parseInt(timeString.slice(0, -1));
    
    switch (unit) {
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return parseInt(timeString);
    }
  }

  // Placeholder methods - would be implemented with actual storage
  private async storeTokens(sessionId: string, tokens: any): Promise<void> {
    await this.redis.setex(`tokens:${sessionId}`, 3600, JSON.stringify(tokens));
  }

  private async storeSession(session: SessionData): Promise<void> {
    await this.redis.setex(
      `session:${session.userId}:${session.sessionId}`,
      this.config.sessionTimeout / 1000,
      JSON.stringify(session)
    );
  }

  private async getSession(sessionId: string): Promise<SessionData | null> {
    const sessionData = await this.redis.get(`session:*:${sessionId}`);
    return sessionData ? JSON.parse(sessionData) : null;
  }

  private async invalidateSession(sessionId: string): Promise<void> {
    const keys = await this.redis.keys(`session:*:${sessionId}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async updateSessionActivity(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (session) {
      session.lastActivity = new Date();
      await this.storeSession(session);
    }
  }

  // Additional helper methods would be implemented here...
  private generateSecureCookieToken(token: string): string { return token; }
  private async encryptForKeystore(token: string, deviceId: string): Promise<string> { return token; }
  private async encryptForExtension(token: string): Promise<string> { return token; }
  private async generateBiometricHash(deviceId: string): Promise<string> { return ''; }
  private getExtensionPermissions(): string[] { return []; }
  private async getUserById(id: string): Promise<any> { return {}; }
  private async revokeAllUserSessions(userId: string): Promise<void> { }
  private async updateCrossDeviceSync(userId: string): Promise<void> { }
  private async storeBiometricData(data: BiometricData): Promise<void> { }
  private async getBiometricData(userId: string, deviceId: string): Promise<BiometricData | null> { return null; }
  private async updateBiometricLastUsed(userId: string, deviceId: string): Promise<void> { }
  private async verifyBiometricSignature(data: string, publicKey: string): Promise<boolean> { return false; }
  private async setupCrossDeviceSync(userId: string, sessionId: string): Promise<void> { }
  private async getCrossDeviceSync(userId: string): Promise<CrossDeviceSync | null> { return null; }
  private async getMFARecord(userId: string): Promise<any> { return null; }
  private async trustDevice(userId: string, deviceInfo: DeviceInfo): Promise<void> { }
  private async getUserPermissions(userId: string): Promise<string[]> { return []; }
  private async requireAdditionalVerification(session: SessionData): Promise<boolean> { return false; }
  private async logAuthAttempt(email: string, deviceInfo: DeviceInfo, success: boolean, error?: string): Promise<void> { }
}

export const createUnifiedAuth = (redis: Redis, prisma: PrismaClient, config: AuthConfig) => {
  return new UnifiedAuthService(redis, prisma, config);
};