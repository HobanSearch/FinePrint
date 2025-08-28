import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { CoordinationHub } from './services/coordination-hub';
import { teamRoutes } from './routes/team-routes';
import { dashboardRoutes } from './routes/dashboard-routes';
import { 
  AgentInfo, 
  TaskRequest, 
  InformationShare, 
  CoordinationRequest, 
  BusinessEvent,
  AgentType,
  MessagePriority
} from './types';

const logger = {
  info: (msg: string, data?: any) => console.log(`[INFO] ${msg}`, data || ''),
  error: (msg: string, error?: any) => console.error(`[ERROR] ${msg}`, error || ''),
  warn: (msg: string, data?: any) => console.warn(`[WARN] ${msg}`, data || '')
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    requestTimeout: 30000,
    bodyLimit: 10485760 // 10MB
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });

  await app.register(cors, {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
  });

  await app.register(websocket);

  // Initialize coordination hub
  const coordinationHub = new CoordinationHub({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD
  });

  // Add coordination hub to app context
  app.decorate('coordinationHub', coordinationHub);

  // Health check
  app.get('/health', async () => {
    const agentCount = (app as any).coordinationHub.agents.size;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      activeAgents: agentCount,
      services: {
        redis: 'healthy',
        messageQueue: 'healthy',
        coordination: 'healthy'
      }
    };
  });

  // Agent registration endpoint
  app.post<{ Body: AgentInfo }>('/api/agents/register', async (request, reply) => {
    try {
      const agentInfo = request.body;
      await (app as any).coordinationHub.registerAgent(agentInfo);
      
      logger.info('Agent registered', { agentId: agentInfo.id, type: agentInfo.type });
      
      return { 
        success: true, 
        message: 'Agent registered successfully',
        agentId: agentInfo.id
      };
    } catch (error) {
      logger.error('Agent registration failed', error);
      reply.code(500);
      return { success: false, error: 'Registration failed' };
    }
  });

  // Agent heartbeat endpoint
  app.post<{ 
    Params: { agentId: string };
    Body: Partial<AgentInfo>;
  }>('/api/agents/:agentId/heartbeat', async (request, reply) => {
    try {
      const { agentId } = request.params;
      const status = request.body;
      
      await (app as any).coordinationHub.heartbeat(agentId, status);
      
      return { success: true, timestamp: new Date().toISOString() };
    } catch (error) {
      logger.error('Heartbeat failed', error);
      reply.code(500);
      return { success: false, error: 'Heartbeat failed' };
    }
  });

  // Get all registered agents
  app.get('/api/agents', async () => {
    const agents = Array.from((app as any).coordinationHub.agents.values());
    return {
      agents,
      count: agents.length,
      byType: agents.reduce((acc, agent) => {
        acc[agent.type] = (acc[agent.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
  });

  // Task request endpoint
  app.post<{
    Body: TaskRequest & { fromAgent: string };
  }>('/api/tasks/request', async (request, reply) => {
    try {
      const { fromAgent, ...taskRequest } = request.body;
      
      const messageId = await (app as any).coordinationHub.requestTask(taskRequest, fromAgent);
      
      logger.info('Task requested', { 
        fromAgent, 
        taskType: taskRequest.taskType,
        messageId 
      });
      
      return { 
        success: true, 
        messageId,
        estimatedResponseTime: '30s'
      };
    } catch (error) {
      logger.error('Task request failed', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Information sharing endpoint
  app.post<{
    Body: InformationShare & { fromAgent: string };
  }>('/api/information/share', async (request, reply) => {
    try {
      const { fromAgent, ...infoShare } = request.body;
      
      await (app as any).coordinationHub.shareInformation(infoShare, fromAgent);
      
      logger.info('Information shared', { 
        fromAgent, 
        category: infoShare.category,
        recipients: infoShare.relevantAgents?.length || 'broadcast'
      });
      
      return { success: true, message: 'Information shared successfully' };
    } catch (error) {
      logger.error('Information sharing failed', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Agent coordination endpoint
  app.post<{
    Body: CoordinationRequest & { fromAgent: string };
  }>('/api/coordination/request', async (request, reply) => {
    try {
      const { fromAgent, ...coordinationRequest } = request.body;
      
      const coordinationId = await (app as any).coordinationHub.coordinateAgents(
        coordinationRequest, 
        fromAgent
      );
      
      logger.info('Coordination requested', { 
        fromAgent,
        type: coordinationRequest.coordinationType,
        participants: coordinationRequest.participants.length,
        coordinationId
      });
      
      return { 
        success: true, 
        coordinationId,
        participants: coordinationRequest.participants
      };
    } catch (error) {
      logger.error('Coordination request failed', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Business event broadcast endpoint
  app.post<{
    Body: BusinessEvent & { fromAgent: string };
  }>('/api/events/broadcast', async (request, reply) => {
    try {
      const { fromAgent, ...businessEvent } = request.body;
      
      await (app as any).coordinationHub.broadcastBusinessEvent(businessEvent, fromAgent);
      
      logger.info('Business event broadcasted', { 
        fromAgent,
        eventType: businessEvent.eventType,
        entityType: businessEvent.entityType
      });
      
      return { success: true, message: 'Event broadcasted successfully' };
    } catch (error) {
      logger.error('Event broadcast failed', error);
      reply.code(500);
      return { success: false, error: error.message };
    }
  });

  // Coordination analytics endpoint
  app.get<{
    Querystring: { start?: string; end?: string };
  }>('/api/analytics', async (request) => {
    try {
      const { start, end } = request.query;
      const period = start && end ? {
        start: new Date(start),
        end: new Date(end)
      } : undefined;
      
      const analytics = await (app as any).coordinationHub.getCoordinationAnalytics(period);
      
      return {
        success: true,
        analytics,
        period: period || { start: 'beginning', end: 'now' }
      };
    } catch (error) {
      logger.error('Analytics request failed', error);
      return { success: false, error: error.message };
    }
  });

  // WebSocket endpoint for real-time coordination
  app.register(async function (fastify) {
    fastify.get('/ws/:agentId', { websocket: true }, (connection, request) => {
      const agentId = (request.params as any).agentId;
      
      logger.info('WebSocket connection established', { agentId });
      
      (app as any).coordinationHub.handleWebSocketConnection(connection.socket, agentId);
      
      connection.socket.on('close', () => {
        logger.info('WebSocket connection closed', { agentId });
      });
    });
  });

  // Demo/test endpoints for development
  if (process.env.NODE_ENV === 'development') {
    // Register demo agents
    app.post('/api/demo/register-agents', async () => {
      const demoAgents: AgentInfo[] = [
        {
          id: 'dspy-optimizer-1',
          name: 'DSPy Prompt Optimizer',
          type: AgentType.DSPY_OPTIMIZER,
          capabilities: ['prompt-optimization', 'business-analysis', 'A/B-testing'],
          currentLoad: 20,
          maxCapacity: 100,
          status: 'healthy' as any,
          lastHeartbeat: new Date(),
          version: '1.0.0',
          endpoint: 'http://dspy-service:3011',
          metadata: { region: 'us-east-1', cost_per_task: 0.01 }
        },
        {
          id: 'marketing-context-1',
          name: 'Marketing Context Engine',
          type: AgentType.MARKETING_CONTEXT,
          capabilities: ['campaign-analysis', 'customer-segmentation', 'performance-tracking'],
          currentLoad: 45,
          maxCapacity: 100,
          status: 'healthy' as any,
          lastHeartbeat: new Date(),
          version: '1.0.0',
          endpoint: 'http://marketing-context:3020',
          metadata: { specialization: 'B2B SaaS' }
        },
        {
          id: 'knowledge-graph-1',
          name: 'Knowledge Graph Service',
          type: AgentType.KNOWLEDGE_GRAPH,
          capabilities: ['relationship-analysis', 'pattern-recognition', 'business-intelligence'],
          currentLoad: 60,
          maxCapacity: 100,
          status: 'healthy' as any,
          lastHeartbeat: new Date(),
          version: '1.0.0',
          endpoint: 'http://knowledge-graph:3013',
          metadata: { database: 'Neo4j', nodes: 50000 }
        }
      ];

      for (const agent of demoAgents) {
        await (app as any).coordinationHub.registerAgent(agent);
      }

      return { 
        success: true, 
        message: 'Demo agents registered',
        agents: demoAgents.map(a => ({ id: a.id, type: a.type }))
      };
    });

    // Simulate business events
    app.post('/api/demo/simulate-events', async () => {
      const events: (BusinessEvent & { fromAgent: string })[] = [
        {
          fromAgent: 'system',
          eventType: 'customer.signup',
          entityType: 'customer',
          entityId: 'cust-123',
          data: { plan: 'enterprise', industry: 'fintech' },
          metadata: { source: 'web-app', timestamp: new Date(), version: '1.0' }
        },
        {
          fromAgent: 'legal-analysis',
          eventType: 'document.analyzed',
          entityType: 'document',
          entityId: 'doc-456',
          data: { riskScore: 7.2, patternsFound: 15 },
          metadata: { source: 'analysis-service', timestamp: new Date(), version: '1.0' }
        }
      ];

      for (const event of events) {
        const { fromAgent, ...businessEvent } = event;
        await (app as any).coordinationHub.broadcastBusinessEvent(businessEvent, fromAgent);
      }

      return { 
        success: true, 
        message: 'Demo events broadcasted',
        eventCount: events.length
      };
    });
  }

  // Register team management routes
  await app.register(teamRoutes, { prefix: '' });

  // Register dashboard routes
  await app.register(dashboardRoutes, { prefix: '' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
        timestamp: new Date().toISOString(),
      },
    });
  });

  return app;
}

async function start() {
  try {
    const app = await buildApp();
    
    const port = parseInt(process.env.PORT || '3014');
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });
    
    logger.info('Agent Coordination Service started', {
      port,
      host,
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      try {
        await app.close();
        logger.info('Agent Coordination Service stopped');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start Agent Coordination Service', error);
    process.exit(1);
  }
}

// TypeScript declarations
declare module 'fastify' {
  interface FastifyInstance {
    coordinationHub: CoordinationHub;
  }
}

if (require.main === module) {
  start();
}

export { buildApp, start };