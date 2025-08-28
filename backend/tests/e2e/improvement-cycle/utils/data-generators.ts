import { faker } from '@faker-js/faker';

export interface GeneratedFeedback {
  organizationId: string;
  agentId: string;
  experimentId?: string;
  type: 'implicit' | 'explicit';
  rating?: number;
  comment?: string;
  metadata: Record<string, any>;
}

export interface GeneratedEvent {
  organizationId: string;
  eventType: string;
  eventData: Record<string, any>;
  timestamp: Date;
}

export interface PerformanceProfile {
  successRate: number;
  averageLatency: number;
  errorRate: number;
  conversionRate: number;
}

export class TestDataGenerator {
  /**
   * Generate feedback data with specified performance characteristics
   */
  static generateFeedback(
    organizationId: string,
    agentId: string,
    experimentId?: string,
    performance: 'good' | 'poor' | 'mixed' = 'mixed'
  ): GeneratedFeedback {
    const performanceProfiles = {
      good: { minRating: 4, maxRating: 5, explicitRate: 0.3 },
      poor: { minRating: 1, maxRating: 2, explicitRate: 0.5 },
      mixed: { minRating: 1, maxRating: 5, explicitRate: 0.2 }
    };

    const profile = performanceProfiles[performance];
    const isExplicit = Math.random() < profile.explicitRate;

    const feedback: GeneratedFeedback = {
      organizationId,
      agentId,
      experimentId,
      type: isExplicit ? 'explicit' : 'implicit',
      metadata: {
        sessionId: faker.string.uuid(),
        timestamp: new Date().toISOString(),
        userAgent: faker.internet.userAgent(),
        ipAddress: faker.internet.ip()
      }
    };

    if (isExplicit) {
      feedback.rating = faker.number.int({ 
        min: profile.minRating, 
        max: profile.maxRating 
      });
      feedback.comment = faker.lorem.sentence();
    } else {
      // Implicit feedback events
      const events = ['click', 'view', 'scroll', 'conversion', 'bounce', 'exit'];
      feedback.metadata.eventType = faker.helpers.arrayElement(events);
      feedback.metadata.duration = faker.number.int({ min: 1000, max: 300000 });
      
      if (performance === 'good') {
        feedback.metadata.eventType = faker.helpers.arrayElement(['click', 'conversion', 'view']);
      } else if (performance === 'poor') {
        feedback.metadata.eventType = faker.helpers.arrayElement(['bounce', 'exit']);
      }
    }

    return feedback;
  }

  /**
   * Generate a batch of feedback over time
   */
  static generateFeedbackBatch(
    organizationId: string,
    agentId: string,
    experimentId: string,
    count: number,
    performance: 'good' | 'poor' | 'mixed' = 'mixed'
  ): GeneratedFeedback[] {
    const feedbacks: GeneratedFeedback[] = [];

    for (let i = 0; i < count; i++) {
      feedbacks.push(
        this.generateFeedback(organizationId, agentId, experimentId, performance)
      );
    }

    return feedbacks;
  }

  /**
   * Generate business events
   */
  static generateBusinessEvent(
    organizationId: string,
    eventType: 'revenue' | 'churn' | 'acquisition' | 'engagement'
  ): GeneratedEvent {
    const eventGenerators = {
      revenue: () => ({
        amount: faker.number.float({ min: 10, max: 10000, multipleOf: 0.01 }),
        currency: 'USD',
        product: faker.commerce.product(),
        customerId: faker.string.uuid()
      }),
      churn: () => ({
        customerId: faker.string.uuid(),
        reason: faker.helpers.arrayElement(['price', 'competitor', 'quality', 'support']),
        value: faker.number.float({ min: 100, max: 5000 })
      }),
      acquisition: () => ({
        customerId: faker.string.uuid(),
        channel: faker.helpers.arrayElement(['organic', 'paid', 'referral', 'direct']),
        cost: faker.number.float({ min: 5, max: 500 })
      }),
      engagement: () => ({
        userId: faker.string.uuid(),
        action: faker.helpers.arrayElement(['login', 'share', 'comment', 'like']),
        contentId: faker.string.uuid()
      })
    };

    return {
      organizationId,
      eventType,
      eventData: eventGenerators[eventType](),
      timestamp: new Date()
    };
  }

  /**
   * Generate A/B test configuration
   */
  static generateABTestConfig(agentType: 'marketing' | 'sales' | 'support' | 'analytics') {
    const configGenerators = {
      marketing: () => ({
        variantA: {
          tone: 'professional',
          length: 'short',
          cta: 'Learn More',
          template: 'template_a'
        },
        variantB: {
          tone: 'casual',
          length: 'long',
          cta: 'Get Started',
          template: 'template_b'
        }
      }),
      sales: () => ({
        variantA: {
          approach: 'consultative',
          urgency: 'low',
          personalization: 'high'
        },
        variantB: {
          approach: 'direct',
          urgency: 'high',
          personalization: 'medium'
        }
      }),
      support: () => ({
        variantA: {
          responseStyle: 'detailed',
          empathy: 'high',
          technicalLevel: 'low'
        },
        variantB: {
          responseStyle: 'concise',
          empathy: 'medium',
          technicalLevel: 'high'
        }
      }),
      analytics: () => ({
        variantA: {
          visualization: 'charts',
          detail: 'summary',
          format: 'dashboard'
        },
        variantB: {
          visualization: 'tables',
          detail: 'detailed',
          format: 'report'
        }
      })
    };

    return configGenerators[agentType]();
  }

  /**
   * Generate metrics for experiment
   */
  static generateExperimentMetrics(
    performance: 'winning' | 'losing' | 'neutral'
  ): Record<string, any> {
    const metricsProfiles = {
      winning: {
        variantA: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 500, max: 1000 }),
          conversions: faker.number.int({ min: 50, max: 100 }),
          revenue: faker.number.float({ min: 5000, max: 10000 })
        },
        variantB: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 250, max: 500 }),
          conversions: faker.number.int({ min: 20, max: 40 }),
          revenue: faker.number.float({ min: 2000, max: 4000 })
        }
      },
      losing: {
        variantA: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 100, max: 300 }),
          conversions: faker.number.int({ min: 5, max: 15 }),
          revenue: faker.number.float({ min: 500, max: 1500 })
        },
        variantB: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 400, max: 800 }),
          conversions: faker.number.int({ min: 40, max: 80 }),
          revenue: faker.number.float({ min: 4000, max: 8000 })
        }
      },
      neutral: {
        variantA: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 300, max: 600 }),
          conversions: faker.number.int({ min: 30, max: 60 }),
          revenue: faker.number.float({ min: 3000, max: 6000 })
        },
        variantB: {
          impressions: faker.number.int({ min: 5000, max: 10000 }),
          clicks: faker.number.int({ min: 320, max: 580 }),
          conversions: faker.number.int({ min: 32, max: 58 }),
          revenue: faker.number.float({ min: 3200, max: 5800 })
        }
      }
    };

    const metrics = metricsProfiles[performance];
    
    // Calculate derived metrics
    for (const variant of ['variantA', 'variantB']) {
      const v = metrics[variant as keyof typeof metrics];
      v.ctr = (v.clicks / v.impressions * 100).toFixed(2);
      v.conversionRate = (v.conversions / v.clicks * 100).toFixed(2);
      v.averageOrderValue = (v.revenue / v.conversions).toFixed(2);
    }

    return metrics;
  }

  /**
   * Generate anomalous data for failure detection
   */
  static generateAnomalousData(): Record<string, any> {
    return {
      errorRate: faker.number.float({ min: 0.15, max: 0.5 }), // High error rate
      latency: faker.number.int({ min: 5000, max: 20000 }), // High latency
      successRate: faker.number.float({ min: 0.3, max: 0.6 }), // Low success rate
      bounceRate: faker.number.float({ min: 0.6, max: 0.9 }), // High bounce rate
      nullResponses: faker.number.int({ min: 50, max: 200 }) // Many null responses
    };
  }

  /**
   * Generate content for different agent types
   */
  static generateContent(agentType: string, quality: 'high' | 'low' = 'high'): string {
    const contentGenerators = {
      marketing: {
        high: () => `Discover ${faker.company.catchPhrase()}. ${faker.marketing.adjective()} solutions that ${faker.company.bs()}. Join ${faker.number.int({ min: 1000, max: 50000 })} satisfied customers today!`,
        low: () => `Buy now! ${faker.lorem.word()}. Click here. Best price. Limited time.`
      },
      sales: {
        high: () => `Dear ${faker.person.firstName()}, I noticed your company ${faker.company.name()} is growing rapidly. Our solution can help you ${faker.company.bs()}. I'd love to schedule a 15-minute call to discuss how we've helped similar companies achieve ${faker.number.int({ min: 20, max: 200 })}% growth.`,
        low: () => `Hi, buy our product. It's good. Call me.`
      },
      support: {
        high: () => `Thank you for reaching out. I understand your concern about ${faker.hacker.noun()}. Let me help you resolve this. First, please try ${faker.hacker.phrase()}. If that doesn't work, I can escalate this to our technical team.`,
        low: () => `Try turning it off and on again.`
      },
      analytics: {
        high: () => `Analysis for ${faker.date.month()}: Revenue increased by ${faker.number.int({ min: 5, max: 30 })}% compared to last period. Key drivers include improved ${faker.commerce.department()} performance and ${faker.number.int({ min: 10, max: 50 })}% reduction in ${faker.hacker.noun()}.`,
        low: () => `Numbers went up. Good month.`
      }
    };

    const generator = contentGenerators[agentType as keyof typeof contentGenerators];
    if (!generator) {
      return quality === 'high' 
        ? faker.lorem.paragraph() 
        : faker.lorem.sentence();
    }

    return generator[quality]();
  }

  /**
   * Generate model training data
   */
  static generateTrainingData(
    agentType: string,
    count: number,
    quality: 'high' | 'mixed' = 'high'
  ): Array<{ input: string; output: string; score: number }> {
    const trainingData = [];

    for (let i = 0; i < count; i++) {
      const isHighQuality = quality === 'high' || Math.random() > 0.3;
      
      trainingData.push({
        input: faker.lorem.sentence(),
        output: this.generateContent(agentType, isHighQuality ? 'high' : 'low'),
        score: isHighQuality 
          ? faker.number.float({ min: 0.8, max: 1.0 })
          : faker.number.float({ min: 0.2, max: 0.5 })
      });
    }

    return trainingData;
  }

  /**
   * Generate performance degradation pattern
   */
  static generateDegradationPattern(
    duration: number,
    severity: 'mild' | 'moderate' | 'severe'
  ): Array<{ timestamp: Date; metrics: PerformanceProfile }> {
    const patterns = [];
    const intervals = 10;
    const severityFactors = {
      mild: 0.9,
      moderate: 0.7,
      severe: 0.4
    };

    const factor = severityFactors[severity];

    for (let i = 0; i <= intervals; i++) {
      const degradation = 1 - (i / intervals) * (1 - factor);
      
      patterns.push({
        timestamp: new Date(Date.now() + (duration / intervals) * i),
        metrics: {
          successRate: 0.95 * degradation,
          averageLatency: 100 / degradation,
          errorRate: 0.05 / degradation,
          conversionRate: 0.10 * degradation
        }
      });
    }

    return patterns;
  }
}

export class FeedbackSimulator {
  private organizationId: string;
  private agentId: string;
  private experimentId?: string;

  constructor(organizationId: string, agentId: string, experimentId?: string) {
    this.organizationId = organizationId;
    this.agentId = agentId;
    this.experimentId = experimentId;
  }

  /**
   * Simulate realistic user behavior pattern
   */
  async simulateUserSession(
    duration: number,
    behavior: 'engaged' | 'bounced' | 'converted'
  ): Promise<GeneratedFeedback[]> {
    const feedbacks: GeneratedFeedback[] = [];
    const startTime = Date.now();

    const behaviorPatterns = {
      engaged: async () => {
        // View -> Multiple clicks -> Maybe convert
        feedbacks.push(this.createEvent('view'));
        await this.delay(faker.number.int({ min: 1000, max: 3000 }));
        
        for (let i = 0; i < faker.number.int({ min: 2, max: 5 }); i++) {
          feedbacks.push(this.createEvent('click'));
          await this.delay(faker.number.int({ min: 2000, max: 5000 }));
        }
        
        if (Math.random() > 0.5) {
          feedbacks.push(this.createEvent('conversion'));
        }
      },
      bounced: async () => {
        // View -> Quick exit
        feedbacks.push(this.createEvent('view'));
        await this.delay(faker.number.int({ min: 500, max: 2000 }));
        feedbacks.push(this.createEvent('bounce'));
      },
      converted: async () => {
        // View -> Click -> Convert
        feedbacks.push(this.createEvent('view'));
        await this.delay(faker.number.int({ min: 1000, max: 2000 }));
        feedbacks.push(this.createEvent('click'));
        await this.delay(faker.number.int({ min: 2000, max: 4000 }));
        feedbacks.push(this.createEvent('conversion'));
      }
    };

    await behaviorPatterns[behavior]();

    return feedbacks;
  }

  private createEvent(eventType: string): GeneratedFeedback {
    return {
      organizationId: this.organizationId,
      agentId: this.agentId,
      experimentId: this.experimentId,
      type: 'implicit',
      metadata: {
        eventType,
        timestamp: new Date().toISOString(),
        sessionId: faker.string.uuid()
      }
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}