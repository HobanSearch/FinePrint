import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function healthRoutes(server: FastifyInstance) {
  // Basic health check
  server.get('/', {
    schema: {
      tags: ['Health'],
      summary: 'Basic health check',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            uptime: { type: 'number' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  // Readiness probe
  server.get('/ready', {
    schema: {
      tags: ['Health'],
      summary: 'Readiness probe for Kubernetes',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' },
            timestamp: { type: 'string' },
          },
        },
        503: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            checks: { type: 'object' },
            timestamp: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check Kong admin API
      const kongHealth = await checkKongHealth();
      
      // Check Redis connectivity
      const redisHealth = await checkRedisHealth();
      
      // Check backend services
      const servicesHealth = await checkBackendServices();

      const checks = {
        kong: kongHealth,
        redis: redisHealth,
        services: servicesHealth,
      };

      const allHealthy = Object.values(checks).every(check => check.status === 'healthy');

      reply.code(allHealthy ? 200 : 503).send({
        status: allHealthy ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      reply.code(503).send({
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Liveness probe
  server.get('/live', {
    schema: {
      tags: ['Health'],
      summary: 'Liveness probe for Kubernetes',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            timestamp: { type: 'string' },
            pid: { type: 'number' },
            memory: { type: 'object' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const memoryUsage = process.memoryUsage();
    
    reply.send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      },
    });
  });

  // Detailed health check
  server.get('/detailed', {
    schema: {
      tags: ['Health'],
      summary: 'Detailed health check with all components',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            components: { type: 'object' },
            timestamp: { type: 'string' },
            duration: { type: 'number' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    
    try {
      const [kong, redis, services, metrics] = await Promise.allSettled([
        checkKongHealth(),
        checkRedisHealth(),
        checkBackendServices(),
        checkMetricsHealth(),
      ]);

      const components = {
        kong: kong.status === 'fulfilled' ? kong.value : { status: 'unhealthy', error: kong.reason },
        redis: redis.status === 'fulfilled' ? redis.value : { status: 'unhealthy', error: redis.reason },
        services: services.status === 'fulfilled' ? services.value : { status: 'unhealthy', error: services.reason },
        metrics: metrics.status === 'fulfilled' ? metrics.value : { status: 'unhealthy', error: metrics.reason },
      };

      const overallStatus = Object.values(components).every(
        component => component.status === 'healthy'
      ) ? 'healthy' : 'degraded';

      reply.send({
        status: overallStatus,
        components,
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });
    } catch (error) {
      reply.code(503).send({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
      });
    }
  });
}

// Health check helper functions
async function checkKongHealth() {
  try {
    const response = await fetch(`${process.env.KONG_ADMIN_URL || 'http://localhost:8001'}/status`);
    if (response.ok) {
      const data = await response.json();
      return {
        status: 'healthy',
        version: data.version,
        hostname: data.hostname,
        plugins: data.plugins?.available_on_server?.length || 0,
      };
    }
    throw new Error(`Kong admin API returned ${response.status}`);
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkRedisHealth() {
  try {
    // This would be implemented with actual Redis client
    // For now, return mock health check
    return {
      status: 'healthy',
      latency: Math.floor(Math.random() * 10), // ms
      memory: '100MB',
      connections: 5,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkBackendServices() {
  const services = [
    'analysis-service',
    'monitoring-service',
    'notification-service',
    'billing-service',
    'user-service',
  ];

  const serviceChecks = await Promise.allSettled(
    services.map(async (service) => {
      try {
        const response = await fetch(`http://${service}:${getServicePort(service)}/health`, {
          timeout: 5000,
        });
        return {
          name: service,
          status: response.ok ? 'healthy' : 'unhealthy',
          responseTime: response.headers.get('x-response-time') || 'unknown',
        };
      } catch (error) {
        return {
          name: service,
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    })
  );

  const results = serviceChecks.map(check => 
    check.status === 'fulfilled' ? check.value : {
      name: 'unknown',
      status: 'unhealthy',
      error: check.reason,
    }
  );

  return {
    status: results.every(service => service.status === 'healthy') ? 'healthy' : 'degraded',
    services: results,
    total: services.length,
    healthy: results.filter(service => service.status === 'healthy').length,
  };
}

async function checkMetricsHealth() {
  try {
    const response = await fetch(`http://localhost:${process.env.METRICS_PORT || 9090}/metrics`);
    if (response.ok) {
      return {
        status: 'healthy',
        endpoint: `/metrics`,
        contentType: response.headers.get('content-type'),
      };
    }
    throw new Error(`Metrics endpoint returned ${response.status}`);
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function getServicePort(service: string): number {
  const portMap: Record<string, number> = {
    'analysis-service': 3001,
    'monitoring-service': 3002,
    'notification-service': 3003,
    'billing-service': 3004,
    'user-service': 3005,
  };
  return portMap[service] || 3000;
}