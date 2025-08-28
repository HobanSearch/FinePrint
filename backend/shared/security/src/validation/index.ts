// Enhanced Input Validation Framework
// Comprehensive validation with Joi, Zod, and custom security validators

export * from './input-sanitizer';
export * from './zod-schemas';

// Re-export commonly used validation utilities
export { z } from 'zod';
export * as Joi from 'joi';

// Validation middleware factory
import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSecurityValidator, schemas } from './zod-schemas';
import { inputSanitizer } from './input-sanitizer';
import { ValidationError } from '../index';

/**
 * Create validation middleware for different request parts
 */
export const createValidationMiddleware = {
  /**
   * Validate request body
   */
  body: <T>(schema: any) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validated = ZodSecurityValidator.validateRequest(schema, request.body);
        request.body = validated;
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
  },

  /**
   * Validate query parameters
   */
  query: <T>(schema: any) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validated = ZodSecurityValidator.validateRequest(schema, request.query);
        request.query = validated;
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
  },

  /**
   * Validate URL parameters
   */
  params: <T>(schema: any) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const validated = ZodSecurityValidator.validateRequest(schema, request.params);
        request.params = validated;
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
  },

  /**
   * Validate and sanitize request data
   */
  sanitize: (context: 'html' | 'comment' | 'minimal' | 'none' = 'html') => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.body && typeof request.body === 'object') {
        // Sanitize all string fields in the request body
        const sanitizeObject = (obj: any): any => {
          if (typeof obj === 'string') {
            return inputSanitizer.sanitizeString(obj, {
              removeHtml: context !== 'html',
              removeSqlKeywords: true,
              normalizeWhitespace: true
            });
          } else if (Array.isArray(obj)) {
            return obj.map(sanitizeObject);
          } else if (obj && typeof obj === 'object') {
            const sanitized: any = {};
            for (const [key, value] of Object.entries(obj)) {
              sanitized[key] = sanitizeObject(value);
            }
            return sanitized;
          }
          return obj;
        };
        
        request.body = sanitizeObject(request.body);
      }
    };
  }
};

// Pre-configured validation middleware for common use cases
export const validationMiddleware = {
  // Authentication
  login: createValidationMiddleware.body(schemas.auth.login),
  register: createValidationMiddleware.body(schemas.auth.register),
  forgotPassword: createValidationMiddleware.body(schemas.auth.forgotPassword),
  resetPassword: createValidationMiddleware.body(schemas.auth.resetPassword),
  changePassword: createValidationMiddleware.body(schemas.auth.changePassword),
  
  // User management
  createUser: createValidationMiddleware.body(schemas.user.createUser),
  updateUser: createValidationMiddleware.body(schemas.user.updateUser),
  userProfile: createValidationMiddleware.body(schemas.user.userProfile),
  
  // Document operations
  uploadDocument: createValidationMiddleware.body(schemas.document.uploadDocument),
  analyzeDocument: createValidationMiddleware.body(schemas.document.analyzeDocument),
  documentQuery: createValidationMiddleware.query(schemas.document.documentQuery),
  
  // API common
  paginationQuery: createValidationMiddleware.query(schemas.api.paginationQuery),
  idParam: createValidationMiddleware.params(schemas.api.idParam),
  bulkAction: createValidationMiddleware.body(schemas.api.bulkAction),
  
  // File uploads
  fileUpload: createValidationMiddleware.body(schemas.fileUpload.validateFile),
  
  // Sanitization
  sanitizeHtml: createValidationMiddleware.sanitize('html'),
  sanitizeComment: createValidationMiddleware.sanitize('comment'),
  sanitizeMinimal: createValidationMiddleware.sanitize('minimal'),
  sanitizeNone: createValidationMiddleware.sanitize('none')
};

// Export schema collections for direct use
export { schemas };