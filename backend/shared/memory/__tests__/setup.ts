/**
 * Jest test setup for Memory Service
 */

// Increase timeout for database operations
jest.setTimeout(30000);

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://localhost:5432/fineprint_memory_test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.REDIS_DB = '1'; // Use different DB for tests

// Global test utilities
global.beforeEach(() => {
  // Reset metrics before each test
  const { Metrics } = require('../src/utils/metrics');
  Metrics.getInstance().reset();
});

global.afterAll(async () => {
  // Cleanup any global resources
  console.log('Test cleanup completed');
});