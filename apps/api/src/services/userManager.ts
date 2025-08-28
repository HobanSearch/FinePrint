import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { UserProfile, ApiKeyCreate, ApiKeyResponse, SessionInfo } from '@fineprintai/shared-types';

export interface UserManagerDeps {
  postgres: PgClient;
  redis: Redis;
}

export interface UserUpdateRequest {
  displayName?: string;
  avatarUrl?: string;
  timezone?: string;
  language?: string;
  preferences?: Record<string, any>;
  privacySettings?: Record<string, any>;
}

export interface UserSearchFilters {
  email?: string;
  subscriptionTier?: string;
  status?: string;
  teamId?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface UserListResponse {
  users: UserProfile[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface NotificationPreferences {
  emailEnabled: boolean;
  browserEnabled: boolean;
  webhookEnabled: boolean;
  webhookUrl?: string;
  analysisComplete: boolean;
  documentChanges: boolean;
  highRiskFindings: boolean;
  weeklySummary: boolean;
  marketingEmails: boolean;
}

export interface UsageStats {
  totalDocuments: number;
  totalAnalyses: number;
  averageRiskScore: number;
  monitoredDocuments: number;
  totalActions: number;
  lastAnalysisAt?: Date;
  subscriptionUsage: {
    documentsUsed: number;
    documentsLimit: number;
    analysesUsed: number;
    analysesLimit: number;
  };
}

export class UserManager {
  private postgres: PgClient;
  private redis: Redis;

  constructor(deps: UserManagerDeps) {
    this.postgres = deps.postgres;
    this.redis = deps.redis;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<UserProfile | null> {
    try {
      const result = await this.postgres.query(
        'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
        [userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToUserProfile(result.rows[0]);
    } catch (error) {
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Get users by IDs (batch operation)
   */
  async getUsersByIds(userIds: string[]): Promise<UserProfile[]> {
    try {
      if (userIds.length === 0) return [];

      const placeholders = userIds.map((_, index) => `$${index + 1}`).join(',');
      const result = await this.postgres.query(
        `SELECT * FROM users WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        userIds
      );

      return result.rows.map(this.mapToUserProfile);
    } catch (error) {
      throw new Error(`Failed to get users: ${error.message}`);
    }
  }

  /**
   * Update user profile
   */
  async updateUser(userId: string, updates: UserUpdateRequest): Promise<UserProfile> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.displayName !== undefined) {
        setClauses.push(`display_name = $${paramIndex++}`);
        values.push(updates.displayName);
      }

      if (updates.avatarUrl !== undefined) {
        setClauses.push(`avatar_url = $${paramIndex++}`);
        values.push(updates.avatarUrl);
      }

      if (updates.timezone !== undefined) {
        setClauses.push(`timezone = $${paramIndex++}`);
        values.push(updates.timezone);
      }

      if (updates.language !== undefined) {
        setClauses.push(`language = $${paramIndex++}`);
        values.push(updates.language);
      }

      if (updates.preferences !== undefined) {
        setClauses.push(`preferences = $${paramIndex++}`);
        values.push(JSON.stringify(updates.preferences));
      }

      if (updates.privacySettings !== undefined) {
        setClauses.push(`privacy_settings = $${paramIndex++}`);
        values.push(JSON.stringify(updates.privacySettings));
      }

      if (setClauses.length === 0) {
        return user;
      }

      setClauses.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${setClauses.join(', ')} 
        WHERE id = $${paramIndex} AND deleted_at IS NULL 
        RETURNING *
      `;

      const result = await this.postgres.query(query, values);
      const updatedUser = this.mapToUserProfile(result.rows[0]);

      // Clear user cache
      await this.redis.del(`user:${userId}`);

      // Log audit event
      await this.logAuditEvent(userId, 'user_updated', { updates });

      return updatedUser;
    } catch (error) {
      throw new Error(`Failed to update user: ${error.message}`);
    }
  }

  /**
   * Delete user account (soft delete with GDPR compliance)
   */
  async deleteUser(userId: string, reason?: string): Promise<boolean> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create deletion request for audit trail
      const deletionId = uuidv4();
      await this.postgres.query(`
        INSERT INTO data_deletion_requests (
          id, user_id, reason, status, verified_at, scheduled_for, created_at
        ) VALUES ($1, $2, $3, 'verified', NOW(), NOW() + INTERVAL '7 days', NOW())
      `, [deletionId, userId, reason || 'User requested account deletion']);

      // Soft delete user
      await this.postgres.query(`
        UPDATE users 
        SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [userId]);

      // Revoke all sessions
      await this.postgres.query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);

      // Revoke all API keys
      await this.postgres.query(`
        UPDATE api_keys 
        SET is_active = false, updated_at = NOW() 
        WHERE user_id = $1
      `, [userId]);

      // Clear all user caches
      await this.clearUserCaches(userId);

      // Log audit event
      await this.logAuditEvent(userId, 'user_deleted', { reason, deletionId });

      return true;
    } catch (error) {
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * List users with filtering and pagination
   */
  async listUsers(
    filters: UserSearchFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<UserListResponse> {
    try {
      const { page, limit, sortBy = 'created_at', sortOrder = 'DESC' } = pagination;
      const offset = (page - 1) * limit;

      // Build WHERE clause
      const whereClauses: string[] = ['deleted_at IS NULL'];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.email) {
        whereClauses.push(`email ILIKE $${paramIndex++}`);
        values.push(`%${filters.email}%`);
      }

      if (filters.subscriptionTier) {
        whereClauses.push(`subscription_tier = $${paramIndex++}`);
        values.push(filters.subscriptionTier);
      }

      if (filters.status) {
        whereClauses.push(`status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.createdAfter) {
        whereClauses.push(`created_at >= $${paramIndex++}`);
        values.push(filters.createdAfter);
      }

      if (filters.createdBefore) {
        whereClauses.push(`created_at <= $${paramIndex++}`);
        values.push(filters.createdBefore);
      }

      const whereClause = whereClauses.join(' AND ');

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM users WHERE ${whereClause}`;
      const countResult = await this.postgres.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get users
      const validSortColumns = ['created_at', 'updated_at', 'email', 'display_name', 'subscription_tier'];
      const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      
      const query = `
        SELECT * FROM users 
        WHERE ${whereClause}
        ORDER BY ${sortColumn} ${sortOrder}
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;

      values.push(limit, offset);
      const result = await this.postgres.query(query, values);

      const users = result.rows.map(this.mapToUserProfile);
      const totalPages = Math.ceil(total / limit);

      return {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      };
    } catch (error) {
      throw new Error(`Failed to list users: ${error.message}`);
    }
  }

  /**
   * Get user's notification preferences
   */
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      const result = await this.postgres.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        // Create default preferences
        return await this.createDefaultNotificationPreferences(userId);
      }

      const prefs = result.rows[0];
      return {
        emailEnabled: prefs.email_enabled,
        browserEnabled: prefs.browser_enabled,
        webhookEnabled: prefs.webhook_enabled,
        webhookUrl: prefs.webhook_url,
        analysisComplete: prefs.analysis_complete,
        documentChanges: prefs.document_changes,
        highRiskFindings: prefs.high_risk_findings,
        weeklySummary: prefs.weekly_summary,
        marketingEmails: prefs.marketing_emails
      };
    } catch (error) {
      throw new Error(`Failed to get notification preferences: ${error.message}`);
    }
  }

  /**
   * Update user's notification preferences
   */
  async updateNotificationPreferences(
    userId: string, 
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (preferences.emailEnabled !== undefined) {
        setClauses.push(`email_enabled = $${paramIndex++}`);
        values.push(preferences.emailEnabled);
      }

      if (preferences.browserEnabled !== undefined) {
        setClauses.push(`browser_enabled = $${paramIndex++}`);
        values.push(preferences.browserEnabled);
      }

      if (preferences.webhookEnabled !== undefined) {
        setClauses.push(`webhook_enabled = $${paramIndex++}`);
        values.push(preferences.webhookEnabled);
      }

      if (preferences.webhookUrl !== undefined) {
        setClauses.push(`webhook_url = $${paramIndex++}`);
        values.push(preferences.webhookUrl);
      }

      if (preferences.analysisComplete !== undefined) {
        setClauses.push(`analysis_complete = $${paramIndex++}`);
        values.push(preferences.analysisComplete);
      }

      if (preferences.documentChanges !== undefined) {
        setClauses.push(`document_changes = $${paramIndex++}`);
        values.push(preferences.documentChanges);
      }

      if (preferences.highRiskFindings !== undefined) {
        setClauses.push(`high_risk_findings = $${paramIndex++}`);
        values.push(preferences.highRiskFindings);
      }

      if (preferences.weeklySummary !== undefined) {
        setClauses.push(`weekly_summary = $${paramIndex++}`);
        values.push(preferences.weeklySummary);
      }

      if (preferences.marketingEmails !== undefined) {
        setClauses.push(`marketing_emails = $${paramIndex++}`);
        values.push(preferences.marketingEmails);
      }

      if (setClauses.length > 0) {
        setClauses.push(`updated_at = NOW()`);
        values.push(userId);

        const query = `
          UPDATE notification_preferences 
          SET ${setClauses.join(', ')} 
          WHERE user_id = $${paramIndex}
        `;

        await this.postgres.query(query, values);
      }

      return await this.getNotificationPreferences(userId);
    } catch (error) {
      throw new Error(`Failed to update notification preferences: ${error.message}`);
    }
  }

  /**
   * Get user's active sessions
   */
  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    try {
      const result = await this.postgres.query(`
        SELECT * FROM user_sessions 
        WHERE user_id = $1 AND expires_at > NOW()
        ORDER BY last_activity_at DESC
      `, [userId]);

      return result.rows.map(session => ({
        id: session.id,
        deviceInfo: session.device_info,
        ipAddress: session.ip_address,
        userAgent: session.user_agent,
        lastActivityAt: new Date(session.last_activity_at),
        createdAt: new Date(session.created_at),
        isCurrent: false // This would be determined by comparing with current session
      }));
    } catch (error) {
      throw new Error(`Failed to get user sessions: ${error.message}`);
    }
  }

  /**
   * Revoke user session
   */
  async revokeSession(userId: string, sessionId: string): Promise<boolean> {
    try {
      const result = await this.postgres.query(`
        DELETE FROM user_sessions 
        WHERE id = $1 AND user_id = $2
      `, [sessionId, userId]);

      await this.logAuditEvent(userId, 'session_revoked', { sessionId });

      return result.rowCount > 0;
    } catch (error) {
      throw new Error(`Failed to revoke session: ${error.message}`);
    }
  }

  /**
   * Create API key for user
   */
  async createApiKey(userId: string, request: ApiKeyCreate): Promise<ApiKeyResponse> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const keyId = uuidv4();
      const apiKey = this.generateApiKey();
      const keyHash = this.hashApiKey(apiKey);
      const keyPrefix = apiKey.substring(0, 8);

      let expiresAt: Date | null = null;
      if (request.expiresIn) {
        expiresAt = this.parseExpirationString(request.expiresIn);
      }

      const query = `
        INSERT INTO api_keys (
          id, user_id, name, key_hash, key_prefix, permissions, 
          rate_limit, expires_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        keyId,
        userId,
        request.name,
        keyHash,
        keyPrefix,
        JSON.stringify(request.permissions || {}),
        request.rateLimit || 1000,
        expiresAt
      ];

      const result = await this.postgres.query(query, values);
      const apiKeyRecord = result.rows[0];

      await this.logAuditEvent(userId, 'api_key_created', { 
        keyId, 
        name: request.name,
        keyPrefix 
      });

      return {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        key: apiKey, // Only returned on creation
        keyPrefix: apiKeyRecord.key_prefix,
        permissions: apiKeyRecord.permissions,
        rateLimit: apiKeyRecord.rate_limit,
        expiresAt: apiKeyRecord.expires_at ? new Date(apiKeyRecord.expires_at) : null,
        createdAt: new Date(apiKeyRecord.created_at)
      };
    } catch (error) {
      throw new Error(`Failed to create API key: ${error.message}`);
    }
  }

  /**
   * List user's API keys
   */
  async listApiKeys(userId: string): Promise<Omit<ApiKeyResponse, 'key'>[]> {
    try {
      const result = await this.postgres.query(`
        SELECT * FROM api_keys 
        WHERE user_id = $1 AND is_active = true
        ORDER BY created_at DESC
      `, [userId]);

      return result.rows.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.key_prefix,
        permissions: key.permissions,
        rateLimit: key.rate_limit,
        expiresAt: key.expires_at ? new Date(key.expires_at) : null,
        createdAt: new Date(key.created_at)
      }));
    } catch (error) {
      throw new Error(`Failed to list API keys: ${error.message}`);
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<boolean> {
    try {
      const result = await this.postgres.query(`
        UPDATE api_keys 
        SET is_active = false, updated_at = NOW()
        WHERE id = $1 AND user_id = $2
      `, [keyId, userId]);

      if (result.rowCount > 0) {
        await this.logAuditEvent(userId, 'api_key_revoked', { keyId });
        return true;
      }

      return false;
    } catch (error) {
      throw new Error(`Failed to revoke API key: ${error.message}`);
    }
  }

  /**
   * Get user usage statistics
   */
  async getUserUsageStats(userId: string): Promise<UsageStats> {
    try {
      const query = `
        SELECT 
          COUNT(d.id) as total_documents,
          COUNT(da.id) as total_analyses,
          AVG(da.overall_risk_score) as avg_risk_score,
          COUNT(CASE WHEN d.monitoring_enabled THEN 1 END) as monitored_documents,
          COUNT(ua.id) as total_actions,
          MAX(da.completed_at) as last_analysis_at
        FROM users u
        LEFT JOIN documents d ON u.id = d.user_id AND d.deleted_at IS NULL
        LEFT JOIN document_analyses da ON da.user_id = u.id AND da.status = 'completed'
        LEFT JOIN user_actions ua ON ua.user_id = u.id
        WHERE u.id = $1
        GROUP BY u.id
      `;

      const result = await this.postgres.query(query, [userId]);
      const stats = result.rows[0] || {};

      // Get subscription limits (this would come from a subscription service)
      const subscriptionLimits = await this.getSubscriptionLimits(userId);

      return {
        totalDocuments: parseInt(stats.total_documents) || 0,
        totalAnalyses: parseInt(stats.total_analyses) || 0,
        averageRiskScore: parseFloat(stats.avg_risk_score) || 0,
        monitoredDocuments: parseInt(stats.monitored_documents) || 0,
        totalActions: parseInt(stats.total_actions) || 0,
        lastAnalysisAt: stats.last_analysis_at ? new Date(stats.last_analysis_at) : undefined,
        subscriptionUsage: subscriptionLimits
      };
    } catch (error) {
      throw new Error(`Failed to get user usage stats: ${error.message}`);
    }
  }

  /**
   * Update user subscription
   */
  async updateSubscription(
    userId: string, 
    subscriptionTier: string, 
    subscriptionId?: string
  ): Promise<UserProfile> {
    try {
      const query = `
        UPDATE users 
        SET subscription_tier = $1, subscription_id = $2, updated_at = NOW()
        WHERE id = $3 AND deleted_at IS NULL
        RETURNING *
      `;

      const result = await this.postgres.query(query, [subscriptionTier, subscriptionId, userId]);
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const updatedUser = this.mapToUserProfile(result.rows[0]);

      // Clear user cache
      await this.redis.del(`user:${userId}`);

      await this.logAuditEvent(userId, 'subscription_updated', { 
        subscriptionTier, 
        subscriptionId 
      });

      return updatedUser;
    } catch (error) {
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
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
   * Create default notification preferences
   */
  private async createDefaultNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    const query = `
      INSERT INTO notification_preferences (
        user_id, email_enabled, browser_enabled, webhook_enabled,
        analysis_complete, document_changes, high_risk_findings,
        weekly_summary, marketing_emails, created_at, updated_at
      ) VALUES ($1, true, true, false, true, true, true, true, false, NOW(), NOW())
      RETURNING *
    `;

    const result = await this.postgres.query(query, [userId]);
    const prefs = result.rows[0];

    return {
      emailEnabled: prefs.email_enabled,
      browserEnabled: prefs.browser_enabled,
      webhookEnabled: prefs.webhook_enabled,
      webhookUrl: prefs.webhook_url,
      analysisComplete: prefs.analysis_complete,
      documentChanges: prefs.document_changes,
      highRiskFindings: prefs.high_risk_findings,
      weeklySummary: prefs.weekly_summary,
      marketingEmails: prefs.marketing_emails
    };
  }

  /**
   * Generate API key
   */
  private generateApiKey(): string {
    const prefix = 'fpai_';
    const randomBytes = require('crypto').randomBytes(32).toString('hex');
    return `${prefix}${randomBytes}`;
  }

  /**
   * Hash API key for storage
   */
  private hashApiKey(apiKey: string): string {
    return require('crypto').createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Parse expiration string to Date
   */
  private parseExpirationString(expiresIn: string): Date {
    const now = new Date();
    const match = expiresIn.match(/^(\d+)([dwmy])$/);
    
    if (!match) {
      throw new Error('Invalid expiration format. Use format like: 30d, 1w, 6m, 1y');
    }

    const [, amount, unit] = match;
    const num = parseInt(amount);

    switch (unit) {
      case 'd':
        return new Date(now.getTime() + num * 24 * 60 * 60 * 1000);
      case 'w':
        return new Date(now.getTime() + num * 7 * 24 * 60 * 60 * 1000);
      case 'm':
        return new Date(now.getTime() + num * 30 * 24 * 60 * 60 * 1000);
      case 'y':
        return new Date(now.getTime() + num * 365 * 24 * 60 * 60 * 1000);
      default:
        throw new Error('Invalid time unit');
    }
  }

  /**
   * Get subscription limits for user
   */
  private async getSubscriptionLimits(userId: string): Promise<{
    documentsUsed: number;
    documentsLimit: number;
    analysesUsed: number;
    analysesLimit: number;
  }> {
    // This would typically fetch from a subscription service or config
    // For now, return default limits based on tier
    const user = await this.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const limits = {
      free: { documents: 5, analyses: 10 },
      starter: { documents: 50, analyses: 100 },
      professional: { documents: 500, analyses: 1000 },
      team: { documents: 1000, analyses: 5000 },
      enterprise: { documents: -1, analyses: -1 } // Unlimited
    };

    const tierLimits = limits[user.subscriptionTier as keyof typeof limits] || limits.free;

    // Get current usage (simplified)
    const usageResult = await this.postgres.query(`
      SELECT 
        COUNT(DISTINCT d.id) as documents_used,
        COUNT(da.id) as analyses_used
      FROM documents d
      LEFT JOIN document_analyses da ON d.id = da.document_id
      WHERE d.user_id = $1 AND d.created_at >= date_trunc('month', CURRENT_DATE)
    `, [userId]);

    const usage = usageResult.rows[0] || {};

    return {
      documentsUsed: parseInt(usage.documents_used) || 0,
      documentsLimit: tierLimits.documents,
      analysesUsed: parseInt(usage.analyses_used) || 0,
      analysesLimit: tierLimits.analyses
    };
  }

  /**
   * Clear all user-related caches
   */
  private async clearUserCaches(userId: string): Promise<void> {
    const keys = [
      `user:${userId}`,
      `user_sessions:${userId}`,
      `user_preferences:${userId}`,
      `user_stats:${userId}`
    ];

    await Promise.all(keys.map(key => this.redis.del(key)));
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(userId: string, action: string, metadata?: any): Promise<void> {
    const query = `
      INSERT INTO audit_logs (user_id, action, resource_type, new_values, created_at)
      VALUES ($1, $2, 'user', $3, NOW())
    `;
    
    await this.postgres.query(query, [userId, action, JSON.stringify(metadata || {})]);
  }
}