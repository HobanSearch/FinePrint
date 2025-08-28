/**
 * Fastify plugins registration
 */

import type { FastifyInstance } from 'fastify'
import { logger } from './utils/logger.js'

export async function registerPlugins(fastify: FastifyInstance): Promise<void> {
  // Request logging middleware
  fastify.addHook('onRequest', async (request, reply) => {
    const start = Date.now()
    request.log = logger.child({
      requestId: generateRequestId(),
      method: request.method,
      url: request.url,
    })
    
    reply.log = request.log
    request.startTime = start
  })

  // Response logging middleware
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now())
    
    request.log.info({
      statusCode: reply.statusCode,
      duration,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    }, 'Request completed')
  })

  // Error logging middleware
  fastify.addHook('onError', async (request, reply, error) => {
    request.log.error(error, 'Request error occurred')
  })

  // Authentication middleware (if enabled)
  if (process.env.ENABLE_AUTH === 'true') {
    fastify.addHook('preHandler', async (request, reply) => {
      // Skip auth for health check and docs
      if (request.url === '/health' || request.url.startsWith('/docs')) {
        return
      }

      const apiKey = request.headers['x-api-key'] as string
      const authHeader = request.headers.authorization

      if (!apiKey && !authHeader) {
        reply.code(401).send({
          error: 'Unauthorized',
          message: 'API key or authorization header required',
        })
        return
      }

      // Validate API key or JWT token
      if (apiKey && !isValidApiKey(apiKey)) {
        reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid API key',
        })
        return
      }

      if (authHeader && !isValidJWT(authHeader)) {
        reply.code(401).send({
          error: 'Unauthorized',
          message: 'Invalid authorization token',
        })
        return
      }
    })
  }

  // CORS headers for WebSocket
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.headers.upgrade === 'websocket') {
      reply.header('Access-Control-Allow-Origin', '*')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
    }
  })

  // Request validation error handler
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error.validation) {
      reply.code(400).send({
        error: 'Validation Error',
        message: 'Request validation failed',
        details: error.validation,
      })
      return
    }

    if (error.statusCode && error.statusCode < 500) {
      reply.code(error.statusCode).send({
        error: error.name || 'Client Error',
        message: error.message,
      })
      return
    }

    // Log server errors
    logger.error(error, 'Unhandled server error')
    
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    })
  })
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function isValidApiKey(apiKey: string): boolean {
  // This would validate against configured API keys
  const validKeys = process.env.API_KEYS?.split(',') || []
  return validKeys.includes(apiKey)
}

function isValidJWT(authHeader: string): boolean {
  // This would validate JWT tokens
  // For now, just check format
  return authHeader.startsWith('Bearer ') && authHeader.length > 20
}

declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number
  }
}