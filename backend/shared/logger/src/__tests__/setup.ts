/**
 * Test setup for Fine Print AI Logging System
 * Configures test environment and mocks
 */

import { jest } from '@jest/globals';

// Mock external dependencies
jest.mock('@opentelemetry/sdk-node');
jest.mock('@opentelemetry/exporter-jaeger');
jest.mock('nodemailer');
jest.mock('ws');
jest.mock('ioredis');

// Global test configuration
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_logger';

// Increase timeout for integration tests
jest.setTimeout(30000);

// Global beforeEach setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

// Global afterEach cleanup
afterEach(() => {
  // Clean up any test artifacts
});

// Export common test utilities
export const mockLogEntry = {
  id: 'test-log-id',
  timestamp: new Date(),
  level: 'info' as const,
  message: 'Test log message',
  category: 'technical' as const,
  context: {
    service: 'test-service' as const,
    environment: 'test' as const,
    requestId: 'test-request-id',
  },
};

export const mockMetricData = {
  name: 'test-metric',
  value: 100,
  timestamp: new Date(),
  labels: { service: 'test-service' },
};

export const waitFor = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));