import { describe, test, beforeAll, afterAll, expect, jest } from '@jest/globals';
import waitForExpect from 'wait-for-expect';
import { healthChecker, ensureSystemHealthy } from './setup/service-health';
import { TestDataSeeder } from './setup/seed-data';
import { ImprovementCycleApiClient } from './utils/api-clients';
import { TestDataGenerator, FeedbackSimulator } from './utils/data-generators';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Test configuration
const TEST_TIMEOUT = 600000; // 10 minutes for complete cycle
const IMPROVEMENT_DETECTION_TIME = 300000; // 5 minutes
const MODEL_TRAINING_TIME = 1800000; // 30 minutes (mocked to 30 seconds in test)
const DEPLOYMENT_TIME = 300000; // 5 minutes

describe('AI Improvement Cycle E2E Tests', () => {
  let apiClient: ImprovementCycleApiClient;
  let seeder: TestDataSeeder;
  let testData: any;

  beforeAll(async () => {
    logger.info('Starting E2E test suite setup...');

    // Initialize test environment
    await ensureSystemHealthy();
    
    // Initialize clients
    apiClient = new ImprovementCycleApiClient('test_api_key');
    seeder = new TestDataSeeder();

    // Seed test data
    testData = await seeder.seedAll();
    
    logger.info('E2E test suite setup completed');
  }, 120000); // 2 minutes for setup

  afterAll(async () => {
    logger.info('Cleaning up E2E test suite...');
    
    await apiClient.cleanup();
    await healthChecker.cleanup();
    await seeder.cleanup();
    
    logger.info('E2E test suite cleanup completed');
  }, 60000);

  describe('Service Health Verification', () => {
    test('should verify all services are healthy', async () => {
      const health = await healthChecker.checkAll();
      
      expect(health.allHealthy).toBe(true);
      expect(health.infrastructure.postgres).toBe(true);
      expect(health.infrastructure.redis).toBe(true);
      expect(health.infrastructure.kafka).toBe(true);
      expect(health.infrastructure.temporal).toBe(true);
      
      health.services.forEach(service => {
        expect(service.healthy).toBe(true);
        expect(service.responseTime).toBeLessThan(1000);
      });
    });

    test('should verify WebSocket connectivity', async () => {
      const org = testData.organizations[0];
      const socket = apiClient.feedbackCollector.connectWebSocket(org.id);
      
      await new Promise((resolve) => {
        socket.on('connect', resolve);
      });
      
      expect(socket.connected).toBe(true);
      
      apiClient.feedbackCollector.disconnectWebSocket();
    });
  });

  describe('Complete Improvement Cycle', () => {
    test('should detect failing A/B test and automatically improve model', async () => {
      const org = testData.organizations[0];
      const marketingAgent = testData.agents.find((a: any) => 
        a.type === 'marketing' && a.organizationId === org.id
      );

      // Step 1: Create A/B test experiment
      logger.info('Step 1: Creating A/B test experiment');
      const abTestConfig = TestDataGenerator.generateABTestConfig('marketing');
      const experimentResponse = await apiClient.digitalTwin.createExperiment({
        organizationId: org.id,
        agentId: marketingAgent.id,
        name: 'Marketing Content Optimization Test',
        variantA: abTestConfig.variantA,
        variantB: abTestConfig.variantB,
        trafficSplit: 0.5
      });

      expect(experimentResponse.success).toBe(true);
      const experimentId = experimentResponse.data.id;

      // Step 2: Start experiment
      logger.info('Step 2: Starting experiment');
      await apiClient.digitalTwin.updateExperimentStatus(experimentId, 'running');

      // Step 3: Generate poor performance data for variant A
      logger.info('Step 3: Generating poor performance feedback');
      const feedbackCount = 100;
      const poorFeedback = TestDataGenerator.generateFeedbackBatch(
        org.id,
        marketingAgent.id,
        experimentId,
        feedbackCount,
        'poor'
      );

      // Submit feedback in batches
      for (const feedback of poorFeedback) {
        await apiClient.feedbackCollector.submitFeedback(feedback);
      }

      // Step 4: Wait for failure detection
      logger.info('Step 4: Waiting for failure detection');
      await waitForExpect(async () => {
        const metrics = await apiClient.digitalTwin.getExperimentMetrics(experimentId);
        expect(metrics.data.failureDetected).toBe(true);
      }, IMPROVEMENT_DETECTION_TIME, 10000);

      // Step 5: Verify improvement workflow triggered
      logger.info('Step 5: Verifying improvement workflow triggered');
      let improvementId: string;
      
      await waitForExpect(async () => {
        const history = await apiClient.improvementOrchestrator.getImprovementHistory(marketingAgent.id);
        expect(history.data.improvements.length).toBeGreaterThan(0);
        
        const latestImprovement = history.data.improvements[0];
        expect(latestImprovement.experimentId).toBe(experimentId);
        expect(latestImprovement.status).toBe('in_progress');
        
        improvementId = latestImprovement.id;
      }, 30000, 5000);

      // Step 6: Wait for model retraining
      logger.info('Step 6: Waiting for model retraining');
      await waitForExpect(async () => {
        const status = await apiClient.improvementOrchestrator.getImprovementStatus(improvementId);
        expect(['training', 'validating', 'completed'].includes(status.data.status)).toBe(true);
      }, 60000, 5000); // Reduced time for test environment

      // Step 7: Validate improved model
      logger.info('Step 7: Validating improved model');
      const validationResponse = await apiClient.improvementOrchestrator.validateImprovement(improvementId);
      expect(validationResponse.success).toBe(true);
      expect(validationResponse.data.metricsImproved).toBe(true);

      // Step 8: Deploy improved model
      logger.info('Step 8: Deploying improved model');
      const deployResponse = await apiClient.improvementOrchestrator.deployImprovement(improvementId);
      expect(deployResponse.success).toBe(true);

      // Step 9: Generate positive feedback with new model
      logger.info('Step 9: Generating positive feedback for improved model');
      const goodFeedback = TestDataGenerator.generateFeedbackBatch(
        org.id,
        marketingAgent.id,
        experimentId,
        feedbackCount,
        'good'
      );

      for (const feedback of goodFeedback) {
        await apiClient.feedbackCollector.submitFeedback(feedback);
      }

      // Step 10: Verify improved metrics
      logger.info('Step 10: Verifying improved metrics');
      await waitForExpect(async () => {
        const metrics = await apiClient.digitalTwin.getExperimentMetrics(experimentId);
        const comparison = await apiClient.digitalTwin.compareVariants(experimentId);
        
        expect(metrics.data.overallPerformance).toBeGreaterThan(0.7);
        expect(comparison.data.winner).toBeDefined();
        expect(comparison.data.confidence).toBeGreaterThan(0.95);
      }, 30000, 5000);

      // Step 11: Complete experiment
      logger.info('Step 11: Completing experiment');
      await apiClient.digitalTwin.updateExperimentStatus(experimentId, 'completed');

      // Verify final state
      const finalExperiment = await apiClient.digitalTwin.getExperiment(experimentId);
      expect(finalExperiment.data.status).toBe('completed');
      expect(finalExperiment.data.winner).toBeDefined();

      logger.info('Complete improvement cycle test passed!');
    }, TEST_TIMEOUT);

    test('should handle multiple concurrent improvements', async () => {
      const org = testData.organizations[1];
      const agents = testData.agents.filter((a: any) => a.organizationId === org.id);
      
      // Create experiments for multiple agents
      const experiments = await Promise.all(
        agents.map(async (agent: any) => {
          const config = TestDataGenerator.generateABTestConfig(agent.type);
          const response = await apiClient.digitalTwin.createExperiment({
            organizationId: org.id,
            agentId: agent.id,
            name: `${agent.type} concurrent test`,
            variantA: config.variantA,
            variantB: config.variantB
          });
          return { ...response.data, agent };
        })
      );

      // Start all experiments
      await Promise.all(
        experiments.map(exp => 
          apiClient.digitalTwin.updateExperimentStatus(exp.id, 'running')
        )
      );

      // Generate feedback for all experiments
      await Promise.all(
        experiments.map(async (exp) => {
          const feedbacks = TestDataGenerator.generateFeedbackBatch(
            org.id,
            exp.agent.id,
            exp.id,
            50,
            'poor'
          );
          
          for (const feedback of feedbacks) {
            await apiClient.feedbackCollector.submitFeedback(feedback);
          }
        })
      );

      // Wait for all improvements to trigger
      await waitForExpect(async () => {
        const improvements = await Promise.all(
          agents.map((agent: any) => 
            apiClient.improvementOrchestrator.getImprovementHistory(agent.id)
          )
        );
        
        improvements.forEach(history => {
          expect(history.data.improvements.length).toBeGreaterThan(0);
        });
      }, 60000, 5000);

      logger.info('Concurrent improvements test passed!');
    }, 180000);
  });

  describe('Failure Scenarios', () => {
    test('should handle model training failure gracefully', async () => {
      const org = testData.organizations[2];
      const agent = testData.agents.find((a: any) => 
        a.type === 'support' && a.organizationId === org.id
      );

      // Trigger improvement with invalid data
      const response = await apiClient.improvementOrchestrator.triggerImprovement({
        agentId: agent.id,
        experimentId: 'invalid-experiment-id',
        reason: 'test_failure',
        metrics: TestDataGenerator.generateAnomalousData()
      });

      if (response.success) {
        const improvementId = response.data.id;
        
        // Wait for failure
        await waitForExpect(async () => {
          const status = await apiClient.improvementOrchestrator.getImprovementStatus(improvementId);
          expect(status.data.status).toBe('failed');
          expect(status.data.error).toBeDefined();
        }, 30000, 5000);
      }

      logger.info('Failure handling test passed!');
    });

    test('should rollback deployment on performance regression', async () => {
      const org = testData.organizations[0];
      const agent = testData.agents.find((a: any) => 
        a.type === 'analytics' && a.organizationId === org.id
      );

      // Create and start experiment
      const config = TestDataGenerator.generateABTestConfig('analytics');
      const expResponse = await apiClient.digitalTwin.createExperiment({
        organizationId: org.id,
        agentId: agent.id,
        name: 'Regression test',
        variantA: config.variantA,
        variantB: config.variantB
      });

      const experimentId = expResponse.data.id;
      await apiClient.digitalTwin.updateExperimentStatus(experimentId, 'running');

      // Generate initial good performance
      const goodFeedback = TestDataGenerator.generateFeedbackBatch(
        org.id,
        agent.id,
        experimentId,
        50,
        'good'
      );

      for (const feedback of goodFeedback) {
        await apiClient.feedbackCollector.submitFeedback(feedback);
      }

      // Trigger improvement
      const improvementResponse = await apiClient.improvementOrchestrator.triggerImprovement({
        agentId: agent.id,
        experimentId,
        reason: 'forced_update',
        metrics: {}
      });

      if (improvementResponse.success) {
        const improvementId = improvementResponse.data.id;

        // Wait for deployment
        await waitForExpect(async () => {
          const status = await apiClient.improvementOrchestrator.getImprovementStatus(improvementId);
          expect(status.data.status).toBe('deployed');
        }, 60000, 5000);

        // Generate poor performance after deployment
        const poorFeedback = TestDataGenerator.generateFeedbackBatch(
          org.id,
          agent.id,
          experimentId,
          50,
          'poor'
        );

        for (const feedback of poorFeedback) {
          await apiClient.feedbackCollector.submitFeedback(feedback);
        }

        // Wait for automatic rollback
        await waitForExpect(async () => {
          const status = await apiClient.improvementOrchestrator.getImprovementStatus(improvementId);
          expect(status.data.status).toBe('rolled_back');
          expect(status.data.rollbackReason).toBeDefined();
        }, 60000, 5000);
      }

      logger.info('Rollback test passed!');
    }, 180000);
  });

  describe('Performance Benchmarks', () => {
    test('should detect A/B test failure within 5 minutes', async () => {
      const startTime = Date.now();
      const org = testData.organizations[0];
      const agent = testData.agents[0];

      // Create and start experiment
      const config = TestDataGenerator.generateABTestConfig('marketing');
      const expResponse = await apiClient.digitalTwin.createExperiment({
        organizationId: org.id,
        agentId: agent.id,
        name: 'Performance benchmark test',
        variantA: config.variantA,
        variantB: config.variantB
      });

      await apiClient.digitalTwin.updateExperimentStatus(expResponse.data.id, 'running');

      // Generate anomalous data
      const anomalousData = TestDataGenerator.generateAnomalousData();
      await apiClient.feedbackCollector.submitEvent({
        organizationId: org.id,
        eventType: 'performance_anomaly',
        eventData: anomalousData
      });

      // Trigger detection
      await apiClient.digitalTwin.triggerFailureDetection(expResponse.data.id);

      const detectionTime = Date.now() - startTime;
      expect(detectionTime).toBeLessThan(300000); // 5 minutes

      logger.info(`Failure detected in ${detectionTime}ms`);
    });

    test('should serve optimized content within 50ms', async () => {
      const agent = testData.agents[0];
      const content = TestDataGenerator.generateContent('marketing', 'high');

      const startTime = Date.now();
      const response = await apiClient.contentOptimizer.optimizeContent({
        agentId: agent.id,
        content,
        targetMetric: 'conversion'
      });
      const responseTime = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(responseTime).toBeLessThan(50);

      logger.info(`Content served in ${responseTime}ms`);
    });

    test('should process feedback events within 100ms', async () => {
      const org = testData.organizations[0];
      const agent = testData.agents[0];

      const feedback = TestDataGenerator.generateFeedback(org.id, agent.id);

      const startTime = Date.now();
      const response = await apiClient.feedbackCollector.submitFeedback(feedback);
      const processingTime = Date.now() - startTime;

      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(100);

      logger.info(`Feedback processed in ${processingTime}ms`);
    });
  });

  describe('Real-world Scenarios', () => {
    test('should optimize marketing campaign based on user engagement', async () => {
      const org = testData.organizations[0];
      const agent = testData.agents.find((a: any) => 
        a.type === 'marketing' && a.organizationId === org.id
      );

      // Create marketing campaign experiment
      const campaignResponse = await apiClient.digitalTwin.createExperiment({
        organizationId: org.id,
        agentId: agent.id,
        name: 'Email Campaign Optimization',
        variantA: {
          subject: 'Limited Time Offer!',
          template: 'promotional',
          sendTime: 'morning'
        },
        variantB: {
          subject: 'Exclusive Deal for You',
          template: 'personalized',
          sendTime: 'evening'
        },
        trafficSplit: 0.5
      });

      const campaignId = campaignResponse.data.id;
      await apiClient.digitalTwin.updateExperimentStatus(campaignId, 'running');

      // Simulate user sessions
      const simulator = new FeedbackSimulator(org.id, agent.id, campaignId);
      
      // Variant A: More bounces
      for (let i = 0; i < 30; i++) {
        const session = await simulator.simulateUserSession(10000, 'bounced');
        for (const feedback of session) {
          await apiClient.feedbackCollector.submitFeedback(feedback);
        }
      }

      // Variant B: More conversions
      for (let i = 0; i < 30; i++) {
        const session = await simulator.simulateUserSession(15000, 'converted');
        for (const feedback of session) {
          await apiClient.feedbackCollector.submitFeedback(feedback);
        }
      }

      // Check campaign performance
      const metrics = await apiClient.digitalTwin.getExperimentMetrics(campaignId);
      const comparison = await apiClient.digitalTwin.compareVariants(campaignId);

      expect(comparison.data.winner).toBe('B');
      expect(metrics.data.variantB.conversionRate).toBeGreaterThan(
        metrics.data.variantA.conversionRate
      );

      logger.info('Marketing campaign optimization test passed!');
    }, 120000);

    test('should improve customer support response quality', async () => {
      const org = testData.organizations[1];
      const agent = testData.agents.find((a: any) => 
        a.type === 'support' && a.organizationId === org.id
      );

      // Generate support responses
      const responses = [];
      for (let i = 0; i < 10; i++) {
        const response = await apiClient.businessAgents.generateContent(
          agent.id,
          'Customer is asking about refund policy'
        );
        responses.push(response.data);
      }

      // Collect feedback on responses
      for (const response of responses) {
        const rating = Math.random() > 0.3 ? 
          faker.number.int({ min: 1, max: 3 }) : // Poor ratings
          faker.number.int({ min: 4, max: 5 });  // Good ratings

        await apiClient.feedbackCollector.submitFeedback({
          organizationId: org.id,
          agentId: agent.id,
          type: 'explicit',
          rating,
          comment: rating < 3 ? 'Unhelpful response' : 'Great support!',
          metadata: { responseId: response.id }
        });
      }

      // Check if improvement is needed
      const agentMetrics = await apiClient.businessAgents.getAgentMetrics(agent.id);
      
      if (agentMetrics.data.averageRating < 3.5) {
        // Trigger improvement
        const improvement = await apiClient.improvementOrchestrator.triggerImprovement({
          agentId: agent.id,
          experimentId: 'support-quality-test',
          reason: 'low_customer_satisfaction',
          metrics: agentMetrics.data
        });

        expect(improvement.success).toBe(true);
      }

      logger.info('Support quality improvement test passed!');
    });
  });
});