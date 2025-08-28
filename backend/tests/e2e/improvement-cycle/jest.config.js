module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: [
    '**/*.test.ts',
    '!**/node_modules/**'
  ],
  collectCoverageFrom: [
    '**/*.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/coverage/**'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/setup/jest.setup.ts'],
  testTimeout: 300000, // 5 minutes for E2E tests
  maxWorkers: 2, // Limit parallel execution for E2E tests
  reporters: [
    'default',
    ['jest-html-reporter', {
      pageTitle: 'AI Improvement Cycle E2E Test Report',
      outputPath: './reports/test-report.html',
      includeFailureMsg: true,
      includeConsoleLog: true,
      theme: 'darkTheme',
      dateFormat: 'yyyy-mm-dd HH:MM:ss'
    }],
    ['jest-junit', {
      outputDirectory: './reports',
      outputName: 'junit.xml',
      suiteName: 'AI Improvement Cycle E2E Tests',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' › ',
      usePathForSuiteName: true
    }]
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@setup/(.*)$': '<rootDir>/setup/$1',
    '^@validation/(.*)$': '<rootDir>/validation/$1'
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }
  }
};