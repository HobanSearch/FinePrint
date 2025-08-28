/**
 * Smoke Tests - Quick verification that all services are functioning
 */

import axios from 'axios';

describe('Fine Print AI - Smoke Tests', () => {
  const services = [
    { name: 'Config Service', port: 8001, endpoint: '/health' },
    { name: 'Memory Service', port: 8002, endpoint: '/health' },
    { name: 'Logger Service', port: 8003, endpoint: '/health' },
    { name: 'Auth Service', port: 8004, endpoint: '/health' },
    { name: 'DSPy Service', port: 8005, endpoint: '/health' },
    { name: 'LoRA Service', port: 8006, endpoint: '/health' },
    { name: 'Knowledge Graph', port: 8007, endpoint: '/health' },
    { name: 'Agent Coordination', port: 8008, endpoint: '/health' },
    { name: 'Memory Persistence', port: 8009, endpoint: '/health' },
    { name: 'External Integrations', port: 8010, endpoint: '/health' },
  ];

  describe('Service Health Checks', () => {
    services.forEach(service => {
      it(`${service.name} should be healthy`, async () => {
        const response = await axios.get(
          `http://localhost:${service.port}${service.endpoint}`
        );
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status', 'healthy');
      });
    });
  });

  describe('Database Connectivity', () => {
    it('PostgreSQL should be accessible', async () => {
      const response = await axios.post('http://localhost:8001/api/config', {
        key: 'test.smoke',
        value: 'test_value',
      });
      expect(response.status).toBe(200);
    });

    it('Redis should be accessible', async () => {
      const response = await axios.get('http://localhost:8001/api/config/test.smoke');
      expect(response.status).toBe(200);
      expect(response.data.value).toBe('test_value');
    });

    it('Neo4j should be accessible', async () => {
      const response = await axios.post('http://localhost:8007/api/graph/query', {
        query: 'MATCH (n) RETURN count(n) as count',
      });
      expect(response.status).toBe(200);
      expect(response.data.records).toBeDefined();
    });
  });

  describe('Core Functionality', () => {
    it('should optimize a prompt using DSPy', async () => {
      const response = await axios.post('http://localhost:8005/api/dspy/optimize', {
        taskId: 'smoke_test_001',
        domain: 'marketing',
        examples: [
          {
            input: { topic: 'AI' },
            output: 'Discover the power of AI',
            metadata: { engagement: 0.15 },
          },
        ],
        initialPrompt: 'Write about {topic}',
        optimizationConfig: {
          iterations: 2,
          timeout: 10000,
        },
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('optimizedPrompt');
      expect(response.data).toHaveProperty('improvement');
    }, 30000);

    it('should perform LoRA inference', async () => {
      const response = await axios.post('http://localhost:8006/api/lora/inference', {
        domain: 'marketing',
        input: 'Write a tagline for Fine Print AI',
        config: {
          temperature: 0.7,
          maxTokens: 50,
        },
      });
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('output');
      expect(response.data.output.length).toBeGreaterThan(0);
    }, 20000);

    it('should create and query knowledge graph entities', async () => {
      // Create entity
      const createResponse = await axios.post(
        'http://localhost:8007/api/graph/entities',
        {
          type: 'TestCustomer',
          properties: {
            id: 'smoke_test_customer',
            name: 'Smoke Test Inc',
            plan: 'professional',
          },
        }
      );
      expect(createResponse.status).toBe(201);
      const entityId = createResponse.data.id;

      // Query entity
      const queryResponse = await axios.post(
        'http://localhost:8007/api/graph/query',
        {
          query: 'MATCH (c:TestCustomer {id: $id}) RETURN c',
          parameters: { id: 'smoke_test_customer' },
        }
      );
      expect(queryResponse.status).toBe(200);
      expect(queryResponse.data.records.length).toBe(1);
    });

    it('should coordinate agents for a simple task', async () => {
      const response = await axios.post(
        'http://localhost:8008/api/coordination/tasks',
        {
          taskType: 'content_creation',
          priority: 'medium',
          context: {
            domain: 'marketing',
            topic: 'AI benefits',
          },
        }
      );
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('taskId');
      expect(response.data).toHaveProperty('assignedAgent');
    });

    it('should store and retrieve memory', async () => {
      const memory = {
        agentId: 'test_agent',
        type: 'SHORT_TERM',
        content: 'Smoke test memory',
        metadata: {
          test: true,
          timestamp: new Date().toISOString(),
        },
      };

      // Store memory
      const storeResponse = await axios.post(
        'http://localhost:8002/api/memory',
        memory
      );
      expect(storeResponse.status).toBe(201);
      const memoryId = storeResponse.data.id;

      // Retrieve memory
      const retrieveResponse = await axios.get(
        `http://localhost:8002/api/memory/${memoryId}`
      );
      expect(retrieveResponse.status).toBe(200);
      expect(retrieveResponse.data.content).toBe('Smoke test memory');
    });
  });

  describe('Integration Points', () => {
    it('should handle webhook processing', async () => {
      const response = await axios.post(
        'http://localhost:8010/api/webhooks/custom/test',
        {
          event: 'test.event',
          data: { message: 'Smoke test webhook' },
        },
        {
          headers: {
            'X-Webhook-Signature': 'test-signature',
          },
        }
      );
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('received', true);
    });

    it('should track metrics in memory persistence', async () => {
      const response = await axios.post(
        'http://localhost:8009/api/metrics/track',
        {
          domain: 'test',
          metric: 'smoke_test_metric',
          value: 42,
          metadata: {
            test: true,
          },
        }
      );
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('tracked', true);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should execute a simple marketing workflow', async () => {
      // Step 1: Create campaign
      const campaignResponse = await axios.post(
        'http://localhost:8007/api/graph/entities',
        {
          type: 'Campaign',
          properties: {
            id: 'smoke_test_campaign',
            name: 'Smoke Test Campaign',
            status: 'active',
          },
        }
      );
      expect(campaignResponse.status).toBe(201);

      // Step 2: Generate content
      const contentResponse = await axios.post(
        'http://localhost:8006/api/lora/inference',
        {
          domain: 'marketing',
          input: 'Generate content for Smoke Test Campaign',
          context: {
            campaignId: 'smoke_test_campaign',
          },
        }
      );
      expect(contentResponse.status).toBe(200);

      // Step 3: Store execution memory
      const memoryResponse = await axios.post(
        'http://localhost:8009/api/memory/store',
        {
          type: 'campaign_execution',
          agentId: 'marketing_coordinator',
          content: {
            campaignId: 'smoke_test_campaign',
            content: contentResponse.data.output,
            timestamp: new Date().toISOString(),
          },
        }
      );
      expect(memoryResponse.status).toBe(200);

      // Verify workflow completion
      expect(contentResponse.data.output).toBeTruthy();
      expect(memoryResponse.data.stored).toBe(true);
    }, 30000);
  });
});

// Cleanup function
afterAll(async () => {
  // Clean up test data
  try {
    await axios.post('http://localhost:8007/api/graph/query', {
      query: 'MATCH (n) WHERE n.id STARTS WITH "smoke_test" DETACH DELETE n',
    });
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});