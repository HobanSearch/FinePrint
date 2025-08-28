import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import { JWTPayload, RefreshTokenPayload } from '@fineprintai/shared-types';
import { 
  JWTManagerConfig, 
  TokenValidationResult, 
  RefreshTokenData, 
  AccessTokenData,
  TokenBlacklistEntry 
} from './types';
import { JWTKeyManager } from './keyManager';

const logger = createServiceLogger('jwt-token-manager');

export class JWTTokenManager {
  private keyManager: JWTKeyManager;
  private cache: CacheManager;
  private config: JWTManagerConfig;

  constructor(cache: CacheManager, config: JWTManagerConfig) {
    this.cache = cache;
    this.config = config;
    this.keyManager = new JWTKeyManager(cache, config.keyRotation);
  }

  /**
   * Generate access token with RS256 signing
   */
  async generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>): Promise<string> {
    try {
      const keyPair = await this.keyManager.getCurrentKeyPair();
      const jti = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);

      const fullPayload: JWTPayload = {
        ...payload,
        iat: now,
        exp: now + this.config.accessTokenTTL,
        type: 'access',
        jti
      };

      const token = jwt.sign(fullPayload, keyPair.privateKey, {
        algorithm: this.config.algorithm,
        issuer: this.config.issuer,
        audience: this.config.audience
      });

      // Store access token metadata for tracking
      if (this.config.blacklistEnabled) {
        const tokenData: AccessTokenData = {
          jti,
          userId: payload.sub,
          sessionId: payload.sessionId || crypto.randomUUID(),
          refreshTokenId: payload.refreshTokenId || '',
          scopes: payload.scopes || [],
          createdAt: new Date(),
          expiresAt: new Date((now + this.config.accessTokenTTL) * 1000)
        };

        await this.cache.set(
          `access-token:${jti}`, 
          tokenData, 
          this.config.accessTokenTTL
        );
      }

      logger.info('Access token generated', { 
        userId: payload.sub, 
        jti: jti.substring(0, 8) + '...'
      });

      return token;
    } catch (error) {
      logger.error('Failed to generate access token', { error, userId: payload.sub });
      throw new Error('Access token generation failed');
    }
  }

  /**
   * Generate refresh token with secure random data
   */
  async generateRefreshToken(
    userId: string, 
    deviceFingerprint?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; tokenId: string }> {
    try {
      const tokenId = crypto.randomUUID();
      const tokenSecret = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
      
      const now = Math.floor(Date.now() / 1000);
      const refreshPayload: RefreshTokenPayload = {
        sub: userId,
        tokenId,
        iat: now,
        exp: now + this.config.refreshTokenTTL
      };

      const keyPair = await this.keyManager.getCurrentKeyPair();
      const token = jwt.sign(refreshPayload, keyPair.privateKey, {
        algorithm: this.config.algorithm,
        issuer: this.config.issuer,
        audience: this.config.audience
      });

      // Store refresh token data
      const refreshTokenData: RefreshTokenData = {
        id: tokenId,
        userId,
        tokenHash,
        deviceFingerprint,
        ipAddress,
        userAgent,
        expiresAt: new Date((now + this.config.refreshTokenTTL) * 1000),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        revoked: false
      };

      await this.cache.set(
        `refresh-token:${tokenId}`, 
        refreshTokenData, 
        this.config.refreshTokenTTL
      );

      // Manage refresh token limits per user
      await this.manageUserRefreshTokens(userId, tokenId);

      logger.info('Refresh token generated', { 
        userId, 
        tokenId: tokenId.substring(0, 8) + '...',
        deviceFingerprint: deviceFingerprint?.substring(0, 8) + '...'
      });

      return { token, tokenId };
    } catch (error) {
      logger.error('Failed to generate refresh token', { error, userId });
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token: string): Promise<TokenValidationResult> {
    try {
      // First try with current key
      let result = await this.validateTokenWithKey(token, 'current');
      
      // If failed, try with previous key (during rotation)
      if (!result.valid && result.error?.includes('invalid signature')) {
        result = await this.validateTokenWithKey(token, 'previous');
      }

      if (!result.valid) {
        return result;
      }

      const payload = result.payload as JWTPayload;

      // Check if token is blacklisted
      if (this.config.blacklistEnabled && payload.jti) {
        const isBlacklisted = await this.isTokenBlacklisted(payload.jti);
        if (isBlacklisted) {
          logger.warn('Attempted use of blacklisted token', { 
            jti: payload.jti.substring(0, 8) + '...',
            userId: payload.sub 
          });
          return { valid: false, error: 'Token blacklisted' };
        }
      }

      // Validate token type
      if (payload.type !== 'access') {
        return { valid: false, error: 'Invalid token type' };
      }

      logger.debug('Access token validated successfully', { 
        userId: payload.sub,
        jti: payload.jti?.substring(0, 8) + '...'
      });

      return { valid: true, payload };
    } catch (error) {
      logger.error('Access token validation error', { error });
      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<TokenValidationResult> {
    try {
      // Validate JWT structure
      let result = await this.validateTokenWithKey(token, 'current');
      
      if (!result.valid && result.error?.includes('invalid signature')) {
        result = await this.validateTokenWithKey(token, 'previous');
      }

      if (!result.valid) {
        return result;
      }

      const payload = result.payload as RefreshTokenPayload;

      // Get stored refresh token data
      const tokenData = await this.cache.get<RefreshTokenData>(`refresh-token:${payload.tokenId}`);
      
      if (!tokenData) {
        return { valid: false, error: 'Refresh token not found' };
      }

      if (tokenData.revoked) {
        logger.warn('Attempted use of revoked refresh token', { 
          tokenId: payload.tokenId.substring(0, 8) + '...',
          userId: payload.sub,
          revokedReason: tokenData.revokedReason
        });
        return { valid: false, error: 'Refresh token revoked' };
      }

      // Update last used timestamp
      tokenData.lastUsedAt = new Date();
      await this.cache.set(
        `refresh-token:${payload.tokenId}`, 
        tokenData, 
        this.config.refreshTokenTTL
      );

      logger.debug('Refresh token validated successfully', { 
        userId: payload.sub,
        tokenId: payload.tokenId.substring(0, 8) + '...'
      });

      return { valid: true, payload };
    } catch (error) {
      logger.error('Refresh token validation error', { error });
      return { valid: false, error: 'Refresh token validation failed' };
    }
  }

  /**
   * Rotate refresh token (generate new one, revoke old one)
   */
  async rotateRefreshToken(
    oldToken: string,
    deviceFingerprint?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ accessToken: string; refreshToken: string; tokenId: string } | null> {
    try {
      // Validate old refresh token
      const validation = await this.validateRefreshToken(oldToken);
      
      if (!validation.valid || !validation.payload) {
        logger.warn('Invalid refresh token provided for rotation');
        return null;
      }

      const oldPayload = validation.payload as RefreshTokenPayload;

      // Revoke old refresh token
      await this.revokeRefreshToken(oldPayload.tokenId, 'token-rotation');

      // Generate new tokens
      const { token: newRefreshToken, tokenId } = await this.generateRefreshToken(
        oldPayload.sub,
        deviceFingerprint,
        ipAddress,
        userAgent
      );

      const newAccessToken = await this.generateAccessToken({
        sub: oldPayload.sub,
        email: '', // This should be fetched from user data
        role: '', // This should be fetched from user data
        subscriptionTier: '', // This should be fetched from user data
        refreshTokenId: tokenId
      });

      logger.info('Refresh token rotated successfully', { 
        userId: oldPayload.sub,
        oldTokenId: oldPayload.tokenId.substring(0, 8) + '...',
        newTokenId: tokenId.substring(0, 8) + '...'
      });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        tokenId
      };
    } catch (error) {
      logger.error('Refresh token rotation failed', { error });
      return null;
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(tokenId: string, reason: string = 'manual-revocation'): Promise<boolean> {
    try {
      const tokenData = await this.cache.get<RefreshTokenData>(`refresh-token:${tokenId}`);
      
      if (!tokenData) {
        logger.warn('Attempted to revoke non-existent refresh token', { tokenId });
        return false;
      }

      tokenData.revoked = true;
      tokenData.revokedAt = new Date();
      tokenData.revokedReason = reason;

      await this.cache.set(
        `refresh-token:${tokenId}`, 
        tokenData, 
        this.config.refreshTokenTTL
      );

      logger.info('Refresh token revoked', { 
        tokenId: tokenId.substring(0, 8) + '...',
        userId: tokenData.userId,
        reason 
      });

      return true;
    } catch (error) {
      logger.error('Failed to revoke refresh token', { error, tokenId });
      return false;
    }
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllUserRefreshTokens(userId: string, reason: string = 'security-action'): Promise<number> {
    try {
      const userTokensKey = `user-refresh-tokens:${userId}`;
      const tokenIds = await this.cache.smembers(userTokensKey);
      
      let revokedCount = 0;
      for (const tokenId of tokenIds) {
        const success = await this.revokeRefreshToken(tokenId, reason);
        if (success) revokedCount++;
      }

      logger.info('Revoked all user refresh tokens', { 
        userId, 
        count: revokedCount,
        reason 
      });

      return revokedCount;
    } catch (error) {
      logger.error('Failed to revoke all user refresh tokens', { error, userId });
      return 0;
    }
  }

  /**
   * Blacklist access token
   */
  async blacklistAccessToken(jti: string, userId: string, reason: string): Promise<boolean> {
    if (!this.config.blacklistEnabled) {
      return false;
    }

    try {
      const tokenData = await this.cache.get<AccessTokenData>(`access-token:${jti}`);
      
      if (!tokenData) {
        logger.warn('Attempted to blacklist non-existent access token', { jti });
        return false;
      }

      const blacklistEntry: TokenBlacklistEntry = {
        jti,
        userId,
        expiresAt: tokenData.expiresAt,
        reason,
        createdAt: new Date()
      };

      const ttl = Math.max(0, Math.floor((tokenData.expiresAt.getTime() - Date.now()) / 1000));
      
      await this.cache.set(`blacklist:${jti}`, blacklistEntry, ttl);

      logger.info('Access token blacklisted', { 
        jti: jti.substring(0, 8) + '...',
        userId,
        reason 
      });

      return true;
    } catch (error) {
      logger.error('Failed to blacklist access token', { error, jti });
      return false;
    }
  }

  /**
   * Check if token is blacklisted
   */
  private async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!this.config.blacklistEnabled) {
      return false;
    }

    try {
      const entry = await this.cache.get(`blacklist:${jti}`);
      return entry !== null;
    } catch (error) {
      logger.error('Failed to check token blacklist', { error, jti });
      return false;
    }
  }

  /**
   * Validate token with specific key (current or previous)
   */
  private async validateTokenWithKey(
    token: string, 
    keyType: 'current' | 'previous'
  ): Promise<TokenValidationResult> {
    try {
      const keyPair = keyType === 'current' 
        ? await this.keyManager.getCurrentKeyPair()
        : await this.keyManager.getPreviousKeyPair();

      if (!keyPair) {
        return { valid: false, error: 'Signing key not available' };
      }

      const payload = jwt.verify(token, keyPair.publicKey, {
        algorithms: [this.config.algorithm],
        issuer: this.config.issuer,
        audience: this.config.audience
      }) as JWTPayload | RefreshTokenPayload;

      return { valid: true, payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token expired', expired: true };
      }
      
      if (error instanceof jwt.JsonWebTokenError) {
        return { valid: false, error: error.message };
      }

      return { valid: false, error: 'Token validation failed' };
    }
  }

  /**
   * Manage user refresh token limits
   */
  private async manageUserRefreshTokens(userId: string, newTokenId: string): Promise<void> {
    try {
      const userTokensKey = `user-refresh-tokens:${userId}`;
      
      // Add new token to user's set
      await this.cache.sadd(userTokensKey, newTokenId);
      
      // Get all user tokens
      const tokenIds = await this.cache.smembers(userTokensKey);
      
      // If exceeds limit, revoke oldest tokens
      if (tokenIds.length > this.config.maxRefreshTokensPerUser) {
        const tokensToRevoke = tokenIds.slice(0, tokenIds.length - this.config.maxRefreshTokensPerUser);
        
        for (const tokenId of tokensToRevoke) {
          await this.revokeRefreshToken(tokenId, 'token-limit-exceeded');
          await this.cache.srem(userTokensKey, tokenId);
        }

        logger.info('Excess refresh tokens revoked', { 
          userId, 
          revokedCount: tokensToRevoke.length 
        });
      }

      // Set expiration on user tokens set
      await this.cache.expire(userTokensKey, this.config.refreshTokenTTL);
    } catch (error) {
      logger.error('Failed to manage user refresh tokens', { error, userId });
    }
  }

  /**
   * Get token statistics for monitoring
   */
  async getTokenStats(): Promise<{
    activeAccessTokens: number;
    activeRefreshTokens: number;
    blacklistedTokens: number;
    rotationStatus: any;
  }> {
    try {
      const [accessCount, refreshCount, blacklistCount, rotationStatus] = await Promise.all([
        this.cache.keys('access-token:*').then(keys => keys.length),
        this.cache.keys('refresh-token:*').then(keys => keys.length),
        this.cache.keys('blacklist:*').then(keys => keys.length),
        this.keyManager.getRotationStatus()
      ]);

      return {
        activeAccessTokens: accessCount,
        activeRefreshTokens: refreshCount,
        blacklistedTokens: blacklistCount,
        rotationStatus
      };
    } catch (error) {
      logger.error('Failed to get token stats', { error });
      return {
        activeAccessTokens: 0,
        activeRefreshTokens: 0,
        blacklistedTokens: 0,
        rotationStatus: null
      };
    }
  }

  /**
   * Cleanup expired tokens and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting token maintenance');

      // Clean up expired blacklist entries
      const blacklistKeys = await this.cache.keys('blacklist:*');
      let cleanedCount = 0;

      for (const key of blacklistKeys) {
        const entry = await this.cache.get<TokenBlacklistEntry>(key);
        if (entry && entry.expiresAt < new Date()) {
          await this.cache.del(key);
          cleanedCount++;
        }
      }

      logger.info('Token maintenance completed', { 
        cleanedBlacklistEntries: cleanedCount 
      });
    } catch (error) {
      logger.error('Token maintenance failed', { error });
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.keyManager.cleanup();
    logger.info('JWT Token Manager cleanup completed');
  }
}