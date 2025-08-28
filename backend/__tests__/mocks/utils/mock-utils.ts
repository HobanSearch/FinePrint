/**
 * Mock utilities for centralized mock management
 * Provides functions to reset and configure mocks across the test suite
 */

import { jest } from '@jest/globals';

// Import all mocks that need to be managed
import mockDatabase from '../database.mock';
import mockRedis from '../redis.mock';
import mockPrisma from '../prisma.mock';
import mockOllama from '../ollama.mock';
import mockStripe from '../stripe.mock';

/**
 * Resets all mocks to their initial state
 * Should be called in beforeEach or afterEach in test files
 */
export function resetAllMocks(): void {
  // Clear all Jest mocks
  jest.clearAllMocks();
  jest.resetAllMocks();
  jest.restoreAllMocks();

  // Reset custom mock data
  if (mockDatabase && mockDatabase.__clearAllData) {
    mockDatabase.__clearAllData();
  }

  if (mockRedis && mockRedis.__clearAllData) {
    mockRedis.__clearAllData();
  }

  if (mockPrisma && mockPrisma.__clearAllData) {
    mockPrisma.__clearAllData();
  }

  if (mockOllama && mockOllama.__clearAllData) {
    mockOllama.__clearAllData();
  }

  if (mockStripe && mockStripe.__clearAllData) {
    mockStripe.__clearAllData();
  }
}

/**
 * Sets up default mock implementations and data
 * Should be called in beforeAll or setupFiles
 */
export function setupMockDefaults(): void {
  // Set up default environment variables for tests
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/fineprintai_test';
  process.env.REDIS_URL = 'redis://localhost:6379/1';
  process.env.OLLAMA_BASE_URL = 'http://localhost:11434';
  process.env.STRIPE_SECRET_KEY = 'sk_test_test_key';

  // Mock global timers if needed
  if (global.setTimeout && !global.setTimeout.toString().includes('[native code]')) {
    jest.useFakeTimers();
  }

  // Mock fetch globally
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({}),
    text: jest.fn().mockResolvedValue(''),
    headers: new Headers(),
  }) as any;

  // Mock console methods to reduce test noise
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    // Keep warn and error for important messages
    warn: console.warn,
    error: console.error,
  };
}

/**
 * Creates a mock implementation for async functions with customizable behavior
 */
export function createAsyncMock<T = any>(
  defaultValue?: T,
  shouldReject = false,
  delay = 0
): jest.MockedFunction<(...args: any[]) => Promise<T>> {
  return jest.fn().mockImplementation(async (...args: any[]) => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (shouldReject) {
      throw new Error('Mocked async function rejection');
    }
    
    return defaultValue;
  });
}

/**
 * Creates a mock for EventEmitter-like objects
 */
export function createEventEmitterMock(): any {
  const listeners: Record<string, Function[]> = {};
  
  return {
    on: jest.fn().mockImplementation((event: string, callback: Function) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    }),
    
    off: jest.fn().mockImplementation((event: string, callback: Function) => {
      if (listeners[event]) {
        const index = listeners[event].indexOf(callback);
        if (index > -1) {
          listeners[event].splice(index, 1);
        }
      }
    }),
    
    emit: jest.fn().mockImplementation((event: string, ...args: any[]) => {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(...args));
      }
    }),
    
    removeAllListeners: jest.fn().mockImplementation((event?: string) => {
      if (event) {
        delete listeners[event];
      } else {
        Object.keys(listeners).forEach(key => delete listeners[key]);
      }
    }),
    
    // Test utilities
    __getListeners: () => listeners,
    __triggerEvent: (event: string, ...args: any[]) => {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(...args));
      }
    },
  };
}

/**
 * Creates a mock for HTTP response objects
 */
export function createMockResponse(options: {
  status?: number;
  headers?: Record<string, string>;
  body?: any;
  json?: any;
} = {}): any {
  const response = {
    status: options.status || 200,
    statusText: options.status === 200 ? 'OK' : 'Error',
    ok: (options.status || 200) >= 200 && (options.status || 200) < 300,
    headers: new Map(Object.entries(options.headers || {})),
    
    json: jest.fn().mockResolvedValue(options.json || options.body || {}),
    text: jest.fn().mockResolvedValue(JSON.stringify(options.json || options.body || {})),
    blob: jest.fn().mockResolvedValue(new Blob()),
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
    
    // Additional methods
    clone: jest.fn().mockReturnValue(response),
  };
  
  return response;
}

/**
 * Creates a mock for HTTP request objects
 */
export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}): any {
  return {
    method: options.method || 'GET',
    url: options.url || '/test',
    headers: options.headers || {},
    body: options.body,
    params: options.params || {},
    query: options.query || {},
    
    // Fastify-specific properties
    log: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    
    // Express-style helpers
    get: jest.fn().mockImplementation((headerName: string) => 
      options.headers?.[headerName.toLowerCase()]
    ),
  };
}

/**
 * Creates a mock logger with all standard logging methods
 */
export function createMockLogger(): any {
  return {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
    
    // Structured logging
    child: jest.fn().mockReturnThis(),
    withFields: jest.fn().mockReturnThis(),
    
    // Level management
    level: 'info',
    setLevel: jest.fn(),
    
    // Test utilities
    __getCalls: function(level: string) {
      return this[level].mock.calls;
    },
    __getLastCall: function(level: string) {
      const calls = this[level].mock.calls;
      return calls[calls.length - 1];
    },
  };
}

/**
 * Creates a mock metrics collector
 */
export function createMockMetrics(): any {
  const metrics: Record<string, any> = {};
  
  return {
    increment: jest.fn().mockImplementation((name: string, value = 1, tags = {}) => {
      if (!metrics[name]) metrics[name] = { count: 0, tags: [] };
      metrics[name].count += value;
      metrics[name].tags.push(tags);
    }),
    
    decrement: jest.fn().mockImplementation((name: string, value = 1, tags = {}) => {
      if (!metrics[name]) metrics[name] = { count: 0, tags: [] };
      metrics[name].count -= value;
      metrics[name].tags.push(tags);
    }),
    
    gauge: jest.fn().mockImplementation((name: string, value: number, tags = {}) => {
      metrics[name] = { value, tags: [tags] };
    }),
    
    histogram: jest.fn().mockImplementation((name: string, value: number, tags = {}) => {
      if (!metrics[name]) metrics[name] = { values: [], tags: [] };
      metrics[name].values.push(value);
      metrics[name].tags.push(tags);
    }),
    
    timing: jest.fn().mockImplementation((name: string, value: number, tags = {}) => {
      if (!metrics[name]) metrics[name] = { timings: [], tags: [] };
      metrics[name].timings.push(value);
      metrics[name].tags.push(tags);
    }),
    
    // Test utilities
    __getMetrics: () => metrics,
    __getMetric: (name: string) => metrics[name],
    __clearMetrics: () => Object.keys(metrics).forEach(key => delete metrics[key]),
  };
}

/**
 * Waits for all pending promises to resolve
 * Useful for testing async operations
 */
export async function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

/**
 * Advances timers and flushes promises
 * Useful when testing with fake timers
 */
export async function advanceTimersAndFlush(ms: number = 0): Promise<void> {
  if (ms > 0) {
    jest.advanceTimersByTime(ms);
  } else {
    jest.runAllTimers();
  }
  await flushPromises();
}

/**
 * Creates a mock implementation that tracks call order
 */
export function createCallOrderTracker(): {
  mock: jest.MockedFunction<any>;
  getCallOrder: () => number[];
  resetCallOrder: () => void;
} {
  let callOrder: number[] = [];
  let callCount = 0;
  
  const mock = jest.fn().mockImplementation(() => {
    callOrder.push(++callCount);
  });
  
  return {
    mock,
    getCallOrder: () => [...callOrder],
    resetCallOrder: () => {
      callOrder = [];
      callCount = 0;
    },
  };
}

/**
 * Mock configuration for different test environments
 */
export const mockConfigs = {
  unit: {
    enableNetworkMocks: true,
    enableDatabaseMocks: true,
    enableTimerMocks: false,
    logLevel: 'error',
  },
  
  integration: {
    enableNetworkMocks: false,
    enableDatabaseMocks: false,
    enableTimerMocks: false,
    logLevel: 'warn',
  },
  
  e2e: {
    enableNetworkMocks: false,
    enableDatabaseMocks: false,
    enableTimerMocks: false,
    logLevel: 'info',
  },
};

/**
 * Applies mock configuration based on test type
 */
export function applyMockConfig(testType: keyof typeof mockConfigs): void {
  const config = mockConfigs[testType];
  
  if (config.enableTimerMocks) {
    jest.useFakeTimers();
  } else {
    jest.useRealTimers();
  }
  
  // Set log level
  if (global.console) {
    const shouldMockLogs = config.logLevel === 'error';
    if (shouldMockLogs) {
      global.console.log = jest.fn();
      global.console.info = jest.fn();
      global.console.debug = jest.fn();
    }
  }
}

/**
 * Validates that required environment variables are set for testing
 */
export function validateTestEnvironment(): void {
  const requiredEnvVars = [
    'NODE_ENV',
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
  ];
  
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for testing: ${missing.join(', ')}`
    );
  }
}