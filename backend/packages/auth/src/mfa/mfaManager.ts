import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { Twilio } from 'twilio';
import * as nodemailer from 'nodemailer';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  MFAConfig,
  MFAMethod,
  MFAChallenge,
  MFAVerificationResult,
  MFASetupRequest,
  MFASetupResponse,
  BackupCode,
  MFAStats
} from './types';

const logger = createServiceLogger('mfa-manager');

export class MFAManager {
  private cache: CacheManager;
  private config: MFAConfig;
  private twilioClient?: Twilio;
  private emailTransporter?: nodemailer.Transporter;

  constructor(cache: CacheManager, config: MFAConfig) {
    this.cache = cache;
    this.config = config;
    this.initializeProviders();
  }

  /**
   * Initialize external providers (Twilio, email)
   */
  private initializeProviders(): void {
    // Initialize Twilio for SMS
    if (this.config.sms.enabled && this.config.sms.provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      
      if (accountSid && authToken) {
        this.twilioClient = new Twilio(accountSid, authToken);
        logger.info('Twilio SMS provider initialized');
      } else {
        logger.warn('Twilio credentials not found, SMS MFA disabled');
      }
    }

    // Initialize email transporter
    if (this.config.email.enabled) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      
      logger.info('Email MFA provider initialized');
    }
  }

  /**
   * Setup MFA method for user
   */
  async setupMFAMethod(
    userId: string,
    request: MFASetupRequest
  ): Promise<MFASetupResponse> {
    try {
      const methodId = crypto.randomUUID();
      let method: MFAMethod;
      let setupData: MFASetupResponse['setupData'] = {};

      switch (request.type) {
        case 'totp':
          method = await this.setupTOTP(userId, methodId);
          setupData.secret = method.metadata.secret;
          setupData.qrCode = method.metadata.qrCode;
          break;

        case 'sms':
          if (!request.phoneNumber) {
            throw new Error('Phone number required for SMS MFA');
          }
          method = await this.setupSMS(userId, methodId, request.phoneNumber);
          break;

        case 'email':
          if (!request.email) {
            throw new Error('Email address required for email MFA');
          }
          method = await this.setupEmail(userId, methodId, request.email);
          break;

        default:
          throw new Error('Unsupported MFA method type');
      }

      // Generate backup codes if enabled
      if (this.config.backup.enabled && request.type === 'totp') {
        setupData.backupCodes = await this.generateBackupCodes(userId);
      }

      // Store method
      await this.cache.set(`mfa-method:${methodId}`, method, 0); // No expiry

      // Add to user's methods
      await this.cache.sadd(`user-mfa-methods:${userId}`, methodId);

      logger.info('MFA method setup initiated', {
        userId: userId.substring(0, 8) + '...',
        type: request.type,
        methodId: methodId.substring(0, 8) + '...'
      });

      return { method, setupData };
    } catch (error) {
      logger.error('MFA method setup failed', { error, userId, type: request.type });
      throw new Error(`MFA setup failed: ${error.message}`);
    }
  }

  /**
   * Verify MFA method during setup
   */
  async verifyMFASetup(
    userId: string,
    methodId: string,
    code: string
  ): Promise<boolean> {
    try {
      const method = await this.cache.get<MFAMethod>(`mfa-method:${methodId}`);
      
      if (!method || method.userId !== userId) {
        return false;
      }

      let verified = false;

      switch (method.type) {
        case 'totp':
          if (method.metadata.secret) {
            verified = speakeasy.totp.verify({
              secret: method.metadata.secret,
              encoding: 'base32',
              token: code,
              window: this.config.totp.window
            });
          }
          break;

        case 'sms':
        case 'email':
          // For setup verification, we would have sent a code
          const storedCode = await this.cache.get(`mfa-setup-code:${methodId}`);
          verified = storedCode === code;
          break;
      }

      if (verified) {
        method.verified = true;
        method.enabled = true;
        await this.cache.set(`mfa-method:${methodId}`, method, 0);
        
        logger.info('MFA method verified and enabled', {
          userId: userId.substring(0, 8) + '...',
          methodId: methodId.substring(0, 8) + '...',
          type: method.type
        });
      }

      return verified;
    } catch (error) {
      logger.error('MFA setup verification failed', { error, userId, methodId });
      return false;
    }
  }

  /**
   * Create MFA challenge
   */
  async createMFAChallenge(
    userId: string,
    sessionId: string,
    methodId?: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MFAChallenge | null> {
    try {
      // Check if user is locked out
      const lockout = await this.cache.get(`mfa-lockout:${userId}`);
      if (lockout && new Date(lockout.until) > new Date()) {
        logger.warn('MFA challenge blocked due to lockout', {
          userId: userId.substring(0, 8) + '...',
          lockoutUntil: lockout.until
        });
        return null;
      }

      // Get user's MFA methods
      const methods = await this.getUserMFAMethods(userId);
      const enabledMethods = methods.filter(m => m.enabled && m.verified);

      if (enabledMethods.length === 0) {
        logger.warn('No enabled MFA methods for user', {
          userId: userId.substring(0, 8) + '...'
        });
        return null;
      }

      // Select method (use specified method or pick the first enabled one)
      let selectedMethod: MFAMethod;
      if (methodId) {
        selectedMethod = enabledMethods.find(m => m.id === methodId) || enabledMethods[0];
      } else {
        selectedMethod = enabledMethods[0];
      }

      const challengeId = crypto.randomUUID();
      const challenge: MFAChallenge = {
        id: challengeId,
        userId,
        sessionId,
        type: selectedMethod.type,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (selectedMethod.type === 'totp' ? 300000 : this.getCodeExpiry(selectedMethod.type) * 1000)),
        verified: false,
        attempts: 0,
        maxAttempts: this.config.enforcement.maxFailedAttempts,
        ipAddress,
        userAgent
      };

      // Send challenge code for SMS/email
      if (selectedMethod.type === 'sms' || selectedMethod.type === 'email') {
        const code = this.generateMFACode(this.getCodeLength(selectedMethod.type));
        challenge.code = code;
        
        if (selectedMethod.type === 'sms') {
          await this.sendSMSCode(selectedMethod.metadata.phoneNumber!, code);
        } else {
          await this.sendEmailCode(selectedMethod.metadata.email!, code);
        }
      }

      // Store challenge
      await this.cache.set(
        `mfa-challenge:${challengeId}`, 
        challenge, 
        Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)
      );

      logger.info('MFA challenge created', {
        userId: userId.substring(0, 8) + '...',
        challengeId: challengeId.substring(0, 8) + '...',
        type: selectedMethod.type
      });

      return challenge;
    } catch (error) {
      logger.error('Failed to create MFA challenge', { error, userId });
      return null;
    }
  }

  /**
   * Verify MFA challenge
   */
  async verifyMFAChallenge(
    challengeId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<MFAVerificationResult> {
    try {
      const challenge = await this.cache.get<MFAChallenge>(`mfa-challenge:${challengeId}`);
      
      if (!challenge) {
        return { success: false, error: 'Invalid challenge' };
      }

      if (challenge.verified) {
        return { success: false, error: 'Challenge already verified' };
      }

      if (challenge.expiresAt < new Date()) {
        return { success: false, error: 'Challenge expired' };
      }

      if (challenge.attempts >= challenge.maxAttempts) {
        await this.lockoutUser(challenge.userId, 'max-attempts-exceeded');
        return { 
          success: false, 
          error: 'Too many failed attempts',
          lockoutUntil: new Date(Date.now() + (this.config.enforcement.lockoutDuration * 1000))
        };
      }

      // Increment attempt counter
      challenge.attempts++;
      await this.cache.set(
        `mfa-challenge:${challengeId}`, 
        challenge, 
        Math.floor((challenge.expiresAt.getTime() - Date.now()) / 1000)
      );

      let verified = false;
      let method: MFAMethod | undefined;

      // Get the method used for this challenge
      const methods = await this.getUserMFAMethods(challenge.userId);
      method = methods.find(m => m.type === challenge.type && m.enabled && m.verified);

      if (!method) {
        return { success: false, error: 'MFA method not found' };
      }

      // Verify code based on method type
      switch (challenge.type) {
        case 'totp':
          if (method.metadata.secret) {
            verified = speakeasy.totp.verify({
              secret: method.metadata.secret,
              encoding: 'base32',
              token: code,
              window: this.config.totp.window
            });
          }
          break;

        case 'sms':
        case 'email':
          verified = challenge.code === code;
          break;

        case 'backup':
          verified = await this.verifyBackupCode(challenge.userId, code);
          break;
      }

      if (verified) {
        challenge.verified = true;
        method.lastUsedAt = new Date();
        
        // Update challenge and method
        await Promise.all([
          this.cache.set(`mfa-challenge:${challengeId}`, challenge, 300), // Keep for 5 minutes after verification
          this.cache.set(`mfa-method:${method.id}`, method, 0)
        ]);

        logger.info('MFA challenge verified successfully', {
          userId: challenge.userId.substring(0, 8) + '...',
          challengeId: challengeId.substring(0, 8) + '...',
          type: challenge.type
        });

        return { 
          success: true, 
          challengeId,
          method 
        };
      } else {
        logger.warn('MFA challenge verification failed', {
          userId: challenge.userId.substring(0, 8) + '...',
          challengeId: challengeId.substring(0, 8) + '...',
          attempts: challenge.attempts,
          remainingAttempts: challenge.maxAttempts - challenge.attempts
        });

        return { 
          success: false, 
          error: 'Invalid code',
          remainingAttempts: challenge.maxAttempts - challenge.attempts
        };
      }
    } catch (error) {
      logger.error('MFA challenge verification failed', { error, challengeId });
      return { success: false, error: 'Verification failed' };
    }
  }

  /**
   * Get user's MFA methods
   */
  async getUserMFAMethods(userId: string): Promise<MFAMethod[]> {
    try {
      const methodIds = await this.cache.smembers(`user-mfa-methods:${userId}`);
      const methods: MFAMethod[] = [];

      for (const methodId of methodIds) {
        const method = await this.cache.get<MFAMethod>(`mfa-method:${methodId}`);
        if (method) {
          // Don't return sensitive data
          const sanitizedMethod = { ...method };
          if (sanitizedMethod.metadata.secret) {
            delete sanitizedMethod.metadata.secret;
          }
          if (sanitizedMethod.metadata.codes) {
            delete sanitizedMethod.metadata.codes;
          }
          methods.push(sanitizedMethod);
        }
      }

      return methods.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    } catch (error) {
      logger.error('Failed to get user MFA methods', { error, userId });
      return [];
    }
  }

  /**
   * Disable MFA method
   */
  async disableMFAMethod(userId: string, methodId: string): Promise<boolean> {
    try {
      const method = await this.cache.get<MFAMethod>(`mfa-method:${methodId}`);
      
      if (!method || method.userId !== userId) {
        return false;
      }

      method.enabled = false;
      await this.cache.set(`mfa-method:${methodId}`, method, 0);

      logger.info('MFA method disabled', {
        userId: userId.substring(0, 8) + '...',
        methodId: methodId.substring(0, 8) + '...',
        type: method.type
      });

      return true;
    } catch (error) {
      logger.error('Failed to disable MFA method', { error, userId, methodId });
      return false;
    }
  }

  /**
   * Remove MFA method
   */
  async removeMFAMethod(userId: string, methodId: string): Promise<boolean> {
    try {
      const method = await this.cache.get<MFAMethod>(`mfa-method:${methodId}`);
      
      if (!method || method.userId !== userId) {
        return false;
      }

      // Remove method
      await this.cache.del(`mfa-method:${methodId}`);
      await this.cache.srem(`user-mfa-methods:${userId}`, methodId);

      logger.info('MFA method removed', {
        userId: userId.substring(0, 8) + '...',
        methodId: methodId.substring(0, 8) + '...',
        type: method.type
      });

      return true;
    } catch (error) {
      logger.error('Failed to remove MFA method', { error, userId, methodId });
      return false;
    }
  }

  /**
   * Check if MFA is required for user
   */
  async isMFARequired(userId: string, context: 'login' | 'sensitive-operation' | 'new-device'): Promise<boolean> {
    try {
      const methods = await this.getUserMFAMethods(userId);
      const hasEnabledMFA = methods.some(m => m.enabled && m.verified);

      if (!hasEnabledMFA) {
        return false;
      }

      switch (context) {
        case 'new-device':
          return this.config.enforcement.requireForNewDevices;
        case 'sensitive-operation':
          return this.config.enforcement.requireForSensitiveOperations;
        case 'login':
        default:
          return true;
      }
    } catch (error) {
      logger.error('Failed to check MFA requirement', { error, userId, context });
      return false;
    }
  }

  /**
   * Setup TOTP method
   */
  private async setupTOTP(userId: string, methodId: string): Promise<MFAMethod> {
    const secret = speakeasy.generateSecret({
      name: `FinePrint AI (${userId.substring(0, 8)})`,
      issuer: this.config.totp.issuer,
      length: 32
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url!);

    return {
      id: methodId,
      userId,
      type: 'totp',
      enabled: false,
      verified: false,
      createdAt: new Date(),
      metadata: {
        secret: secret.base32,
        qrCode: qrCodeUrl
      }
    };
  }

  /**
   * Setup SMS method
   */
  private async setupSMS(userId: string, methodId: string, phoneNumber: string): Promise<MFAMethod> {
    // Parse phone number (simple implementation)
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const countryCode = cleanPhone.startsWith('1') ? '+1' : '+1'; // Default to US

    // Send verification code
    const code = this.generateMFACode(this.config.sms.codeLength);
    await this.cache.set(`mfa-setup-code:${methodId}`, code, this.config.sms.codeExpiry);
    
    if (this.twilioClient) {
      await this.sendSMSCode(phoneNumber, code);
    }

    return {
      id: methodId,
      userId,
      type: 'sms',
      enabled: false,
      verified: false,
      createdAt: new Date(),
      metadata: {
        phoneNumber,
        countryCode
      }
    };
  }

  /**
   * Setup email method
   */
  private async setupEmail(userId: string, methodId: string, email: string): Promise<MFAMethod> {
    // Send verification code
    const code = this.generateMFACode(this.config.email.codeLength);
    await this.cache.set(`mfa-setup-code:${methodId}`, code, this.config.email.codeExpiry);
    
    await this.sendEmailCode(email, code);

    return {
      id: methodId,
      userId,
      type: 'email',
      enabled: false,
      verified: false,
      createdAt: new Date(),
      metadata: {
        email
      }
    };
  }

  /**
   * Generate backup codes
   */
  private async generateBackupCodes(userId: string): Promise<string[]> {
    const codes: BackupCode[] = [];
    const codeStrings: string[] = [];

    for (let i = 0; i < this.config.backup.codeCount; i++) {
      const code = this.generateMFACode(this.config.backup.codeLength);
      codes.push({
        code,
        used: false
      });
      codeStrings.push(code);
    }

    // Store backup codes
    await this.cache.set(`backup-codes:${userId}`, codes, 0); // No expiry

    return codeStrings;
  }

  /**
   * Verify backup code
   */
  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const backupCodes = await this.cache.get<BackupCode[]>(`backup-codes:${userId}`);
      
      if (!backupCodes) {
        return false;
      }

      const matchingCode = backupCodes.find(bc => bc.code === code && !bc.used);
      
      if (matchingCode) {
        matchingCode.used = true;
        matchingCode.usedAt = new Date();
        
        await this.cache.set(`backup-codes:${userId}`, backupCodes, 0);
        
        logger.info('Backup code used', {
          userId: userId.substring(0, 8) + '...'
        });
        
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Failed to verify backup code', { error, userId });
      return false;
    }
  }

  /**
   * Send SMS code
   */
  private async sendSMSCode(phoneNumber: string, code: string): Promise<void> {
    if (!this.twilioClient) {
      throw new Error('SMS provider not configured');
    }

    try {
      await this.twilioClient.messages.create({
        body: `Your FinePrint AI verification code is: ${code}`,
        from: this.config.sms.from,
        to: phoneNumber
      });

      logger.info('SMS verification code sent', {
        phoneNumber: phoneNumber.substring(0, 5) + '***'
      });
    } catch (error) {
      logger.error('Failed to send SMS code', { error, phoneNumber });
      throw new Error('SMS delivery failed');
    }
  }

  /**
   * Send email code
   */
  private async sendEmailCode(email: string, code: string): Promise<void> {
    if (!this.emailTransporter) {
      throw new Error('Email provider not configured');
    }

    try {
      await this.emailTransporter.sendMail({
        from: this.config.email.from,
        to: email,
        subject: 'FinePrint AI - Verification Code',
        html: `
          <h2>FinePrint AI Verification</h2>
          <p>Your verification code is: <strong>${code}</strong></p>
          <p>This code will expire in ${Math.floor(this.config.email.codeExpiry / 60)} minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
        `
      });

      logger.info('Email verification code sent', {
        email: email.substring(0, 3) + '***'
      });
    } catch (error) {
      logger.error('Failed to send email code', { error, email });
      throw new Error('Email delivery failed');
    }
  }

  /**
   * Generate MFA code
   */
  private generateMFACode(length: number): string {
    const digits = '0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
      code += digits[crypto.randomInt(0, digits.length)];
    }
    
    return code;
  }

  /**
   * Get code length for method type
   */
  private getCodeLength(type: string): number {
    switch (type) {
      case 'sms':
        return this.config.sms.codeLength;
      case 'email':
        return this.config.email.codeLength;
      case 'backup':
        return this.config.backup.codeLength;
      default:
        return 6;
    }
  }

  /**
   * Get code expiry for method type
   */
  private getCodeExpiry(type: string): number {
    switch (type) {
      case 'sms':
        return this.config.sms.codeExpiry;
      case 'email':
        return this.config.email.codeExpiry;
      default:
        return 300; // 5 minutes
    }
  }

  /**
   * Lockout user after too many failed attempts
   */
  private async lockoutUser(userId: string, reason: string): Promise<void> {
    try {
      const lockoutUntil = new Date(Date.now() + (this.config.enforcement.lockoutDuration * 1000));
      
      await this.cache.set(
        `mfa-lockout:${userId}`,
        { until: lockoutUntil, reason },
        this.config.enforcement.lockoutDuration
      );

      logger.warn('User locked out from MFA', {
        userId: userId.substring(0, 8) + '...',
        reason,
        until: lockoutUntil
      });
    } catch (error) {
      logger.error('Failed to lockout user', { error, userId });
    }
  }

  /**
   * Get MFA statistics
   */
  async getMFAStats(): Promise<MFAStats> {
    try {
      const userMethodKeys = await this.cache.keys('user-mfa-methods:*');
      const methodKeys = await this.cache.keys('mfa-method:*');
      
      let totalUsers = userMethodKeys.length;
      let enabledUsers = 0;
      const methodDistribution: Record<string, number> = {};
      
      for (const key of methodKeys) {
        const method = await this.cache.get<MFAMethod>(key);
        if (method && method.enabled && method.verified) {
          methodDistribution[method.type] = (methodDistribution[method.type] || 0) + 1;
          
          // Count unique enabled users
          const userHasMFA = await this.cache.sismember(`user-mfa-methods:${method.userId}`, method.id);
          if (userHasMFA) {
            enabledUsers++;
          }
        }
      }

      // Get verification stats from audit logs
      const recentChallenges = await this.cache.lrange('audit:mfa-challenges', 0, 999);
      const verificationAttempts = recentChallenges.length;
      const successfulVerifications = recentChallenges.filter(c => c.success).length;
      const failedVerifications = verificationAttempts - successfulVerifications;

      // Count locked out users
      const lockoutKeys = await this.cache.keys('mfa-lockout:*');
      const lockedOutUsers = lockoutKeys.length;

      return {
        totalUsers,
        enabledUsers,
        methodDistribution,
        verificationAttempts,
        successfulVerifications,
        failedVerifications,
        lockedOutUsers
      };
    } catch (error) {
      logger.error('Failed to get MFA stats', { error });
      return {
        totalUsers: 0,
        enabledUsers: 0,
        methodDistribution: {},
        verificationAttempts: 0,
        successfulVerifications: 0,
        failedVerifications: 0,
        lockedOutUsers: 0
      };
    }
  }

  /**
   * Cleanup expired challenges and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting MFA maintenance');

      // Clean up expired challenges
      const challengeKeys = await this.cache.keys('mfa-challenge:*');
      let cleanedChallenges = 0;

      for (const key of challengeKeys) {
        const challenge = await this.cache.get<MFAChallenge>(key);
        if (challenge && challenge.expiresAt < new Date()) {
          await this.cache.del(key);
          cleanedChallenges++;
        }
      }

      // Clean up expired setup codes
      const setupCodeKeys = await this.cache.keys('mfa-setup-code:*');
      let cleanedSetupCodes = 0;

      for (const key of setupCodeKeys) {
        const ttl = await this.cache.ttl(key);
        if (ttl === -1 || ttl === 0) { // No TTL or expired
          await this.cache.del(key);
          cleanedSetupCodes++;
        }
      }

      logger.info('MFA maintenance completed', {
        cleanedChallenges,
        cleanedSetupCodes
      });
    } catch (error) {
      logger.error('MFA maintenance failed', { error });
    }
  }
}