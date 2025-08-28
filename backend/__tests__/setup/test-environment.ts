/**
 * Test environment configuration for Fine Print AI
 * Sets up global test environment variables and utilities
 */

import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

// Global test configuration
const TEST_CONFIG = {
  // Database configuration
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/fineprintai_test',
  REDIS_URL: process.env.TEST_REDIS_URL || 'redis://localhost:6379/1',
  
  // API configuration
  API_BASE_URL: process.env.TEST_API_URL || 'http://localhost:3001',
  JWT_SECRET: process.env.TEST_JWT_SECRET || 'test-jwt-secret-key-for-testing-only',
  
  // AI/LLM configuration
  OLLAMA_BASE_URL: process.env.TEST_OLLAMA_URL || 'http://localhost:11434',
  TEST_MODEL: process.env.TEST_MODEL || 'phi:2.7b',
  
  // Performance thresholds
  API_RESPONSE_THRESHOLD: 500, // ms
  ANALYSIS_PROCESSING_THRESHOLD: 10000, // ms
  
  // Test data limits
  MAX_DOCUMENT_SIZE: 1024 * 1024, // 1MB for tests
  MAX_TEST_DOCUMENTS: 10,
  
  // Security configuration
  SECURITY_SCAN_ENABLED: process.env.SECURITY_SCAN_ENABLED === 'true',
  
  // Chaos testing configuration
  CHAOS_TESTING_ENABLED: process.env.CHAOS_TESTING_ENABLED === 'true',
  
  // CI/CD configuration
  IS_CI: !!process.env.CI,
  CI_TIMEOUT_MULTIPLIER: process.env.CI ? 2 : 1,
} as const;

// Global test utilities
global.TEST_CONFIG = TEST_CONFIG;

// Mock console methods in CI to reduce noise
if (TEST_CONFIG.IS_CI) {
  const originalConsole = global.console;
  global.console = {
    ...originalConsole,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: originalConsole.warn,
    error: originalConsole.error,
  };
}

// Global test timeout adjustment for CI
jest.setTimeout(30000 * TEST_CONFIG.CI_TIMEOUT_MULTIPLIER);

// Performance monitoring utilities
global.measurePerformance = <T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> => {
  return new Promise(async (resolve) => {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
    
    resolve({ result, duration });
  });
};

// Memory usage monitoring
global.getMemoryUsage = (): NodeJS.MemoryUsage => {
  return process.memoryUsage();
};

// Test data generators
global.generateTestUser = (overrides: Record<string, any> = {}) => ({
  id: `test-user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  email: `test-${Date.now()}-${Math.random().toString(36).substr(2, 5)}@example.com`,
  firstName: 'Test',
  lastName: 'User',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

global.generateTestDocument = (overrides: Record<string, any> = {}) => ({
  id: `test-doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  title: `Test Document ${Date.now()}`,
  type: 'terms-of-service',
  content: 'This is a test document for testing purposes.',
  language: 'en',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

global.generateTestAnalysis = (overrides: Record<string, any> = {}) => ({
  id: `test-analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  documentId: `test-doc-${Date.now()}`,
  status: 'completed',
  overallRiskScore: Math.floor(Math.random() * 100),
  findings: [],
  executiveSummary: 'Test analysis summary',
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  ...overrides,
});

global.generateTestFinding = (overrides: Record<string, any> = {}) => ({
  id: `test-finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  category: 'data-usage',
  title: 'Test Finding',
  description: 'This is a test finding for testing purposes.',
  severity: 'medium',
  confidence: 0.85,
  location: { start: 0, end: 100 },
  recommendation: 'Test recommendation',
  ...overrides,
});

// Test database utilities
global.cleanupTestData = async () => {
  // This will be implemented based on the actual database client
  // For now, it's a placeholder
  console.log('Cleaning up test data...');
};

// Async error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, but log the error
});

// Global type declarations
declare global {
  const TEST_CONFIG: typeof TEST_CONFIG;
  
  function measurePerformance<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }>;
  function getMemoryUsage(): NodeJS.MemoryUsage;
  function generateTestUser(overrides?: Record<string, any>): any;
  function generateTestDocument(overrides?: Record<string, any>): any;
  function generateTestAnalysis(overrides?: Record<string, any>): any;
  function generateTestFinding(overrides?: Record<string, any>): any;
  function cleanupTestData(): Promise<void>;
  
  namespace NodeJS {
    interface Global {
      TEST_CONFIG: typeof TEST_CONFIG;
      measurePerformance: typeof measurePerformance;
      getMemoryUsage: typeof getMemoryUsage;
      generateTestUser: typeof generateTestUser;
      generateTestDocument: typeof generateTestDocument;
      generateTestAnalysis: typeof generateTestAnalysis;
      generateTestFinding: typeof generateTestFinding;
      cleanupTestData: typeof cleanupTestData;
    }
  }
}

export {};