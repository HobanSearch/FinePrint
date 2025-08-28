/**
 * DSPy Service Integration Tests
 */

import { FastifyInstance } from 'fastify';
import { build } from '../../src/app';
import { DSPyService } from '../../src/services/dspy-service';
import { BusinessContextService } from '../../src/services/business-context';
import { LearningService } from '../../src/services/learning-service';
import Redis from 'ioredis';
import { Pool } from 'pg';

describe('DSPy Service Integration', () => {
  let app: FastifyInstance;
  let dspyService: DSPyService;
  let redisClient: Redis;
  let pgPool: Pool;

  beforeAll(async () => {
    // Setup test database and Redis
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 1, // Use separate DB for tests
    });

    pgPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'fineprintai_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Build app
    app = await build({
      logger: false,
      redis: redisClient,
      postgres: pgPool,
    });

    await app.ready();

    // Get service instance
    dspyService = app.dspyService;
  });

  afterAll(async () => {
    await app.close();
    await redisClient.quit();
    await pgPool.end();
  });

  beforeEach(async () => {
    // Clear test data
    await redisClient.flushdb();
    await pgPool.query('TRUNCATE TABLE prompt_optimizations, prompt_metrics RESTART IDENTITY CASCADE');
  });

  describe('Prompt Optimization Flow', () => {
    it('should optimize marketing email prompt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'marketing_email_001',
          domain: 'marketing',
          examples: [
            {
              input: {
                product: 'Fine Print AI',
                audience: 'Legal departments',
                tone: 'professional',
              },
              output: 'Subject: Revolutionize Your Contract Review Process\\n\\nDear Legal Professional...',
              metadata: {
                openRate: 0.28,
                clickRate: 0.12,
                conversionRate: 0.05,
              },
            },
            {
              input: {
                product: 'Fine Print AI',
                audience: 'Small businesses',
                tone: 'friendly',
              },
              output: 'Subject: Never Miss Hidden Fees Again!\\n\\nHi there...',
              metadata: {
                openRate: 0.35,
                clickRate: 0.18,
                conversionRate: 0.08,
              },
            },
          ],
          initialPrompt: 'Write a marketing email for {product} targeting {audience} with a {tone} tone',
          optimizationConfig: {
            iterations: 5,
            temperature: 0.7,
            evaluationMetrics: ['openRate', 'clickRate', 'conversionRate'],
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.optimizedPrompt).toBeTruthy();
      expect(result.improvement).toBeGreaterThan(0);
      expect(result.metrics).toHaveProperty('openRate');
      expect(result.taskId).toBe('marketing_email_001');
    });

    it('should optimize sales call script prompt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'sales_script_001',
          domain: 'sales',
          examples: [
            {
              input: {
                prospect: 'Enterprise client',
                product: 'Enterprise plan',
                objection: 'Too expensive',
              },
              output: 'I understand your concern about the investment...',
              metadata: {
                conversionRate: 0.15,
                callDuration: 420,
                satisfaction: 4.2,
              },
            },
          ],
          initialPrompt: 'Generate a sales response for {prospect} interested in {product} with objection: {objection}',
          optimizationConfig: {
            iterations: 10,
            evaluationMetrics: ['conversionRate', 'satisfaction'],
          },
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.optimizedPrompt).toContain('sales');
      expect(result.iterations).toBeLessThanOrEqual(10);
    });
  });

  describe('Chain of Thought Optimization', () => {
    it('should create optimized chain for document analysis', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/chain',
        payload: {
          taskId: 'doc_analysis_chain_001',
          domain: 'legal',
          steps: [
            {
              name: 'extract_entities',
              prompt: 'Extract legal entities from: {document}',
              inputMapping: { document: 'input.text' },
            },
            {
              name: 'identify_clauses',
              prompt: 'Identify problematic clauses in {document} involving {entities}',
              inputMapping: {
                document: 'input.text',
                entities: 'steps.extract_entities.output',
              },
            },
            {
              name: 'risk_assessment',
              prompt: 'Assess risk level for {clauses} considering {entities}',
              inputMapping: {
                clauses: 'steps.identify_clauses.output',
                entities: 'steps.extract_entities.output',
              },
            },
          ],
          examples: [
            {
              input: { text: 'This Agreement between Company A and User B...' },
              expectedOutput: {
                entities: ['Company A', 'User B'],
                clauses: ['Arbitration clause', 'Liability waiver'],
                riskLevel: 'High',
              },
            },
          ],
        },
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.chain).toBeTruthy();
      expect(result.chain.steps).toHaveLength(3);
      expect(result.optimizedSteps).toBeTruthy();
    });
  });

  describe('Performance Tracking', () => {
    it('should track prompt performance over time', async () => {
      const taskId = 'perf_test_001';

      // Initial optimization
      await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId,
          domain: 'support',
          examples: [
            {
              input: { issue: 'Cannot login' },
              output: 'Let me help you with the login issue...',
              metadata: { satisfaction: 4.5, resolutionTime: 180 },
            },
          ],
          initialPrompt: 'Help user with: {issue}',
        },
      });

      // Record performance metrics
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: `/api/dspy/tasks/${taskId}/performance`,
          payload: {
            input: { issue: 'Password reset' },
            output: 'To reset your password...',
            metrics: {
              satisfaction: 4.2 + Math.random() * 0.5,
              resolutionTime: 150 + Math.random() * 60,
            },
          },
        });
      }

      // Get performance history
      const response = await app.inject({
        method: 'GET',
        url: `/api/dspy/tasks/${taskId}/performance`,
      });

      expect(response.statusCode).toBe(200);
      const performance = response.json();
      
      expect(performance.metrics).toHaveLength(5);
      expect(performance.averageMetrics).toHaveProperty('satisfaction');
      expect(performance.trend).toBeTruthy();
    });
  });

  describe('Business Context Integration', () => {
    it('should use business context in optimization', async () => {
      // Set business context
      await app.inject({
        method: 'POST',
        url: '/api/dspy/context',
        payload: {
          domain: 'marketing',
          context: {
            brandVoice: 'Professional yet approachable',
            targetAudience: 'B2B SaaS companies',
            valueProposition: 'AI-powered legal document analysis',
            competitiveDifferentiators: [
              'Local LLM processing for privacy',
              'Real-time risk detection',
              'Industry-specific pattern recognition',
            ],
          },
        },
      });

      // Optimize with context
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'context_aware_001',
          domain: 'marketing',
          examples: [
            {
              input: { topic: 'Product launch' },
              output: 'Introducing Fine Print AI...',
              metadata: { engagement: 0.25 },
            },
          ],
          initialPrompt: 'Write announcement about {topic}',
          useBusinessContext: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.contextUsed).toBe(true);
      expect(result.optimizedPrompt).toContain('professional');
    });
  });

  describe('Learning Integration', () => {
    it('should learn from optimization results', async () => {
      const taskId = 'learning_test_001';

      // Run multiple optimizations
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'POST',
          url: '/api/dspy/optimize',
          payload: {
            taskId: `${taskId}_${i}`,
            domain: 'sales',
            examples: [
              {
                input: { product: 'Pro Plan', audience: 'Startups' },
                output: `Sales pitch ${i}...`,
                metadata: { conversionRate: 0.1 + i * 0.05 },
              },
            ],
            initialPrompt: 'Pitch {product} to {audience}',
          },
        });
      }

      // Get learned patterns
      const response = await app.inject({
        method: 'GET',
        url: '/api/dspy/learning/patterns?domain=sales',
      });

      expect(response.statusCode).toBe(200);
      const patterns = response.json();
      
      expect(patterns.patterns).toBeTruthy();
      expect(patterns.patterns.length).toBeGreaterThan(0);
      expect(patterns.recommendations).toBeTruthy();
    });

    it('should provide optimization suggestions based on learning', async () => {
      // Get suggestions for new task
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/suggest',
        payload: {
          domain: 'marketing',
          taskType: 'email_campaign',
          requirements: {
            audience: 'Enterprise clients',
            goal: 'Product adoption',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const suggestions = response.json();
      
      expect(suggestions.suggestedPrompt).toBeTruthy();
      expect(suggestions.confidence).toBeGreaterThan(0);
      expect(suggestions.basedOn).toBeTruthy();
    });
  });

  describe('Batch Optimization', () => {
    it('should optimize multiple prompts in batch', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/batch/optimize',
        payload: {
          tasks: [
            {
              taskId: 'batch_001',
              domain: 'support',
              initialPrompt: 'Respond to customer complaint: {complaint}',
              examples: [
                {
                  input: { complaint: 'Service is slow' },
                  output: 'We apologize for the inconvenience...',
                  metadata: { satisfaction: 4.0 },
                },
              ],
            },
            {
              taskId: 'batch_002',
              domain: 'sales',
              initialPrompt: 'Follow up on quote for {company}',
              examples: [
                {
                  input: { company: 'Tech Corp' },
                  output: 'Following up on our conversation...',
                  metadata: { responseRate: 0.3 },
                },
              ],
            },
          ],
          parallelism: 2,
        },
      });

      expect(response.statusCode).toBe(200);
      const results = response.json();
      
      expect(results.results).toHaveLength(2);
      expect(results.results[0].taskId).toBe('batch_001');
      expect(results.results[1].taskId).toBe('batch_002');
      expect(results.totalTime).toBeTruthy();
    });
  });

  describe('Export and Import', () => {
    it('should export optimization results', async () => {
      // Create optimization
      await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'export_test_001',
          domain: 'marketing',
          examples: [
            {
              input: { feature: 'AI Analysis' },
              output: 'Revolutionary AI-powered analysis...',
              metadata: { engagement: 0.3 },
            },
          ],
          initialPrompt: 'Describe {feature}',
        },
      });

      // Export
      const response = await app.inject({
        method: 'GET',
        url: '/api/dspy/export?domain=marketing',
      });

      expect(response.statusCode).toBe(200);
      const exported = response.json();
      
      expect(exported.optimizations).toBeTruthy();
      expect(exported.optimizations.length).toBeGreaterThan(0);
      expect(exported.metadata.exportDate).toBeTruthy();
    });

    it('should import optimization results', async () => {
      const importData = {
        optimizations: [
          {
            taskId: 'imported_001',
            domain: 'sales',
            optimizedPrompt: 'Imported prompt for {situation}',
            performance: { conversionRate: 0.25 },
          },
        ],
        metadata: {
          exportDate: new Date().toISOString(),
          version: '1.0.0',
        },
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/import',
        payload: importData,
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid optimization request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          // Missing required fields
          domain: 'marketing',
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.error).toContain('validation');
    });

    it('should handle optimization timeout', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'timeout_test',
          domain: 'support',
          examples: Array(100).fill({
            input: { query: 'test' },
            output: 'response',
            metadata: { score: 1 },
          }),
          initialPrompt: 'Respond to {query}',
          optimizationConfig: {
            iterations: 1000,
            timeout: 1, // 1 second timeout
          },
        },
      });

      expect(response.statusCode).toBe(408);
      const error = response.json();
      expect(error.error).toContain('timeout');
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should expose optimization metrics', async () => {
      // Run some optimizations
      await app.inject({
        method: 'POST',
        url: '/api/dspy/optimize',
        payload: {
          taskId: 'metrics_test',
          domain: 'support',
          examples: [
            {
              input: { issue: 'Bug report' },
              output: 'Thank you for reporting...',
              metadata: { resolved: true },
            },
          ],
          initialPrompt: 'Handle {issue}',
        },
      });

      // Get metrics
      const response = await app.inject({
        method: 'GET',
        url: '/api/metrics',
      });

      expect(response.statusCode).toBe(200);
      const metrics = response.text;
      
      expect(metrics).toContain('dspy_optimizations_total');
      expect(metrics).toContain('dspy_optimization_duration');
    });

    it('should track optimization quality over time', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/dspy/analytics/quality?domain=marketing&days=7',
      });

      expect(response.statusCode).toBe(200);
      const quality = response.json();
      
      expect(quality.averageImprovement).toBeDefined();
      expect(quality.successRate).toBeDefined();
      expect(quality.byTaskType).toBeDefined();
    });
  });
});