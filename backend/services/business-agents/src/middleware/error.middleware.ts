/**
 * Error Handling Middleware for Business Agents API
 */

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../utils/logger';
import { websocketService } from '../services/websocket.service';
import { AgentType } from '../types';

const logger = createLogger('error-middleware');

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  agentType?: AgentType;
}

export async function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const requestId = uuidv4();
  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_ERROR';

  // Log the error
  logger.error({
    requestId,
    statusCode,
    errorCode,
    path: request.url,
    method: request.method,
    error: {
      message: error.message,
      stack: error.stack,
      details: (error as AppError).details
    },
    msg: 'Request error'
  });

  // Broadcast error to WebSocket clients if agent-specific
  if ((error as AppError).agentType) {
    websocketService.broadcastError(
      (error as AppError).agentType!,
      {
        requestId,
        message: error.message,
        code: errorCode
      }
    );
  }

  // Prepare error response
  const response: any = {
    error: errorCode,
    message: error.message || 'An unexpected error occurred',
    statusCode,
    requestId,
    timestamp: new Date()
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
    response.details = (error as AppError).details;
  }

  // Send error response
  reply.code(statusCode).send(response);
}

export class BusinessAgentError extends Error implements AppError {
  statusCode: number;
  code: string;
  details?: any;
  agentType?: AgentType;

  constructor(
    message: string,
    statusCode = 500,
    code = 'BUSINESS_AGENT_ERROR',
    details?: any,
    agentType?: AgentType
  ) {
    super(message);
    this.name = 'BusinessAgentError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.agentType = agentType;
  }
}

export class ValidationError extends BusinessAgentError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends BusinessAgentError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends BusinessAgentError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends BusinessAgentError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class RateLimitError extends BusinessAgentError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class OllamaError extends BusinessAgentError {
  constructor(message: string, agentType: AgentType) {
    super(message, 503, 'OLLAMA_ERROR', undefined, agentType);
  }
}

export class CacheError extends BusinessAgentError {
  constructor(message: string) {
    super(message, 500, 'CACHE_ERROR');
  }
}

export function asyncErrorHandler(fn: Function) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await fn(request, reply);
    } catch (error) {
      if (error instanceof BusinessAgentError) {
        throw error;
      }
      
      // Convert unknown errors to BusinessAgentError
      throw new BusinessAgentError(
        error instanceof Error ? error.message : 'Unknown error',
        500,
        'INTERNAL_ERROR',
        error
      );
    }
  };
}