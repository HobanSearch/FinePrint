/**
 * Main personalization engine that orchestrates user segmentation,
 * context analysis, and content personalization
 */

import { 
  UserContext, 
  UserSegment, 
  UserBehavior,
  ContentCategory 
} from '../types';
import { SegmentDetector } from './segment-detector';
import { ContextAnalyzer } from './context-analyzer';
import { logger } from '../utils/logger';
import { RedisCache } from '../cache/redis-cache';

export class PersonalizationEngine {
  private segmentDetector: SegmentDetector;
  private contextAnalyzer: ContextAnalyzer;
  private personalizationRules: Map<string, PersonalizationRule[]>;

  constructor(
    private readonly cache: RedisCache,
    private readonly config: {
      enablePersonalization: boolean;
      segmentCacheTTL: number;
      contextCacheTTL: number;
    }
  ) {
    this.segmentDetector = new SegmentDetector();
    this.contextAnalyzer = new ContextAnalyzer();
    this.personalizationRules = this.initializeRules();
  }

  /**
   * Personalize content based on user context
   */
  async personalizeContent(
    content: Record<string, any>,
    context: UserContext,
    category: ContentCategory
  ): Promise<Record<string, any>> {
    if (!this.config.enablePersonalization) {
      return content;
    }

    const startTime = Date.now();

    try {
      // Enrich context with detected segment if not provided
      if (!context.segment) {
        context.segment = await this.detectSegment(context);
      }

      // Analyze user behavior and preferences
      const enrichedContext = await this.contextAnalyzer.analyze(context);

      // Apply personalization rules
      let personalizedContent = { ...content };
      
      // Apply segment-specific personalization
      personalizedContent = this.applySegmentPersonalization(
        personalizedContent,
        enrichedContext.segment || 'unknown',
        category
      );

      // Apply behavioral personalization
      if (enrichedContext.behavior) {
        personalizedContent = this.applyBehavioralPersonalization(
          personalizedContent,
          enrichedContext.behavior,
          category
        );
      }

      // Apply geographic personalization
      if (enrichedContext.geographic) {
        personalizedContent = this.applyGeographicPersonalization(
          personalizedContent,
          enrichedContext.geographic
        );
      }

      // Apply industry-specific personalization
      if (enrichedContext.industry) {
        personalizedContent = this.applyIndustryPersonalization(
          personalizedContent,
          enrichedContext.industry
        );
      }

      // Apply preference-based personalization
      if (enrichedContext.preferences) {
        personalizedContent = this.applyPreferencePersonalization(
          personalizedContent,
          enrichedContext.preferences
        );
      }

      logger.info({
        userId: context.userId,
        segment: enrichedContext.segment,
        category,
        latency: Date.now() - startTime
      }, 'Content personalized');

      return personalizedContent;

    } catch (error) {
      logger.error({ error, context }, 'Personalization failed');
      return content; // Return unpersonalized content on error
    }
  }

  /**
   * Detect user segment based on context
   */
  private async detectSegment(context: UserContext): Promise<UserSegment> {
    const cacheKey = `segment:${context.userId || context.sessionId}`;
    
    // Check cache
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return cached as UserSegment;
    }

    // Detect segment
    const segment = await this.segmentDetector.detect(context);

    // Cache result
    await this.cache.set(cacheKey, segment, this.config.segmentCacheTTL);

    return segment;
  }

  /**
   * Apply segment-specific personalization
   */
  private applySegmentPersonalization(
    content: Record<string, any>,
    segment: UserSegment,
    category: ContentCategory
  ): Record<string, any> {
    const personalized = { ...content };
    const rules = this.personalizationRules.get(`${segment}:${category}`);

    if (!rules) return personalized;

    for (const rule of rules) {
      if (rule.condition(content)) {
        Object.assign(personalized, rule.modifications);
      }
    }

    // Segment-specific overrides
    const segmentOverrides = this.getSegmentOverrides(segment, category);
    Object.assign(personalized, segmentOverrides);

    return personalized;
  }

  /**
   * Apply behavioral personalization
   */
  private applyBehavioralPersonalization(
    content: Record<string, any>,
    behavior: UserBehavior,
    category: ContentCategory
  ): Record<string, any> {
    const personalized = { ...content };

    // High engagement users
    if (behavior.engagement === 'high') {
      if (category === 'marketing') {
        personalized.show_advanced_features = true;
        personalized.cta_style = 'direct';
        personalized.content_depth = 'detailed';
      } else if (category === 'sales') {
        personalized.pricing_display = 'transparent';
        personalized.trial_length = 'extended';
      }
    }

    // Low engagement users
    if (behavior.engagement === 'low') {
      if (category === 'marketing') {
        personalized.show_testimonials = true;
        personalized.cta_style = 'soft';
        personalized.content_depth = 'simplified';
      } else if (category === 'support') {
        personalized.show_tutorials = true;
        personalized.chat_prominence = 'high';
      }
    }

    // Returning users
    if (behavior.pageViews > 5) {
      personalized.show_comparison_tools = true;
      personalized.hide_basic_info = true;
    }

    return personalized;
  }

  /**
   * Apply geographic personalization
   */
  private applyGeographicPersonalization(
    content: Record<string, any>,
    geographic: string
  ): Record<string, any> {
    const personalized = { ...content };

    const geoSettings: Record<string, any> = {
      us: {
        currency: '$',
        date_format: 'MM/DD/YYYY',
        compliance_badges: ['SOC2', 'CCPA'],
        support_hours: '24/7 EST',
        legal_disclaimer: 'us_disclaimer'
      },
      eu: {
        currency: '€',
        date_format: 'DD/MM/YYYY',
        compliance_badges: ['GDPR', 'ISO27001'],
        support_hours: '24/7 CET',
        legal_disclaimer: 'eu_disclaimer',
        cookie_consent: true
      },
      apac: {
        currency: '$',
        date_format: 'DD/MM/YYYY',
        compliance_badges: ['PDPA', 'ISO27001'],
        support_hours: '24/7 SGT',
        legal_disclaimer: 'apac_disclaimer'
      },
      latam: {
        currency: '$',
        date_format: 'DD/MM/YYYY',
        compliance_badges: ['LGPD'],
        support_hours: '24/7 BRT',
        legal_disclaimer: 'latam_disclaimer'
      }
    };

    const settings = geoSettings[geographic] || geoSettings.us;
    Object.assign(personalized, { locale: settings });

    return personalized;
  }

  /**
   * Apply industry-specific personalization
   */
  private applyIndustryPersonalization(
    content: Record<string, any>,
    industry: string
  ): Record<string, any> {
    const personalized = { ...content };

    const industryContent: Record<string, any> = {
      tech: {
        terminology: 'technical',
        integration_focus: ['API', 'SDK', 'Webhooks'],
        case_studies: 'tech_companies',
        pain_points: ['speed', 'automation', 'scale']
      },
      finance: {
        terminology: 'formal',
        integration_focus: ['Compliance', 'Audit trails', 'Security'],
        case_studies: 'financial_institutions',
        pain_points: ['risk', 'compliance', 'accuracy']
      },
      healthcare: {
        terminology: 'clinical',
        integration_focus: ['HIPAA', 'HL7', 'Epic/Cerner'],
        case_studies: 'healthcare_providers',
        pain_points: ['privacy', 'compliance', 'interoperability']
      },
      legal: {
        terminology: 'legal',
        integration_focus: ['Practice management', 'Document systems'],
        case_studies: 'law_firms',
        pain_points: ['accuracy', 'efficiency', 'billable_hours']
      },
      retail: {
        terminology: 'business',
        integration_focus: ['ERP', 'Supply chain', 'Vendor management'],
        case_studies: 'retail_brands',
        pain_points: ['vendor_management', 'cost', 'speed']
      }
    };

    const industrySettings = industryContent[industry] || {
      terminology: 'general',
      integration_focus: ['General'],
      case_studies: 'various',
      pain_points: ['efficiency', 'cost', 'accuracy']
    };

    Object.assign(personalized, { industry_context: industrySettings });

    return personalized;
  }

  /**
   * Apply preference-based personalization
   */
  private applyPreferencePersonalization(
    content: Record<string, any>,
    preferences: any
  ): Record<string, any> {
    const personalized = { ...content };

    // Language preference
    if (preferences.language && preferences.language !== 'en') {
      personalized.show_translation_option = true;
      personalized.preferred_language = preferences.language;
    }

    // Communication style
    if (preferences.communicationStyle) {
      switch (preferences.communicationStyle) {
        case 'formal':
          personalized.tone = 'professional';
          personalized.use_technical_terms = true;
          break;
        case 'casual':
          personalized.tone = 'friendly';
          personalized.use_emojis = true;
          break;
        case 'technical':
          personalized.tone = 'technical';
          personalized.show_code_examples = true;
          break;
      }
    }

    // Feature preferences
    if (preferences.features) {
      personalized.highlighted_features = preferences.features;
      personalized.feature_order = this.prioritizeFeatures(preferences.features);
    }

    return personalized;
  }

  /**
   * Get segment-specific content overrides
   */
  private getSegmentOverrides(
    segment: UserSegment,
    category: ContentCategory
  ): Record<string, any> {
    const overrides: Record<string, Record<string, any>> = {
      enterprise: {
        marketing: {
          headline_modifier: 'Enterprise-Ready',
          show_roi_calculator: true,
          show_security_badges: true,
          testimonial_type: 'fortune500'
        },
        sales: {
          pricing_type: 'custom',
          show_volume_discounts: true,
          demo_type: 'personalized',
          contract_terms: 'annual'
        },
        support: {
          support_tier: 'premium',
          sla_display: true,
          dedicated_contact: true
        }
      },
      smb: {
        marketing: {
          headline_modifier: 'Built for Growing Teams',
          show_pricing_upfront: true,
          testimonial_type: 'smb_success',
          focus: 'efficiency'
        },
        sales: {
          pricing_type: 'tiered',
          show_monthly_option: true,
          demo_type: 'group',
          free_trial_prominence: 'high'
        },
        support: {
          support_tier: 'standard',
          self_service_prominence: 'medium',
          chat_support: true
        }
      },
      startup: {
        marketing: {
          headline_modifier: 'Scale Your Startup',
          show_startup_program: true,
          testimonial_type: 'startup_growth',
          focus: 'growth'
        },
        sales: {
          pricing_type: 'flexible',
          show_startup_discount: true,
          demo_type: 'self_guided',
          credit_offers: true
        },
        support: {
          support_tier: 'community',
          self_service_prominence: 'high',
          community_forum: true
        }
      },
      individual: {
        marketing: {
          headline_modifier: 'Personal',
          show_free_tier: true,
          testimonial_type: 'individual',
          focus: 'simplicity'
        },
        sales: {
          pricing_type: 'simple',
          show_free_option: true,
          instant_access: true,
          no_credit_card: true
        },
        support: {
          support_tier: 'self_service',
          documentation_prominence: 'high',
          faq_display: true
        }
      }
    };

    const segmentOverrides = overrides[segment] || {};
    return segmentOverrides[category] || {};
  }

  /**
   * Prioritize features based on user preferences
   */
  private prioritizeFeatures(features: string[]): string[] {
    const featurePriority: Record<string, number> = {
      'document_analysis': 10,
      'risk_detection': 9,
      'clause_extraction': 8,
      'summary_generation': 7,
      'collaboration': 6,
      'integrations': 5,
      'reporting': 4,
      'api_access': 3,
      'white_label': 2,
      'custom_models': 1
    };

    return features.sort((a, b) => 
      (featurePriority[b] || 0) - (featurePriority[a] || 0)
    );
  }

  /**
   * Initialize personalization rules
   */
  private initializeRules(): Map<string, PersonalizationRule[]> {
    const rules = new Map<string, PersonalizationRule[]>();

    // Enterprise marketing rules
    rules.set('enterprise:marketing', [
      {
        condition: (content) => content.page === 'homepage',
        modifications: {
          hero_image: 'enterprise_hero.jpg',
          primary_value: 'ROI and efficiency at scale',
          cta_text: 'Request Enterprise Demo'
        }
      },
      {
        condition: (content) => content.page === 'pricing',
        modifications: {
          show_calculator: true,
          default_seats: 100,
          billing_cycle: 'annual'
        }
      }
    ]);

    // SMB sales rules
    rules.set('smb:sales', [
      {
        condition: (content) => true,
        modifications: {
          urgency_messaging: 'moderate',
          social_proof_type: 'peer_companies',
          risk_reversal: '30-day money back'
        }
      }
    ]);

    // Add more rules as needed...

    return rules;
  }

  /**
   * Get personalization metrics
   */
  async getMetrics(): Promise<{
    totalPersonalizations: number;
    segmentDistribution: Map<string, number>;
    averageLatency: number;
  }> {
    // This would track actual metrics in production
    return {
      totalPersonalizations: 0,
      segmentDistribution: new Map(),
      averageLatency: 0
    };
  }
}

interface PersonalizationRule {
  condition: (content: Record<string, any>) => boolean;
  modifications: Record<string, any>;
}