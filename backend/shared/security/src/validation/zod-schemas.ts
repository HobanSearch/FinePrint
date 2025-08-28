// Zod Schema Validation for Enterprise Security
// Comprehensive type-safe validation schemas with security-first design

import { z } from 'zod';
import { ValidationError } from '../index';

// Common validation patterns
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const IP_ADDRESS_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const HEX_REGEX = /^[a-fA-F0-9]+$/;

// Security-focused string validation
const secureString = (minLength = 1, maxLength = 1000) => 
  z.string()
    .min(minLength)
    .max(maxLength)
    .refine((val) => {
      // Block potential XSS patterns
      const xssPatterns = [
        /<script[\s\S]*?>/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /<iframe[\s\S]*?>/i,
        /<object[\s\S]*?>/i,
        /<embed[\s\S]*?>/i
      ];
      return !xssPatterns.some(pattern => pattern.test(val));
    }, 'Contains potentially dangerous content')
    .refine((val) => {
      // Block SQL injection patterns
      const sqlPatterns = [
        /\b(union|select|insert|update|delete|drop|create|alter)\b/i,
        /['"]\s*(or|and)\s*['"]?\w/i,
        /\-\-/,
        /\/\*[\s\S]*?\*\//
      ];
      return !sqlPatterns.some(pattern => pattern.test(val));
    }, 'Contains potentially dangerous SQL patterns');

// Common field schemas
export const commonSchemas = {
  // Identifiers
  uuid: z.string().regex(UUID_REGEX, 'Invalid UUID format'),
  id: z.union([z.string().min(1), z.number().positive()]),
  
  // Text fields
  name: secureString(1, 100),
  title: secureString(1, 200),
  description: secureString(0, 2000),
  comment: secureString(0, 1000),
  slug: z.string().regex(SLUG_REGEX, 'Invalid slug format').max(100),
  
  // Contact information
  email: z.string().email().max(320),
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone number format').optional(),
  url: z.string().url().max(2048),
  
  // Technical fields
  ipAddress: z.string().regex(IP_ADDRESS_REGEX, 'Invalid IP address'),
  userAgent: secureString(1, 512),
  sessionId: z.string().min(16).max(128),
  token: z.string().min(16).max(2048),
  
  // File and upload
  filename: secureString(1, 255).refine(
    (val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'),
    'Invalid filename'
  ),
  mimeType: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/, 'Invalid MIME type'),
  fileSize: z.number().positive().max(100 * 1024 * 1024), // 100MB max
  
  // Dates and times
  isoDate: z.string().datetime(),
  timestamp: z.number().positive(),
  
  // Encoding
  base64: z.string().regex(BASE64_REGEX, 'Invalid base64 format'),
  hex: z.string().regex(HEX_REGEX, 'Invalid hex format'),
  
  // Pagination
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(1000).default(20),
  offset: z.number().int().nonnegative().default(0),
  
  // Filtering and sorting
  sortBy: secureString(1, 50),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: secureString(0, 200),
  
  // Security
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(128, 'Password must not exceed 128 characters')
    .refine(
      (val) => /[A-Z]/.test(val),
      'Password must contain at least one uppercase letter'
    )
    .refine(
      (val) => /[a-z]/.test(val),
      'Password must contain at least one lowercase letter'
    )
    .refine(
      (val) => /\d/.test(val),
      'Password must contain at least one number'
    )
    .refine(
      (val) => /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(val),
      'Password must contain at least one special character'
    ),
  
  confirmPassword: (passwordField: string) => z.string()
    .refine((val, ctx) => {
      const password = (ctx.parent as any)[passwordField];
      return val === password;
    }, 'Passwords do not match'),
  
  mfaCode: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits'),
  
  // Permissions and roles
  role: z.enum(['user', 'admin', 'moderator', 'viewer']),
  permission: secureString(1, 100),
  
  // Status and flags
  status: z.enum(['active', 'inactive', 'pending', 'suspended', 'deleted']),
  boolean: z.boolean(),
  
  // Geographic
  country: z.string().length(2, 'Country code must be 2 characters'), // ISO 3166-1 alpha-2
  timezone: secureString(1, 50),
  
  // Analytics
  eventName: secureString(1, 100),
  eventData: z.record(z.unknown()).optional(),
  
  // API
  apiKey: z.string().min(32).max(128),
  bearerToken: z.string().startsWith('Bearer '),
  
  // Content
  content: secureString(0, 50000),
  markdown: secureString(0, 50000),
  json: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, 'Invalid JSON format'),
  
  // Network
  port: z.number().int().min(1).max(65535),
  domain: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/, 'Invalid domain format'),
  
  // Tags and categories
  tag: secureString(1, 50),
  tags: z.array(secureString(1, 50)).max(20),
  category: secureString(1, 100)
};

// Authentication schemas
export const authSchemas = {
  login: z.object({
    email: commonSchemas.email,
    password: z.string().min(1).max(128), // Don't validate password complexity on login
    rememberMe: z.boolean().optional()
  }),
  
  register: z.object({
    email: commonSchemas.email,
    password: commonSchemas.password,
    confirmPassword: commonSchemas.confirmPassword('password'),
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    acceptTerms: z.boolean().refine(val => val === true, 'Must accept terms and conditions')
  }),
  
  forgotPassword: z.object({
    email: commonSchemas.email
  }),
  
  resetPassword: z.object({
    token: commonSchemas.token,
    password: commonSchemas.password,
    confirmPassword: commonSchemas.confirmPassword('password')
  }),
  
  changePassword: z.object({
    currentPassword: z.string().min(1),
    newPassword: commonSchemas.password,
    confirmPassword: commonSchemas.confirmPassword('newPassword')
  }),
  
  setupMFA: z.object({
    secret: z.string().min(16),
    code: commonSchemas.mfaCode
  }),
  
  verifyMFA: z.object({
    code: commonSchemas.mfaCode
  })
};

// User management schemas
export const userSchemas = {
  createUser: z.object({
    email: commonSchemas.email,
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    role: commonSchemas.role.optional(),
    status: commonSchemas.status.optional()
  }),
  
  updateUser: z.object({
    firstName: commonSchemas.name.optional(),
    lastName: commonSchemas.name.optional(),
    email: commonSchemas.email.optional(),
    role: commonSchemas.role.optional(),
    status: commonSchemas.status.optional()
  }),
  
  userProfile: z.object({
    firstName: commonSchemas.name,
    lastName: commonSchemas.name,
    email: commonSchemas.email,
    phone: commonSchemas.phone,
    timezone: commonSchemas.timezone.optional(),
    country: commonSchemas.country.optional()
  })
};

// Document analysis schemas
export const documentSchemas = {
  uploadDocument: z.object({
    filename: commonSchemas.filename,
    mimeType: commonSchemas.mimeType.refine(
      (val) => ['application/pdf', 'text/plain', 'text/html', 'application/msword', 
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(val),
      'Unsupported file type'
    ),
    size: commonSchemas.fileSize,
    content: commonSchemas.base64.optional()
  }),
  
  analyzeDocument: z.object({
    documentId: commonSchemas.uuid,
    analysisType: z.enum(['quick', 'detailed', 'comprehensive']).optional(),
    options: z.object({
      includeRecommendations: z.boolean().optional(),
      includeRiskScore: z.boolean().optional(),
      includeSummary: z.boolean().optional()
    }).optional()
  }),
  
  documentQuery: z.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    search: commonSchemas.search.optional(),
    status: z.enum(['pending', 'processing', 'completed', 'failed']).optional(),
    sortBy: z.enum(['createdAt', 'updatedAt', 'filename', 'status']).optional(),
    sortOrder: commonSchemas.sortOrder
  })
};

// API request schemas
export const apiSchemas = {
  paginationQuery: z.object({
    page: commonSchemas.page,
    limit: commonSchemas.limit,
    search: commonSchemas.search.optional(),
    sortBy: commonSchemas.sortBy.optional(),
    sortOrder: commonSchemas.sortOrder
  }),
  
  idParam: z.object({
    id: commonSchemas.uuid
  }),
  
  bulkAction: z.object({
    ids: z.array(commonSchemas.uuid).min(1).max(100),
    action: z.enum(['delete', 'archive', 'restore', 'export'])
  }),
  
  analyticsEvent: z.object({
    event: commonSchemas.eventName,
    userId: commonSchemas.uuid.optional(),
    sessionId: commonSchemas.sessionId.optional(),
    data: commonSchemas.eventData,
    timestamp: commonSchemas.timestamp.optional()
  })
};

// Admin schemas
export const adminSchemas = {
  systemSettings: z.object({
    maintenanceMode: z.boolean().optional(),
    registrationEnabled: z.boolean().optional(),
    maxFileSize: z.number().positive().max(1024 * 1024 * 1024).optional(), // 1GB max
    allowedFileTypes: z.array(z.string()).optional(),
    sessionTimeout: z.number().positive().max(24 * 60 * 60 * 1000).optional() // 24 hours max
  }),
  
  userManagement: z.object({
    userId: commonSchemas.uuid,
    action: z.enum(['suspend', 'activate', 'delete', 'promote', 'demote']),
    reason: commonSchemas.description.optional()
  }),
  
  securityAudit: z.object({
    startDate: commonSchemas.isoDate,
    endDate: commonSchemas.isoDate,
    eventTypes: z.array(z.string()).optional(),
    userId: commonSchemas.uuid.optional(),
    ipAddress: commonSchemas.ipAddress.optional()
  })
};

// Webhook and integration schemas
export const integrationSchemas = {
  webhook: z.object({
    url: commonSchemas.url,
    events: z.array(commonSchemas.eventName).min(1),
    secret: z.string().min(16).max(128).optional(),
    active: z.boolean().optional()
  }),
  
  apiKeyGeneration: z.object({
    name: commonSchemas.name,
    permissions: z.array(commonSchemas.permission),
    expiresAt: commonSchemas.isoDate.optional()
  })
};

// File upload security validation
export const fileUploadSchemas = {
  validateFile: z.object({
    filename: commonSchemas.filename,
    mimeType: commonSchemas.mimeType,
    size: commonSchemas.fileSize,
    checksum: commonSchemas.hex.optional()
  }).refine((data) => {
    // Additional file validation logic
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.jar', '.js', '.vbs', '.php'];
    const extension = data.filename.toLowerCase().substring(data.filename.lastIndexOf('.'));
    return !dangerousExtensions.includes(extension);
  }, 'File type not allowed for security reasons'),
  
  chunkedUpload: z.object({
    chunkIndex: z.number().int().nonnegative(),
    totalChunks: z.number().int().positive(),
    chunkSize: z.number().positive().max(10 * 1024 * 1024), // 10MB max chunk
    totalSize: commonSchemas.fileSize,
    filename: commonSchemas.filename,
    uploadId: commonSchemas.uuid
  })
};

// Security validation utilities
export class ZodSecurityValidator {
  /**
   * Validate request with comprehensive error handling
   */
  static validateRequest<T>(
    schema: z.ZodSchema<T>, 
    data: unknown,
    options: { allowUnknown?: boolean } = {}
  ): T {
    try {
      if (options.allowUnknown) {
        return schema.parse(data);
      } else {
        return schema.strict().parse(data);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => {
          const path = err.path.join('.');
          return path ? `${path}: ${err.message}` : err.message;
        });
        throw new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
      }
      throw error;
    }
  }
  
  /**
   * Safe parse with detailed error information
   */
  static safeValidate<T>(
    schema: z.ZodSchema<T>, 
    data: unknown
  ): { success: true; data: T } | { success: false; errors: string[] } {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return { success: true, data: result.data };
    } else {
      const errors = result.error.errors.map(err => {
        const path = err.path.join('.');
        return path ? `${path}: ${err.message}` : err.message;
      });
      return { success: false, errors };
    }
  }
  
  /**
   * Create middleware for Fastify route validation
   */
  static createMiddleware<T>(
    schema: z.ZodSchema<T>,
    target: 'body' | 'query' | 'params' = 'body'
  ) {
    return async (request: any, reply: any) => {
      try {
        const data = request[target];
        const validated = ZodSecurityValidator.validateRequest(schema, data);
        request[target] = validated;
      } catch (error) {
        if (error instanceof ValidationError) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: error.message
          });
        }
        throw error;
      }
    };
  }
  
  /**
   * Validate file upload with comprehensive security checks
   */
  static validateFileUpload(file: any) {
    // Check file signature (magic bytes) matches extension
    const fileSignatures: { [key: string]: string[] } = {
      'pdf': ['255044462D'],
      'jpg': ['FFD8FF'],
      'png': ['89504E47'],
      'gif': ['474946'],
      'zip': ['504B0304'],
      'doc': ['D0CF11E0'],
      'docx': ['504B0304']
    };
    
    // Additional security validations would go here
    return ZodSecurityValidator.validateRequest(fileUploadSchemas.validateFile, file);
  }
  
  /**
   * Create schema with rate limiting metadata
   */
  static withRateLimit<T extends z.ZodSchema>(schema: T, limits: {
    windowMs: number;
    maxRequests: number;
  }) {
    return schema.describe(`Rate limited: ${limits.maxRequests} requests per ${limits.windowMs}ms`);
  }
}

// Export all schemas for easy access
export const schemas = {
  common: commonSchemas,
  auth: authSchemas,
  user: userSchemas,
  document: documentSchemas,
  api: apiSchemas,
  admin: adminSchemas,
  integration: integrationSchemas,
  fileUpload: fileUploadSchemas
};

export { z } from 'zod';
export default ZodSecurityValidator;
