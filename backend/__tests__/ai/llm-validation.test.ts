import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { LLMValidator } from './llm-validator';
import { testHelpers } from '../utils/test-helpers';
import { ollamaMock } from '../mocks/ollama.mock';

describe('LLM Response Validation and Accuracy', () => {
  let validator: LLMValidator;

  beforeAll(async () => {
    validator = new LLMValidator();
    ollamaMock.setupAnalysisMocks();
  });

  beforeEach(async () => {
    ollamaMock.clearMocks();
    ollamaMock.setupAnalysisMocks();
  });

  describe('Response Structure Validation', () => {
    test('should validate analysis response structure', async () => {
      const testDocument = `
        SOFTWARE LICENSE AGREEMENT
        This agreement grants you limited rights to use our software.
        Company shall not be liable for any damages.
      `;

      const response = await validator.validateAnalysisResponse('mistral:7b', testDocument);

      expect(response.isValid).toBe(true);
      expect(response.analysis).toMatchObject({
        riskScore: expect.any(Number),
        summary: expect.any(String),
        findings: expect.any(Array)
      });

      // Validate risk score range
      expect(response.analysis.riskScore).toBeGreaterThanOrEqual(0);
      expect(response.analysis.riskScore).toBeLessThanOrEqual(10);

      // Validate findings structure
      if (response.analysis.findings.length > 0) {
        const finding = response.analysis.findings[0];
        expect(finding).toMatchObject({
          category: expect.any(String),
          title: expect.any(String),
          severity: expect.stringMatching(/^(low|medium|high|critical)$/),
          confidence: expect.any(Number),
          excerpt: expect.any(String),
          recommendation: expect.any(String)
        });

        expect(finding.confidence).toBeGreaterThanOrEqual(0);
        expect(finding.confidence).toBeLessThanOrEqual(1);
      }
    });

    test('should handle invalid JSON responses', async () => {
      ollamaMock.mockModelResponse('mistral:7b', {
        model: 'mistral:7b',
        response: 'This is not valid JSON response',
        done: true
      });

      const response = await validator.validateAnalysisResponse('mistral:7b', 'test content');

      expect(response.isValid).toBe(false);
      expect(response.errors).toContain('Invalid JSON response');
    });

    test('should validate required fields are present', async () => {
      ollamaMock.mockModelResponse('mistral:7b', {
        model: 'mistral:7b',
        response: JSON.stringify({
          // Missing required fields
          summary: 'Test summary'
        }),
        done: true
      });

      const response = await validator.validateAnalysisResponse('mistral:7b', 'test content');

      expect(response.isValid).toBe(false);
      expect(response.errors).toContain('Missing required field: riskScore');
      expect(response.errors).toContain('Missing required field: findings');
    });

    test('should validate field types', async () => {
      ollamaMock.mockModelResponse('mistral:7b', {
        model: 'mistral:7b',
        response: JSON.stringify({
          riskScore: 'invalid', // Should be number
          summary: 123, // Should be string
          findings: 'not-array' // Should be array
        }),
        done: true
      });

      const response = await validator.validateAnalysisResponse('mistral:7b', 'test content');

      expect(response.isValid).toBe(false);
      expect(response.errors).toContain('riskScore must be a number');
      expect(response.errors).toContain('summary must be a string');
      expect(response.errors).toContain('findings must be an array');
    });
  });

  describe('Content Accuracy Testing', () => {
    test('should identify liability clauses correctly', async () => {
      const liabilityDocument = `
        SOFTWARE LICENSE AGREEMENT
        
        1. LICENSE GRANT
        You are granted a license to use this software.
        
        2. LIABILITY EXCLUSION
        Company shall not be liable for any direct, indirect, incidental, 
        special, consequential, or punitive damages arising from the use 
        of this software, even if advised of the possibility of such damages.
        
        3. LIMITATION OF LIABILITY
        In no event shall Company's liability exceed the amount paid by you.
      `;

      const result = await validator.testAccuracy('mistral:7b', liabilityDocument, {
        expectedCategories: ['liability'],
        expectedSeverity: ['medium', 'high'],
        expectedKeywords: ['liability', 'damages', 'exclude']
      });

      expect(result.accuracy).toBeGreaterThanOrEqual(0.7);
      expect(result.categoryAccuracy).toHaveProperty('liability');
      expect(result.categoryAccuracy.liability).toBeGreaterThan(0.5);
      expect(result.foundExpectedKeywords.length).toBeGreaterThan(0);
    });

    test('should identify data privacy clauses correctly', async () => {
      const privacyDocument = `
        PRIVACY POLICY
        
        We collect personal information including your name, email, and usage data.
        
        Your information may be shared with third parties for marketing purposes.
        
        We retain your data indefinitely unless you request deletion.
        
        Your data may be transferred to countries without adequate protection.
      `;

      const result = await validator.testAccuracy('phi-2:2.7b', privacyDocument, {
        expectedCategories: ['data-usage', 'data-retention'],
        expectedSeverity: ['low', 'medium'],
        expectedKeywords: ['personal information', 'third parties', 'data', 'retention']
      });

      expect(result.accuracy).toBeGreaterThanOrEqual(0.6);
      expect(result.categoryAccuracy).toHaveProperty('data-usage');
      expect(result.foundExpectedKeywords.length).toBeGreaterThan(1);
    });

    test('should assess risk scores appropriately', async () => {
      const highRiskDocument = `
        EXTREME LIABILITY WAIVER
        
        User assumes ALL risks and waives ALL claims against Company.
        Company has NO liability whatsoever for ANY damages.
        User agrees to UNLIMITED indemnification of Company.
        This agreement is IRREVOCABLE and PERPETUAL.
      `;

      const lowRiskDocument = `
        SOFTWARE LICENSE - STANDARD TERMS
        
        Limited license granted for personal use.
        Company provides reasonable support during business hours.
        Either party may terminate with 30 days notice.
        Disputes resolved through mutual negotiation.
      `;

      const highRiskResult = await validator.testAccuracy('mistral:7b', highRiskDocument, {
        expectedRiskRange: [7, 10]
      });

      const lowRiskResult = await validator.testAccuracy('mistral:7b', lowRiskDocument, {
        expectedRiskRange: [1, 4]
      });

      expect(highRiskResult.riskScoreAccuracy).toBeGreaterThan(0.7);
      expect(lowRiskResult.riskScoreAccuracy).toBeGreaterThan(0.7);
    });
  });

  describe('Model Consistency Testing', () => {
    test('should produce consistent results across multiple runs', async () => {
      const testDocument = `
        TERMS OF SERVICE
        
        By using our service, you agree to binding arbitration.
        We may modify these terms at any time without notice.
        Your account may be terminated for any reason.
      `;

      const results = [];
      const numRuns = 5;

      for (let i = 0; i < numRuns; i++) {
        const result = await validator.validateAnalysisResponse('mistral:7b', testDocument);
        if (result.isValid) {
          results.push(result.analysis);
        }
      }

      expect(results.length).toBe(numRuns);

      // Check consistency of risk scores (should be within reasonable range)
      const riskScores = results.map(r => r.riskScore);
      const avgRiskScore = riskScores.reduce((a, b) => a + b, 0) / riskScores.length;
      const variance = riskScores.reduce((acc, score) => acc + Math.pow(score - avgRiskScore, 2), 0) / riskScores.length;
      const standardDeviation = Math.sqrt(variance);

      // Standard deviation should be reasonable (less than 2 points)
      expect(standardDeviation).toBeLessThan(2);

      // Check category consistency
      const allCategories = results.flatMap(r => r.findings.map(f => f.category));
      const categoryOccurrences = allCategories.reduce((acc, cat) => {
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // At least one category should appear in most runs
      const maxOccurrences = Math.max(...Object.values(categoryOccurrences));
      expect(maxOccurrences).toBeGreaterThanOrEqual(Math.ceil(numRuns * 0.6));
    });

    test('should handle edge cases gracefully', async () => {
      const edgeCases = [
        '', // Empty document
        'Short.', // Very short document
        'A'.repeat(10000), // Very long document
        '12345 !@#$% []{}', // Special characters and numbers only
        'Normal text with some unicode: 🔒 📄 ⚠️', // Unicode characters
      ];

      for (const edgeCase of edgeCases) {
        try {
          const result = await validator.validateAnalysisResponse('mistral:7b', edgeCase);
          
          if (result.isValid) {
            // If analysis succeeds, validate it has reasonable values
            expect(result.analysis.riskScore).toBeGreaterThanOrEqual(0);
            expect(result.analysis.riskScore).toBeLessThanOrEqual(10);
            expect(typeof result.analysis.summary).toBe('string');
            expect(Array.isArray(result.analysis.findings)).toBe(true);
          } else {
            // If analysis fails, should have error messages
            expect(result.errors.length).toBeGreaterThan(0);
          }
        } catch (error) {
          // Should not throw unhandled errors
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('Performance and Timeout Testing', () => {
    test('should handle slow responses within timeout', async () => {
      const slowDelay = 5000; // 5 seconds
      ollamaMock.mockDelay('mistral:7b', slowDelay);

      const startTime = Date.now();
      const result = await validator.validateAnalysisResponse('mistral:7b', 'test document', {
        timeout: 10000 // 10 second timeout
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(slowDelay - 100); // Allow some variance
      expect(result.isValid).toBe(true);
    });

    test('should timeout appropriately for very slow responses', async () => {
      const verySlowDelay = 15000; // 15 seconds
      ollamaMock.mockDelay('mistral:7b', verySlowDelay);

      const startTime = Date.now();
      const result = await validator.validateAnalysisResponse('mistral:7b', 'test document', {
        timeout: 5000 // 5 second timeout
      });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(6000); // Should timeout before 6 seconds
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Analysis timeout');
    });

    test('should handle concurrent analysis requests', async () => {
      const testDocuments = [
        'Contract document 1 with liability clauses.',
        'Privacy policy document 2 with data collection.',
        'Terms of service document 3 with user obligations.',
        'License agreement document 4 with usage restrictions.',
        'Service agreement document 5 with performance guarantees.'
      ];

      const startTime = Date.now();
      const promises = testDocuments.map(doc => 
        validator.validateAnalysisResponse('mistral:7b', doc)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should complete
      expect(results.length).toBe(testDocuments.length);
      
      // Most should be valid
      const validResults = results.filter(r => r.isValid);
      expect(validResults.length).toBeGreaterThanOrEqual(testDocuments.length * 0.8);

      // Should complete in reasonable time (concurrent processing)
      expect(endTime - startTime).toBeLessThan(30000); // 30 seconds total
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle model unavailable errors', async () => {
      ollamaMock.mockError('unavailable-model', new Error('Model not available'));

      const result = await validator.validateAnalysisResponse('unavailable-model', 'test document');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Model not available');
    });

    test('should handle network errors gracefully', async () => {
      ollamaMock.mockError('mistral:7b', new Error('Network error'));

      const result = await validator.validateAnalysisResponse('mistral:7b', 'test document');

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Network error');
    });

    test('should retry failed requests with exponential backoff', async () => {
      let callCount = 0;
      ollamaMock.mockError('mistral:7b', new Error('Temporary failure'));

      // Mock to succeed on third attempt
      jest.spyOn(ollamaMock, 'getMockResponse').mockImplementation(async (model, prompt) => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary failure');
        }
        return ollamaMock.mockAnalysisResult();
      });

      const startTime = Date.now();
      const result = await validator.validateAnalysisResponse('mistral:7b', 'test document', {
        maxRetries: 3,
        retryDelay: 100
      });
      const endTime = Date.now();

      expect(callCount).toBeGreaterThanOrEqual(3);
      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeGreaterThan(200); // Should have some delay from retries
    });
  });

  describe('Regression Testing', () => {
    test('should maintain accuracy on known good documents', async () => {
      // Load regression test cases
      const regressionCases = await validator.loadRegressionTestCases();

      const results = [];
      for (const testCase of regressionCases) {
        const result = await validator.testAccuracy(
          testCase.model,
          testCase.document,
          testCase.expectedResults
        );
        results.push({
          testCase: testCase.name,
          accuracy: result.accuracy,
          passed: result.accuracy >= testCase.minimumAccuracy
        });
      }

      // At least 90% of regression tests should pass
      const passedTests = results.filter(r => r.passed);
      const passRate = passedTests.length / results.length;
      expect(passRate).toBeGreaterThanOrEqual(0.9);

      // Log any failures for investigation
      const failedTests = results.filter(r => !r.passed);
      if (failedTests.length > 0) {
        console.warn('Failed regression tests:', failedTests);
      }
    });

    test('should detect accuracy degradation', async () => {
      const baselineAccuracy = 0.85;
      const currentAccuracy = await validator.measureCurrentAccuracy();

      // Current accuracy should not degrade significantly from baseline
      const degradationThreshold = 0.1; // 10% degradation threshold
      expect(currentAccuracy).toBeGreaterThanOrEqual(baselineAccuracy - degradationThreshold);

      // If accuracy has improved significantly, update baseline
      if (currentAccuracy > baselineAccuracy + 0.05) {
        console.log(`Accuracy improved from ${baselineAccuracy} to ${currentAccuracy}`);
      }
    });
  });
});