/// <reference types="vitest" />

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/__tests__/setup.ts'],
    
    // Test file patterns
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      'src/**/__tests__/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    
    exclude: [
      'node_modules',
      'dist',
      '.next',
      'cypress',
      'playwright-tests'
    ],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      
      // Coverage thresholds
      thresholds: {
        global: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90
        }
      },
      
      // Include patterns
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
      ],
      
      // Exclude patterns
      exclude: [
        'src/**/*.d.ts',
        'src/**/*.stories.{js,jsx,ts,tsx}',
        'src/**/__tests__/**',
        'src/**/__mocks__/**',
        'src/main.tsx',
        'src/vite-env.d.ts'
      ]
    },
    
    // Timeouts
    testTimeout: 15000,
    hookTimeout: 10000,
    
    // Watch options
    watch: {
      ignore: ['node_modules', 'dist', 'coverage']
    },
    
    // Reporters
    reporters: ['verbose', 'json'],
    outputFile: './test-results/vitest-results.json',
    
    // Mock configuration
    mockReset: true,
    clearMocks: true,
    unstubEnvs: true,
    unstubGlobals: true
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@/components': resolve(__dirname, './src/components'),
      '@/hooks': resolve(__dirname, './src/hooks'),
      '@/lib': resolve(__dirname, './src/lib'),
      '@/pages': resolve(__dirname, './src/pages'),
      '@/stores': resolve(__dirname, './src/stores'),
      '@/types': resolve(__dirname, './src/types')
    }
  }
});