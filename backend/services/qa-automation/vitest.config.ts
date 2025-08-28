import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    name: 'unit',
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/unit.setup.ts'],
    include: ['tests/unit/**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist', 'coverage'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules',
        'tests',
        'dist',
        '**/*.config.ts',
        '**/*.d.ts',
        '**/index.ts',
        '**/__mocks__/**'
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90
      },
      watermarks: {
        statements: [90, 95],
        branches: [90, 95],
        functions: [90, 95],
        lines: [90, 95]
      }
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    isolate: true,
    threads: true,
    maxThreads: 4,
    minThreads: 1,
    useAtomics: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    reporters: ['default', 'json', 'html', 'junit'],
    outputFile: {
      json: './reports/unit-test-results.json',
      html: './reports/unit-test-results.html',
      junit: './reports/unit-test-results.xml'
    },
    benchmark: {
      include: ['tests/benchmarks/**/*.bench.ts'],
      exclude: ['node_modules'],
      reporters: ['default', 'json'],
      outputFile: './reports/benchmark-results.json'
    },
    typecheck: {
      checker: 'tsc',
      include: ['**/*.{test,spec}.ts'],
      tsconfig: './tsconfig.json'
    },
    cache: {
      dir: './.vitest/cache'
    },
    sequence: {
      shuffle: true,
      seed: Date.now()
    },
    watch: false,
    watchExclude: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    passWithNoTests: false,
    allowOnly: false,
    dangerouslyIgnoreUnhandledErrors: false,
    bail: 1
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