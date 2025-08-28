/**
 * Fine Print AI - Data Aggregation Service Test Setup
 */

// import { config } from '../config'; // Unused import removed

// Set test environment
process.env['NODE_ENV'] = 'test';
process.env['LOG_LEVEL'] = 'error';

// Mock external services for testing
jest.mock('../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    startTimer: jest.fn(),
    endTimer: jest.fn(),
    logRequest: jest.fn(),
    logDatabaseOperation: jest.fn(),
    logCrawlOperation: jest.fn(),
    logProcessingOperation: jest.fn(),
    logComplianceAlert: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(30000);

// Global teardown
afterAll(async () => {
  // Close any open connections
  await new Promise(resolve => setTimeout(resolve, 100));
});