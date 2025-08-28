/**
 * User segment detection based on behavioral and contextual signals
 * Classifies users into enterprise, SMB, startup, or individual segments
 */

import { UserContext, UserSegment, UserBehavior } from '../types';
import { logger } from '../utils/logger';

export class SegmentDetector {
  private readonly segmentRules: SegmentRule[];

  constructor() {
    this.segmentRules = this.initializeRules();
  }

  /**
   * Detect user segment based on various signals
   */
  async detect(context: UserContext): Promise<UserSegment> {
    const signals = await this.extractSignals(context);
    const scores = this.calculateSegmentScores(signals);
    
    // Find segment with highest score
    let bestSegment: UserSegment = 'unknown';
    let highestScore = 0;

    for (const [segment, score] of Object.entries(scores)) {
      if (score > highestScore) {
        highestScore = score;
        bestSegment = segment as UserSegment;
      }
    }

    // Require minimum confidence threshold
    if (highestScore < 0.3) {
      bestSegment = 'unknown';
    }

    logger.debug({
      userId: context.userId,
      detectedSegment: bestSegment,
      scores,
      signals
    }, 'Segment detected');

    return bestSegment;
  }

  /**
   * Extract signals from user context
   */
  private async extractSignals(context: UserContext): Promise<SegmentSignals> {
    const signals: SegmentSignals = {
      // User-provided signals
      declaredSegment: context.segment,
      industry: context.industry,
      
      // Behavioral signals
      pageViews: context.behavior?.pageViews || 0,
      sessionDuration: context.behavior?.sessionDuration || 0,
      engagement: context.behavior?.engagement || 'low',
      actions: context.behavior?.actions || [],
      
      // Derived signals
      isReturningUser: !!context.behavior?.lastVisit,
      viewedPricing: context.behavior?.actions?.includes('view_pricing') || false,
      viewedEnterprise: context.behavior?.actions?.includes('view_enterprise') || false,
      requestedDemo: context.behavior?.actions?.includes('request_demo') || false,
      startedTrial: context.behavior?.actions?.includes('start_trial') || false,
      
      // Session signals
      sessionId: context.sessionId,
      userId: context.userId,
      
      // Geographic signals
      geographic: context.geographic,
      
      // Preference signals
      communicationStyle: context.preferences?.communicationStyle,
      requestedFeatures: context.preferences?.features || []
    };

    // Enrich with additional signals if available
    if (context.userId) {
      signals.accountAge = await this.getAccountAge(context.userId);
      signals.teamSize = await this.getTeamSize(context.userId);
      signals.usagePattern = await this.getUsagePattern(context.userId);
    }

    return signals;
  }

  /**
   * Calculate scores for each segment
   */
  private calculateSegmentScores(signals: SegmentSignals): Record<UserSegment, number> {
    const scores: Record<UserSegment, number> = {
      enterprise: 0,
      smb: 0,
      startup: 0,
      individual: 0,
      unknown: 0
    };

    // Apply rules to calculate scores
    for (const rule of this.segmentRules) {
      if (rule.condition(signals)) {
        scores[rule.segment] += rule.weight;
      }
    }

    // Normalize scores
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    if (total > 0) {
      for (const segment in scores) {
        scores[segment as UserSegment] /= total;
      }
    }

    return scores;
  }

  /**
   * Initialize segment detection rules
   */
  private initializeRules(): SegmentRule[] {
    return [
      // Enterprise indicators
      {
        segment: 'enterprise',
        condition: (s) => s.viewedEnterprise === true,
        weight: 10
      },
      {
        segment: 'enterprise',
        condition: (s) => s.requestedDemo === true,
        weight: 8
      },
      {
        segment: 'enterprise',
        condition: (s) => (s.teamSize || 0) > 50,
        weight: 15
      },
      {
        segment: 'enterprise',
        condition: (s) => s.industry === 'finance' || s.industry === 'healthcare',
        weight: 5
      },
      {
        segment: 'enterprise',
        condition: (s) => s.requestedFeatures.includes('sso') || 
                          s.requestedFeatures.includes('api_access'),
        weight: 7
      },
      {
        segment: 'enterprise',
        condition: (s) => s.communicationStyle === 'formal',
        weight: 3
      },
      {
        segment: 'enterprise',
        condition: (s) => s.usagePattern === 'heavy',
        weight: 6
      },

      // SMB indicators
      {
        segment: 'smb',
        condition: (s) => (s.teamSize || 0) >= 10 && (s.teamSize || 0) <= 50,
        weight: 12
      },
      {
        segment: 'smb',
        condition: (s) => s.viewedPricing === true && !s.viewedEnterprise,
        weight: 6
      },
      {
        segment: 'smb',
        condition: (s) => s.industry === 'retail' || s.industry === 'legal',
        weight: 4
      },
      {
        segment: 'smb',
        condition: (s) => s.requestedFeatures.includes('collaboration'),
        weight: 5
      },
      {
        segment: 'smb',
        condition: (s) => s.usagePattern === 'moderate',
        weight: 5
      },
      {
        segment: 'smb',
        condition: (s) => s.engagement === 'medium',
        weight: 4
      },

      // Startup indicators
      {
        segment: 'startup',
        condition: (s) => s.industry === 'tech',
        weight: 8
      },
      {
        segment: 'startup',
        condition: (s) => (s.teamSize || 0) < 10 && (s.teamSize || 0) > 1,
        weight: 10
      },
      {
        segment: 'startup',
        condition: (s) => s.startedTrial === true,
        weight: 7
      },
      {
        segment: 'startup',
        condition: (s) => s.requestedFeatures.includes('integrations'),
        weight: 4
      },
      {
        segment: 'startup',
        condition: (s) => s.communicationStyle === 'casual',
        weight: 3
      },
      {
        segment: 'startup',
        condition: (s) => (s.accountAge || 0) < 30,
        weight: 5
      },
      {
        segment: 'startup',
        condition: (s) => s.geographic === 'us' && s.engagement === 'high',
        weight: 4
      },

      // Individual indicators
      {
        segment: 'individual',
        condition: (s) => (s.teamSize || 0) <= 1,
        weight: 15
      },
      {
        segment: 'individual',
        condition: (s) => !s.userId,
        weight: 8
      },
      {
        segment: 'individual',
        condition: (s) => s.pageViews < 3,
        weight: 5
      },
      {
        segment: 'individual',
        condition: (s) => s.sessionDuration < 120,
        weight: 4
      },
      {
        segment: 'individual',
        condition: (s) => s.engagement === 'low',
        weight: 4
      },
      {
        segment: 'individual',
        condition: (s) => !s.viewedPricing && !s.viewedEnterprise,
        weight: 3
      },
      {
        segment: 'individual',
        condition: (s) => s.usagePattern === 'light' || !s.usagePattern,
        weight: 5
      }
    ];
  }

  /**
   * Get account age in days (mock implementation)
   */
  private async getAccountAge(userId: string): Promise<number> {
    // In production, this would query the database
    // For now, return a mock value based on user ID hash
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return hash % 365;
  }

  /**
   * Get team size (mock implementation)
   */
  private async getTeamSize(userId: string): Promise<number> {
    // In production, this would query the database
    // For now, return a mock value based on user ID
    if (userId.includes('enterprise')) return 100;
    if (userId.includes('smb')) return 25;
    if (userId.includes('startup')) return 5;
    return 1;
  }

  /**
   * Get usage pattern (mock implementation)
   */
  private async getUsagePattern(userId: string): Promise<'heavy' | 'moderate' | 'light'> {
    // In production, this would analyze actual usage data
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const patterns: Array<'heavy' | 'moderate' | 'light'> = ['heavy', 'moderate', 'light'];
    return patterns[hash % 3];
  }

  /**
   * Validate and refine segment detection
   */
  async refineSegment(
    initialSegment: UserSegment,
    additionalData: Record<string, any>
  ): Promise<UserSegment> {
    // Additional validation logic
    if (additionalData.companySize && additionalData.companySize > 1000) {
      return 'enterprise';
    }
    
    if (additionalData.fundingStage === 'seed' || additionalData.fundingStage === 'series_a') {
      return 'startup';
    }

    if (additionalData.businessType === 'freelance' || additionalData.businessType === 'consultant') {
      return 'individual';
    }

    return initialSegment;
  }

  /**
   * Get segment confidence score
   */
  getConfidence(scores: Record<UserSegment, number>): number {
    const values = Object.values(scores);
    const max = Math.max(...values);
    const secondMax = values.sort((a, b) => b - a)[1] || 0;
    
    // Confidence is the difference between top two scores
    return max - secondMax;
  }
}

interface SegmentSignals {
  // Direct signals
  declaredSegment?: UserSegment;
  industry?: string;
  
  // Behavioral signals
  pageViews: number;
  sessionDuration: number;
  engagement: 'high' | 'medium' | 'low';
  actions: string[];
  
  // Derived signals
  isReturningUser: boolean;
  viewedPricing: boolean;
  viewedEnterprise: boolean;
  requestedDemo: boolean;
  startedTrial: boolean;
  
  // Session signals
  sessionId: string;
  userId?: string;
  
  // Geographic signals
  geographic?: string;
  
  // Preference signals
  communicationStyle?: string;
  requestedFeatures: string[];
  
  // Enriched signals
  accountAge?: number;
  teamSize?: number;
  usagePattern?: 'heavy' | 'moderate' | 'light';
}

interface SegmentRule {
  segment: UserSegment;
  condition: (signals: SegmentSignals) => boolean;
  weight: number;
}