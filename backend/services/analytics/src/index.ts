/**
 * Fine Print AI - Analytics Service
 * 
 * Comprehensive analytics and business intelligence service providing:
 * - Product analytics (Mixpanel/Amplitude)
 * - Business intelligence pipelines
 * - Custom AI/ML performance tracking
 * - User behavior analytics
 * - Revenue analytics and cohort analysis
 * - A/B testing framework
 * - Performance monitoring
 * - Privacy-compliant data processing
 * - Real-time dashboards
 * - Automated reporting
 * - Predictive analytics
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import env from '@fastify/env';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import redis from '@fastify/redis';
import autoload from '@fastify/autoload';
import { join } from 'path';

import { config } from '@/config';
import { authMiddleware } from '@fineprintai/shared-middleware';
import { securityMiddleware } from '@fineprintai/shared-security';
import { setupAnalyticsWorkers } from '@/workers';
import { initializeCollectors } from '@/collectors';
import { logger } from '@/utils/logger';

// Environment schema for validation
const envSchema = {
  type: 'object',
  required: [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'REDIS_URL',
    'MIXPANEL_TOKEN',
    'AMPLITUDE_API_KEY'
  ],
  properties: {
    NODE_ENV: { type: 'string' },
    PORT: { type: 'number', default: 3007 },
    DATABASE_URL: { type: 'string' },
    REDIS_URL: { type: 'string' },
    MIXPANEL_TOKEN: { type: 'string' },
    AMPLITUDE_API_KEY: { type: 'string' },
    SNOWFLAKE_ACCOUNT: { type: 'string' },
    SNOWFLAKE_USERNAME: { type: 'string' },
    SNOWFLAKE_PASSWORD: { type: 'string' },
    CLICKHOUSE_HOST: { type: 'string' },
    CLICKHOUSE_USERNAME: { type: 'string' },
    CLICKHOUSE_PASSWORD: { type: 'string' },
    ELASTICSEARCH_URL: { type: 'string' }
  }
};

const fastify = Fastify({
  logger: logger,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'reqId',
  generateRequestId: () => crypto.randomUUID(),
  bodyLimit: 10485760, // 10MB
  keepAliveTimeout: 30000,
  connectionTimeout: 10000
});

async function buildApp() {
  try {
    // Register environment validation
    await fastify.register(env, {
      schema: envSchema,
      confKey: 'config'
    });

    // Security middleware
    await fastify.register(helmet, {
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
          frameSrc: ["'none'"]
        }
      }
    });

    // CORS configuration
    await fastify.register(cors, {
      origin: (origin, callback) => {
        const allowedOrigins = [
          'http://localhost:3000',
          'http://localhost:5173',
          'https://*.fineprintai.com'
        ];
        
        if (!origin || allowedOrigins.some(allowed => 
          allowed.includes('*') ? 
            origin.endsWith(allowed.replace('*.', '')) : 
            origin === allowed
        )) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    });

    // Redis connection
    await fastify.register(redis, {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      lazyConnect: true
    });

    // API Documentation
    await fastify.register(swagger, {
      swagger: {
        info: {
          title: 'Fine Print AI Analytics API',
          description: 'Comprehensive analytics and business intelligence API',
          version: '1.0.0',
          contact: {
            name: 'Fine Print AI Team',
            email: 'analytics@fineprintai.com'
          }
        },
        host: process.env.API_HOST || 'localhost:3007',
        schemes: ['https', 'http'],
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter: Bearer {token}'
          }
        },
        security: [{ Bearer: [] }],
        tags: [
          { name: 'Product Analytics', description: 'Product usage analytics' },
          { name: 'Business Intelligence', description: 'BI and reporting' },
          { name: 'AI Performance', description: 'AI/ML model performance' },
          { name: 'User Behavior', description: 'User behavior analytics' },
          { name: 'Revenue Analytics', description: 'Revenue and cohort analysis' },
          { name: 'A/B Testing', description: 'Feature experiments' },
          { name: 'Performance', description: 'System performance monitoring' },
          { name: 'Dashboards', description: 'Real-time dashboards' },
          { name: 'Reports', description: 'Automated reporting' },
          { name: 'Predictions', description: 'Predictive analytics' },
          { name: 'Data Governance', description: 'Data quality and governance' },
          { name: 'Exports', description: 'Data export capabilities' }
        ]
      }
    });

    await fastify.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
      transformSpecification: (swaggerObject) => {
        return swaggerObject;
      },
      transformSpecificationClone: true
    });

    // Authentication middleware
    await fastify.register(authMiddleware);
    
    // Security middleware
    await fastify.register(securityMiddleware);

    // Auto-load routes
    await fastify.register(autoload, {
      dir: join(__dirname, 'routes'),
      options: {
        prefix: '/api/v1'
      }
    });

    // Health check endpoint
    fastify.get('/health', {
      schema: {
        description: 'Health check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              services: {
                type: 'object',
                properties: {
                  database: { type: 'string' },
                  redis: { type: 'string' },
                  mixpanel: { type: 'string' },
                  amplitude: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }, async (request, reply) => {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: 'healthy',
          redis: fastify.redis.status,
          mixpanel: 'healthy',
          amplitude: 'healthy'
        }
      };

      return reply.code(200).send(health);
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      fastify.log.info(`Received ${signal}, starting graceful shutdown`);
      
      try {
        await fastify.close();
        fastify.log.info('Analytics service shut down successfully');
        process.exit(0);
      } catch (error) {
        fastify.log.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return fastify;
  } catch (error) {
    fastify.log.error('Error building app:', error);
    throw error;
  }
}

async function start() {
  try {
    const app = await buildApp();
    
    // Initialize analytics workers
    await setupAnalyticsWorkers();
    
    // Initialize data collectors
    await initializeCollectors();
    
    const address = await app.listen({
      port: Number(process.env.PORT) || 3007,
      host: '0.0.0.0'
    });
    
    app.log.info(`Analytics service started at ${address}`);
    app.log.info(`API documentation available at ${address}/docs`);
  } catch (error) {
    console.error('Failed to start analytics service:', error);
    process.exit(1);
  }
}

// Start the service
if (import.meta.url.startsWith('file://') && process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}

export { buildApp };