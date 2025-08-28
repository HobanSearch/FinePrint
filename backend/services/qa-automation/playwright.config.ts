import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './reports/e2e/test-results',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html', { 
      outputFolder: './reports/e2e/html-report',
      open: 'never'
    }],
    ['json', { 
      outputFile: './reports/e2e/results.json' 
    }],
    ['junit', { 
      outputFile: './reports/e2e/results.xml' 
    }],
    ['list'],
    ['line']
  ],
  globalSetup: path.join(__dirname, './tests/setup/e2e.global-setup.ts'),
  globalTeardown: path.join(__dirname, './tests/setup/e2e.global-teardown.ts'),
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
    
    // Authentication state
    storageState: process.env.STORAGE_STATE_PATH,
    
    // Custom test attributes
    testIdAttribute: 'data-testid',
    
    // Viewport and device emulation
    viewport: { width: 1280, height: 720 },
    
    // Request interceptors
    extraHTTPHeaders: {
      'X-Test-Suite': 'e2e',
      'X-Test-Environment': process.env.TEST_ENV || 'local'
    },
    
    // API testing helpers
    ignoreHTTPSErrors: true,
    
    // Accessibility testing
    colorScheme: 'light',
    locale: 'en-US',
    timezoneId: 'America/New_York',
    
    // Performance testing
    offline: false,
    hasTouch: false,
    isMobile: false,
    
    // Security testing headers
    bypassCSP: false,
    javaScriptEnabled: true
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { 
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-dev-shm-usage', '--no-sandbox']
        }
      }
    },
    {
      name: 'firefox',
      use: { 
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.navigator.permission.disabled': true
          }
        }
      }
    },
    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari']
      }
    },
    {
      name: 'edge',
      use: { 
        ...devices['Desktop Edge'],
        channel: 'msedge'
      }
    },

    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { 
        ...devices['Pixel 5'],
        isMobile: true,
        hasTouch: true
      }
    },
    {
      name: 'mobile-safari',
      use: { 
        ...devices['iPhone 13'],
        isMobile: true,
        hasTouch: true
      }
    },

    // API Testing
    {
      name: 'api',
      testDir: './tests/e2e/api',
      use: {
        baseURL: process.env.API_URL || 'http://localhost:4000',
        extraHTTPHeaders: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      }
    },

    // Visual Regression Testing
    {
      name: 'visual',
      testDir: './tests/e2e/visual',
      use: {
        ...devices['Desktop Chrome'],
        video: 'off',
        screenshot: {
          mode: 'only-on-failure',
          fullPage: true
        }
      }
    },

    // Accessibility Testing
    {
      name: 'accessibility',
      testDir: './tests/e2e/accessibility',
      use: {
        ...devices['Desktop Chrome'],
        colorScheme: 'dark'
      }
    },

    // Performance Testing
    {
      name: 'performance',
      testDir: './tests/e2e/performance',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--enable-precise-memory-info',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
          ]
        }
      }
    }
  ],

  // Web server configuration
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev:full',
    port: 3000,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      REDIS_URL: process.env.TEST_REDIS_URL
    }
  }
});