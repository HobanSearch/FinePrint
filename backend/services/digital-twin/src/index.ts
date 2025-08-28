/**
 * Digital Twin Business Simulator Service
 * Main entry point for the digital twin testing environment
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { EnvironmentSimulator } from './simulator/environment-simulator';
import { ModelSandbox } from './sandbox/model-sandbox';
import { MetricReplicator } from './metrics/metric-replicator';
import { BusinessAgentConnector } from './integrations/business-agent-connector';
import { BusinessExperiments } from './experiments/business-experiments';
import {
  BusinessEnvironment,
  EnvironmentType,
  SimulationRequest,
  ModelConfiguration,
  ExperimentConfig,
  CounterfactualScenario
} from './types';
import { logger } from './utils/logger';

const prisma = new PrismaClient();
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
});

const app = Fastify({
  logger: false
});

// Global instances
const environments = new Map<string, EnvironmentSimulator>();
const sandbox = new ModelSandbox({ parallelSimulations: 4 });
const metricReplicator = new MetricReplicator(redis);
const agentConnector = new BusinessAgentConnector(process.env.OLLAMA_URL);
const experiments = new BusinessExperiments(process.env.OLLAMA_URL);

// Register plugins
app.register(cors, {
  origin: process.env.CORS_ORIGIN || '*'
});

app.register(helmet);

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

app.register(websocket);

// Health check
app.get('/health', async () => ({
  status: 'healthy',
  timestamp: new Date(),
  environments: environments.size,
  redis: redis.status === 'ready'
}));

// Create new environment
app.post<{
  Body: {
    name: string;
    type: EnvironmentType;
    parameters: any;
  }
}>('/environments', async (request, reply) => {
  const { name, type, parameters } = request.body;

  const environment: BusinessEnvironment = {
    id: uuidv4(),
    name,
    type,
    parameters,
    state: {
      currentTime: new Date(),
      simulationSpeed: 1,
      isPaused: false,
      customers: [],
      interactions: [],
      transactions: []
    },
    metrics: {} as any,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const simulator = new EnvironmentSimulator(
    environment, 
    Date.now(),
    process.env.OLLAMA_URL
  );
  environments.set(environment.id, simulator);

  // Set up event listeners
  simulator.on('simulation:tick', (data) => {
    // Broadcast to WebSocket clients if needed
  });

  simulator.on('customer:acquired', async (customer) => {
    // Log customer acquisition
    await redis.lpush('events:customer:acquired', JSON.stringify(customer));
  });

  logger.info('Created new environment', { environmentId: environment.id });

  return {
    success: true,
    environment
  };
});

// Start simulation
app.post<{
  Body: SimulationRequest
}>('/simulations/start', async (request, reply) => {
  const simulationRequest = request.body;
  
  const simulator = environments.get(simulationRequest.environmentId);
  if (!simulator) {
    return reply.code(404).send({ error: 'Environment not found' });
  }

  // Start simulation
  simulator.startSimulation(
    simulationRequest.duration,
    simulationRequest.speed,
    simulationRequest.models
  );

  return {
    success: true,
    simulationId: uuidv4(),
    status: 'running'
  };
});

// Stop simulation
app.post<{
  Params: { environmentId: string }
}>('/simulations/:environmentId/stop', async (request, reply) => {
  const { environmentId } = request.params;
  
  const simulator = environments.get(environmentId);
  if (!simulator) {
    return reply.code(404).send({ error: 'Environment not found' });
  }

  simulator.stopSimulation();

  return {
    success: true,
    results: simulator.getResults()
  };
});

// Test model in sandbox
app.post<{
  Body: {
    model: ModelConfiguration;
    environmentId: string;
    duration?: number;
  }
}>('/sandbox/test', async (request, reply) => {
  const { model, environmentId, duration = 30 } = request.body;

  const simulator = environments.get(environmentId);
  if (!simulator) {
    return reply.code(404).send({ error: 'Environment not found' });
  }

  const performance = await sandbox.testModel(
    model,
    simulator.environment,
    duration
  );

  return {
    success: true,
    performance
  };
});

// Compare models
app.post<{
  Body: {
    baseline: ModelConfiguration;
    challenger: ModelConfiguration;
    environmentId: string;
    duration?: number;
  }
}>('/sandbox/compare', async (request, reply) => {
  const { baseline, challenger, environmentId, duration = 30 } = request.body;

  const simulator = environments.get(environmentId);
  if (!simulator) {
    return reply.code(404).send({ error: 'Environment not found' });
  }

  const comparison = await sandbox.compareModels(
    baseline,
    challenger,
    simulator.environment,
    duration
  );

  return {
    success: true,
    comparison
  };
});

// Run A/B test experiment
app.post<{
  Body: {
    experiment: ExperimentConfig;
    environmentId: string;
    duration?: number;
  }
}>('/experiments/run', async (request, reply) => {
  const { experiment, environmentId, duration = 30 } = request.body;

  const simulator = environments.get(environmentId);
  if (!simulator) {
    return reply.code(404).send({ error: 'Environment not found' });
  }

  const result = await sandbox.runExperiment(
    experiment,
    simulator.environment,
    duration
  );

  return {
    success: true,
    result
  };
});

// Run marketing A/B test with real models
app.post<{
  Body: {
    duration?: number;
    variants?: string[];
  }
}>('/experiments/marketing', async (request, reply) => {
  const { duration = 7, variants } = request.body;

  try {
    const result = await experiments.runMarketingContentTest(variants, duration);
    return {
      success: true,
      result
    };
  } catch (error: any) {
    logger.error('Marketing experiment failed', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Run sales qualification experiment with real models
app.post<{
  Body: {
    duration?: number;
  }
}>('/experiments/sales', async (request, reply) => {
  const { duration = 14 } = request.body;

  try {
    const result = await experiments.runSalesQualificationTest(duration);
    return {
      success: true,
      result
    };
  } catch (error: any) {
    logger.error('Sales experiment failed', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Run support quality test with real models
app.post<{
  Body: {
    duration?: number;
  }
}>('/experiments/support', async (request, reply) => {
  const { duration = 7 } = request.body;

  try {
    const result = await experiments.runSupportQualityTest(duration);
    return {
      success: true,
      result
    };
  } catch (error: any) {
    logger.error('Support experiment failed', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Run analytics insight test with real models
app.post<{
  Body: {
    duration?: number;
  }
}>('/experiments/analytics', async (request, reply) => {
  const { duration = 30 } = request.body;

  try {
    const result = await experiments.runAnalyticsInsightTest(duration);
    return {
      success: true,
      result
    };
  } catch (error: any) {
    logger.error('Analytics experiment failed', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Get active experiments
app.get('/experiments/active', async (request, reply) => {
  const active = experiments.getActiveExperiments();
  return {
    success: true,
    experiments: active
  };
});

// Get experiment history
app.get<{
  Querystring: {
    name?: string;
  }
}>('/experiments/history', async (request, reply) => {
  const { name } = request.query;
  const history = experiments.getExperimentHistory(name);
  return {
    success: true,
    history
  };
});

// Test agent model connectivity
app.post<{
  Body: {
    type: 'marketing' | 'sales' | 'support' | 'analytics';
    prompt: string;
    context?: Record<string, any>;
  }
}>('/agents/test', async (request, reply) => {
  const { type, prompt, context } = request.body;

  try {
    const response = await agentConnector.invokeAgent(
      type,
      { role: 'user', content: prompt, context }
    );
    
    return {
      success: true,
      response
    };
  } catch (error: any) {
    logger.error('Agent test failed', error);
    return reply.code(500).send({ error: error.message });
  }
});

// Get agent performance metrics
app.get('/agents/performance', async (request, reply) => {
  const performance = agentConnector.getPerformanceReport();
  return {
    success: true,
    performance
  };
});

// Replicate metrics
app.post<{
  Body: {
    metrics: any;
  }
}>('/metrics/replicate', async (request, reply) => {
  const { metrics } = request.body;

  const replicated = await metricReplicator.replicateMetrics(metrics);

  return {
    success: true,
    replicated
  };
});

// Generate counterfactual
app.post<{
  Body: {
    baseMetrics: any;
    scenario: CounterfactualScenario;
  }
}>('/metrics/counterfactual', async (request, reply) => {
  const { baseMetrics, scenario } = request.body;

  const counterfactual = await metricReplicator.generateCounterfactual(
    baseMetrics,
    scenario
  );

  return {
    success: true,
    counterfactual
  };
});

// What-if analysis
app.post<{
  Body: {
    baseMetrics: any;
    changes: Record<string, number>;
  }
}>('/metrics/what-if', async (request, reply) => {
  const { baseMetrics, changes } = request.body;

  const analysis = await metricReplicator.whatIfAnalysis(
    baseMetrics,
    new Map(Object.entries(changes))
  );

  return {
    success: true,
    analysis: {
      baseCase: analysis.baseCase,
      scenarios: analysis.scenarios,
      impacts: Array.from(analysis.impacts.entries()),
      optimal: analysis.optimal,
      confidence: analysis.confidence
    }
  };
});

// Detect anomalies
app.post<{
  Body: {
    metrics: any;
  }
}>('/metrics/anomalies', async (request, reply) => {
  const { metrics } = request.body;

  const anomalies = metricReplicator.detectAnomalies(metrics);

  return {
    success: true,
    anomalies
  };
});

// WebSocket endpoint for real-time updates
app.register(async function (app) {
  app.get('/ws', { websocket: true }, (connection, req) => {
    connection.socket.on('message', (message) => {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'subscribe':
          // Subscribe to environment updates
          const environmentId = data.environmentId;
          const simulator = environments.get(environmentId);
          
          if (simulator) {
            simulator.on('simulation:tick', (tickData) => {
              connection.socket.send(JSON.stringify({
                type: 'tick',
                data: tickData
              }));
            });
            
            simulator.on('anomaly:detected', (anomaly) => {
              connection.socket.send(JSON.stringify({
                type: 'anomaly',
                data: anomaly
              }));
            });
            
            simulator.on('model:invoked', (modelData) => {
              connection.socket.send(JSON.stringify({
                type: 'model:invoked',
                data: modelData
              }));
            });
            
            simulator.on('metrics:updated', (metrics) => {
              connection.socket.send(JSON.stringify({
                type: 'metrics:updated',
                data: metrics
              }));
            });
          }
          break;
          
        case 'subscribe:experiments':
          // Subscribe to experiment updates
          experiments.on('experiment:progress', (progress) => {
            connection.socket.send(JSON.stringify({
              type: 'experiment:progress',
              data: progress
            }));
          });
          
          experiments.on('experiment:metrics', (metrics) => {
            connection.socket.send(JSON.stringify({
              type: 'experiment:metrics',
              data: metrics
            }));
          });
          
          agentConnector.on('metrics:recorded', (metrics) => {
            connection.socket.send(JSON.stringify({
              type: 'agent:metrics',
              data: metrics
            }));
          });
          break;
          
        case 'unsubscribe':
          // Unsubscribe from updates
          experiments.removeAllListeners('experiment:progress');
          experiments.removeAllListeners('experiment:metrics');
          agentConnector.removeAllListeners('metrics:recorded');
          break;
      }
    });

    connection.socket.on('close', () => {
      logger.info('WebSocket connection closed');
      // Clean up listeners
      experiments.removeAllListeners('experiment:progress');
      experiments.removeAllListeners('experiment:metrics');
      agentConnector.removeAllListeners('metrics:recorded');
    });
  });
});

// Graceful shutdown
const shutdown = async () => {
  logger.info('Shutting down Digital Twin service');
  
  // Stop all simulations
  for (const simulator of environments.values()) {
    await simulator.stopSimulation();
  }
  
  // Cleanup experiments and agent connector
  await experiments.cleanup();
  await agentConnector.cleanup();
  
  await prisma.$disconnect();
  await redis.quit();
  await app.close();
  
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3020');
    const host = process.env.HOST || '0.0.0.0';
    
    await app.listen({ port, host });
    
    logger.info(`Digital Twin service listening on ${host}:${port}`);
    
    // Initialize default environments
    const defaultEnvironments = [
      {
        name: 'Marketing Testing',
        type: EnvironmentType.MARKETING,
        parameters: {
          marketSize: 1000000,
          competitorCount: 5,
          seasonality: { type: 'quarterly', factors: [1, 1.2, 0.9, 1.3] },
          economicConditions: { growth: 0.1, volatility: 0.2, consumerConfidence: 0.7 },
          customerSegments: [
            {
              id: 'enterprise',
              name: 'Enterprise',
              size: 1000,
              growthRate: 0.15,
              priceSensitivity: 0.3,
              qualitySensitivity: 0.9,
              brandLoyalty: 0.8,
              churnRate: 0.05,
              averageLifetimeValue: 50000
            },
            {
              id: 'smb',
              name: 'SMB',
              size: 10000,
              growthRate: 0.25,
              priceSensitivity: 0.7,
              qualitySensitivity: 0.6,
              brandLoyalty: 0.5,
              churnRate: 0.15,
              averageLifetimeValue: 5000
            }
          ],
          productOfferings: [
            {
              id: 'starter',
              name: 'Starter',
              tier: 'starter',
              price: 49,
              features: ['Basic Analysis', '10 Documents/month'],
              targetSegments: ['smb']
            },
            {
              id: 'professional',
              name: 'Professional',
              tier: 'professional',
              price: 199,
              features: ['Advanced Analysis', 'Unlimited Documents', 'API Access'],
              targetSegments: ['smb', 'enterprise']
            },
            {
              id: 'enterprise',
              name: 'Enterprise',
              tier: 'enterprise',
              price: 999,
              features: ['Full Platform', 'Custom Models', 'Dedicated Support'],
              targetSegments: ['enterprise']
            }
          ],
          pricingStrategy: {
            type: 'tiered',
            discountPolicy: {
              volumeDiscounts: [
                { minQuantity: 10, discountPercent: 0.1 },
                { minQuantity: 50, discountPercent: 0.2 }
              ],
              seasonalDiscounts: [],
              loyaltyDiscounts: [
                { minTenureMonths: 12, discountPercent: 0.05 },
                { minTenureMonths: 24, discountPercent: 0.1 }
              ]
            },
            promotions: []
          }
        }
      }
    ];

    for (const envConfig of defaultEnvironments) {
      const environment: BusinessEnvironment = {
        id: uuidv4(),
        name: envConfig.name,
        type: envConfig.type as EnvironmentType,
        parameters: envConfig.parameters,
        state: {
          currentTime: new Date(),
          simulationSpeed: 1,
          isPaused: false,
          customers: [],
          interactions: [],
          transactions: []
        },
        metrics: {} as any,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const simulator = new EnvironmentSimulator(environment);
      environments.set(environment.id, simulator);
      
      logger.info('Initialized default environment', {
        id: environment.id,
        name: environment.name
      });
    }
    
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
};

start();