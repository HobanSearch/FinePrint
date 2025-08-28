import { device, element, by, expect } from 'detox';
import { TestUtils } from '../setup';

describe('Analysis Workflow', () => {
  beforeEach(async () => {
    await device.reloadReactNative();
    await TestUtils.waitForElement(by.id('app-root'));
    await TestUtils.loginUser();
  });

  describe('Document Analysis', () => {
    beforeEach(async () => {
      await TestUtils.navigateToScreen('analysis');
    });

    it('should display analysis dashboard', async () => {
      await expect(element(by.id('analysis-dashboard'))).toBeVisible();
      await expect(element(by.id('risk-overview-card'))).toBeVisible();
      await expect(element(by.id('recent-analyses-list'))).toBeVisible();
    });

    it('should start analysis for uploaded document', async () => {
      await TestUtils.uploadDocument('privacy-policy');
      
      await element(by.id('start-analysis-button')).tap();
      
      await TestUtils.waitForElement(by.id('analysis-progress-screen'));
      await expect(element(by.id('analysis-progress-bar'))).toBeVisible();
      await expect(element(by.text('Analyzing document...'))).toBeVisible();
    });

    it('should show analysis progress with stages', async () => {
      await TestUtils.uploadDocument('terms-of-service');
      await element(by.id('start-analysis-button')).tap();
      
      // Should show different analysis stages
      await TestUtils.waitForElement(by.text('Extracting text...'));
      await TestUtils.waitForElement(by.text('Identifying patterns...'), 5000);
      await TestUtils.waitForElement(by.text('Calculating risk scores...'), 8000);
    });

    it('should complete analysis and show results', async () => {
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      // Wait for analysis to complete
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
      
      await expect(element(by.id('overall-risk-score'))).toBeVisible();
      await expect(element(by.id('findings-list'))).toBeVisible();
      await expect(element(by.id('recommendations-section'))).toBeVisible();
    });

    it('should handle analysis failure gracefully', async () => {
      // Simulate network error during analysis
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      await TestUtils.simulateNetworkCondition('offline');
      
      await TestUtils.waitForElement(by.text('Analysis failed. Please try again.'), 10000);
      await expect(element(by.id('retry-analysis-button'))).toBeVisible();
      
      await TestUtils.simulateNetworkCondition('fast');
    });
  });

  describe('Risk Assessment', () => {
    beforeEach(async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
    });

    it('should display overall risk score', async () => {
      await expect(element(by.id('overall-risk-score'))).toBeVisible();
      await expect(element(by.id('risk-gauge'))).toBeVisible();
      
      // Risk score should be a number between 0-100
      const riskScoreElement = element(by.id('risk-score-value'));
      await expect(riskScoreElement).toBeVisible();
    });

    it('should show risk breakdown by category', async () => {
      await element(by.id('risk-breakdown-tab')).tap();
      
      await expect(element(by.id('data-sharing-risk'))).toBeVisible();
      await expect(element(by.id('privacy-rights-risk'))).toBeVisible();
      await expect(element(by.id('data-retention-risk'))).toBeVisible();
      await expect(element(by.id('third-party-risk'))).toBeVisible();
    });

    it('should provide risk score explanation', async () => {
      await element(by.id('risk-explanation-button')).tap();
      
      await TestUtils.waitForElement(by.id('risk-explanation-modal'));
      await expect(element(by.text('How we calculate risk scores'))).toBeVisible();
      await expect(element(by.id('risk-factors-list'))).toBeVisible();
    });

    it('should show risk trend over time', async () => {
      await element(by.id('risk-history-tab')).tap();
      
      await expect(element(by.id('risk-trend-chart'))).toBeVisible();
      await expect(element(by.id('historical-analyses-list'))).toBeVisible();
    });
  });

  describe('Findings and Issues', () => {
    beforeEach(async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
    });

    it('should display findings list', async () => {
      await expect(element(by.id('findings-list'))).toBeVisible();
      await expect(element(by.id('finding-item-0'))).toBeVisible();
    });

    it('should show finding details', async () => {
      await element(by.id('finding-item-0')).tap();
      
      await TestUtils.waitForElement(by.id('finding-detail-modal'));
      await expect(element(by.id('finding-severity'))).toBeVisible();
      await expect(element(by.id('finding-description'))).toBeVisible();
      await expect(element(by.id('finding-location'))).toBeVisible();
    });

    it('should filter findings by severity', async () => {
      await element(by.id('findings-filter-button')).tap();
      await element(by.id('filter-high-severity')).tap();
      
      // Should only show high severity findings
      await TestUtils.waitForElement(by.id('filtered-findings-list'));
    });

    it('should filter findings by category', async () => {
      await element(by.id('findings-filter-button')).tap();
      await element(by.id('filter-data-sharing')).tap();
      
      // Should only show data sharing related findings
      await TestUtils.waitForElement(by.id('filtered-findings-list'));
    });

    it('should highlight problematic text in document', async () => {
      await element(by.id('finding-item-0')).tap();
      await element(by.id('view-in-document-button')).tap();
      
      await TestUtils.waitForElement(by.id('document-viewer'));
      await expect(element(by.id('highlighted-text'))).toBeVisible();
    });

    it('should provide finding explanations', async () => {
      await element(by.id('finding-item-0')).tap();
      
      await expect(element(by.id('finding-explanation'))).toBeVisible();
      await expect(element(by.text('Why this matters'))).toBeVisible();
    });
  });

  describe('Recommendations', () => {
    beforeEach(async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
      await element(by.id('recommendations-tab')).tap();
    });

    it('should display recommendations list', async () => {
      await expect(element(by.id('recommendations-list'))).toBeVisible();
      await expect(element(by.id('recommendation-item-0'))).toBeVisible();
    });

    it('should show recommendation details', async () => {
      await element(by.id('recommendation-item-0')).tap();
      
      await TestUtils.waitForElement(by.id('recommendation-detail-modal'));
      await expect(element(by.id('recommendation-title'))).toBeVisible();
      await expect(element(by.id('recommendation-description'))).toBeVisible();
      await expect(element(by.id('implementation-steps'))).toBeVisible();
    });

    it('should prioritize recommendations', async () => {
      await element(by.id('recommendations-sort-button')).tap();
      await element(by.id('sort-by-priority')).tap();
      
      // High priority recommendations should appear first
      await TestUtils.waitForElement(by.id('recommendations-list'));
    });

    it('should mark recommendations as implemented', async () => {
      await element(by.id('recommendation-item-0')).tap();
      await element(by.id('mark-implemented-button')).tap();
      
      await expect(element(by.id('implemented-badge'))).toBeVisible();
    });

    it('should export recommendations', async () => {
      await element(by.id('export-recommendations-button')).tap();
      
      await TestUtils.waitForElement(by.id('export-options-modal'));
      await element(by.id('export-pdf-recommendations')).tap();
      
      await expect(element(by.text('Recommendations exported successfully'))).toBeVisible();
    });
  });

  describe('Comparison Analysis', () => {
    beforeEach(async () => {
      await TestUtils.navigateToScreen('analysis');
    });

    it('should compare multiple documents', async () => {
      // Upload and analyze first document
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
      
      // Upload and analyze second document
      await element(by.id('add-comparison-document')).tap();
      await TestUtils.uploadDocument('terms-of-service');
      
      await TestUtils.waitForElement(by.id('comparison-view'));
      await expect(element(by.id('comparison-chart'))).toBeVisible();
    });

    it('should show side-by-side comparison', async () => {
      await element(by.id('comparison-mode-toggle')).tap();
      
      await expect(element(by.id('side-by-side-view'))).toBeVisible();
      await expect(element(by.id('document-a-findings'))).toBeVisible();
      await expect(element(by.id('document-b-findings'))).toBeVisible();
    });

    it('should highlight differences between documents', async () => {
      await element(by.id('comparison-mode-toggle')).tap();
      
      await expect(element(by.id('unique-findings-a'))).toBeVisible();
      await expect(element(by.id('unique-findings-b'))).toBeVisible();
      await expect(element(by.id('common-findings'))).toBeVisible();
    });
  });

  describe('Real-time Updates', () => {
    it('should receive real-time analysis updates', async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      // Should show progress updates in real-time
      await TestUtils.waitForElement(by.text('Text extraction: 25%'));
      await TestUtils.waitForElement(by.text('Pattern recognition: 50%'), 3000);
      await TestUtils.waitForElement(by.text('Risk calculation: 75%'), 6000);
    });

    it('should handle connection interruption during analysis', async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      // Interrupt connection during analysis
      await TestUtils.simulateNetworkCondition('offline');
      
      await TestUtils.waitForElement(by.text('Connection lost. Reconnecting...'));
      
      // Restore connection
      await TestUtils.simulateNetworkCondition('fast');
      
      await TestUtils.waitForElement(by.text('Connection restored. Resuming analysis...'));
    });
  });

  describe('Performance', () => {
    it('should complete analysis within expected timeframe', async () => {
      const duration = await TestUtils.measurePerformance(async () => {
        await TestUtils.navigateToScreen('analysis');
        await TestUtils.uploadDocument('privacy-policy');
        await element(by.id('start-analysis-button')).tap();
        await TestUtils.waitForElement(by.id('analysis-results-screen'), 20000);
      }, 20000);
      
      expect(duration).toBeLessThan(20000);
    });

    it('should handle multiple concurrent analyses', async () => {
      await TestUtils.navigateToScreen('analysis');
      
      // Start multiple analyses
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      await element(by.id('new-analysis-button')).tap();
      await TestUtils.uploadDocument('terms-of-service');
      await element(by.id('start-analysis-button')).tap();
      
      // Both should complete successfully
      await TestUtils.waitForElement(by.text('2 analyses completed'));
    });
  });

  describe('Accessibility', () => {
    it('should announce analysis progress to screen readers', async () => {
      await device.setAccessibility(true);
      
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      
      // Screen reader should announce progress updates
      await TestUtils.waitForElement(by.text('Analysis progress: 25 percent complete'));
    });

    it('should support keyboard navigation in results', async () => {
      await TestUtils.navigateToScreen('analysis');
      await TestUtils.uploadDocument('privacy-policy');
      await element(by.id('start-analysis-button')).tap();
      await TestUtils.waitForElement(by.id('analysis-results-screen'), 15000);
      
      await TestUtils.checkAccessibility('findings-list');
      await TestUtils.checkAccessibility('recommendations-list');
      await TestUtils.checkAccessibility('risk-score-card');
    });
  });
});