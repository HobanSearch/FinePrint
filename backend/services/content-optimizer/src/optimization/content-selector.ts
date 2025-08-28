/**
 * Content selection engine that chooses optimal content variants
 * Integrates with multi-armed bandit for intelligent selection
 */

import { 
  ContentVariant, 
  ContentRequest, 
  OptimizedContent,
  UserContext,
  ContentCategory 
} from '../types';
import { MultiArmedBandit } from './multi-armed-bandit';
import { logger } from '../utils/logger';
import { RedisCache } from '../cache/redis-cache';
import { ContentStore } from '../versioning/content-store';

export class ContentSelector {
  private bandits: Map<string, MultiArmedBandit>;
  private readonly defaultContent: Map<string, Record<string, any>>;

  constructor(
    private readonly cache: RedisCache,
    private readonly contentStore: ContentStore,
    private readonly config: {
      explorationRate: number;
      minSampleSize: number;
      cacheKeyPrefix: string;
    }
  ) {
    this.bandits = new Map();
    this.defaultContent = this.initializeDefaultContent();
  }

  /**
   * Select optimal content for a request
   */
  async selectContent(request: ContentRequest): Promise<OptimizedContent> {
    const startTime = Date.now();
    const cacheKey = this.buildCacheKey(request);

    try {
      // Check cache first
      if (!request.options?.includeMetadata) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          logger.debug({ cacheKey, latency: Date.now() - startTime }, 'Cache hit');
          return cached as OptimizedContent;
        }
      }

      // Get active variants for this content
      const variants = await this.contentStore.getActiveVariants(
        request.category,
        request.page || 'default'
      );

      if (variants.length === 0) {
        logger.warn({ request }, 'No active variants found, using default');
        return this.getDefaultContent(request);
      }

      // Select variant using multi-armed bandit
      const selectedVariant = await this.selectVariant(
        variants,
        request.context,
        cacheKey
      );

      // Apply personalization if requested
      let content = selectedVariant.content;
      if (request.options?.personalize && request.context) {
        content = await this.personalizeContent(content, request.context);
      }

      const optimizedContent: OptimizedContent = {
        content,
        metadata: request.options?.includeMetadata ? {
          variant: selectedVariant.id,
          confidence: selectedVariant.performance.confidence,
          personalized: request.options?.personalize,
          segment: request.context?.segment
        } : undefined
      };

      // Cache the result (excluding metadata)
      if (!request.options?.includeMetadata) {
        await this.cache.set(cacheKey, { content }, 300); // 5 minutes TTL
      }

      logger.info({
        category: request.category,
        page: request.page,
        variant: selectedVariant.id,
        latency: Date.now() - startTime
      }, 'Content selected');

      return optimizedContent;

    } catch (error) {
      logger.error({ error, request }, 'Error selecting content');
      return this.getDefaultContent(request);
    }
  }

  /**
   * Select best variant using multi-armed bandit
   */
  private async selectVariant(
    variants: ContentVariant[],
    context?: UserContext,
    banditKey?: string
  ): Promise<ContentVariant> {
    // Get or create bandit for this content
    const key = banditKey || 'global';
    let bandit = this.bandits.get(key);
    
    if (!bandit) {
      bandit = new MultiArmedBandit(this.config.explorationRate);
      this.bandits.set(key, bandit);
      
      // Initialize arms for all variants
      variants.forEach(v => bandit!.addArm(v.id));
    }

    // Check for clear winner
    const winner = variants.find(v => v.status === 'winner');
    if (winner) {
      logger.debug({ winnerId: winner.id }, 'Using experiment winner');
      return winner;
    }

    // Select arm using bandit algorithm
    const selectedArmId = bandit.selectArm();
    
    if (!selectedArmId) {
      // Fallback to random selection
      return variants[Math.floor(Math.random() * variants.length)];
    }

    // Find corresponding variant
    const selectedVariant = variants.find(v => v.id === selectedArmId);
    
    if (!selectedVariant) {
      // Arm exists but variant not found, remove arm and retry
      bandit.getState().arms.delete(selectedArmId);
      return variants[0]; // Fallback to first variant
    }

    // Track selection for later reward update
    this.trackSelection(selectedVariant.id, context);

    return selectedVariant;
  }

  /**
   * Update bandit with conversion feedback
   */
  async updateConversion(
    variantId: string,
    success: boolean,
    context?: UserContext
  ): Promise<void> {
    try {
      const reward = success ? 1 : 0;
      
      // Update all relevant bandits
      for (const [key, bandit] of this.bandits) {
        if (bandit.getState().arms.has(variantId)) {
          bandit.updateArm(variantId, reward);
        }
      }

      // Update variant performance in store
      await this.contentStore.updateVariantPerformance(variantId, {
        conversion: success,
        context
      });

      logger.info({ 
        variantId, 
        success, 
        reward 
      }, 'Conversion feedback recorded');

    } catch (error) {
      logger.error({ error, variantId }, 'Error updating conversion');
    }
  }

  /**
   * Personalize content based on user context
   */
  private async personalizeContent(
    content: Record<string, any>,
    context: UserContext
  ): Promise<Record<string, any>> {
    const personalized = { ...content };

    // Segment-based personalization
    if (context.segment) {
      const segmentOverrides = await this.getSegmentOverrides(context.segment);
      Object.assign(personalized, segmentOverrides);
    }

    // Industry-specific messaging
    if (context.industry) {
      personalized.industry_message = this.getIndustryMessage(context.industry);
    }

    // Geographic customization
    if (context.geographic) {
      personalized.locale = this.getLocaleSettings(context.geographic);
    }

    // Behavioral adjustments
    if (context.behavior?.engagement === 'high') {
      personalized.cta_style = 'aggressive';
      personalized.show_advanced_features = true;
    }

    return personalized;
  }

  /**
   * Get segment-specific content overrides
   */
  private async getSegmentOverrides(segment: string): Promise<Record<string, any>> {
    const overrides: Record<string, Record<string, any>> = {
      enterprise: {
        headline_prefix: 'Enterprise-Grade',
        social_proof: 'Trusted by Fortune 500',
        pricing_emphasis: 'ROI-focused',
        support_level: '24/7 dedicated support'
      },
      smb: {
        headline_prefix: 'Affordable',
        social_proof: 'Join 10,000+ growing businesses',
        pricing_emphasis: 'Cost-effective',
        support_level: 'Priority support'
      },
      startup: {
        headline_prefix: 'Scale Fast with',
        social_proof: 'Built for rapid growth',
        pricing_emphasis: 'Flexible pricing',
        support_level: 'Community + chat support'
      },
      individual: {
        headline_prefix: 'Personal',
        social_proof: 'Loved by professionals',
        pricing_emphasis: 'Free to start',
        support_level: 'Self-service resources'
      }
    };

    return overrides[segment] || {};
  }

  /**
   * Get industry-specific messaging
   */
  private getIndustryMessage(industry: string): string {
    const messages: Record<string, string> = {
      tech: 'Integrate seamlessly with your tech stack',
      finance: 'Bank-grade security and compliance',
      healthcare: 'HIPAA-compliant document processing',
      legal: 'Designed by lawyers, for lawyers',
      retail: 'Optimize vendor agreements at scale',
      other: 'Tailored for your industry needs'
    };

    return messages[industry] || messages.other;
  }

  /**
   * Get locale-specific settings
   */
  private getLocaleSettings(geographic: string): Record<string, any> {
    const locales: Record<string, Record<string, any>> = {
      us: {
        currency: 'USD',
        date_format: 'MM/DD/YYYY',
        compliance: ['SOC2', 'CCPA']
      },
      eu: {
        currency: 'EUR',
        date_format: 'DD/MM/YYYY',
        compliance: ['GDPR', 'ISO27001']
      },
      apac: {
        currency: 'USD',
        date_format: 'DD/MM/YYYY',
        compliance: ['PDPA', 'ISO27001']
      },
      latam: {
        currency: 'USD',
        date_format: 'DD/MM/YYYY',
        compliance: ['LGPD']
      }
    };

    return locales[geographic] || locales.us;
  }

  /**
   * Build cache key for request
   */
  private buildCacheKey(request: ContentRequest): string {
    const parts = [
      this.config.cacheKeyPrefix,
      request.category,
      request.page || 'default',
      request.context?.segment || 'unknown',
      request.context?.sessionId || 'anonymous'
    ];

    return parts.join(':');
  }

  /**
   * Track content selection for analytics
   */
  private trackSelection(variantId: string, context?: UserContext): void {
    // This would integrate with analytics service
    logger.debug({ 
      variantId, 
      userId: context?.userId,
      segment: context?.segment 
    }, 'Content selection tracked');
  }

  /**
   * Get default content fallback
   */
  private getDefaultContent(request: ContentRequest): OptimizedContent {
    const defaultContent = this.defaultContent.get(
      `${request.category}:${request.page || 'default'}`
    );

    return {
      content: defaultContent || {
        headline: 'AI-Powered Legal Document Analysis',
        subheadline: 'Understand contracts in seconds',
        cta: 'Get Started'
      }
    };
  }

  /**
   * Initialize default content for all categories
   */
  private initializeDefaultContent(): Map<string, Record<string, any>> {
    const defaults = new Map<string, Record<string, any>>();

    // Marketing defaults
    defaults.set('marketing:homepage', {
      headline: 'Legal Document Analysis in 5 Seconds',
      subheadline: 'AI-powered insights for your contracts',
      cta: 'Start Free Trial',
      features: [
        'Instant clause detection',
        'Risk assessment',
        'Plain English summaries'
      ]
    });

    defaults.set('marketing:pricing', {
      headline: 'Simple, Transparent Pricing',
      subheadline: 'Choose the plan that fits your needs',
      cta: 'Start Free Trial'
    });

    // Sales defaults
    defaults.set('sales:messaging', {
      value_prop: 'Save hours on contract review',
      pain_point: 'Stop missing critical contract issues',
      social_proof: 'Trusted by 1000+ companies'
    });

    // Support defaults
    defaults.set('support:responses', {
      greeting: 'How can we help you today?',
      resolution: 'We\'re here to help resolve your issue',
      followup: 'Is there anything else we can help with?'
    });

    // SEO defaults
    defaults.set('seo:metadata', {
      title: 'Fine Print AI - Legal Document Analysis',
      description: 'AI-powered legal document analysis tool',
      keywords: ['legal', 'ai', 'contract', 'analysis']
    });

    return defaults;
  }

  /**
   * Prune underperforming variants
   */
  async pruneVariants(): Promise<void> {
    for (const [key, bandit] of this.bandits) {
      bandit.pruneArms(0.1); // Remove arms performing < 10% of best
      
      // Persist bandit state
      await this.cache.set(
        `bandit:${key}`,
        bandit.getState(),
        86400 // 24 hour TTL
      );
    }

    logger.info('Pruned underperforming variants');
  }

  /**
   * Get performance statistics
   */
  getStatistics(): Map<string, any> {
    const stats = new Map();

    for (const [key, bandit] of this.bandits) {
      stats.set(key, bandit.getStatistics());
    }

    return stats;
  }
}