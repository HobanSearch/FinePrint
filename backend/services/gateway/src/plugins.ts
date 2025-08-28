import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';

export async function setupPlugins(server: FastifyInstance) {
  // CORS - Allow cross-origin requests
  await server.register(cors, {
    origin: (origin, callback) => {
      const hostname = new URL(origin || '').hostname;
      
      // Allow localhost for development
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        callback(null, true);
        return;
      }
      
      // Allow Fine Print AI domains
      if (hostname === 'fineprintai.com' || hostname.endsWith('.fineprintai.com')) {
        callback(null, true);
        return;
      }
      
      // Block other origins
      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-API-Key',
      'X-Request-ID',
      'X-Forwarded-For'
    ],
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting for health endpoints
  await server.register(rateLimit, {
    global: false, // Don't apply globally
    max: 100, // requests
    timeWindow: '1 minute',
    errorResponseBuilder: (request, context) => ({
      code: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
      date: Date.now(),
      expiresIn: Math.round(context.ttl / 1000),
    }),
  });

  // Swagger documentation
  await server.register(swagger, {
    swagger: {
      info: {
        title: 'Fine Print AI Gateway Service',
        description: 'Health monitoring and administration for Kong API Gateway',
        version: '1.0.0',
      },
      host: 'localhost:8003',
      schemes: ['http', 'https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Health', description: 'Health check endpoints' },
        { name: 'Admin', description: 'Kong administration endpoints' },
        { name: 'Metrics', description: 'Monitoring and metrics endpoints' },
        { name: 'Config', description: 'Configuration management endpoints' },
      ],
      securityDefinitions: {
        ApiKeyAuth: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  });

  await server.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}