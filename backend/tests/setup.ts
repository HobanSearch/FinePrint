/**
 * Jest Test Setup
 * Global setup for all tests
 */

import { config } from 'dotenv';
import path from 'path';

// Load test environment variables
config({ path: path.join(__dirname, '../.env/test.env') });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock timers for consistent testing
jest.useFakeTimers();

// Global test utilities
global.testUtils = {
  // Generate unique IDs for tests
  generateId: () => `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  
  // Wait utility
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Mock service URLs
  serviceUrls: {
    config: 'http://localhost:8001',
    memory: 'http://localhost:8002',
    logger: 'http://localhost:8003',
    auth: 'http://localhost:8004',
    dspy: 'http://localhost:8005',
    lora: 'http://localhost:8006',
    knowledgeGraph: 'http://localhost:8007',
    agentCoordination: 'http://localhost:8008',
    memoryPersistence: 'http://localhost:8009',
    externalIntegrations: 'http://localhost:8010',
  },
};

// Mock external services for unit tests
jest.mock('ioredis', () => require('ioredis-mock'));
jest.mock('@sendgrid/mail');
jest.mock('stripe');

// Extend Jest matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});

// Cleanup after all tests
afterAll(async () => {
  // Close any open handles
  jest.clearAllTimers();
});