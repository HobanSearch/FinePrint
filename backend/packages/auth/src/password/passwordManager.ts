import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as zxcvbn from 'zxcvbn';
import { CacheManager } from '@fineprintai/cache';
import { createServiceLogger } from '@fineprintai/logger';
import {
  PasswordConfig,
  PasswordValidationResult,
  PasswordHashResult,
  PasswordHistoryEntry,
  PasswordResetToken,
  PasswordChangeEvent
} from './types';

const logger = createServiceLogger('password-manager');

// Common passwords list (subset - in production, use a comprehensive list)
const COMMON_PASSWORDS = new Set([
  'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
  'admin', 'letmein', 'welcome', 'monkey', 'password1', 'dragon',
  'master', 'hello', 'freedom', 'whatever', 'qazwsx', 'trustno1'
]);

export class PasswordManager {
  private cache: CacheManager;
  private config: PasswordConfig;

  constructor(cache: CacheManager, config: PasswordConfig) {
    this.cache = cache;
    this.config = config;
  }

  /**
   * Hash password using bcrypt with configured salt rounds
   */
  async hashPassword(password: string): Promise<PasswordHashResult> {
    try {
      const salt = await bcrypt.genSalt(this.config.saltRounds);
      const hash = await bcrypt.hash(password, salt);

      const result: PasswordHashResult = {
        hash,
        salt,
        algorithm: 'bcrypt',
        rounds: this.config.saltRounds,
        createdAt: new Date()
      };

      logger.debug('Password hashed successfully', { 
        rounds: this.config.saltRounds 
      });

      return result;
    } catch (error) {
      logger.error('Password hashing failed', { error });
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const isValid = await bcrypt.compare(password, hash);
      
      logger.debug('Password verification completed', { 
        valid: isValid 
      });

      return isValid;
    } catch (error) {
      logger.error('Password verification failed', { error });
      return false;
    }
  }

  /**
   * Validate password strength and requirements
   */
  async validatePassword(
    password: string, 
    userInfo?: { email?: string; name?: string; username?: string }
  ): Promise<PasswordValidationResult> {
    const result: PasswordValidationResult = {
      valid: true,
      score: 0,
      feedback: [],
      warnings: [],
      errors: []
    };

    try {
      // Length validation
      if (password.length < this.config.minLength) {
        result.valid = false;
        result.errors.push(`Password must be at least ${this.config.minLength} characters long`);
      }

      if (password.length > this.config.maxLength) {
        result.valid = false;
        result.errors.push(`Password must not exceed ${this.config.maxLength} characters`);
      }

      // Character requirements
      if (this.config.requireUppercase && !/[A-Z]/.test(password)) {
        result.valid = false;
        result.errors.push('Password must contain at least one uppercase letter');
      }

      if (this.config.requireLowercase && !/[a-z]/.test(password)) {
        result.valid = false;
        result.errors.push('Password must contain at least one lowercase letter');
      }

      if (this.config.requireNumbers && !/\d/.test(password)) {
        result.valid = false;
        result.errors.push('Password must contain at least one number');
      }

      if (this.config.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        result.valid = false;
        result.errors.push('Password must contain at least one special character');
      }

      // Common password check
      if (this.config.preventCommonPasswords && COMMON_PASSWORDS.has(password.toLowerCase())) {
        result.valid = false;
        result.errors.push('Password is too common, please choose a different one');
      }

      // User info in password check
      if (this.config.preventUserInfoInPassword && userInfo) {
        const lowerPassword = password.toLowerCase();
        
        if (userInfo.email && lowerPassword.includes(userInfo.email.split('@')[0].toLowerCase())) {
          result.valid = false;
          result.errors.push('Password cannot contain your email address');
        }

        if (userInfo.name && lowerPassword.includes(userInfo.name.toLowerCase())) {
          result.valid = false;
          result.errors.push('Password cannot contain your name');
        }

        if (userInfo.username && lowerPassword.includes(userInfo.username.toLowerCase())) {
          result.valid = false;
          result.errors.push('Password cannot contain your username');
        }
      }

      // Use zxcvbn for advanced strength analysis
      const userInputs = userInfo ? [
        userInfo.email?.split('@')[0] || '',
        userInfo.name || '',
        userInfo.username || ''
      ].filter(Boolean) : [];

      const strengthResult = zxcvbn(password, userInputs);
      result.score = strengthResult.score;

      // Add zxcvbn feedback
      if (strengthResult.feedback.warning) {
        result.warnings.push(strengthResult.feedback.warning);
      }

      result.feedback.push(...strengthResult.feedback.suggestions);

      // Adjust validity based on score
      if (strengthResult.score < 2) {
        result.valid = false;
        result.errors.push('Password is too weak, please choose a stronger password');
      } else if (strengthResult.score < 3) {
        result.warnings.push('Consider using a stronger password');
      }

      logger.debug('Password validation completed', { 
        valid: result.valid,
        score: result.score,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length
      });

      return result;
    } catch (error) {
      logger.error('Password validation failed', { error });
      return {
        valid: false,
        score: 0,
        feedback: [],
        warnings: [],
        errors: ['Password validation failed']
      };
    }
  }

  /**
   * Store password in history for preventing reuse
   */
  async storePasswordHistory(userId: string, passwordHash: PasswordHashResult): Promise<void> {
    try {
      const historyKey = `password-history:${userId}`;
      
      const historyEntry: PasswordHistoryEntry = {
        hash: passwordHash.hash,
        createdAt: passwordHash.createdAt,
        algorithm: passwordHash.algorithm,
        rounds: passwordHash.rounds
      };

      // Add to history
      await this.cache.lpush(historyKey, historyEntry);

      // Keep only the configured number of historical passwords
      const historyList = await this.cache.lrange(historyKey, 0, -1);
      if (historyList.length > this.config.passwordHistoryCount) {
        await this.cache.getRawClient().ltrim(
          `fpa:${historyKey}`, 
          0, 
          this.config.passwordHistoryCount - 1
        );
      }

      // Set expiration (passwords older than max age are automatically removed)
      const maxAgeSeconds = this.config.maxPasswordAge * 24 * 60 * 60;
      await this.cache.expire(historyKey, maxAgeSeconds);

      logger.debug('Password stored in history', { 
        userId: userId.substring(0, 8) + '...',
        historyCount: Math.min(historyList.length + 1, this.config.passwordHistoryCount)
      });
    } catch (error) {
      logger.error('Failed to store password history', { error, userId });
    }
  }

  /**
   * Check if password was used recently
   */
  async checkPasswordHistory(userId: string, password: string): Promise<boolean> {
    try {
      const historyKey = `password-history:${userId}`;
      const history = await this.cache.lrange(historyKey, 0, this.config.passwordHistoryCount - 1);

      for (const entry of history) {
        const historyEntry = entry as PasswordHistoryEntry;
        const isMatch = await bcrypt.compare(password, historyEntry.hash);
        
        if (isMatch) {
          logger.info('Password reuse detected', { 
            userId: userId.substring(0, 8) + '...',
            originalDate: historyEntry.createdAt
          });
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to check password history', { error, userId });
      return false;
    }
  }

  /**
   * Generate secure password reset token
   */
  async generatePasswordResetToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<string> {
    try {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      const resetToken: PasswordResetToken = {
        userId,
        token: tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        createdAt: new Date(),
        used: false,
        ipAddress,
        userAgent
      };

      // Store the hashed token
      await this.cache.set(
        `password-reset:${tokenHash}`, 
        resetToken, 
        30 * 60 // 30 minutes
      );

      // Also store by user ID for potential revocation
      await this.cache.set(
        `password-reset-user:${userId}`,
        { tokenHash, createdAt: resetToken.createdAt },
        30 * 60
      );

      logger.info('Password reset token generated', { 
        userId: userId.substring(0, 8) + '...',
        ipAddress
      });

      return token; // Return the original token (not the hash)
    } catch (error) {
      logger.error('Failed to generate password reset token', { error, userId });
      throw new Error('Password reset token generation failed');
    }
  }

  /**
   * Validate and consume password reset token
   */
  async validatePasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const resetToken = await this.cache.get<PasswordResetToken>(`password-reset:${tokenHash}`);

      if (!resetToken) {
        logger.warn('Invalid password reset token attempted', { 
          tokenHash: tokenHash.substring(0, 8) + '...'
        });
        return { valid: false };
      }

      if (resetToken.used) {
        logger.warn('Used password reset token attempted', { 
          userId: resetToken.userId.substring(0, 8) + '...',
          tokenHash: tokenHash.substring(0, 8) + '...'
        });
        return { valid: false };
      }

      if (resetToken.expiresAt < new Date()) {
        logger.warn('Expired password reset token attempted', { 
          userId: resetToken.userId.substring(0, 8) + '...',
          tokenHash: tokenHash.substring(0, 8) + '...'
        });
        return { valid: false };
      }

      // Mark token as used
      resetToken.used = true;
      await this.cache.set(`password-reset:${tokenHash}`, resetToken, 30 * 60);

      logger.info('Password reset token validated and consumed', { 
        userId: resetToken.userId.substring(0, 8) + '...'
      });

      return { valid: true, userId: resetToken.userId };
    } catch (error) {
      logger.error('Password reset token validation failed', { error });
      return { valid: false };
    }
  }

  /**
   * Revoke all password reset tokens for a user
   */
  async revokeUserPasswordResetTokens(userId: string): Promise<void> {
    try {
      const userTokenData = await this.cache.get(`password-reset-user:${userId}`);
      
      if (userTokenData) {
        await this.cache.del(`password-reset:${userTokenData.tokenHash}`);
        await this.cache.del(`password-reset-user:${userId}`);
        
        logger.info('Password reset tokens revoked for user', { 
          userId: userId.substring(0, 8) + '...'
        });
      }
    } catch (error) {
      logger.error('Failed to revoke password reset tokens', { error, userId });
    }
  }

  /**
   * Log password change event for audit purposes
   */
  async logPasswordChange(
    userId: string,
    reason: 'user-initiated' | 'admin-reset' | 'security-required' | 'expired',
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
    failureReason?: string
  ): Promise<void> {
    try {
      const event: PasswordChangeEvent = {
        userId,
        timestamp: new Date(),
        ipAddress,
        userAgent,
        reason,
        success,
        failureReason
      };

      // Store in audit log
      await this.cache.lpush('audit:password-changes', event);
      
      // Keep only last 1000 password change events
      await this.cache.getRawClient().ltrim('fpa:audit:password-changes', 0, 999);

      // Also store user-specific log
      await this.cache.lpush(`audit:password-changes:${userId}`, event);
      
      // Keep only last 50 events per user
      await this.cache.getRawClient().ltrim(`fpa:audit:password-changes:${userId}`, 0, 49);

      logger.info('Password change event logged', { 
        userId: userId.substring(0, 8) + '...',
        reason,
        success
      });
    } catch (error) {
      logger.error('Failed to log password change event', { error, userId });
    }
  }

  /**
   * Check if password needs to be changed due to age
   */
  async isPasswordExpired(userId: string, lastPasswordChange: Date): Promise<boolean> {
    try {
      const maxAgeMs = this.config.maxPasswordAge * 24 * 60 * 60 * 1000;
      const passwordAge = Date.now() - lastPasswordChange.getTime();
      
      const expired = passwordAge > maxAgeMs;
      
      if (expired) {
        logger.info('Password expired detected', { 
          userId: userId.substring(0, 8) + '...',
          ageInDays: Math.floor(passwordAge / (24 * 60 * 60 * 1000))
        });
      }

      return expired;
    } catch (error) {
      logger.error('Failed to check password expiration', { error, userId });
      return false;
    }
  }

  /**
   * Generate secure random password
   */
  generateSecurePassword(length: number = 16): string {
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let password = '';
    let chars = '';

    // Ensure at least one character from each required category
    if (this.config.requireUppercase) {
      password += uppercase[crypto.randomInt(0, uppercase.length)];
      chars += uppercase;
    }

    if (this.config.requireLowercase) {
      password += lowercase[crypto.randomInt(0, lowercase.length)];
      chars += lowercase;
    }

    if (this.config.requireNumbers) {
      password += numbers[crypto.randomInt(0, numbers.length)];
      chars += numbers;
    }

    if (this.config.requireSpecialChars) {
      password += symbols[crypto.randomInt(0, symbols.length)];
      chars += symbols;
    }

    // Fill the rest with random characters
    for (let i = password.length; i < length; i++) {
      password += chars[crypto.randomInt(0, chars.length)];
    }

    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

  /**
   * Get password statistics for monitoring
   */
  async getPasswordStats(): Promise<{
    totalPasswordChanges: number;
    recentPasswordChanges: number;
    activeResetTokens: number;
    expiredPasswords: number;
  }> {
    try {
      const [totalChanges, resetTokens] = await Promise.all([
        this.cache.lrange('audit:password-changes', 0, -1).then(events => events.length),
        this.cache.keys('password-reset:*').then(keys => keys.length)
      ]);

      // Count recent changes (last 24 hours)
      const recentEvents = await this.cache.lrange('audit:password-changes', 0, 99);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentChanges = recentEvents.filter(event => {
        const changeEvent = event as PasswordChangeEvent;
        return new Date(changeEvent.timestamp) > oneDayAgo;
      }).length;

      return {
        totalPasswordChanges: totalChanges,
        recentPasswordChanges: recentChanges,
        activeResetTokens: resetTokens,
        expiredPasswords: 0 // This would need user data to calculate
      };
    } catch (error) {
      logger.error('Failed to get password stats', { error });
      return {
        totalPasswordChanges: 0,
        recentPasswordChanges: 0,
        activeResetTokens: 0,
        expiredPasswords: 0
      };
    }
  }

  /**
   * Cleanup expired tokens and perform maintenance
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('Starting password maintenance');

      // Clean up expired reset tokens
      const resetTokenKeys = await this.cache.keys('password-reset:*');
      let cleanedTokens = 0;

      for (const key of resetTokenKeys) {
        const token = await this.cache.get<PasswordResetToken>(key);
        if (token && token.expiresAt < new Date()) {
          await this.cache.del(key);
          cleanedTokens++;
        }
      }

      logger.info('Password maintenance completed', { 
        cleanedTokens 
      });
    } catch (error) {
      logger.error('Password maintenance failed', { error });
    }
  }
}