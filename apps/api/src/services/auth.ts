import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { 
  JWTPayload, 
  LoginRequest, 
  LoginResponse, 
  SignupRequest, 
  UserProfile, 
  TokenPair,
  PasswordResetRequest,
  PasswordResetConfirm,
  ChangePasswordRequest
} from '@fineprintai/shared-types';
import { mfaService, MFAType } from '@fineprintai/shared-security';

export interface AuthServiceDeps {
  postgres: PgClient;
  redis: Redis;
}

export interface EmailVerificationRequest {
  email: string;
  resend?: boolean;
}

export interface EmailVerificationConfirm {
  token: string;
}

export interface SocialLoginRequest {
  provider: 'google' | 'github' | 'microsoft';
  code: string;
  redirectUri: string;
  state?: string;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  ipAddress: string;
  userAgent: string;
  trusted: boolean;
}

export class AuthService {
  private postgres: PgClient;
  private redis: Redis;
  private readonly saltRounds = 12;
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry = '15m';
  private readonly refreshTokenExpiry = '30d';
  private readonly emailVerificationExpiry = 24 * 60 * 60; // 24 hours in seconds
  private readonly passwordResetExpiry = 60 * 60; // 1 hour in seconds

  constructor(deps: AuthServiceDeps) {
    this.postgres = deps.postgres;
    this.redis = deps.redis;
    this.jwtSecret = process.env.JWT_SECRET || 'dev-secret-key';
  }

  /**
   * Register a new user
   */
  async register(request: SignupRequest): Promise<{ user: UserProfile; emailVerificationSent: boolean }> {
    try {
      // Validate input
      this.validateSignupRequest(request);

      // Check if user already exists
      const existingUser = await this.getUserByEmail(request.email);
      if (existingUser) {
        throw new Error('User already exists with this email');
      }

      // Hash password
      const passwordHash = await bcrypt.hash(request.password, this.saltRounds);

      // Create user
      const userId = uuidv4();
      const now = new Date().toISOString();

      const query = `
        INSERT INTO users (
          id, email, password_hash, display_name, status, 
          privacy_settings, preferences, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const values = [
        userId,
        request.email.toLowerCase(),
        passwordHash,
        request.displayName || null,
        'active',
        JSON.stringify({ 
          profileVisibility: 'private',
          analyticsTracking: true,
          marketingEmails: false 
        }),
        JSON.stringify({ 
          theme: 'light',
          notifications: true,
          language: 'en',
          timezone: 'UTC'
        }),
        now,
        now
      ];

      const result = await this.postgres.query(query, values);
      const user = result.rows[0];

      // Create notification preferences
      await this.createDefaultNotificationPreferences(userId);

      // Send email verification
      const emailVerificationSent = await this.sendEmailVerification(request.email);

      // Log registration
      await this.logAuditEvent(userId, 'user_registered', { email: request.email });

      return {
        user: this.mapToUserProfile(user),
        emailVerificationSent
      };
    } catch (error) {
      throw new Error(`Registration failed: ${error.message}`);
    }
  }

  /**
   * Login user with email and password
   */
  async login(request: LoginRequest, deviceInfo: DeviceInfo): Promise<LoginResponse> {
    try {
      // Get user by email
      const user = await this.getUserByEmail(request.email);
      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if account is active
      if (user.status !== 'active') {
        throw new Error('Account is disabled');
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(request.password, user.password_hash);
      if (!isValidPassword) {
        await this.logFailedLogin(user.id, 'invalid_password', deviceInfo);
        throw new Error('Invalid credentials');
      }

      // Check for brute force protection
      await this.checkBruteForceProtection(user.id);

      // Update login statistics
      await this.updateLoginStats(user.id);

      // Create device session
      const sessionId = await this.createDeviceSession(user.id, deviceInfo);

      // Check if MFA is enabled and required
      const mfaRequired = await this.isMFARequired(user.id, deviceInfo);
      
      if (mfaRequired) {
        // Create pending MFA session
        const mfaToken = await this.createMFAPendingSession(user.id, sessionId);
        return {
          user: this.mapToUserProfile(user),
          tokens: {
            accessToken: '',
            refreshToken: '',
            expiresIn: 0
          },
          requiresMFA: true,
          mfaToken,
          availableMFAMethods: await this.getUserMFAMethods(user.id)
        };
      }

      // Generate tokens
      const tokens = await this.generateTokens(user, sessionId);

      // Log successful login
      await this.logAuditEvent(user.id, 'user_login', { 
        deviceInfo,
        sessionId 
      });

      return {
        user: this.mapToUserProfile(user),
        tokens,
        requiresMFA: false
      };
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.redis.get(`blacklist:${decoded.jti}`);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      // Get user and session
      const user = await this.getUserById(decoded.sub);
      if (!user || user.status !== 'active') {
        throw new Error('User not found or inactive');
      }

      const session = await this.getSessionById(decoded.sessionId);
      if (!session || session.expires_at < new Date()) {
        throw new Error('Session expired');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user, decoded.sessionId);

      // Blacklist old refresh token
      await this.redis.setex(`blacklist:${decoded.jti}`, 30 * 24 * 60 * 60, '1');

      return tokens;
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * Logout user
   */
  async logout(accessToken: string, allSessions: boolean = false): Promise<void> {
    try {
      const decoded = jwt.verify(accessToken, this.jwtSecret) as any;
      
      if (allSessions) {
        // Revoke all user sessions
        await this.revokeAllUserSessions(decoded.sub);
      } else {
        // Revoke current session
        await this.revokeSession(decoded.sessionId);
      }

      // Blacklist current token
      await this.redis.setex(`blacklist:${decoded.jti}`, 15 * 60, '1');

      await this.logAuditEvent(decoded.sub, 'user_logout', { 
        sessionId: decoded.sessionId,
        allSessions 
      });
    } catch (error) {
      throw new Error(`Logout failed: ${error.message}`);
    }
  }

  /**
   * Send email verification
   */
  async sendEmailVerification(email: string): Promise<boolean> {
    try {
      const user = await this.getUserByEmail(email);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.email_verified) {
        throw new Error('Email already verified');
      }

      // Generate verification token
      const token = crypto.randomBytes(32).toString('hex');
      const key = `email_verification:${token}`;

      // Store in Redis with expiration
      await this.redis.setex(key, this.emailVerificationExpiry, JSON.stringify({
        userId: user.id,
        email: user.email
      }));

      // TODO: Send email via notification service
      // For now, we'll just log it
      console.log(`Email verification token for ${email}: ${token}`);

      return true;
    } catch (error) {
      console.error('Email verification send failed:', error);
      return false;
    }
  }

  /**
   * Verify email
   */
  async verifyEmail(request: EmailVerificationConfirm): Promise<boolean> {
    try {
      const key = `email_verification:${request.token}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        throw new Error('Invalid or expired verification token');
      }

      const { userId, email } = JSON.parse(data);

      // Update user email verification status
      await this.postgres.query(
        'UPDATE users SET email_verified = true, updated_at = NOW() WHERE id = $1',
        [userId]
      );

      // Delete verification token
      await this.redis.del(key);

      await this.logAuditEvent(userId, 'email_verified', { email });

      return true;
    } catch (error) {
      throw new Error(`Email verification failed: ${error.message}`);
    }
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(request: PasswordResetRequest): Promise<boolean> {
    try {
      const user = await this.getUserByEmail(request.email);
      if (!user) {
        // Don't reveal if email exists
        return true;
      }

      // Generate reset token
      const token = crypto.randomBytes(32).toString('hex');
      const key = `password_reset:${token}`;

      // Store in Redis with expiration
      await this.redis.setex(key, this.passwordResetExpiry, JSON.stringify({
        userId: user.id,
        email: user.email
      }));

      // TODO: Send password reset email
      console.log(`Password reset token for ${request.email}: ${token}`);

      await this.logAuditEvent(user.id, 'password_reset_requested', { email: request.email });

      return true;
    } catch (error) {
      console.error('Password reset request failed:', error);
      return false;
    }
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(request: PasswordResetConfirm): Promise<boolean> {
    try {
      const key = `password_reset:${request.token}`;
      const data = await this.redis.get(key);
      
      if (!data) {
        throw new Error('Invalid or expired reset token');
      }

      const { userId } = JSON.parse(data);

      // Validate new password
      this.validatePassword(request.newPassword);

      // Hash new password
      const passwordHash = await bcrypt.hash(request.newPassword, this.saltRounds);

      // Update password
      await this.postgres.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      // Delete reset token
      await this.redis.del(key);

      // Revoke all user sessions for security
      await this.revokeAllUserSessions(userId);

      await this.logAuditEvent(userId, 'password_reset_completed');

      return true;
    } catch (error) {
      throw new Error(`Password reset failed: ${error.message}`);
    }
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(userId: string, request: ChangePasswordRequest): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isValidPassword = await bcrypt.compare(request.currentPassword, user.password_hash);
      if (!isValidPassword) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      this.validatePassword(request.newPassword);

      // Hash new password
      const passwordHash = await bcrypt.hash(request.newPassword, this.saltRounds);

      // Update password
      await this.postgres.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [passwordHash, userId]
      );

      await this.logAuditEvent(userId, 'password_changed');

      return true;
    } catch (error) {
      throw new Error(`Password change failed: ${error.message}`);
    }
  }

  /**
   * Generate JWT tokens
   */
  private async generateTokens(user: any, sessionId: string): Promise<TokenPair> {
    const payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'> = {
      sub: user.id,
      email: user.email,
      role: user.role || 'user',
      subscriptionTier: user.subscription_tier || 'free',
      teamId: user.team_id || undefined
    };

    const jti = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const accessToken = jwt.sign(
      {
        ...payload,
        type: 'access',
        sessionId,
        jti,
        iat: now
      },
      this.jwtSecret,
      { 
        expiresIn: this.accessTokenExpiry,
        algorithm: 'HS256'
      }
    );

    const refreshJti = uuidv4();
    const refreshToken = jwt.sign(
      {
        sub: user.id,
        type: 'refresh',
        sessionId,
        jti: refreshJti,
        iat: now
      },
      this.jwtSecret,
      { 
        expiresIn: this.refreshTokenExpiry,
        algorithm: 'HS256'
      }
    );

    const decodedAccess = jwt.decode(accessToken) as any;

    return {
      accessToken,
      refreshToken,
      expiresIn: decodedAccess.exp
    };
  }

  /**
   * Get user by email
   */
  private async getUserByEmail(email: string): Promise<any> {
    const result = await this.postgres.query(
      'SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL',
      [email.toLowerCase()]
    );
    return result.rows[0];
  }

  /**
   * Get user by ID
   */
  private async getUserById(id: string): Promise<any> {
    const result = await this.postgres.query(
      'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0];
  }

  /**
   * Map database user to UserProfile
   */
  private mapToUserProfile(user: any): UserProfile {
    return {
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      subscriptionTier: user.subscription_tier,
      emailVerified: user.email_verified,
      preferences: user.preferences || {},
      createdAt: new Date(user.created_at)
    };
  }

  /**
   * Create device session
   */
  private async createDeviceSession(userId: string, deviceInfo: DeviceInfo): Promise<string> {
    const sessionId = uuidv4();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const query = `
      INSERT INTO user_sessions (
        id, user_id, session_token, device_info, ip_address, 
        user_agent, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    await this.postgres.query(query, [
      sessionId,
      userId,
      sessionToken,
      JSON.stringify(deviceInfo),
      deviceInfo.ipAddress,
      deviceInfo.userAgent,
      expiresAt
    ]);

    return sessionId;
  }

  /**
   * Get session by ID
   */
  private async getSessionById(sessionId: string): Promise<any> {
    const result = await this.postgres.query(
      'SELECT * FROM user_sessions WHERE id = $1',
      [sessionId]
    );
    return result.rows[0];
  }

  /**
   * Revoke session
   */
  private async revokeSession(sessionId: string): Promise<void> {
    await this.postgres.query(
      'DELETE FROM user_sessions WHERE id = $1',
      [sessionId]
    );
  }

  /**
   * Revoke all user sessions
   */
  private async revokeAllUserSessions(userId: string): Promise<void> {
    await this.postgres.query(
      'DELETE FROM user_sessions WHERE user_id = $1',
      [userId]
    );
  }

  /**
   * Check if MFA is required
   */
  private async isMFARequired(userId: string, deviceInfo: DeviceInfo): Promise<boolean> {
    // Check if user has MFA enabled
    const mfaResult = await this.postgres.query(
      'SELECT * FROM user_mfa WHERE user_id = $1 AND is_enabled = true',
      [userId]
    );

    if (mfaResult.rows.length === 0) {
      return false;
    }

    // Check if device is trusted
    if (deviceInfo.trusted) {
      return false;
    }

    return true;
  }

  /**
   * Get user MFA methods
   */
  private async getUserMFAMethods(userId: string): Promise<MFAType[]> {
    const result = await this.postgres.query(
      'SELECT type FROM user_mfa WHERE user_id = $1 AND is_enabled = true',
      [userId]
    );
    
    return result.rows.map(row => row.type as MFAType);
  }

  /**
   * Create MFA pending session
   */
  private async createMFAPendingSession(userId: string, sessionId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const key = `mfa_pending:${token}`;

    await this.redis.setex(key, 5 * 60, JSON.stringify({ // 5 minutes
      userId,
      sessionId,
      timestamp: Date.now()
    }));

    return token;
  }

  /**
   * Update login statistics
   */
  private async updateLoginStats(userId: string): Promise<void> {
    await this.postgres.query(
      'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = $1',
      [userId]
    );
  }

  /**
   * Check brute force protection
   */
  private async checkBruteForceProtection(userId: string): Promise<void> {
    const key = `failed_login:${userId}`;
    const attempts = await this.redis.get(key);
    
    if (attempts && parseInt(attempts) >= 5) {
      throw new Error('Account temporarily locked due to multiple failed login attempts');
    }
  }

  /**
   * Log failed login attempt
   */
  private async logFailedLogin(userId: string, reason: string, deviceInfo: DeviceInfo): Promise<void> {
    const key = `failed_login:${userId}`;
    const current = await this.redis.get(key);
    const count = current ? parseInt(current) + 1 : 1;
    
    await this.redis.setex(key, 15 * 60, count.toString()); // 15 minutes

    await this.logAuditEvent(userId, 'login_failed', { reason, deviceInfo });
  }

  /**
   * Create default notification preferences
   */
  private async createDefaultNotificationPreferences(userId: string): Promise<void> {
    const query = `
      INSERT INTO notification_preferences (
        user_id, email_enabled, browser_enabled, analysis_complete,
        document_changes, high_risk_findings, weekly_summary
      ) VALUES ($1, true, true, true, true, true, true)
    `;
    
    await this.postgres.query(query, [userId]);
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(userId: string, action: string, metadata?: any): Promise<void> {
    const query = `
      INSERT INTO audit_logs (user_id, action, resource_type, new_values, created_at)
      VALUES ($1, $2, 'auth', $3, NOW())
    `;
    
    await this.postgres.query(query, [userId, action, JSON.stringify(metadata || {})]);
  }

  /**
   * Validate signup request
   */
  private validateSignupRequest(request: SignupRequest): void {
    if (!request.email || !this.isValidEmail(request.email)) {
      throw new Error('Valid email is required');
    }

    if (!request.acceptTerms) {
      throw new Error('Terms acceptance is required');
    }

    this.validatePassword(request.password);
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): void {
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new Error('Password must contain uppercase, lowercase, number, and special character');
    }
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}