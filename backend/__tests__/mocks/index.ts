/**
 * Centralized mock exports for Fine Print AI tests
 * Provides easy access to all mocks across the application
 */

// Database mocks
export { default as mockDatabase } from './database.mock';
export { default as mockRedis } from './redis.mock';
export { default as mockPrisma } from './prisma.mock';

// External service mocks
export { default as mockOllama } from './ollama.mock';
export { default as mockStripe } from './stripe.mock';
export { default as mockAuth0 } from './auth0.mock';
export { default as mockS3 } from './s3.mock';
export { default as mockElasticsearch } from './elasticsearch.mock';

// Internal service mocks
export { default as mockAnalysisService } from './services/analysis.mock';
export { default as mockBillingService } from './services/billing.mock';
export { default as mockNotificationService } from './services/notification.mock';
export { default as mockWebsocketService } from './services/websocket.mock';
export { default as mockGatewayService } from './services/gateway.mock';

// Utility mocks
export { default as mockLogger } from './utils/logger.mock';
export { default as mockMetrics } from './utils/metrics.mock';
export { default as mockQueue } from './utils/queue.mock';

// Mock factory functions
export { createMockUser, createMockDocument, createMockAnalysis } from './factories';

// Mock reset utilities
export { resetAllMocks, setupMockDefaults } from './utils/mock-utils';