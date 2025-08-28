import { RedisClient } from './utils/redis.js';
import { DatabaseClient } from './utils/database.js';
import { DesignSystemEngine } from './engines/design-system-engine.js';
import { ComponentGenerator } from './generators/component-generator.js';
import { UXAnalyticsEngine } from './analytics/ux-analytics-engine.js';
import { AccessibilityAssistant } from './accessibility/accessibility-assistant.js';
import { FigmaIntegration } from './integrations/figma-integration.js';
import { ABTestingFramework } from './analytics/ab-testing-framework.js';
declare module 'fastify' {
    interface FastifyInstance {
        designSystemEngine: DesignSystemEngine;
        componentGenerator: ComponentGenerator;
        uxAnalyticsEngine: UXAnalyticsEngine;
        accessibilityAssistant: AccessibilityAssistant;
        figmaIntegration: FigmaIntegration;
        abTestingFramework: ABTestingFramework;
        redis: RedisClient;
        database: DatabaseClient;
    }
}
//# sourceMappingURL=index.d.ts.map