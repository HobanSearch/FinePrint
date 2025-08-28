import { FastifyInstance } from 'fastify';
import { analysisRoutes } from './analysis';
import { documentRoutes } from './documents';
import { patternRoutes } from './patterns';
import { unifiedRoutes } from './unified';

export async function registerRoutes(server: FastifyInstance) {
  // API v1 prefix - Original routes for backward compatibility
  await server.register(async function (server) {
    await server.register(analysisRoutes, { prefix: '/analysis' });
    await server.register(documentRoutes, { prefix: '/documents' });
    await server.register(patternRoutes, { prefix: '/patterns' });
  }, { prefix: '/api/v1' });

  // API v2 prefix - New unified routes
  await server.register(async function (server) {
    await server.register(unifiedRoutes, { prefix: '/' });
  }, { prefix: '/api/v2' });
}