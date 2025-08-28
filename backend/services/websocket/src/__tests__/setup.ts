// Test setup file
import { jest } from '@jest/globals';

// Mock external dependencies
jest.mock('@fineprintai/shared-logger', () => ({
  createServiceLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    cacheHit: jest.fn(),
    cacheMiss: jest.fn(),
  })),
}));

jest.mock('@fineprintai/shared-cache', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    increment: jest.fn(),
    decrement: jest.fn(),
    keys: jest.fn(),
    publish: jest.fn(),
    lpush: jest.fn(),
    rpush: jest.fn(),
    lpop: jest.fn(),
    rpop: jest.fn(),
    lrange: jest.fn(),
    disconnect: jest.fn(),
    ping: jest.fn(),
  },
}));

jest.mock('@fineprintai/shared-config', () => ({
  config: {
    NODE_ENV: 'test',
    services: {
      websocket: {
        name: 'websocket-service',
        version: '1.0.0',
        port: 8080,
      },
    },
    websocket: {
      path: '/socket.io',
      maxConnections: 1000,
      heartbeat: {
        interval: 25000,
        timeout: 60000,
      },
    },
    redis: {
      url: 'redis://localhost:6379',
      host: 'localhost',
      port: 6379,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
    },
    cors: {
      origins: ['http://localhost:3000'],
    },
    jwt: {
      secret: 'test-secret',
    },
    rateLimiting: {
      websocket: {
        max: 60,
        window: 60000,
      },
    },
  },
}));

// Mock Socket.io
jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
    to: jest.fn(() => ({
      emit: jest.fn(),
    })),
    adapter: jest.fn(),
    disconnectSockets: jest.fn(),
    close: jest.fn(),
    sockets: {
      sockets: new Map(),
      adapter: {
        rooms: new Map(),
      },
    },
  })),
}));

// Mock Redis adapter
jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(),
}));

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    quit: jest.fn(),
    ping: jest.fn(),
    duplicate: jest.fn(() => ({
      connect: jest.fn(),
    })),
  })),
}));

// Mock Bull queue
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn(() => ({ id: 'job-123' })),
    process: jest.fn(),
    getJobs: jest.fn(() => []),
    getWaiting: jest.fn(() => []),
    getActive: jest.fn(() => []),
    getCompleted: jest.fn(() => []),
    getFailed: jest.fn(() => []),
    getDelayed: jest.fn(() => []),
    isPaused: jest.fn(() => false),
    close: jest.fn(),
    on: jest.fn(),
  }));
});

// Mock JWT
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({
    userId: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })),
  sign: jest.fn(() => 'test-token'),
}));

// Global test setup
beforeAll(() => {
  // Suppress console output during tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  // Restore console output
  jest.restoreAllMocks();
});

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});