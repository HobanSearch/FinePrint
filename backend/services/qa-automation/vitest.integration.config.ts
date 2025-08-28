import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'integration',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/integration.setup.ts'],
    include: ['tests/integration/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage/integration',
      exclude: [
        'node_modules',
        'tests',
        'dist',
        '**/*.config.ts',
        '**/*.d.ts'
      ],
      thresholds: {
        statements: 85,
        branches: 85,
        functions: 85,
        lines: 85
      }
    },
    testTimeout: 30000,
    hookTimeout: 20000,
    teardownTimeout: 10000,
    isolate: true,
    threads: false, // Integration tests should run sequentially
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    reporters: ['default', 'json', 'junit'],
    outputFile: {
      json: './reports/integration-test-results.json',
      junit: './reports/integration-test-results.xml'
    },
    retry: 2,
    bail: 5,
    logHeapUsage: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@frameworks': path.resolve(__dirname, './src/frameworks'),
      '@runners': path.resolve(__dirname, './src/runners'),
      '@reporters': path.resolve(__dirname, './src/reporters'),
      '@validators': path.resolve(__dirname, './src/validators'),
      '@generators': path.resolve(__dirname, './src/generators'),
      '@fixtures': path.resolve(__dirname, './fixtures'),
      '@config': path.resolve(__dirname, './config')
    }
  }
});