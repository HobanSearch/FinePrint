/**
 * Test setup file
 * Configures test environment and mocks
 */

import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// Global test setup
beforeAll(() => {
  // Setup code that runs once before all tests
});

afterAll(() => {
  // Cleanup code that runs once after all tests
});

beforeEach(() => {
  // Setup code that runs before each test
});

afterEach(() => {
  // Cleanup code that runs after each test
});

// Mock fetch for integration tests
global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const response = {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
    headers: new Headers()
  };
  
  return response as Response;
};