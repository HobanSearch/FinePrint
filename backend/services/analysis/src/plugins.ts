import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';
import { config } from '@fineprintai/shared-config';
import redis from '@fastify/redis';

export async function setupPlugins(server: FastifyInstance) {
  // CORS
  await server.register(cors, {
    origin: config.security.cors.origin,
    credentials: config.security.cors.credentials,
    methods: config.security.cors.methods,
    allowedHeaders: config.security.cors.allowedHeaders,
  });

  // Security headers
  await server.register(helmet, {
    contentSecurityPolicy: config.security.helmet.contentSecurityPolicy,
    hsts: config.security.helmet.hsts,
  });

  // Rate limiting
  await server.register(rateLimit, {
    max: config.rateLimiting.global.max,
    timeWindow: config.rateLimiting.global.timeWindow,
    redis: redis,
    nameSpace: 'analysis-service-rl:',
    errorResponseBuilder: (request, context) => ({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
      retryAfter: Math.round(context.ttl / 1000),
    }),
  });

  // Redis for caching and rate limiting
  await server.register(redis, {
    host: config.redis.url.split('://')[1].split(':')[0],
    port: parseInt(config.redis.url.split(':')[2] || '6379'),
    namespace: 'analysis-service',
  });

  // File upload support
  await server.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
      files: 1,
    },
  });

  // OpenAPI documentation
  await server.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Fine Print AI - Analysis Service',
        description: 'Document analysis microservice with AI-powered legal document processing',
        version: '1.0.0',
        contact: {
          name: 'Fine Print AI Team',
          email: 'support@fineprintai.com',
        },
        license: {
          name: 'MIT',
        },
      },
      servers: [
        {
          url: `http://localhost:${config.services.analysis.port}`,
          description: 'Development server',
        },
        {
          url: 'https://api.fineprintai.com/analysis',
          description: 'Production server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
          },
        },
      },
      security: [
        { bearerAuth: [] },
        { apiKey: [] },
      ],
      tags: [
        {
          name: 'Analysis',
          description: 'Document analysis operations',
        },
        {
          name: 'Documents',
          description: 'Document management operations',
        },
        {
          name: 'Patterns',
          description: 'Pattern library operations',
        },
        {
          name: 'Health',
          description: 'Service health and monitoring',
        },
      ],
    },
  });

  // Swagger UI
  await server.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => {
      return swaggerObject;
    },
    transformSpecificationClone: true,
  });

  // Health check plugin
  server.get('/health', {
    schema: {
      tags: ['Health'],
      summary: 'Health check endpoint',
      description: 'Returns service health status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
            dependencies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  status: { type: 'string' },
                  responseTimeMs: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const startTime = Date.now();
    
    // Check dependencies
    const dependencies = [];
    
    // Check Redis
    try {
      const redisStart = Date.now();
      await server.redis.ping();
      dependencies.push({
        name: 'Redis',
        status: 'connected',
        responseTimeMs: Date.now() - redisStart,
      });
    } catch (error) {
      dependencies.push({
        name: 'Redis',
        status: 'disconnected',
        error: error.message,
      });
    }

    // Check Ollama
    try {
      const ollamaStart = Date.now();
      const response = await fetch(`${config.ai.ollama.url}/api/tags`);
      dependencies.push({
        name: 'Ollama',
        status: response.ok ? 'connected' : 'error',
        responseTimeMs: Date.now() - ollamaStart,
      });
    } catch (error) {
      dependencies.push({
        name: 'Ollama',
        status: 'disconnected',
        error: error.message,
      });
    }

    const isHealthy = dependencies.every(dep => dep.status === 'connected');

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.services.analysis.version,
      dependencies,
    };
  });

  // Ready check plugin
  server.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness check endpoint',
      description: 'Returns service readiness status',
      response: {
        200: {
          type: 'object',
          properties: {
            ready: { type: 'boolean' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    // Simple readiness check - service is ready if it can respond
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  });

  // Metrics endpoint
  server.get('/metrics', {
    schema: {
      tags: ['Health'],
      summary: 'Prometheus metrics endpoint',
      description: 'Returns service metrics in Prometheus format',
      response: {
        200: {
          type: 'string',
          description: 'Prometheus metrics',
        },
      },
    },
  }, async (request, reply) => {
    reply.header('Content-Type', 'text/plain');
    
    // Basic metrics - in production, you'd use a proper metrics library
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    return `
# HELP nodejs_process_uptime_seconds Process uptime in seconds
# TYPE nodejs_process_uptime_seconds counter
nodejs_process_uptime_seconds ${uptime}

# HELP nodejs_memory_usage_bytes Process memory usage in bytes
# TYPE nodejs_memory_usage_bytes gauge
nodejs_memory_usage_bytes{type="rss"} ${memUsage.rss}
nodejs_memory_usage_bytes{type="heapTotal"} ${memUsage.heapTotal}
nodejs_memory_usage_bytes{type="heapUsed"} ${memUsage.heapUsed}
nodejs_memory_usage_bytes{type="external"} ${memUsage.external}

# HELP fineprintai_analysis_service_info Service information
# TYPE fineprintai_analysis_service_info gauge
fineprintai_analysis_service_info{version="${config.services.analysis.version}",environment="${config.NODE_ENV}"} 1
`.trim();
  });
}