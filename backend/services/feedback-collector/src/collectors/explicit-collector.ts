/**
 * Explicit feedback collector for direct user feedback
 */

import { v4 as uuidv4 } from 'uuid';
import { Redis } from 'ioredis';
import { Logger } from 'pino';
import { Kafka, Producer } from 'kafkajs';
import * as natural from 'natural';
import {
  ExplicitFeedbackEvent,
  ExplicitFeedbackEventSchema,
  ExplicitFeedbackType,
  IssueType,
  SentimentResult
} from '../types';
import { EventValidator } from './event-validator';
import { PrivacyManager } from '../privacy/consent-manager';

export class ExplicitFeedbackCollector {
  private kafka: Kafka;
  private producer: Producer;
  private redis: Redis;
  private logger: Logger;
  private validator: EventValidator;
  private privacyManager: PrivacyManager;
  private sentimentAnalyzer: natural.SentimentAnalyzer;
  private tokenizer: natural.WordTokenizer;
  private tfidf: natural.TfIdf;

  constructor(
    kafka: Kafka,
    redis: Redis,
    logger: Logger,
    validator: EventValidator,
    privacyManager: PrivacyManager
  ) {
    this.kafka = kafka;
    this.producer = kafka.producer();
    this.redis = redis;
    this.logger = logger.child({ component: 'ExplicitCollector' });
    this.validator = validator;
    this.privacyManager = privacyManager;
    
    // Initialize NLP tools
    this.sentimentAnalyzer = new natural.SentimentAnalyzer('English', natural.PorterStemmer, 'afinn');
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
  }

  /**
   * Initialize the collector
   */
  async initialize(): Promise<void> {
    try {
      await this.producer.connect();
      
      // Load custom sentiment lexicon if available
      await this.loadCustomLexicon();
      
      this.logger.info('Explicit feedback collector initialized');
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize explicit collector');
      throw error;
    }
  }

  /**
   * Collect rating feedback
   */
  async collectRating(
    contentId: string,
    rating: number,
    modelType: string,
    userId?: string,
    comment?: string
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      // Analyze sentiment if comment provided
      let sentiment: number | undefined;
      if (comment) {
        const sentimentResult = await this.analyzeSentiment(comment);
        sentiment = sentimentResult.overall;
      }

      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'rating',
        rating,
        comment,
        sentiment,
        metadata: await this.collectMetadata()
      };

      await this.processFeedback(feedback);
      
      // Track rating metrics
      await this.trackRatingMetrics(modelType, rating);
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to collect rating');
      throw error;
    }
  }

  /**
   * Collect thumbs feedback
   */
  async collectThumbs(
    contentId: string,
    thumbsUp: boolean,
    modelType: string,
    userId?: string
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'thumbs',
        thumbsUp,
        sentiment: thumbsUp ? 1 : -1,
        metadata: await this.collectMetadata()
      };

      await this.processFeedback(feedback);
      
      // Track thumbs metrics
      await this.trackThumbsMetrics(modelType, thumbsUp);
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to collect thumbs feedback');
      throw error;
    }
  }

  /**
   * Collect comment feedback
   */
  async collectComment(
    contentId: string,
    comment: string,
    modelType: string,
    userId?: string
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      // Analyze sentiment
      const sentimentResult = await this.analyzeSentiment(comment);
      
      // Detect issue type if applicable
      const issueType = await this.detectIssueType(comment);
      
      // Extract actionable insights
      const insights = await this.extractInsights(comment);

      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'comment',
        comment,
        sentiment: sentimentResult.overall,
        issueType,
        metadata: {
          ...await this.collectMetadata(),
          sentimentDetails: sentimentResult,
          insights
        }
      };

      await this.processFeedback(feedback);
      
      // Track comment metrics
      await this.trackCommentMetrics(modelType, sentimentResult.overall);
      
      // If negative feedback, trigger alert
      if (sentimentResult.overall < -0.5) {
        await this.triggerNegativeFeedbackAlert(feedback);
      }
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to collect comment');
      throw error;
    }
  }

  /**
   * Report an issue
   */
  async reportIssue(
    contentId: string,
    issueType: IssueType,
    description: string,
    modelType: string,
    userId?: string,
    priority?: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'report',
        issueType,
        comment: description,
        sentiment: -1, // Issues are inherently negative
        metadata: await this.collectMetadata(),
        followUp: {
          contactRequested: priority === 'high' || priority === 'critical',
          priority: priority || 'medium'
        }
      };

      await this.processFeedback(feedback);
      
      // Track issue metrics
      await this.trackIssueMetrics(modelType, issueType);
      
      // Create support ticket if high priority
      if (priority === 'high' || priority === 'critical') {
        await this.createSupportTicket(feedback);
      }
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to report issue');
      throw error;
    }
  }

  /**
   * Submit feature request
   */
  async submitFeatureRequest(
    title: string,
    description: string,
    modelType: string,
    userId?: string
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId: `feature_${uuidv4()}`,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'feature_request',
        comment: `${title}: ${description}`,
        sentiment: 0, // Neutral for feature requests
        metadata: {
          ...await this.collectMetadata(),
          featureTitle: title,
          featureDescription: description
        }
      };

      await this.processFeedback(feedback);
      
      // Track feature request
      await this.trackFeatureRequest(modelType, title);
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to submit feature request');
      throw error;
    }
  }

  /**
   * Submit bug report
   */
  async submitBugReport(
    title: string,
    description: string,
    steps: string[],
    modelType: string,
    userId?: string,
    severity?: 'low' | 'medium' | 'high' | 'critical'
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId: `bug_${uuidv4()}`,
        modelType: modelType as any,
        modelVersion: await this.getModelVersion(modelType),
        feedbackType: 'bug_report',
        comment: description,
        issueType: 'other',
        sentiment: -1, // Bugs are negative
        metadata: {
          ...await this.collectMetadata(),
          bugTitle: title,
          bugDescription: description,
          reproductionSteps: steps,
          severity: severity || 'medium'
        },
        followUp: {
          contactRequested: severity === 'high' || severity === 'critical',
          priority: severity || 'medium'
        }
      };

      await this.processFeedback(feedback);
      
      // Track bug report
      await this.trackBugReport(modelType, severity || 'medium');
      
      // Create engineering ticket if high severity
      if (severity === 'high' || severity === 'critical') {
        await this.createEngineeringTicket(feedback);
      }
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to submit bug report');
      throw error;
    }
  }

  /**
   * Collect NPS survey response
   */
  async collectNPS(
    score: number,
    comment?: string,
    userId?: string
  ): Promise<string> {
    const feedbackId = uuidv4();
    
    try {
      // Determine NPS category
      let category: 'detractor' | 'passive' | 'promoter';
      if (score <= 6) category = 'detractor';
      else if (score <= 8) category = 'passive';
      else category = 'promoter';

      const feedback: Partial<ExplicitFeedbackEvent> = {
        feedbackId,
        timestamp: new Date(),
        userId,
        sessionId: await this.getSessionId(userId),
        contentId: `nps_${uuidv4()}`,
        modelType: 'analytics' as any, // NPS is business-wide
        modelVersion: 'current',
        feedbackType: 'survey',
        rating: score,
        comment,
        sentiment: (score - 5) / 5, // Normalize to -1 to 1
        metadata: {
          ...await this.collectMetadata(),
          surveyType: 'nps',
          npsCategory: category,
          npsScore: score
        }
      };

      await this.processFeedback(feedback);
      
      // Track NPS metrics
      await this.trackNPSMetrics(score, category);
      
      return feedbackId;
    } catch (error) {
      this.logger.error({ error, feedbackId }, 'Failed to collect NPS');
      throw error;
    }
  }

  /**
   * Process and store feedback
   */
  private async processFeedback(feedback: Partial<ExplicitFeedbackEvent>): Promise<void> {
    // Validate feedback
    const validated = await this.validator.validateExplicitEvent(feedback as ExplicitFeedbackEvent);
    
    // Check privacy consent
    const hasConsent = await this.privacyManager.checkConsent(
      validated.userId || validated.sessionId,
      'functional'
    );

    if (!hasConsent) {
      this.logger.debug({ feedbackId: validated.feedbackId }, 'Feedback blocked due to lack of consent');
      return;
    }

    // Anonymize if needed
    const anonymized = await this.privacyManager.anonymizeFeedback(validated);
    
    // Send to Kafka
    await this.producer.send({
      topic: 'explicit-feedback-events',
      messages: [{
        key: validated.feedbackId,
        value: JSON.stringify(anonymized),
        headers: {
          modelType: validated.modelType,
          feedbackType: validated.feedbackType,
          timestamp: validated.timestamp.toISOString()
        }
      }]
    });
    
    // Store in Redis for quick access
    await this.redis.setex(
      `feedback:${validated.feedbackId}`,
      86400, // 24 hour TTL
      JSON.stringify(anonymized)
    );
    
    this.logger.debug({ feedbackId: validated.feedbackId }, 'Feedback processed');
  }

  /**
   * Analyze sentiment of text
   */
  private async analyzeSentiment(text: string): Promise<SentimentResult> {
    try {
      // Tokenize text
      const tokens = this.tokenizer.tokenize(text.toLowerCase());
      
      if (!tokens || tokens.length === 0) {
        return {
          text,
          overall: 0,
          confidence: 0,
          emotions: { positive: 0, negative: 0, neutral: 1 },
          aspects: [],
          keywords: []
        };
      }

      // Calculate sentiment score
      const score = this.sentimentAnalyzer.getSentiment(tokens);
      
      // Determine emotions
      let positive = 0, negative = 0, neutral = 0;
      if (score > 0.2) positive = score;
      else if (score < -0.2) negative = Math.abs(score);
      else neutral = 1 - Math.abs(score);
      
      // Extract keywords
      this.tfidf.addDocument(text);
      const keywords: string[] = [];
      this.tfidf.listTerms(0).forEach((item: any) => {
        if (item.tfidf > 0.5) {
          keywords.push(item.term);
        }
      });
      
      // Detect aspects (simplified)
      const aspects = this.detectAspects(text);
      
      return {
        text,
        overall: score,
        confidence: Math.min(1, tokens.length / 10), // Simple confidence based on text length
        emotions: {
          positive,
          negative,
          neutral
        },
        aspects,
        keywords: keywords.slice(0, 10)
      };
    } catch (error) {
      this.logger.error({ error }, 'Failed to analyze sentiment');
      return {
        text,
        overall: 0,
        confidence: 0,
        emotions: { positive: 0, negative: 0, neutral: 1 },
        aspects: [],
        keywords: []
      };
    }
  }

  /**
   * Detect aspects mentioned in feedback
   */
  private detectAspects(text: string): Array<{ aspect: string; sentiment: number; mentions: number }> {
    const aspects = [
      { name: 'performance', keywords: ['fast', 'slow', 'speed', 'quick', 'lag'] },
      { name: 'accuracy', keywords: ['accurate', 'wrong', 'correct', 'mistake', 'error'] },
      { name: 'usability', keywords: ['easy', 'difficult', 'intuitive', 'confusing', 'simple'] },
      { name: 'quality', keywords: ['quality', 'good', 'bad', 'excellent', 'poor'] },
      { name: 'relevance', keywords: ['relevant', 'irrelevant', 'useful', 'useless', 'helpful'] }
    ];
    
    const results: Array<{ aspect: string; sentiment: number; mentions: number }> = [];
    const lowerText = text.toLowerCase();
    
    for (const aspect of aspects) {
      let mentions = 0;
      let totalSentiment = 0;
      
      for (const keyword of aspect.keywords) {
        if (lowerText.includes(keyword)) {
          mentions++;
          // Simple sentiment based on keyword valence
          const isPositive = ['fast', 'accurate', 'easy', 'good', 'relevant', 'excellent', 'intuitive', 'simple', 'useful', 'helpful'].includes(keyword);
          totalSentiment += isPositive ? 1 : -1;
        }
      }
      
      if (mentions > 0) {
        results.push({
          aspect: aspect.name,
          sentiment: totalSentiment / mentions,
          mentions
        });
      }
    }
    
    return results;
  }

  /**
   * Detect issue type from text
   */
  private async detectIssueType(text: string): Promise<IssueType | undefined> {
    const lowerText = text.toLowerCase();
    
    const issuePatterns: Record<IssueType, string[]> = {
      accuracy: ['wrong', 'incorrect', 'mistake', 'error', 'inaccurate'],
      relevance: ['irrelevant', 'unrelated', 'off-topic', 'not useful'],
      quality: ['poor quality', 'bad', 'terrible', 'awful', 'low quality'],
      offensive: ['offensive', 'inappropriate', 'rude', 'insulting', 'discriminatory'],
      performance: ['slow', 'lag', 'freeze', 'crash', 'timeout'],
      formatting: ['format', 'display', 'layout', 'broken', 'rendering'],
      other: []
    };
    
    for (const [issueType, patterns] of Object.entries(issuePatterns)) {
      for (const pattern of patterns) {
        if (lowerText.includes(pattern)) {
          return issueType as IssueType;
        }
      }
    }
    
    return undefined;
  }

  /**
   * Extract actionable insights from feedback
   */
  private async extractInsights(text: string): Promise<string[]> {
    const insights: string[] = [];
    const lowerText = text.toLowerCase();
    
    // Check for specific suggestions
    if (lowerText.includes('should') || lowerText.includes('could')) {
      insights.push('Contains suggestion for improvement');
    }
    
    // Check for comparison
    if (lowerText.includes('better than') || lowerText.includes('worse than')) {
      insights.push('Contains comparison with alternatives');
    }
    
    // Check for specific feature mentions
    if (lowerText.includes('feature') || lowerText.includes('function')) {
      insights.push('Mentions specific features');
    }
    
    // Check for urgency
    if (lowerText.includes('urgent') || lowerText.includes('asap') || lowerText.includes('immediately')) {
      insights.push('Indicates urgency');
    }
    
    return insights;
  }

  /**
   * Track rating metrics
   */
  private async trackRatingMetrics(modelType: string, rating: number): Promise<void> {
    const key = `metrics:rating:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrbyfloat(key, 'sum', rating);
    await this.redis.hincrby(key, `rating_${rating}`, 1);
    
    // Calculate average
    const total = await this.redis.hget(key, 'total');
    const sum = await this.redis.hget(key, 'sum');
    if (total && sum) {
      const avg = parseFloat(sum) / parseInt(total);
      await this.redis.hset(key, 'average', avg.toString());
    }
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track thumbs metrics
   */
  private async trackThumbsMetrics(modelType: string, thumbsUp: boolean): Promise<void> {
    const key = `metrics:thumbs:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrby(key, thumbsUp ? 'up' : 'down', 1);
    
    // Calculate rate
    const total = await this.redis.hget(key, 'total');
    const up = await this.redis.hget(key, 'up');
    if (total && up) {
      const rate = (parseInt(up) / parseInt(total)) * 100;
      await this.redis.hset(key, 'up_rate', rate.toString());
    }
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track comment metrics
   */
  private async trackCommentMetrics(modelType: string, sentiment: number): Promise<void> {
    const key = `metrics:comment:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrbyfloat(key, 'sentiment_sum', sentiment);
    
    if (sentiment > 0.2) {
      await this.redis.hincrby(key, 'positive', 1);
    } else if (sentiment < -0.2) {
      await this.redis.hincrby(key, 'negative', 1);
    } else {
      await this.redis.hincrby(key, 'neutral', 1);
    }
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track issue metrics
   */
  private async trackIssueMetrics(modelType: string, issueType: IssueType): Promise<void> {
    const key = `metrics:issues:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrby(key, issueType, 1);
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track feature requests
   */
  private async trackFeatureRequest(modelType: string, title: string): Promise<void> {
    const key = `metrics:features:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.lpush(`${key}:list`, title);
    await this.redis.ltrim(`${key}:list`, 0, 99); // Keep last 100
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track bug reports
   */
  private async trackBugReport(modelType: string, severity: string): Promise<void> {
    const key = `metrics:bugs:${modelType}`;
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrby(key, severity, 1);
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Track NPS metrics
   */
  private async trackNPSMetrics(score: number, category: string): Promise<void> {
    const key = 'metrics:nps';
    
    await this.redis.hincrby(key, 'total', 1);
    await this.redis.hincrby(key, category, 1);
    await this.redis.hincrbyfloat(key, 'score_sum', score);
    
    // Calculate NPS
    const total = await this.redis.hget(key, 'total');
    const promoters = await this.redis.hget(key, 'promoter') || '0';
    const detractors = await this.redis.hget(key, 'detractor') || '0';
    
    if (total) {
      const nps = ((parseInt(promoters) - parseInt(detractors)) / parseInt(total)) * 100;
      await this.redis.hset(key, 'nps_score', nps.toString());
    }
    
    await this.redis.expire(key, 86400);
  }

  /**
   * Helper methods
   */
  private async getSessionId(userId?: string): Promise<string> {
    if (userId) {
      const session = await this.redis.get(`user:session:${userId}`);
      if (session) return session;
    }
    return uuidv4();
  }

  private async getModelVersion(modelType: string): Promise<string> {
    const version = await this.redis.get(`model:version:${modelType}`);
    return version || 'v1.0.0';
  }

  private async collectMetadata(): Promise<any> {
    return {
      page: 'current_page', // Should be passed from client
      contentType: 'ai_generated',
      interactionTime: Date.now(),
      previousInteractions: 0,
      device: {
        type: 'desktop',
        os: 'unknown',
        browser: 'unknown'
      }
    };
  }

  private async loadCustomLexicon(): Promise<void> {
    // Load custom sentiment lexicon for domain-specific terms
    // This would be loaded from a file or database
  }

  private async triggerNegativeFeedbackAlert(feedback: any): Promise<void> {
    // Send alert for negative feedback
    await this.redis.publish('alerts:feedback', JSON.stringify({
      type: 'negative_feedback',
      severity: 'warning',
      feedback
    }));
  }

  private async createSupportTicket(feedback: any): Promise<void> {
    // Create support ticket in external system
    this.logger.info({ feedback }, 'Creating support ticket');
  }

  private async createEngineeringTicket(feedback: any): Promise<void> {
    // Create engineering ticket in issue tracker
    this.logger.info({ feedback }, 'Creating engineering ticket');
  }

  /**
   * Shutdown the collector
   */
  async shutdown(): Promise<void> {
    await this.producer.disconnect();
    this.logger.info('Explicit feedback collector shut down');
  }
}