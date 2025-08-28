/**
 * AI/LLM Analysis Validation Tests
 * Comprehensive testing for AI-powered legal document analysis
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
import { createMockDocument, createMockAnalysis, createMockFinding } from '../mocks/factories';
import { resetAllMocks, setupMockDefaults } from '../mocks/utils/mock-utils';

// Test documents with known problematic clauses
const testDocuments = {
  termsOfService: `
TERMS OF SERVICE

1. ACCEPTANCE OF TERMS
By using our service, you agree to these terms.

2. USER DATA
We may collect, use, and share your personal data for any purpose we deem necessary, including sharing with third parties for marketing purposes without your consent.

3. LIABILITY
You waive all rights to hold us liable for any damages, including those caused by our negligence or willful misconduct.

4. TERMINATION
We may terminate your account at any time without notice or cause, and you will not be entitled to any refund.

5. DISPUTE RESOLUTION
Any disputes must be resolved through binding arbitration. You waive your right to a jury trial and cannot participate in class action lawsuits.

6. CONTENT LICENSE
By uploading content, you grant us a perpetual, irrevocable, worldwide license to use your content for any purpose.

7. AUTOMATIC RENEWAL
Your subscription will automatically renew at the end of each billing period unless you cancel at least 30 days in advance.
  `.trim(),

  privacyPolicy: `
PRIVACY POLICY

INFORMATION COLLECTION
We collect personal information including your name, email, location, browsing history, and device information.

DATA USAGE
We use your data for service provision, marketing, analytics, and may share it with:
- Marketing partners
- Data brokers
- Government agencies upon request
- Any third party for business purposes

DATA RETENTION
We retain your data indefinitely, even after account deletion.

COOKIES
We use tracking cookies and cannot be disabled.

CHILDREN'S DATA
We may collect data from users under 13 with parental consent.

CONTACT
For privacy concerns, contact legal@company.com.
  `.trim(),

  softwareLicense: `
SOFTWARE LICENSE AGREEMENT

1. LICENSE GRANT
Limited license to use software for personal use only.

2. RESTRICTIONS
You may not reverse engineer, modify, or redistribute the software.

3. UPDATES
We may automatically install updates that may change functionality or remove features.

4. DATA COLLECTION
The software collects usage data, error reports, and personal information for improvement purposes.

5. TERMINATION
License terminates immediately upon breach. You must delete all copies.

6. NO WARRANTIES
Software provided "AS IS" without any warranties.

7. LIMITATION OF LIABILITY
Our liability is limited to the amount paid for the software, even for damages caused by security breaches or data loss.
  `.trim(),

  employmentContract: `
EMPLOYMENT AGREEMENT

NON-COMPETE CLAUSE
Employee agrees not to work for any competitor for 2 years after termination in any geographic area where the company operates.

INTELLECTUAL PROPERTY
All work created by employee, including personal projects, belongs to the company.

CONFIDENTIALITY
Employee must maintain confidentiality of all company information indefinitely.

TERMINATION
Company may terminate without cause with 2 weeks notice. Employee must provide 1 month notice.

DISPUTE RESOLUTION
All disputes resolved through mandatory arbitration with company-selected arbitrator.

NON-SOLICITATION
Employee cannot solicit company clients or employees for 18 months after termination.
  `.trim(),
};

// Expected findings for validation
const expectedFindings = {
  termsOfService: [
    {
      category: 'data-usage',
      severity: 'critical',
      keywords: ['personal data', 'any purpose', 'third parties', 'without consent'],
    },
    {
      category: 'liability',
      severity: 'critical',
      keywords: ['waive all rights', 'negligence', 'willful misconduct'],
    },
    {
      category: 'termination',
      severity: 'high',
      keywords: ['without notice', 'without cause', 'no refund'],
    },
    {
      category: 'dispute-resolution',
      severity: 'high',
      keywords: ['binding arbitration', 'waive', 'jury trial', 'class action'],
    },
    {
      category: 'content-rights',
      severity: 'high',
      keywords: ['perpetual', 'irrevocable', 'any purpose'],
    },
    {
      category: 'billing',
      severity: 'medium',
      keywords: ['automatic renewal', '30 days'],
    },
  ],
  privacyPolicy: [
    {
      category: 'data-collection',
      severity: 'high',
      keywords: ['browsing history', 'location', 'device information'],
    },
    {
      category: 'data-sharing',
      severity: 'critical',
      keywords: ['data brokers', 'any third party', 'business purposes'],
    },
    {
      category: 'data-retention',
      severity: 'high',
      keywords: ['indefinitely', 'after account deletion'],
    },
    {
      category: 'cookies',
      severity: 'medium',
      keywords: ['cannot be disabled'],
    },
    {
      category: 'children-privacy',
      severity: 'high',
      keywords: ['under 13'],
    },
  ],
};

// Mock AI models and responses
const mockModels = {
  'phi:2.7b': {
    accuracy: 0.85,
    speed: 'fast',
    responseTime: 2000,
  },
  'mistral:7b': {
    accuracy: 0.90,
    speed: 'medium',
    responseTime: 4000,
  },
  'llama2:13b': {
    accuracy: 0.95,
    speed: 'slow',
    responseTime: 8000,
  },
};

// AI Analysis Engine Mock
class AIAnalysisEngine {
  constructor(private model: string) {}

  async analyzeDocument(content: string): Promise<any[]> {
    // Simulate model processing time
    const modelConfig = mockModels[this.model as keyof typeof mockModels];
    if (modelConfig) {
      await new Promise(resolve => 
        setTimeout(resolve, modelConfig.responseTime * (Math.random() * 0.3 + 0.85))
      );
    }

    // Generate realistic findings based on content
    return this.generateFindings(content);
  }

  private generateFindings(content: string): any[] {
    const findings: any[] = [];
    const contentLower = content.toLowerCase();

    // Data usage patterns
    if (contentLower.includes('personal data') && contentLower.includes('any purpose')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'data-usage',
        title: 'Broad Data Usage Rights',
        description: 'The service reserves extensive rights to use personal data for undefined purposes.',
        severity: 'critical',
        confidence: 0.92,
        location: this.findTextLocation(content, 'personal data'),
        recommendation: 'Request specific limitations on data usage and clear purpose definitions.',
        references: ['GDPR Art. 5(1)(b)', 'CCPA § 1798.100'],
      });
    }

    // Liability waiver patterns
    if (contentLower.includes('waive') && contentLower.includes('liability')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'liability',
        title: 'Broad Liability Waiver',
        description: 'The agreement contains broad liability waivers that may limit legal recourse.',
        severity: contentLower.includes('negligence') ? 'critical' : 'high',
        confidence: 0.88,
        location: this.findTextLocation(content, 'liability'),
        recommendation: 'Negotiate limitations on liability waivers, especially for negligence.',
        references: ['Restatement (Second) of Contracts § 195'],
      });
    }

    // Termination patterns
    if (contentLower.includes('terminate') && contentLower.includes('without')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'termination',
        title: 'Unilateral Termination Rights',
        description: 'The service provider can terminate the agreement without cause or notice.',
        severity: 'high',
        confidence: 0.85,
        location: this.findTextLocation(content, 'terminate'),
        recommendation: 'Request reasonable notice periods and cause requirements for termination.',
        references: ['UCC § 2-309'],
      });
    }

    // Arbitration patterns
    if (contentLower.includes('arbitration') || contentLower.includes('waive') && contentLower.includes('jury')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'dispute-resolution',
        title: 'Mandatory Arbitration Clause',
        description: 'All disputes must be resolved through binding arbitration, waiving jury trial rights.',
        severity: 'high',
        confidence: 0.90,
        location: this.findTextLocation(content, 'arbitration'),
        recommendation: 'Consider negotiating opt-out provisions or limiting arbitration scope.',
        references: ['Federal Arbitration Act', 'AT&T Mobility v. Concepcion'],
      });
    }

    // Content license patterns
    if (contentLower.includes('perpetual') && contentLower.includes('license')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'content-rights',
        title: 'Perpetual Content License',
        description: 'User-generated content is licensed to the service in perpetuity with broad usage rights.',
        severity: 'high',
        confidence: 0.87,
        location: this.findTextLocation(content, 'perpetual'),
        recommendation: 'Negotiate time-limited licenses and specific usage restrictions.',
        references: ['17 U.S.C. § 201'],
      });
    }

    // Auto-renewal patterns
    if (contentLower.includes('automatic') && contentLower.includes('renew')) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'billing',
        title: 'Automatic Renewal Terms',
        description: 'Subscription automatically renews with specific cancellation requirements.',
        severity: 'medium',
        confidence: 0.83,
        location: this.findTextLocation(content, 'automatic'),
        recommendation: 'Ensure clear disclosure and easy cancellation options.',
        references: ['15 U.S.C. § 8403', 'State Auto-Renewal Laws'],
      });
    }

    // Data sharing patterns
    if (contentLower.includes('share') && (contentLower.includes('third parties') || contentLower.includes('partners'))) {
      findings.push({
        id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        category: 'data-sharing',
        title: 'Broad Data Sharing Rights',
        description: 'Personal data may be shared with third parties for various purposes.',
        severity: 'high',
        confidence: 0.89,
        location: this.findTextLocation(content, 'share'),
        recommendation: 'Request specific limitations on data sharing and user consent requirements.',
        references: ['GDPR Art. 6', 'CCPA § 1798.115'],
      });
    }

    // Apply model accuracy simulation
    const modelConfig = mockModels[this.model as keyof typeof mockModels];
    if (modelConfig && Math.random() > modelConfig.accuracy) {
      // Simulate model errors by removing some findings or adding false positives
      if (Math.random() > 0.5 && findings.length > 1) {
        findings.splice(Math.floor(Math.random() * findings.length), 1);
      } else {
        findings.push({
          id: `finding-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          category: 'misc',
          title: 'False Positive Finding',
          description: 'This is a false positive generated by model inaccuracy.',
          severity: 'low',
          confidence: 0.6,
          location: { start: 0, end: 100 },
          recommendation: 'This finding should be ignored.',
          references: [],
        });
      }
    }

    return findings;
  }

  private findTextLocation(content: string, searchText: string): { start: number; end: number } {
    const start = content.toLowerCase().indexOf(searchText.toLowerCase());
    if (start === -1) {
      return { start: 0, end: 100 };
    }
    return { start, end: start + searchText.length };
  }
}

// Analysis Quality Metrics
class AnalysisQualityMetrics {
  static calculateAccuracy(findings: any[], expectedFindings: any[]): number {
    let correctFindings = 0;
    
    for (const expected of expectedFindings) {
      const found = findings.some(finding => 
        finding.category === expected.category &&
        finding.severity === expected.severity &&
        expected.keywords.some(keyword => 
          finding.description.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      
      if (found) correctFindings++;
    }
    
    return expectedFindings.length > 0 ? correctFindings / expectedFindings.length : 0;
  }

  static calculatePrecision(findings: any[], expectedFindings: any[]): number {
    if (findings.length === 0) return 0;
    
    let truePositives = 0;
    
    for (const finding of findings) {
      const isExpected = expectedFindings.some(expected =>
        expected.category === finding.category &&
        expected.keywords.some((keyword: string) =>
          finding.description.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      
      if (isExpected) truePositives++;
    }
    
    return truePositives / findings.length;
  }

  static calculateRecall(findings: any[], expectedFindings: any[]): number {
    return this.calculateAccuracy(findings, expectedFindings);
  }

  static calculateF1Score(findings: any[], expectedFindings: any[]): number {
    const precision = this.calculatePrecision(findings, expectedFindings);
    const recall = this.calculateRecall(findings, expectedFindings);
    
    if (precision + recall === 0) return 0;
    return 2 * (precision * recall) / (precision + recall);
  }

  static evaluateConfidenceScores(findings: any[]): {
    averageConfidence: number;
    confidenceDistribution: Record<string, number>;
  } {
    if (findings.length === 0) {
      return { averageConfidence: 0, confidenceDistribution: {} };
    }

    const avgConfidence = findings.reduce((sum, f) => sum + (f.confidence || 0), 0) / findings.length;
    
    const distribution = findings.reduce((dist, f) => {
      const confidence = f.confidence || 0;
      const bucket = Math.floor(confidence * 10) / 10; // Round to nearest 0.1
      dist[bucket.toString()] = (dist[bucket.toString()] || 0) + 1;
      return dist;
    }, {} as Record<string, number>);

    return {
      averageConfidence: avgConfidence,
      confidenceDistribution: distribution,
    };
  }
}

describe('AI/LLM Analysis Validation Tests', () => {
  let aiEngine: AIAnalysisEngine;

  beforeAll(() => {
    setupMockDefaults();
  });

  beforeEach(() => {
    resetAllMocks();
  });

  afterEach(() => {
    resetAllMocks();
  });

  describe('Model Performance Validation', () => {
    test('should achieve minimum accuracy for terms of service analysis', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);
      const accuracy = AnalysisQualityMetrics.calculateAccuracy(
        findings,
        expectedFindings.termsOfService
      );

      expect(accuracy).toBeGreaterThanOrEqual(0.8); // 80% minimum accuracy
      expect(findings.length).toBeGreaterThan(3); // Should find multiple issues
      
      // Verify critical findings are detected
      const criticalFindings = findings.filter(f => f.severity === 'critical');
      expect(criticalFindings.length).toBeGreaterThan(0);
    });

    test('should achieve minimum accuracy for privacy policy analysis', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const findings = await aiEngine.analyzeDocument(testDocuments.privacyPolicy);
      const accuracy = AnalysisQualityMetrics.calculateAccuracy(
        findings,
        expectedFindings.privacyPolicy
      );

      expect(accuracy).toBeGreaterThanOrEqual(0.75); // 75% minimum for privacy policies
      
      // Should detect data sharing issues
      const dataSharingFindings = findings.filter(f => f.category === 'data-sharing');
      expect(dataSharingFindings.length).toBeGreaterThan(0);
    });

    test('should maintain consistent performance across different models', async () => {
      const models = ['phi:2.7b', 'mistral:7b', 'llama2:13b'];
      const results: Array<{ model: string; accuracy: number; f1Score: number }> = [];

      for (const model of models) {
        aiEngine = new AIAnalysisEngine(model);
        const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);
        
        const accuracy = AnalysisQualityMetrics.calculateAccuracy(
          findings,
          expectedFindings.termsOfService
        );
        
        const f1Score = AnalysisQualityMetrics.calculateF1Score(
          findings,
          expectedFindings.termsOfService
        );

        results.push({ model, accuracy, f1Score });
      }

      // Larger models should perform better
      const phiResult = results.find(r => r.model === 'phi:2.7b')!;
      const mistralResult = results.find(r => r.model === 'mistral:7b')!;
      const llamaResult = results.find(r => r.model === 'llama2:13b')!;

      expect(mistralResult.accuracy).toBeGreaterThanOrEqual(phiResult.accuracy);
      expect(llamaResult.accuracy).toBeGreaterThanOrEqual(mistralResult.accuracy);
    });
  });

  describe('Finding Quality Validation', () => {
    test('should generate findings with proper structure', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);

      findings.forEach(finding => {
        expect(finding).toHaveValidFinding();
        expect(finding).toHaveProperty('id');
        expect(finding).toHaveProperty('category');
        expect(finding).toHaveProperty('title');
        expect(finding).toHaveProperty('description');
        expect(finding).toHaveProperty('severity');
        expect(finding).toHaveProperty('confidence');
        expect(finding).toHaveProperty('location');
        expect(finding).toHaveProperty('recommendation');
        expect(finding).toHaveProperty('references');

        // Validate severity levels
        expect(['low', 'medium', 'high', 'critical']).toContain(finding.severity);
        
        // Validate confidence scores
        expect(finding.confidence).toBeGreaterThanOrEqual(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
        
        // Validate location
        expect(finding.location).toHaveProperty('start');
        expect(finding.location).toHaveProperty('end');
        expect(finding.location.start).toBeLessThanOrEqual(finding.location.end);
      });
    });

    test('should provide actionable recommendations', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);

      findings.forEach(finding => {
        expect(finding.recommendation).toBeDefined();
        expect(finding.recommendation.length).toBeGreaterThan(10);
        expect(typeof finding.recommendation).toBe('string');
        
        // Recommendations should be actionable (contain certain keywords)
        const actionWords = ['negotiate', 'request', 'consider', 'ensure', 'require', 'ask'];
        const hasActionWord = actionWords.some(word => 
          finding.recommendation.toLowerCase().includes(word)
        );
        expect(hasActionWord).toBe(true);
      });
    });

    test('should provide relevant legal references', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);

      const findingsWithReferences = findings.filter(f => f.references && f.references.length > 0);
      expect(findingsWithReferences.length).toBeGreaterThan(0);

      findingsWithReferences.forEach(finding => {
        expect(Array.isArray(finding.references)).toBe(true);
        finding.references.forEach((ref: string) => {
          expect(typeof ref).toBe('string');
          expect(ref.length).toBeGreaterThan(3);
        });
      });
    });

    test('should assign appropriate confidence scores', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);

      const metrics = AnalysisQualityMetrics.evaluateConfidenceScores(findings);
      
      // Average confidence should be reasonable
      expect(metrics.averageConfidence).toBeGreaterThan(0.6);
      expect(metrics.averageConfidence).toBeLessThan(1.0);
      
      // Should have distribution across confidence levels
      expect(Object.keys(metrics.confidenceDistribution).length).toBeGreaterThan(1);
      
      // Higher severity findings should generally have higher confidence
      const criticalFindings = findings.filter(f => f.severity === 'critical');
      const lowFindings = findings.filter(f => f.severity === 'low');
      
      if (criticalFindings.length > 0 && lowFindings.length > 0) {
        const avgCriticalConfidence = criticalFindings.reduce(
          (sum, f) => sum + f.confidence, 0
        ) / criticalFindings.length;
        
        const avgLowConfidence = lowFindings.reduce(
          (sum, f) => sum + f.confidence, 0
        ) / lowFindings.length;
        
        expect(avgCriticalConfidence).toBeGreaterThanOrEqual(avgLowConfidence);
      }
    });
  });

  describe('Performance and Scalability', () => {
    test('should process documents within acceptable time limits', async () => {
      const models = ['phi:2.7b', 'mistral:7b', 'llama2:13b'];
      const maxTimes = { 'phi:2.7b': 3000, 'mistral:7b': 6000, 'llama2:13b': 12000 };

      for (const model of models) {
        aiEngine = new AIAnalysisEngine(model);
        
        const { duration } = await measurePerformance(async () => {
          return aiEngine.analyzeDocument(testDocuments.termsOfService);
        });

        expect(duration).toBeLessThan(maxTimes[model as keyof typeof maxTimes]);
      }
    });

    test('should handle large documents efficiently', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      // Create a large document (10x the size)
      const largeDocument = testDocuments.termsOfService.repeat(10);
      
      const { result, duration } = await measurePerformance(async () => {
        return aiEngine.analyzeDocument(largeDocument);
      });

      // Should still complete within reasonable time (not linear scaling)
      expect(duration).toBeLessThan(15000); // 15 seconds max
      expect(result.length).toBeGreaterThan(0);
    });

    test('should handle concurrent analysis requests', async () => {
      aiEngine = new AIAnalysisEngine('phi:2.7b'); // Use fastest model for concurrency test
      
      const documents = [
        testDocuments.termsOfService,
        testDocuments.privacyPolicy,
        testDocuments.softwareLicense,
      ];

      const { result, duration } = await measurePerformance(async () => {
        const promises = documents.map(doc => aiEngine.analyzeDocument(doc));
        return Promise.all(promises);
      });

      // Should handle 3 concurrent requests efficiently
      expect(duration).toBeLessThan(8000); // 8 seconds max
      expect(result.length).toBe(3);
      result.forEach(findings => {
        expect(Array.isArray(findings)).toBe(true);
        expect(findings.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty documents gracefully', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const findings = await aiEngine.analyzeDocument('');
      
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.length).toBe(0);
    });

    test('should handle very short documents', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const shortDocument = 'Terms of Service. Use at your own risk.';
      const findings = await aiEngine.analyzeDocument(shortDocument);
      
      expect(Array.isArray(findings)).toBe(true);
      // Might have 0 or few findings, but shouldn't crash
    });

    test('should handle documents with special characters', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const specialCharDoc = testDocuments.termsOfService + '\n\n特殊字符测试 émojis 🚀 and symbols ©™®';
      
      const findings = await aiEngine.analyzeDocument(specialCharDoc);
      
      expect(Array.isArray(findings)).toBe(true);
      expect(findings.length).toBeGreaterThan(0);
      
      // Findings should still be valid
      findings.forEach(finding => {
        expect(finding).toHaveValidFinding();
      });
    });

    test('should handle malformed legal text', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const malformedDoc = `
        TERMS OF SERVICE
        
        1. ACCEPTANCE
        By using you agree to
        
        2.
        We may collect
        
        3. LIABILITY
        [INCOMPLETE CLAUSE]
        
        4. TERMINATION without
      `;
      
      const findings = await aiEngine.analyzeDocument(malformedDoc);
      
      expect(Array.isArray(findings)).toBe(true);
      // Should still attempt to find issues even in malformed text
    });
  });

  describe('Domain-Specific Analysis', () => {
    test('should detect employment contract specific issues', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const findings = await aiEngine.analyzeDocument(testDocuments.employmentContract);
      
      // Should detect non-compete issues
      const nonCompeteFindings = findings.filter(f => 
        f.description.toLowerCase().includes('non-compete') ||
        f.description.toLowerCase().includes('compete')
      );
      expect(nonCompeteFindings.length).toBeGreaterThan(0);
      
      // Should detect IP assignment issues
      const ipFindings = findings.filter(f =>
        f.description.toLowerCase().includes('intellectual property') ||
        f.description.toLowerCase().includes('work created')
      );
      expect(ipFindings.length).toBeGreaterThan(0);
    });

    test('should detect software license specific issues', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const findings = await aiEngine.analyzeDocument(testDocuments.softwareLicense);
      
      // Should detect warranty disclaimers
      const warrantyFindings = findings.filter(f =>
        f.description.toLowerCase().includes('warranty') ||
        f.description.toLowerCase().includes('as is')
      );
      expect(warrantyFindings.length).toBeGreaterThan(0);
      
      // Should detect automatic update issues
      const updateFindings = findings.filter(f =>
        f.description.toLowerCase().includes('update') ||
        f.description.toLowerCase().includes('automatically')
      );
      expect(updateFindings.length).toBeGreaterThan(0);
    });

    test('should categorize findings correctly by document type', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const tosFindings = await aiEngine.analyzeDocument(testDocuments.termsOfService);
      const privacyFindings = await aiEngine.analyzeDocument(testDocuments.privacyPolicy);
      
      // ToS should have more liability and termination findings
      const tosLiabilityFindings = tosFindings.filter(f => f.category === 'liability');
      const tosTerminationFindings = tosFindings.filter(f => f.category === 'termination');
      
      // Privacy policy should have more data-related findings
      const privacyDataFindings = privacyFindings.filter(f => 
        f.category === 'data-collection' || 
        f.category === 'data-sharing'
      );
      
      expect(tosLiabilityFindings.length + tosTerminationFindings.length).toBeGreaterThan(0);
      expect(privacyDataFindings.length).toBeGreaterThan(0);
    });
  });

  describe('Regression Testing', () => {
    test('should maintain consistency across multiple runs', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const runs = 3;
      const results: any[][] = [];
      
      for (let i = 0; i < runs; i++) {
        const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);
        results.push(findings);
      }
      
      // Should find similar number of issues each time (within reasonable variance)
      const findingCounts = results.map(r => r.length);
      const avgCount = findingCounts.reduce((sum, count) => sum + count, 0) / runs;
      
      findingCounts.forEach(count => {
        expect(count).toBeGreaterThan(avgCount * 0.7); // Within 30% variance
        expect(count).toBeLessThan(avgCount * 1.3);
      });
      
      // Should consistently find critical issues
      const criticalCounts = results.map(r => r.filter(f => f.severity === 'critical').length);
      criticalCounts.forEach(count => {
        expect(count).toBeGreaterThan(0);
      });
    });

    test('should maintain backwards compatibility with older model versions', async () => {
      // Test with different model versions
      const models = ['phi:2.7b', 'mistral:7b'];
      const results: Array<{ model: string; findings: any[] }> = [];
      
      for (const model of models) {
        aiEngine = new AIAnalysisEngine(model);
        const findings = await aiEngine.analyzeDocument(testDocuments.termsOfService);
        results.push({ model, findings });
      }
      
      // All models should find some issues
      results.forEach(result => {
        expect(result.findings.length).toBeGreaterThan(0);
        
        // All findings should have valid structure
        result.findings.forEach(finding => {
          expect(finding).toHaveValidFinding();
        });
      });
    });
  });

  describe('Quality Assurance Metrics', () => {
    test('should meet overall quality thresholds', async () => {
      aiEngine = new AIAnalysisEngine('mistral:7b');
      
      const testCases = [
        { document: testDocuments.termsOfService, expected: expectedFindings.termsOfService },
        { document: testDocuments.privacyPolicy, expected: expectedFindings.privacyPolicy },
      ];
      
      let totalAccuracy = 0;
      let totalPrecision = 0;
      let totalRecall = 0;
      let totalF1 = 0;
      
      for (const testCase of testCases) {
        const findings = await aiEngine.analyzeDocument(testCase.document);
        
        const accuracy = AnalysisQualityMetrics.calculateAccuracy(findings, testCase.expected);
        const precision = AnalysisQualityMetrics.calculatePrecision(findings, testCase.expected);
        const recall = AnalysisQualityMetrics.calculateRecall(findings, testCase.expected);
        const f1Score = AnalysisQualityMetrics.calculateF1Score(findings, testCase.expected);
        
        totalAccuracy += accuracy;
        totalPrecision += precision;
        totalRecall += recall;
        totalF1 += f1Score;
      }
      
      const avgAccuracy = totalAccuracy / testCases.length;
      const avgPrecision = totalPrecision / testCases.length;
      const avgRecall = totalRecall / testCases.length;
      const avgF1 = totalF1 / testCases.length;
      
      // Quality thresholds for production readiness
      expect(avgAccuracy).toBeGreaterThanOrEqual(0.75); // 75% accuracy
      expect(avgPrecision).toBeGreaterThanOrEqual(0.70); // 70% precision
      expect(avgRecall).toBeGreaterThanOrEqual(0.70);    // 70% recall
      expect(avgF1).toBeGreaterThanOrEqual(0.70);        // 70% F1 score
    });
  });
});