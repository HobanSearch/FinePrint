import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import config from '../config';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export interface AuthenticatedUser {
  userId: string;
  email: string;
  subscriptionTier: string;
  isAdmin?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware to authenticate API requests using JWT tokens
 */
export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Missing or invalid authorization header',
      }) as any;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token payload',
      }) as any;
    }

    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        status: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      }) as any;
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Account is not active',
      }) as any;
    }

    // Attach user to request
    req.user = {
      userId: user.id,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      isAdmin: decoded.isAdmin || false,
    };

    next();

  } catch (error) {
    logger.error('Authentication failed', { error });

    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      }) as any;
    }

    res.status(500).json({
      success: false,
      error: 'Authentication error',
    }) as any;
  }
};

/**
 * Middleware to require admin privileges
 */
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Admin privileges required',
    }) as any;
  }

  next();
};

/**
 * Middleware to check subscription tier requirements
 */
export const requireSubscriptionTier = (requiredTiers: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userTier = req.user?.subscriptionTier;

    if (!userTier || !requiredTiers.includes(userTier)) {
      return res.status(403).json({
        success: false,
        error: `This feature requires one of the following subscription tiers: ${requiredTiers.join(', ')}`,
        requiredTiers,
        currentTier: userTier,
      }) as any;
    }

    next();
  };
};

/**
 * Optional authentication middleware (doesn't fail if no token provided)
 */
export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // No auth provided, continue without user
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, config.JWT_SECRET) as any;

    if (decoded.userId) {
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          subscriptionTier: true,
          status: true,
        },
      });

      if (user && user.status === 'active') {
        req.user = {
          userId: user.id,
          email: user.email,
          subscriptionTier: user.subscriptionTier,
          isAdmin: decoded.isAdmin || false,
        };
      }
    }

    next();

  } catch (error) {
    // Ignore auth errors in optional middleware
    next();
  }
};

export default authMiddleware;