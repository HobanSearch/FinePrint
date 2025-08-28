// Multi-Factor Authentication (MFA) Implementation
// Supports TOTP, SMS, and Email-based 2FA

import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import { SecurityError } from '../index';

export interface MFASetupRequest {
  userId: string;
  type: MFAType;
  phoneNumber?: string;
  email?: string;
}

export interface MFAVerifyRequest {
  userId: string;
  token: string;
  type: MFAType;
  deviceId?: string;
  trustDevice?: boolean;
}

export enum MFAType {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email',
  BACKUP_CODES = 'backup_codes'
}

export interface MFASecret {
  secret: string;
  qrCodeUrl?: string;
  backupCodes?: string[];
}

export interface TrustedDevice {
  deviceId: string;
  deviceName: string;
  createdAt: Date;
  lastUsedAt: Date;
  ipAddress: string;
  userAgent: string;
}

export class MFAService {
  private readonly appName = 'Fine Print AI';
  private readonly issuer = 'fineprintai.com';

  /**
   * Set up TOTP-based MFA for a user
   */
  async setupTOTP(userId: string, email: string): Promise<MFASecret> {
    try {
      // Generate secret
      const secret = authenticator.generateSecret();
      
      // Create service name
      const service = `${this.appName} (${email})`;
      
      // Generate TOTP URL
      const otpAuthUrl = authenticator.keyuri(email, this.issuer, secret);
      
      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(otpAuthUrl);
      
      // Generate backup codes
      const backupCodes = this.generateBackupCodes();
      
      return {
        secret,
        qrCodeUrl,
        backupCodes
      };
    } catch (error) {
      throw new SecurityError('Failed to setup TOTP MFA', 'MFA_SETUP_ERROR');
    }
  }

  /**
   * Verify TOTP token
   */
  verifyTOTP(token: string, secret: string, window: number = 1): boolean {
    try {
      // Remove spaces and ensure 6 digits
      const cleanToken = token.replace(/\s/g, '');
      if (!/^\d{6}$/.test(cleanToken)) {
        return false;
      }

      // Verify with time window
      return authenticator.verify({
        token: cleanToken,
        secret,
        encoding: 'base32',
        window
      });
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate backup codes
   */
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric code
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(code: string, validCodes: string[]): boolean {
    const cleanCode = code.replace(/\s/g, '').toUpperCase();
    return validCodes.includes(cleanCode);
  }

  /**
   * Generate SMS token
   */
  generateSMSToken(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Verify SMS/Email token with expiration
   */
  verifySMSEmailToken(
    token: string, 
    storedToken: string, 
    createdAt: Date, 
    expirationMinutes: number = 5
  ): boolean {
    // Check expiration
    const now = new Date();
    const expirationTime = new Date(createdAt.getTime() + expirationMinutes * 60 * 1000);
    if (now > expirationTime) {
      return false;
    }

    // Verify token
    return token === storedToken;
  }

  /**
   * Generate device fingerprint
   */
  generateDeviceFingerprint(userAgent: string, ipAddress: string): string {
    const data = `${userAgent}|${ipAddress}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create trusted device
   */
  createTrustedDevice(
    userAgent: string,
    ipAddress: string,
    deviceName?: string
  ): TrustedDevice {
    const deviceId = this.generateDeviceFingerprint(userAgent, ipAddress);
    
    return {
      deviceId,
      deviceName: deviceName || this.parseDeviceName(userAgent),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      ipAddress,
      userAgent
    };
  }

  /**
   * Parse device name from User-Agent
   */
  private parseDeviceName(userAgent: string): string {
    const UAParser = require('ua-parser-js');
    const parser = new UAParser(userAgent);
    const browser = parser.getBrowser();
    const os = parser.getOS();
    
    return `${browser.name || 'Unknown'} on ${os.name || 'Unknown'}`;
  }

  /**
   * Validate MFA requirement based on risk factors
   */
  shouldRequireMFA(context: {
    userId: string;
    ipAddress: string;
    userAgent: string;
    lastLoginAt?: Date;
    isNewDevice: boolean;
    isHighRiskAction: boolean;
    suspiciousActivity: boolean;
  }): boolean {
    // Always require MFA for high-risk actions
    if (context.isHighRiskAction) {
      return true;
    }

    // Require MFA for suspicious activity
    if (context.suspiciousActivity) {
      return true;
    }

    // Require MFA for new devices
    if (context.isNewDevice) {
      return true;
    }

    // Require MFA if not logged in recently
    if (context.lastLoginAt) {
      const daysSinceLastLogin = (Date.now() - context.lastLoginAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastLogin > 7) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate recovery codes for account recovery
   */
  generateRecoveryCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      // Generate 16-character recovery code
      const code = crypto.randomBytes(8).toString('hex').toUpperCase();
      const formatted = code.match(/.{1,4}/g)?.join('-') || code;
      codes.push(formatted);
    }
    return codes;
  }

  /**
   * Encrypt MFA secret for storage
   */
  encryptSecret(secret: string, masterKey: string): string {
    const cipher = crypto.createCipher('aes-256-gcm', masterKey);
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypt MFA secret from storage
   */
  decryptSecret(encryptedSecret: string, masterKey: string): string {
    const decipher = crypto.createDecipher('aes-256-gcm', masterKey);
    let decrypted = decipher.update(encryptedSecret, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Rate limiting for MFA attempts
   */
  checkMFARateLimit(userId: string, attempts: number, windowMinutes: number = 15): boolean {
    const maxAttempts = 5;
    return attempts < maxAttempts;
  }

  /**
   * Generate time-based challenge for additional security
   */
  generateTimeBasedChallenge(): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const challenge = crypto.createHmac('sha256', process.env.MFA_CHALLENGE_SECRET || 'default-secret')
      .update(timestamp.toString())
      .digest('hex')
      .substring(0, 8);
    return challenge.toUpperCase();
  }
}

// MFA storage interface for database operations
export interface MFARecord {
  userId: string;
  type: MFAType;
  secret?: string; // Encrypted
  phoneNumber?: string;
  email?: string;
  backupCodes?: string[]; // Hashed
  isEnabled: boolean;
  createdAt: Date;
  lastUsedAt?: Date;
  failedAttempts: number;
  lockedUntil?: Date;
}

export interface MFAAttempt {
  userId: string;
  type: MFAType;
  success: boolean;
  ipAddress: string;
  userAgent: string;
  deviceId?: string;
  createdAt: Date;
}

// Export singleton instance
export const mfaService = new MFAService();