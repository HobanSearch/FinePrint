/**
 * Fine Print AI - Token Service
 * Enterprise-grade JWT token management with secure generation, validation, and revocation
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { SignJWT, jwtVerify, generateKeyPair, importJWK, exportJWK } from 'jose';
import { LoggerService } from '../../logger/src/services/logger-service';
import { ConfigService } from '../../config/src/services/configuration';

export interface TokenConfig {
  // JWT Configuration
  jwt: {
    algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512' | 'ES256' | 'ES384' | 'ES512';
    issuer: string;
    audience: string;
    accessTokenTTL: number; // seconds
    refreshTokenTTL: number; // seconds
    clockTolerance: number; // seconds
    maxAge: number; // seconds
  };

  // Signing Keys
  keys: {
    publicKey?: string;
    privateKey?: string;
    symmetricKey?: string;
    keyRotationInterval: number; // seconds
    keyRetentionPeriod: number; // seconds
    autoRotate: boolean;
  };

  // Token Features
  features: {
    refreshTokens: boolean;
    tokenRevocation: boolean;
    tokenIntrospection: boolean;
    audienceValidation: boolean;
    issuerValidation: boolean;
    subjectValidation: boolean;
  };

  // Security Settings
  security: {
    tokenBinding: boolean; // bind tokens to specific devices/sessions
    fingerprintValidation: boolean;
    rateLimiting: boolean;
    bruteForceProtection: boolean;
    anomalyDetection: boolean;
  };

  // Storage Configuration
  storage: {
    storeRefreshTokens: boolean;
    storeTokenMetadata: boolean;
    encryptStoredTokens: boolean;
    compressTokens: boolean;
  };
}

export interface TokenPayload {
  // Standard JWT claims
  sub: string; // subject (user ID)
  iss: string; // issuer
  aud: string | string[]; // audience
  exp: number; // expiration time
  nbf: number; // not before
  iat: number; // issued at
  jti: string; // JWT ID

  // Custom claims
  email?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  sessionId?: string;
  deviceId?: string;
  fingerprint?: string;
  riskScore?: number;
  mfaVerified?: boolean;
  
  // Platform-specific claims
  platform?: 'web' | 'mobile' | 'extension' | 'api' | 'agent';
  clientId?: string;
  scope?: string[];
  
  // Context claims
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country: string;
    region: string;
    city: string;
  };
  
  // Security claims
  authTime?: number; // authentication time
  acr?: string; // authentication context class reference
  amr?: string[]; // authentication methods references
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope?: string;
  jti: string;
  metadata?: TokenMetadata;
}

export interface TokenMetadata {
  tokenId: string;
  userId: string;
  sessionId?: string;
  deviceId?: string;
  platform: string;
  clientId?: string;
  issuedAt: Date;
  expiresAt: Date;
  refreshExpiresAt?: Date;
  revokedAt?: Date;
  lastUsedAt?: Date;
  usageCount: number;
  ipAddress?: string;
  userAgent?: string;
  fingerprint?: string;
  parentTokenId?: string; // for refresh token chains
  riskScore?: number;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: TokenPayload;
  metadata?: TokenMetadata;
  errors?: string[];
  warnings?: string[];
  riskScore?: number;
}

export interface TokenIntrospectionResult {
  active: boolean;
  scope?: string;
  client_id?: string;
  username?: string;
  token_type?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  sub?: string;
  aud?: string;
  iss?: string;
  jti?: string;
  // Custom fields
  roles?: string[];
  permissions?: string[];
  device_id?: string;
  session_id?: string;
  risk_score?: number;
}

export interface KeyPair {
  id: string;
  algorithm: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
  expiresAt: Date;
  active: boolean;
  usage: 'signing' | 'encryption' | 'both';
}

export class TokenService extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: TokenConfig;
  private logger: LoggerService;
  private configService: ConfigService;
  
  // Key management
  private activeKeyPair?: KeyPair;
  private keyPairs: Map<string, KeyPair> = new Map();
  
  // Token blacklist for revocation
  private tokenBlacklist: Set<string> = new Set();
  
  // Rate limiting counters
  private rateLimitCounters: Map<string, { count: number; reset: number }> = new Map();

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: TokenConfig,
    logger: LoggerService,
    configService: ConfigService
  ) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    this.config = config;
    this.logger = logger;
    this.configService = configService;

    this.initializeKeyManagement();
    this.setupTokenRotation();
  }

  /**
   * Generate a new token pair (access + refresh tokens)
   */
  async generateTokens(
    user: any,
    context: any,
    additionalClaims?: Record<string, any>
  ): Promise<TokenPair> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const jti = crypto.randomUUID();
      const sessionId = context.sessionId || crypto.randomUUID();

      // Build token payload
      const payload: TokenPayload = {
        sub: user.id,
        iss: this.config.jwt.issuer,
        aud: this.config.jwt.audience,
        exp: now + this.config.jwt.accessTokenTTL,
        nbf: now,
        iat: now,
        jti,
        
        // User information
        email: user.email,
        role: user.role,
        roles: user.roles || [user.role],
        permissions: user.permissions || [],
        
        // Session information
        sessionId,
        deviceId: context.deviceId,
        platform: context.platform || 'web',
        
        // Security information
        riskScore: context.riskScore || 0,
        mfaVerified: context.mfaVerified || false,
        authTime: now,
        acr: context.authenticationMethods?.length > 1 ? 'high' : 'low',
        amr: context.authenticationMethods || ['pwd'],
        
        // Context information
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        location: context.location,
        fingerprint: await this.generateTokenFingerprint(context),
        
        // Additional custom claims
        ...additionalClaims
      };

      // Generate access token
      const accessToken = await this.signToken(payload);

      // Generate refresh token if enabled
      let refreshToken = '';
      if (this.config.features.refreshTokens) {
        const refreshPayload: Partial<TokenPayload> = {
          sub: user.id,
          iss: this.config.jwt.issuer,
          aud: this.config.jwt.audience,
          exp: now + this.config.jwt.refreshTokenTTL,
          nbf: now,
          iat: now,
          jti: crypto.randomUUID(),
          sessionId,
          deviceId: context.deviceId,
          platform: context.platform || 'web'
        };
        
        refreshToken = await this.signToken(refreshPayload);
      }

      // Create token metadata
      const metadata: TokenMetadata = {
        tokenId: jti,
        userId: user.id,
        sessionId,
        deviceId: context.deviceId,
        platform: context.platform || 'web',
        issuedAt: new Date(now * 1000),
        expiresAt: new Date((now + this.config.jwt.accessTokenTTL) * 1000),
        refreshExpiresAt: refreshToken ? new Date((now + this.config.jwt.refreshTokenTTL) * 1000) : undefined,
        usageCount: 0,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        fingerprint: payload.fingerprint,
        riskScore: context.riskScore || 0
      };

      // Store token metadata if enabled
      if (this.config.storage.storeTokenMetadata) {
        await this.storeTokenMetadata(metadata);
      }

      // Store refresh token if enabled
      if (this.config.storage.storeRefreshTokens && refreshToken) {
        await this.storeRefreshToken(refreshPayload.jti!, refreshToken, metadata);
      }

      // Log token generation
      this.logger.info('Tokens generated', {
        userId: user.id,
        tokenId: jti,
        sessionId,
        platform: context.platform,
        riskScore: context.riskScore
      });

      // Emit token generation event
      this.emit('tokensGenerated', {
        userId: user.id,
        tokenId: jti,
        metadata
      });

      return {
        accessToken,
        refreshToken,
        tokenType: 'Bearer',
        expiresIn: this.config.jwt.accessTokenTTL,
        jti,
        metadata
      };

    } catch (error) {
      this.logger.error('Token generation failed', { 
        error: error.message, 
        userId: user.id 
      });
      throw error;
    }
  }

  /**
   * Validate and decode a JWT token
   */
  async validateToken(token: string, options?: {
    checkRevocation?: boolean;
    updateUsage?: boolean;
    requireFingerprint?: boolean;
    expectedFingerprint?: string;
  }): Promise<TokenValidationResult> {
    try {
      // Rate limiting check
      if (this.config.security.rateLimiting) {
        const rateLimitKey = `token_validation:${this.hashToken(token)}`;
        const allowed = await this.checkRateLimit(rateLimitKey, 100, 3600); // 100 per hour
        if (!allowed) {
          return {
            valid: false,
            errors: ['Rate limit exceeded for token validation']
          };
        }
      }

      // Check token blacklist first if revocation is enabled
      if (this.config.features.tokenRevocation && options?.checkRevocation) {
        const isRevoked = await this.isTokenRevoked(token);
        if (isRevoked) {
          return {
            valid: false,
            errors: ['Token has been revoked']
          };
        }
      }

      // Verify JWT signature and decode payload
      const result = await this.verifyToken(token);
      if (!result.valid || !result.payload) {
        return result;
      }

      const payload = result.payload;

      // Additional validation checks
      const validationErrors: string[] = [];
      const validationWarnings: string[] = [];

      // Check token binding if enabled
      if (this.config.security.tokenBinding && options?.requireFingerprint) {
        if (!payload.fingerprint || !options.expectedFingerprint) {
          validationErrors.push('Token fingerprint validation required');
        } else if (payload.fingerprint !== options.expectedFingerprint) {
          validationErrors.push('Token fingerprint mismatch');
        }
      }

      // Check risk score
      if (payload.riskScore && payload.riskScore > 80) {
        validationWarnings.push('High risk score detected');
      }

      // Check authentication age
      if (payload.authTime) {
        const authAge = Math.floor(Date.now() / 1000) - payload.authTime;
        if (authAge > 86400) { // 24 hours
          validationWarnings.push('Authentication is older than 24 hours');
        }
      }

      // Update token usage if requested
      if (options?.updateUsage && this.config.storage.storeTokenMetadata) {
        await this.updateTokenUsage(payload.jti);
      }

      // Get token metadata if available
      let metadata: TokenMetadata | undefined;
      if (this.config.storage.storeTokenMetadata) {
        metadata = await this.getTokenMetadata(payload.jti);
      }

      // Anomaly detection
      if (this.config.security.anomalyDetection && metadata) {
        const anomalies = await this.detectTokenAnomalies(payload, metadata);
        if (anomalies.length > 0) {
          validationWarnings.push(...anomalies);
        }
      }

      const validationResult: TokenValidationResult = {
        valid: validationErrors.length === 0,
        payload,
        metadata,
        errors: validationErrors.length > 0 ? validationErrors : undefined,
        warnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        riskScore: payload.riskScore
      };

      // Log validation attempt
      this.logger.debug('Token validated', {
        tokenId: payload.jti,
        userId: payload.sub,
        valid: validationResult.valid,
        errors: validationErrors,
        warnings: validationWarnings
      });

      return validationResult;

    } catch (error) {
      this.logger.error('Token validation failed', { error: error.message });
      return {
        valid: false,
        errors: [`Token validation failed: ${error.message}`]
      };
    }
  }

  /**
   * Refresh an access token using a refresh token
   */
  async refreshToken(refreshToken: string, context?: any): Promise<TokenPair> {
    try {
      // Validate refresh token
      const validation = await this.validateToken(refreshToken, {
        checkRevocation: true
      });

      if (!validation.valid || !validation.payload) {
        throw new Error('Invalid refresh token');
      }

      const payload = validation.payload;

      // Get user information
      const user = await this.getUserById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }

      // Generate new token pair
      const newTokens = await this.generateTokens(user, {
        sessionId: payload.sessionId,
        deviceId: payload.deviceId,
        platform: payload.platform,
        ipAddress: context?.ipAddress || payload.ipAddress,
        userAgent: context?.userAgent || payload.userAgent,
        riskScore: payload.riskScore,
        ...context
      });

      // Revoke old refresh token
      if (this.config.features.tokenRevocation) {
        await this.revokeToken(refreshToken);
      }

      // Log token refresh
      this.logger.info('Token refreshed', {
        userId: user.id,
        oldTokenId: payload.jti,
        newTokenId: newTokens.jti,
        sessionId: payload.sessionId
      });

      return newTokens;

    } catch (error) {
      this.logger.error('Token refresh failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string, reason?: string): Promise<void> {
    try {
      if (!this.config.features.tokenRevocation) {
        throw new Error('Token revocation is not enabled');
      }

      // Decode token to get metadata
      const decoded = jwt.decode(token) as TokenPayload;
      if (!decoded?.jti) {
        throw new Error('Invalid token format');
      }

      // Add to blacklist
      await this.addToBlacklist(decoded.jti, decoded.exp);

      // Update token metadata
      if (this.config.storage.storeTokenMetadata) {
        await this.markTokenRevoked(decoded.jti, reason);
      }

      // Log revocation
      this.logger.info('Token revoked', {
        tokenId: decoded.jti,
        userId: decoded.sub,
        reason: reason || 'Manual revocation'
      });

      // Emit revocation event
      this.emit('tokenRevoked', {
        tokenId: decoded.jti,
        userId: decoded.sub,
        reason
      });

    } catch (error) {
      this.logger.error('Token revocation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Perform token introspection (RFC 7662)
   */
  async introspectToken(token: string): Promise<TokenIntrospectionResult> {
    try {
      if (!this.config.features.tokenIntrospection) {
        throw new Error('Token introspection is not enabled');
      }

      const validation = await this.validateToken(token, {
        checkRevocation: true
      });

      if (!validation.valid || !validation.payload) {
        return { active: false };
      }

      const payload = validation.payload;

      return {
        active: true,
        scope: payload.scope?.join(' '),
        client_id: payload.aud as string,
        username: payload.email || payload.sub,
        token_type: 'Bearer',
        exp: payload.exp,
        iat: payload.iat,
        nbf: payload.nbf,
        sub: payload.sub,
        aud: payload.aud as string,
        iss: payload.iss,
        jti: payload.jti,
        roles: payload.roles,
        permissions: payload.permissions,
        device_id: payload.deviceId,
        session_id: payload.sessionId,
        risk_score: payload.riskScore
      };

    } catch (error) {
      this.logger.error('Token introspection failed', { error: error.message });
      return { active: false };
    }
  }

  /**
   * Initialize key management system
   */
  private async initializeKeyManagement(): Promise<void> {
    try {
      // Load existing key pairs
      await this.loadKeyPairs();

      // Generate initial key pair if none exists
      if (this.keyPairs.size === 0) {
        await this.generateNewKeyPair();
      }

      // Set active key pair
      this.setActiveKeyPair();

      this.logger.info('Key management initialized', {
        keyPairCount: this.keyPairs.size,
        activeKeyId: this.activeKeyPair?.id
      });

    } catch (error) {
      this.logger.error('Key management initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Setup automatic token rotation
   */
  private setupTokenRotation(): void {
    if (this.config.keys.autoRotate) {
      setInterval(async () => {
        try {
          await this.rotateKeys();
        } catch (error) {
          this.logger.error('Automatic key rotation failed', { error: error.message });
        }
      }, this.config.keys.keyRotationInterval * 1000);
    }
  }

  /**
   * Sign a JWT token
   */
  private async signToken(payload: Partial<TokenPayload>): Promise<string> {
    if (!this.activeKeyPair) {
      throw new Error('No active key pair available');
    }

    try {
      if (this.config.jwt.algorithm.startsWith('HS')) {
        // HMAC signing
        return jwt.sign(payload, this.config.keys.symmetricKey!, {
          algorithm: this.config.jwt.algorithm as jwt.Algorithm,
          issuer: this.config.jwt.issuer,
          audience: this.config.jwt.audience,
          expiresIn: payload.exp ? undefined : this.config.jwt.accessTokenTTL
        });
      } else {
        // Asymmetric signing using JOSE
        const privateKey = await importJWK(JSON.parse(this.activeKeyPair.privateKey));
        
        return await new SignJWT(payload as any)
          .setProtectedHeader({ alg: this.config.jwt.algorithm, kid: this.activeKeyPair.id })
          .setIssuer(this.config.jwt.issuer)
          .setAudience(this.config.jwt.audience)
          .setIssuedAt()
          .setExpirationTime(payload.exp || Math.floor(Date.now() / 1000) + this.config.jwt.accessTokenTTL)
          .sign(privateKey);
      }
    } catch (error) {
      this.logger.error('Token signing failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Verify a JWT token
   */
  private async verifyToken(token: string): Promise<TokenValidationResult> {
    try {
      let payload: TokenPayload;

      if (this.config.jwt.algorithm.startsWith('HS')) {
        // HMAC verification
        payload = jwt.verify(token, this.config.keys.symmetricKey!, {
          algorithms: [this.config.jwt.algorithm as jwt.Algorithm],
          issuer: this.config.features.issuerValidation ? this.config.jwt.issuer : undefined,
          audience: this.config.features.audienceValidation ? this.config.jwt.audience : undefined,
          clockTolerance: this.config.jwt.clockTolerance,
          maxAge: this.config.jwt.maxAge ? `${this.config.jwt.maxAge}s` : undefined
        }) as TokenPayload;
      } else {
        // Asymmetric verification using JOSE
        const header = jwt.decode(token, { complete: true })?.header;
        const keyPair = header?.kid ? this.keyPairs.get(header.kid) : this.activeKeyPair;
        
        if (!keyPair) {
          throw new Error('Key not found');
        }

        const publicKey = await importJWK(JSON.parse(keyPair.publicKey));
        const result = await jwtVerify(token, publicKey, {
          issuer: this.config.features.issuerValidation ? this.config.jwt.issuer : undefined,
          audience: this.config.features.audienceValidation ? this.config.jwt.audience : undefined,
          clockTolerance: `${this.config.jwt.clockTolerance}s`,
          maxTokenAge: this.config.jwt.maxAge ? `${this.config.jwt.maxAge}s` : undefined
        });

        payload = result.payload as TokenPayload;
      }

      return {
        valid: true,
        payload
      };

    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  // Helper methods (implementation would be more detailed in production)
  
  private async generateTokenFingerprint(context: any): Promise<string> {
    const data = `${context.deviceId}:${context.ipAddress}:${context.userAgent}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async checkRateLimit(key: string, limit: number, window: number): Promise<boolean> {
    // Implementation would check rate limits
    return true;
  }

  private async isTokenRevoked(token: string): Promise<boolean> {
    // Implementation would check token blacklist
    return false;
  }

  private async storeTokenMetadata(metadata: TokenMetadata): Promise<void> {
    // Implementation would store token metadata
  }

  private async storeRefreshToken(jti: string, token: string, metadata: TokenMetadata): Promise<void> {
    // Implementation would store refresh token
  }

  private async updateTokenUsage(jti: string): Promise<void> {
    // Implementation would update token usage statistics
  }

  private async getTokenMetadata(jti: string): Promise<TokenMetadata | undefined> {
    // Implementation would retrieve token metadata
    return undefined;
  }

  private async detectTokenAnomalies(payload: TokenPayload, metadata: TokenMetadata): Promise<string[]> {
    // Implementation would detect anomalies
    return [];
  }

  private async getUserById(userId: string): Promise<any> {
    // Implementation would get user from database
    return null;
  }

  private async addToBlacklist(jti: string, exp: number): Promise<void> {
    // Implementation would add token to blacklist
  }

  private async markTokenRevoked(jti: string, reason?: string): Promise<void> {
    // Implementation would mark token as revoked in metadata
  }

  private async loadKeyPairs(): Promise<void> {
    // Implementation would load key pairs from storage
  }

  private async generateNewKeyPair(): Promise<void> {
    // Implementation would generate new key pair
  }

  private setActiveKeyPair(): void {
    // Implementation would set the active key pair
  }

  private async rotateKeys(): Promise<void> {
    // Implementation would rotate keys
  }
}

export const createTokenService = (
  redis: Redis,
  prisma: PrismaClient,
  config: TokenConfig,
  logger: LoggerService,
  configService: ConfigService
) => {
  return new TokenService(redis, prisma, config, logger, configService);
};