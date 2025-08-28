import { Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createServiceLogger } from '@fineprintai/shared-logger';
import { cache } from '@fineprintai/shared-cache';
import { config } from '@fineprintai/shared-config';

const logger = createServiceLogger('auth-service');

export interface AuthToken {
  userId: string;
  email: string;
  name?: string;
  teamId?: string;
  roles?: string[];
  permissions?: string[];
  exp: number;
  iat: number;
}

export interface AuthContext {
  userId: string;
  email: string;
  name?: string;
  teamId?: string;
  isAdmin: boolean;
  roles: string[];
  permissions: string[];
}

export class AuthenticationService {
  private initialized = false;
  private jwtSecret: string;
  private tokenBlacklist = new Set<string>();

  constructor() {
    this.jwtSecret = config.jwt.secret;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load blacklisted tokens from cache
      await this.loadTokenBlacklist();

      // Start token cleanup job
      this.startTokenCleanup();

      this.initialized = true;
      logger.info('Authentication service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize authentication service', { error });
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.initialized) return;

    try {
      // Save token blacklist to cache
      await this.saveTokenBlacklist();

      this.initialized = false;
      logger.info('Authentication service shut down successfully');
    } catch (error) {
      logger.error('Error during authentication service shutdown', { error });
    }
  }

  public async authenticateSocket(socket: Socket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      
      if (!token) {
        throw new Error('Authentication token required');
      }

      // Check if token is blacklisted
      if (this.tokenBlacklist.has(token)) {
        throw new Error('Token has been revoked');
      }

      // Verify and decode token
      const decoded = await this.verifyToken(token);
      
      // Check if user is still active
      await this.validateUser(decoded.userId);

      // Attach auth context to socket
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      socket.userName = decoded.name || decoded.email;
      socket.teamId = decoded.teamId;
      socket.isAdmin = this.hasAdminRole(decoded.roles);

      // Store auth context in cache for quick access
      await this.cacheAuthContext(socket.id, {
        userId: decoded.userId,
        email: decoded.email,
        name: decoded.name,
        teamId: decoded.teamId,
        isAdmin: socket.isAdmin,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
      });

      logger.debug('Socket authenticated successfully', {
        userId: decoded.userId,
        email: decoded.email,
        socketId: socket.id,
        teamId: decoded.teamId,
        isAdmin: socket.isAdmin,
      });

    } catch (error) {
      logger.warn('Socket authentication failed', {
        error: error.message,
        socketId: socket.id,
        ip: socket.handshake.address,
      });
      throw error;
    }
  }

  public async validatePermission(
    socketId: string, 
    requiredPermission: string
  ): Promise<boolean> {
    try {
      const authContext = await this.getAuthContext(socketId);
      if (!authContext) {
        return false;
      }

      // Admin has all permissions
      if (authContext.isAdmin) {
        return true;
      }

      // Check specific permission
      return authContext.permissions.includes(requiredPermission);
    } catch (error) {
      logger.error('Error validating permission', { error, socketId, requiredPermission });
      return false;
    }
  }

  public async validateRole(socketId: string, requiredRole: string): Promise<boolean> {
    try {
      const authContext = await this.getAuthContext(socketId);
      if (!authContext) {
        return false;
      }

      // Admin has all roles
      if (authContext.isAdmin) {
        return true;
      }

      // Check specific role
      return authContext.roles.includes(requiredRole);
    } catch (error) {
      logger.error('Error validating role', { error, socketId, requiredRole });
      return false;
    }
  }

  public async validateTeamAccess(
    socketId: string, 
    targetTeamId: string
  ): Promise<boolean> {
    try {
      const authContext = await this.getAuthContext(socketId);
      if (!authContext) {
        return false;
      }

      // Admin can access all teams
      if (authContext.isAdmin) {
        return true;
      }

      // User can only access their own team
      return authContext.teamId === targetTeamId;
    } catch (error) {
      logger.error('Error validating team access', { error, socketId, targetTeamId });
      return false;
    }
  }

  public async validateResourceAccess(
    socketId: string, 
    resourceType: string, 
    resourceId: string
  ): Promise<boolean> {
    try {
      const authContext = await this.getAuthContext(socketId);
      if (!authContext) {
        return false;
      }

      // Admin can access all resources
      if (authContext.isAdmin) {
        return true;
      }

      // Check resource-specific access
      switch (resourceType) {
        case 'document':
          return await this.validateDocumentAccess(authContext.userId, resourceId);
        
        case 'analysis':
          return await this.validateAnalysisAccess(authContext.userId, resourceId);
        
        case 'user':
          // Users can access their own profile
          return authContext.userId === resourceId;
        
        case 'team':
          return authContext.teamId === resourceId;
        
        default:
          logger.warn('Unknown resource type for access validation', { 
            resourceType, 
            resourceId, 
            userId: authContext.userId 
          });
          return false;
      }
    } catch (error) {
      logger.error('Error validating resource access', { 
        error, 
        socketId, 
        resourceType, 
        resourceId 
      });
      return false;
    }
  }

  public async revokeToken(token: string): Promise<void> {
    try {
      // Add token to blacklist
      this.tokenBlacklist.add(token);
      
      // Persist to cache
      await this.saveTokenBlacklist();

      logger.info('Token revoked successfully', { tokenHash: this.hashToken(token) });
    } catch (error) {
      logger.error('Error revoking token', { error });
      throw error;
    }
  }

  public async refreshAuthContext(socketId: string): Promise<AuthContext | null> {
    try {
      // Remove cached context to force refresh
      await cache.del(`auth:context:${socketId}`);
      
      // Get fresh context
      return await this.getAuthContext(socketId);
    } catch (error) {
      logger.error('Error refreshing auth context', { error, socketId });
      return null;
    }
  }

  // Private methods

  private extractToken(socket: Socket): string | null {
    // Try multiple sources for token
    const authHeader = socket.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check auth object (socket.io v4)
    if (socket.handshake.auth && socket.handshake.auth.token) {
      return socket.handshake.auth.token;
    }

    // Check query parameters (fallback)
    if (socket.handshake.query && socket.handshake.query.token) {
      return Array.isArray(socket.handshake.query.token) 
        ? socket.handshake.query.token[0] 
        : socket.handshake.query.token;
    }

    return null;
  }

  private async verifyToken(token: string): Promise<AuthToken> {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      // Validate required fields
      if (!decoded.userId && !decoded.sub) {
        throw new Error('Token missing user ID');
      }

      return {
        userId: decoded.userId || decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded.displayName,
        teamId: decoded.teamId,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        exp: decoded.exp,
        iat: decoded.iat,
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      } else if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      } else if (error.name === 'NotBeforeError') {
        throw new Error('Token not active yet');
      } else {
        throw new Error('Token verification failed');
      }
    }
  }

  private async validateUser(userId: string): Promise<void> {
    try {
      // Check if user is active (cached for performance)
      const userStatus = await cache.get(`user:status:${userId}`);
      
      if (userStatus === 'inactive' || userStatus === 'suspended') {
        throw new Error('User account is inactive');
      }

      // If not in cache, assume active (would normally check database)
      if (userStatus === null) {
        // Set default active status with short TTL to avoid repeated DB hits
        await cache.set(`user:status:${userId}`, 'active', 300); // 5 minutes
      }
    } catch (error) {
      logger.error('Error validating user', { error, userId });
      throw new Error('User validation failed');
    }
  }

  private hasAdminRole(roles?: string[]): boolean {
    if (!roles) return false;
    return roles.includes('admin') || roles.includes('super_admin') || roles.includes('system_admin');
  }

  private async cacheAuthContext(socketId: string, context: AuthContext): Promise<void> {
    try {
      await cache.set(`auth:context:${socketId}`, context, 3600); // 1 hour TTL
    } catch (error) {
      logger.error('Error caching auth context', { error, socketId });
    }
  }

  private async getAuthContext(socketId: string): Promise<AuthContext | null> {
    try {
      return await cache.get(`auth:context:${socketId}`);
    } catch (error) {
      logger.error('Error getting auth context', { error, socketId });
      return null;
    }
  }

  private async validateDocumentAccess(userId: string, documentId: string): Promise<boolean> {
    try {
      // Check cached document permissions
      const permissions = await cache.get(`document:permissions:${documentId}`);
      if (permissions && permissions.users) {
        return permissions.users.includes(userId);
      }

      // If not cached, check team access
      const userTeam = await cache.get(`user:team:${userId}`);
      const documentTeam = await cache.get(`document:team:${documentId}`);
      
      return userTeam && documentTeam && userTeam === documentTeam;
    } catch (error) {
      logger.error('Error validating document access', { error, userId, documentId });
      return false;
    }
  }

  private async validateAnalysisAccess(userId: string, analysisId: string): Promise<boolean> {
    try {
      // Check if user owns the analysis
      const analysisOwner = await cache.get(`analysis:owner:${analysisId}`);
      if (analysisOwner === userId) {
        return true;
      }

      // Check if analysis belongs to user's team
      const userTeam = await cache.get(`user:team:${userId}`);
      const analysisTeam = await cache.get(`analysis:team:${analysisId}`);
      
      return userTeam && analysisTeam && userTeam === analysisTeam;
    } catch (error) {
      logger.error('Error validating analysis access', { error, userId, analysisId });
      return false;
    }
  }

  private async loadTokenBlacklist(): Promise<void> {
    try {
      const blacklist = await cache.get('auth:token_blacklist') || [];
      this.tokenBlacklist = new Set(blacklist);
      
      logger.debug('Token blacklist loaded', { count: this.tokenBlacklist.size });
    } catch (error) {
      logger.error('Error loading token blacklist', { error });
    }
  }

  private async saveTokenBlacklist(): Promise<void> {
    try {
      const blacklistArray = Array.from(this.tokenBlacklist);
      await cache.set('auth:token_blacklist', blacklistArray, 86400); // 24 hours
      
      logger.debug('Token blacklist saved', { count: blacklistArray.length });
    } catch (error) {
      logger.error('Error saving token blacklist', { error });
    }
  }

  private startTokenCleanup(): void {
    // Clean up expired tokens from blacklist every hour
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 60 * 1000); // 1 hour
  }

  private async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      let cleanedCount = 0;

      // Note: This is a simplified cleanup. In a real implementation,
      // you'd need to decode tokens to check expiration, but that's
      // computationally expensive for a large blacklist.
      
      // For now, we'll rely on the cache TTL to handle cleanup
      
      logger.debug('Token cleanup completed', { cleanedCount });
    } catch (error) {
      logger.error('Error during token cleanup', { error });
    }
  }

  private hashToken(token: string): string {
    // Create a hash of the token for logging (never log the actual token)
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }
}