import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../.env.test') });

// Set test timeouts
jest.setTimeout(300000); // 5 minutes default timeout for E2E tests

// Configure wait-for-expect
import waitForExpect from 'wait-for-expect';
waitForExpect.defaults.timeout = 30000; // 30 seconds
waitForExpect.defaults.interval = 1000; // Check every second

// Global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  retryAsync: async <T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> => {
    let lastError: Error | undefined;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await global.testUtils.delay(delay);
        }
      }
    }
    
    throw lastError || new Error('Retry failed');
  },

  waitForCondition: async (
    condition: () => boolean | Promise<boolean>,
    timeout = 30000,
    interval = 1000
  ): Promise<void> => {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const result = await condition();
      if (result) return;
      await global.testUtils.delay(interval);
    }
    
    throw new Error('Condition not met within timeout');
  }
};

// Mock external services if needed
if (process.env.MOCK_EXTERNAL_SERVICES === 'true') {
  jest.mock('axios', () => ({
    create: jest.fn(() => ({
      request: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() }
      }
    }))
  }));
}

// Setup console filtering for cleaner test output
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn
};

if (process.env.SILENT_TESTS === 'true') {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
} else {
  // Filter out noisy logs
  const logFilter = (type: 'log' | 'error' | 'warn') => {
    return (...args: any[]) => {
      const message = args[0]?.toString() || '';
      
      // Filter out common noisy messages
      const noisyPatterns = [
        /WebSocket/i,
        /Redis/i,
        /Kafka/i,
        /health check/i
      ];
      
      if (!noisyPatterns.some(pattern => pattern.test(message))) {
        originalConsole[type](...args);
      }
    };
  };

  console.log = logFilter('log');
  console.warn = logFilter('warn');
}

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Cleanup function for afterAll hooks
global.cleanupFunctions = [];

global.registerCleanup = (fn: () => Promise<void> | void) => {
  global.cleanupFunctions.push(fn);
};

global.runCleanup = async () => {
  for (const fn of global.cleanupFunctions) {
    try {
      await fn();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }
  global.cleanupFunctions = [];
};

// Performance monitoring
global.performanceMarks = new Map<string, number>();

global.markPerformance = (label: string) => {
  global.performanceMarks.set(label, Date.now());
};

global.measurePerformance = (label: string): number => {
  const start = global.performanceMarks.get(label);
  if (!start) {
    throw new Error(`No performance mark found for ${label}`);
  }
  return Date.now() - start;
};

// Test data cleanup tracker
global.testDataToCleanup = {
  experiments: [],
  agents: [],
  organizations: [],
  improvements: []
};

global.trackTestData = (type: string, id: string) => {
  const key = type as keyof typeof global.testDataToCleanup;
  if (key in global.testDataToCleanup) {
    global.testDataToCleanup[key].push(id);
  }
};

// Export types for TypeScript
declare global {
  var testUtils: {
    delay: (ms: number) => Promise<void>;
    retryAsync: <T>(
      fn: () => Promise<T>,
      maxRetries?: number,
      delay?: number
    ) => Promise<T>;
    waitForCondition: (
      condition: () => boolean | Promise<boolean>,
      timeout?: number,
      interval?: number
    ) => Promise<void>;
  };
  
  var cleanupFunctions: Array<() => Promise<void> | void>;
  var registerCleanup: (fn: () => Promise<void> | void) => void;
  var runCleanup: () => Promise<void>;
  
  var performanceMarks: Map<string, number>;
  var markPerformance: (label: string) => void;
  var measurePerformance: (label: string) => number;
  
  var testDataToCleanup: {
    experiments: string[];
    agents: string[];
    organizations: string[];
    improvements: string[];
  };
  var trackTestData: (type: string, id: string) => void;
}

export {};