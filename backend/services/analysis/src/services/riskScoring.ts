import { createServiceLogger } from '@fineprintai/shared-logger';
import { PatternMatch } from '@fineprintai/shared-types';
import { PatternAnalysisResult } from './patterns';

const logger = createServiceLogger('risk-scoring');

export interface RiskFactor {
  id: string;
  name: string;
  category: string;
  weight: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  confidence: number;
  description: string;
  evidence: string[];
  recommendation: string;
}

export interface RiskAssessment {
  overallScore: number;
  riskLevel: 'minimal' | 'low' | 'moderate' | 'high' | 'critical';
  confidence: number;
  factors: RiskFactor[];
  categoryScores: { [category: string]: number };
  trend: 'improving' | 'stable' | 'worsening';
  recommendations: string[];
  executiveSummary: string;
  comparativeAnalysis?: {
    industryAverage: number;
    percentile: number;
    similar_documents: number;
  };
}

export interface ScoringWeights {
  patternMatches: number;
  severityMultiplier: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  confidenceThreshold: number;
  categoryWeights: { [category: string]: number };
  documentTypeModifiers: { [type: string]: number };
  lengthAdjustment: {
    short: number;    // < 1000 words
    medium: number;   // 1000-5000 words
    long: number;     // > 5000 words
  };
}

export class RiskScoringEngine {
  private readonly DEFAULT_WEIGHTS: ScoringWeights = {
    patternMatches: 0.6,
    severityMultiplier: {
      low: 1.0,
      medium: 2.5,
      high: 5.0,
      critical: 10.0
    },
    confidenceThreshold: 0.3,
    categoryWeights: {
      'Data Privacy': 1.4,
      'User Rights': 1.3,
      'Liability': 1.2,
      'Terms Changes': 1.1,
      'Account Termination': 1.0,
      'Dispute Resolution': 1.2,
      'Auto-Renewal': 0.9,
      'Content Rights': 1.0,
      'Payment': 0.8,
      'Age Restrictions': 0.5,
      'Jurisdiction': 0.7
    },
    documentTypeModifiers: {
      'terms-of-service': 1.0,
      'privacy-policy': 1.2,
      'eula': 0.9,
      'cookie-policy': 0.7,
      'data-processing': 1.3,
      'general': 1.0
    },
    lengthAdjustment: {
      short: 0.9,
      medium: 1.0,
      long: 1.1
    }
  };

  private scoringWeights: ScoringWeights;

  constructor(customWeights?: Partial<ScoringWeights>) {
    this.scoringWeights = {
      ...this.DEFAULT_WEIGHTS,
      ...customWeights,
      severityMultiplier: {
        ...this.DEFAULT_WEIGHTS.severityMultiplier,
        ...(customWeights?.severityMultiplier || {})
      },
      categoryWeights: {
        ...this.DEFAULT_WEIGHTS.categoryWeights,
        ...(customWeights?.categoryWeights || {})
      },
      documentTypeModifiers: {
        ...this.DEFAULT_WEIGHTS.documentTypeModifiers,
        ...(customWeights?.documentTypeModifiers || {})
      },
      lengthAdjustment: {
        ...this.DEFAULT_WEIGHTS.lengthAdjustment,
        ...(customWeights?.lengthAdjustment || {})
      }
    };

    logger.info('Risk Scoring Engine initialized', {
      customWeights: !!customWeights
    });
  }

  async calculateRiskScore(
    patternAnalysis: PatternAnalysisResult,
    documentMetadata: {
      type?: string;
      wordCount?: number;
      language?: string;
      jurisdiction?: string;
    } = {}
  ): Promise<RiskAssessment> {
    const startTime = Date.now();
    
    logger.info('Starting risk assessment', {
      totalMatches: patternAnalysis.totalMatches,
      categories: Object.keys(patternAnalysis.categorizedMatches).length,
      documentType: documentMetadata.type,
      wordCount: documentMetadata.wordCount
    });

    try {
      // Calculate base risk factors
      const riskFactors = await this.calculateRiskFactors(patternAnalysis);
      
      // Calculate category-specific scores
      const categoryScores = this.calculateCategoryScores(patternAnalysis.categorizedMatches);
      
      // Calculate overall score with adjustments
      const baseScore = this.calculateBaseScore(riskFactors);
      const adjustedScore = this.applyDocumentAdjustments(
        baseScore, 
        documentMetadata
      );
      
      // Determine risk level and confidence
      const riskLevel = this.determineRiskLevel(adjustedScore);
      const confidence = this.calculateOverallConfidence(riskFactors);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(riskFactors, adjustedScore);
      
      // Create executive summary
      const executiveSummary = this.generateExecutiveSummary(
        adjustedScore,
        riskLevel,
        riskFactors,
        patternAnalysis.totalMatches
      );

      const assessment: RiskAssessment = {
        overallScore: Math.round(adjustedScore),
        riskLevel,
        confidence: Math.round(confidence * 100) / 100,
        factors: riskFactors,
        categoryScores,
        trend: 'stable', // Would need historical data for trend analysis
        recommendations,
        executiveSummary
      };

      const processingTime = Date.now() - startTime;
      logger.info('Risk assessment completed', {
        overallScore: assessment.overallScore,
        riskLevel: assessment.riskLevel,
        confidence: assessment.confidence,
        factorsCount: riskFactors.length,
        processingTime
      });

      return assessment;
    } catch (error) {
      logger.error('Risk assessment failed', {
        error: error.message,
        totalMatches: patternAnalysis.totalMatches
      });
      throw error;
    }
  }

  private async calculateRiskFactors(
    patternAnalysis: PatternAnalysisResult
  ): Promise<RiskFactor[]> {
    const riskFactors: RiskFactor[] = [];

    for (const [category, matches] of Object.entries(patternAnalysis.categorizedMatches)) {
      for (const match of matches) {
        // Skip low-confidence matches below threshold
        if (match.confidence < this.scoringWeights.confidenceThreshold) {
          continue;
        }

        const categoryWeight = this.scoringWeights.categoryWeights[category] || 1.0;
        const severityMultiplier = this.scoringWeights.severityMultiplier[match.severity];
        
        // Calculate factor score based on confidence, severity, and frequency
        const baseScore = match.confidence * severityMultiplier * match.matches.length;
        const weightedScore = baseScore * categoryWeight;
        
        const evidence = match.matches.map(m => m.text).slice(0, 3); // Limit evidence
        
        riskFactors.push({
          id: match.patternId,
          name: match.name,
          category,
          weight: categoryWeight,
          severity: match.severity,
          score: Math.round(weightedScore * 100) / 100,
          confidence: match.confidence,
          description: this.getFactorDescription(match),
          evidence,
          recommendation: this.getFactorRecommendation(match)
        });
      }
    }

    // Sort by score (highest risk first)
    riskFactors.sort((a, b) => b.score - a.score);

    logger.debug('Risk factors calculated', {
      totalFactors: riskFactors.length,
      averageScore: riskFactors.reduce((sum, f) => sum + f.score, 0) / riskFactors.length,
      highestScore: riskFactors[0]?.score || 0
    });

    return riskFactors;
  }

  private calculateCategoryScores(
    categorizedMatches: { [category: string]: PatternMatch[] }
  ): { [category: string]: number } {
    const categoryScores: { [category: string]: number } = {};

    for (const [category, matches] of Object.entries(categorizedMatches)) {
      let categoryScore = 0;
      let totalWeight = 0;

      for (const match of matches) {
        if (match.confidence >= this.scoringWeights.confidenceThreshold) {
          const severityMultiplier = this.scoringWeights.severityMultiplier[match.severity];
          const matchScore = match.confidence * severityMultiplier * match.matches.length;
          
          categoryScore += matchScore;
          totalWeight += 1;
        }
      }

      // Normalize and apply category weight
      const normalizedScore = totalWeight > 0 ? categoryScore / totalWeight : 0;
      const categoryWeight = this.scoringWeights.categoryWeights[category] || 1.0;
      
      categoryScores[category] = Math.round(normalizedScore * categoryWeight * 10);
    }

    return categoryScores;
  }

  private calculateBaseScore(riskFactors: RiskFactor[]): number {
    if (riskFactors.length === 0) return 0;

    // Weighted average of all risk factors
    const totalWeightedScore = riskFactors.reduce((sum, factor) => {
      return sum + (factor.score * factor.confidence);
    }, 0);

    const totalWeight = riskFactors.reduce((sum, factor) => {
      return sum + factor.confidence;
    }, 0);

    const baseScore = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;

    // Apply diminishing returns for very high scores
    const normalizedScore = Math.min(100, baseScore);
    const finalScore = normalizedScore * 0.85 + Math.sqrt(normalizedScore) * 1.5;

    return Math.min(100, finalScore);
  }

  private applyDocumentAdjustments(
    baseScore: number,
    metadata: {
      type?: string;
      wordCount?: number;
      language?: string;
      jurisdiction?: string;
    }
  ): number {
    let adjustedScore = baseScore;

    // Document type adjustment
    if (metadata.type) {
      const typeModifier = this.scoringWeights.documentTypeModifiers[metadata.type] || 1.0;
      adjustedScore *= typeModifier;
    }

    // Document length adjustment
    if (metadata.wordCount) {
      let lengthModifier = 1.0;
      
      if (metadata.wordCount < 1000) {
        lengthModifier = this.scoringWeights.lengthAdjustment.short;
      } else if (metadata.wordCount > 5000) {
        lengthModifier = this.scoringWeights.lengthAdjustment.long;
      } else {
        lengthModifier = this.scoringWeights.lengthAdjustment.medium;
      }
      
      adjustedScore *= lengthModifier;
    }

    // Language adjustment (English documents may have more detailed analysis)
    if (metadata.language && metadata.language !== 'en') {
      adjustedScore *= 0.95; // Slightly lower confidence for non-English
    }

    // Jurisdiction-based adjustments
    if (metadata.jurisdiction) {
      const jurisdictionModifiers: { [key: string]: number } = {
        'US': 1.0,
        'EU': 0.9,  // GDPR provides better protections
        'UK': 0.95,
        'CA': 0.92, // Strong privacy laws
        'AU': 0.96,
        'default': 1.1 // Less regulatory protection
      };
      
      const modifier = jurisdictionModifiers[metadata.jurisdiction] || jurisdictionModifiers['default'];
      adjustedScore *= modifier;
    }

    return Math.min(100, Math.max(0, adjustedScore));
  }

  private determineRiskLevel(score: number): 'minimal' | 'low' | 'moderate' | 'high' | 'critical' {
    if (score >= 85) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 50) return 'moderate';
    if (score >= 25) return 'low';
    return 'minimal';
  }

  private calculateOverallConfidence(riskFactors: RiskFactor[]): number {
    if (riskFactors.length === 0) return 0.1;

    // Confidence based on number of factors and their individual confidence
    const avgConfidence = riskFactors.reduce((sum, f) => sum + f.confidence, 0) / riskFactors.length;
    
    // More factors generally mean higher confidence, but with diminishing returns
    const factorBonus = Math.min(0.3, riskFactors.length * 0.05);
    
    // High-severity findings increase confidence
    const criticalCount = riskFactors.filter(f => f.severity === 'critical').length;
    const severityBonus = Math.min(0.2, criticalCount * 0.1);

    const overallConfidence = avgConfidence + factorBonus + severityBonus;
    
    return Math.min(1.0, Math.max(0.1, overallConfidence));
  }

  private generateRecommendations(riskFactors: RiskFactor[], overallScore: number): string[] {
    const recommendations: string[] = [];

    // Risk level based recommendations
    if (overallScore >= 85) {
      recommendations.push('⚠️ CRITICAL: Strongly consider avoiding this service due to significant privacy and user rights concerns');
      recommendations.push('Seek alternative services with better terms and privacy practices');
    } else if (overallScore >= 70) {
      recommendations.push('⚠️ HIGH RISK: Carefully review the concerning clauses before accepting');
      recommendations.push('Consider contacting the service to negotiate better terms');
    } else if (overallScore >= 50) {
      recommendations.push('⚠️ MODERATE RISK: Review the identified issues and decide if the benefits outweigh the risks');
      recommendations.push('Stay informed about your rights and how to exercise them');
    } else if (overallScore >= 25) {
      recommendations.push('✓ MANAGEABLE RISK: Generally acceptable terms with some minor concerns');
      recommendations.push('Review the specific issues mentioned and understand your rights');
    } else {
      recommendations.push('✓ LOW RISK: Terms appear to be relatively user-friendly');
      recommendations.push('Continue to review terms periodically for changes');
    }

    // Category-specific recommendations
    const criticalFactors = riskFactors.filter(f => f.severity === 'critical');
    const dataPrivacyIssues = riskFactors.filter(f => f.category === 'Data Privacy');
    const liabilityIssues = riskFactors.filter(f => f.category === 'Liability');

    if (criticalFactors.length > 0) {
      recommendations.push(`Address ${criticalFactors.length} critical issue(s) before proceeding`);
    }

    if (dataPrivacyIssues.length >= 3) {
      recommendations.push('Consider using privacy-focused alternatives or additional privacy tools');
    }

    if (liabilityIssues.length >= 2) {
      recommendations.push('Review your insurance coverage and understand liability limitations');
    }

    // Top 3 specific recommendations from risk factors
    const topFactors = riskFactors.slice(0, 3);
    topFactors.forEach(factor => {
      if (factor.recommendation && !recommendations.includes(factor.recommendation)) {
        recommendations.push(factor.recommendation);
      }
    });

    return recommendations.slice(0, 8); // Limit to 8 recommendations
  }

  private generateExecutiveSummary(
    score: number,
    riskLevel: string,
    riskFactors: RiskFactor[],
    totalMatches: number
  ): string {
    const riskLevelText = riskLevel.toUpperCase();
    const criticalCount = riskFactors.filter(f => f.severity === 'critical').length;
    const highCount = riskFactors.filter(f => f.severity === 'high').length;
    
    let summary = `This document received a risk score of ${score}/100, indicating ${riskLevelText} risk to users. `;
    
    if (totalMatches === 0) {
      summary += 'No significant problematic clauses were identified in the analysis.';
    } else {
      summary += `The analysis identified ${totalMatches} potentially problematic clause(s) across ${riskFactors.length} categories. `;
      
      if (criticalCount > 0) {
        summary += `${criticalCount} critical issue(s) require immediate attention. `;
      }
      
      if (highCount > 0) {
        summary += `${highCount} high-severity issue(s) should be carefully reviewed. `;
      }

      // Mention top categories
      const categoryGroups = this.groupFactorsByCategory(riskFactors);
      const topCategories = Object.entries(categoryGroups)
        .sort(([,a], [,b]) => b.length - a.length)
        .slice(0, 2)
        .map(([category]) => category);

      if (topCategories.length > 0) {
        summary += `Primary concerns involve ${topCategories.join(' and ')}.`;
      }
    }

    return summary;
  }

  private groupFactorsByCategory(riskFactors: RiskFactor[]): { [category: string]: RiskFactor[] } {
    const groups: { [category: string]: RiskFactor[] } = {};
    
    for (const factor of riskFactors) {
      if (!groups[factor.category]) {
        groups[factor.category] = [];
      }
      groups[factor.category].push(factor);
    }
    
    return groups;
  }

  private getFactorDescription(match: PatternMatch): string {
    // These would ideally come from the pattern library
    const descriptions: { [key: string]: string } = {
      'Data Privacy': 'This clause may compromise your personal data protection rights',
      'User Rights': 'Your rights as a user may be limited or restricted',
      'Liability': 'The service attempts to limit their legal responsibility',
      'Terms Changes': 'Terms may be changed without adequate notice or consent',
      'Account Termination': 'Your account may be terminated under broad conditions',
      'Dispute Resolution': 'Your legal remedies may be restricted',
      'Auto-Renewal': 'Subscription charges may continue without clear consent',
      'Content Rights': 'Your content ownership or usage rights may be affected',
      'Payment': 'Additional or unexpected charges may apply',
      'Age Restrictions': 'Age-related usage restrictions apply',
      'Jurisdiction': 'Legal disputes must be resolved in specified jurisdiction'
    };

    return descriptions[match.category] || `Potentially problematic clause in ${match.category}`;
  }

  private getFactorRecommendation(match: PatternMatch): string {
    const recommendations: { [key: string]: string } = {
      'critical': 'Consider avoiding this service or seeking alternative options',
      'high': 'Carefully review this clause and understand its implications before proceeding',
      'medium': 'Be aware of this limitation and consider how it affects your usage',
      'low': 'Note this clause but it likely has minimal impact on typical usage'
    };

    return recommendations[match.severity] || 'Review this clause carefully';
  }

  // Comparative analysis methods
  async addComparativeAnalysis(
    assessment: RiskAssessment,
    industryData?: {
      averageScore: number;
      documentCount: number;
      scoreDistribution: { [range: string]: number };
    }
  ): Promise<RiskAssessment> {
    if (!industryData) return assessment;

    const percentile = this.calculatePercentile(assessment.overallScore, industryData.scoreDistribution);

    assessment.comparativeAnalysis = {
      industryAverage: industryData.averageScore,
      percentile,
      similar_documents: industryData.documentCount
    };

    // Add comparative recommendations
    if (assessment.overallScore > industryData.averageScore * 1.2) {
      assessment.recommendations.unshift('This document scores significantly worse than industry average');
    } else if (assessment.overallScore < industryData.averageScore * 0.8) {
      assessment.recommendations.unshift('This document has better terms than the industry average');
    }

    return assessment;
  }

  private calculatePercentile(
    score: number, 
    distribution: { [range: string]: number }
  ): number {
    // Simple percentile calculation based on score distribution
    let lowerCount = 0;
    let totalCount = 0;

    for (const [range, count] of Object.entries(distribution)) {
      const [min, max] = range.split('-').map(Number);
      totalCount += count;
      
      if (max < score) {
        lowerCount += count;
      } else if (min <= score && score <= max) {
        // Assume uniform distribution within range
        lowerCount += count * ((score - min) / (max - min));
      }
    }

    return totalCount > 0 ? Math.round((lowerCount / totalCount) * 100) : 50;
  }

  // Method to update scoring weights based on feedback
  updateScoringWeights(weights: Partial<ScoringWeights>): void {
    this.scoringWeights = {
      ...this.scoringWeights,
      ...weights,
      severityMultiplier: {
        ...this.scoringWeights.severityMultiplier,
        ...(weights.severityMultiplier || {})
      },
      categoryWeights: {
        ...this.scoringWeights.categoryWeights,
        ...(weights.categoryWeights || {})
      }
    };

    logger.info('Scoring weights updated', { updatedFields: Object.keys(weights) });
  }

  getScoringWeights(): ScoringWeights {
    return { ...this.scoringWeights };
  }

  // Batch scoring for multiple documents
  async batchScore(
    analyses: Array<{
      patternAnalysis: PatternAnalysisResult;
      metadata: { type?: string; wordCount?: number; language?: string; jurisdiction?: string };
    }>
  ): Promise<RiskAssessment[]> {
    logger.info('Starting batch risk scoring', { count: analyses.length });

    const results: RiskAssessment[] = [];
    
    for (let i = 0; i < analyses.length; i++) {
      try {
        const assessment = await this.calculateRiskScore(
          analyses[i].patternAnalysis,
          analyses[i].metadata
        );
        results.push(assessment);
      } catch (error) {
        logger.error('Batch scoring failed for document', { 
          index: i, 
          error: error.message 
        });
        // Create minimal assessment for failed document
        results.push({
          overallScore: 50,
          riskLevel: 'moderate',
          confidence: 0.1,
          factors: [],
          categoryScores: {},
          trend: 'stable',
          recommendations: ['Analysis failed - manual review recommended'],
          executiveSummary: 'Risk assessment could not be completed due to analysis error'
        });
      }
    }

    logger.info('Batch risk scoring completed', { 
      totalDocuments: analyses.length,
      successfulAssessments: results.filter(r => r.confidence > 0.1).length
    });

    return results;
  }
}

// Singleton instance
export const riskScoringEngine = new RiskScoringEngine();