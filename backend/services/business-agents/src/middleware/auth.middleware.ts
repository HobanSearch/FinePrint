/**
 * Authentication Middleware for Business Agents API
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import { UserTier } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('auth-middleware');

export interface AuthenticatedRequest extends FastifyRequest {
  user?: {
    id: string;
    email: string;
    tier: UserTier;
    permissions: string[];
  };
}

export async function authenticateRequest(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Check for Authorization header
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authorization header required'
      });
    }

    // Extract token
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Invalid authorization header format'
      });
    }

    // Verify token
    try {
      const decoded = await request.jwtVerify();
      
      // Add user to request
      request.user = {
        id: (decoded as any).sub || (decoded as any).id,
        email: (decoded as any).email,
        tier: (decoded as any).tier || UserTier.FREE,
        permissions: (decoded as any).permissions || []
      };

      logger.debug({
        userId: request.user.id,
        tier: request.user.tier,
        path: request.url,
        msg: 'Request authenticated'
      });
    } catch (error) {
      logger.warn({
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
        msg: 'JWT verification failed'
      });

      return reply.code(401).send({
        error: 'INVALID_TOKEN',
        message: 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error({
      error: error instanceof Error ? error.message : 'Unknown error',
      path: request.url,
      msg: 'Authentication middleware error'
    });

    return reply.code(500).send({
      error: 'AUTH_ERROR',
      message: 'Authentication failed'
    });
  }
}

export function requireTier(minTier: UserTier) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    const tierHierarchy = {
      [UserTier.FREE]: 0,
      [UserTier.STARTER]: 1,
      [UserTier.PROFESSIONAL]: 2,
      [UserTier.ENTERPRISE]: 3
    };

    const userTierLevel = tierHierarchy[request.user.tier];
    const requiredTierLevel = tierHierarchy[minTier];

    if (userTierLevel < requiredTierLevel) {
      logger.warn({
        userId: request.user.id,
        userTier: request.user.tier,
        requiredTier: minTier,
        path: request.url,
        msg: 'Insufficient tier access'
      });

      return reply.code(403).send({
        error: 'INSUFFICIENT_TIER',
        message: `This feature requires ${minTier} tier or higher`,
        currentTier: request.user.tier,
        requiredTier: minTier
      });
    }
  };
}

export function requirePermission(permission: string) {
  return async (request: AuthenticatedRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({
        error: 'UNAUTHORIZED',
        message: 'Authentication required'
      });
    }

    if (!request.user.permissions.includes(permission)) {
      logger.warn({
        userId: request.user.id,
        requiredPermission: permission,
        userPermissions: request.user.permissions,
        path: request.url,
        msg: 'Insufficient permissions'
      });

      return reply.code(403).send({
        error: 'INSUFFICIENT_PERMISSIONS',
        message: `Missing required permission: ${permission}`
      });
    }
  };
}

export async function optionalAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;
    
    if (!authHeader) {
      // No auth header, continue without user
      request.user = undefined;
      return;
    }

    // Try to authenticate
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (token) {
      try {
        const decoded = await request.jwtVerify();
        
        request.user = {
          id: (decoded as any).sub || (decoded as any).id,
          email: (decoded as any).email,
          tier: (decoded as any).tier || UserTier.FREE,
          permissions: (decoded as any).permissions || []
        };
      } catch (error) {
        // Invalid token, continue without user
        request.user = undefined;
      }
    }
  } catch (error) {
    // Error in optional auth, continue without user
    request.user = undefined;
  }
}