import { jest } from '@jest/globals';

// Global test setup
beforeAll(async () => {
  // Setup test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  
  // Mock environment variables
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
  process.env.ENCRYPTION_KEY = 'test-encryption-key-for-testing';
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  process.env.DSPY_SERVICE_URL = 'http://localhost:3001';
  process.env.LORA_SERVICE_URL = 'http://localhost:3002';
  process.env.KNOWLEDGE_GRAPH_URL = 'http://localhost:3003';
});

afterAll(async () => {
  // Cleanup after all tests
});

// Mock external dependencies
jest.mock('axios', () => ({
  create: jest.fn(() => ({
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
    defaults: {
      headers: {},
    },
  })),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    keys: jest.fn(),
    on: jest.fn(),
    quit: jest.fn(),
    status: 'ready',
  }));
});

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    rm: jest.fn(),
    copyFile: jest.fn(),
  },
}));

// Global test utilities
global.testUtils = {
  createMockRequest: (overrides = {}) => ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { id: 'test-user-id', email: 'test@example.com', role: 'user' },
    ip: '127.0.0.1',
    id: 'test-request-id',
    ...overrides,
  }),
  
  createMockReply: () => {
    const reply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };
    return reply;
  },
  
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  mockImplementationOnce: (mock: any, implementation: any) => {
    mock.mockImplementationOnce(implementation);
  },
};

// Extend global types
declare global {
  var testUtils: {
    createMockRequest: (overrides?: any) => any;
    createMockReply: () => any;
    delay: (ms: number) => Promise<void>;
    mockImplementationOnce: (mock: any, implementation: any) => void;
  };
}