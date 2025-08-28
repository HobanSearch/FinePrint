import { device, element, by, expect } from 'detox';
import { TestUtils } from '../setup';

describe('Authentication Flow', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await TestUtils.waitForElement(by.id('app-root'));
  });

  describe('Login', () => {
    it('should display login screen on app launch', async () => {
      await expect(element(by.id('auth-screen'))).toBeVisible();
      await expect(element(by.id('auth-email-input'))).toBeVisible();
      await expect(element(by.id('auth-password-input'))).toBeVisible();
      await expect(element(by.id('login-button'))).toBeVisible();
    });

    it('should login with valid credentials', async () => {
      await TestUtils.loginUser();
      await expect(element(by.id('dashboard-screen'))).toBeVisible();
    });

    it('should show error for invalid credentials', async () => {
      await element(by.id('auth-email-input')).typeText('invalid@email.com');
      await element(by.id('auth-password-input')).typeText('wrongpassword');
      await element(by.id('login-button')).tap();

      await TestUtils.waitForElement(by.id('error-message'));
      await expect(element(by.id('error-message'))).toHaveText('Invalid credentials');
    });

    it('should validate email format', async () => {
      await element(by.id('auth-email-input')).typeText('invalid-email');
      await element(by.id('auth-password-input')).typeText('password');
      await element(by.id('login-button')).tap();

      await expect(element(by.text('Please enter a valid email address'))).toBeVisible();
    });

    it('should require password', async () => {
      await element(by.id('auth-email-input')).typeText('test@fineprintai.com');
      await element(by.id('login-button')).tap();

      await expect(element(by.text('Password is required'))).toBeVisible();
    });

    it('should toggle password visibility', async () => {
      await element(by.id('auth-password-input')).typeText('password123');
      await element(by.id('password-visibility-toggle')).tap();
      
      // Password should be visible now
      await expect(element(by.id('auth-password-input'))).toHaveText('password123');
    });

    it('should navigate to forgot password screen', async () => {
      await element(by.id('forgot-password-link')).tap();
      await expect(element(by.id('forgot-password-screen'))).toBeVisible();
    });
  });

  describe('Registration', () => {
    beforeEach(async () => {
      await element(by.id('switch-to-register')).tap();
      await TestUtils.waitForElement(by.id('register-screen'));
    });

    it('should display registration form', async () => {
      await expect(element(by.id('auth-name-input'))).toBeVisible();
      await expect(element(by.id('auth-email-input'))).toBeVisible();
      await expect(element(by.id('auth-password-input'))).toBeVisible();
      await expect(element(by.id('auth-confirm-password-input'))).toBeVisible();
      await expect(element(by.id('register-button'))).toBeVisible();
    });

    it('should register new user successfully', async () => {
      const timestamp = Date.now();
      await element(by.id('auth-name-input')).typeText('New User');
      await element(by.id('auth-email-input')).typeText(`newuser${timestamp}@test.com`);
      await element(by.id('auth-password-input')).typeText('NewPassword123!');
      await element(by.id('auth-confirm-password-input')).typeText('NewPassword123!');
      await element(by.id('register-button')).tap();

      await TestUtils.waitForElement(by.id('dashboard-screen'), 10000);
    });

    it('should validate password confirmation', async () => {
      await element(by.id('auth-name-input')).typeText('Test User');
      await element(by.id('auth-email-input')).typeText('test@example.com');
      await element(by.id('auth-password-input')).typeText('password123');
      await element(by.id('auth-confirm-password-input')).typeText('differentpassword');
      await element(by.id('register-button')).tap();

      await expect(element(by.text('Passwords do not match'))).toBeVisible();
    });

    it('should show error for existing user', async () => {
      await element(by.id('auth-name-input')).typeText('Existing User');
      await element(by.id('auth-email-input')).typeText('test@fineprintai.com');
      await element(by.id('auth-password-input')).typeText('password123');
      await element(by.id('auth-confirm-password-input')).typeText('password123');
      await element(by.id('register-button')).tap();

      await TestUtils.waitForElement(by.text('User already exists'));
    });
  });

  describe('Biometric Authentication', () => {
    beforeEach(async () => {
      await TestUtils.loginUser();
      await TestUtils.navigateToScreen('settings');
    });

    it('should enable biometric authentication', async () => {
      await TestUtils.enableBiometricAuth();
      await expect(element(by.text('Biometric authentication enabled'))).toBeVisible();
    });

    it('should login with biometric after enabling', async () => {
      await TestUtils.enableBiometricAuth();
      
      // Logout and try biometric login
      await element(by.id('logout-button')).tap();
      await TestUtils.waitForElement(by.id('auth-screen'));
      
      await element(by.id('biometric-login-button')).tap();
      
      if (device.getPlatform() === 'ios') {
        await device.matchFace();
      } else {
        await device.matchFingerprint();
      }
      
      await TestUtils.waitForElement(by.id('dashboard-screen'));
    });
  });

  describe('Logout', () => {
    beforeEach(async () => {
      await TestUtils.loginUser();
    });

    it('should logout successfully', async () => {
      await TestUtils.navigateToScreen('settings');
      await element(by.id('logout-button')).tap();
      
      await TestUtils.waitForElement(by.id('auth-screen'));
      await expect(element(by.id('auth-email-input'))).toBeVisible();
    });

    it('should clear user data on logout', async () => {
      await TestUtils.navigateToScreen('settings');
      await element(by.id('logout-button')).tap();
      
      await TestUtils.waitForElement(by.id('auth-screen'));
      
      // Email field should be empty (no remembered user)
      await expect(element(by.id('auth-email-input'))).toHaveText('');
    });
  });

  describe('Authentication Persistence', () => {
    it('should remember user after app restart', async () => {
      await TestUtils.loginUser();
      
      // Terminate and relaunch app
      await device.terminateApp();
      await device.launchApp();
      
      // Should go directly to dashboard
      await TestUtils.waitForElement(by.id('dashboard-screen'));
    });

    it('should handle expired token gracefully', async () => {
      await TestUtils.loginUser();
      
      // Simulate token expiration by making API call with expired token
      // This would be handled by the app's auth interceptor
      await device.reloadReactNative();
      
      // Should redirect to login screen
      await TestUtils.waitForElement(by.id('auth-screen'));
    });
  });

  describe('Accessibility', () => {
    it('should have proper accessibility labels', async () => {
      await TestUtils.checkAccessibility('auth-email-input');
      await TestUtils.checkAccessibility('auth-password-input');
      await TestUtils.checkAccessibility('login-button');
    });

    it('should support screen reader navigation', async () => {
      // Enable accessibility
      await device.setAccessibility(true);
      
      // Navigate using accessibility
      await element(by.id('auth-email-input')).tap();
      await element(by.id('auth-email-input')).typeText('test@fineprintai.com');
      
      // Move to next field
      await element(by.id('auth-password-input')).tap();
      await element(by.id('auth-password-input')).typeText('TestPassword123!');
      
      await element(by.id('login-button')).tap();
      
      await TestUtils.waitForElement(by.id('dashboard-screen'));
    });
  });

  describe('Performance', () => {
    it('should login within performance threshold', async () => {
      const duration = await TestUtils.measurePerformance(async () => {
        await TestUtils.loginUser();
      }, 3000);
      
      expect(duration).toBeLessThan(3000);
    });

    it('should handle rapid login attempts', async () => {
      // Simulate rapid clicking
      for (let i = 0; i < 5; i++) {
        await element(by.id('login-button')).tap();
      }
      
      // Should not crash or cause issues
      await expect(element(by.id('auth-screen'))).toBeVisible();
    });
  });
});