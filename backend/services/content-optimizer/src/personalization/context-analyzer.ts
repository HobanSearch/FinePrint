/**
 * Analyzes user context to enrich personalization data
 * Provides deep insights into user behavior and preferences
 */

import { UserContext, UserBehavior, UserPreferences } from '../types';
import { logger } from '../utils/logger';

export class ContextAnalyzer {
  private readonly behaviorThresholds = {
    highEngagement: {
      pageViews: 10,
      sessionDuration: 300,
      actionsCount: 5
    },
    mediumEngagement: {
      pageViews: 5,
      sessionDuration: 120,
      actionsCount: 2
    }
  };

  /**
   * Analyze and enrich user context
   */
  async analyze(context: UserContext): Promise<UserContext> {
    const enrichedContext = { ...context };

    // Analyze behavior if not already classified
    if (!enrichedContext.behavior?.engagement) {
      enrichedContext.behavior = this.analyzeBehavior(context);
    }

    // Infer preferences if not provided
    if (!enrichedContext.preferences) {
      enrichedContext.preferences = await this.inferPreferences(context);
    }

    // Detect industry if not provided
    if (!enrichedContext.industry) {
      enrichedContext.industry = this.detectIndustry(context);
    }

    // Detect geographic location if not provided
    if (!enrichedContext.geographic) {
      enrichedContext.geographic = await this.detectGeographic(context);
    }

    // Enrich with session insights
    const sessionInsights = this.analyzeSession(context);
    enrichedContext.behavior = {
      ...enrichedContext.behavior,
      ...sessionInsights
    };

    logger.debug({
      userId: context.userId,
      sessionId: context.sessionId,
      enrichments: {
        behavior: enrichedContext.behavior,
        preferences: enrichedContext.preferences,
        industry: enrichedContext.industry,
        geographic: enrichedContext.geographic
      }
    }, 'Context analyzed and enriched');

    return enrichedContext;
  }

  /**
   * Analyze user behavior patterns
   */
  private analyzeBehavior(context: UserContext): UserBehavior {
    const behavior: UserBehavior = {
      pageViews: context.behavior?.pageViews || 0,
      sessionDuration: context.behavior?.sessionDuration || 0,
      lastVisit: context.behavior?.lastVisit,
      actions: context.behavior?.actions || [],
      engagement: 'low'
    };

    // Classify engagement level
    if (this.meetsThreshold(behavior, this.behaviorThresholds.highEngagement)) {
      behavior.engagement = 'high';
    } else if (this.meetsThreshold(behavior, this.behaviorThresholds.mediumEngagement)) {
      behavior.engagement = 'medium';
    }

    // Analyze action patterns
    const actionPatterns = this.analyzeActionPatterns(behavior.actions);
    Object.assign(behavior, actionPatterns);

    return behavior;
  }

  /**
   * Infer user preferences from behavior
   */
  private async inferPreferences(context: UserContext): Promise<UserPreferences> {
    const preferences: UserPreferences = {
      language: 'en',
      features: [],
      communicationStyle: 'formal'
    };

    // Infer from actions
    if (context.behavior?.actions) {
      const actions = context.behavior.actions;

      // Feature interests
      if (actions.includes('view_api_docs')) {
        preferences.features?.push('api_access');
        preferences.communicationStyle = 'technical';
      }
      if (actions.includes('view_integrations')) {
        preferences.features?.push('integrations');
      }
      if (actions.includes('view_security')) {
        preferences.features?.push('security');
      }
      if (actions.includes('view_collaboration')) {
        preferences.features?.push('collaboration');
      }

      // Communication style
      if (actions.includes('chat_initiated')) {
        preferences.communicationStyle = 'casual';
      }
      if (actions.includes('download_whitepaper')) {
        preferences.communicationStyle = 'formal';
      }
    }

    // Infer from session patterns
    if (context.behavior?.sessionDuration && context.behavior.sessionDuration > 600) {
      preferences.communicationStyle = 'technical'; // Long sessions suggest detailed interest
    }

    return preferences;
  }

  /**
   * Detect industry from various signals
   */
  private detectIndustry(context: UserContext): string {
    // Check explicit signals
    if (context.industry) return context.industry;

    // Infer from actions
    const actions = context.behavior?.actions || [];
    
    if (actions.includes('view_healthcare_compliance') || 
        actions.includes('view_hipaa')) {
      return 'healthcare';
    }
    
    if (actions.includes('view_financial_compliance') || 
        actions.includes('view_sox')) {
      return 'finance';
    }
    
    if (actions.includes('view_legal_features') || 
        actions.includes('view_contract_management')) {
      return 'legal';
    }
    
    if (actions.includes('view_api_docs') || 
        actions.includes('view_developer_tools')) {
      return 'tech';
    }
    
    if (actions.includes('view_vendor_management') || 
        actions.includes('view_procurement')) {
      return 'retail';
    }

    return 'other';
  }

  /**
   * Detect geographic location
   */
  private async detectGeographic(context: UserContext): Promise<string> {
    // In production, this would use IP geolocation or user data
    // For now, return a default or random selection
    
    if (context.geographic) return context.geographic;

    // Mock implementation based on session ID
    const hash = context.sessionId.split('').reduce((acc, char) => 
      acc + char.charCodeAt(0), 0
    );
    
    const regions = ['us', 'eu', 'apac', 'latam', 'other'];
    return regions[hash % regions.length];
  }

  /**
   * Analyze session patterns
   */
  private analyzeSession(context: UserContext): Partial<UserBehavior> {
    const insights: Partial<UserBehavior> = {};
    const actions = context.behavior?.actions || [];

    // Navigation patterns
    const navigationPattern = this.detectNavigationPattern(actions);
    if (navigationPattern) {
      (insights as any).navigationPattern = navigationPattern;
    }

    // Intent detection
    const intent = this.detectIntent(actions);
    if (intent) {
      (insights as any).intent = intent;
    }

    // Friction points
    const frictionPoints = this.detectFrictionPoints(actions);
    if (frictionPoints.length > 0) {
      (insights as any).frictionPoints = frictionPoints;
    }

    // Interest areas
    const interests = this.detectInterests(actions);
    if (interests.length > 0) {
      (insights as any).interests = interests;
    }

    return insights;
  }

  /**
   * Detect navigation patterns
   */
  private detectNavigationPattern(actions: string[]): string | null {
    // Linear navigation
    if (this.isLinearNavigation(actions)) {
      return 'linear';
    }

    // Exploratory navigation
    if (this.isExploratoryNavigation(actions)) {
      return 'exploratory';
    }

    // Focused navigation
    if (this.isFocusedNavigation(actions)) {
      return 'focused';
    }

    return null;
  }

  /**
   * Detect user intent
   */
  private detectIntent(actions: string[]): string | null {
    const intents: Record<string, string[]> = {
      'research': ['view_features', 'view_pricing', 'view_case_studies', 'download_whitepaper'],
      'purchase': ['view_pricing', 'start_trial', 'request_demo', 'contact_sales'],
      'support': ['view_docs', 'view_faq', 'chat_initiated', 'submit_ticket'],
      'evaluation': ['view_security', 'view_compliance', 'view_integrations', 'view_api_docs'],
      'comparison': ['view_competitors', 'view_comparison', 'view_alternatives']
    };

    let bestIntent: string | null = null;
    let bestScore = 0;

    for (const [intent, indicators] of Object.entries(intents)) {
      const score = indicators.filter(indicator => actions.includes(indicator)).length;
      if (score > bestScore) {
        bestScore = score;
        bestIntent = intent;
      }
    }

    return bestScore >= 2 ? bestIntent : null;
  }

  /**
   * Detect friction points in user journey
   */
  private detectFrictionPoints(actions: string[]): string[] {
    const frictionPoints: string[] = [];

    // Repeated actions suggest confusion
    const actionCounts = this.countActions(actions);
    for (const [action, count] of Object.entries(actionCounts)) {
      if (count > 2 && !action.startsWith('view_')) {
        frictionPoints.push(`repeated_${action}`);
      }
    }

    // Back navigation suggests issues
    if (actions.includes('back_navigation')) {
      frictionPoints.push('navigation_confusion');
    }

    // Form abandonment
    if (actions.includes('form_started') && !actions.includes('form_submitted')) {
      frictionPoints.push('form_abandonment');
    }

    // Cart abandonment
    if (actions.includes('add_to_cart') && !actions.includes('checkout')) {
      frictionPoints.push('cart_abandonment');
    }

    return frictionPoints;
  }

  /**
   * Detect user interests
   */
  private detectInterests(actions: string[]): string[] {
    const interests: string[] = [];
    const interestMap: Record<string, string> = {
      'view_api_docs': 'technical_integration',
      'view_security': 'security_compliance',
      'view_pricing': 'cost_conscious',
      'view_enterprise': 'enterprise_features',
      'view_case_studies': 'social_proof',
      'view_roi_calculator': 'roi_focused',
      'view_integrations': 'ecosystem_fit',
      'view_collaboration': 'team_features'
    };

    for (const action of actions) {
      if (interestMap[action]) {
        interests.push(interestMap[action]);
      }
    }

    return [...new Set(interests)]; // Remove duplicates
  }

  /**
   * Analyze action patterns
   */
  private analyzeActionPatterns(actions: string[]): Record<string, any> {
    const patterns: Record<string, any> = {};

    // Calculate action velocity
    patterns.actionVelocity = this.calculateActionVelocity(actions);

    // Detect power user behaviors
    patterns.isPowerUser = this.detectPowerUser(actions);

    // Calculate exploration depth
    patterns.explorationDepth = this.calculateExplorationDepth(actions);

    // Detect conversion signals
    patterns.conversionLikelihood = this.calculateConversionLikelihood(actions);

    return patterns;
  }

  /**
   * Helper: Check if behavior meets threshold
   */
  private meetsThreshold(
    behavior: Partial<UserBehavior>,
    threshold: Record<string, number>
  ): boolean {
    return (behavior.pageViews || 0) >= threshold.pageViews &&
           (behavior.sessionDuration || 0) >= threshold.sessionDuration &&
           (behavior.actions?.length || 0) >= threshold.actionsCount;
  }

  /**
   * Helper: Check if navigation is linear
   */
  private isLinearNavigation(actions: string[]): boolean {
    const pageSequence = actions.filter(a => a.startsWith('view_'));
    if (pageSequence.length < 3) return false;

    // Check if pages are viewed in expected order
    const expectedOrder = ['view_homepage', 'view_features', 'view_pricing', 'view_trial'];
    let lastIndex = -1;
    
    for (const page of pageSequence) {
      const currentIndex = expectedOrder.indexOf(page);
      if (currentIndex > lastIndex) {
        lastIndex = currentIndex;
      } else {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Helper: Check if navigation is exploratory
   */
  private isExploratoryNavigation(actions: string[]): boolean {
    const uniquePages = new Set(actions.filter(a => a.startsWith('view_')));
    return uniquePages.size >= 5;
  }

  /**
   * Helper: Check if navigation is focused
   */
  private isFocusedNavigation(actions: string[]): boolean {
    const pageCounts = this.countActions(actions.filter(a => a.startsWith('view_')));
    const maxViews = Math.max(...Object.values(pageCounts));
    return maxViews >= 3; // Same page viewed 3+ times
  }

  /**
   * Helper: Count action occurrences
   */
  private countActions(actions: string[]): Record<string, number> {
    return actions.reduce((counts, action) => {
      counts[action] = (counts[action] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
  }

  /**
   * Helper: Calculate action velocity
   */
  private calculateActionVelocity(actions: string[]): 'fast' | 'normal' | 'slow' {
    // In production, would use timestamps
    const actionsPerMinute = actions.length / 5; // Assume 5 minute session
    if (actionsPerMinute > 3) return 'fast';
    if (actionsPerMinute > 1) return 'normal';
    return 'slow';
  }

  /**
   * Helper: Detect power user
   */
  private detectPowerUser(actions: string[]): boolean {
    const powerUserActions = [
      'view_api_docs', 'use_keyboard_shortcuts', 'bulk_action',
      'export_data', 'advanced_search', 'custom_filter'
    ];
    
    return powerUserActions.some(action => actions.includes(action));
  }

  /**
   * Helper: Calculate exploration depth
   */
  private calculateExplorationDepth(actions: string[]): 'shallow' | 'medium' | 'deep' {
    const uniqueActions = new Set(actions);
    if (uniqueActions.size < 5) return 'shallow';
    if (uniqueActions.size < 10) return 'medium';
    return 'deep';
  }

  /**
   * Helper: Calculate conversion likelihood
   */
  private calculateConversionLikelihood(actions: string[]): 'low' | 'medium' | 'high' {
    const conversionSignals = [
      'view_pricing', 'start_trial', 'request_demo', 
      'contact_sales', 'add_to_cart', 'view_checkout'
    ];
    
    const signalCount = conversionSignals.filter(signal => actions.includes(signal)).length;
    
    if (signalCount >= 3) return 'high';
    if (signalCount >= 1) return 'medium';
    return 'low';
  }
}