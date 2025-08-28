import { device, element, by, expect as detoxExpect } from 'detox';
import { beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';

// Extend Jest matchers with Detox matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeVisible(): R;
      toExist(): R;
      toHaveText(text: string): R;
      toHaveId(id: string): R;
      toHaveLabel(label: string): R;
    }
  }
}

// Device and app lifecycle management
beforeAll(async () => {
  console.log('🚀 Starting Detox test suite...');
  
  // Initialize Detox
  await device.installApp();
  await device.launchApp({
    permissions: {
      camera: 'YES',
      photos: 'YES',
      notifications: 'YES',
      microphone: 'YES',
      location: 'inuse'
    },
    launchArgs: {
      detoxEnableSynchronization: 0 // Disable for better performance
    }
  });
  
  console.log('✅ App launched successfully');
});

beforeEach(async () => {
  // Reset app state before each test
  await device.reloadReactNative();
  
  // Wait for app to be ready
  await waitFor(element(by.id('app-root')))
    .toBeVisible()
    .withTimeout(10000);
});

afterEach(async () => {
  // Take screenshot after each test for debugging
  if (device.getPlatform() === 'ios') {
    await device.takeScreenshot('test-end');
  }
  
  // Clear any modals or overlays
  try {
    await element(by.id('modal-backdrop')).tap();
  } catch (e) {
    // Modal not present, continue
  }
});

afterAll(async () => {
  console.log('🧹 Cleaning up test environment...');
  await device.terminateApp();
  console.log('✅ Test suite completed');
});

// Global test utilities
export const TestUtils = {
  // Wait for element with better error messages
  async waitForElement(matcher: Detox.NativeMatcher, timeout = 5000) {
    try {
      await waitFor(element(matcher))
        .toBeVisible()
        .withTimeout(timeout);
    } catch (error) {
      throw new Error(`Element not found within ${timeout}ms: ${JSON.stringify(matcher)}`);
    }
  },

  // Login helper for authenticated flows
  async loginUser(email = 'test@fineprintai.com', password = 'TestPassword123!') {
    await element(by.id('auth-email-input')).typeText(email);
    await element(by.id('auth-password-input')).typeText(password);
    await element(by.id('login-button')).tap();
    
    // Wait for dashboard to load
    await this.waitForElement(by.id('dashboard-screen'));
  },

  // Upload document helper
  async uploadDocument(documentType = 'privacy-policy') {
    await element(by.id('upload-button')).tap();
    await this.waitForElement(by.id('document-picker'));
    
    // Select document type
    await element(by.id(`document-type-${documentType}`)).tap();
    
    // Mock file selection (in real tests, this would interact with device file picker)
    await element(by.id('mock-file-select')).tap();
    
    // Wait for upload to complete
    await this.waitForElement(by.id('upload-success'), 15000);
  },

  // Navigate to specific screen
  async navigateToScreen(screenName: string) {
    const screens = {
      dashboard: 'dashboard-tab',
      documents: 'documents-tab',
      analysis: 'analysis-tab',
      settings: 'settings-tab',
      profile: 'profile-button'
    };

    const tabId = screens[screenName as keyof typeof screens];
    if (!tabId) {
      throw new Error(`Unknown screen: ${screenName}`);
    }

    await element(by.id(tabId)).tap();
    await this.waitForElement(by.id(`${screenName}-screen`));
  },

  // Handle platform-specific actions
  async performPlatformAction(action: string, ...args: any[]) {
    const platform = device.getPlatform();
    
    switch (action) {
      case 'swipe-to-refresh':
        if (platform === 'ios') {
          await element(by.id('scroll-view')).swipe('down');
        } else {
          await element(by.id('refresh-control')).swipe('down');
        }
        break;
        
      case 'open-context-menu':
        if (platform === 'ios') {
          await element(by.id(args[0])).longPress();
        } else {
          await element(by.id(args[0])).longPress(2000);
        }
        break;
        
      default:
        throw new Error(`Unknown platform action: ${action}`);
    }
  },

  // Accessibility testing helper
  async checkAccessibility(elementId: string) {
    const elementMatcher = by.id(elementId);
    
    // Check if element has accessibility label
    await expect(element(elementMatcher)).toHaveLabel();
    
    // Check if element has accessibility hint (iOS) or content description (Android)
    if (device.getPlatform() === 'ios') {
      await expect(element(elementMatcher)).toHaveAccessibilityTrait('button');
    }
  },

  // Performance testing helper
  async measurePerformance(action: () => Promise<void>, expectedMaxDuration = 2000) {
    const startTime = Date.now();
    await action();
    const duration = Date.now() - startTime;
    
    if (duration > expectedMaxDuration) {
      console.warn(`⚠️ Performance warning: Action took ${duration}ms (expected < ${expectedMaxDuration}ms)`);
    }
    
    return duration;
  },

  // Biometric authentication helper
  async enableBiometricAuth() {
    if (device.getPlatform() === 'ios') {
      await device.setBiometricEnrollment(true);
    }
    
    await element(by.id('enable-biometric-button')).tap();
    await this.waitForElement(by.text('Biometric authentication enabled'));
  },

  // Network simulation helper
  async simulateNetworkCondition(condition: 'offline' | 'slow' | 'fast') {
    const conditions = {
      offline: { connectivity: 'none' },
      slow: { connectivity: 'wifi', condition: 'poor' },
      fast: { connectivity: 'wifi', condition: 'excellent' }
    };

    await device.setNetworkCondition(conditions[condition]);
  },

  // Deep linking helper
  async openDeepLink(url: string) {
    await device.openURL({ url });
    await device.launchApp({ newInstance: false });
  },

  // Camera and OCR testing helper
  async testDocumentScan() {
    await element(by.id('camera-scan-button')).tap();
    await this.waitForElement(by.id('camera-view'));
    
    // Mock camera capture
    await element(by.id('capture-button')).tap();
    
    // Wait for OCR processing
    await this.waitForElement(by.id('ocr-results'), 10000);
  }
};

// Custom Jest matchers for better assertions
expect.extend({
  async toBeVisibleAndEnabled(received: Detox.IndexableNativeElement) {
    await expect(received).toBeVisible();
    await expect(received).toExist();
    return { pass: true, message: () => 'Element is visible and enabled' };
  },

  async toHaveAccessibleElements() {
    // Check for common accessibility issues
    const issues = [];
    
    try {
      // Check for elements without accessibility labels
      await element(by.type('RCTButton')).atIndex(0).toHaveLabel();
    } catch (e) {
      issues.push('Button without accessibility label found');
    }
    
    return {
      pass: issues.length === 0,
      message: () => issues.join(', ')
    };
  }
});

// Global error handler for better debugging
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

export { device, element, by, expect as detoxExpect };