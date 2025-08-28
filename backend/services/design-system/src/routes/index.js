import { designSystemRoutes } from './design-system.js';
import { componentGenerationRoutes } from './component-generation.js';
import { analyticsRoutes } from './analytics.js';
import { accessibilityRoutes } from './accessibility.js';
import { figmaRoutes } from './figma.js';
import { abTestingRoutes } from './ab-testing.js';
import { componentRegistryRoutes } from './component-registry.js';
import { webhookRoutes } from './webhooks.js';
export async function registerRoutes(fastify) {
    await fastify.register(async function (fastify) {
        await fastify.register(designSystemRoutes, { prefix: '/design-system' });
        await fastify.register(componentGenerationRoutes, { prefix: '/generate' });
        await fastify.register(analyticsRoutes, { prefix: '/analytics' });
        await fastify.register(accessibilityRoutes, { prefix: '/accessibility' });
        await fastify.register(figmaRoutes, { prefix: '/figma' });
        await fastify.register(abTestingRoutes, { prefix: '/ab-testing' });
        await fastify.register(componentRegistryRoutes, { prefix: '/registry' });
        await fastify.register(webhookRoutes, { prefix: '/webhooks' });
    }, { prefix: '/api/v1' });
}
//# sourceMappingURL=index.js.map