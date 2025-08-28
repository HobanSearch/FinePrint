/**
 * Validation Middleware for Business Agents API
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { createLogger } from '../utils/logger';

const logger = createLogger('validation-middleware');

export function validateBody<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.body);
      request.body = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          type: err.code
        }));

        logger.warn({
          path: request.url,
          errors,
          msg: 'Validation failed'
        });

        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          errors
        });
      }

      logger.error('Unexpected validation error:', error);
      return reply.code(500).send({
        error: 'VALIDATION_ERROR',
        message: 'An unexpected error occurred during validation'
      });
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.query);
      request.query = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          type: err.code
        }));

        logger.warn({
          path: request.url,
          errors,
          msg: 'Query validation failed'
        });

        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'Query parameter validation failed',
          errors
        });
      }

      logger.error('Unexpected query validation error:', error);
      return reply.code(500).send({
        error: 'VALIDATION_ERROR',
        message: 'An unexpected error occurred during query validation'
      });
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const validated = schema.parse(request.params);
      request.params = validated;
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          type: err.code
        }));

        logger.warn({
          path: request.url,
          errors,
          msg: 'Params validation failed'
        });

        return reply.code(400).send({
          error: 'VALIDATION_ERROR',
          message: 'URL parameter validation failed',
          errors
        });
      }

      logger.error('Unexpected params validation error:', error);
      return reply.code(500).send({
        error: 'VALIDATION_ERROR',
        message: 'An unexpected error occurred during parameter validation'
      });
    }
  };
}