import { PatternDetection, ScoreBreakdown } from '../types';
import { config } from '../config';

interface ScoringInput {
  patternDetections: PatternDetection[];
  documentContent: {
    privacyPolicy?: string;
    termsOfService?: string;
  };
}

interface ScoringResult {
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  breakdown: ScoreBreakdown;
  trending: 'improving' | 'declining' | 'stable';
}

export class ScoringAlgorithm {
  private readonly weights = config.scoring.weights;
  private readonly gradeThresholds = config.scoring.gradeThresholds;

  /**
   * Calculate privacy score based on pattern detections and document analysis
   */
  calculateScore(input: ScoringInput, previousScore?: number): ScoringResult {
    const breakdown: ScoreBreakdown = {
      patternDetection: this.calculatePatternScore(input.patternDetections),
      dataCollection: this.calculateDataCollectionScore(input),
      userRights: this.calculateUserRightsScore(input),
      transparency: this.calculateTransparencyScore(input),
    };

    // Calculate weighted overall score
    const overallScore = this.calculateOverallScore(breakdown);

    // Determine grade
    const grade = this.determineGrade(overallScore);

    // Determine trending
    const trending = this.determineTrending(overallScore, previousScore);

    return {
      overallScore,
      grade,
      breakdown,
      trending,
    };
  }

  /**
   * Calculate pattern detection score (50% weight)
   * Lower score = more problematic patterns detected
   */
  private calculatePatternScore(patterns: PatternDetection[]): number {
    if (patterns.length === 0) {
      return 100; // No problematic patterns found
    }

    // Group patterns by severity
    const severityWeights = {
      critical: 1.0,
      high: 0.7,
      medium: 0.4,
      low: 0.2,
    };

    let totalImpact = 0;
    let maxPossibleImpact = 0;

    patterns.forEach(pattern => {
      const weight = severityWeights[pattern.severity as keyof typeof severityWeights] || 0.5;
      totalImpact += pattern.impact * weight;
      maxPossibleImpact += 100 * weight;
    });

    // Calculate normalized score (inverted - higher score is better)
    const normalizedImpact = maxPossibleImpact > 0 ? totalImpact / maxPossibleImpact : 0;
    return Math.max(0, 100 - (normalizedImpact * 100));
  }

  /**
   * Calculate data collection practices score (20% weight)
   */
  private calculateDataCollectionScore(input: ScoringInput): number {
    const indicators = {
      positive: [
        /data\s+minimization/i,
        /limited\s+data\s+collection/i,
        /only\s+collect\s+necessary/i,
        /anonymous\s+browsing/i,
        /no\s+tracking/i,
        /opt-in\s+data\s+collection/i,
      ],
      negative: [
        /collect\s+all\s+data/i,
        /third-party\s+sharing/i,
        /sell\s+personal\s+information/i,
        /extensive\s+tracking/i,
        /behavioral\s+advertising/i,
        /data\s+broker/i,
      ],
    };

    return this.scoreByIndicators(input.documentContent, indicators);
  }

  /**
   * Calculate user rights and controls score (20% weight)
   */
  private calculateUserRightsScore(input: ScoringInput): number {
    const indicators = {
      positive: [
        /right\s+to\s+delete/i,
        /data\s+portability/i,
        /opt-out/i,
        /access\s+your\s+data/i,
        /correct\s+your\s+information/i,
        /gdpr\s+compliant/i,
        /ccpa\s+compliant/i,
        /user\s+control/i,
        /privacy\s+settings/i,
      ],
      negative: [
        /no\s+right\s+to\s+delete/i,
        /cannot\s+opt\s+out/i,
        /waive\s+rights/i,
        /no\s+access\s+to\s+data/i,
        /mandatory\s+arbitration/i,
        /class\s+action\s+waiver/i,
      ],
    };

    return this.scoreByIndicators(input.documentContent, indicators);
  }

  /**
   * Calculate transparency and clarity score (10% weight)
   */
  private calculateTransparencyScore(input: ScoringInput): number {
    const allContent = Object.values(input.documentContent).join(' ');
    
    if (!allContent) {
      return 0; // No documents available
    }

    let score = 100;

    // Check readability factors
    const words = allContent.split(/\s+/);
    const sentences = allContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgWordsPerSentence = words.length / sentences.length;

    // Penalize overly complex sentences
    if (avgWordsPerSentence > 25) {
      score -= 20;
    } else if (avgWordsPerSentence > 20) {
      score -= 10;
    }

    // Check for clear section headers
    const hasPrivacySections = /(?:what|how|why|when|your\s+rights|data\s+collection|contact)/i.test(allContent);
    if (!hasPrivacySections) {
      score -= 15;
    }

    // Check for contact information
    const hasContactInfo = /(?:contact\s+us|email|privacy@|dpo@|data\s+protection\s+officer)/i.test(allContent);
    if (!hasContactInfo) {
      score -= 15;
    }

    // Check for last updated date
    const hasUpdateDate = /(?:last\s+updated|effective\s+date|revised)/i.test(allContent);
    if (!hasUpdateDate) {
      score -= 10;
    }

    // Bonus for plain language
    const plainLanguageIndicators = /(?:in\s+simple\s+terms|what\s+this\s+means|for\s+example|in\s+other\s+words)/i;
    if (plainLanguageIndicators.test(allContent)) {
      score += 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Helper method to score based on positive/negative indicators
   */
  private scoreByIndicators(
    documentContent: { privacyPolicy?: string; termsOfService?: string },
    indicators: { positive: RegExp[]; negative: RegExp[] }
  ): number {
    const allContent = Object.values(documentContent).join(' ');
    
    if (!allContent) {
      return 50; // Neutral score if no content
    }

    let positiveCount = 0;
    let negativeCount = 0;

    indicators.positive.forEach(pattern => {
      if (pattern.test(allContent)) {
        positiveCount++;
      }
    });

    indicators.negative.forEach(pattern => {
      if (pattern.test(allContent)) {
        negativeCount++;
      }
    });

    const totalIndicators = indicators.positive.length + indicators.negative.length;
    const netPositive = positiveCount - negativeCount;
    const normalizedScore = (netPositive + indicators.negative.length) / totalIndicators;

    return Math.max(0, Math.min(100, normalizedScore * 100));
  }

  /**
   * Calculate weighted overall score
   */
  private calculateOverallScore(breakdown: ScoreBreakdown): number {
    const weightedScore = 
      breakdown.patternDetection * this.weights.patternDetection +
      breakdown.dataCollection * this.weights.dataCollection +
      breakdown.userRights * this.weights.userRights +
      breakdown.transparency * this.weights.transparency;

    return Math.round(weightedScore * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Determine letter grade based on score
   */
  private determineGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= this.gradeThresholds.A) return 'A';
    if (score >= this.gradeThresholds.B) return 'B';
    if (score >= this.gradeThresholds.C) return 'C';
    if (score >= this.gradeThresholds.D) return 'D';
    return 'F';
  }

  /**
   * Determine trending direction
   */
  private determineTrending(
    currentScore: number,
    previousScore?: number
  ): 'improving' | 'declining' | 'stable' {
    if (!previousScore) {
      return 'stable';
    }

    const difference = currentScore - previousScore;
    
    if (difference > 5) {
      return 'improving';
    } else if (difference < -5) {
      return 'declining';
    }
    
    return 'stable';
  }
}

export const scoringAlgorithm = new ScoringAlgorithm();