/**
 * Global Error Handler
 * Centralized error handling for the DevOps Agent service
 */

import { FastifyInstance } from 'fastify';
import { createContextLogger } from './logger';

const logger = createContextLogger('ErrorHandler');

export function setupErrorHandling(fastify: FastifyInstance): void {
  logger.info('Setting up global error handling...');

  // Global unhandled rejection handler
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection:', {
      reason,
      promise: promise.toString(),
      stack: reason instanceof Error ? reason.stack : undefined,
    });

    // In production, you might want to gracefully shutdown
    if (process.env.NODE_ENV === 'production') {
      logger.error('Shutting down due to unhandled promise rejection');
      process.exit(1);
    }
  });

  // Global uncaught exception handler
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', {
      error: error.message,
      stack: error.stack,
    });

    // Graceful shutdown
    logger.error('Shutting down due to uncaught exception');
    process.exit(1);
  });

  // Fastify error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: error.validation.map(v => ({
          field: v.instancePath,
          message: v.message,
          value: v.data,
        })),
      });
    }

    // Handle JWT errors
    if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER') {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authorization header is required',
      });
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid authorization token',
      });
    }

    if (error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        message: 'Authorization token has expired',
      });
    }

    // Handle rate limiting errors
    if (error.code === 'FST_TOO_MANY_REQUESTS') {
      return reply.status(429).send({
        success: false,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
      });
    }

    // Handle not found errors
    if (error.statusCode === 404) {
      return reply.status(404).send({
        success: false,
        error: 'Not Found',
        message: 'The requested resource was not found',
      });
    }

    // Handle known HTTP errors
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.name || 'Client Error',
        message: error.message,
      });
    }

    if (error.statusCode && error.statusCode >= 500) {
      return reply.status(error.statusCode).send({
        success: false,
        error: error.name || 'Server Error',
        message: error.message,
      });
    }

    // Handle specific application errors
    if (error.message.includes('deployment not found')) {
      return reply.status(404).send({
        success: false,
        error: 'Resource Not Found',
        message: error.message,
      });
    }

    if (error.message.includes('insufficient permissions')) {
      return reply.status(403).send({
        success: false,
        error: 'Forbidden',
        message: error.message,
      });
    }

    if (error.message.includes('quota exceeded')) {
      return reply.status(429).send({
        success: false,
        error: 'Quota Exceeded',
        message: error.message,
      });
    }

    // Handle timeout errors
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
      return reply.status(408).send({
        success: false,
        error: 'Request Timeout',
        message: 'The request timed out. Please try again.',
      });
    }

    // Handle connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return reply.status(503).send({
        success: false,
        error: 'Service Unavailable',
        message: 'Unable to connect to external service. Please try again later.',
      });
    }

    // Default server error
    return reply.status(500).send({
      success: false,
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : error.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: error.stack }),
    });
  });

  // Not found handler
  fastify.setNotFoundHandler(async (request, reply) => {
    logger.warn(`Route not found: ${request.method} ${request.url}`);
    
    return reply.status(404).send({
      success: false,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      suggestion: 'Check the API documentation at /docs for available endpoints',
    });
  });

  logger.info('Global error handling setup completed');
}

/**
 * Custom error classes for application-specific errors
 */
export class DevOpsAgentError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.name = 'DevOpsAgentError';
    this.statusCode = statusCode;
    this.code = code || 'DEVOPS_AGENT_ERROR';
  }
}

export class InfrastructureError extends DevOpsAgentError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'INFRASTRUCTURE_ERROR');
    this.name = 'InfrastructureError';
  }
}

export class PipelineError extends DevOpsAgentError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'PIPELINE_ERROR');
    this.name = 'PipelineError';
  }
}

export class KubernetesError extends DevOpsAgentError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'KUBERNETES_ERROR');
    this.name = 'KubernetesError';
  }
}

export class SecurityError extends DevOpsAgentError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'SECURITY_ERROR');
    this.name = 'SecurityError';
  }
}

export class MonitoringError extends DevOpsAgentError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, 'MONITORING_ERROR');
    this.name = 'MonitoringError';
  }
}

/**
 * Error reporting utility
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  logger.error('Error reported:', {
    error: error.message,
    stack: error.stack,
    context,
  });

  // In production, you might want to send errors to external monitoring service
  // like Sentry, Bugsnag, etc.
  if (process.env.NODE_ENV === 'production') {
    // Example: Sentry.captureException(error, { extra: context });
  }
}

/**
 * Async error wrapper for better error handling in async functions
 */
export function asyncErrorHandler<T extends any[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      reportError(error as Error, { args });
      throw error;
    }
  };
}

/**
 * Error boundary for critical operations
 */
export async function withErrorBoundary<T>(
  operation: () => Promise<T>,
  fallback?: () => T | Promise<T>,
  errorContext?: Record<string, any>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    reportError(error as Error, errorContext);
    
    if (fallback) {
      logger.warn('Using fallback due to error in operation');
      return await fallback();
    }
    
    throw error;
  }
}