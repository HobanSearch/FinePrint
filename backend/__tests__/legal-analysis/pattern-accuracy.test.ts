import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { PatternAnalyzer } from '../../services/analysis/src/services/patterns';
import { TextProcessor } from '../../services/analysis/src/services/textProcessor';
import { RiskScoring } from '../../services/analysis/src/services/riskScoring';
import fs from 'fs';
import path from 'path';

// Legal document test fixtures
const TEST_DOCUMENTS = {
  'privacy-policy-high-risk': path.join(__dirname, 'fixtures/privacy-policy-high-risk.txt'),
  'privacy-policy-low-risk': path.join(__dirname, 'fixtures/privacy-policy-low-risk.txt'),
  'terms-of-service-problematic': path.join(__dirname, 'fixtures/terms-of-service-problematic.txt'),
  'terms-of-service-standard': path.join(__dirname, 'fixtures/terms-of-service-standard.txt'),
  'eula-restrictive': path.join(__dirname, 'fixtures/eula-restrictive.txt'),
  'eula-permissive': path.join(__dirname, 'fixtures/eula-permissive.txt')
};

// Known patterns and their expected findings
const PATTERN_EXPECTATIONS = {
  'automatic-renewal': {
    keywords: ['automatically renew', 'auto-renewal', 'continuous subscription'],
    severity: 'high',
    category: 'billing-practices'
  },
  'broad-data-sharing': {
    keywords: ['share with partners', 'third-party access', 'marketing purposes'],
    severity: 'high',
    category: 'data-sharing'
  },
  'class-action-waiver': {
    keywords: ['waive class action', 'individual arbitration only', 'no class proceedings'],
    severity: 'critical',
    category: 'legal-rights'
  },
  'data-retention-indefinite': {
    keywords: ['retain indefinitely', 'no deletion timeline', 'permanent storage'],
    severity: 'high',
    category: 'data-retention'
  },
  'jurisdiction-clause': {
    keywords: ['governed by laws of', 'exclusive jurisdiction', 'courts of'],
    severity: 'medium',
    category: 'legal-jurisdiction'
  },
  'liability-limitation': {
    keywords: ['limit liability', 'no consequential damages', 'maximum liability'],
    severity: 'medium',
    category: 'legal-rights'
  }
};

describe('Legal Document Pattern Analysis Accuracy', () => {
  let patternAnalyzer: PatternAnalyzer;
  let textProcessor: TextProcessor;
  let riskScoring: RiskScoring;
  
  beforeAll(async () => {
    patternAnalyzer = new PatternAnalyzer();
    textProcessor = new TextProcessor();
    riskScoring = new RiskScoring();
    
    // Ensure test fixtures exist
    await createTestFixtures();
  });

  describe('Pattern Detection Accuracy', () => {
    test('should detect automatic renewal clauses with high accuracy', async () => {
      const testCases = [
        {
          text: 'Your subscription will automatically renew each month unless you cancel.',
          shouldDetect: true,
          expectedSeverity: 'high'
        },
        {
          text: 'You may cancel your subscription at any time before the next billing cycle.',
          shouldDetect: false,
          expectedSeverity: null
        },
        {
          text: 'We will automatically charge your payment method for subscription renewals.',
          shouldDetect: true,
          expectedSeverity: 'high'
        },
        {
          text: 'Your subscription continues until you actively cancel it.',
          shouldDetect: true,
          expectedSeverity: 'medium'
        }
      ];

      for (const testCase of testCases) {
        const findings = await patternAnalyzer.analyzeText(testCase.text, 'terms-of-service');
        const renewalFindings = findings.filter(f => f.pattern === 'automatic-renewal');
        
        if (testCase.shouldDetect) {
          expect(renewalFindings.length).toBeGreaterThan(0);
          expect(renewalFindings[0].severity).toBe(testCase.expectedSeverity);
        } else {
          expect(renewalFindings.length).toBe(0);
        }
      }
    });

    test('should detect class action waivers accurately', async () => {
      const testCases = [
        {
          text: 'You waive any right to participate in a class action lawsuit against us.',
          shouldDetect: true,
          expectedSeverity: 'critical',
          expectedCategory: 'legal-rights'
        },
        {
          text: 'Disputes must be resolved through individual arbitration only.',
          shouldDetect: true,
          expectedSeverity: 'critical',
          expectedCategory: 'legal-rights'
        },
        {
          text: 'You may file complaints with relevant regulatory authorities.',
          shouldDetect: false,
          expectedSeverity: null,
          expectedCategory: null
        },
        {
          text: 'Class proceedings and jury trials are not permitted under this agreement.',
          shouldDetect: true,
          expectedSeverity: 'critical',
          expectedCategory: 'legal-rights'
        }
      ];

      for (const testCase of testCases) {
        const findings = await patternAnalyzer.analyzeText(testCase.text, 'terms-of-service');
        const classActionFindings = findings.filter(f => f.pattern === 'class-action-waiver');
        
        if (testCase.shouldDetect) {
          expect(classActionFindings.length).toBeGreaterThan(0);
          expect(classActionFindings[0].severity).toBe(testCase.expectedSeverity);
          expect(classActionFindings[0].category).toBe(testCase.expectedCategory);
        } else {
          expect(classActionFindings.length).toBe(0);
        }
      }
    });

    test('should detect data sharing patterns with context awareness', async () => {
      const testCases = [
        {
          text: 'We may share your personal information with our marketing partners.',
          shouldDetect: true,
          expectedSeverity: 'high',
          contextType: 'privacy-policy'
        },
        {
          text: 'We share aggregated, anonymized data for research purposes.',
          shouldDetect: true,
          expectedSeverity: 'low',
          contextType: 'privacy-policy'
        },
        {
          text: 'Your data is never shared with third parties without your explicit consent.',
          shouldDetect: false,
          expectedSeverity: null,
          contextType: 'privacy-policy'
        },
        {
          text: 'In case of merger or acquisition, your data may be transferred to the new entity.',
          shouldDetect: true,
          expectedSeverity: 'medium',
          contextType: 'privacy-policy'
        }
      ];

      for (const testCase of testCases) {
        const findings = await patternAnalyzer.analyzeText(testCase.text, testCase.contextType);
        const dataSharingFindings = findings.filter(f => f.category === 'data-sharing');
        
        if (testCase.shouldDetect) {
          expect(dataSharingFindings.length).toBeGreaterThan(0);
          expect(dataSharingFindings[0].severity).toBe(testCase.expectedSeverity);
        } else {
          expect(dataSharingFindings.length).toBe(0);
        }
      }
    });

    test('should handle complex legal language variations', async () => {
      const complexClauses = [
        {
          text: 'Notwithstanding any provision to the contrary, we hereby reserve the right to modify, suspend, or discontinue the service with or without notice.',
          expectedPattern: 'service-modification',
          expectedSeverity: 'medium'
        },
        {
          text: 'To the fullest extent permitted by applicable law, in no event shall we be liable for any indirect, incidental, special, consequential, or punitive damages.',
          expectedPattern: 'liability-limitation',
          expectedSeverity: 'high'
        },
        {
          text: 'By using our service, you irrevocably consent to the exclusive jurisdiction of the courts located in Delaware, USA.',
          expectedPattern: 'jurisdiction-clause',
          expectedSeverity: 'medium'
        }
      ];

      for (const clause of complexClauses) {
        const findings = await patternAnalyzer.analyzeText(clause.text, 'terms-of-service');
        const relevantFindings = findings.filter(f => f.pattern === clause.expectedPattern);
        
        expect(relevantFindings.length).toBeGreaterThan(0);
        expect(relevantFindings[0].severity).toBe(clause.expectedSeverity);
      }
    });
  });

  describe('Risk Scoring Accuracy', () => {
    test('should calculate accurate risk scores for different document types', async () => {
      const testDocuments = [
        {
          type: 'privacy-policy',
          content: await fs.promises.readFile(TEST_DOCUMENTS['privacy-policy-high-risk'], 'utf8'),
          expectedRiskRange: [70, 100],
          expectedHighSeverityCount: { min: 3, max: 10 }
        },
        {
          type: 'privacy-policy',
          content: await fs.promises.readFile(TEST_DOCUMENTS['privacy-policy-low-risk'], 'utf8'),
          expectedRiskRange: [0, 40],
          expectedHighSeverityCount: { min: 0, max: 2 }
        },
        {
          type: 'terms-of-service',
          content: await fs.promises.readFile(TEST_DOCUMENTS['terms-of-service-problematic'], 'utf8'),
          expectedRiskRange: [60, 95],
          expectedHighSeverityCount: { min: 2, max: 8 }
        }
      ];

      for (const doc of testDocuments) {
        const findings = await patternAnalyzer.analyzeText(doc.content, doc.type);
        const riskScore = await riskScoring.calculateRiskScore(findings, doc.type);
        
        expect(riskScore).toBeGreaterThanOrEqual(doc.expectedRiskRange[0]);
        expect(riskScore).toBeLessThanOrEqual(doc.expectedRiskRange[1]);
        
        const highSeverityFindings = findings.filter(f => f.severity === 'high' || f.severity === 'critical');
        expect(highSeverityFindings.length).toBeGreaterThanOrEqual(doc.expectedHighSeverityCount.min);
        expect(highSeverityFindings.length).toBeLessThanOrEqual(doc.expectedHighSeverityCount.max);
      }
    });

    test('should weight different pattern categories appropriately', async () => {
      const categorizedFindings = [
        {
          category: 'legal-rights',
          severity: 'critical',
          expectedWeight: 0.25 // Should have high weight
        },
        {
          category: 'data-sharing',
          severity: 'high',
          expectedWeight: 0.20 // Should have high weight
        },
        {
          category: 'billing-practices',
          severity: 'medium',
          expectedWeight: 0.15 // Moderate weight
        },
        {
          category: 'technical-details',
          severity: 'low',
          expectedWeight: 0.05 // Lower weight
        }
      ];

      const mockFindings = categorizedFindings.map(cf => ({
        id: `finding-${cf.category}`,
        pattern: `test-${cf.category}`,
        category: cf.category,
        severity: cf.severity,
        description: `Test finding for ${cf.category}`,
        location: { start: 0, end: 10 },
        confidence: 0.9
      }));

      const weights = await riskScoring.getCategoryWeights();
      
      for (const finding of mockFindings) {
        const categoryWeight = weights[finding.category];
        const expectedWeight = categorizedFindings.find(cf => cf.category === finding.category)?.expectedWeight;
        
        expect(categoryWeight).toBeCloseTo(expectedWeight!, 2);
      }
    });

    test('should handle edge cases in risk calculation', async () => {
      const edgeCases = [
        {
          name: 'empty document',
          findings: [],
          expectedRisk: 0
        },
        {
          name: 'single critical finding',
          findings: [{
            id: 'critical-1',
            pattern: 'class-action-waiver',
            category: 'legal-rights',
            severity: 'critical',
            description: 'Critical legal rights waiver',
            location: { start: 0, end: 50 },
            confidence: 1.0
          }],
          expectedRiskRange: [60, 100]
        },
        {
          name: 'many low severity findings',
          findings: Array(20).fill(null).map((_, i) => ({
            id: `low-${i}`,
            pattern: 'minor-issue',
            category: 'technical-details',
            severity: 'low',
            description: 'Minor technical detail',
            location: { start: i * 10, end: (i + 1) * 10 },
            confidence: 0.7
          })),
          expectedRiskRange: [20, 50]
        }
      ];

      for (const edgeCase of edgeCases) {
        const riskScore = await riskScoring.calculateRiskScore(edgeCase.findings, 'privacy-policy');
        
        if (edgeCase.expectedRisk !== undefined) {
          expect(riskScore).toBe(edgeCase.expectedRisk);
        } else if (edgeCase.expectedRiskRange) {
          expect(riskScore).toBeGreaterThanOrEqual(edgeCase.expectedRiskRange[0]);
          expect(riskScore).toBeLessThanOrEqual(edgeCase.expectedRiskRange[1]);
        }
      }
    });
  });

  describe('Text Processing Accuracy', () => {
    test('should handle different document formats correctly', async () => {
      const formatTests = [
        {
          format: 'plain-text',
          content: 'Simple privacy policy text with data collection practices.',
          expectedProcessing: true
        },
        {
          format: 'html',
          content: '<h1>Privacy Policy</h1><p>We collect your <strong>personal data</strong> for marketing.</p>',
          expectedProcessing: true,
          expectedCleanText: true
        },
        {
          format: 'markdown',
          content: '# Terms of Service\n\n## Data Usage\n\nWe **may share** your data with partners.',
          expectedProcessing: true,
          expectedCleanText: true
        }
      ];

      for (const formatTest of formatTests) {
        const processed = await textProcessor.processText(formatTest.content, formatTest.format);
        
        expect(processed).toBeDefined();
        expect(processed.cleanText.length).toBeGreaterThan(0);
        
        if (formatTest.expectedCleanText) {
          // HTML/Markdown tags should be removed
          expect(processed.cleanText).not.toContain('<');
          expect(processed.cleanText).not.toContain('#');
          expect(processed.cleanText).not.toContain('**');
        }
      }
    });

    test('should preserve legal context during processing', async () => {
      const legalTexts = [
        {
          original: 'We may share your information with third parties for marketing purposes, subject to applicable law.',
          expectedKeyPhrases: ['share your information', 'third parties', 'marketing purposes']
        },
        {
          original: 'This agreement shall be governed by and construed in accordance with the laws of Delaware.',
          expectedKeyPhrases: ['governed by', 'laws of Delaware', 'construed in accordance']
        }
      ];

      for (const legalText of legalTexts) {
        const processed = await textProcessor.processText(legalText.original, 'plain-text');
        
        for (const keyPhrase of legalText.expectedKeyPhrases) {
          expect(processed.cleanText.toLowerCase()).toContain(keyPhrase.toLowerCase());
        }
      }
    });

    test('should handle multilingual content', async () => {
      const multilingualTests = [
        {
          language: 'es',
          content: 'Política de Privacidad: Recopilamos su información personal para fines de marketing.',
          expectedLanguage: 'es',
          expectedDetection: true
        },
        {
          language: 'fr',  
          content: 'Politique de Confidentialité: Nous collectons vos données personnelles.',
          expectedLanguage: 'fr',
          expectedDetection: true
        },
        {
          language: 'de',
          content: 'Datenschutz-Bestimmungen: Wir sammeln Ihre persönlichen Daten.',
          expectedLanguage: 'de',
          expectedDetection: true
        }
      ];

      for (const test of multilingualTests) {
        const processed = await textProcessor.processText(test.content, 'plain-text');
        
        expect(processed.detectedLanguage).toBe(test.expectedLanguage);
        expect(processed.cleanText.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Pattern Analysis Benchmarking', () => {
    test('should meet performance benchmarks for analysis speed', async () => {
      const benchmarkDocument = await fs.promises.readFile(TEST_DOCUMENTS['privacy-policy-high-risk'], 'utf8');
      const documentLength = benchmarkDocument.length;
      
      const startTime = Date.now();
      const findings = await patternAnalyzer.analyzeText(benchmarkDocument, 'privacy-policy');
      const endTime = Date.now();
      
      const analysisTime = endTime - startTime;
      const wordsPerSecond = (documentLength / analysisTime) * 1000;
      
      // Should process at least 1000 characters per second
      expect(wordsPerSecond).toBeGreaterThan(1000);
      
      // Analysis should complete within reasonable time for typical documents
      expect(analysisTime).toBeLessThan(5000); // 5 seconds max
    });

    test('should maintain accuracy under different load conditions', async () => {
      const testDocument = await fs.promises.readFile(TEST_DOCUMENTS['terms-of-service-problematic'], 'utf8');
      
      // Concurrent analysis simulation
      const concurrentAnalyses = Array(5).fill(null).map(() => 
        patternAnalyzer.analyzeText(testDocument, 'terms-of-service')
      );
      
      const results = await Promise.all(concurrentAnalyses);
      
      // All results should be consistent
      const baselineFindings = results[0];
      for (let i = 1; i < results.length; i++) {
        expect(results[i].length).toBe(baselineFindings.length);
        
        // Key findings should match
        const baselinePatterns = baselineFindings.map(f => f.pattern).sort();
        const currentPatterns = results[i].map(f => f.pattern).sort();
        expect(currentPatterns).toEqual(baselinePatterns);
      }
    });

    test('should handle memory efficiently with large documents', async () => {
      // Create a large document by repeating content
      const baseDocument = await fs.promises.readFile(TEST_DOCUMENTS['privacy-policy-high-risk'], 'utf8');
      const largeDocument = Array(10).fill(baseDocument).join('\n\n');
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      const findings = await patternAnalyzer.analyzeText(largeDocument, 'privacy-policy');
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 50MB for large documents)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      
      // Should still find patterns effectively
      expect(findings.length).toBeGreaterThan(0);
    });
  });
});

// Helper function to create test fixtures
async function createTestFixtures(): Promise<void> {
  const fixturesDir = path.join(__dirname, 'fixtures');
  
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }

  const fixtures = {
    'privacy-policy-high-risk.txt': `
      Privacy Policy - High Risk Document
      
      We collect extensive personal information including your browsing history, location data, 
      device information, and communication content. This information may be shared with our 
      marketing partners, advertising networks, and other third parties for commercial purposes.
      
      We retain your data indefinitely and may use it for any purpose we deem appropriate.
      You waive any right to participate in class action lawsuits against us.
      
      This policy may be changed at any time without notice.
      
      Your data may be transferred to countries with different privacy laws.
      We use cookies and tracking technologies extensively across our network of sites.
    `,
    
    'privacy-policy-low-risk.txt': `
      Privacy Policy - Low Risk Document
      
      We collect only necessary information to provide our service, such as your email address
      and basic account information. Your personal data is never shared with third parties
      without your explicit consent.
      
      We retain your data only as long as necessary to provide the service, and you can
      request deletion at any time. You have full control over your data and privacy settings.
      
      We will notify you 30 days in advance of any policy changes.
      
      All data is processed in accordance with GDPR and other applicable privacy laws.
      We use minimal tracking and respect Do Not Track headers.
    `,
    
    'terms-of-service-problematic.txt': `
      Terms of Service - Problematic Document
      
      Your subscription will automatically renew each month and we will charge your payment
      method without further notice. Cancellation must be requested 60 days in advance.
      
      You waive your right to participate in class action lawsuits and agree to binding
      individual arbitration. You also waive your right to a jury trial.
      
      We may modify these terms at any time without notice. Continued use constitutes acceptance.
      
      Our liability is limited to $1 regardless of damages. You indemnify us against all claims.
      
      This agreement is governed by Delaware law and Delaware courts have exclusive jurisdiction.
      
      We may suspend or terminate your account at any time for any reason.
    `,
    
    'terms-of-service-standard.txt': `
      Terms of Service - Standard Document
      
      You may cancel your subscription at any time. We will provide 30 days notice before
      any changes to pricing or terms.
      
      Disputes will be resolved through good faith negotiation first, with arbitration
      available if needed. You retain standard legal rights.
      
      We will provide 30 days notice for any material changes to these terms.
      
      Our liability is limited as permitted by law, excluding cases of gross negligence.
      
      This agreement is governed by the laws of your jurisdiction.
      
      Account suspension requires notice and opportunity to cure violations.
    `
  };

  for (const [filename, content] of Object.entries(fixtures)) {
    const filepath = path.join(fixturesDir, filename);
    if (!fs.existsSync(filepath)) {
      await fs.promises.writeFile(filepath, content.trim());
    }
  }
}