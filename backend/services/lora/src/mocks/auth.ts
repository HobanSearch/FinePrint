import { FastifyPluginAsync } from 'fastify';

// Extend FastifyRequest to include user property
declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; email: string };
  }
}

export const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Mock auth plugin - in production this would validate JWT tokens
  fastify.addHook('preHandler', async (request, reply) => {
    // Mock authentication - bypass for development
    request.user = { id: 'mock-user', email: 'test@fineprintai.com' };
  });
};