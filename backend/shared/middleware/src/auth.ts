import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '@fineprintai/shared-config';
import { UnauthorizedError, ForbiddenError } from '@fineprintai/shared-types';
import type { JWTPayload, AuthenticatedRequest } from '@fineprintai/shared-types';
import { 
  mfaService,
  auditLogger,
  securityHeaders,
  csrfProtection,
  SecurityUtils
} from '@fineprintai/shared-security';

export const authenticateToken = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    // Log authentication attempt
    await auditLogger.logAuth('login', '', request, false, {
      reason: 'missing_token',
      ip: SecurityUtils.extractClientIP(request)
    });
    throw new UnauthorizedError('Access token is required');
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret) as JWTPayload;
    
    if (decoded.type !== 'access') {
      await auditLogger.logAuth('login', decoded.sub || '', request, false, {
        reason: 'invalid_token_type',
        tokenType: decoded.type
      });
      throw new UnauthorizedError('Invalid token type');
    }

    // Check if user needs MFA
    const mfaRequired = mfaService.shouldRequireMFA({
      userId: decoded.sub,
      ipAddress: SecurityUtils.extractClientIP(request),
      userAgent: request.headers['user-agent'] || '',
      isNewDevice: true, // Would be determined by device fingerprinting
      isHighRiskAction: false,
      suspiciousActivity: false
    });

    if (mfaRequired && !decoded.mfaVerified) {
      await auditLogger.logAuth('mfa', decoded.sub, request, false, {
        reason: 'mfa_required'
      });
      throw new UnauthorizedError('MFA verification required');
    }

    // Add user info to request
    (request as AuthenticatedRequest).user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      subscriptionTier: decoded.subscriptionTier,
      teamId: decoded.teamId,
    };

    // Log successful authentication
    await auditLogger.logAuth('login', decoded.sub, request, true);

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      await auditLogger.logAuth('login', '', request, false, {
        reason: 'invalid_token',
        error: error.message
      });
      throw new UnauthorizedError('Invalid access token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      await auditLogger.logAuth('login', '', request, false, {
        reason: 'token_expired'
      });
      throw new UnauthorizedError('Access token has expired');
    }
    throw error;
  }
};

export const authenticateApiKey = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const apiKey = request.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new UnauthorizedError('API key is required');
  }

  // TODO: Implement API key validation logic
  // This would typically involve:
  // 1. Extracting the key prefix
  // 2. Looking up the key in the database
  // 3. Verifying the hash
  // 4. Checking expiration and rate limits
  // 5. Adding user/team context to request

  throw new Error('API key authentication not yet implemented');
};

export const requireRole = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }
  };
};

export const requireSubscription = (requiredTiers: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as AuthenticatedRequest).user;
    
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!requiredTiers.includes(user.subscriptionTier)) {
      throw new ForbiddenError('Subscription upgrade required');
    }
  };
};

export const optionalAuth = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const authHeader = request.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return; // No token provided, continue without authentication
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwt.secret) as JWTPayload;
    
    if (decoded.type === 'access') {
      (request as AuthenticatedRequest).user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        subscriptionTier: decoded.subscriptionTier,
        teamId: decoded.teamId,
      };
    }
  } catch (error) {
    // Invalid token, but we don't throw an error for optional auth
    request.log.warn('Invalid token provided for optional auth', { error: error.message });
  }
};

export const generateTokens = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>) => {
  const now = Math.floor(Date.now() / 1000);
  const jti = SecurityUtils.generateUUID(); // Add unique token ID
  
  const accessToken = jwt.sign(
    {
      ...payload,
      type: 'access',
      iat: now,
      jti, // Add token ID for session tracking
      mfaVerified: false // Will be updated after MFA verification
    },
    config.auth.jwt.secret,
    {
      expiresIn: config.auth.jwt.accessExpiry,
      algorithm: config.auth.jwt.algorithm,
      issuer: 'fineprintai.com',
      audience: 'fineprintai-api'
    }
  );

  const refreshToken = jwt.sign(
    {
      sub: payload.sub,
      type: 'refresh',
      iat: now,
      jti: SecurityUtils.generateUUID()
    },
    config.auth.jwt.secret,
    {
      expiresIn: config.auth.jwt.refreshExpiry,
      algorithm: config.auth.jwt.algorithm,
      issuer: 'fineprintai.com',
      audience: 'fineprintai-api'
    }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: jwt.decode(accessToken)?.exp || 0,
  };
};

// Enhanced MFA-aware token generation
export const generateMFATokens = (payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>, mfaVerified: boolean = false) => {
  const tokens = generateTokens(payload);
  
  // If MFA is verified, update the access token
  if (mfaVerified) {
    const decoded = jwt.decode(tokens.accessToken) as any;
    const updatedToken = jwt.sign(
      {
        ...decoded,
        mfaVerified: true,
        mfaTimestamp: Math.floor(Date.now() / 1000)
      },
      config.auth.jwt.secret,
      {
        expiresIn: config.auth.jwt.accessExpiry,
        algorithm: config.auth.jwt.algorithm,
        issuer: 'fineprintai.com',
        audience: 'fineprintai-api'
      }
    );
    
    tokens.accessToken = updatedToken;
  }
  
  return tokens;
};