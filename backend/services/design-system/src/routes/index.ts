/**
 * Main routes registration for Design System Service
 */

import type { FastifyInstance } from 'fastify'
import { designSystemRoutes } from './design-system.js'
import { componentGenerationRoutes } from './component-generation.js'
import { analyticsRoutes } from './analytics.js'
import { accessibilityRoutes } from './accessibility.js'
import { figmaRoutes } from './figma.js'
import { abTestingRoutes } from './ab-testing.js'
import { componentRegistryRoutes } from './component-registry.js'
import { webhookRoutes } from './webhooks.js'

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Register API routes with versioning
  await fastify.register(async function (fastify) {
    // Design System management
    await fastify.register(designSystemRoutes, { prefix: '/design-system' })
    
    // Component generation
    await fastify.register(componentGenerationRoutes, { prefix: '/generate' })
    
    // UX Analytics
    await fastify.register(analyticsRoutes, { prefix: '/analytics' })
    
    // Accessibility
    await fastify.register(accessibilityRoutes, { prefix: '/accessibility' })
    
    // Figma integration
    await fastify.register(figmaRoutes, { prefix: '/figma' })
    
    // A/B Testing
    await fastify.register(abTestingRoutes, { prefix: '/ab-testing' })
    
    // Component registry
    await fastify.register(componentRegistryRoutes, { prefix: '/registry' })
    
    // Webhooks
    await fastify.register(webhookRoutes, { prefix: '/webhooks' })
    
  }, { prefix: '/api/v1' })
}