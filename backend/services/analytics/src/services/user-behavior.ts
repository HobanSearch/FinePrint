/**
 * Fine Print AI - User Behavior Analytics Service
 * 
 * Comprehensive user behavior analysis including:
 * - User journey mapping
 * - Funnel analysis and optimization
 * - Cohort analysis
 * - Session replay analysis
 * - Feature adoption tracking
 * - User segmentation
 * - Behavioral patterns detection
 */

import { PrismaClient } from '@prisma/client';
import { config } from '@/config';
import { analyticsLogger } from '@/utils/logger';
import { productAnalyticsService } from '@/services/product-analytics';
import {
  FunnelDefinition,
  FunnelAnalysis,
  FunnelStepAnalysis,
  CohortDefinition,
  CohortAnalysis,
  CohortRetentionData,
  EventCondition
} from '@/types/analytics';

interface UserSession {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  pageViews: number;
  events: number;
  conversionEvents: number;
  deviceType: string;
  browser: string;
  referrer?: string;
  exitPage?: string;
  bounced: boolean;
}

interface UserJourney {
  userId: string;
  sessionId: string;
  touchpoints: TouchPoint[];
  totalDuration: number;
  conversionPath: string[];
  dropOffPoint?: string;
}

interface TouchPoint {
  timestamp: Date;
  type: 'page_view' | 'event' | 'conversion';
  name: string;
  properties: Record<string, any>;
  durationOnPage?: number;
}

interface UserSegment {
  id: string;
  name: string;
  description: string;
  criteria: EventCondition[];
  userCount: number;
  avgLifetimeValue: number;
  conversionRate: number;
  churnRate: number;
}

class UserBehaviorAnalyticsService {
  private prisma: PrismaClient;
  private predefinedFunnels: Map<string, FunnelDefinition> = new Map();
  private activeSegments: Map<string, UserSegment> = new Map();

  constructor() {
    this.prisma = new PrismaClient();
    this.initializeFunnels();
  }

  private initializeFunnels(): void {
    // Define standard funnels for Fine Print AI
    const onboardingFunnel: FunnelDefinition = {
      name: 'User Onboarding',
      description: 'User onboarding flow from signup to first document analysis',
      steps: [
        {
          name: 'Signup',
          order: 1,
          eventName: 'User Registered',
          conditions: []
        },
        {
          name: 'Email Verification',
          order: 2,
          eventName: 'Email Verified',
          conditions: []
        },
        {
          name: 'First Login',
          order: 3,
          eventName: 'User Login',
          conditions: []
        },
        {
          name: 'First Document Upload',
          order: 4,
          eventName: 'Document Uploaded',
          conditions: []
        },
        {
          name: 'First Analysis',
          order: 5,
          eventName: 'Analysis Completed',
          conditions: []
        }
      ],
      timeWindow: 168, // 7 days
      conversionGoal: 'First Analysis'
    };

    const subscriptionFunnel: FunnelDefinition = {
      name: 'Subscription Conversion',
      description: 'Free to paid subscription conversion funnel',
      steps: [
        {
          name: 'Trial Started',
          order: 1,
          eventName: 'Trial Started',
          conditions: []
        },
        {
          name: 'Feature Used',
          order: 2,
          eventName: 'Feature Engagement',
          conditions: [
            { property: 'feature', operator: 'in', value: ['analysis', 'monitoring', 'actions'] }
          ]
        },
        {
          name: 'Pricing Page Viewed',
          order: 3,
          eventName: 'Page Viewed',
          conditions: [
            { property: 'page_url', operator: 'contains', value: '/pricing' }
          ]
        },
        {
          name: 'Subscription Selected',
          order: 4,
          eventName: 'Subscription Selected',
          conditions: []
        },
        {
          name: 'Payment Completed',
          order: 5,
          eventName: 'Conversion',
          conditions: [
            { property: 'conversion_type', operator: 'equals', value: 'subscription' }
          ]
        }
      ],
      timeWindow: 336, // 14 days
      conversionGoal: 'Payment Completed'
    };

    this.predefinedFunnels.set('onboarding', onboardingFunnel);
    this.predefinedFunnels.set('subscription', subscriptionFunnel);
  }

  /**
   * Analyze funnel conversion rates
   */
  async analyzeFunnel(
    funnelName: string,
    timeRange: { start: Date; end: Date },
    segmentCriteria?: EventCondition[]
  ): Promise<FunnelAnalysis> {
    try {
      const funnel = this.predefinedFunnels.get(funnelName);
      if (!funnel) {
        throw new Error(`Funnel not found: ${funnelName}`);
      }

      // Get users who entered the funnel
      const funnelUsers = await this.getFunnelUsers(funnel, timeRange, segmentCriteria);
      
      // Analyze each step
      const stepAnalyses: FunnelStepAnalysis[] = [];
      let previousStepUsers = funnelUsers.length;

      for (const step of funnel.steps) {
        const stepUsers = await this.getStepUsers(funnel, step, timeRange, funnelUsers);
        const conversionRate = previousStepUsers > 0 ? stepUsers.length / previousStepUsers : 0;
        const dropOffRate = 1 - conversionRate;
        
        // Calculate average time from previous step
        const avgTimeFromPrevious = await this.calculateAvgTimeBetweenSteps(
          funnel,
          step.order - 1,
          step.order,
          timeRange,
          stepUsers
        );

        stepAnalyses.push({
          stepName: step.name,
          stepOrder: step.order,
          userCount: stepUsers.length,
          conversionRate,
          dropOffRate,
          averageTimeFromPrevious: avgTimeFromPrevious
        });

        previousStepUsers = stepUsers.length;
      }

      // Calculate overall conversion rate
      const finalStepUsers = stepAnalyses[stepAnalyses.length - 1]?.userCount || 0;
      const overallConversionRate = funnelUsers.length > 0 ? finalStepUsers / funnelUsers.length : 0;

      // Calculate average time to convert
      const averageTimeToConvert = await this.calculateAverageTimeToConvert(
        funnel,
        timeRange,
        funnelUsers
      );

      const analysis: FunnelAnalysis = {
        funnelName,
        totalUsers: funnelUsers.length,
        steps: stepAnalyses,
        overallConversionRate,
        averageTimeToConvert
      };

      // Track funnel analysis
      await productAnalyticsService.trackEvent(
        'system',
        'Funnel Analysis Completed',
        {
          funnel_name: funnelName,
          total_users: funnelUsers.length,
          overall_conversion_rate: overallConversionRate,
          time_range: `${timeRange.start.toISOString()}_${timeRange.end.toISOString()}`
        }
      );

      return analysis;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'analyze_funnel',
        funnelName
      });
      throw error;
    }
  }

  /**
   * Analyze user cohorts
   */
  async analyzeCohort(
    cohortDefinition: CohortDefinition,
    timeRange: { start: Date; end: Date }
  ): Promise<CohortAnalysis> {
    try {
      // Get cohort users based on criteria
      const cohortUsers = await this.getCohortUsers(cohortDefinition, timeRange);
      
      // Calculate retention data for each period
      const retentionData: CohortRetentionData[] = [];
      
      for (let period = 0; period < cohortDefinition.timeframe.periods; period++) {
        const periodStart = this.calculatePeriodStart(
          timeRange.start,
          period,
          cohortDefinition.timeframe.unit
        );
        const periodEnd = this.calculatePeriodEnd(
          periodStart,
          cohortDefinition.timeframe.unit
        );

        // Count users active in this period
        const activeUsersInPeriod = await this.getActiveUsersInPeriod(
          cohortUsers,
          periodStart,
          periodEnd
        );

        const retentionRate = cohortUsers.length > 0 ? 
          activeUsersInPeriod.length / cohortUsers.length : 0;

        retentionData.push({
          period,
          userCount: activeUsersInPeriod.length,
          retentionRate
        });
      }

      const analysis: CohortAnalysis = {
        cohortName: cohortDefinition.name,
        cohortSize: cohortUsers.length,
        timeframe: cohortDefinition.timeframe,
        retentionData
      };

      // Track cohort analysis
      await productAnalyticsService.trackEvent(
        'system',
        'Cohort Analysis Completed',
        {
          cohort_name: cohortDefinition.name,
          cohort_size: cohortUsers.length,
          retention_periods: cohortDefinition.timeframe.periods
        }
      );

      return analysis;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'analyze_cohort',
        cohortName: cohortDefinition.name
      });
      throw error;
    }
  }

  /**
   * Analyze user journeys
   */
  async analyzeUserJourneys(
    timeRange: { start: Date; end: Date },
    segmentCriteria?: EventCondition[]
  ): Promise<UserJourney[]> {
    try {
      // Get user sessions in time range
      const sessions = await this.getUserSessions(timeRange, segmentCriteria);
      
      const journeys: UserJourney[] = [];

      for (const session of sessions) {
        // Get all touchpoints for this session
        const touchpoints = await this.getSessionTouchpoints(session.sessionId, timeRange);
        
        if (touchpoints.length === 0) continue;

        // Calculate total duration
        const totalDuration = session.endTime ? 
          session.endTime.getTime() - session.startTime.getTime() : 0;

        // Identify conversion path
        const conversionPath = touchpoints
          .filter(tp => tp.type === 'conversion')
          .map(tp => tp.name);

        // Identify drop-off point
        const dropOffPoint = await this.identifyDropOffPoint(touchpoints);

        journeys.push({
          userId: session.userId,
          sessionId: session.sessionId,
          touchpoints,
          totalDuration,
          conversionPath,
          dropOffPoint
        });
      }

      // Track journey analysis
      await productAnalyticsService.trackEvent(
        'system',
        'User Journey Analysis Completed',
        {
          session_count: sessions.length,
          journey_count: journeys.length,
          avg_touchpoints: journeys.reduce((sum, j) => sum + j.touchpoints.length, 0) / journeys.length,
          conversion_rate: journeys.filter(j => j.conversionPath.length > 0).length / journeys.length
        }
      );

      return journeys;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'analyze_user_journeys'
      });
      throw error;
    }
  }

  /**
   * Get feature adoption rates
   */
  async getFeatureAdoptionRates(
    features: string[],
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, number>> {
    try {
      const adoptionRates: Record<string, number> = {};

      // Get total active users in time range
      const totalActiveUsers = await this.prisma.$queryRaw`
        SELECT COUNT(DISTINCT user_id) as count
        FROM analytics_events
        WHERE created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
      ` as any[];

      const totalUsers = Number(totalActiveUsers[0]?.count || 0);

      // Calculate adoption rate for each feature
      for (const feature of features) {
        const featureUsers = await this.prisma.$queryRaw`
          SELECT COUNT(DISTINCT user_id) as count
          FROM analytics_events
          WHERE event_name = 'Feature Engagement'
            AND properties->>'feature' = ${feature}
            AND created_at >= ${timeRange.start}
            AND created_at <= ${timeRange.end}
        ` as any[];

        const userCount = Number(featureUsers[0]?.count || 0);
        adoptionRates[feature] = totalUsers > 0 ? userCount / totalUsers : 0;
      }

      return adoptionRates;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'get_feature_adoption_rates',
        features
      });
      throw error;
    }
  }

  /**
   * Create user segment
   */
  async createUserSegment(
    name: string,
    description: string,
    criteria: EventCondition[]
  ): Promise<string> {
    try {
      const segmentId = crypto.randomUUID();
      
      // Get users matching criteria
      const users = await this.getUsersMatchingCriteria(criteria);
      
      // Calculate segment metrics
      const avgLifetimeValue = await this.calculateAvgLifetimeValue(users);
      const conversionRate = await this.calculateSegmentConversionRate(users);
      const churnRate = await this.calculateSegmentChurnRate(users);

      const segment: UserSegment = {
        id: segmentId,
        name,
        description,
        criteria,
        userCount: users.length,
        avgLifetimeValue,
        conversionRate,
        churnRate
      };

      this.activeSegments.set(segmentId, segment);

      // Store segment in database
      await this.storeUserSegment(segment);

      // Track segment creation
      await productAnalyticsService.trackEvent(
        'system',
        'User Segment Created',
        {
          segment_id: segmentId,
          segment_name: name,
          user_count: users.length,
          criteria_count: criteria.length
        }
      );

      return segmentId;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'create_user_segment',
        name
      });
      throw error;
    }
  }

  /**
   * Get user behavior patterns
   */
  async getUserBehaviorPatterns(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<any> {
    try {
      // Get user events
      const events = await this.prisma.$queryRaw`
        SELECT 
          event_name,
          properties,
          created_at,
          context
        FROM analytics_events
        WHERE user_id = ${userId}
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        ORDER BY created_at ASC
      ` as any[];

      // Analyze patterns
      const patterns = {
        totalEvents: events.length,
        uniqueEvents: new Set(events.map((e: any) => e.event_name)).size,
        sessionCount: await this.getUserSessionCount(userId, timeRange),
        avgSessionDuration: await this.getAvgSessionDuration(userId, timeRange),
        mostUsedFeatures: await this.getMostUsedFeatures(userId, timeRange),
        conversionEvents: events.filter((e: any) => e.event_name === 'Conversion').length,
        lastActivity: events.length > 0 ? events[events.length - 1].created_at : null,
        activityTimeline: await this.getActivityTimeline(userId, timeRange),
        engagement_score: await this.calculateEngagementScore(userId, timeRange)
      };

      return patterns;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'get_user_behavior_patterns',
        userId
      });
      throw error;
    }
  }

  // Private helper methods

  private async getFunnelUsers(
    funnel: FunnelDefinition,
    timeRange: { start: Date; end: Date },
    segmentCriteria?: EventCondition[]
  ): Promise<string[]> {
    // Get users who entered the first step of the funnel
    const firstStep = funnel.steps[0];
    let query = `
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE event_name = $1
        AND created_at >= $2
        AND created_at <= $3
    `;
    
    const params = [firstStep.eventName, timeRange.start, timeRange.end];
    
    // Apply segment criteria if provided
    if (segmentCriteria && segmentCriteria.length > 0) {
      // Add segment filtering logic
      // This would need to be implemented based on specific criteria structure
    }

    const results = await this.prisma.$queryRawUnsafe(query, ...params) as any[];
    return results.map((r: any) => r.user_id);
  }

  private async getStepUsers(
    funnel: FunnelDefinition,
    step: any,
    timeRange: { start: Date; end: Date },
    funnelUsers: string[]
  ): Promise<string[]> {
    if (funnelUsers.length === 0) return [];

    let query = `
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE event_name = $1
        AND user_id = ANY($2::uuid[])
        AND created_at >= $3
        AND created_at <= $4
    `;

    // Apply step conditions if any
    if (step.conditions && step.conditions.length > 0) {
      // Add condition filtering logic
    }

    const results = await this.prisma.$queryRawUnsafe(
      query,
      step.eventName,
      funnelUsers,
      timeRange.start,
      timeRange.end
    ) as any[];

    return results.map((r: any) => r.user_id);
  }

  private async calculateAvgTimeBetweenSteps(
    funnel: FunnelDefinition,
    prevStepOrder: number,
    currentStepOrder: number,
    timeRange: { start: Date; end: Date },
    stepUsers: string[]
  ): Promise<number> {
    if (prevStepOrder < 1 || stepUsers.length === 0) return 0;

    const prevStep = funnel.steps.find(s => s.order === prevStepOrder);
    const currentStep = funnel.steps.find(s => s.order === currentStepOrder);

    if (!prevStep || !currentStep) return 0;

    // Calculate average time between steps for users who completed both
    const durations = await this.prisma.$queryRaw`
      WITH step_times AS (
        SELECT 
          user_id,
          MIN(CASE WHEN event_name = ${prevStep.eventName} THEN created_at END) as prev_step_time,
          MIN(CASE WHEN event_name = ${currentStep.eventName} THEN created_at END) as current_step_time
        FROM analytics_events
        WHERE user_id = ANY(${stepUsers}::uuid[])
          AND event_name IN (${prevStep.eventName}, ${currentStep.eventName})
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        GROUP BY user_id
        HAVING MIN(CASE WHEN event_name = ${prevStep.eventName} THEN created_at END) IS NOT NULL
           AND MIN(CASE WHEN event_name = ${currentStep.eventName} THEN created_at END) IS NOT NULL
      )
      SELECT AVG(EXTRACT(EPOCH FROM (current_step_time - prev_step_time)) * 1000) as avg_duration_ms
      FROM step_times
      WHERE current_step_time > prev_step_time
    ` as any[];

    return Number(durations[0]?.avg_duration_ms || 0);
  }

  private async calculateAverageTimeToConvert(
    funnel: FunnelDefinition,
    timeRange: { start: Date; end: Date },
    funnelUsers: string[]
  ): Promise<number> {
    const firstStep = funnel.steps[0];
    const lastStep = funnel.steps[funnel.steps.length - 1];

    const durations = await this.prisma.$queryRaw`
      WITH conversion_times AS (
        SELECT 
          user_id,
          MIN(CASE WHEN event_name = ${firstStep.eventName} THEN created_at END) as start_time,
          MIN(CASE WHEN event_name = ${lastStep.eventName} THEN created_at END) as end_time
        FROM analytics_events
        WHERE user_id = ANY(${funnelUsers}::uuid[])
          AND event_name IN (${firstStep.eventName}, ${lastStep.eventName})
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
        GROUP BY user_id
        HAVING MIN(CASE WHEN event_name = ${firstStep.eventName} THEN created_at END) IS NOT NULL
           AND MIN(CASE WHEN event_name = ${lastStep.eventName} THEN created_at END) IS NOT NULL
      )
      SELECT AVG(EXTRACT(EPOCH FROM (end_time - start_time)) * 1000) as avg_duration_ms
      FROM conversion_times
      WHERE end_time > start_time
    ` as any[];

    return Number(durations[0]?.avg_duration_ms || 0);
  }

  private async getCohortUsers(
    cohortDefinition: CohortDefinition,
    timeRange: { start: Date; end: Date }
  ): Promise<string[]> {
    // This would implement the logic to find users matching cohort criteria
    // For now, return a simple query based on event name if specified
    if (cohortDefinition.criteria.eventName) {
      const results = await this.prisma.$queryRaw`
        SELECT DISTINCT user_id
        FROM analytics_events
        WHERE event_name = ${cohortDefinition.criteria.eventName}
          AND created_at >= ${timeRange.start}
          AND created_at <= ${timeRange.end}
      ` as any[];
      
      return results.map((r: any) => r.user_id);
    }
    
    return [];
  }

  private calculatePeriodStart(baseDate: Date, period: number, unit: string): Date {
    const date = new Date(baseDate);
    switch (unit) {
      case 'day':
        date.setDate(date.getDate() + period);
        break;
      case 'week':
        date.setDate(date.getDate() + (period * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() + period);
        break;
    }
    return date;
  }

  private calculatePeriodEnd(startDate: Date, unit: string): Date {
    const date = new Date(startDate);
    switch (unit) {
      case 'day':
        date.setDate(date.getDate() + 1);
        break;
      case 'week':
        date.setDate(date.getDate() + 7);
        break;
      case 'month':
        date.setMonth(date.getMonth() + 1);
        break;
    }
    return date;
  }

  private async getActiveUsersInPeriod(
    cohortUsers: string[],
    periodStart: Date,
    periodEnd: Date
  ): Promise<string[]> {
    if (cohortUsers.length === 0) return [];

    const results = await this.prisma.$queryRaw`
      SELECT DISTINCT user_id
      FROM analytics_events
      WHERE user_id = ANY(${cohortUsers}::uuid[])
        AND created_at >= ${periodStart}
        AND created_at < ${periodEnd}
    ` as any[];

    return results.map((r: any) => r.user_id);
  }

  private async getUserSessions(
    timeRange: { start: Date; end: Date },
    segmentCriteria?: EventCondition[]
  ): Promise<UserSession[]> {
    // Simplified session extraction - would need more sophisticated logic
    const sessions = await this.prisma.$queryRaw`
      SELECT DISTINCT
        context->>'sessionId' as session_id,
        user_id,
        MIN(created_at) as start_time,
        MAX(created_at) as end_time,
        COUNT(CASE WHEN event_name = 'Page Viewed' THEN 1 END) as page_views,
        COUNT(*) as events,
        COUNT(CASE WHEN event_name = 'Conversion' THEN 1 END) as conversion_events
      FROM analytics_events
      WHERE created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
      GROUP BY context->>'sessionId', user_id
      HAVING COUNT(*) > 1
    ` as any[];

    return sessions.map((s: any) => ({
      sessionId: s.session_id,
      userId: s.user_id,
      startTime: s.start_time,
      endTime: s.end_time,
      pageViews: Number(s.page_views),
      events: Number(s.events),
      conversionEvents: Number(s.conversion_events),
      deviceType: 'unknown', // Would extract from context
      browser: 'unknown', // Would extract from context
      bounced: Number(s.page_views) <= 1
    }));
  }

  private async getSessionTouchpoints(
    sessionId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<TouchPoint[]> {
    const events = await this.prisma.$queryRaw`
      SELECT 
        event_name,
        properties,
        created_at,
        CASE 
          WHEN event_name = 'Page Viewed' THEN 'page_view'
          WHEN event_name = 'Conversion' THEN 'conversion'
          ELSE 'event'
        END as type
      FROM analytics_events
      WHERE context->>'sessionId' = ${sessionId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
      ORDER BY created_at ASC
    ` as any[];

    return events.map((e: any) => ({
      timestamp: e.created_at,
      type: e.type,
      name: e.event_name,
      properties: e.properties || {}
    }));
  }

  private async identifyDropOffPoint(touchpoints: TouchPoint[]): Promise<string | undefined> {
    // Simple heuristic: if last touchpoint is not a conversion, it's a drop-off
    if (touchpoints.length === 0) return undefined;
    
    const lastTouchpoint = touchpoints[touchpoints.length - 1];
    return lastTouchpoint.type !== 'conversion' ? lastTouchpoint.name : undefined;
  }

  private async getUsersMatchingCriteria(criteria: EventCondition[]): Promise<string[]> {
    // Placeholder implementation
    return [];
  }

  private async calculateAvgLifetimeValue(users: string[]): Promise<number> {
    // Placeholder implementation
    return 0;
  }

  private async calculateSegmentConversionRate(users: string[]): Promise<number> {
    // Placeholder implementation
    return 0;
  }

  private async calculateSegmentChurnRate(users: string[]): Promise<number> {
    // Placeholder implementation
    return 0;
  }

  private async storeUserSegment(segment: UserSegment): Promise<void> {
    // Store segment in database
    try {
      await this.prisma.$executeRaw`
        INSERT INTO user_segments (
          id, name, description, criteria, user_count, 
          avg_lifetime_value, conversion_rate, churn_rate
        ) VALUES (
          ${segment.id}, ${segment.name}, ${segment.description},
          ${JSON.stringify(segment.criteria)}, ${segment.userCount},
          ${segment.avgLifetimeValue}, ${segment.conversionRate}, ${segment.churnRate}
        )
      `;
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'store_user_segment' });
    }
  }

  private async getUserSessionCount(userId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    const result = await this.prisma.$queryRaw`
      SELECT COUNT(DISTINCT context->>'sessionId') as count
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
    ` as any[];
    
    return Number(result[0]?.count || 0);
  }

  private async getAvgSessionDuration(userId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    const result = await this.prisma.$queryRaw`
      SELECT AVG(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) * 1000) as avg_duration_ms
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND context->>'sessionId' IS NOT NULL
      GROUP BY context->>'sessionId'
      HAVING COUNT(*) > 1
    ` as any[];
    
    return Number(result[0]?.avg_duration_ms || 0);
  }

  private async getMostUsedFeatures(userId: string, timeRange: { start: Date; end: Date }): Promise<Record<string, number>> {
    const results = await this.prisma.$queryRaw`
      SELECT 
        properties->>'feature' as feature,
        COUNT(*) as usage_count
      FROM analytics_events
      WHERE user_id = ${userId}
        AND event_name = 'Feature Engagement'
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
        AND properties->>'feature' IS NOT NULL
      GROUP BY properties->>'feature'
      ORDER BY usage_count DESC
      LIMIT 10
    ` as any[];
    
    return results.reduce((acc: Record<string, number>, row: any) => {
      if (row.feature) {
        acc[row.feature] = Number(row.usage_count);
      }
      return acc;
    }, {});
  }

  private async getActivityTimeline(userId: string, timeRange: { start: Date; end: Date }): Promise<any[]> {
    const results = await this.prisma.$queryRaw`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as event_count,
        COUNT(DISTINCT event_name) as unique_events
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    ` as any[];
    
    return results.map((row: any) => ({
      date: row.date,
      eventCount: Number(row.event_count),
      uniqueEvents: Number(row.unique_events)
    }));
  }

  private async calculateEngagementScore(userId: string, timeRange: { start: Date; end: Date }): Promise<number> {
    // Simple engagement score calculation
    const metrics = await this.prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE_TRUNC('day', created_at)) as active_days,
        COUNT(DISTINCT event_name) as unique_events,
        COUNT(CASE WHEN event_name = 'Feature Engagement' THEN 1 END) as feature_engagements
      FROM analytics_events
      WHERE user_id = ${userId}
        AND created_at >= ${timeRange.start}
        AND created_at <= ${timeRange.end}
    ` as any[];
    
    const data = metrics[0] || {};
    const totalEvents = Number(data.total_events || 0);
    const activeDays = Number(data.active_days || 0);
    const uniqueEvents = Number(data.unique_events || 0);
    const featureEngagements = Number(data.feature_engagements || 0);
    
    // Weighted engagement score (0-100)
    const score = Math.min(
      (totalEvents * 0.3) +
      (activeDays * 5) +
      (uniqueEvents * 2) +
      (featureEngagements * 1.5),
      100
    );
    
    return Math.round(score);
  }

  /**
   * Get predefined funnels
   */
  getPredefinedFunnels(): FunnelDefinition[] {
    return Array.from(this.predefinedFunnels.values());
  }

  /**
   * Get active segments
   */
  getActiveSegments(): UserSegment[] {
    return Array.from(this.activeSegments.values());
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    try {
      await this.prisma.$disconnect();
      analyticsLogger.event('user_behavior_analytics_shutdown', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'user_behavior_shutdown' });
    }
  }
}

// Export singleton instance
export const userBehaviorAnalyticsService = new UserBehaviorAnalyticsService();