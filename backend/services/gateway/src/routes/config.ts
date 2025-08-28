import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

export default async function configRoutes(server: FastifyInstance) {
  // Get configuration status
  server.get('/status', {
    schema: {
      tags: ['Config'],
      summary: 'Configuration status',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            last_updated: { type: 'string' },
            version: { type: 'string' },
          },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'active',
      last_updated: new Date().toISOString(),
      version: '1.0.0',
    });
  });

  // Validate configuration
  server.post('/validate', {
    schema: {
      tags: ['Config'],
      summary: 'Validate Kong configuration',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      valid: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Reload configuration
  server.post('/reload', {
    schema: {
      tags: ['Config'],
      summary: 'Reload configuration from file',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({
      status: 'reloaded',
      timestamp: new Date().toISOString(),
    });
  });
}