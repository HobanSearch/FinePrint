import { describe, it, expect } from 'vitest';
import { ScoringAlgorithm } from '../scoring-algorithm';
import { PatternDetection } from '../../types';

describe('ScoringAlgorithm', () => {
  const algorithm = new ScoringAlgorithm();

  describe('calculateScore', () => {
    it('should return perfect score when no patterns detected', () => {
      const result = algorithm.calculateScore({
        patternDetections: [],
        documentContent: {
          privacyPolicy: 'Simple privacy policy with good practices',
          termsOfService: 'Fair terms of service',
        },
      });

      expect(result.overallScore).toBeGreaterThan(80);
      expect(result.grade).toBe('A');
      expect(result.trending).toBe('stable');
    });

    it('should reduce score based on pattern severity', () => {
      const criticalPatterns: PatternDetection[] = [
        {
          patternId: '1',
          patternName: 'Class Action Waiver',
          severity: 'critical',
          description: 'Waives right to class action',
          location: 'Section 5',
          impact: 90,
        },
      ];

      const result = algorithm.calculateScore({
        patternDetections: criticalPatterns,
        documentContent: {
          privacyPolicy: 'Privacy policy',
          termsOfService: 'Terms with class action waiver',
        },
      });

      expect(result.overallScore).toBeLessThan(70);
      expect(result.grade).not.toBe('A');
    });

    it('should calculate trending based on previous score', () => {
      const input = {
        patternDetections: [],
        documentContent: {
          privacyPolicy: 'Privacy policy',
        },
      };

      // Improving trend
      const improving = algorithm.calculateScore(input, 70);
      expect(improving.trending).toBe('improving');

      // Declining trend
      const declining = algorithm.calculateScore(input, 95);
      expect(declining.trending).toBe('declining');

      // Stable trend
      const stable = algorithm.calculateScore(input, 88);
      expect(stable.trending).toBe('stable');
    });

    it('should properly weight score components', () => {
      const result = algorithm.calculateScore({
        patternDetections: [],
        documentContent: {
          privacyPolicy: `
            We respect your privacy and implement data minimization.
            You have the right to delete your data at any time.
            We do not sell personal information to third parties.
            Contact us at privacy@example.com for any concerns.
            Last updated: ${new Date().toISOString()}
          `,
        },
      });

      expect(result.breakdown.patternDetection).toBe(100);
      expect(result.breakdown.dataCollection).toBeGreaterThan(60);
      expect(result.breakdown.userRights).toBeGreaterThan(60);
      expect(result.breakdown.transparency).toBeGreaterThan(60);
    });

    it('should assign correct grades based on thresholds', () => {
      const testCases = [
        { score: 95, expectedGrade: 'A' },
        { score: 85, expectedGrade: 'B' },
        { score: 75, expectedGrade: 'C' },
        { score: 65, expectedGrade: 'D' },
        { score: 55, expectedGrade: 'F' },
      ];

      testCases.forEach(({ score, expectedGrade }) => {
        const patterns: PatternDetection[] = score < 90 ? [{
          patternId: 'test',
          patternName: 'Test Pattern',
          severity: 'medium',
          description: 'Test',
          location: 'Test',
          impact: 100 - score,
        }] : [];

        const result = algorithm.calculateScore({
          patternDetections: patterns,
          documentContent: { privacyPolicy: 'Test' },
        });

        // Allow some variance in score calculation
        expect(result.grade).toBe(expectedGrade);
      });
    });
  });
});