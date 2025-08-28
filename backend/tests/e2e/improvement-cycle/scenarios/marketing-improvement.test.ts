import { describe, test, beforeAll, afterAll, expect } from '@jest/globals';
import waitForExpect from 'wait-for-expect';
import { ImprovementCycleApiClient } from '../utils/api-clients';
import { TestDataGenerator, FeedbackSimulator } from '../utils/data-generators';
import { TestDataSeeder } from '../setup/seed-data';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

describe('Marketing Agent Improvement Scenarios', () => {
  let apiClient: ImprovementCycleApiClient;
  let seeder: TestDataSeeder;
  let testOrg: any;
  let marketingAgent: any;

  beforeAll(async () => {
    apiClient = new ImprovementCycleApiClient('test_api_key');
    seeder = new TestDataSeeder();
    
    // Create dedicated test data
    await seeder.initialize();
    const orgs = await seeder.seedOrganizations(1);
    testOrg = orgs[0];
    
    const agents = await seeder.seedAgents([testOrg]);
    marketingAgent = agents.find(a => a.type === 'marketing');
  }, 60000);

  afterAll(async () => {
    await apiClient.cleanup();
  });

  describe('Email Campaign Optimization', () => {
    test('should optimize email subject lines for open rates', async () => {
      // Create experiment with different subject line strategies
      const experiment = await apiClient.digitalTwin.createExperiment({
        organizationId: testOrg.id,
        agentId: marketingAgent.id,
        name: 'Email Subject Line A/B Test',
        variantA: {
          strategy: 'urgency',
          template: '⏰ {product} - Only {hours} hours left!',
          personalization: 'low'
        },
        variantB: {
          strategy: 'personalized',
          template: 'Hi {firstName}, your {interest} awaits',
          personalization: 'high'
        },
        trafficSplit: 0.5
      });

      await apiClient.digitalTwin.updateExperimentStatus(experiment.data.id, 'running');

      // Simulate email opens and clicks
      const simulator = new FeedbackSimulator(testOrg.id, marketingAgent.id, experiment.data.id);

      // Variant A: Lower open rates
      for (let i = 0; i < 100; i++) {
        if (Math.random() < 0.15) { // 15% open rate
          await apiClient.feedbackCollector.submitFeedback({
            organizationId: testOrg.id,
            agentId: marketingAgent.id,
            experimentId: experiment.data.id,
            type: 'implicit',
            metadata: {
              eventType: 'email_open',
              variant: 'A',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      // Variant B: Higher open rates
      for (let i = 0; i < 100; i++) {
        if (Math.random() < 0.35) { // 35% open rate
          await apiClient.feedbackCollector.submitFeedback({
            organizationId: testOrg.id,
            agentId: marketingAgent.id,
            experimentId: experiment.data.id,
            type: 'implicit',
            metadata: {
              eventType: 'email_open',
              variant: 'B',
              timestamp: new Date().toISOString()
            }
          });
        }
      }

      // Check results
      const metrics = await apiClient.digitalTwin.getExperimentMetrics(experiment.data.id);
      const comparison = await apiClient.digitalTwin.compareVariants(experiment.data.id);

      expect(comparison.data.winner).toBe('B');
      expect(metrics.data.variantB.openRate).toBeGreaterThan(metrics.data.variantA.openRate);

      logger.info('Email subject line optimization completed');
    }, 120000);

    test('should optimize content tone for different audiences', async () => {
      // Test different tones for B2B vs B2C
      const b2bExperiment = await apiClient.digitalTwin.createExperiment({
        organizationId: testOrg.id,
        agentId: marketingAgent.id,
        name: 'B2B Tone Optimization',
        variantA: {
          tone: 'professional',
          formality: 'high',
          jargon: 'technical'
        },
        variantB: {
          tone: 'conversational',
          formality: 'medium',
          jargon: 'simplified'
        }
      });

      await apiClient.digitalTwin.updateExperimentStatus(b2bExperiment.data.id, 'running');

      // Generate content with different tones
      const professionalContent = await apiClient.businessAgents.generateContent(
        marketingAgent.id,
        'Create B2B marketing content for enterprise software'
      );

      const conversationalContent = await apiClient.businessAgents.generateContent(
        marketingAgent.id,
        'Create friendly B2B marketing content for enterprise software'
      );

      // Simulate engagement metrics
      const b2bFeedback = [
        { content: professionalContent.data.id, engagement: 0.75 },
        { content: conversationalContent.data.id, engagement: 0.45 }
      ];

      for (const item of b2bFeedback) {
        await apiClient.feedbackCollector.submitFeedback({
          organizationId: testOrg.id,
          agentId: marketingAgent.id,
          experimentId: b2bExperiment.data.id,
          type: 'implicit',
          metadata: {
            contentId: item.content,
            engagementScore: item.engagement,
            audience: 'b2b'
          }
        });
      }

      // For B2B, professional tone should win
      const b2bComparison = await apiClient.digitalTwin.compareVariants(b2bExperiment.data.id);
      expect(b2bComparison.data.winner).toBe('A');

      logger.info('Content tone optimization completed');
    });

    test('should detect and fix declining CTR in ad campaigns', async () => {
      // Create ad campaign
      const campaign = await apiClient.digitalTwin.createExperiment({
        organizationId: testOrg.id,
        agentId: marketingAgent.id,
        name: 'Display Ad CTR Optimization',
        variantA: {
          adType: 'display',
          cta: 'Learn More',
          design: 'minimalist'
        },
        variantB: {
          adType: 'display',
          cta: 'Get Started Now',
          design: 'vibrant'
        }
      });

      await apiClient.digitalTwin.updateExperimentStatus(campaign.data.id, 'running');

      // Simulate declining performance over time
      const degradationPattern = TestDataGenerator.generateDegradationPattern(
        60000, // 1 minute
        'moderate'
      );

      for (const point of degradationPattern) {
        await apiClient.feedbackCollector.submitEvent({
          organizationId: testOrg.id,
          eventType: 'ad_performance',
          eventData: {
            campaignId: campaign.data.id,
            timestamp: point.timestamp,
            ctr: point.metrics.conversionRate,
            impressions: 1000,
            clicks: Math.floor(1000 * point.metrics.conversionRate)
          }
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // System should detect declining CTR
      await waitForExpect(async () => {
        const metrics = await apiClient.digitalTwin.getExperimentMetrics(campaign.data.id);
        expect(metrics.data.trendAnalysis.direction).toBe('declining');
      }, 30000, 5000);

      // Trigger improvement
      const improvement = await apiClient.improvementOrchestrator.triggerImprovement({
        agentId: marketingAgent.id,
        experimentId: campaign.data.id,
        reason: 'declining_ctr',
        metrics: { ctr_decline: 30 }
      });

      expect(improvement.success).toBe(true);

      logger.info('CTR decline detection and improvement triggered');
    });
  });

  describe('Content Personalization', () => {
    test('should personalize content based on user segments', async () => {
      const segments = ['tech_enthusiasts', 'price_conscious', 'enterprise_buyers'];
      
      for (const segment of segments) {
        // Generate personalized content for each segment
        const content = await apiClient.contentOptimizer.optimizeContent({
          agentId: marketingAgent.id,
          content: 'Product announcement template',
          targetMetric: segment
        });

        expect(content.success).toBe(true);
        expect(content.data.optimizedFor).toBe(segment);

        // Verify content is different for each segment
        if (segment === 'tech_enthusiasts') {
          expect(content.data.content).toContain('innovative');
        } else if (segment === 'price_conscious') {
          expect(content.data.content).toContain('value');
        } else if (segment === 'enterprise_buyers') {
          expect(content.data.content).toContain('scalable');
        }
      }

      logger.info('Content personalization test completed');
    });

    test('should adapt messaging based on customer journey stage', async () => {
      const journeyStages = [
        { stage: 'awareness', focus: 'education' },
        { stage: 'consideration', focus: 'comparison' },
        { stage: 'decision', focus: 'urgency' },
        { stage: 'retention', focus: 'loyalty' }
      ];

      for (const { stage, focus } of journeyStages) {
        const response = await apiClient.businessAgents.generateContent(
          marketingAgent.id,
          `Create ${stage} stage content focusing on ${focus}`
        );

        expect(response.success).toBe(true);
        
        // Submit feedback based on stage effectiveness
        const effectiveness = {
          awareness: 0.7,
          consideration: 0.8,
          decision: 0.9,
          retention: 0.85
        };

        await apiClient.feedbackCollector.submitFeedback({
          organizationId: testOrg.id,
          agentId: marketingAgent.id,
          type: 'implicit',
          metadata: {
            stage,
            effectiveness: effectiveness[stage as keyof typeof effectiveness],
            contentId: response.data.id
          }
        });
      }

      // Verify agent learns from journey stage feedback
      const agentMetrics = await apiClient.businessAgents.getAgentMetrics(marketingAgent.id);
      expect(agentMetrics.data.journeyOptimization).toBeDefined();

      logger.info('Journey stage adaptation test completed');
    });
  });

  describe('Multi-channel Campaign Coordination', () => {
    test('should coordinate messaging across email, social, and web', async () => {
      const channels = ['email', 'social', 'web'];
      const campaignId = 'multi-channel-campaign-001';

      // Create coordinated campaign
      const campaignContents = await Promise.all(
        channels.map(channel => 
          apiClient.contentOptimizer.optimizeContent({
            agentId: marketingAgent.id,
            content: 'Black Friday Sale Announcement',
            targetMetric: `${channel}_engagement`
          })
        )
      );

      // Ensure consistency across channels
      const messages = campaignContents.map(c => c.data.content);
      
      // All should mention the same offer
      messages.forEach(msg => {
        expect(msg).toContain('Black Friday');
      });

      // Track cross-channel performance
      for (const channel of channels) {
        await apiClient.feedbackCollector.submitEvent({
          organizationId: testOrg.id,
          eventType: 'channel_performance',
          eventData: {
            campaignId,
            channel,
            impressions: 10000,
            engagement: Math.random() * 0.5,
            conversions: Math.floor(Math.random() * 100)
          }
        });
      }

      // Aggregate cross-channel metrics
      const aggregatedMetrics = await apiClient.feedbackCollector.getAggregatedFeedback({
        agentId: marketingAgent.id,
        period: 'day'
      });

      expect(aggregatedMetrics.data.channels).toBeDefined();
      expect(Object.keys(aggregatedMetrics.data.channels)).toEqual(
        expect.arrayContaining(channels)
      );

      logger.info('Multi-channel coordination test completed');
    });
  });
});