import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { 
  AppError, 
  ValidationError, 
  NotFoundError, 
  UnauthorizedError, 
  ForbiddenError,
  RateLimitError 
} from '@fineprintai/shared-types';
import { config } from '@fineprintai/shared-config';

export const errorHandler = (
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) => {
  // Log error details
  request.log.error({
    error: {
      message: error.message,
      stack: error.stack,
      statusCode: error.statusCode,
    },
    request: {
      url: request.url,
      method: request.method,
      headers: request.headers,
      ip: request.ip,
    },
  }, 'Request error occurred');

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
    });
  }

  // Handle custom application errors
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: error.errorCode || error.name,
      message: error.message,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: error.validation,
    });
  }

  // Handle specific HTTP errors
  if (error.statusCode) {
    let errorCode = 'HTTP_ERROR';
    let message = error.message;

    switch (error.statusCode) {
      case 400:
        errorCode = 'BAD_REQUEST';
        break;
      case 401:
        errorCode = 'UNAUTHORIZED';
        message = 'Authentication required';
        break;
      case 403:
        errorCode = 'FORBIDDEN';
        message = 'Access denied';
        break;
      case 404:
        errorCode = 'NOT_FOUND';
        message = 'Resource not found';
        break;
      case 409:
        errorCode = 'CONFLICT';
        break;
      case 422:
        errorCode = 'UNPROCESSABLE_ENTITY';
        break;
      case 429:
        errorCode = 'RATE_LIMIT_EXCEEDED';
        message = 'Too many requests';
        break;
    }

    return reply.status(error.statusCode).send({
      success: false,
      error: errorCode,
      message,
    });
  }

  // Handle database connection errors
  if (error.message?.includes('ECONNREFUSED') || error.message?.includes('ENOTFOUND')) {
    request.log.error('Database connection error', { error: error.message });
    return reply.status(503).send({
      success: false,
      error: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable',
    });
  }

  // Handle timeout errors
  if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
    return reply.status(408).send({
      success: false,
      error: 'REQUEST_TIMEOUT',
      message: 'Request timeout',
    });
  }

  // Default internal server error
  const isDevelopment = config.NODE_ENV === 'development';
  
  return reply.status(500).send({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
    ...(isDevelopment && {
      details: {
        message: error.message,
        stack: error.stack,
      },
    }),
  });
};

export const notFoundHandler = (request: FastifyRequest, reply: FastifyReply) => {
  return reply.status(404).send({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${request.method} ${request.url} not found`,
  });
};

// Utility function to create standardized error responses
export const createErrorResponse = (
  statusCode: number,
  errorCode: string,
  message: string,
  details?: any
) => {
  return {
    success: false,
    error: errorCode,
    message,
    ...(details && { details }),
  };
};

// Async error wrapper for route handlers
export const asyncHandler = (fn: Function) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (error) {
      throw error;
    }
  };
};

// Error boundary for unhandled promise rejections
export const setupErrorHandling = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Graceful shutdown process
    process.exit(1);
  });
};