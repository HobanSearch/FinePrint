/**
 * Mock Agent Orchestration Service for Testing
 * Provides a lightweight HTTP server that implements the expected API endpoints
 */

const http = require('http');
const url = require('url');
const { v4: uuidv4 } = require('uuid');

// Mock data storage
const agents = new Map();
const workflows = new Map();
const executions = new Map();
const businessProcesses = new Map();
const resources = new Map();
const messages = [];
const subscriptions = new Map();
const alerts = new Map();

// Helper functions
const sendJSON = (res, data, statusCode = 200) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const parseBody = (req) => {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
};

// Request handler
const handleRequest = async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;
  const query = parsedUrl.query;

  console.log(`${method} ${path}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check
    if (path === '/health') {
      return sendJSON(res, {
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          version: '1.0.0',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Agent endpoints
    if (path === '/api/v1/agents' && method === 'GET') {
      const agentList = Array.from(agents.values()).map(agent => ({
        id: agent.id,
        type: agent.registration.type,
        name: agent.registration.name,
        status: agent.status,
        currentLoad: agent.currentLoad,
        capabilities: agent.registration.capabilities,
        endpoint: agent.registration.endpoint,
        lastHealthCheck: agent.lastHealthCheck,
        activeTaskCount: agent.activeTaskCount || 0,
        completedTaskCount: agent.completedTaskCount || Math.floor(Math.random() * 100)
      }));

      return sendJSON(res, {
        success: true,
        data: agentList
      });
    }

    if (path === '/api/v1/agents' && method === 'POST') {
      const body = await parseBody(req);
      const agentId = uuidv4();
      
      const agent = {
        id: agentId,
        registration: {
          ...body,
          id: agentId
        },
        status: 'active',
        currentLoad: 0,
        lastHealthCheck: new Date().toISOString(),
        createdAt: new Date().toISOString()
      };

      agents.set(agentId, agent);
      
      return sendJSON(res, {
        success: true,
        data: { agentId }
      }, 201);
    }

    if (path.startsWith('/api/v1/agents/') && method === 'GET') {
      const agentId = path.split('/')[4];
      const agent = agents.get(agentId);
      
      if (!agent) {
        return sendJSON(res, {
          success: false,
          error: 'Agent not found'
        }, 404);
      }

      return sendJSON(res, {
        success: true,
        data: agent
      });
    }

    if (path.startsWith('/api/v1/agents/') && method === 'DELETE') {
      const agentId = path.split('/')[4];
      
      if (agents.has(agentId)) {
        agents.delete(agentId);
        return sendJSON(res, {
          success: true,
          message: 'Agent unregistered successfully'
        });
      }

      return sendJSON(res, {
        success: false,
        error: 'Agent not found'
      }, 404);
    }

    if (path === '/api/v1/agents/search' && method === 'POST') {
      const body = await parseBody(req);
      const allAgents = Array.from(agents.values());
      
      // Simple filtering based on criteria
      let filtered = allAgents;
      
      if (body.type) {
        filtered = filtered.filter(a => a.registration.type === body.type);
      }
      
      if (body.capabilities) {
        filtered = filtered.filter(a => 
          body.capabilities.every(cap => a.registration.capabilities.includes(cap))
        );
      }

      return sendJSON(res, {
        success: true,
        data: filtered.map(agent => ({
          id: agent.id,
          type: agent.registration.type,
          name: agent.registration.name,
          status: agent.status,
          currentLoad: agent.currentLoad,
          capabilities: agent.registration.capabilities
        }))
      });
    }

    if (path === '/api/v1/agents/stats' && method === 'GET') {
      const allAgents = Array.from(agents.values());
      
      return sendJSON(res, {
        success: true,
        data: {
          total: allAgents.length,
          active: allAgents.filter(a => a.status === 'active').length,
          idle: allAgents.filter(a => a.status === 'idle').length,
          busy: allAgents.filter(a => a.status === 'busy').length,
          offline: allAgents.filter(a => a.status === 'offline').length,
          types: [...new Set(allAgents.map(a => a.registration.type))]
        }
      });
    }

    // Workflow endpoints
    if (path === '/api/v1/workflows' && method === 'POST') {
      const body = await parseBody(req);
      const workflowId = uuidv4();
      
      const workflow = {
        id: workflowId,
        ...body,
        status: 'created',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      workflows.set(workflowId, workflow);
      
      return sendJSON(res, {
        success: true,
        data: { workflowId }
      }, 201);
    }

    if (path.includes('/workflows/') && path.includes('/execute') && method === 'POST') {
      const workflowId = path.split('/')[4];
      const body = await parseBody(req);
      const executionId = uuidv4();
      
      const execution = {
        id: executionId,
        workflowId,
        status: 'running',
        progress: 0,
        input: body.input,
        startedAt: new Date().toISOString(),
        estimatedCompletion: new Date(Date.now() + 30000).toISOString() // 30 seconds
      };

      executions.set(executionId, execution);

      // Simulate workflow progress
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          execution.status = 'completed';
          execution.completedAt = new Date().toISOString();
          execution.output = {
            step1: { result: 'processed', data: 'sample output' },
            step2: { analysis: 'completed', confidence: 0.95 },
            final_report: { status: 'success', summary: 'Workflow completed successfully' }
          };
          clearInterval(progressInterval);
        }
        execution.progress = Math.min(progress, 100);
        execution.updatedAt = new Date().toISOString();
      }, 2000);
      
      return sendJSON(res, {
        success: true,
        data: { executionId }
      });
    }

    if (path.includes('/workflows/executions/') && method === 'GET') {
      const executionId = path.split('/')[5];
      const execution = executions.get(executionId);
      
      if (!execution) {
        return sendJSON(res, {
          success: false,
          error: 'Execution not found'
        }, 404);
      }

      return sendJSON(res, {
        success: true,
        data: execution
      });
    }

    // Business Process endpoints
    if (path === '/api/v1/business-processes' && method === 'POST') {
      const body = await parseBody(req);
      const processId = uuidv4();
      
      const process = {
        id: processId,
        ...body,
        status: 'created',
        createdAt: new Date().toISOString()
      };

      businessProcesses.set(processId, process);
      
      return sendJSON(res, {
        success: true,
        data: { processId }
      }, 201);
    }

    if (path.includes('/business-processes/') && path.includes('/execute') && method === 'POST') {
      const processId = path.split('/')[4];
      const body = await parseBody(req);
      const executionId = uuidv4();
      
      const execution = {
        id: executionId,
        processId,
        status: 'running',
        progress: Math.floor(Math.random() * 50) + 25, // 25-75%
        input: body.input,
        context: body.context,
        startedAt: new Date().toISOString(),
        estimated_completion: new Date(Date.now() + 60000).toISOString()
      };

      executions.set(executionId, execution);
      
      return sendJSON(res, {
        success: true,
        data: { executionId }
      });
    }

    if (path.includes('/business-processes/executions/') && method === 'GET') {
      const executionId = path.split('/')[5];
      const execution = executions.get(executionId);
      
      if (!execution) {
        return sendJSON(res, {
          success: false,
          error: 'Business process execution not found'
        }, 404);
      }

      return sendJSON(res, {
        success: true,
        data: execution
      });
    }

    // Resource Management endpoints
    if (path === '/api/v1/resources/allocate' && method === 'POST') {
      const body = await parseBody(req);
      const allocationId = uuidv4();
      
      const allocation = {
        id: allocationId,
        agentId: body.agent_id,
        resources: body.resources,
        duration: body.duration,
        priority: body.priority,
        status: 'allocated',
        createdAt: new Date().toISOString()
      };

      resources.set(allocationId, allocation);
      
      return sendJSON(res, {
        success: true,
        data: { allocationId }
      });
    }

    if (path.includes('/api/v1/resources/usage/') && method === 'GET') {
      const agentId = path.split('/')[5];
      
      return sendJSON(res, {
        success: true,
        data: {
          agent_id: agentId,
          cpu_percent: Math.floor(Math.random() * 80) + 10,
          memory_mb: Math.floor(Math.random() * 1000) + 256,
          storage_mb: Math.floor(Math.random() * 500) + 100,
          active_allocations: Math.floor(Math.random() * 5) + 1,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (path === '/api/v1/resources/optimization' && method === 'GET') {
      return sendJSON(res, {
        success: true,
        data: {
          recommendations: [
            {
              type: 'cpu_optimization',
              description: 'Consider reducing CPU allocation for idle agents',
              impact: 'medium',
              estimated_savings: '15%'
            },
            {
              type: 'memory_optimization', 
              description: 'Memory usage can be optimized by 20%',
              impact: 'high',
              estimated_savings: '20%'
            }
          ],
          overall_efficiency: 0.82,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Communication Bus endpoints
    if (path === '/api/v1/communication/publish' && method === 'POST') {
      const body = await parseBody(req);
      const messageId = uuidv4();
      
      const message = {
        id: messageId,
        ...body,
        timestamp: new Date().toISOString(),
        status: 'published'
      };

      messages.push(message);
      
      return sendJSON(res, {
        success: true,
        data: { messageId }
      });
    }

    if (path === '/api/v1/communication/subscribe' && method === 'POST') {
      const body = await parseBody(req);
      const subscriptionId = uuidv4();
      
      const subscription = {
        id: subscriptionId,
        ...body,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      subscriptions.set(subscriptionId, subscription);
      
      return sendJSON(res, {
        success: true,
        data: { subscriptionId }
      });
    }

    if (path === '/api/v1/communication/messages' && method === 'GET') {
      const limit = parseInt(query.limit) || 10;
      const channel = query.channel;
      
      let filteredMessages = messages;
      if (channel) {
        filteredMessages = messages.filter(m => m.channel === channel);
      }

      return sendJSON(res, {
        success: true,
        data: {
          messages: filteredMessages.slice(-limit),
          total: filteredMessages.length
        }
      });
    }

    // Decision Engine endpoints
    if (path === '/api/v1/decisions/agent-selection' && method === 'POST') {
      const body = await parseBody(req);
      const availableAgents = body.available_agents || [];
      
      // Simple agent selection logic
      const selectedAgentId = availableAgents[Math.floor(Math.random() * availableAgents.length)] || uuidv4();
      
      return sendJSON(res, {
        success: true,
        data: {
          selected_agent: {
            agent_id: selectedAgentId,
            score: 0.87,
            reasoning: [
              'High capability match',
              'Low current load',
              'Good historical performance',
              'Optimal resource availability'
            ]
          }
        }
      });
    }

    if (path === '/api/v1/decisions/conflict-resolution' && method === 'POST') {
      const body = await parseBody(req);
      const conflicts = body.conflicts || [];
      
      const resolutions = conflicts.map((conflict, index) => ({
        conflict_id: index,
        strategy: body.resolution_strategy || 'priority_based',
        winner: conflict.agents[0], // First agent wins for simplicity
        resolution: 'Resource allocated based on priority',
        timestamp: new Date().toISOString()
      }));

      return sendJSON(res, {
        success: true,
        data: { resolutions }
      });
    }

    // Monitoring endpoints
    if (path === '/api/v1/monitoring/metrics' && method === 'GET') {
      return sendJSON(res, {
        success: true,
        data: {
          agents: {
            active_count: agents.size,
            total_count: agents.size,
            healthy_count: Math.floor(agents.size * 0.9),
            avg_load: 0.45
          },
          workflows: {
            running_count: executions.size,
            completed_today: Math.floor(Math.random() * 50) + 10,
            success_rate: 0.94
          },
          system: {
            cpu_usage: Math.floor(Math.random() * 30) + 20,
            memory_usage: Math.floor(Math.random() * 40) + 30,
            disk_usage: Math.floor(Math.random() * 20) + 10,
            uptime: process.uptime()
          },
          timestamp: new Date().toISOString()
        }
      });
    }

    if (path === '/api/v1/monitoring/alerts' && method === 'POST') {
      const body = await parseBody(req);
      const alertId = uuidv4();
      
      const alert = {
        id: alertId,
        ...body,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      alerts.set(alertId, alert);
      
      return sendJSON(res, {
        success: true,
        data: { alertId }
      });
    }

    if (path === '/api/v1/monitoring/alerts/history' && method === 'GET') {
      const limit = parseInt(query.limit) || 5;
      
      return sendJSON(res, {
        success: true,
        data: {
          alerts: Array.from(alerts.values()).slice(-limit),
          total: alerts.size
        }
      });
    }

    // Default 404 response
    return sendJSON(res, {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${method} ${path} not found`,
        timestamp: new Date().toISOString()
      }
    }, 404);

  } catch (error) {
    console.error('Request error:', error);
    return sendJSON(res, {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      }
    }, 500);
  }
};

// Create and start server
const server = http.createServer(handleRequest);

const PORT = 3010;
server.listen(PORT, () => {
  console.log(`🚀 Mock Agent Orchestration Service running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📚 Available endpoints:`);
  console.log(`   - GET  /health`);
  console.log(`   - GET  /api/v1/agents`);
  console.log(`   - POST /api/v1/agents`);
  console.log(`   - POST /api/v1/workflows`);
  console.log(`   - POST /api/v1/business-processes`);
  console.log(`   - GET  /api/v1/monitoring/metrics`);
  console.log(`   - And many more...`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down mock service...');
  server.close(() => {
    console.log('Mock service stopped');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down mock service...');
  server.close(() => {
    console.log('Mock service stopped');
    process.exit(0);
  });
});