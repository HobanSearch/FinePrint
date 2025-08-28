import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { prometheusRegister } from '../monitoring/metrics';

export async function metricsRoutes(server: FastifyInstance): Promise<void> {
  // Prometheus metrics endpoint
  server.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header('Content-Type', prometheusRegister.contentType);
    return prometheusRegister.metrics();
  });

  // JSON metrics summary
  server.get('/json', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = await prometheusRegister.getMetricsAsJSON();
    return { metrics };
  });
}