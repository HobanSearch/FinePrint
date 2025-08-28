import { test, expect, Page } from '@playwright/test';
import AccessibilityTester, { AccessibilityReport } from './accessibility-utils';

let accessibilityTester: AccessibilityTester;

test.beforeAll(() => {
  accessibilityTester = new AccessibilityTester();
});

test.describe('WCAG 2.1 AA Compliance Testing', () => {
  const testPages = [
    { name: 'Dashboard', url: '/dashboard' },
    { name: 'Document Upload', url: '/documents/upload' },
    { name: 'Analysis Results', url: '/analysis/results' },
    { name: 'Settings', url: '/settings' },
    { name: 'Login', url: '/auth/login' },
    { name: 'Registration', url: '/auth/register' }
  ];

  for (const testPage of testPages) {
    test.describe(`${testPage.name} Page`, () => {
      let page: Page;
      let accessibilityReport: AccessibilityReport;

      test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto(testPage.url);
        
        // Wait for page to be fully loaded
        await page.waitForLoadState('networkidle');
        
        // Run accessibility check
        accessibilityReport = await accessibilityTester.runAccessibilityCheck(page, {
          testSuite: `${testPage.name}-page`
        });
      });

      test.afterEach(async () => {
        await page.close();
      });

      test('should have no critical accessibility violations', async () => {
        const criticalViolations = accessibilityReport.violations.filter(
          v => v.impact === 'critical'
        );

        if (criticalViolations.length > 0) {
          console.error('Critical accessibility violations found:', criticalViolations);
        }

        expect(criticalViolations).toHaveLength(0);
      });

      test('should have no serious accessibility violations', async () => {
        const seriousViolations = accessibilityReport.violations.filter(
          v => v.impact === 'serious'
        );

        if (seriousViolations.length > 0) {
          console.warn('Serious accessibility violations found:', seriousViolations);
        }

        expect(seriousViolations).toHaveLength(0);
      });

      test('should have proper color contrast ratios', async () => {
        const contrastResults = await accessibilityTester.checkColorContrast(page);
        
        if (!contrastResults.passesWCAG) {
          console.error('Color contrast violations:', contrastResults.violations);
        }

        expect(contrastResults.passesWCAG).toBeTruthy();
      });

      test('should support keyboard navigation', async () => {
        const keyboardResults = await accessibilityTester.checkKeyboardNavigation(page);
        
        expect(keyboardResults.canNavigateWithTab).toBeTruthy();
        
        if (keyboardResults.issues.length > 0) {
          console.warn('Keyboard navigation issues:', keyboardResults.issues);
        }

        expect(keyboardResults.issues.filter(issue => 
          issue.includes('does not work')
        )).toHaveLength(0);
      });

      test('should be compatible with screen readers', async () => {
        const screenReaderResults = await accessibilityTester.checkScreenReaderCompatibility(page);
        
        expect(screenReaderResults.hasProperHeadings).toBeTruthy();
        expect(screenReaderResults.hasLandmarks).toBeTruthy();
        expect(screenReaderResults.hasAltText).toBeTruthy();
        expect(screenReaderResults.hasAriaLabels).toBeTruthy();

        if (screenReaderResults.issues.length > 0) {
          console.warn('Screen reader compatibility issues:', screenReaderResults.issues);
        }
      });

      test('should have proper document structure', async () => {
        // Check for essential document structure elements
        const hasMain = await page.locator('main, [role="main"]').count() > 0;
        expect(hasMain).toBeTruthy();

        const hasH1 = await page.locator('h1').count() === 1;
        expect(hasH1).toBeTruthy();

        const hasTitle = await page.title();
        expect(hasTitle).toBeTruthy();
        expect(hasTitle.length).toBeGreaterThan(0);
      });

      test('should have proper form accessibility', async () => {
        const forms = await page.locator('form').count();
        
        if (forms > 0) {
          // All inputs should have labels
          const inputs = await page.locator('input, select, textarea').all();
          
          for (const input of inputs) {
            const hasLabel = await input.evaluate(el => {
              const id = el.getAttribute('id');
              const ariaLabel = el.getAttribute('aria-label');
              const ariaLabelledBy = el.getAttribute('aria-labelledby');
              const label = id ? document.querySelector(`label[for="${id}"]`) : null;
              
              return !!(ariaLabel || ariaLabelledBy || label);
            });

            expect(hasLabel).toBeTruthy();
          }

          // Required fields should be marked
          const requiredInputs = await page.locator('input[required], select[required], textarea[required]').all();
          
          for (const input of requiredInputs) {
            const hasRequiredIndicator = await input.evaluate(el => {
              const ariaRequired = el.getAttribute('aria-required');
              const requiredAttr = el.hasAttribute('required');
              
              return ariaRequired === 'true' || requiredAttr;
            });

            expect(hasRequiredIndicator).toBeTruthy();
          }
        }
      });

      test('should have accessible interactive elements', async () => {
        // Check buttons
        const buttons = await page.locator('button, [role="button"]').all();
        
        for (const button of buttons) {
          const hasAccessibleName = await button.evaluate(el => {
            const ariaLabel = el.getAttribute('aria-label');
            const ariaLabelledBy = el.getAttribute('aria-labelledby');
            const textContent = el.textContent?.trim();
            
            return !!(ariaLabel || ariaLabelledBy || textContent);
          });

          expect(hasAccessibleName).toBeTruthy();
        }

        // Check links
        const links = await page.locator('a[href]').all();
        
        for (const link of links) {
          const hasAccessibleName = await link.evaluate(el => {
            const ariaLabel = el.getAttribute('aria-label');
            const ariaLabelledBy = el.getAttribute('aria-labelledby');
            const textContent = el.textContent?.trim();
            const title = el.getAttribute('title');
            
            return !!(ariaLabel || ariaLabelledBy || textContent || title);
          });

          expect(hasAccessibleName).toBeTruthy();
        }
      });

      test('should handle focus management properly', async () => {
        // Test focus visibility
        await page.keyboard.press('Tab');
        
        const focusedElement = await page.evaluate(() => {
          const activeElement = document.activeElement;
          const styles = window.getComputedStyle(activeElement!);
          
          return {
            hasFocus: activeElement !== document.body,
            hasOutline: styles.outline !== 'none' && styles.outline !== '',
            hasBoxShadow: styles.boxShadow !== 'none' && styles.boxShadow !== '',
            hasBorder: styles.border !== 'none' && styles.border !== ''
          };
        });

        expect(focusedElement.hasFocus).toBeTruthy();
        
        // Focus should be visible (outline, box-shadow, or border)
        const hasFocusIndicator = focusedElement.hasOutline || 
                                 focusedElement.hasBoxShadow || 
                                 focusedElement.hasBorder;
        expect(hasFocusIndicator).toBeTruthy();
      });

      test('should have proper ARIA usage', async () => {
        // Check for ARIA landmarks
        const landmarks = await page.locator('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"]').count();
        expect(landmarks).toBeGreaterThan(0);

        // Check ARIA attributes are valid
        const elementsWithAria = await page.locator('[aria-*]').all();
        
        for (const element of elementsWithAria) {
          const ariaAttributes = await element.evaluate(el => {
            const attrs = {};
            for (const attr of el.attributes) {
              if (attr.name.startsWith('aria-')) {
                attrs[attr.name] = attr.value;
              }
            }
            return attrs;
          });

          // Check for common ARIA validation issues
          for (const [attrName, attrValue] of Object.entries(ariaAttributes)) {
            // aria-hidden should not be on focusable elements
            if (attrName === 'aria-hidden' && attrValue === 'true') {
              const isFocusable = await element.evaluate(el => {
                const tabIndex = el.getAttribute('tabindex');
                const isInteractive = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName);
                return isInteractive || (tabIndex && tabIndex !== '-1');
              });

              expect(isFocusable).toBeFalsy();
            }

            // aria-labelledby should reference existing elements
            if (attrName === 'aria-labelledby') {
              const referencedIds = (attrValue as string).split(' ');
              for (const id of referencedIds) {
                const referencedElement = await page.locator(`#${id}`).count();
                expect(referencedElement).toBeGreaterThan(0);
              }
            }

            // aria-describedby should reference existing elements
            if (attrName === 'aria-describedby') {
              const referencedIds = (attrValue as string).split(' ');
              for (const id of referencedIds) {
                const referencedElement = await page.locator(`#${id}`).count();
                expect(referencedElement).toBeGreaterThan(0);
              }
            }
          }
        }
      });

      test('should handle modal dialogs accessibly', async () => {
        const modals = await page.locator('[role="dialog"], [role="alertdialog"]').count();
        
        if (modals > 0) {
          // Trigger modal (this would need to be customized per page)
          const modalTrigger = await page.locator('[data-testid*="modal"], [data-testid*="dialog"]').first();
          
          if (await modalTrigger.count() > 0) {
            await modalTrigger.click();
            
            // Modal should be properly labeled
            const modal = page.locator('[role="dialog"], [role="alertdialog"]').first();
            
            const hasLabel = await modal.evaluate(el => {
              const ariaLabel = el.getAttribute('aria-label');
              const ariaLabelledBy = el.getAttribute('aria-labelledby');
              return !!(ariaLabel || ariaLabelledBy);
            });

            expect(hasLabel).toBeTruthy();

            // Focus should be trapped within modal
            await page.keyboard.press('Tab');
            const focusWithinModal = await page.evaluate(() => {
              const activeElement = document.activeElement;
              const modal = document.querySelector('[role="dialog"], [role="alertdialog"]');
              return modal?.contains(activeElement) || false;
            });

            expect(focusWithinModal).toBeTruthy();

            // Escape key should close modal
            await page.keyboard.press('Escape');
            const modalClosed = await page.locator('[role="dialog"], [role="alertdialog"]').count() === 0;
            expect(modalClosed).toBeTruthy();
          }
        }
      });
    });
  }

  test('should generate comprehensive accessibility report', async ({ browser }) => {
    const reports: AccessibilityReport[] = [];
    
    for (const testPage of testPages) {
      const page = await browser.newPage();
      await page.goto(testPage.url);
      await page.waitForLoadState('networkidle');
      
      const report = await accessibilityTester.runAccessibilityCheck(page, {
        testSuite: `${testPage.name}-page`
      });
      
      reports.push(report);
      await page.close();
    }

    const markdownReport = await accessibilityTester.generateAccessibilityReport(reports);
    
    // Save report to file
    const fs = require('fs');
    const path = require('path');
    const reportsDir = path.join(__dirname, '../../test-results/accessibility');
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `accessibility-report-${Date.now()}.md`);
    fs.writeFileSync(reportPath, markdownReport);
    
    console.log(`Accessibility report saved to: ${reportPath}`);
    
    // Assert overall compliance
    const totalViolations = reports.reduce((sum, r) => sum + r.summary.total, 0);
    const criticalViolations = reports.reduce((sum, r) => sum + r.summary.critical, 0);
    const seriousViolations = reports.reduce((sum, r) => sum + r.summary.serious, 0);
    
    expect(criticalViolations).toBe(0);
    expect(seriousViolations).toBe(0);
    expect(totalViolations).toBeLessThan(5); // Allow some minor/moderate issues
  });
});