import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { logger } from '../utils/logger';

/**
 * Middleware to validate request data using Zod schemas
 */
export const validateRequest = (
  schema: ZodSchema,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const validatedData = schema.parse(data);
      
      // Replace the original data with validated data
      (req as any)[source] = validatedData;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Request validation failed', {
          errors: error.errors,
          source,
          data: req[source],
        });

        return res.status(400).json({
          success: false,
          error: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        }) as any;
      }

      logger.error('Validation middleware error', { error });
      res.status(500).json({
        success: false,
        error: 'Validation error',
      }) as any;
    }
  };
};

/**
 * Middleware to sanitize and validate common parameters
 */
export const validateCommonParams = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    // Validate and sanitize pagination parameters
    if (req.query.limit) {
      const limit = parseInt(req.query.limit as string);
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return res.status(400).json({
          success: false,
          error: 'Invalid limit parameter (must be between 1 and 1000)',
        }) as any;
      }
      req.query.limit = limit.toString();
    }

    if (req.query.offset) {
      const offset = parseInt(req.query.offset as string);
      if (isNaN(offset) || offset < 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid offset parameter (must be >= 0)',
        }) as any;
      }
      req.query.offset = offset.toString();
    }

    // Validate date parameters
    if (req.query.startDate) {
      const startDate = new Date(req.query.startDate as string);
      if (isNaN(startDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid startDate parameter',
        }) as any;
      }
    }

    if (req.query.endDate) {
      const endDate = new Date(req.query.endDate as string);
      if (isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid endDate parameter',
        }) as any;
      }
    }

    // Validate date range
    if (req.query.startDate && req.query.endDate) {
      const startDate = new Date(req.query.startDate as string);
      const endDate = new Date(req.query.endDate as string);
      
      if (startDate > endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate must be before endDate',
        }) as any;
      }

      // Limit date range to 1 year
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      if (endDate.getTime() - startDate.getTime() > oneYear) {
        return res.status(400).json({
          success: false,
          error: 'Date range cannot exceed 1 year',
        }) as any;
      }
    }

    next();
  } catch (error) {
    logger.error('Parameter validation error', { error });
    res.status(500).json({
      success: false,
      error: 'Parameter validation error',
    }) as any;
  }
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid('Invalid UUID format'),

  // Email validation
  email: z.string().email('Invalid email format'),

  // Currency validation
  currency: z.string().length(3, 'Currency must be 3 characters').toUpperCase(),

  // Amount validation (in dollars, max 999,999.99)
  amount: z.number().min(0).max(999999.99),

  // Pagination
  pagination: z.object({
    limit: z.number().int().min(1).max(1000).default(50),
    offset: z.number().int().min(0).default(0),
  }),

  // Date range
  dateRange: z.object({
    startDate: z.string().transform(str => new Date(str)),
    endDate: z.string().transform(str => new Date(str)),
  }).refine(
    data => data.startDate <= data.endDate,
    'startDate must be before or equal to endDate'
  ),

  // Subscription tier
  subscriptionTier: z.enum(['free', 'starter', 'professional', 'team', 'enterprise']),

  // Payment method type
  paymentMethodType: z.enum(['card', 'sepa_debit', 'us_bank_account']),

  // Invoice status
  invoiceStatus: z.enum(['draft', 'open', 'paid', 'uncollectible', 'void']),
};

/**
 * Middleware to validate file uploads
 */
export const validateFileUpload = (
  allowedTypes: string[],
  maxSize: number = 5 * 1024 * 1024 // 5MB default
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files uploaded',
      }) as any;
    }

    const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();

    for (const file of files) {
      // Check file type
      if (!allowedTypes.includes((file as any).mimetype)) {
        return res.status(400).json({
          success: false,
          error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}`,
        }) as any;
      }

      // Check file size
      if ((file as any).size > maxSize) {
        return res.status(400).json({
          success: false,
          error: `File too large. Maximum size: ${maxSize / (1024 * 1024)}MB`,
        }) as any;
      }
    }

    next();
  };
};

/**
 * Middleware to validate API key format
 */
export const validateApiKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
    }) as any;
  }

  // API key format: fp_live_[32 characters] or fp_test_[32 characters]
  const apiKeyPattern = /^fp_(live|test)_[a-zA-Z0-9]{32}$/;

  if (!apiKeyPattern.test(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key format',
    }) as any;
  }

  next();
};

export default validateRequest;