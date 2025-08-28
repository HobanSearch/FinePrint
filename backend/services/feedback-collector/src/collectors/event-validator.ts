/**
 * Event validator for feedback events
 */

import { z } from 'zod';
import { Logger } from 'pino';
import {
  ImplicitFeedbackEvent,
  ImplicitFeedbackEventSchema,
  ExplicitFeedbackEvent,
  ExplicitFeedbackEventSchema
} from '../types';

export class EventValidator {
  private logger: Logger;
  private customValidators: Map<string, (event: any) => boolean>;
  private sanitizers: Map<string, (value: any) => any>;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'EventValidator' });
    this.customValidators = new Map();
    this.sanitizers = new Map();
    
    this.initializeValidators();
    this.initializeSanitizers();
  }

  /**
   * Validate implicit feedback event
   */
  async validateImplicitEvent(event: ImplicitFeedbackEvent): Promise<ImplicitFeedbackEvent> {
    try {
      // Basic schema validation
      const validated = ImplicitFeedbackEventSchema.parse(event);
      
      // Custom validations
      if (!this.validateEventTimestamp(validated.timestamp)) {
        throw new Error('Invalid timestamp: future date not allowed');
      }
      
      if (!this.validateSessionId(validated.sessionId)) {
        throw new Error('Invalid session ID format');
      }
      
      if (!this.validateBusinessMetrics(validated.businessMetrics)) {
        throw new Error('Invalid business metrics');
      }
      
      // Sanitize data
      validated.metadata = this.sanitizeMetadata(validated.metadata);
      
      if (validated.userId) {
        validated.userId = this.sanitizeUserId(validated.userId);
      }
      
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error({ error: error.errors, event }, 'Implicit event validation failed');
        throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Validate explicit feedback event
   */
  async validateExplicitEvent(event: ExplicitFeedbackEvent): Promise<ExplicitFeedbackEvent> {
    try {
      // Basic schema validation
      const validated = ExplicitFeedbackEventSchema.parse(event);
      
      // Custom validations
      if (!this.validateEventTimestamp(validated.timestamp)) {
        throw new Error('Invalid timestamp: future date not allowed');
      }
      
      if (validated.rating && !this.validateRating(validated.rating)) {
        throw new Error('Invalid rating: must be between 1 and 5');
      }
      
      if (validated.comment && !this.validateComment(validated.comment)) {
        throw new Error('Invalid comment: exceeds maximum length or contains prohibited content');
      }
      
      if (validated.sentiment !== undefined && !this.validateSentiment(validated.sentiment)) {
        throw new Error('Invalid sentiment: must be between -1 and 1');
      }
      
      // Sanitize data
      if (validated.comment) {
        validated.comment = this.sanitizeComment(validated.comment);
      }
      
      if (validated.userId) {
        validated.userId = this.sanitizeUserId(validated.userId);
      }
      
      validated.metadata = this.sanitizeMetadata(validated.metadata);
      
      return validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.logger.error({ error: error.errors, event }, 'Explicit event validation failed');
        throw new Error(`Validation failed: ${error.errors.map(e => e.message).join(', ')}`);
      }
      throw error;
    }
  }

  /**
   * Validate batch of events
   */
  async validateBatch<T>(
    events: T[],
    validator: (event: T) => Promise<T>
  ): Promise<{ valid: T[]; invalid: Array<{ event: T; error: string }> }> {
    const valid: T[] = [];
    const invalid: Array<{ event: T; error: string }> = [];
    
    for (const event of events) {
      try {
        const validated = await validator.call(this, event);
        valid.push(validated);
      } catch (error) {
        invalid.push({
          event,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    return { valid, invalid };
  }

  /**
   * Initialize custom validators
   */
  private initializeValidators(): void {
    // Timestamp validator
    this.customValidators.set('timestamp', (value: any) => {
      if (!(value instanceof Date)) return false;
      const now = new Date();
      const maxFuture = new Date(now.getTime() + 60000); // Allow 1 minute future
      const maxPast = new Date(now.getTime() - 86400000 * 30); // Allow 30 days past
      return value <= maxFuture && value >= maxPast;
    });
    
    // UUID validator
    this.customValidators.set('uuid', (value: string) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(value);
    });
    
    // Email validator
    this.customValidators.set('email', (value: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(value);
    });
    
    // URL validator
    this.customValidators.set('url', (value: string) => {
      try {
        new URL(value);
        return true;
      } catch {
        return false;
      }
    });
  }

  /**
   * Initialize sanitizers
   */
  private initializeSanitizers(): void {
    // HTML sanitizer
    this.sanitizers.set('html', (value: string) => {
      // Remove HTML tags
      return value.replace(/<[^>]*>/g, '');
    });
    
    // SQL injection sanitizer
    this.sanitizers.set('sql', (value: string) => {
      // Basic SQL injection prevention
      return value.replace(/['";\\]/g, '');
    });
    
    // XSS sanitizer
    this.sanitizers.set('xss', (value: string) => {
      // Basic XSS prevention
      return value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    });
    
    // Whitespace trimmer
    this.sanitizers.set('trim', (value: string) => {
      return value.trim();
    });
    
    // PII remover
    this.sanitizers.set('pii', (value: string) => {
      // Remove common PII patterns
      // SSN pattern
      value = value.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
      // Credit card pattern
      value = value.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CC]');
      // Phone number pattern
      value = value.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
      return value;
    });
  }

  /**
   * Validation helper methods
   */
  private validateEventTimestamp(timestamp: Date): boolean {
    const validator = this.customValidators.get('timestamp');
    return validator ? validator(timestamp) : true;
  }

  private validateSessionId(sessionId: string): boolean {
    const validator = this.customValidators.get('uuid');
    return validator ? validator(sessionId) : true;
  }

  private validateBusinessMetrics(metrics?: any): boolean {
    if (!metrics) return true;
    
    // Validate numeric values
    for (const [key, value] of Object.entries(metrics)) {
      if (value !== undefined && value !== null) {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
          return false;
        }
        // Check reasonable bounds
        if (key === 'conversionValue' && (value < 0 || value > 1000000)) {
          return false;
        }
        if (key.includes('Score') && (value < 0 || value > 100)) {
          return false;
        }
      }
    }
    
    return true;
  }

  private validateRating(rating: number): boolean {
    return rating >= 1 && rating <= 5 && Number.isInteger(rating);
  }

  private validateComment(comment: string): boolean {
    // Check length
    if (comment.length > 5000) return false;
    
    // Check for prohibited content (simplified)
    const prohibited = ['<script', 'javascript:', 'data:text/html'];
    for (const term of prohibited) {
      if (comment.toLowerCase().includes(term)) {
        return false;
      }
    }
    
    return true;
  }

  private validateSentiment(sentiment: number): boolean {
    return sentiment >= -1 && sentiment <= 1;
  }

  /**
   * Sanitization helper methods
   */
  private sanitizeMetadata(metadata: any): any {
    if (!metadata) return metadata;
    
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') {
        let sanitizedValue = value;
        sanitizedValue = this.sanitizers.get('trim')!(sanitizedValue);
        sanitizedValue = this.sanitizers.get('xss')!(sanitizedValue);
        sanitized[key] = sanitizedValue;
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeMetadata(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private sanitizeComment(comment: string): string {
    let sanitized = comment;
    sanitized = this.sanitizers.get('trim')!(sanitized);
    sanitized = this.sanitizers.get('html')!(sanitized);
    sanitized = this.sanitizers.get('xss')!(sanitized);
    sanitized = this.sanitizers.get('pii')!(sanitized);
    return sanitized;
  }

  private sanitizeUserId(userId: string): string {
    // Hash or anonymize if needed
    return userId.substring(0, 50); // Limit length
  }

  /**
   * Check for anomalies in event data
   */
  async detectAnomalies(event: any): Promise<string[]> {
    const anomalies: string[] = [];
    
    // Check for unusual patterns
    if (event.metadata?.scrollDepth > 100) {
      anomalies.push('Scroll depth exceeds 100%');
    }
    
    if (event.metadata?.timeOnPage > 3600000) { // 1 hour
      anomalies.push('Unusually long time on page');
    }
    
    if (event.businessMetrics?.conversionValue > 10000) {
      anomalies.push('Unusually high conversion value');
    }
    
    // Check for bot patterns
    if (this.detectBotPattern(event)) {
      anomalies.push('Potential bot activity detected');
    }
    
    return anomalies;
  }

  /**
   * Detect bot patterns
   */
  private detectBotPattern(event: any): boolean {
    // Simple bot detection heuristics
    const userAgent = event.metadata?.device?.userAgent || '';
    const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
    
    for (const pattern of botPatterns) {
      if (userAgent.toLowerCase().includes(pattern)) {
        return true;
      }
    }
    
    // Check for suspicious behavior
    if (event.metadata?.timeOnPage === 0) {
      return true; // No time spent on page
    }
    
    if (event.metadata?.scrollDepth === 100 && event.metadata?.timeOnPage < 1000) {
      return true; // Scrolled to bottom instantly
    }
    
    return false;
  }

  /**
   * Validate data quality
   */
  validateDataQuality(event: any): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for required fields
    if (!event.eventId) issues.push('Missing event ID');
    if (!event.timestamp) issues.push('Missing timestamp');
    if (!event.sessionId) issues.push('Missing session ID');
    
    // Check data completeness
    if (event.metadata) {
      if (!event.metadata.page) issues.push('Missing page information');
      if (!event.metadata.device) issues.push('Missing device information');
    } else {
      issues.push('Missing metadata');
    }
    
    // Check data consistency
    if (event.eventType === 'conversion' && !event.businessMetrics?.conversionValue) {
      issues.push('Conversion event missing conversion value');
    }
    
    if (event.feedbackType === 'rating' && !event.rating) {
      issues.push('Rating feedback missing rating value');
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Enrich event with derived fields
   */
  enrichEvent(event: any): any {
    const enriched = { ...event };
    
    // Add derived timestamp fields
    if (event.timestamp) {
      const date = new Date(event.timestamp);
      enriched.hour = date.getHours();
      enriched.dayOfWeek = date.getDay();
      enriched.weekOfYear = this.getWeekOfYear(date);
    }
    
    // Add session duration if available
    if (event.metadata?.timeOnPage) {
      enriched.sessionDurationBucket = this.getDurationBucket(event.metadata.timeOnPage);
    }
    
    // Add device category
    if (event.metadata?.device?.type) {
      enriched.deviceCategory = this.getDeviceCategory(event.metadata.device.type);
    }
    
    return enriched;
  }

  /**
   * Helper methods for enrichment
   */
  private getWeekOfYear(date: Date): number {
    const firstDay = new Date(date.getFullYear(), 0, 1);
    const diff = date.getTime() - firstDay.getTime();
    return Math.ceil((diff / 86400000 + firstDay.getDay() + 1) / 7);
  }

  private getDurationBucket(milliseconds: number): string {
    const seconds = milliseconds / 1000;
    if (seconds < 10) return '0-10s';
    if (seconds < 30) return '10-30s';
    if (seconds < 60) return '30-60s';
    if (seconds < 300) return '1-5m';
    if (seconds < 900) return '5-15m';
    return '15m+';
  }

  private getDeviceCategory(type: string): string {
    switch (type) {
      case 'mobile':
      case 'tablet':
        return 'mobile';
      case 'desktop':
        return 'desktop';
      default:
        return 'unknown';
    }
  }
}