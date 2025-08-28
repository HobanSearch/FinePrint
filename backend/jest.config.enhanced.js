/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test file patterns - comprehensive matching for all test types
  testMatch: [
    '<rootDir>/__tests__/**/*.test.ts',
    '<rootDir>/__tests__/**/*.spec.ts',
    '<rootDir>/services/**/__tests__/**/*.test.ts',
    '<rootDir>/services/**/__tests__/**/*.spec.ts',
    '<rootDir>/shared/**/__tests__/**/*.test.ts',
    '<rootDir>/shared/**/__tests__/**/*.spec.ts',
    '<rootDir>/packages/**/__tests__/**/*.test.ts',
    '<rootDir>/packages/**/__tests__/**/*.spec.ts'
  ],
  
  // Test environments for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/unit/**/*.test.ts', '<rootDir>/services/**/__tests__/**/*.unit.test.ts'],
      testEnvironment: 'node',
      maxWorkers: '50%'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts', '<rootDir>/services/**/__tests__/**/*.integration.test.ts'],
      testEnvironment: 'node',
      maxWorkers: 1, // Run integration tests sequentially
      testTimeout: 60000
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/__tests__/performance/**/*.test.ts'],
      testEnvironment: 'node',
      maxWorkers: 1,
      testTimeout: 120000
    }
  ],
  
  // Coverage configuration - enhanced for comprehensive reporting
  collectCoverage: true,
  collectCoverageFrom: [
    'services/**/src/**/*.ts',
    'shared/**/src/**/*.ts',
    'packages/**/src/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/__tests__/**',
    '!**/__mocks__/**',
    '!**/coverage/**',
    '!**/test-*/**',
    '!**/*.config.{js,ts}',
    '!**/migrations/**',
    '!**/seeds/**'
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: [
    'text',
    'text-summary', 
    'lcov', 
    'html',
    'json',
    'cobertura', // For CI systems
    'clover'
  ],
  
  // Strict coverage thresholds for enterprise-grade quality
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    // Service-specific thresholds
    './services/analysis/src/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './services/billing/src/**/*.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    },
    './shared/security/src/**/*.ts': {
      branches: 98,
      functions: 98,
      lines: 98,
      statements: 98
    }
  },
  
  // Setup files - comprehensive test environment setup
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
    '<rootDir>/__tests__/setup/custom-matchers.ts',
    '<rootDir>/__tests__/setup/test-environment.ts'
  ],
  
  // Module name mapping for workspace packages
  moduleNameMapping: {
    '^@fineprintai/(.*)$': '<rootDir>/shared/$1/src',
    '^@fineprintai/types$': '<rootDir>/shared/types/src',
    '^@fineprintai/config$': '<rootDir>/shared/config/src',
    '^@fineprintai/middleware$': '<rootDir>/shared/middleware/src',
    '^@fineprintai/utils$': '<rootDir>/shared/utils/src',
    '^@fineprintai/security$': '<rootDir>/shared/security/src',
    '^@test/(.*)$': '<rootDir>/__tests__/$1'
  },
  
  // Transform configuration - optimized for performance
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        compilerOptions: {
          sourceMap: true,
          inlineSourceMap: false,
          inlineSources: true
        }
      },
      isolatedModules: true
    }]
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  
  // Test timeout configuration
  testTimeout: 30000,
  
  // Global test setup and teardown
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  
  // Performance and debugging options
  verbose: false, // Reduce noise in CI
  detectOpenHandles: true,
  detectLeaks: true,
  forceExit: true,
  
  // Mock configuration
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  bail: 1, // Stop on first failure in CI
  
  // Cache configuration for performance
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Watch plugins for development
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ],
  
  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/test-results',
        outputName: 'junit.xml',
        suiteName: 'Fine Print AI Backend Tests'
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: '<rootDir>/test-results',
        filename: 'test-report.html',
        expand: true
      }
    ]
  ],
  
  // Test result processor for custom reporting
  testResultsProcessor: '<rootDir>/__tests__/utils/test-results-processor.ts',
  
  // Snapshot configuration
  snapshotSerializers: [
    '<rootDir>/__tests__/serializers/error-serializer.ts',
    '<rootDir>/__tests__/serializers/date-serializer.ts'
  ],
  
  // Notify configuration for development
  notify: true,
  notifyMode: 'failure-change',
  
  // Maximum worker configuration
  maxWorkers: process.env.CI ? 2 : '50%',
  
  // Silent mode for CI
  silent: !!process.env.CI
};