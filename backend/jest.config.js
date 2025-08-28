module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/services/**/__tests__/**/*.test.ts',
    '<rootDir>/shared/**/__tests__/**/*.test.ts',
    '<rootDir>/packages/**/__tests__/**/*.test.ts',
    '<rootDir>/**/*.test.ts'
  ],
  
  // Coverage configuration
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
    '!**/coverage/**'
  ],
  
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js'
  ],
  
  // Module name mapping for workspace packages
  moduleNameMapping: {
    '^@fineprintai/(.*)$': '<rootDir>/shared/$1/src',
    '^@fineprintai/types$': '<rootDir>/shared/types/src',
    '^@fineprintai/config$': '<rootDir>/shared/config/src',
    '^@fineprintai/middleware$': '<rootDir>/shared/middleware/src',
    '^@fineprintai/utils$': '<rootDir>/shared/utils/src'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Test timeout
  testTimeout: 30000,
  
  // Global test setup
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Watch plugins
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
};