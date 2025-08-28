/**
 * DevOps Agent Routes
 * Main routing configuration for all DevOps automation endpoints
 */

import { FastifyInstance } from 'fastify';
import { createContextLogger } from '@/utils/logger';

// Import route modules
import healthRoutes from './health';
import infrastructureRoutes from './infrastructure';
import cicdRoutes from './cicd';
import kubernetesRoutes from './kubernetes';
import monitoringRoutes from './monitoring';
import securityRoutes from './security';
import costOptimizationRoutes from './cost-optimization';
import backupRoutes from './backup';
import gitopsRoutes from './gitops';
import multiCloudRoutes from './multi-cloud';
import metricsRoutes from './metrics';
import webhooksRoutes from './webhooks';

const logger = createContextLogger('Routes');

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  logger.info('Registering DevOps Agent routes...');

  try {
    // Health and status routes
    await fastify.register(healthRoutes, { prefix: '/health' });

    // Core DevOps functionality routes
    await fastify.register(infrastructureRoutes, { prefix: '/api/v1/infrastructure' });
    await fastify.register(cicdRoutes, { prefix: '/api/v1/cicd' });
    await fastify.register(kubernetesRoutes, { prefix: '/api/v1/kubernetes' });
    await fastify.register(monitoringRoutes, { prefix: '/api/v1/monitoring' });
    await fastify.register(securityRoutes, { prefix: '/api/v1/security' });

    // Additional features
    await fastify.register(costOptimizationRoutes, { prefix: '/api/v1/cost-optimization' });
    await fastify.register(backupRoutes, { prefix: '/api/v1/backup' });
    await fastify.register(gitopsRoutes, { prefix: '/api/v1/gitops' });
    await fastify.register(multiCloudRoutes, { prefix: '/api/v1/multi-cloud' });

    // Utility routes
    await fastify.register(metricsRoutes, { prefix: '/api/v1/metrics' });
    await fastify.register(webhooksRoutes, { prefix: '/api/v1/webhooks' });

    // API documentation
    await fastify.register(require('@fastify/swagger'), {
      swagger: {
        info: {
          title: 'Fine Print AI DevOps Agent API',
          description: 'Comprehensive DevOps automation and infrastructure management API',
          version: '1.0.0',
        },
        host: 'localhost:8015',
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'Health', description: 'Health check endpoints' },
          { name: 'Infrastructure', description: 'Infrastructure as Code operations' },
          { name: 'CI/CD', description: 'Continuous Integration/Deployment pipelines' },
          { name: 'Kubernetes', description: 'Kubernetes cluster management' },
          { name: 'Monitoring', description: 'Monitoring and observability' },
          { name: 'Security', description: 'Security automation and compliance' },
          { name: 'Cost Optimization', description: 'Resource cost optimization' },
          { name: 'Backup', description: 'Disaster recovery and backup' },
          { name: 'GitOps', description: 'GitOps workflow automation' },
          { name: 'Multi-Cloud', description: 'Multi-cloud management' },
          { name: 'Metrics', description: 'System metrics and analytics' },
          { name: 'Webhooks', description: 'Webhook integrations' },
        ],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
          },
        },
      },
    });

    await fastify.register(require('@fastify/swagger-ui'), {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false,
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
    });

    logger.info('All DevOps Agent routes registered successfully');

  } catch (error) {
    logger.error('Failed to register routes:', error);
    throw error;
  }
}

export default registerRoutes;