/**
 * Implicit feedback collector for behavioral tracking
 */

import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';
import {
  ImplicitFeedbackEvent,
  ImplicitFeedbackEventSchema,
  ImplicitEventType,
  BusinessMetrics,
  DeviceInfo
} from '../types';
import { EventValidator } from './event-validator';
import { PrivacyManager } from '../privacy/consent-manager';

export class ImplicitFeedbackCollector {
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private redis: Redis;
  private logger: Logger;
  private validator: EventValidator;
  private privacyManager: PrivacyManager;
  private sessionStore: Map<string, SessionData>;
  private eventBuffer: ImplicitFeedbackEvent[];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  constructor(
    kafka: Kafka,
    redis: Redis,
    logger: Logger,
    validator: EventValidator,
    privacyManager: PrivacyManager
  ) {
    this.kafka = kafka;
    this.producer = kafka.producer();
    this.consumer = kafka.consumer({ groupId: 'implicit-feedback-group' });
    this.redis = redis;
    this.logger = logger.child({ component: 'ImplicitCollector' });
    this.validator = validator;
    this.privacyManager = privacyManager;
    this.sessionStore = new Map();
    this.eventBuffer = [];
  }

  /**
   * Initialize the collector
   */
  async initialize(): Promise<void> {
    try {
      await this.producer.connect();
      await this.consumer.connect();
      await this.consumer.subscribe({ 
        topic: 'implicit-feedback-events', 
        fromBeginning: false 
      });

      // Start buffer flush interval
      this.bufferFlushInterval = setInterval(() => {
        this.flushEventBuffer().catch(err => 
          this.logger.error({ err }, 'Failed to flush event buffer')
        );
      }, 5000); // Flush every 5 seconds

      // Start session cleanup
      setInterval(() => {
        this.cleanupSessions();
      }, 60000); // Cleanup every minute

      this.logger.info('Implicit feedback collector initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize implicit collector');
      throw error;
    }
  }

  /**
   * Collect an implicit feedback event
   */
  async collectEvent(eventData: Partial<ImplicitFeedbackEvent>): Promise<string> {
    try {
      // Generate event ID if not provided
      const eventId = eventData.eventId || uuidv4();
      
      // Enrich event with session data
      const enrichedEvent = await this.enrichEvent({
        ...eventData,
        eventId,
        timestamp: eventData.timestamp || new Date()
      });

      // Validate event
      const validatedEvent = await this.validator.validateImplicitEvent(enrichedEvent);

      // Check privacy consent
      const hasConsent = await this.privacyManager.checkConsent(
        validatedEvent.userId || validatedEvent.sessionId,
        'analytics'
      );

      if (!hasConsent) {
        this.logger.debug({ eventId }, 'Event collection blocked due to lack of consent');
        return eventId;
      }

      // Add to buffer for batch processing
      this.eventBuffer.push(validatedEvent);

      // Flush buffer if it's getting large
      if (this.eventBuffer.length >= 100) {
        await this.flushEventBuffer();
      }

      // Update session data
      await this.updateSession(validatedEvent);

      // Track real-time metrics
      await this.trackRealtimeMetrics(validatedEvent);

      this.logger.debug({ eventId }, 'Implicit event collected');
      return eventId;

    } catch (error) {
      this.logger.error({ error, eventData }, 'Failed to collect implicit event');
      throw error;
    }
  }

  /**
   * Batch collect multiple events
   */
  async collectBatch(events: Partial<ImplicitFeedbackEvent>[]): Promise<string[]> {
    const eventIds: string[] = [];
    const validEvents: ImplicitFeedbackEvent[] = [];

    for (const event of events) {
      try {
        const eventId = await this.collectEvent(event);
        eventIds.push(eventId);
      } catch (error) {
        this.logger.error({ error, event }, 'Failed to collect event in batch');
      }
    }

    return eventIds;
  }

  /**
   * Track click event
   */
  async trackClick(
    elementId: string,
    modelType: string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    return this.collectEvent({
      eventType: 'click',
      elementId,
      modelType: modelType as any,
      metadata: metadata as any
    });
  }

  /**
   * Track scroll event
   */
  async trackScroll(
    page: string,
    scrollDepth: number,
    timeOnPage: number
  ): Promise<string> {
    return this.collectEvent({
      eventType: 'scroll',
      elementId: 'page-scroll',
      metadata: {
        page,
        scrollDepth,
        timeOnPage
      } as any
    });
  }

  /**
   * Track conversion event
   */
  async trackConversion(
    conversionType: string,
    value: number,
    modelType: string,
    metadata: Record<string, unknown>
  ): Promise<string> {
    return this.collectEvent({
      eventType: 'conversion',
      elementId: conversionType,
      modelType: modelType as any,
      businessMetrics: {
        conversionValue: value
      },
      metadata: metadata as any
    });
  }

  /**
   * Track page exit
   */
  async trackExit(
    page: string,
    timeOnPage: number,
    exitPoint: string
  ): Promise<string> {
    return this.collectEvent({
      eventType: 'exit',
      elementId: exitPoint,
      metadata: {
        page,
        timeOnPage,
        scrollDepth: 0
      } as any
    });
  }

  /**
   * Enrich event with additional context
   */
  private async enrichEvent(
    event: Partial<ImplicitFeedbackEvent>
  ): Promise<ImplicitFeedbackEvent> {
    const sessionId = event.sessionId || uuidv4();
    const session = await this.getSession(sessionId);

    // Get user journey
    const userJourney = await this.getUserJourney(sessionId);

    // Calculate engagement metrics
    const engagementMetrics = await this.calculateEngagementMetrics(
      sessionId,
      event.eventType as ImplicitEventType
    );

    // Get A/B test context if applicable
    const abTestContext = await this.getABTestContext(
      event.userId || sessionId,
      event.modelType as any
    );

    return {
      ...event,
      sessionId,
      metadata: {
        ...event.metadata,
        previousPages: userJourney.pages,
        clickPath: userJourney.clickPath,
        ...session.metadata
      },
      businessMetrics: {
        ...event.businessMetrics,
        engagementScore: engagementMetrics.score,
        retentionScore: engagementMetrics.retention
      },
      contentVariant: abTestContext || event.contentVariant,
      modelVersion: event.modelVersion || 'default'
    } as ImplicitFeedbackEvent;
  }

  /**
   * Update session data
   */
  private async updateSession(event: ImplicitFeedbackEvent): Promise<void> {
    const session = this.sessionStore.get(event.sessionId) || {
      sessionId: event.sessionId,
      userId: event.userId,
      startTime: new Date(),
      lastActivity: new Date(),
      events: [],
      pages: [],
      metadata: {}
    };

    session.lastActivity = new Date();
    session.events.push({
      type: event.eventType,
      timestamp: event.timestamp,
      elementId: event.elementId
    });

    if (event.metadata.page && !session.pages.includes(event.metadata.page)) {
      session.pages.push(event.metadata.page);
    }

    this.sessionStore.set(event.sessionId, session);

    // Persist to Redis
    await this.redis.setex(
      `session:${event.sessionId}`,
      3600, // 1 hour TTL
      JSON.stringify(session)
    );
  }

  /**
   * Get session data
   */
  private async getSession(sessionId: string): Promise<SessionData> {
    // Check memory cache first
    let session = this.sessionStore.get(sessionId);
    
    if (!session) {
      // Check Redis
      const redisData = await this.redis.get(`session:${sessionId}`);
      if (redisData) {
        session = JSON.parse(redisData);
        this.sessionStore.set(sessionId, session);
      } else {
        // Create new session
        session = {
          sessionId,
          startTime: new Date(),
          lastActivity: new Date(),
          events: [],
          pages: [],
          metadata: {}
        };
        this.sessionStore.set(sessionId, session);
      }
    }

    return session;
  }

  /**
   * Get user journey data
   */
  private async getUserJourney(sessionId: string): Promise<UserJourney> {
    const session = await this.getSession(sessionId);
    
    return {
      pages: session.pages.slice(-10), // Last 10 pages
      clickPath: session.events
        .filter(e => e.type === 'click')
        .slice(-20) // Last 20 clicks
        .map(e => e.elementId),
      duration: Date.now() - new Date(session.startTime).getTime(),
      interactions: session.events.length
    };
  }

  /**
   * Calculate engagement metrics
   */
  private async calculateEngagementMetrics(
    sessionId: string,
    eventType: ImplicitEventType
  ): Promise<EngagementMetrics> {
    const session = await this.getSession(sessionId);
    
    // Calculate engagement score based on various factors
    let score = 0;
    
    // Time-based engagement
    const sessionDuration = Date.now() - new Date(session.startTime).getTime();
    score += Math.min(sessionDuration / 60000, 10) * 10; // Max 100 points for 10+ minutes
    
    // Interaction-based engagement
    score += Math.min(session.events.length, 20) * 5; // Max 100 points for 20+ events
    
    // Page depth engagement
    score += Math.min(session.pages.length, 10) * 10; // Max 100 points for 10+ pages
    
    // Event type weights
    const eventWeights: Record<ImplicitEventType, number> = {
      conversion: 50,
      download: 30,
      copy: 20,
      click: 10,
      engagement: 15,
      scroll: 5,
      hover: 2,
      pageview: 3,
      exit: -10,
      bounce: -20
    };
    
    score += eventWeights[eventType] || 0;
    
    // Normalize score to 0-100
    score = Math.max(0, Math.min(100, score / 3));
    
    // Calculate retention score (requires historical data)
    const retentionScore = await this.calculateRetentionScore(session.userId || sessionId);
    
    return {
      score,
      retention: retentionScore,
      depth: session.pages.length,
      duration: sessionDuration,
      interactions: session.events.length
    };
  }

  /**
   * Calculate retention score
   */
  private async calculateRetentionScore(userId: string): Promise<number> {
    // Get user's historical sessions
    const sessions = await this.redis.keys(`session:*:${userId}`);
    
    if (sessions.length === 0) {
      return 50; // Default score for new users
    }
    
    // Calculate based on session frequency and recency
    const now = Date.now();
    let recentSessions = 0;
    let totalScore = 0;
    
    for (const key of sessions.slice(-30)) { // Last 30 sessions
      const sessionData = await this.redis.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData);
        const age = now - new Date(session.lastActivity).getTime();
        const ageInDays = age / (1000 * 60 * 60 * 24);
        
        if (ageInDays < 7) recentSessions++;
        
        // Score based on recency (exponential decay)
        totalScore += Math.exp(-ageInDays / 30) * 100;
      }
    }
    
    // Average score with recency bonus
    const avgScore = totalScore / Math.max(sessions.length, 1);
    const recencyBonus = (recentSessions / 7) * 20; // Up to 20 bonus points
    
    return Math.min(100, avgScore + recencyBonus);
  }

  /**
   * Get A/B test context
   */
  private async getABTestContext(
    userId: string,
    modelType: string
  ): Promise<any> {
    // Check if user is in an A/B test
    const testKey = `abtest:${modelType}:${userId}`;
    const testData = await this.redis.get(testKey);
    
    if (testData) {
      return JSON.parse(testData);
    }
    
    // Default variant
    return {
      variantId: 'control',
      variantName: 'Control',
      testId: 'default',
      testName: 'Default',
      controlGroup: true,
      allocation: 1.0
    };
  }

  /**
   * Track real-time metrics
   */
  private async trackRealtimeMetrics(event: ImplicitFeedbackEvent): Promise<void> {
    const metricsKey = `metrics:realtime:${event.modelType}`;
    const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    
    // Increment counters
    await this.redis.hincrby(metricsKey, 'total_events', 1);
    await this.redis.hincrby(metricsKey, `event_${event.eventType}`, 1);
    
    // Track unique users (using HyperLogLog)
    await this.redis.pfadd(
      `${metricsKey}:unique_users`,
      event.userId || event.sessionId
    );
    
    // Track time series data
    await this.redis.zadd(
      `${metricsKey}:timeseries`,
      timestamp,
      JSON.stringify({
        type: event.eventType,
        timestamp,
        value: event.businessMetrics?.conversionValue || 1
      })
    );
    
    // Set expiry (24 hours for real-time metrics)
    await this.redis.expire(metricsKey, 86400);
    await this.redis.expire(`${metricsKey}:unique_users`, 86400);
    await this.redis.expire(`${metricsKey}:timeseries`, 86400);
  }

  /**
   * Flush event buffer to Kafka
   */
  private async flushEventBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      const messages = events.map(event => ({
        key: event.sessionId,
        value: JSON.stringify(event),
        headers: {
          modelType: event.modelType,
          eventType: event.eventType,
          timestamp: event.timestamp.toISOString()
        }
      }));

      await this.producer.send({
        topic: 'implicit-feedback-events',
        messages
      });

      this.logger.debug({ count: events.length }, 'Flushed events to Kafka');
    } catch (error) {
      this.logger.error({ error }, 'Failed to flush events to Kafka');
      // Re-add events to buffer for retry
      this.eventBuffer.unshift(...events);
    }
  }

  /**
   * Cleanup old sessions
   */
  private cleanupSessions(): void {
    const now = Date.now();
    const maxAge = 3600000; // 1 hour

    for (const [sessionId, session] of this.sessionStore.entries()) {
      const age = now - new Date(session.lastActivity).getTime();
      if (age > maxAge) {
        this.sessionStore.delete(sessionId);
      }
    }
  }

  /**
   * Shutdown the collector
   */
  async shutdown(): Promise<void> {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
    }

    await this.flushEventBuffer();
    await this.producer.disconnect();
    await this.consumer.disconnect();
    
    this.logger.info('Implicit feedback collector shut down');
  }
}

// Helper interfaces
interface SessionData {
  sessionId: string;
  userId?: string;
  startTime: Date;
  lastActivity: Date;
  events: Array<{
    type: string;
    timestamp: Date;
    elementId: string;
  }>;
  pages: string[];
  metadata: Record<string, unknown>;
}

interface UserJourney {
  pages: string[];
  clickPath: string[];
  duration: number;
  interactions: number;
}

interface EngagementMetrics {
  score: number;
  retention: number;
  depth: number;
  duration: number;
  interactions: number;
}