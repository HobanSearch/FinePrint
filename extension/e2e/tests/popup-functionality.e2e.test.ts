import { ExtensionTestUtils } from '../setup';
import { Page } from 'puppeteer';

describe('Popup Functionality', () => {
  let popupPage: Page;

  beforeEach(async () => {
    popupPage = await ExtensionTestUtils.openExtensionPopup(global.page, global.extensionId);
    await popupPage.waitForLoadState('networkidle');
  });

  afterEach(async () => {
    if (popupPage && !popupPage.isClosed()) {
      await popupPage.close();
    }
  });

  describe('Popup Interface', () => {
    it('should display popup with correct layout', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="popup-container"]');
      
      // Check main UI elements
      await expect(popupPage.locator('[data-testid="logo"]')).toBeVisible();
      await expect(popupPage.locator('[data-testid="analysis-status"]')).toBeVisible();
      await expect(popupPage.locator('[data-testid="quick-actions"]')).toBeVisible();
    });

    it('should show current page analysis status', async () => {
      // Navigate main page to a privacy policy
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      // Refresh popup to get current page status
      await popupPage.reload();
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="page-detected"]');
      
      const pageStatus = await popupPage.$eval('[data-testid="page-detected"]', el => el.textContent);
      expect(pageStatus).toContain('Privacy Policy detected');
    });

    it('should display recent analyses', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="recent-analyses"]');
      
      const recentAnalyses = await popupPage.$$('[data-testid="analysis-item"]');
      expect(recentAnalyses.length).toBeGreaterThan(0);
    });

    it('should show analysis statistics', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="stats-container"]');
      
      await expect(popupPage.locator('[data-testid="total-analyses"]')).toBeVisible();
      await expect(popupPage.locator('[data-testid="avg-risk-score"]')).toBeVisible();
      await expect(popupPage.locator('[data-testid="high-risk-count"]')).toBeVisible();
    });
  });

  describe('Quick Actions', () => {
    it('should start analysis from popup', async () => {
      // Navigate to a page with legal content
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      // Refresh popup
      await popupPage.reload();
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="analyze-current-page"]');
      
      // Mock API response
      await ExtensionTestUtils.mockApiResponse(popupPage, '/api/analysis/start', {
        success: true,
        analysisId: 'popup-analysis-123'
      });
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="analyze-current-page"]', 'click');
      
      // Should show analysis started
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="analysis-started"]');
    });

    it('should open full dashboard', async () => {
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="open-dashboard"]', 'click');
      
      // Should open new tab with dashboard
      const pages = await global.browser.pages();
      const dashboardPage = pages.find(p => p.url().includes('dashboard'));
      
      expect(dashboardPage).toBeTruthy();
      await dashboardPage!.close();
    });

    it('should toggle extension on/off', async () => {
      const toggleButton = await popupPage.$('[data-testid="extension-toggle"]');
      const initialState = await toggleButton!.evaluate(el => (el as HTMLInputElement).checked);
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="extension-toggle"]', 'click');
      
      const newState = await toggleButton!.evaluate(el => (el as HTMLInputElement).checked);
      expect(newState).toBe(!initialState);
    });

    it('should access settings', async () => {
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="settings-button"]', 'click');
      
      // Should open options page
      const pages = await global.browser.pages();
      const optionsPage = pages.find(p => p.url().includes('options'));
      
      expect(optionsPage).toBeTruthy();
      if (optionsPage) {
        await optionsPage.close();
      }
    });
  });

  describe('Analysis Results Display', () => {
    beforeEach(async () => {
      // Mock analysis results
      await ExtensionTestUtils.mockApiResponse(popupPage, '/api/analysis/results', {
        success: true,
        analysis: {
          id: 'test-analysis',
          riskScore: 75,
          findings: [
            {
              id: 'finding-1',
              category: 'data-sharing',
              severity: 'high',
              description: 'Third-party data sharing without explicit consent'
            }
          ]
        }
      });
      
      await popupPage.reload();
    });

    it('should display risk score with appropriate styling', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="risk-score"]');
      
      const riskScore = await popupPage.$eval('[data-testid="risk-score"]', el => el.textContent);
      expect(riskScore).toContain('75');
      
      // Should have appropriate color coding
      const riskClass = await popupPage.$eval('[data-testid="risk-score"]', el => el.className);
      expect(riskClass).toContain('high-risk'); // or similar class for high risk
    });

    it('should show key findings summary', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="findings-summary"]');
      
      const findingsCount = await popupPage.$$eval('[data-testid="finding-item"]', items => items.length);
      expect(findingsCount).toBeGreaterThan(0);
    });

    it('should link to detailed analysis', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="view-details"]');
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="view-details"]', 'click');
      
      // Should open detailed analysis page
      const pages = await global.browser.pages();
      const detailsPage = pages.find(p => p.url().includes('analysis'));
      
      expect(detailsPage).toBeTruthy();
      if (detailsPage) {
        await detailsPage.close();
      }
    });
  });

  describe('User Authentication', () => {
    it('should show login prompt when not authenticated', async () => {
      // Clear authentication
      await popupPage.evaluate(() => {
        localStorage.removeItem('auth-token');
        sessionStorage.clear();
      });
      
      await popupPage.reload();
      
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="login-prompt"]');
      await expect(popupPage.locator('[data-testid="login-button"]')).toBeVisible();
    });

    it('should handle login flow', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="login-button"]');
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="login-button"]', 'click');
      
      // Should redirect to authentication page
      const pages = await global.browser.pages();
      const authPage = pages.find(p => p.url().includes('auth') || p.url().includes('login'));
      
      expect(authPage).toBeTruthy();
      if (authPage) {
        await authPage.close();
      }
    });

    it('should show user info when authenticated', async () => {
      // Mock authenticated state
      await popupPage.evaluate(() => {
        localStorage.setItem('auth-token', 'mock-token');
        localStorage.setItem('user-info', JSON.stringify({
          name: 'Test User',
          email: 'test@example.com',
          subscription: 'premium'
        }));
      });
      
      await popupPage.reload();
      
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="user-info"]');
      
      const userName = await popupPage.$eval('[data-testid="user-name"]', el => el.textContent);
      expect(userName).toContain('Test User');
    });

    it('should handle logout', async () => {
      // Set authenticated state first
      await popupPage.evaluate(() => {
        localStorage.setItem('auth-token', 'mock-token');
      });
      
      await popupPage.reload();
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="logout-button"]');
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="logout-button"]', 'click');
      
      // Should show login prompt again
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="login-prompt"]');
    });
  });

  describe('Keyboard Navigation', () => {
    it('should support tab navigation', async () => {
      await popupPage.focus('body');
      
      // Tab through interactive elements
      await popupPage.keyboard.press('Tab');
      let activeElement = await popupPage.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect(activeElement).toBeTruthy();
      
      await popupPage.keyboard.press('Tab');
      let nextActiveElement = await popupPage.evaluate(() => document.activeElement?.getAttribute('data-testid'));
      expect(nextActiveElement).not.toBe(activeElement);
    });

    it('should support keyboard shortcuts', async () => {
      // Test Ctrl+Enter to start analysis
      await popupPage.keyboard.press('Control+Enter');
      
      // Should trigger analysis if page has legal content
      // (This would need to be mocked based on current page state)
    });

    it('should handle escape key to close dialogs', async () => {
      // Open a dialog/modal
      if (await popupPage.$('[data-testid="help-button"]')) {
        await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="help-button"]', 'click');
        
        await popupPage.keyboard.press('Escape');
        
        // Dialog should be closed
        const dialog = await popupPage.$('[data-testid="help-dialog"]');
        expect(dialog).toBeNull();
      }
    });
  });

  describe('Performance and Responsiveness', () => {
    it('should load popup within performance threshold', async () => {
      const startTime = Date.now();
      
      const newPopupPage = await ExtensionTestUtils.openExtensionPopup(global.page, global.extensionId);
      await ExtensionTestUtils.waitForElement(newPopupPage, '[data-testid="popup-container"]');
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(1000); // Should load within 1 second
      
      await newPopupPage.close();
    });

    it('should handle rapid clicking gracefully', async () => {
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="analyze-current-page"]');
      
      // Rapid click simulation
      for (let i = 0; i < 5; i++) {
        await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="analyze-current-page"]', 'click');
      }
      
      // Should not crash or cause issues
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="popup-container"]');
    });

    it('should be responsive to window resizing', async () => {
      const initialSize = await popupPage.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));
      
      // Resize popup window
      await popupPage.setViewport({ width: 300, height: 400 });
      
      // Elements should still be visible and properly arranged
      await expect(popupPage.locator('[data-testid="popup-container"]')).toBeVisible();
      
      const newSize = await popupPage.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));
      
      expect(newSize.width).toBe(300);
      expect(newSize.height).toBe(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      // Mock API error
      await ExtensionTestUtils.mockApiResponse(popupPage, '/api/analysis/start', {
        success: false,
        error: 'Server temporarily unavailable'
      });
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="analyze-current-page"]', 'click');
      
      // Should show error message
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="error-message"]');
      
      const errorText = await popupPage.$eval('[data-testid="error-message"]', el => el.textContent);
      expect(errorText).toContain('temporarily unavailable');
    });

    it('should handle network connectivity issues', async () => {
      // Simulate offline state
      await ExtensionTestUtils.simulateNetworkConditions(popupPage, 'offline');
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="analyze-current-page"]', 'click');
      
      // Should show offline message
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="offline-message"]');
    });

    it('should recover from JavaScript errors', async () => {
      // Inject error-causing code
      await popupPage.evaluate(() => {
        // Override a method to cause an error
        (window as any).fetch = () => { throw new Error('Test error'); };
      });
      
      await ExtensionTestUtils.simulateUserInteraction(popupPage, '[data-testid="analyze-current-page"]', 'click');
      
      // Should handle error gracefully and show fallback UI
      await ExtensionTestUtils.waitForElement(popupPage, '[data-testid="popup-container"]');
    });
  });

  describe('Accessibility', () => {
    it('should pass accessibility audit', async () => {
      const results = await ExtensionTestUtils.checkAccessibility(popupPage);
      
      // Should have no critical accessibility violations
      const violations = results.violations?.filter(v => v.impact === 'critical') || [];
      expect(violations.length).toBe(0);
    });

    it('should have proper ARIA labels', async () => {
      const elementsWithoutLabels = await popupPage.$$eval('[role="button"], button', elements => {
        return elements.filter(el => 
          !el.getAttribute('aria-label') && 
          !el.getAttribute('aria-labelledby') &&
          !el.textContent?.trim()
        ).length;
      });
      
      expect(elementsWithoutLabels).toBe(0);
    });

    it('should support screen readers', async () => {
      // Check for proper heading structure
      const headings = await popupPage.$$eval('h1, h2, h3, h4, h5, h6', elements => {
        return elements.map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim()
        }));
      });
      
      expect(headings.length).toBeGreaterThan(0);
      expect(headings[0].tag).toBe('h1'); // Should start with h1
    });
  });
});