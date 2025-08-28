import { ollamaMock } from '../mocks/ollama.mock';
import fs from 'fs/promises';
import path from 'path';

export interface ValidationResult {
  isValid: boolean;
  analysis?: any;
  errors: string[];
  processingTime: number;
}

export interface AccuracyTestOptions {
  expectedCategories?: string[];
  expectedSeverity?: string[];
  expectedKeywords?: string[];
  expectedRiskRange?: [number, number];
}

export interface AccuracyResult {
  accuracy: number;
  categoryAccuracy: Record<string, number>;
  severityAccuracy: number;
  riskScoreAccuracy: number;
  foundExpectedKeywords: string[];
  missingExpectedKeywords: string[];
  unexpectedCategories: string[];
  processingTime: number;
}

export interface ValidationOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
}

export interface RegressionTestCase {
  name: string;
  model: string;
  document: string;
  expectedResults: AccuracyTestOptions;
  minimumAccuracy: number;
}

export class LLMValidator {
  private readonly validCategories = [
    'liability',
    'intellectual-property',
    'data-usage',
    'data-retention',
    'termination',
    'payment',
    'dispute-resolution',
    'modification',
    'user-obligations'
  ];

  private readonly validSeverities = ['low', 'medium', 'high', 'critical'];

  /**
   * Validate the structure and content of an LLM analysis response
   */
  async validateAnalysisResponse(
    model: string,
    document: string,
    options: ValidationOptions = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const timeout = options.timeout || 30000;
    const maxRetries = options.maxRetries || 1;
    const retryDelay = options.retryDelay || 1000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Add timeout wrapper
        const responsePromise = this.getAnalysisResponse(model, document);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Analysis timeout')), timeout);
        });

        const response = await Promise.race([responsePromise, timeoutPromise]) as any;
        
        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = typeof response === 'string' ? JSON.parse(response) : response;
        } catch (error) {
          errors.push('Invalid JSON response');
          lastError = error as Error;
          continue;
        }

        // Validate structure
        const structureValidation = this.validateResponseStructure(parsedResponse);
        if (structureValidation.errors.length > 0) {
          errors.push(...structureValidation.errors);
          lastError = new Error('Structure validation failed');
          continue;
        }

        // Validate content
        const contentValidation = this.validateResponseContent(parsedResponse);
        if (contentValidation.errors.length > 0) {
          errors.push(...contentValidation.errors);
          lastError = new Error('Content validation failed');
          continue;
        }

        return {
          isValid: true,
          analysis: parsedResponse,
          errors: [],
          processingTime: Date.now() - startTime
        };

      } catch (error) {
        lastError = error as Error;
        errors.push(error.message);

        if (attempt < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, attempt)));
        }
      }
    }

    return {
      isValid: false,
      errors,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Test the accuracy of LLM analysis against expected results
   */
  async testAccuracy(
    model: string,
    document: string,
    expected: AccuracyTestOptions
  ): Promise<AccuracyResult> {
    const startTime = Date.now();
    const validationResult = await this.validateAnalysisResponse(model, document);

    if (!validationResult.isValid || !validationResult.analysis) {
      return {
        accuracy: 0,
        categoryAccuracy: {},
        severityAccuracy: 0,
        riskScoreAccuracy: 0,
        foundExpectedKeywords: [],
        missingExpectedKeywords: expected.expectedKeywords || [],
        unexpectedCategories: [],
        processingTime: Date.now() - startTime
      };
    }

    const analysis = validationResult.analysis;
    let totalAccuracy = 0;
    let accuracyComponents = 0;

    // Test category accuracy
    const categoryAccuracy = this.testCategoryAccuracy(analysis, expected.expectedCategories || []);
    if (expected.expectedCategories && expected.expectedCategories.length > 0) {
      totalAccuracy += categoryAccuracy.overall;
      accuracyComponents++;
    }

    // Test severity accuracy
    const severityAccuracy = this.testSeverityAccuracy(analysis, expected.expectedSeverity || []);
    if (expected.expectedSeverity && expected.expectedSeverity.length > 0) {
      totalAccuracy += severityAccuracy;
      accuracyComponents++;
    }

    // Test risk score accuracy
    const riskScoreAccuracy = this.testRiskScoreAccuracy(analysis, expected.expectedRiskRange);
    if (expected.expectedRiskRange) {
      totalAccuracy += riskScoreAccuracy;
      accuracyComponents++;
    }

    // Test keyword presence
    const keywordAccuracy = this.testKeywordAccuracy(analysis, expected.expectedKeywords || []);
    if (expected.expectedKeywords && expected.expectedKeywords.length > 0) {
      totalAccuracy += keywordAccuracy.accuracy;
      accuracyComponents++;
    }

    return {
      accuracy: accuracyComponents > 0 ? totalAccuracy / accuracyComponents : 0,
      categoryAccuracy: categoryAccuracy.individual,
      severityAccuracy,
      riskScoreAccuracy,
      foundExpectedKeywords: keywordAccuracy.found,
      missingExpectedKeywords: keywordAccuracy.missing,
      unexpectedCategories: categoryAccuracy.unexpected,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Load regression test cases from file
   */
  async loadRegressionTestCases(): Promise<RegressionTestCase[]> {
    try {
      const regressionPath = path.join(__dirname, 'regression-test-cases.json');
      const content = await fs.readFile(regressionPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      // Return default test cases if file doesn't exist
      return this.getDefaultRegressionCases();
    }
  }

  /**
   * Measure current overall accuracy across test cases
   */
  async measureCurrentAccuracy(): Promise<number> {
    const testCases = await this.loadRegressionTestCases();
    const results: number[] = [];

    for (const testCase of testCases) {
      const result = await this.testAccuracy(
        testCase.model,
        testCase.document,
        testCase.expectedResults
      );
      results.push(result.accuracy);
    }

    return results.reduce((sum, acc) => sum + acc, 0) / results.length;
  }

  private async getAnalysisResponse(model: string, document: string): Promise<any> {
    // In real implementation, this would call the actual Ollama service
    // For testing, we use the mock
    const response = await ollamaMock.getMockResponse(model, document);
    return response.response;
  }

  private validateResponseStructure(response: any): { errors: string[] } {
    const errors: string[] = [];

    // Check required fields
    const requiredFields = ['riskScore', 'summary', 'findings'];
    for (const field of requiredFields) {
      if (!(field in response)) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check field types
    if ('riskScore' in response && typeof response.riskScore !== 'number') {
      errors.push('riskScore must be a number');
    }

    if ('summary' in response && typeof response.summary !== 'string') {
      errors.push('summary must be a string');
    }

    if ('findings' in response && !Array.isArray(response.findings)) {
      errors.push('findings must be an array');
    }

    return { errors };
  }

  private validateResponseContent(response: any): { errors: string[] } {
    const errors: string[] = [];

    // Validate risk score range
    if (typeof response.riskScore === 'number') {
      if (response.riskScore < 0 || response.riskScore > 10) {
        errors.push('riskScore must be between 0 and 10');
      }
    }

    // Validate findings structure
    if (Array.isArray(response.findings)) {
      for (let i = 0; i < response.findings.length; i++) {
        const finding = response.findings[i];
        
        if (!finding.category || !this.validCategories.includes(finding.category)) {
          errors.push(`Finding ${i}: invalid category '${finding.category}'`);
        }

        if (!finding.severity || !this.validSeverities.includes(finding.severity)) {
          errors.push(`Finding ${i}: invalid severity '${finding.severity}'`);
        }

        if (typeof finding.confidence === 'number') {
          if (finding.confidence < 0 || finding.confidence > 1) {
            errors.push(`Finding ${i}: confidence must be between 0 and 1`);
          }
        }

        if (!finding.title || typeof finding.title !== 'string') {
          errors.push(`Finding ${i}: missing or invalid title`);
        }
      }
    }

    return { errors };
  }

  private testCategoryAccuracy(analysis: any, expectedCategories: string[]): {
    overall: number;
    individual: Record<string, number>;
    unexpected: string[];
  } {
    if (!expectedCategories.length) return { overall: 1, individual: {}, unexpected: [] };

    const foundCategories = analysis.findings?.map((f: any) => f.category) || [];
    const categorySet = new Set(foundCategories);
    
    const individual: Record<string, number> = {};
    let correctCategories = 0;

    for (const expected of expectedCategories) {
      const found = categorySet.has(expected);
      individual[expected] = found ? 1 : 0;
      if (found) correctCategories++;
    }

    const unexpected = foundCategories.filter(cat => !expectedCategories.includes(cat));
    const overall = correctCategories / expectedCategories.length;

    return { overall, individual, unexpected };
  }

  private testSeverityAccuracy(analysis: any, expectedSeverities: string[]): number {
    if (!expectedSeverities.length) return 1;

    const foundSeverities = analysis.findings?.map((f: any) => f.severity) || [];
    const correctSeverities = foundSeverities.filter(sev => expectedSeverities.includes(sev));

    return foundSeverities.length > 0 ? correctSeverities.length / foundSeverities.length : 0;
  }

  private testRiskScoreAccuracy(analysis: any, expectedRange?: [number, number]): number {
    if (!expectedRange) return 1;

    const riskScore = analysis.riskScore;
    if (typeof riskScore !== 'number') return 0;

    const [min, max] = expectedRange;
    return riskScore >= min && riskScore <= max ? 1 : 0;
  }

  private testKeywordAccuracy(analysis: any, expectedKeywords: string[]): {
    accuracy: number;
    found: string[];
    missing: string[];
  } {
    if (!expectedKeywords.length) return { accuracy: 1, found: [], missing: [] };

    const analysisText = JSON.stringify(analysis).toLowerCase();
    const found: string[] = [];
    const missing: string[] = [];

    for (const keyword of expectedKeywords) {
      if (analysisText.includes(keyword.toLowerCase())) {
        found.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    return {
      accuracy: found.length / expectedKeywords.length,
      found,
      missing
    };
  }

  private getDefaultRegressionCases(): RegressionTestCase[] {
    return [
      {
        name: 'High Risk Liability Contract',
        model: 'mistral:7b',
        document: `SOFTWARE LICENSE - EXTREME LIABILITY WAIVER
        Company shall not be liable under any circumstances for any damages whatsoever.
        User waives all claims and assumes unlimited liability for any issues.`,
        expectedResults: {
          expectedCategories: ['liability'],
          expectedSeverity: ['high', 'critical'],
          expectedRiskRange: [7, 10],
          expectedKeywords: ['liability', 'damages', 'waiver']
        },
        minimumAccuracy: 0.8
      },
      {
        name: 'Standard Privacy Policy',
        model: 'phi-2:2.7b',
        document: `PRIVACY POLICY
        We collect personal information to provide our services.
        Data is shared with service providers and may be transferred internationally.
        Users can request deletion of their data.`,
        expectedResults: {
          expectedCategories: ['data-usage', 'data-retention'],
          expectedSeverity: ['low', 'medium'],
          expectedRiskRange: [3, 6],
          expectedKeywords: ['personal information', 'data', 'collection']
        },
        minimumAccuracy: 0.75
      },
      {
        name: 'Low Risk Terms of Service',
        model: 'neural-chat:7b',
        document: `TERMS OF SERVICE
        These terms govern the use of our service.
        Either party may terminate with reasonable notice.
        Disputes will be resolved through good faith negotiation.`,
        expectedResults: {
          expectedCategories: ['termination', 'dispute-resolution'],
          expectedSeverity: ['low'],
          expectedRiskRange: [1, 4],
          expectedKeywords: ['termination', 'notice', 'disputes']
        },
        minimumAccuracy: 0.7
      }
    ];
  }
}