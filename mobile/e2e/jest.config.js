module.exports = {
  preset: 'ts-jest',
  testEnvironment: '@detox/test-runner/jest-environment',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/**/*.e2e.test.{js,ts}',
    '<rootDir>/**/*.e2e.spec.{js,ts}'
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/setup.ts'
  ],
  
  // Test timeout
  testTimeout: 120000,
  
  // Global setup and teardown
  globalSetup: './config/globalSetup.js',
  globalTeardown: './config/globalTeardown.js',
  
  // Verbose output for debugging
  verbose: true,
  
  // Bail after first failure in CI
  bail: process.env.CI ? 1 : 0,
  
  // Max workers for parallel execution
  maxWorkers: process.env.CI ? 1 : 2,
  
  // Coverage configuration (disabled for E2E tests)
  collectCoverage: false,
  
  // Report configuration
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'e2e/test-results',
        outputName: 'detox-junit.xml',
        suiteName: 'Fine Print AI Mobile E2E Tests'
      }
    ],
    [
      'jest-html-reporters',
      {
        publicPath: 'e2e/test-results',
        filename: 'detox-report.html',
        expand: true
      }
    ]
  ],
  
  // Module name mapping
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/../src/$1',
    '^@test/(.*)$': '<rootDir>/$1'
  },
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Error handling
  errorOnDeprecated: true
};