import { Page } from 'playwright';
import { configureAxe, getViolations } from 'jest-axe';

export interface AccessibilityViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical';
  tags: string[];
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{
    target: string[];
    html: string;
    failureSummary: string;
  }>;
}

export interface AccessibilityReport {
  violations: AccessibilityViolation[];
  passes: any[];
  incomplete: any[];
  inapplicable: any[];
  url: string;
  timestamp: string;
  testSuite: string;
  summary: {
    total: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
}

export class AccessibilityTester {
  private axe: any;

  constructor() {
    this.axe = configureAxe({
      rules: {
        // WCAG 2.1 AA specific rules
        'color-contrast': { enabled: true },
        'focus-order-semantics': { enabled: true },
        'hidden-content': { enabled: true },
        'label-title-only': { enabled: true },
        'link-in-text-block': { enabled: true },
        'p-as-heading': { enabled: true },
        'table-duplicate-name': { enabled: true },
        'td-has-header': { enabled: true },
        'th-has-data-cells': { enabled: true },
        'valid-lang': { enabled: true },
        'video-caption': { enabled: true }
      },
      tags: ['wcag2a', 'wcag2aa', 'wcag21aa']
    });
  }

  async runAccessibilityCheck(
    page: Page, 
    options: {
      selector?: string;
      excludeSelectors?: string[];
      includeTags?: string[];
      excludeRules?: string[];
      testSuite?: string;
    } = {}
  ): Promise<AccessibilityReport> {
    // Inject axe-core into the page
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.2/axe.min.js'
    });

    // Wait for axe to be available
    await page.waitForFunction(() => typeof window.axe !== 'undefined');

    // Configure axe in the browser context
    const axeConfig = {
      rules: {
        'color-contrast': { enabled: true },
        'focus-order-semantics': { enabled: true },
        'aria-allowed-attr': { enabled: true },
        'aria-required-attr': { enabled: true },
        'aria-valid-attr-value': { enabled: true },
        'button-name': { enabled: true },
        'document-title': { enabled: true },
        'duplicate-id': { enabled: true },
        'form-field-multiple-labels': { enabled: true },
        'html-has-lang': { enabled: true },
        'image-alt': { enabled: true },
        'label': { enabled: true },
        'link-name': { enabled: true },
        'list': { enabled: true },
        'listitem': { enabled: true }
      },
      tags: options.includeTags || ['wcag2a', 'wcag2aa', 'wcag21aa']
    };

    // Run axe accessibility check
    const results = await page.evaluate(async (config, selector, excludeSelectors) => {
      const context = selector ? { include: [[selector]] } : document;
      
      if (excludeSelectors && excludeSelectors.length > 0) {
        context.exclude = excludeSelectors.map(sel => [sel]);
      }

      return await window.axe.run(context, config);
    }, axeConfig, options.selector, options.excludeSelectors);

    // Process and format results
    const report: AccessibilityReport = {
      violations: results.violations,
      passes: results.passes,
      incomplete: results.incomplete,
      inapplicable: results.inapplicable,
      url: page.url(),
      timestamp: new Date().toISOString(),
      testSuite: options.testSuite || 'accessibility-test',
      summary: {
        total: results.violations.length,
        critical: results.violations.filter(v => v.impact === 'critical').length,
        serious: results.violations.filter(v => v.impact === 'serious').length,
        moderate: results.violations.filter(v => v.impact === 'moderate').length,
        minor: results.violations.filter(v => v.impact === 'minor').length
      }
    };

    return report;
  }

  async checkKeyboardNavigation(page: Page): Promise<{
    canNavigateWithTab: boolean;
    canNavigateWithArrows: boolean;
    focusTrapsWork: boolean;
    skipLinksWork: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    let canNavigateWithTab = true;
    let canNavigateWithArrows = true;
    let focusTrapsWork = true;
    let skipLinksWork = true;

    try {
      // Test tab navigation
      await page.keyboard.press('Tab');
      const firstFocusedElement = await page.evaluate(() => 
        document.activeElement?.tagName || null
      );

      if (!firstFocusedElement || firstFocusedElement === 'BODY') {
        canNavigateWithTab = false;
        issues.push('Tab navigation does not work - no focusable elements found');
      }

      // Test tab order
      const tabOrder = [];
      for (let i = 0; i < 10; i++) {
        await page.keyboard.press('Tab');
        const activeElement = await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          id: document.activeElement?.id,
          className: document.activeElement?.className,
          text: document.activeElement?.textContent?.slice(0, 50)
        }));
        
        if (activeElement.tag) {
          tabOrder.push(activeElement);
        }
      }

      // Check for skip links
      await page.keyboard.press('Tab');
      const skipLink = await page.evaluate(() => {
        const activeElement = document.activeElement;
        return activeElement?.textContent?.toLowerCase().includes('skip') ||
               activeElement?.getAttribute('href')?.startsWith('#main') ||
               activeElement?.getAttribute('href')?.startsWith('#content');
      });

      if (!skipLink) {
        skipLinksWork = false;
        issues.push('No skip links found for keyboard navigation');
      }

      // Test arrow key navigation for specific components
      const hasArrowKeyComponents = await page.evaluate(() => {
        return document.querySelector('[role="menubar"], [role="tablist"], [role="listbox"]') !== null;
      });

      if (hasArrowKeyComponents) {
        // Focus on arrow-navigable component
        await page.focus('[role="menubar"], [role="tablist"], [role="listbox"]');
        
        const initialFocus = await page.evaluate(() => 
          document.activeElement?.getAttribute('aria-selected') || 
          document.activeElement?.getAttribute('aria-current')
        );

        await page.keyboard.press('ArrowRight');
        
        const afterArrowFocus = await page.evaluate(() => 
          document.activeElement?.getAttribute('aria-selected') || 
          document.activeElement?.getAttribute('aria-current')
        );

        if (initialFocus === afterArrowFocus) {
          canNavigateWithArrows = false;
          issues.push('Arrow key navigation does not work on interactive components');
        }
      }

      // Test focus traps in modals
      const hasModal = await page.evaluate(() => 
        document.querySelector('[role="dialog"], [role="alertdialog"]') !== null
      );

      if (hasModal) {
        // Try to tab out of modal
        const modalElement = await page.$('[role="dialog"], [role="alertdialog"]');
        if (modalElement) {
          await modalElement.focus();
          
          // Tab multiple times to try to escape modal
          for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab');
          }
          
          const currentFocus = await page.evaluate(() => {
            const activeElement = document.activeElement;
            const modal = document.querySelector('[role="dialog"], [role="alertdialog"]');
            return modal?.contains(activeElement) || false;
          });

          if (!currentFocus) {
            focusTrapsWork = false;
            issues.push('Focus trap does not work in modal dialogs');
          }
        }
      }

    } catch (error) {
      issues.push(`Keyboard navigation test failed: ${error.message}`);
    }

    return {
      canNavigateWithTab,
      canNavigateWithArrows,
      focusTrapsWork,
      skipLinksWork,
      issues
    };
  }

  async checkColorContrast(page: Page): Promise<{
    passesWCAG: boolean;
    violations: Array<{
      element: string;
      foreground: string;
      background: string;
      ratio: number;
      requiredRatio: number;
    }>;
  }> {
    const contrastResults = await page.evaluate(() => {
      const violations = [];
      const elements = document.querySelectorAll('*');
      
      elements.forEach(element => {
        const styles = window.getComputedStyle(element);
        const color = styles.color;
        const backgroundColor = styles.backgroundColor;
        
        if (color && backgroundColor && 
            color !== 'rgba(0, 0, 0, 0)' && 
            backgroundColor !== 'rgba(0, 0, 0, 0)') {
          
          // Calculate contrast ratio (simplified)
          const colorRgb = color.match(/\d+/g);
          const bgRgb = backgroundColor.match(/\d+/g);
          
          if (colorRgb && bgRgb) {
            const colorLum = (0.299 * parseInt(colorRgb[0]) + 
                            0.587 * parseInt(colorRgb[1]) + 
                            0.114 * parseInt(colorRgb[2])) / 255;
            const bgLum = (0.299 * parseInt(bgRgb[0]) + 
                          0.587 * parseInt(bgRgb[1]) + 
                          0.114 * parseInt(bgRgb[2])) / 255;
            
            const ratio = (Math.max(colorLum, bgLum) + 0.05) / 
                         (Math.min(colorLum, bgLum) + 0.05);
            
            const fontSize = parseFloat(styles.fontSize);
            const requiredRatio = fontSize >= 18 || styles.fontWeight === 'bold' ? 3 : 4.5;
            
            if (ratio < requiredRatio) {
              violations.push({
                element: element.tagName + (element.id ? `#${element.id}` : '') + 
                        (element.className ? `.${element.className.split(' ')[0]}` : ''),
                foreground: color,
                background: backgroundColor,
                ratio: Math.round(ratio * 100) / 100,
                requiredRatio
              });
            }
          }
        }
      });
      
      return violations;
    });

    return {
      passesWCAG: contrastResults.length === 0,
      violations: contrastResults
    };
  }

  async checkScreenReaderCompatibility(page: Page): Promise<{
    hasProperHeadings: boolean;
    hasLandmarks: boolean;
    hasAltText: boolean;
    hasAriaLabels: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    const screenReaderCheck = await page.evaluate(() => {
      const results = {
        hasProperHeadings: false,
        hasLandmarks: false,
        hasAltText: true,
        hasAriaLabels: true,
        headingIssues: [],
        landmarkIssues: [],
        altTextIssues: [],
        ariaIssues: []
      };

      // Check heading structure
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (headings.length > 0) {
        const h1Count = document.querySelectorAll('h1').length;
        if (h1Count === 1) {
          results.hasProperHeadings = true;
        } else if (h1Count === 0) {
          results.headingIssues.push('No h1 heading found');
        } else {
          results.headingIssues.push('Multiple h1 headings found');
        }

        // Check heading hierarchy
        let previousLevel = 0;
        headings.forEach(heading => {
          const level = parseInt(heading.tagName.charAt(1));
          if (level > previousLevel + 1) {
            results.headingIssues.push(`Heading level skip: ${heading.tagName} after h${previousLevel}`);
          }
          previousLevel = level;
        });
      } else {
        results.headingIssues.push('No headings found');
      }

      // Check landmarks
      const landmarks = document.querySelectorAll(
        'main, nav, aside, section, article, header, footer, [role="main"], [role="navigation"], [role="complementary"], [role="banner"], [role="contentinfo"]'
      );
      results.hasLandmarks = landmarks.length > 0;
      if (!results.hasLandmarks) {
        results.landmarkIssues.push('No landmark elements found');
      }

      // Check alt text
      const images = document.querySelectorAll('img');
      images.forEach((img, index) => {
        if (!img.getAttribute('alt') && img.getAttribute('alt') !== '') {
          results.hasAltText = false;
          results.altTextIssues.push(`Image ${index + 1} missing alt text`);
        }
      });

      // Check ARIA labels
      const interactiveElements = document.querySelectorAll(
        'button, input, select, textarea, a[href], [role="button"], [role="link"], [tabindex]'
      );
      interactiveElements.forEach((element, index) => {
        const hasLabel = element.getAttribute('aria-label') ||
                        element.getAttribute('aria-labelledby') ||
                        element.textContent?.trim() ||
                        (element.tagName === 'INPUT' && element.getAttribute('placeholder'));
        
        if (!hasLabel) {
          results.hasAriaLabels = false;
          results.ariaIssues.push(`Interactive element ${index + 1} (${element.tagName}) missing accessible label`);
        }
      });

      return results;
    });

    issues.push(...screenReaderCheck.headingIssues);
    issues.push(...screenReaderCheck.landmarkIssues);
    issues.push(...screenReaderCheck.altTextIssues);
    issues.push(...screenReaderCheck.ariaIssues);

    return {
      hasProperHeadings: screenReaderCheck.hasProperHeadings,
      hasLandmarks: screenReaderCheck.hasLandmarks,
      hasAltText: screenReaderCheck.hasAltText,
      hasAriaLabels: screenReaderCheck.hasAriaLabels,
      issues
    };
  }

  async generateAccessibilityReport(reports: AccessibilityReport[]): Promise<string> {
    const aggregatedReport = {
      summary: {
        totalTests: reports.length,
        totalViolations: reports.reduce((sum, r) => sum + r.summary.total, 0),
        criticalViolations: reports.reduce((sum, r) => sum + r.summary.critical, 0),
        seriousViolations: reports.reduce((sum, r) => sum + r.summary.serious, 0),
        moderateViolations: reports.reduce((sum, r) => sum + r.summary.moderate, 0),
        minorViolations: reports.reduce((sum, r) => sum + r.summary.minor, 0)
      },
      testResults: reports,
      timestamp: new Date().toISOString()
    };

    const markdownReport = `
# Accessibility Test Report

**Generated:** ${aggregatedReport.timestamp}

## Summary

- **Total Tests:** ${aggregatedReport.summary.totalTests}
- **Total Violations:** ${aggregatedReport.summary.totalViolations}
- **Critical:** ${aggregatedReport.summary.criticalViolations}
- **Serious:** ${aggregatedReport.summary.seriousViolations}
- **Moderate:** ${aggregatedReport.summary.moderateViolations}
- **Minor:** ${aggregatedReport.summary.minorViolations}

## WCAG 2.1 AA Compliance Status

${aggregatedReport.summary.totalViolations === 0 ? '✅ **COMPLIANT**' : '❌ **NON-COMPLIANT**'}

## Detailed Results

${reports.map(report => `
### ${report.testSuite} - ${report.url}

**Violations:** ${report.summary.total}

${report.violations.map(violation => `
#### ${violation.id} (${violation.impact})

**Description:** ${violation.description}

**Help:** ${violation.help}

**Elements affected:** ${violation.nodes.length}

${violation.nodes.map(node => `
- **Target:** ${node.target.join(' > ')}
- **HTML:** \`${node.html}\`
- **Issue:** ${node.failureSummary}
`).join('\n')}

**More info:** [${violation.helpUrl}](${violation.helpUrl})
`).join('\n')}
`).join('\n')}

## Recommendations

${aggregatedReport.summary.criticalViolations > 0 ? '🚨 **Critical issues must be resolved immediately**' : ''}
${aggregatedReport.summary.seriousViolations > 0 ? '⚠️ **Serious issues should be resolved before release**' : ''}
${aggregatedReport.summary.moderateViolations > 0 ? '📝 **Moderate issues should be addressed in next iteration**' : ''}
${aggregatedReport.summary.minorViolations > 0 ? '💡 **Minor issues can be addressed as time permits**' : ''}

---

*Report generated by Fine Print AI Accessibility Testing Framework*
    `;

    return markdownReport;
  }
}

export default AccessibilityTester;