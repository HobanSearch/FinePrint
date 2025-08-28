const { TextEncoder, TextDecoder } = require('util');

// Global test setup
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Mock process.env for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fineprintai_test';
process.env.REDIS_URL = 'redis://localhost:6379/1';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.OLLAMA_BASE_URL = 'http://localhost:11434';

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Jest custom matchers
expect.extend({
  toBeValidUUID(received) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const pass = uuidRegex.test(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid UUID`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid UUID`,
        pass: false,
      };
    }
  },
  
  toBeValidTimestamp(received) {
    const date = new Date(received);
    const pass = !isNaN(date.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid timestamp`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid timestamp`,
        pass: false,
      };
    }
  },
  
  toHaveValidAnalysisStructure(received) {
    const requiredFields = ['id', 'status', 'documentId', 'createdAt'];
    const hasRequiredFields = requiredFields.every(field => field in received);
    const hasValidStatus = ['pending', 'processing', 'completed', 'failed'].includes(received.status);
    
    const pass = hasRequiredFields && hasValidStatus;
    
    if (pass) {
      return {
        message: () => `expected ${JSON.stringify(received)} not to have valid analysis structure`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${JSON.stringify(received)} to have valid analysis structure`,
        pass: false,
      };
    }
  }
});

// Increase timeout for integration tests
jest.setTimeout(30000);

// Suppress console logs during tests unless VERBOSE=true
if (!process.env.VERBOSE) {
  console.log = jest.fn();
  console.info = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
}