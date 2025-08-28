/**
 * Auth plugin for Memory Persistence Service
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email: string;
      role: string;
      permissions: string[];
    };
  }
}

async function authPlugin(fastify: FastifyInstance) {
  // Register JWT plugin
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key',
  });

  // Add authentication decorator
  fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });

  // Add authorization decorator
  fastify.decorate('authorize', (roles: string[]) => {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      if (!roles.includes(request.user.role)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    };
  });
}

export default fp(authPlugin, {
  name: 'auth',
});