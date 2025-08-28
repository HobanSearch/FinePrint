/**
 * LoRA Service Integration Tests
 */

import { FastifyInstance } from 'fastify';
import { build } from '../../src/app';
import { LoRAService } from '../../src/services/lora-service';
import { TrainingService } from '../../src/services/training-service';
import { MultiModelManager } from '../../src/services/multi-model-manager';
import Redis from 'ioredis';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('LoRA Service Integration', () => {
  let app: FastifyInstance;
  let loraService: LoRAService;
  let redisClient: Redis;
  let pgPool: Pool;
  const testModelPath = '/tmp/test-lora-models';

  beforeAll(async () => {
    // Create test directories
    await fs.mkdir(testModelPath, { recursive: true });

    // Setup test database and Redis
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 2, // Use separate DB for tests
    });

    pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'fineprintai_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Build app with test config
    app = await build({
      logger: false,
      redis: redisClient,
      postgres: pgPool,
      modelPath: testModelPath,
    });

    await app.ready();

    // Get service instance
    loraService = app.loraService;
  });

  afterAll(async () => {
    await app.close();
    await redisClient.quit();
    await pgPool.end();
    
    // Cleanup test files
    await fs.rm(testModelPath, { recursive: true, force: true });
  });

  beforeEach(async () => {
    // Clear test data
    await redisClient.flushdb();
    await pgPool.query('TRUNCATE TABLE lora_adapters, training_jobs, model_performance RESTART IDENTITY CASCADE');
  });

  describe('LoRA Adapter Training', () => {
    it('should train a marketing domain adapter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/train',
        payload: {
          domain: 'marketing',
          baseModel: 'mistral-7b',
          trainingData: [
            {
              input: 'Write a compelling email subject line for Fine Print AI targeting lawyers',
              output: 'Legal Teams: Cut Contract Review Time by 80% with AI',
              metadata: {
                openRate: 0.32,
                clickRate: 0.15,
              },
            },
            {
              input: 'Create a social media post about document analysis features',
              output: '🔍 Did you know Fine Print AI can detect 50+ types of problematic clauses in seconds? Your legal team will love the time savings! #LegalTech #AI',
              metadata: {
                engagement: 0.08,
                shares: 25,
              },
            },
          ],
          config: {
            rank: 16,
            alpha: 32,
            learningRate: 2e-4,
            epochs: 3,
            batchSize: 4,
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(202);
      const result = response.json();
      
      expect(result.jobId).toBeTruthy();
      expect(result.status).toBe('queued');
      expect(result.estimatedTime).toBeGreaterThan(0);

      // Check job status
      const statusResponse = await app.inject({
        method: 'GET',
        url: `/api/lora/jobs/${result.jobId}`,
      });

      expect(statusResponse.statusCode).toBe(200);
      const status = statusResponse.json();
      expect(['queued', 'training', 'completed']).toContain(status.status);
    });

    it('should train a sales domain adapter with custom metrics', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/train',
        payload: {
          domain: 'sales',
          baseModel: 'llama2-13b',
          trainingData: [
            {
              input: 'Respond to objection: Your product is too expensive for our startup',
              output: 'I understand budget is crucial for startups. Our starter plan at $29/month actually saves money by preventing costly legal issues. One missed problematic clause can cost thousands.',
              metadata: {
                conversionRate: 0.28,
                dealSize: 348,
                responseEffectiveness: 0.85,
              },
            },
          ],
          config: {
            rank: 32,
            targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj'],
            optimizationObjective: 'maximize_conversion',
          },
        },
      });

      expect(response.statusCode).toBe(202);
      const result = response.json();
      expect(result.config.optimizationObjective).toBe('maximize_conversion');
    });
  });

  describe('Model Deployment and Inference', () => {
    it('should deploy trained adapter and run inference', async () => {
      // First, create a mock trained adapter
      const adapterId = 'test_adapter_001';
      await pgPool.query(
        `INSERT INTO lora_adapters 
         (id, domain, base_model, config, status, performance_metrics, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          adapterId,
          'support',
          'phi-2',
          JSON.stringify({ rank: 8, alpha: 16 }),
          'completed',
          JSON.stringify({ accuracy: 0.92, latency: 145 }),
        ]
      );

      // Deploy adapter
      const deployResponse = await app.inject({
        method: 'POST',
        url: `/api/lora/adapters/${adapterId}/deploy`,
        payload: {
          environment: 'production',
          scalingConfig: {
            minInstances: 1,
            maxInstances: 5,
            targetUtilization: 0.7,
          },
        },
      });

      expect(deployResponse.statusCode).toBe(200);
      const deployment = deployResponse.json();
      expect(deployment.status).toBe('deployed');

      // Run inference
      const inferenceResponse = await app.inject({
        method: 'POST',
        url: '/api/lora/inference',
        payload: {
          domain: 'support',
          input: 'Customer says: I cannot access my account after the update',
          config: {
            temperature: 0.7,
            maxTokens: 150,
            topP: 0.9,
          },
        },
      });

      expect(inferenceResponse.statusCode).toBe(200);
      const inference = inferenceResponse.json();
      
      expect(inference.output).toBeTruthy();
      expect(inference.adapterId).toBe(adapterId);
      expect(inference.latency).toBeGreaterThan(0);
    });
  });

  describe('Multi-Model Management', () => {
    it('should manage multiple adapters per domain', async () => {
      // Create multiple adapters for A/B testing
      const adapters = [
        {
          id: 'marketing_v1',
          domain: 'marketing',
          baseModel: 'mistral-7b',
          performance: { engagement: 0.25 },
        },
        {
          id: 'marketing_v2',
          domain: 'marketing',
          baseModel: 'mistral-7b',
          performance: { engagement: 0.28 },
        },
        {
          id: 'marketing_v3',
          domain: 'marketing',
          baseModel: 'mixtral-8x7b',
          performance: { engagement: 0.31 },
        },
      ];

      // Insert test adapters
      for (const adapter of adapters) {
        await pgPool.query(
          `INSERT INTO lora_adapters 
           (id, domain, base_model, config, status, performance_metrics, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            adapter.id,
            adapter.domain,
            adapter.baseModel,
            JSON.stringify({ rank: 16 }),
            'completed',
            JSON.stringify(adapter.performance),
          ]
        );
      }

      // Configure A/B testing
      const configResponse = await app.inject({
        method: 'PUT',
        url: '/api/lora/domains/marketing/config',
        payload: {
          strategy: 'weighted_performance',
          adapters: [
            { id: 'marketing_v1', weight: 0.2 },
            { id: 'marketing_v2', weight: 0.3 },
            { id: 'marketing_v3', weight: 0.5 },
          ],
          performanceTracking: {
            metrics: ['engagement', 'conversion'],
            windowSize: 1000,
          },
        },
      });

      expect(configResponse.statusCode).toBe(200);

      // Get domain status
      const statusResponse = await app.inject({
        method: 'GET',
        url: '/api/lora/domains/marketing',
      });

      expect(statusResponse.statusCode).toBe(200);
      const status = statusResponse.json();
      
      expect(status.adapters).toHaveLength(3);
      expect(status.activeStrategy).toBe('weighted_performance');
      expect(status.bestPerforming.id).toBe('marketing_v3');
    });

    it('should automatically select best adapter based on context', async () => {
      // Configure contextual selection
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/selection/rules',
        payload: {
          domain: 'sales',
          rules: [
            {
              name: 'enterprise_clients',
              condition: {
                audience: 'enterprise',
                dealSize: { $gte: 10000 },
              },
              adapterId: 'sales_enterprise_v2',
              priority: 10,
            },
            {
              name: 'startup_clients',
              condition: {
                audience: 'startup',
                dealSize: { $lt: 1000 },
              },
              adapterId: 'sales_startup_v1',
              priority: 5,
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);

      // Test selection
      const selectionResponse = await app.inject({
        method: 'POST',
        url: '/api/lora/select',
        payload: {
          domain: 'sales',
          context: {
            audience: 'enterprise',
            dealSize: 50000,
            industry: 'finance',
          },
        },
      });

      expect(selectionResponse.statusCode).toBe(200);
      const selection = selectionResponse.json();
      expect(selection.adapterId).toBe('sales_enterprise_v2');
      expect(selection.rule).toBe('enterprise_clients');
    });
  });

  describe('Continuous Learning', () => {
    it('should collect feedback and trigger retraining', async () => {
      const adapterId = 'support_v1';

      // Submit feedback
      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/lora/feedback',
          payload: {
            adapterId,
            input: `Customer issue ${i}`,
            output: `Support response ${i}`,
            feedback: {
              rating: 3 + Math.random() * 2, // 3-5 rating
              resolved: Math.random() > 0.3,
              responseTime: 60 + Math.random() * 240,
            },
          },
        });
      }

      // Check if retraining was triggered
      const jobsResponse = await app.inject({
        method: 'GET',
        url: `/api/lora/adapters/${adapterId}/jobs`,
      });

      expect(jobsResponse.statusCode).toBe(200);
      const jobs = jobsResponse.json();
      
      const retrainingJob = jobs.find((j: any) => j.type === 'retrain');
      expect(retrainingJob).toBeTruthy();
    });

    it('should update adapter based on performance drift', async () => {
      const adapterId = 'marketing_prod';

      // Simulate performance degradation
      const metrics = [];
      for (let i = 0; i < 20; i++) {
        const degradation = i * 0.01; // Gradual degradation
        await app.inject({
          method: 'POST',
          url: '/api/lora/metrics',
          payload: {
            adapterId,
            timestamp: new Date(Date.now() - (20 - i) * 60000), // Last 20 minutes
            metrics: {
              engagement: 0.3 - degradation,
              clickRate: 0.15 - degradation / 2,
            },
          },
        });
      }

      // Check drift detection
      const driftResponse = await app.inject({
        method: 'GET',
        url: `/api/lora/adapters/${adapterId}/drift`,
      });

      expect(driftResponse.statusCode).toBe(200);
      const drift = driftResponse.json();
      
      expect(drift.detected).toBe(true);
      expect(drift.severity).toBeGreaterThan(0.1);
      expect(drift.recommendation).toContain('retrain');
    });
  });

  describe('Model Version Control', () => {
    it('should manage adapter versions', async () => {
      const baseId = 'sales_base';

      // Create versions
      const versions = ['1.0.0', '1.1.0', '2.0.0'];
      for (const version of versions) {
        await app.inject({
          method: 'POST',
          url: '/api/lora/adapters',
          payload: {
            id: `${baseId}_v${version}`,
            domain: 'sales',
            baseModel: 'llama2-13b',
            version,
            parentVersion: version === '1.0.0' ? null : versions[versions.indexOf(version) - 1],
            changelog: `Version ${version} improvements`,
          },
        });
      }

      // Get version history
      const historyResponse = await app.inject({
        method: 'GET',
        url: `/api/lora/adapters/${baseId}/versions`,
      });

      expect(historyResponse.statusCode).toBe(200);
      const history = historyResponse.json();
      
      expect(history.versions).toHaveLength(3);
      expect(history.latest).toBe('2.0.0');
      expect(history.versions[0].version).toBe('1.0.0');
    });

    it('should support rollback to previous version', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/adapters/marketing_v2/rollback',
        payload: {
          targetVersion: '1.5.0',
          reason: 'Performance regression in v2.0',
        },
      });

      expect(response.statusCode).toBe(200);
      const rollback = response.json();
      
      expect(rollback.previousVersion).toBe('2.0.0');
      expect(rollback.currentVersion).toBe('1.5.0');
      expect(rollback.status).toBe('completed');
    });
  });

  describe('Export and Import', () => {
    it('should export adapter for sharing', async () => {
      const adapterId = 'export_test';

      // Create adapter
      await pgPool.query(
        `INSERT INTO lora_adapters 
         (id, domain, base_model, config, status, performance_metrics)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          adapterId,
          'legal',
          'mixtral-8x7b',
          JSON.stringify({ rank: 32, alpha: 64 }),
          'completed',
          JSON.stringify({ accuracy: 0.94 }),
        ]
      );

      const response = await app.inject({
        method: 'GET',
        url: `/api/lora/adapters/${adapterId}/export`,
      });

      expect(response.statusCode).toBe(200);
      const exported = response.json();
      
      expect(exported.adapter.id).toBe(adapterId);
      expect(exported.format).toBe('fineprintai-lora-v1');
      expect(exported.checksum).toBeTruthy();
      expect(exported.weights).toBeTruthy();
    });

    it('should import adapter from export', async () => {
      const importData = {
        adapter: {
          id: 'imported_adapter',
          domain: 'support',
          baseModel: 'phi-2',
          config: { rank: 8, alpha: 16 },
        },
        format: 'fineprintai-lora-v1',
        weights: 'base64_encoded_weights_here',
        checksum: 'sha256_checksum',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/import',
        payload: importData,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.adapterId).toBeTruthy();
      expect(result.status).toBe('imported');
      expect(result.validated).toBe(true);
    });
  });

  describe('Performance Benchmarking', () => {
    it('should benchmark adapter performance', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/benchmark',
        payload: {
          adapterId: 'benchmark_test',
          benchmarks: [
            {
              name: 'latency_test',
              type: 'latency',
              config: {
                requests: 100,
                concurrency: 10,
              },
            },
            {
              name: 'quality_test',
              type: 'quality',
              config: {
                dataset: 'marketing_eval_v1',
                metrics: ['bleu', 'rouge', 'business_impact'],
              },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(202);
      const benchmark = response.json();
      
      expect(benchmark.jobId).toBeTruthy();
      expect(benchmark.estimatedDuration).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle training data validation errors', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/train',
        payload: {
          domain: 'invalid',
          baseModel: 'unknown-model',
          trainingData: [], // Empty training data
          config: {
            rank: 1000, // Invalid rank
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      
      expect(error.error).toContain('validation');
      expect(error.details).toBeTruthy();
    });

    it('should handle resource constraints', async () => {
      // Attempt to train with resource constraints
      const response = await app.inject({
        method: 'POST',
        url: '/api/lora/train',
        payload: {
          domain: 'marketing',
          baseModel: 'llama2-70b', // Large model
          trainingData: Array(10000).fill({
            input: 'test',
            output: 'test',
          }),
          config: {
            rank: 128,
            batchSize: 32,
          },
        },
      });

      expect(response.statusCode).toBe(507);
      const error = response.json();
      expect(error.error).toContain('resources');
    });
  });

  describe('Monitoring and Analytics', () => {
    it('should track adapter usage analytics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/lora/analytics?domain=marketing&period=24h',
      });

      expect(response.statusCode).toBe(200);
      const analytics = response.json();
      
      expect(analytics.usage).toBeTruthy();
      expect(analytics.performance).toBeTruthy();
      expect(analytics.costs).toBeTruthy();
      expect(analytics.recommendations).toBeInstanceOf(Array);
    });

    it('should provide cost optimization suggestions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/lora/optimize/costs',
      });

      expect(response.statusCode).toBe(200);
      const optimization = response.json();
      
      expect(optimization.currentCosts).toBeTruthy();
      expect(optimization.suggestions).toBeInstanceOf(Array);
      expect(optimization.potentialSavings).toBeGreaterThanOrEqual(0);
    });
  });
});