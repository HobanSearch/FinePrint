import { FastifyInstance } from 'fastify';
import { leadsRoutes } from './leads';
import { opportunitiesRoutes } from './opportunities';
import { forecastingRoutes } from './forecasting';
import { automationRoutes } from './automation';
import { analyticsRoutes } from './analytics';
import { proposalsRoutes } from './proposals';
import { crmRoutes } from './crm';

export async function registerRoutes(fastify: FastifyInstance) {
  // Register all route modules
  await fastify.register(leadsRoutes, { prefix: '/api/v1/leads' });
  await fastify.register(opportunitiesRoutes, { prefix: '/api/v1/opportunities' });
  await fastify.register(forecastingRoutes, { prefix: '/api/v1/forecasting' });
  await fastify.register(automationRoutes, { prefix: '/api/v1/automation' });
  await fastify.register(analyticsRoutes, { prefix: '/api/v1/analytics' });
  await fastify.register(proposalsRoutes, { prefix: '/api/v1/proposals' });
  await fastify.register(crmRoutes, { prefix: '/api/v1/crm' });
}

export * from './leads';
export * from './opportunities';
export * from './forecasting';
export * from './automation';
export * from './analytics';
export * from './proposals';
export * from './crm';