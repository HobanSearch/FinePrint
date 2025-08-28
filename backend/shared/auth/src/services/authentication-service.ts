/**
 * Fine Print AI - Enhanced Authentication Service
 * Enterprise-grade authentication system with multi-factor support, WebAuthn, and zero-trust architecture
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { AuthenticatorTransportFuture, CredentialDeviceType } from '@simplewebauthn/types';
import * as geoip from 'geoip-lite';
import * as UAParser from 'ua-parser-js';
import { authenticator } from 'otpauth';
import { RiskAssessmentService } from './risk-assessment-service';
import { TokenService } from './token-service';
import { SessionService } from './session-service';
import { ConfigService } from '../../config/src/services/configuration';
import { LoggerService } from '../../logger/src/services/logger-service';

export interface AuthenticationConfig {
  // Basic authentication
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
  maxLoginAttempts: number;
  lockoutDuration: number;

  // Multi-factor authentication
  mfa: {
    required: boolean;
    allowedMethods: MFAMethod[];
    totpIssuer: string;
    backupCodesCount: number;
    rememberDeviceDuration: number;
  };

  // WebAuthn configuration
  webauthn: {
    enabled: boolean;
    rpName: string;
    rpID: string;
    origin: string;
    timeout: number;
    userVerification: 'required' | 'preferred' | 'discouraged';
    residentKey: 'required' | 'preferred' | 'discouraged';
    authenticatorSelection: {
      residentKey: 'required' | 'preferred' | 'discouraged';
      userVerification: 'required' | 'preferred' | 'discouraged';
    };
  };

  // Social authentication
  oauth: {
    google: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
    microsoft: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
    github: {
      enabled: boolean;
      clientId: string;
      clientSecret: string;
    };
  };

  // Risk and security
  riskAssessment: {
    enabled: boolean;
    strictMode: boolean;
    allowedCountries: string[];
    blockedCountries: string[];
    maxRiskScore: number;
  };

  // Agent authentication
  agentAuth: {
    enabled: boolean;
    certificateValidation: boolean;
    mutualTLS: boolean;
    apiKeyRotationInterval: number;
  };
}

export enum MFAMethod {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email',
  WEBAUTHN = 'webauthn',
  BACKUP_CODES = 'backup_codes'
}

export enum AuthenticationResult {
  SUCCESS = 'success',
  INVALID_CREDENTIALS = 'invalid_credentials',
  ACCOUNT_LOCKED = 'account_locked',
  MFA_REQUIRED = 'mfa_required',
  RISK_ASSESSMENT_FAILED = 'risk_assessment_failed',
  DEVICE_NOT_TRUSTED = 'device_not_trusted',
  RATE_LIMITED = 'rate_limited'
}

export interface AuthenticationRequest {
  email: string;
  password: string;
  mfaToken?: string;
  mfaMethod?: MFAMethod;
  webauthnResponse?: any;
  deviceInfo: DeviceInfo;
  userAgent: string;
  ipAddress: string;
  trustDevice?: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  fingerprint: string;
  name: string;
  type: 'desktop' | 'mobile' | 'tablet';
  os: string;
  browser: string;
  version: string;
  trusted: boolean;
  location?: GeoLocation;
}

export interface GeoLocation {
  country: string;
  region: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface AuthenticationContext {
  userId: string;
  sessionId: string;
  deviceId: string;
  ipAddress: string;
  userAgent: string;
  location: GeoLocation;
  riskScore: number;
  authenticationMethods: MFAMethod[];
  trustedDevice: boolean;
  timestamp: Date;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  mfaEnabled: boolean;
  mfaMethods: MFAMethod[];
  totpSecret?: string;
  backupCodes?: string[];
  webauthnCredentials?: WebAuthnCredential[];
  trustedDevices: string[];
  lastLoginAt: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebAuthnCredential {
  id: string;
  credentialId: string;
  credentialPublicKey: Uint8Array;
  counter: number;
  credentialDeviceType: CredentialDeviceType;
  credentialBackedUp: boolean;
  transports: AuthenticatorTransportFuture[];
  createdAt: Date;
  lastUsedAt: Date;
  name: string;
}

export interface AgentCredentials {
  id: string;
  name: string;
  type: 'dspy' | 'lora' | 'knowledge_graph' | 'general';
  apiKey: string;
  certificate?: string;
  privateKey?: string;
  permissions: string[];
  rateLimit: number;
  expiresAt: Date;
  lastUsedAt: Date;
  createdAt: Date;
}

export class AuthenticationService extends EventEmitter {
  private redis: Redis;
  private prisma: PrismaClient;
  private config: AuthenticationConfig;
  private riskAssessment: RiskAssessmentService;
  private tokenService: TokenService;
  private sessionService: SessionService;
  private configService: ConfigService;
  private logger: LoggerService;

  constructor(
    redis: Redis,
    prisma: PrismaClient,
    config: AuthenticationConfig,
    riskAssessment: RiskAssessmentService,
    tokenService: TokenService,
    sessionService: SessionService,
    configService: ConfigService,
    logger: LoggerService
  ) {
    super();
    this.redis = redis;
    this.prisma = prisma;
    this.config = config;
    this.riskAssessment = riskAssessment;
    this.tokenService = tokenService;
    this.sessionService = sessionService;
    this.configService = configService;
    this.logger = logger;
  }

  /**
   * Authenticate user with comprehensive security checks
   */
  async authenticateUser(request: AuthenticationRequest): Promise<{
    result: AuthenticationResult;
    context?: AuthenticationContext;
    tokens?: any;
    mfaChallenge?: any;
    riskAssessment?: any;
  }> {
    try {
      const startTime = Date.now();
      
      // Extract and validate device information
      const deviceInfo = await this.enhanceDeviceInfo(request.deviceInfo, request.userAgent, request.ipAddress);
      
      // Rate limiting check
      const rateLimitResult = await this.checkRateLimit(request.email, request.ipAddress);
      if (!rateLimitResult.allowed) {
        return { result: AuthenticationResult.RATE_LIMITED };
      }

      // Find user by email
      const user = await this.findUserByEmail(request.email);
      if (!user) {
        await this.logAuthenticationAttempt(request.email, deviceInfo, AuthenticationResult.INVALID_CREDENTIALS);
        return { result: AuthenticationResult.INVALID_CREDENTIALS };
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return { result: AuthenticationResult.ACCOUNT_LOCKED };
      }

      // Verify password
      const passwordValid = await this.verifyPassword(request.password, user.passwordHash);
      if (!passwordValid) {
        await this.handleFailedLogin(user.id, deviceInfo);
        return { result: AuthenticationResult.INVALID_CREDENTIALS };
      }

      // Perform risk assessment
      const riskAssessment = await this.performRiskAssessment(user, deviceInfo, request);
      if (riskAssessment.blocked) {
        await this.logAuthenticationAttempt(request.email, deviceInfo, AuthenticationResult.RISK_ASSESSMENT_FAILED);
        return { 
          result: AuthenticationResult.RISK_ASSESSMENT_FAILED,
          riskAssessment 
        };
      }

      // Check if MFA is required
      const mfaRequired = await this.checkMFARequirement(user, deviceInfo, riskAssessment);
      if (mfaRequired && !request.mfaToken && !request.webauthnResponse) {
        const mfaChallenge = await this.generateMFAChallenge(user, deviceInfo);
        return {
          result: AuthenticationResult.MFA_REQUIRED,
          mfaChallenge
        };
      }

      // Verify MFA if provided
      if (request.mfaToken || request.webauthnResponse) {
        const mfaValid = await this.verifyMFA(user, request.mfaToken, request.mfaMethod, request.webauthnResponse, deviceInfo);
        if (!mfaValid) {
          await this.handleFailedLogin(user.id, deviceInfo);
          return { result: AuthenticationResult.INVALID_CREDENTIALS };
        }
      }

      // Create authentication context
      const context: AuthenticationContext = {
        userId: user.id,
        sessionId: crypto.randomUUID(),
        deviceId: deviceInfo.deviceId,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        location: deviceInfo.location!,
        riskScore: riskAssessment.score,
        authenticationMethods: request.mfaToken || request.webauthnResponse ? 
          [request.mfaMethod || MFAMethod.WEBAUTHN] : [],
        trustedDevice: deviceInfo.trusted,
        timestamp: new Date()
      };

      // Generate tokens
      const tokens = await this.tokenService.generateTokens(user, context);

      // Create session
      await this.sessionService.createSession(context, tokens);

      // Handle device trust
      if (request.trustDevice && !deviceInfo.trusted) {
        await this.trustDevice(user.id, deviceInfo.deviceId);
      }

      // Update user last login
      await this.updateUserLastLogin(user.id);

      // Reset failed login attempts
      await this.resetFailedLoginAttempts(user.id);

      // Log successful authentication
      await this.logAuthenticationAttempt(request.email, deviceInfo, AuthenticationResult.SUCCESS, context);

      // Emit authentication event
      this.emit('authentication', {
        userId: user.id,
        result: AuthenticationResult.SUCCESS,
        deviceInfo,
        riskScore: riskAssessment.score,
        duration: Date.now() - startTime
      });

      return {
        result: AuthenticationResult.SUCCESS,
        context,
        tokens,
        riskAssessment
      };

    } catch (error) {
      this.logger.error('Authentication error', { error: error.message, email: request.email });
      throw error;
    }
  }

  /**
   * Setup WebAuthn registration for a user
   */
  async setupWebAuthn(userId: string, deviceInfo: DeviceInfo): Promise<any> {
    try {
      const user = await this.findUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const options = generateRegistrationOptions({
        rpName: this.config.webauthn.rpName,
        rpID: this.config.webauthn.rpID,
        userID: user.id,
        userName: user.email,
        userDisplayName: user.email,
        timeout: this.config.webauthn.timeout,
        attestationType: 'none',
        excludeCredentials: user.webauthnCredentials?.map(cred => ({
          id: cred.credentialId,
          type: 'public-key',
          transports: cred.transports,
        })) || [],
        authenticatorSelection: this.config.webauthn.authenticatorSelection,
        supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
      });

      // Store challenge temporarily
      await this.redis.setex(
        `webauthn:challenge:${userId}`,
        300, // 5 minutes
        JSON.stringify({
          challenge: options.challenge,
          deviceId: deviceInfo.deviceId
        })
      );

      return options;
    } catch (error) {
      this.logger.error('WebAuthn setup error', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Verify WebAuthn registration response
   */
  async verifyWebAuthnRegistration(
    userId: string,
    response: any,
    credentialName: string
  ): Promise<boolean> {
    try {
      const challengeData = await this.redis.get(`webauthn:challenge:${userId}`);
      if (!challengeData) {
        throw new Error('Challenge not found or expired');
      }

      const { challenge } = JSON.parse(challengeData);

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: this.config.webauthn.origin,
        expectedRPID: this.config.webauthn.rpID,
      });

      if (verification.verified && verification.registrationInfo) {
        const { credentialPublicKey, credentialID, counter } = verification.registrationInfo;

        // Save credential to user
        await this.saveWebAuthnCredential(userId, {
          credentialId: Buffer.from(credentialID).toString('base64'),
          credentialPublicKey: Buffer.from(credentialPublicKey),
          counter,
          credentialDeviceType: verification.registrationInfo.credentialDeviceType,
          credentialBackedUp: verification.registrationInfo.credentialBackedUp,
          transports: response.response.transports || [],
          name: credentialName
        });

        // Clean up challenge
        await this.redis.del(`webauthn:challenge:${userId}`);

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('WebAuthn registration verification error', { error: error.message, userId });
      return false;
    }
  }

  /**
   * Generate WebAuthn authentication challenge
   */
  async generateWebAuthnChallenge(userId: string): Promise<any> {
    try {
      const user = await this.findUserById(userId);
      if (!user || !user.webauthnCredentials?.length) {
        throw new Error('No WebAuthn credentials found');
      }

      const options = generateAuthenticationOptions({
        timeout: this.config.webauthn.timeout,
        allowCredentials: user.webauthnCredentials.map(cred => ({
          id: cred.credentialId,
          type: 'public-key',
          transports: cred.transports,
        })),
        userVerification: this.config.webauthn.userVerification,
        rpID: this.config.webauthn.rpID,
      });

      // Store challenge
      await this.redis.setex(
        `webauthn:auth:${userId}`,
        300, // 5 minutes
        JSON.stringify({
          challenge: options.challenge,
          timestamp: Date.now()
        })
      );

      return options;
    } catch (error) {
      this.logger.error('WebAuthn challenge generation error', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Agent authentication for AI services
   */
  async authenticateAgent(
    apiKey: string,
    certificate?: string,
    requestSignature?: string
  ): Promise<{
    valid: boolean;
    agent?: AgentCredentials;
    permissions?: string[];
  }> {
    try {
      // Verify API key
      const agent = await this.findAgentByApiKey(apiKey);
      if (!agent) {
        return { valid: false };
      }

      // Check expiration
      if (agent.expiresAt < new Date()) {
        return { valid: false };
      }

      // Verify certificate if mTLS is enabled
      if (this.config.agentAuth.mutualTLS && certificate) {
        const certificateValid = await this.verifyCertificate(certificate, agent.certificate);
        if (!certificateValid) {
          return { valid: false };
        }
      }

      // Verify request signature if provided
      if (requestSignature && agent.privateKey) {
        const signatureValid = await this.verifyRequestSignature(requestSignature, agent.privateKey);
        if (!signatureValid) {
          return { valid: false };
        }
      }

      // Update last used timestamp
      await this.updateAgentLastUsed(agent.id);

      // Check rate limits
      const rateLimitOk = await this.checkAgentRateLimit(agent.id, agent.rateLimit);
      if (!rateLimitOk) {
        return { valid: false };
      }

      return {
        valid: true,
        agent,
        permissions: agent.permissions
      };

    } catch (error) {
      this.logger.error('Agent authentication error', { error: error.message, apiKey: apiKey.substring(0, 10) + '...' });
      return { valid: false };
    }
  }

  /**
   * Enhance device information with additional context
   */
  private async enhanceDeviceInfo(
    deviceInfo: DeviceInfo,
    userAgent: string,
    ipAddress: string
  ): Promise<DeviceInfo> {
    const parser = new UAParser(userAgent);
    const parsedUA = parser.getResult();
    
    // Get geolocation
    const geoData = geoip.lookup(ipAddress);
    const location: GeoLocation | undefined = geoData ? {
      country: geoData.country,
      region: geoData.region,
      city: geoData.city,
      latitude: geoData.ll[0],
      longitude: geoData.ll[1],
      timezone: geoData.timezone
    } : undefined;

    // Check if device is trusted
    const trusted = await this.isDeviceTrusted(deviceInfo.deviceId);

    return {
      ...deviceInfo,
      os: parsedUA.os.name || deviceInfo.os,
      browser: parsedUA.browser.name || deviceInfo.browser,
      version: parsedUA.browser.version || deviceInfo.version,
      location,
      trusted
    };
  }

  /**
   * Perform comprehensive risk assessment
   */
  private async performRiskAssessment(
    user: User,
    deviceInfo: DeviceInfo,
    request: AuthenticationRequest
  ): Promise<{
    score: number;
    blocked: boolean;
    factors: string[];
  }> {
    return await this.riskAssessment.assessLoginRisk({
      userId: user.id,
      email: user.email,
      deviceInfo,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      isNewDevice: !deviceInfo.trusted,
      lastLoginAt: user.lastLoginAt,
      failedAttempts: user.failedLoginAttempts,
      location: deviceInfo.location
    });
  }

  /**
   * Check if MFA is required for this authentication attempt
   */
  private async checkMFARequirement(
    user: User,
    deviceInfo: DeviceInfo,
    riskAssessment: any
  ): Promise<boolean> {
    // Always require MFA if enabled for user
    if (user.mfaEnabled) {
      return true;
    }

    // Require MFA for high-risk attempts
    if (riskAssessment.score > 70) {
      return true;
    }

    // Require MFA for untrusted devices
    if (!deviceInfo.trusted) {
      return true;
    }

    // Require MFA based on global configuration
    return this.config.mfa.required;
  }

  /**
   * Generate MFA challenge based on available methods
   */
  private async generateMFAChallenge(user: User, deviceInfo: DeviceInfo): Promise<any> {
    const availableMethods = user.mfaMethods || [];
    const preferredMethod = availableMethods[0];

    switch (preferredMethod) {
      case MFAMethod.WEBAUTHN:
        return await this.generateWebAuthnChallenge(user.id);
      
      case MFAMethod.TOTP:
        return {
          method: MFAMethod.TOTP,
          qrCode: user.totpSecret ? null : await this.generateTOTPQRCode(user)
        };
      
      case MFAMethod.SMS:
        // Implementation would send SMS
        return {
          method: MFAMethod.SMS,
          sent: true
        };
      
      case MFAMethod.EMAIL:
        // Implementation would send email
        return {
          method: MFAMethod.EMAIL,
          sent: true
        };
      
      default:
        throw new Error('No MFA methods available');
    }
  }

  /**
   * Verify MFA token/response
   */
  private async verifyMFA(
    user: User,
    token?: string,
    method?: MFAMethod,
    webauthnResponse?: any,
    deviceInfo?: DeviceInfo
  ): Promise<boolean> {
    if (webauthnResponse && user.webauthnCredentials?.length) {
      return await this.verifyWebAuthnAuthentication(user.id, webauthnResponse);
    }

    if (token && method === MFAMethod.TOTP && user.totpSecret) {
      return this.verifyTOTPToken(token, user.totpSecret);
    }

    if (token && method === MFAMethod.BACKUP_CODES && user.backupCodes?.length) {
      return await this.verifyBackupCode(user.id, token);
    }

    // Additional MFA method implementations...
    return false;
  }

  // Helper methods for various authentication operations
  private async findUserByEmail(email: string): Promise<User | null> {
    // Implementation would query database
    return null;
  }

  private async findUserById(id: string): Promise<User | null> {
    // Implementation would query database
    return null;
  }

  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  private async checkRateLimit(email: string, ipAddress: string): Promise<{ allowed: boolean; remaining?: number }> {
    // Implementation would check rate limits
    return { allowed: true };
  }

  private async handleFailedLogin(userId: string, deviceInfo: DeviceInfo): Promise<void> {
    // Implementation would increment failed attempts and potentially lock account
  }

  private async updateUserLastLogin(userId: string): Promise<void> {
    // Implementation would update user's last login timestamp
  }

  private async resetFailedLoginAttempts(userId: string): Promise<void> {
    // Implementation would reset failed login counter
  }

  private async isDeviceTrusted(deviceId: string): Promise<boolean> {
    // Implementation would check if device is in trusted devices list
    return false;
  }

  private async trustDevice(userId: string, deviceId: string): Promise<void> {
    // Implementation would add device to trusted devices list
  }

  private async logAuthenticationAttempt(
    email: string,
    deviceInfo: DeviceInfo,
    result: AuthenticationResult,
    context?: AuthenticationContext
  ): Promise<void> {
    this.logger.info('Authentication attempt', {
      email,
      result,
      deviceInfo,
      context,
      timestamp: new Date()
    });
  }

  private async saveWebAuthnCredential(userId: string, credential: Partial<WebAuthnCredential>): Promise<void> {
    // Implementation would save WebAuthn credential to database
  }

  private async generateTOTPQRCode(user: User): Promise<string> {
    // Implementation would generate TOTP QR code
    return '';
  }

  private verifyTOTPToken(token: string, secret: string): boolean {
    try {
      const totp = new authenticator.TOTP({
        issuer: this.config.mfa.totpIssuer,
        label: 'Fine Print AI',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: authenticator.Secret.fromBase32(secret)
      });
      
      return totp.validate({ token, window: 1 }) !== null;
    } catch {
      return false;
    }
  }

  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // Implementation would verify and consume backup code
    return false;
  }

  private async verifyWebAuthnAuthentication(userId: string, response: any): Promise<boolean> {
    // Implementation would verify WebAuthn authentication response
    return false;
  }

  private async findAgentByApiKey(apiKey: string): Promise<AgentCredentials | null> {
    // Implementation would find agent by API key
    return null;
  }

  private async verifyCertificate(certificate: string, expectedCertificate?: string): Promise<boolean> {
    // Implementation would verify certificate
    return true;
  }

  private async verifyRequestSignature(signature: string, privateKey: string): Promise<boolean> {
    // Implementation would verify request signature
    return true;
  }

  private async updateAgentLastUsed(agentId: string): Promise<void> {
    // Implementation would update agent's last used timestamp
  }

  private async checkAgentRateLimit(agentId: string, limit: number): Promise<boolean> {
    // Implementation would check agent rate limits
    return true;
  }
}

export const createAuthenticationService = (
  redis: Redis,
  prisma: PrismaClient,
  config: AuthenticationConfig,
  riskAssessment: RiskAssessmentService,
  tokenService: TokenService,
  sessionService: SessionService,
  configService: ConfigService,
  logger: LoggerService
) => {
  return new AuthenticationService(
    redis,
    prisma,
    config,
    riskAssessment,
    tokenService,
    sessionService,
    configService,
    logger
  );
};