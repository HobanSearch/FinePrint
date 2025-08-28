/**
 * Knowledge Graph Service Integration Tests
 */

import { FastifyInstance } from 'fastify';
import { build } from '../../src/app';
import { KnowledgeGraphService } from '../../src/services/knowledge-graph-service';
import { BusinessIntelligenceService } from '../../src/services/business-intelligence';
import { PatternRecognitionService } from '../../src/services/pattern-recognition';
import Redis from 'ioredis';
import neo4j, { Driver, Session } from 'neo4j-driver';

describe('Knowledge Graph Service Integration', () => {
  let app: FastifyInstance;
  let knowledgeGraphService: KnowledgeGraphService;
  let redisClient: Redis;
  let neo4jDriver: Driver;
  let session: Session;

  beforeAll(async () => {
    // Setup Neo4j connection
    neo4jDriver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || 'password'
      )
    );

    // Setup Redis
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: 3, // Use separate DB for tests
    });

    // Build app
    app = await build({
      logger: false,
      redis: redisClient,
      neo4j: neo4jDriver,
    });

    await app.ready();

    // Get service instance
    knowledgeGraphService = app.knowledgeGraphService;
    session = neo4jDriver.session();
  });

  afterAll(async () => {
    await session.close();
    await neo4jDriver.close();
    await app.close();
    await redisClient.quit();
  });

  beforeEach(async () => {
    // Clear test data
    await session.run('MATCH (n) DETACH DELETE n');
    await redisClient.flushdb();
  });

  describe('Entity Management', () => {
    it('should create and retrieve business entities', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'Customer',
          properties: {
            id: 'cust_123',
            name: 'Acme Corp',
            industry: 'Technology',
            size: 'Enterprise',
            annualRevenue: 50000000,
            created: new Date().toISOString(),
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const entity = response.json();
      
      expect(entity.id).toBeTruthy();
      expect(entity.type).toBe('Customer');
      expect(entity.properties.name).toBe('Acme Corp');

      // Retrieve entity
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/graph/entities/${entity.id}`,
      });

      expect(getResponse.statusCode).toBe(200);
      const retrieved = getResponse.json();
      expect(retrieved.properties.industry).toBe('Technology');
    });

    it('should create relationships between entities', async () => {
      // Create entities
      const customer = await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'Customer',
          properties: { id: 'cust_456', name: 'Tech Startup' },
        },
      });

      const product = await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'Product',
          properties: { id: 'prod_789', name: 'Professional Plan' },
        },
      });

      // Create relationship
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/relationships',
        payload: {
          fromId: customer.json().id,
          toId: product.json().id,
          type: 'SUBSCRIBED_TO',
          properties: {
            startDate: new Date().toISOString(),
            monthlyValue: 99,
            seats: 10,
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const relationship = response.json();
      
      expect(relationship.type).toBe('SUBSCRIBED_TO');
      expect(relationship.properties.monthlyValue).toBe(99);
    });
  });

  describe('Business Intelligence Queries', () => {
    it('should analyze customer journey paths', async () => {
      // Create sample customer journey
      await createCustomerJourney(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/analytics/customer-journey',
        payload: {
          customerId: 'cust_journey_test',
          timeRange: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            end: new Date().toISOString(),
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const journey = response.json();
      
      expect(journey.touchpoints).toBeGreaterThan(0);
      expect(journey.conversionPath).toBeTruthy();
      expect(journey.dropoffPoints).toBeInstanceOf(Array);
      expect(journey.recommendations).toBeTruthy();
    });

    it('should identify revenue expansion opportunities', async () => {
      // Create customer data
      await createCustomerData(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/graph/analytics/expansion-opportunities',
      });

      expect(response.statusCode).toBe(200);
      const opportunities = response.json();
      
      expect(opportunities.highValue).toBeInstanceOf(Array);
      expect(opportunities.totalPotentialRevenue).toBeGreaterThan(0);
      expect(opportunities.bySegment).toBeTruthy();
    });

    it('should predict customer churn risk', async () => {
      // Create customer engagement data
      await createEngagementData(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/analytics/churn-prediction',
        payload: {
          lookbackDays: 90,
          features: [
            'usage_frequency',
            'support_tickets',
            'payment_history',
            'feature_adoption',
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const predictions = response.json();
      
      expect(predictions.atRisk).toBeInstanceOf(Array);
      predictions.atRisk.forEach((customer: any) => {
        expect(customer.churnProbability).toBeGreaterThanOrEqual(0);
        expect(customer.churnProbability).toBeLessThanOrEqual(1);
        expect(customer.riskFactors).toBeInstanceOf(Array);
        expect(customer.recommendedActions).toBeInstanceOf(Array);
      });
    });
  });

  describe('Pattern Recognition', () => {
    it('should detect business patterns across entities', async () => {
      // Create pattern data
      await createPatternData(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/patterns/detect',
        payload: {
          domain: 'sales',
          patternTypes: ['conversion', 'upsell', 'renewal'],
          minSupport: 0.1,
          minConfidence: 0.7,
        },
      });

      expect(response.statusCode).toBe(200);
      const patterns = response.json();
      
      expect(patterns.discovered).toBeGreaterThan(0);
      expect(patterns.patterns).toBeInstanceOf(Array);
      patterns.patterns.forEach((pattern: any) => {
        expect(pattern.type).toBeTruthy();
        expect(pattern.support).toBeGreaterThan(0.1);
        expect(pattern.confidence).toBeGreaterThan(0.7);
        expect(pattern.examples).toBeInstanceOf(Array);
      });
    });

    it('should identify successful workflow patterns', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/graph/patterns/workflows/successful',
        query: {
          domain: 'marketing',
          metric: 'conversion_rate',
          threshold: '0.15',
        },
      });

      expect(response.statusCode).toBe(200);
      const workflows = response.json();
      
      expect(workflows.workflows).toBeInstanceOf(Array);
      workflows.workflows.forEach((workflow: any) => {
        expect(workflow.steps).toBeInstanceOf(Array);
        expect(workflow.averageMetric).toBeGreaterThan(0.15);
        expect(workflow.frequency).toBeGreaterThan(0);
      });
    });
  });

  describe('Agent Learning Integration', () => {
    it('should store agent interaction patterns', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/agent-learning/interactions',
        payload: {
          agentId: 'sales_agent_001',
          interaction: {
            id: 'int_123',
            timestamp: new Date().toISOString(),
            context: {
              customerId: 'cust_789',
              dealSize: 5000,
              industry: 'SaaS',
            },
            action: 'propose_discount',
            outcome: {
              accepted: true,
              finalDealSize: 4500,
              closedAt: new Date().toISOString(),
            },
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const stored = response.json();
      expect(stored.interactionId).toBeTruthy();
      expect(stored.patternsUpdated).toBe(true);
    });

    it('should recommend actions based on learned patterns', async () => {
      // Create historical interaction data
      await createInteractionHistory(app);

      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/agent-learning/recommend',
        payload: {
          agentId: 'sales_agent_001',
          context: {
            customerId: 'cust_new',
            dealSize: 8000,
            industry: 'FinTech',
            currentStage: 'negotiation',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const recommendations = response.json();
      
      expect(recommendations.topAction).toBeTruthy();
      expect(recommendations.confidence).toBeGreaterThan(0);
      expect(recommendations.similarCases).toBeGreaterThan(0);
      expect(recommendations.expectedOutcome).toBeTruthy();
    });
  });

  describe('Knowledge Graph Queries', () => {
    it('should execute complex graph queries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/query',
        payload: {
          query: `
            MATCH (c:Customer)-[:SUBSCRIBED_TO]->(p:Product)
            WHERE p.name = $productName
            RETURN c.name as customer, c.industry as industry, count(*) as total
            ORDER BY total DESC
            LIMIT 10
          `,
          parameters: {
            productName: 'Professional Plan',
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const results = response.json();
      
      expect(results.records).toBeInstanceOf(Array);
      expect(results.summary).toBeTruthy();
    });

    it('should find shortest paths between entities', async () => {
      // Create entities with relationships
      await createNetworkData(app);

      const response = await app.inject({
        method: 'GET',
        url: '/api/graph/paths/shortest',
        query: {
          fromId: 'entity_start',
          toId: 'entity_end',
          maxLength: '5',
        },
      });

      expect(response.statusCode).toBe(200);
      const paths = response.json();
      
      expect(paths.paths).toBeInstanceOf(Array);
      expect(paths.shortestLength).toBeGreaterThan(0);
    });
  });

  describe('Real-time Updates', () => {
    it('should handle real-time entity updates', async () => {
      // Create entity
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'Lead',
          properties: {
            id: 'lead_realtime',
            status: 'new',
            score: 50,
          },
        },
      });

      const entityId = createResponse.json().id;

      // Subscribe to updates (mock WebSocket)
      const updates: any[] = [];
      
      // Update entity multiple times
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'PATCH',
          url: `/api/graph/entities/${entityId}`,
          payload: {
            properties: {
              score: 50 + (i + 1) * 10,
              status: i === 2 ? 'qualified' : 'new',
            },
          },
        });
      }

      // Check final state
      const finalResponse = await app.inject({
        method: 'GET',
        url: `/api/graph/entities/${entityId}`,
      });

      const final = finalResponse.json();
      expect(final.properties.score).toBe(80);
      expect(final.properties.status).toBe('qualified');
    });
  });

  describe('Data Import/Export', () => {
    it('should bulk import entities and relationships', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/import/bulk',
        payload: {
          entities: [
            {
              tempId: 'temp_1',
              type: 'Customer',
              properties: { name: 'Import Customer 1' },
            },
            {
              tempId: 'temp_2',
              type: 'Customer',
              properties: { name: 'Import Customer 2' },
            },
          ],
          relationships: [
            {
              fromTempId: 'temp_1',
              toTempId: 'temp_2',
              type: 'REFERRED',
              properties: { date: new Date().toISOString() },
            },
          ],
        },
      });

      expect(response.statusCode).toBe(200);
      const result = response.json();
      
      expect(result.entitiesCreated).toBe(2);
      expect(result.relationshipsCreated).toBe(1);
      expect(result.idMapping).toBeTruthy();
    });

    it('should export subgraph data', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/export',
        payload: {
          query: 'MATCH (c:Customer) WHERE c.industry = "Technology" RETURN c',
          format: 'json',
          includeRelationships: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const exported = response.json();
      
      expect(exported.nodes).toBeInstanceOf(Array);
      expect(exported.relationships).toBeInstanceOf(Array);
      expect(exported.metadata.exportDate).toBeTruthy();
    });
  });

  describe('Performance Optimization', () => {
    it('should use caching for frequent queries', async () => {
      const query = {
        query: 'MATCH (c:Customer) RETURN count(c) as total',
      };

      // First query (cache miss)
      const start1 = Date.now();
      const response1 = await app.inject({
        method: 'POST',
        url: '/api/graph/query',
        payload: query,
      });
      const time1 = Date.now() - start1;

      // Second query (cache hit)
      const start2 = Date.now();
      const response2 = await app.inject({
        method: 'POST',
        url: '/api/graph/query',
        payload: query,
      });
      const time2 = Date.now() - start2;

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
      expect(time2).toBeLessThan(time1 * 0.5); // Cache should be much faster
    });

    it('should handle large-scale pattern detection efficiently', async () => {
      // Create large dataset
      await createLargeDataset(app);

      const start = Date.now();
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/patterns/detect',
        payload: {
          domain: 'all',
          patternTypes: ['behavioral'],
          algorithm: 'apriori',
          parallel: true,
        },
      });
      const duration = Date.now() - start;

      expect(response.statusCode).toBe(200);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid Cypher queries', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/query',
        payload: {
          query: 'INVALID CYPHER SYNTAX HERE',
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.error).toContain('Cypher');
    });

    it('should handle circular relationship detection', async () => {
      // Attempt to create circular relationship
      const entity = await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'Process',
          properties: { name: 'Circular Test' },
        },
      });

      const entityId = entity.json().id;

      const response = await app.inject({
        method: 'POST',
        url: '/api/graph/relationships',
        payload: {
          fromId: entityId,
          toId: entityId,
          type: 'DEPENDS_ON',
        },
      });

      expect(response.statusCode).toBe(400);
      const error = response.json();
      expect(error.error).toContain('circular');
    });
  });

  describe('Analytics Dashboard Data', () => {
    it('should provide dashboard-ready analytics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/graph/analytics/dashboard',
        query: {
          period: '30d',
          metrics: ['revenue', 'customers', 'churn', 'growth'],
        },
      });

      expect(response.statusCode).toBe(200);
      const dashboard = response.json();
      
      expect(dashboard.summary).toBeTruthy();
      expect(dashboard.charts).toBeTruthy();
      expect(dashboard.insights).toBeInstanceOf(Array);
      expect(dashboard.lastUpdated).toBeTruthy();
    });
  });
});

// Helper functions
async function createCustomerJourney(app: FastifyInstance) {
  const touchpoints = [
    { type: 'WebsiteVisit', timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000 },
    { type: 'TrialSignup', timestamp: Date.now() - 6 * 24 * 60 * 60 * 1000 },
    { type: 'FeatureUsage', timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000 },
    { type: 'SalesCall', timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000 },
    { type: 'Purchase', timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000 },
  ];

  for (const touchpoint of touchpoints) {
    await app.inject({
      method: 'POST',
      url: '/api/graph/entities',
      payload: {
        type: 'Touchpoint',
        properties: {
          customerId: 'cust_journey_test',
          type: touchpoint.type,
          timestamp: new Date(touchpoint.timestamp).toISOString(),
        },
      },
    });
  }
}

async function createCustomerData(app: FastifyInstance) {
  const customers = [
    { id: 'cust_exp_1', plan: 'starter', mrr: 29, usage: 0.8 },
    { id: 'cust_exp_2', plan: 'starter', mrr: 29, usage: 0.95 },
    { id: 'cust_exp_3', plan: 'professional', mrr: 99, usage: 0.5 },
  ];

  for (const customer of customers) {
    await app.inject({
      method: 'POST',
      url: '/api/graph/entities',
      payload: {
        type: 'Customer',
        properties: customer,
      },
    });
  }
}

async function createEngagementData(app: FastifyInstance) {
  const engagements = [
    { customerId: 'cust_eng_1', lastActive: Date.now() - 60 * 24 * 60 * 60 * 1000 },
    { customerId: 'cust_eng_2', lastActive: Date.now() - 2 * 24 * 60 * 60 * 1000 },
  ];

  for (const engagement of engagements) {
    await app.inject({
      method: 'POST',
      url: '/api/graph/entities',
      payload: {
        type: 'Engagement',
        properties: engagement,
      },
    });
  }
}

async function createPatternData(app: FastifyInstance) {
  // Create sample pattern data
  const patterns = [
    { action: 'demo_request', outcome: 'conversion', count: 50 },
    { action: 'feature_trial', outcome: 'conversion', count: 30 },
    { action: 'competitor_comparison', outcome: 'conversion', count: 45 },
  ];

  for (const pattern of patterns) {
    for (let i = 0; i < pattern.count; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/graph/entities',
        payload: {
          type: 'SalesInteraction',
          properties: {
            action: pattern.action,
            outcome: pattern.outcome,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  }
}

async function createInteractionHistory(app: FastifyInstance) {
  const interactions = [
    { context: { dealSize: 10000, industry: 'FinTech' }, action: 'offer_pilot', success: true },
    { context: { dealSize: 5000, industry: 'FinTech' }, action: 'propose_discount', success: true },
    { context: { dealSize: 15000, industry: 'FinTech' }, action: 'executive_demo', success: true },
  ];

  for (const interaction of interactions) {
    await app.inject({
      method: 'POST',
      url: '/api/graph/agent-learning/interactions',
      payload: {
        agentId: 'sales_agent_001',
        interaction: {
          id: `int_${Math.random()}`,
          timestamp: new Date().toISOString(),
          context: interaction.context,
          action: interaction.action,
          outcome: { success: interaction.success },
        },
      },
    });
  }
}

async function createNetworkData(app: FastifyInstance) {
  // Create a network of entities
  const entities = [];
  for (let i = 0; i < 5; i++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/graph/entities',
      payload: {
        type: 'NetworkNode',
        properties: { id: `entity_${i === 0 ? 'start' : i === 4 ? 'end' : i}` },
      },
    });
    entities.push(response.json());
  }

  // Create relationships
  for (let i = 0; i < entities.length - 1; i++) {
    await app.inject({
      method: 'POST',
      url: '/api/graph/relationships',
      payload: {
        fromId: entities[i].id,
        toId: entities[i + 1].id,
        type: 'CONNECTED_TO',
      },
    });
  }
}

async function createLargeDataset(app: FastifyInstance) {
  // Create a reasonably large dataset for performance testing
  const batchSize = 100;
  const entities = [];

  for (let i = 0; i < batchSize; i++) {
    entities.push({
      tempId: `temp_${i}`,
      type: 'TestEntity',
      properties: {
        id: `test_${i}`,
        category: i % 10,
        value: Math.random() * 1000,
      },
    });
  }

  await app.inject({
    method: 'POST',
    url: '/api/graph/import/bulk',
    payload: { entities, relationships: [] },
  });
}