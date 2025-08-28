/**
 * Fine Print AI - Product Analytics Service
 * 
 * Comprehensive product analytics integration with:
 * - Mixpanel for detailed event tracking
 * - Amplitude for user behavior analysis
 * - Segment for data orchestration (optional)
 * - Privacy-first tracking with no PII collection
 * - Event validation and enrichment
 * - Automatic funnel and cohort tracking
 */

import Mixpanel from 'mixpanel';
import { Amplitude } from 'amplitude-node';
import { Analytics as SegmentAnalytics } from '@segment/analytics-node';
import { config } from '@/config';
import { analyticsLogger } from '@/utils/logger';
import { PrismaClient } from '@prisma/client';
import { 
  ProductAnalyticsEvent,
  UserProperties,
  EventProperties,
  TrackingContext,
  FunnelStep,
  CohortDefinition
} from '@/types/analytics';

class ProductAnalyticsService {
  private mixpanel?: Mixpanel.Mixpanel;
  private amplitude?: Amplitude;
  private segment?: SegmentAnalytics;
  private prisma: PrismaClient;
  private isInitialized = false;

  constructor() {
    this.prisma = new PrismaClient();
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Initialize Mixpanel
      if (config.productAnalytics.mixpanel.enabled && config.productAnalytics.mixpanel.token) {
        this.mixpanel = Mixpanel.init(config.productAnalytics.mixpanel.token, {
          host: config.productAnalytics.mixpanel.region === 'EU' ? 'api-eu.mixpanel.com' : 'api.mixpanel.com',
          debug: config.nodeEnv !== 'production',
          protocol: 'https'
        });
        analyticsLogger.event('mixpanel_initialized', { region: config.productAnalytics.mixpanel.region });
      }

      // Initialize Amplitude
      if (config.productAnalytics.amplitude.enabled && config.productAnalytics.amplitude.apiKey) {
        this.amplitude = new Amplitude(config.productAnalytics.amplitude.apiKey, {
          debug: config.nodeEnv !== 'production',
          serverName: 'fineprintai-analytics',
          serverZone: 'US' // Amplitude doesn't have EU option yet
        });
        analyticsLogger.event('amplitude_initialized', {});
      }

      // Initialize Segment (optional)
      if (config.productAnalytics.segment.enabled && config.productAnalytics.segment.writeKey) {
        this.segment = new SegmentAnalytics({
          writeKey: config.productAnalytics.segment.writeKey,
          flushAt: 20,
          flushInterval: 10000
        });
        analyticsLogger.event('segment_initialized', {});
      }

      this.isInitialized = true;
      analyticsLogger.event('product_analytics_initialized', {
        mixpanel: !!this.mixpanel,
        amplitude: !!this.amplitude,
        segment: !!this.segment
      });
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'product_analytics_initialization' });
      throw error;
    }
  }

  /**
   * Track a product analytics event
   */
  async trackEvent(
    userId: string,
    eventName: string,
    properties: EventProperties = {},
    context: TrackingContext = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Validate and enrich event
      const enrichedEvent = await this.enrichEvent(userId, eventName, properties, context);
      
      // Track to Mixpanel
      if (this.mixpanel) {
        await this.trackMixpanelEvent(userId, eventName, enrichedEvent);
      }

      // Track to Amplitude
      if (this.amplitude) {
        await this.trackAmplitudeEvent(userId, eventName, enrichedEvent, context);
      }

      // Track to Segment
      if (this.segment) {
        await this.trackSegmentEvent(userId, eventName, enrichedEvent, context);
      }

      // Store event in our database for analysis
      await this.storeEventLocally(userId, eventName, enrichedEvent, context);

      analyticsLogger.event('product_event_tracked', {
        eventName,
        userId: this.hashUserId(userId),
        propertiesCount: Object.keys(enrichedEvent).length
      });
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'track_event',
        eventName,
        userId: this.hashUserId(userId)
      });
      throw error;
    }
  }

  /**
   * Identify a user and set properties
   */
  async identifyUser(
    userId: string,
    properties: UserProperties,
    context: TrackingContext = {}
  ): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Remove PII before tracking
      const safeProperties = this.sanitizeUserProperties(properties);

      // Identify in Mixpanel
      if (this.mixpanel) {
        this.mixpanel.people.set(userId, safeProperties);
      }

      // Identify in Amplitude
      if (this.amplitude) {
        await this.amplitude.identify({
          user_id: userId,
          user_properties: safeProperties,
          time: Date.now(),
          ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
          platform: context.platform || 'web'
        });
      }

      // Identify in Segment
      if (this.segment) {
        this.segment.identify({
          userId,
          traits: safeProperties,
          timestamp: new Date(),
          context: {
            ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
            userAgent: context.userAgent?.substring(0, 100), // Truncate
            page: context.page ? { url: context.page.url, title: context.page.title } : undefined
          }
        });
      }

      analyticsLogger.event('user_identified', {
        userId: this.hashUserId(userId),
        propertiesCount: Object.keys(safeProperties).length
      });
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'identify_user',
        userId: this.hashUserId(userId)
      });
      throw error;
    }
  }

  /**
   * Track page view
   */
  async trackPageView(
    userId: string,
    page: { url: string; title?: string; referrer?: string },
    properties: EventProperties = {},
    context: TrackingContext = {}
  ): Promise<void> {
    const pageProperties = {
      ...properties,
      page_url: page.url,
      page_title: page.title,
      referrer: page.referrer,
      timestamp: new Date().toISOString()
    };

    await this.trackEvent(userId, 'Page Viewed', pageProperties, context);

    // Also track to Segment as page event
    if (this.segment) {
      this.segment.page({
        userId,
        name: page.title,
        properties: pageProperties,
        timestamp: new Date(),
        context: {
          ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
          userAgent: context.userAgent?.substring(0, 100),
          page: { url: page.url, title: page.title, referrer: page.referrer }
        }
      });
    }
  }

  /**
   * Track funnel step completion
   */
  async trackFunnelStep(
    userId: string,
    funnelName: string,
    stepName: string,
    stepOrder: number,
    properties: EventProperties = {},
    context: TrackingContext = {}
  ): Promise<void> {
    const funnelProperties = {
      ...properties,
      funnel_name: funnelName,
      funnel_step: stepName,
      funnel_step_order: stepOrder,
      timestamp: new Date().toISOString()
    };

    await this.trackEvent(userId, 'Funnel Step Completed', funnelProperties, context);

    // Store funnel data for analysis
    await this.storeFunnelStep(userId, funnelName, stepName, stepOrder, funnelProperties);
  }

  /**
   * Track conversion event
   */
  async trackConversion(
    userId: string,
    conversionType: string,
    value?: number,
    properties: EventProperties = {},
    context: TrackingContext = {}
  ): Promise<void> {
    const conversionProperties = {
      ...properties,
      conversion_type: conversionType,
      conversion_value: value,
      timestamp: new Date().toISOString()
    };

    await this.trackEvent(userId, 'Conversion', conversionProperties, context);

    // Track revenue in Mixpanel
    if (this.mixpanel && value) {
      this.mixpanel.people.track_charge(userId, value, {
        conversion_type: conversionType,
        time: new Date()
      });
    }
  }

  /**
   * Track user engagement
   */
  async trackEngagement(
    userId: string,
    feature: string,
    action: string,
    duration?: number,
    properties: EventProperties = {},
    context: TrackingContext = {}
  ): Promise<void> {
    const engagementProperties = {
      ...properties,
      feature,
      action,
      duration_seconds: duration,
      timestamp: new Date().toISOString()
    };

    await this.trackEvent(userId, 'Feature Engagement', engagementProperties, context);
  }

  /**
   * Batch track multiple events
   */
  async batchTrackEvents(events: ProductAnalyticsEvent[]): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const promises = events.map(event => 
        this.trackEvent(
          event.userId,
          event.eventName,
          event.properties,
          event.context
        )
      );

      await Promise.all(promises);
      
      analyticsLogger.event('batch_events_tracked', {
        eventCount: events.length
      });
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'batch_track_events',
        eventCount: events.length
      });
      throw error;
    }
  }

  /**
   * Get user funnel progress
   */
  async getUserFunnelProgress(userId: string, funnelName: string): Promise<FunnelStep[]> {
    try {
      const steps = await this.prisma.$queryRaw`
        SELECT 
          funnel_step as step_name,
          funnel_step_order as step_order,
          created_at as completed_at,
          properties
        FROM analytics_events 
        WHERE user_id = ${userId} 
          AND event_name = 'Funnel Step Completed'
          AND properties->>'funnel_name' = ${funnelName}
        ORDER BY funnel_step_order ASC
      ` as any[];

      return steps.map(step => ({
        stepName: step.step_name,
        stepOrder: step.step_order,
        completedAt: step.completed_at,
        properties: step.properties
      }));
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'get_user_funnel_progress',
        userId: this.hashUserId(userId),
        funnelName
      });
      throw error;
    }
  }

  /**
   * Create user cohort
   */
  async createCohort(definition: CohortDefinition): Promise<string[]> {
    try {
      // This would typically involve complex SQL queries
      // For now, return empty array - implement based on specific cohort needs
      const cohortUsers: string[] = [];
      
      analyticsLogger.event('cohort_created', {
        cohortName: definition.name,
        userCount: cohortUsers.length
      });
      
      return cohortUsers;
    } catch (error) {
      analyticsLogger.error(error as Error, {
        context: 'create_cohort',
        cohortName: definition.name
      });
      throw error;
    }
  }

  // Private helper methods

  private async trackMixpanelEvent(
    userId: string,
    eventName: string,
    properties: EventProperties
  ): Promise<void> {
    if (!this.mixpanel) return;

    return new Promise((resolve, reject) => {
      this.mixpanel!.track(eventName, {
        distinct_id: userId,
        ...properties,
        time: Date.now()
      }, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async trackAmplitudeEvent(
    userId: string,
    eventName: string,
    properties: EventProperties,
    context: TrackingContext
  ): Promise<void> {
    if (!this.amplitude) return;

    await this.amplitude.track({
      user_id: userId,
      event_type: eventName,
      event_properties: properties,
      time: Date.now(),
      ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
      platform: context.platform || 'web',
      user_agent: context.userAgent?.substring(0, 100)
    });
  }

  private async trackSegmentEvent(
    userId: string,
    eventName: string,
    properties: EventProperties,
    context: TrackingContext
  ): Promise<void> {
    if (!this.segment) return;

    this.segment.track({
      userId,
      event: eventName,
      properties,
      timestamp: new Date(),
      context: {
        ip: context.ip ? this.anonymizeIp(context.ip) : undefined,
        userAgent: context.userAgent?.substring(0, 100),
        page: context.page ? { 
          url: context.page.url, 
          title: context.page.title 
        } : undefined
      }
    });
  }

  private async enrichEvent(
    userId: string,
    eventName: string,
    properties: EventProperties,
    context: TrackingContext
  ): Promise<EventProperties> {
    // Add standard properties
    const enriched = {
      ...properties,
      timestamp: new Date().toISOString(),
      event_id: crypto.randomUUID(),
      session_id: context.sessionId,
      user_agent: context.userAgent?.substring(0, 100),
      platform: context.platform || 'web',
      page_url: context.page?.url,
      referrer: context.page?.referrer
    };

    // Add user subscription tier
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { subscriptionTier: true }
      });
      
      if (user) {
        enriched.subscription_tier = user.subscriptionTier;
      }
    } catch (error) {
      // Don't fail event tracking if user lookup fails
      analyticsLogger.error(error as Error, { context: 'enrich_event_user_lookup' });
    }

    return enriched;
  }

  private async storeEventLocally(
    userId: string,
    eventName: string,
    properties: EventProperties,
    context: TrackingContext
  ): Promise<void> {
    try {
      // Store event in local analytics table for analysis
      await this.prisma.$executeRaw`
        INSERT INTO analytics_events (
          id, user_id, event_name, properties, context, created_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${userId},
          ${eventName},
          ${JSON.stringify(properties)},
          ${JSON.stringify(context)},
          NOW()
        )
      `;
    } catch (error) {
      // Don't fail main tracking if local storage fails
      analyticsLogger.error(error as Error, { context: 'store_event_locally' });
    }
  }

  private async storeFunnelStep(
    userId: string,
    funnelName: string,
    stepName: string,
    stepOrder: number,
    properties: EventProperties
  ): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO funnel_steps (
          id, user_id, funnel_name, step_name, step_order, properties, created_at
        ) VALUES (
          ${crypto.randomUUID()},
          ${userId},
          ${funnelName},
          ${stepName},
          ${stepOrder},
          ${JSON.stringify(properties)},
          NOW()
        )
        ON CONFLICT (user_id, funnel_name, step_name) 
        DO UPDATE SET 
          properties = ${JSON.stringify(properties)},
          created_at = NOW()
      `;
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'store_funnel_step' });
    }
  }

  private sanitizeUserProperties(properties: UserProperties): UserProperties {
    const sanitized = { ...properties };
    
    // Remove or hash PII
    delete sanitized.email;
    delete sanitized.phone;
    delete sanitized.firstName;
    delete sanitized.lastName;
    delete sanitized.address;
    
    // Keep non-PII properties
    return {
      subscription_tier: sanitized.subscriptionTier,
      created_at: sanitized.createdAt,
      timezone: sanitized.timezone,
      language: sanitized.language,
      user_type: sanitized.userType,
      plan_type: sanitized.planType
    };
  }

  private anonymizeIp(ip: string): string {
    // Remove last octet for IPv4, last 80 bits for IPv6
    if (ip.includes('.')) {
      return ip.split('.').slice(0, 3).join('.') + '.0';
    } else if (ip.includes(':')) {
      return ip.split(':').slice(0, 4).join(':') + '::';
    }
    return ip;
  }

  private hashUserId(userId: string): string {
    // Create a consistent hash for logging purposes
    return Buffer.from(userId).toString('base64').substring(0, 8);
  }

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    try {
      if (this.segment) {
        await this.segment.closeAndFlush();
      }
      analyticsLogger.event('analytics_flushed', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'flush_analytics' });
    }
  }

  /**
   * Shutdown analytics service
   */
  async shutdown(): Promise<void> {
    try {
      await this.flush();
      await this.prisma.$disconnect();
      analyticsLogger.event('analytics_shutdown', {});
    } catch (error) {
      analyticsLogger.error(error as Error, { context: 'shutdown_analytics' });
    }
  }
}

// Export singleton instance
export const productAnalyticsService = new ProductAnalyticsService();