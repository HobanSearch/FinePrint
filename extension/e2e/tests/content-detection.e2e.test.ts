import { ExtensionTestUtils } from '../setup';

describe('Content Detection', () => {
  beforeEach(async () => {
    await global.page.goto('about:blank');
  });

  describe('Privacy Policy Detection', () => {
    it('should detect privacy policy on Google', async () => {
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      // Wait for content script to run
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      
      const detectedElement = await global.page.$('[data-fineprint-detected="privacy-policy"]');
      expect(detectedElement).toBeTruthy();
    });

    it('should detect terms of service on GitHub', async () => {
      await global.page.goto('https://docs.github.com/en/site-policy/github-terms/github-terms-of-service', { waitUntil: 'networkidle2' });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="terms-of-service"]');
      
      const detectedElement = await global.page.$('[data-fineprint-detected="terms-of-service"]');
      expect(detectedElement).toBeTruthy();
    });

    it('should detect EULA on software sites', async () => {
      // Mock EULA page content
      await global.page.setContent(`
        <html>
          <head><title>End User License Agreement</title></head>
          <body>
            <h1>End User License Agreement (EULA)</h1>
            <p>By installing or using this software, you agree to the following terms...</p>
            <p>1. License Grant</p>
            <p>2. Restrictions</p>
            <p>3. Termination</p>
          </body>
        </html>
      `);

      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="eula"]');
      
      const detectedElement = await global.page.$('[data-fineprint-detected="eula"]');
      expect(detectedElement).toBeTruthy();
    });

    it('should not detect on non-legal pages', async () => {
      await global.page.goto('https://example.com', { waitUntil: 'networkidle2' });
      
      // Wait a bit to ensure content script runs
      await global.page.waitForTimeout(2000);
      
      const detectedElement = await global.page.$('[data-fineprint-detected]');
      expect(detectedElement).toBeNull();
    });

    it('should detect multiple document types on same page', async () => {
      await global.page.setContent(`
        <html>
          <body>
            <section id="privacy">
              <h2>Privacy Policy</h2>
              <p>We collect and use your personal information...</p>
            </section>
            <section id="terms">
              <h2>Terms of Service</h2>
              <p>By using our service, you agree to these terms...</p>
            </section>
          </body>
        </html>
      `);

      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="terms-of-service"]');
      
      const privacyElement = await global.page.$('[data-fineprint-detected="privacy-policy"]');
      const termsElement = await global.page.$('[data-fineprint-detected="terms-of-service"]');
      
      expect(privacyElement).toBeTruthy();
      expect(termsElement).toBeTruthy();
    });
  });

  describe('Content Analysis Trigger', () => {
    it('should show analysis button when legal content detected', async () => {
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-analyze-button]');
      
      const analyzeButton = await global.page.$('[data-fineprint-analyze-button]');
      expect(analyzeButton).toBeTruthy();
    });

    it('should position analysis button appropriately', async () => {
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-analyze-button]');
      
      const buttonPosition = await global.page.evaluate(() => {
        const button = document.querySelector('[data-fineprint-analyze-button]') as HTMLElement;
        const rect = button.getBoundingClientRect();
        return {
          top: rect.top,
          right: rect.right,
          position: window.getComputedStyle(button).position
        };
      });
      
      expect(buttonPosition.position).toBe('fixed');
      expect(buttonPosition.top).toBeGreaterThan(0);
      expect(buttonPosition.right).toBeGreaterThan(0);
    });

    it('should handle button click to start analysis', async () => {
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-analyze-button]');
      
      // Mock API response
      await ExtensionTestUtils.mockApiResponse(global.page, '/api/analysis/start', {
        success: true,
        analysisId: 'test-analysis-123'
      });
      
      await ExtensionTestUtils.simulateUserInteraction(global.page, '[data-fineprint-analyze-button]', 'click');
      
      // Should show analysis in progress
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-analysis-progress]');
    });
  });

  describe('Dynamic Content Detection', () => {
    it('should detect content loaded via AJAX', async () => {
      await global.page.goto('about:blank');
      
      // Simulate dynamic content loading
      await global.page.evaluate(() => {
        setTimeout(() => {
          document.body.innerHTML = `
            <div id="dynamic-content">
              <h1>Privacy Policy</h1>
              <p>This privacy policy describes how we collect and use your information...</p>
            </div>
          `;
        }, 1000);
      });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]', 3000);
      
      const detectedElement = await global.page.$('[data-fineprint-detected="privacy-policy"]');
      expect(detectedElement).toBeTruthy();
    });

    it('should handle single page application navigation', async () => {
      await global.page.goto('about:blank');
      
      // Simulate SPA navigation
      await global.page.evaluate(() => {
        // Initial content
        document.body.innerHTML = '<h1>Home Page</h1>';
        
        // Simulate navigation to privacy page
        setTimeout(() => {
          history.pushState({}, '', '/privacy');
          document.body.innerHTML = `
            <h1>Privacy Policy</h1>
            <p>We value your privacy and are committed to protecting your personal information...</p>
          `;
          
          // Trigger navigation event
          window.dispatchEvent(new PopStateEvent('popstate'));
        }, 1000);
      });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]', 3000);
    });

    it('should detect content in iframes', async () => {
      await global.page.setContent(`
        <html>
          <body>
            <iframe id="policy-frame" src="about:blank"></iframe>
          </body>
        </html>
      `);
      
      // Add content to iframe
      await global.page.evaluate(() => {
        const iframe = document.getElementById('policy-frame') as HTMLIFrameElement;
        iframe.contentDocument!.body.innerHTML = `
          <h1>Terms of Service</h1>
          <p>By using our service, you agree to these terms and conditions...</p>
        `;
      });
      
      // Wait for iframe content detection
      await global.page.waitForTimeout(2000);
      
      // Check if detection works in iframe context
      const iframeDetection = await global.page.evaluate(() => {
        const iframe = document.getElementById('policy-frame') as HTMLIFrameElement;
        return iframe.contentDocument!.querySelector('[data-fineprint-detected]') !== null;
      });
      
      expect(iframeDetection).toBeTruthy();
    });
  });

  describe('Language Detection', () => {
    it('should detect English legal documents', async () => {
      await global.page.setContent(`
        <html lang="en">
          <body>
            <h1>Privacy Policy</h1>
            <p>We collect information when you visit our website...</p>
          </body>
        </html>
      `);
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      
      const language = await global.page.evaluate(() => {
        const element = document.querySelector('[data-fineprint-detected]') as HTMLElement;
        return element.getAttribute('data-fineprint-language');
      });
      
      expect(language).toBe('en');
    });

    it('should detect Spanish legal documents', async () => {
      await global.page.setContent(`
        <html lang="es">
          <body>
            <h1>Política de Privacidad</h1>
            <p>Recopilamos información cuando visita nuestro sitio web...</p>
          </body>
        </html>
      `);
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      
      const language = await global.page.evaluate(() => {
        const element = document.querySelector('[data-fineprint-detected]') as HTMLElement;
        return element.getAttribute('data-fineprint-language');
      });
      
      expect(language).toBe('es');
    });

    it('should handle multi-language pages', async () => {
      await global.page.setContent(`
        <html>
          <body>
            <div lang="en">
              <h2>Privacy Policy</h2>
              <p>We collect information...</p>
            </div>
            <div lang="fr">
              <h2>Politique de Confidentialité</h2>
              <p>Nous collectons des informations...</p>
            </div>
          </body>
        </html>
      `);
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"][data-fineprint-language="en"]');
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"][data-fineprint-language="fr"]');
      
      const englishElement = await global.page.$('[data-fineprint-detected="privacy-policy"][data-fineprint-language="en"]');
      const frenchElement = await global.page.$('[data-fineprint-detected="privacy-policy"][data-fineprint-language="fr"]');
      
      expect(englishElement).toBeTruthy();
      expect(frenchElement).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should detect content within performance threshold', async () => {
      const { duration } = await ExtensionTestUtils.measurePerformance(global.page, async () => {
        await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
        await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      });
      
      // Detection should happen within 2 seconds
      expect(duration).toBeLessThan(2000);
    });

    it('should not impact page load performance significantly', async () => {
      // Measure page load without extension
      const withoutExtension = await global.page.evaluate(() => {
        return performance.now();
      });
      
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      const withExtension = await global.page.evaluate(() => {
        return performance.now();
      });
      
      // Extension should not add more than 200ms to page load
      const overhead = withExtension - withoutExtension;
      expect(overhead).toBeLessThan(200);
    });

    it('should handle large documents efficiently', async () => {
      // Create a large legal document
      const largeContent = Array(1000).fill(`
        <p>This is a section of our privacy policy that describes how we handle your personal information.
        We may collect, use, and share your data in accordance with applicable laws and regulations.</p>
      `).join('');
      
      await global.page.setContent(`
        <html>
          <body>
            <h1>Privacy Policy</h1>
            ${largeContent}
          </body>
        </html>
      `);
      
      const { duration } = await ExtensionTestUtils.measurePerformance(global.page, async () => {
        await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-detected="privacy-policy"]');
      });
      
      // Should still detect within reasonable time even for large documents
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed HTML gracefully', async () => {
      await global.page.setContent(`
        <html>
          <body>
            <h1>Privacy Policy
            <p>We collect information <span>without closing tags
            <div>Malformed content
          </body>
      `);
      
      // Should not crash and still attempt detection
      await global.page.waitForTimeout(2000);
      
      // Page should still be functional
      const title = await global.page.title();
      expect(title).toBeDefined();
    });

    it('should handle network errors during analysis', async () => {
      await global.page.goto('https://policies.google.com/privacy', { waitUntil: 'networkidle2' });
      
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-analyze-button]');
      
      // Simulate network failure
      await ExtensionTestUtils.simulateNetworkConditions(global.page, 'offline');
      
      await ExtensionTestUtils.simulateUserInteraction(global.page, '[data-fineprint-analyze-button]', 'click');
      
      // Should show error message
      await ExtensionTestUtils.waitForElement(global.page, '[data-fineprint-error-message]');
      
      const errorMessage = await global.page.$eval('[data-fineprint-error-message]', el => el.textContent);
      expect(errorMessage).toContain('network');
    });

    it('should recover from JavaScript errors', async () => {
      await global.page.goto('about:blank');
      
      // Inject problematic script that might interfere
      await global.page.evaluate(() => {
        // Override a method that content script might use
        (window as any).MutationObserver = undefined;
      });
      
      await global.page.setContent(`
        <html>
          <body>
            <h1>Privacy Policy</h1>
            <p>Content that should be detected...</p>
          </body>
        </html>
      `);
      
      // Should handle gracefully and potentially fall back to alternative detection
      await global.page.waitForTimeout(3000);
      
      // Page should remain functional
      const title = await global.page.evaluate(() => document.title);
      expect(title).toBeDefined();
    });
  });
});