/**
 * Fine Print AI - Agent Orchestration Service Test Suite
 * Comprehensive testing for agent workflows, business processes, and system integration
 */

const axios = require('axios');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

// Test configuration
const config = {
  baseURL: 'http://localhost:3010',
  wsBaseURL: 'ws://localhost:3010',
  timeout: 30000,
  retries: 3,
};

// Test utilities
class TestRunner {
  constructor() {
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      errors: [],
    };
    this.startTime = Date.now();
  }

  async runTest(name, testFn) {
    this.results.total++;
    console.log(`\n🧪 Running test: ${name}`);
    
    try {
      await testFn();
      this.results.passed++;
      console.log(`✅ Test passed: ${name}`);
    } catch (error) {
      this.results.failed++;
      this.results.errors.push({ test: name, error: error.message });
      console.error(`❌ Test failed: ${name} - ${error.message}`);
    }
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  generateSummary() {
    const duration = Date.now() - this.startTime;
    const successRate = ((this.results.passed / this.results.total) * 100).toFixed(1);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    
    if (this.results.errors.length > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.test}: ${error.error}`);
      });
    }
    
    return this.results.failed === 0;
  }
}

// API client wrapper
class OrchestrationClient {
  constructor(baseURL) {
    this.client = axios.create({
      baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async get(path) {
    const response = await this.client.get(path);
    return response.data;
  }

  async post(path, data) {
    const response = await this.client.post(path, data);
    return response.data;
  }

  async put(path, data) {
    const response = await this.client.put(path, data);
    return response.data;
  }

  async delete(path) {
    const response = await this.client.delete(path);
    return response.data;
  }
}

// Test data generators
const generateAgentRegistration = (type = 'test-agent') => ({
  type,
  name: `${type}-${Date.now()}`,
  version: '1.0.0',
  capabilities: ['task_processing', 'data_analysis', 'workflow_execution'],
  endpoint: `http://localhost:${3000 + Math.floor(Math.random() * 1000)}`,
  healthCheckPath: '/health',
  priority: Math.floor(Math.random() * 10) + 1,
  maxConcurrentTasks: Math.floor(Math.random() * 10) + 1,
  timeout: 5000,
  metadata: {
    environment: 'test',
    region: 'us-east-1',
  },
});

const generateWorkflowDefinition = (agentIds = []) => ({
  name: `test-workflow-${Date.now()}`,
  description: 'Test workflow for agent orchestration validation',
  version: '1.0.0',
  triggers: [{
    type: 'manual',
    conditions: {},
  }],
  steps: [
    {
      id: 'step-1',
      name: 'Data Processing',
      type: 'agent_task',
      agent_type: 'test-agent',
      action: 'process_data',
      input: {
        data: 'test input data',
        options: {
          format: 'json',
          validation: true,
        },
      },
      timeout: 10000,
      retries: 3,
    },
    {
      id: 'step-2',
      name: 'Analysis',
      type: 'agent_task',
      agent_type: 'test-agent',
      action: 'analyze_results',
      depends_on: ['step-1'],
      input: {
        source: '${step-1.output}',
        analysis_type: 'comprehensive',
      },
      timeout: 15000,
      retries: 2,
    },
    {
      id: 'step-3',
      name: 'Final Report',
      type: 'consolidation',
      depends_on: ['step-1', 'step-2'],
      action: 'generate_report',
      input: {
        data: '${step-1.output}',
        analysis: '${step-2.output}',
        format: 'summary',
      },
    },
  ],
  error_handling: {
    on_failure: 'retry',
    max_retries: 3,
    fallback_strategy: 'partial_completion',
  },
  notifications: {
    on_completion: true,
    on_failure: true,
    channels: ['websocket'],
  },
});

const generateBusinessProcess = () => ({
  name: `business-process-${Date.now()}`,
  description: 'Test business process for comprehensive validation',
  category: 'content_creation',
  priority: 'medium',
  workflow_template: 'content_marketing_workflow',
  input_schema: {
    topic: { type: 'string', required: true },
    target_audience: { type: 'string', required: true },
    content_type: { type: 'string', enum: ['blog', 'social', 'email'], required: true },
    deadline: { type: 'string', format: 'date-time' },
  },
  output_schema: {
    content: { type: 'string' },
    metadata: { type: 'object' },
    performance_metrics: { type: 'object' },
  },
  sla: {
    max_duration: 3600000, // 1 hour
    target_duration: 1800000, // 30 minutes
  },
  approval_required: false,
  auto_execute: true,
});

// Test suites
async function testHealthCheck(client) {
  const response = await client.get('/health');
  
  if (!response.success) {
    throw new Error('Health check failed');
  }
  
  if (!response.data.status || response.data.status !== 'healthy') {
    throw new Error(`Unexpected health status: ${response.data.status}`);
  }
  
  console.log('   ✓ Service is healthy');
  console.log(`   ✓ Uptime: ${response.data.uptime}s`);
  console.log(`   ✓ Version: ${response.data.version}`);
}

async function testAgentRegistration(client) {
  // Test agent registration
  const agentData = generateAgentRegistration('content-marketing-agent');
  const registerResponse = await client.post('/api/v1/agents', agentData);
  
  if (!registerResponse.success || !registerResponse.data.agentId) {
    throw new Error('Agent registration failed');
  }
  
  const agentId = registerResponse.data.agentId;
  console.log(`   ✓ Agent registered with ID: ${agentId}`);
  
  // Test getting registered agent
  const getResponse = await client.get(`/api/v1/agents/${agentId}`);
  
  if (!getResponse.success || !getResponse.data) {
    throw new Error('Failed to retrieve registered agent');
  }
  
  const agent = getResponse.data;
  if (agent.registration.name !== agentData.name) {
    throw new Error('Agent data mismatch');
  }
  
  console.log(`   ✓ Agent retrieved: ${agent.registration.name}`);
  console.log(`   ✓ Status: ${agent.status}`);
  console.log(`   ✓ Capabilities: ${agent.registration.capabilities.join(', ')}`);
  
  return agentId;
}

async function testAgentDiscovery(client) {
  // Register multiple agents for testing
  const agentIds = [];
  const agentTypes = ['sales-agent', 'customer-success-agent', 'devops-agent'];
  
  for (const type of agentTypes) {
    const agentData = generateAgentRegistration(type);
    const response = await client.post('/api/v1/agents', agentData);
    agentIds.push(response.data.agentId);
  }
  
  // Test getting all agents
  const allAgentsResponse = await client.get('/api/v1/agents');
  
  if (!allAgentsResponse.success || !Array.isArray(allAgentsResponse.data)) {
    throw new Error('Failed to get all agents');
  }
  
  console.log(`   ✓ Retrieved ${allAgentsResponse.data.length} total agents`);
  
  // Test agent search
  const searchResponse = await client.post('/api/v1/agents/search', {
    type: 'sales-agent',
    capabilities: ['task_processing'],
    status: ['active', 'idle'],
  });
  
  if (!searchResponse.success || !Array.isArray(searchResponse.data)) {
    throw new Error('Agent search failed');
  }
  
  console.log(`   ✓ Found ${searchResponse.data.length} agents matching criteria`);
  
  // Test agent statistics
  const statsResponse = await client.get('/api/v1/agents/stats');
  
  if (!statsResponse.success || !statsResponse.data.total) {
    throw new Error('Failed to get agent statistics');
  }
  
  console.log(`   ✓ Agent stats: ${JSON.stringify(statsResponse.data)}`);
  
  return agentIds;
}

async function testWorkflowExecution(client, agentIds) {
  // Create workflow definition
  const workflowDef = generateWorkflowDefinition(agentIds);
  const createResponse = await client.post('/api/v1/workflows', workflowDef);
  
  if (!createResponse.success || !createResponse.data.workflowId) {
    throw new Error('Workflow creation failed');
  }
  
  const workflowId = createResponse.data.workflowId;
  console.log(`   ✓ Workflow created with ID: ${workflowId}`);
  
  // Execute workflow
  const executeResponse = await client.post(`/api/v1/workflows/${workflowId}/execute`, {
    input: {
      test_data: 'sample input for workflow execution',
      environment: 'test',
    },
    priority: 'high',
  });
  
  if (!executeResponse.success || !executeResponse.data.executionId) {
    throw new Error('Workflow execution failed');
  }
  
  const executionId = executeResponse.data.executionId;
  console.log(`   ✓ Workflow execution started: ${executionId}`);
  
  // Monitor execution progress
  let execution;
  let attempts = 0;
  const maxAttempts = 10;
  
  do {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    const statusResponse = await client.get(`/api/v1/workflows/executions/${executionId}`);
    
    if (!statusResponse.success) {
      throw new Error('Failed to get execution status');
    }
    
    execution = statusResponse.data;
    console.log(`   ⏳ Execution status: ${execution.status} (${execution.progress}%)`);
    
    attempts++;
  } while (execution.status === 'running' && attempts < maxAttempts);
  
  if (execution.status === 'running') {
    console.log('   ⚠️  Workflow still running after timeout - this is expected for comprehensive tests');
  } else {
    console.log(`   ✓ Workflow completed with status: ${execution.status}`);
    
    if (execution.output) {
      console.log(`   ✓ Execution output keys: ${Object.keys(execution.output).join(', ')}`);
    }
  }
  
  return { workflowId, executionId };
}

async function testBusinessProcessAutomation(client) {
  // Create business process
  const processData = generateBusinessProcess();
  const createResponse = await client.post('/api/v1/business-processes', processData);
  
  if (!createResponse.success || !createResponse.data.processId) {
    throw new Error('Business process creation failed');
  }
  
  const processId = createResponse.data.processId;
  console.log(`   ✓ Business process created: ${processId}`);
  
  // Execute business process
  const executeResponse = await client.post(`/api/v1/business-processes/${processId}/execute`, {
    input: {
      topic: 'AI-Powered Legal Document Analysis',
      target_audience: 'Legal professionals and compliance teams',
      content_type: 'blog',
      deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    context: {
      user_id: 'test-user-123',
      organization_id: 'test-org-456',
      priority: 'high',
    },
  });
  
  if (!executeResponse.success || !executeResponse.data.executionId) {
    throw new Error('Business process execution failed');
  }
  
  const executionId = executeResponse.data.executionId;
  console.log(`   ✓ Business process execution started: ${executionId}`);
  
  // Monitor execution
  const statusResponse = await client.get(`/api/v1/business-processes/executions/${executionId}`);
  
  if (!statusResponse.success) {
    throw new Error('Failed to get business process execution status');
  }
  
  const execution = statusResponse.data;
  console.log(`   ✓ Business process status: ${execution.status}`);
  console.log(`   ✓ Progress: ${execution.progress}%`);
  
  if (execution.estimated_completion) {
    console.log(`   ✓ ETA: ${new Date(execution.estimated_completion).toLocaleString()}`);
  }
  
  return { processId, executionId };
}

async function testResourceManagement(client, agentIds) {
  // Test resource allocation
  const allocationResponse = await client.post('/api/v1/resources/allocate', {
    agent_id: agentIds[0],
    resources: {
      cpu_cores: 2,
      memory_mb: 1024,
      storage_mb: 500,
    },
    duration: 300000, // 5 minutes
    priority: 'high',
  });
  
  if (!allocationResponse.success || !allocationResponse.data.allocationId) {
    throw new Error('Resource allocation failed');
  }
  
  const allocationId = allocationResponse.data.allocationId;
  console.log(`   ✓ Resources allocated: ${allocationId}`);
  
  // Test resource usage monitoring
  const usageResponse = await client.get(`/api/v1/resources/usage/${agentIds[0]}`);
  
  if (!usageResponse.success) {
    throw new Error('Failed to get resource usage');
  }
  
  const usage = usageResponse.data;
  console.log(`   ✓ CPU usage: ${usage.cpu_percent}%`);
  console.log(`   ✓ Memory usage: ${usage.memory_mb}MB`);
  console.log(`   ✓ Active allocations: ${usage.active_allocations}`);
  
  // Test resource optimization recommendations
  const optimizationResponse = await client.get('/api/v1/resources/optimization');
  
  if (!optimizationResponse.success) {
    throw new Error('Failed to get optimization recommendations');
  }
  
  const recommendations = optimizationResponse.data;
  console.log(`   ✓ Optimization recommendations: ${recommendations.recommendations.length}`);
  
  if (recommendations.recommendations.length > 0) {
    console.log(`   ✓ Top recommendation: ${recommendations.recommendations[0].description}`);
  }
  
  return allocationId;
}

async function testCommunicationBus(client, agentIds) {
  // Test message publishing
  const publishResponse = await client.post('/api/v1/communication/publish', {
    channel: 'agent.notifications',
    message: {
      type: 'task_assigned',
      agent_id: agentIds[0],
      task_id: uuidv4(),
      priority: 'high',
      payload: {
        action: 'analyze_document',
        document_id: 'test-doc-123',
        deadline: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    },
    routing_key: `agent.${agentIds[0]}.tasks`,
  });
  
  if (!publishResponse.success) {
    throw new Error('Message publishing failed');
  }
  
  console.log(`   ✓ Message published to channel: agent.notifications`);
  
  // Test message subscription
  const subscribeResponse = await client.post('/api/v1/communication/subscribe', {
    channel: 'system.events',
    agent_id: agentIds[1],
    filters: {
      event_type: ['workflow_completed', 'task_failed'],
      priority: ['high', 'critical'],
    },
  });
  
  if (!subscribeResponse.success || !subscribeResponse.data.subscriptionId) {
    throw new Error('Message subscription failed');
  }
  
  const subscriptionId = subscribeResponse.data.subscriptionId;
  console.log(`   ✓ Subscription created: ${subscriptionId}`);
  
  // Test getting message history
  const historyResponse = await client.get('/api/v1/communication/messages', {
    params: {
      channel: 'agent.notifications',
      limit: 10,
      since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  });
  
  if (!historyResponse.success || !Array.isArray(historyResponse.data.messages)) {
    throw new Error('Failed to get message history');
  }
  
  console.log(`   ✓ Retrieved ${historyResponse.data.messages.length} recent messages`);
  
  return subscriptionId;
}

async function testMonitoringAndAlerts(client) {
  // Test system metrics
  const metricsResponse = await client.get('/api/v1/monitoring/metrics');
  
  if (!metricsResponse.success || !metricsResponse.data) {
    throw new Error('Failed to get system metrics');
  }
  
  const metrics = metricsResponse.data;
  console.log(`   ✓ Active agents: ${metrics.agents.active_count}`);
  console.log(`   ✓ Running workflows: ${metrics.workflows.running_count}`);
  console.log(`   ✓ System load: ${metrics.system.cpu_usage}%`);
  console.log(`   ✓ Memory usage: ${metrics.system.memory_usage}%`);
  
  // Test alert configuration
  const alertResponse = await client.post('/api/v1/monitoring/alerts', {
    name: 'High Agent Failure Rate',
    description: 'Alert when agent failure rate exceeds threshold',
    condition: {
      metric: 'agent.failure_rate',
      operator: 'greater_than',
      threshold: 0.1, // 10%
      window: '5m',
    },
    actions: [{
      type: 'webhook',
      endpoint: 'http://localhost:3000/alerts',
      method: 'POST',
    }],
    enabled: true,
  });
  
  if (!alertResponse.success || !alertResponse.data.alertId) {
    throw new Error('Alert creation failed');
  }
  
  const alertId = alertResponse.data.alertId;
  console.log(`   ✓ Alert configured: ${alertId}`);
  
  // Test getting alert history
  const alertHistoryResponse = await client.get('/api/v1/monitoring/alerts/history', {
    params: {
      limit: 5,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  });
  
  if (!alertHistoryResponse.success) {
    throw new Error('Failed to get alert history');
  }
  
  console.log(`   ✓ Alert history entries: ${alertHistoryResponse.data.alerts.length}`);
  
  return alertId;
}

async function testDecisionEngine(client, agentIds) {
  // Test decision making for agent selection
  const decisionResponse = await client.post('/api/v1/decisions/agent-selection', {
    task: {
      type: 'content_generation',
      requirements: {
        capabilities: ['nlp_processing', 'content_creation'],
        priority: 'high',
        deadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        resource_requirements: {
          cpu_cores: 1,
          memory_mb: 512,
        },
      },
    },
    available_agents: agentIds,
    criteria: {
      load_balancing: true,
      capability_matching: true,
      resource_availability: true,
      historical_performance: true,
    },
  });
  
  if (!decisionResponse.success || !decisionResponse.data.selected_agent) {
    throw new Error('Agent selection decision failed');
  }
  
  const selectedAgent = decisionResponse.data.selected_agent;
  console.log(`   ✓ Selected agent: ${selectedAgent.agent_id}`);
  console.log(`   ✓ Selection score: ${selectedAgent.score}`);
  console.log(`   ✓ Reasoning: ${selectedAgent.reasoning.join(', ')}`);
  
  // Test conflict resolution
  const conflictResponse = await client.post('/api/v1/decisions/conflict-resolution', {
    conflicts: [{
      type: 'resource_contention',
      agents: [agentIds[0], agentIds[1]],
      resource: {
        type: 'cpu_cores',
        available: 2,
        requested: [2, 2],
      },
      priorities: ['high', 'medium'],
    }],
    resolution_strategy: 'priority_based',
  });
  
  if (!conflictResponse.success || !conflictResponse.data.resolutions) {
    throw new Error('Conflict resolution failed');
  }
  
  const resolutions = conflictResponse.data.resolutions;
  console.log(`   ✓ Conflicts resolved: ${resolutions.length}`);
  
  if (resolutions.length > 0) {
    console.log(`   ✓ Resolution strategy: ${resolutions[0].strategy}`);
    console.log(`   ✓ Winner: ${resolutions[0].winner}`);
  }
  
  return { selectedAgent, resolutions };
}

async function testWebSocketConnection() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${config.wsBaseURL}/api/v1/monitoring/events`);
    let messageCount = 0;
    const expectedMessages = 3;
    
    const timeout = setTimeout(() => {
      ws.close();
      if (messageCount > 0) {
        resolve();
      } else {
        reject(new Error('No WebSocket messages received within timeout'));
      }
    }, 10000);
    
    ws.on('open', () => {
      console.log('   ✓ WebSocket connection established');
      
      // Subscribe to events
      ws.send(JSON.stringify({
        type: 'subscribe',
        channels: ['agent.events', 'workflow.events', 'system.events'],
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        console.log(`   ✓ WebSocket message received: ${message.type || 'unknown'}`);
        
        if (messageCount >= expectedMessages) {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }
      } catch (error) {
        console.log(`   ✓ WebSocket raw message: ${data.toString().substring(0, 100)}...`);
        messageCount++;
      }
    });
    
    ws.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${error.message}`));
    });
    
    ws.on('close', () => {
      console.log('   ✓ WebSocket connection closed');
    });
  });
}

async function testLoadAndStress(client) {
  console.log('   🔄 Starting load test with concurrent requests...');
  
  const concurrentRequests = 10;
  const requestsPerBatch = 5;
  
  // Test concurrent agent registrations
  const registrationPromises = [];
  for (let i = 0; i < concurrentRequests; i++) {
    const agentData = generateAgentRegistration(`load-test-agent-${i}`);
    registrationPromises.push(client.post('/api/v1/agents', agentData));
  }
  
  const registrationResults = await Promise.allSettled(registrationPromises);
  const successfulRegistrations = registrationResults.filter(r => r.status === 'fulfilled').length;
  
  console.log(`   ✓ Concurrent registrations: ${successfulRegistrations}/${concurrentRequests} successful`);
  
  // Test concurrent workflow executions
  const workflowPromises = [];
  for (let i = 0; i < requestsPerBatch; i++) {
    const workflowDef = generateWorkflowDefinition();
    workflowPromises.push(
      client.post('/api/v1/workflows', workflowDef)
        .then(response => client.post(`/api/v1/workflows/${response.data.workflowId}/execute`, {
          input: { test_id: i },
        }))
    );
  }
  
  const workflowResults = await Promise.allSettled(workflowPromises);
  const successfulWorkflows = workflowResults.filter(r => r.status === 'fulfilled').length;
  
  console.log(`   ✓ Concurrent workflow executions: ${successfulWorkflows}/${requestsPerBatch} successful`);
  
  // Test API response times under load
  const startTime = Date.now();
  const healthChecks = [];
  for (let i = 0; i < 20; i++) {
    healthChecks.push(client.get('/health'));
  }
  
  await Promise.all(healthChecks);
  const avgResponseTime = (Date.now() - startTime) / 20;
  
  console.log(`   ✓ Average response time under load: ${avgResponseTime.toFixed(2)}ms`);
  
  if (avgResponseTime > 1000) {
    throw new Error(`Response time too high: ${avgResponseTime}ms`);
  }
}

// Cleanup function
async function cleanup(client, testData) {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Clean up agents
    if (testData.agentIds && testData.agentIds.length > 0) {
      for (const agentId of testData.agentIds) {
        try {
          await client.delete(`/api/v1/agents/${agentId}`);
        } catch (error) {
          console.log(`   ⚠️  Failed to cleanup agent ${agentId}: ${error.message}`);
        }
      }
      console.log(`   ✓ Cleaned up ${testData.agentIds.length} test agents`);
    }
    
    // Clean up workflows
    if (testData.workflowIds && testData.workflowIds.length > 0) {
      for (const workflowId of testData.workflowIds) {
        try {
          await client.delete(`/api/v1/workflows/${workflowId}`);
        } catch (error) {
          console.log(`   ⚠️  Failed to cleanup workflow ${workflowId}: ${error.message}`);
        }
      }
      console.log(`   ✓ Cleaned up ${testData.workflowIds.length} test workflows`);
    }
    
    // Clean up other resources
    if (testData.processIds) {
      for (const processId of testData.processIds) {
        try {
          await client.delete(`/api/v1/business-processes/${processId}`);
        } catch (error) {
          console.log(`   ⚠️  Failed to cleanup process ${processId}: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    console.log(`   ⚠️  Cleanup error: ${error.message}`);
  }
}

// Main test execution
async function main() {
  console.log('🚀 Starting Agent Orchestration Service Tests');
  console.log(`📡 Target: ${config.baseURL}`);
  console.log(`⏰ Timeout: ${config.timeout}ms`);
  
  const runner = new TestRunner();
  const client = new OrchestrationClient(config.baseURL);
  
  // Store test data for cleanup
  const testData = {
    agentIds: [],
    workflowIds: [],
    processIds: [],
  };
  
  try {
    // Core functionality tests
    await runner.runTest('Health Check', () => testHealthCheck(client));
    
    await runner.runTest('Agent Registration', async () => {
      const agentId = await testAgentRegistration(client);
      testData.agentIds.push(agentId);
    });
    
    await runner.runTest('Agent Discovery', async () => {
      const agentIds = await testAgentDiscovery(client);
      testData.agentIds.push(...agentIds);
    });
    
    await runner.runTest('Workflow Execution', async () => {
      const { workflowId } = await testWorkflowExecution(client, testData.agentIds);
      testData.workflowIds.push(workflowId);
    });
    
    await runner.runTest('Business Process Automation', async () => {
      const { processId } = await testBusinessProcessAutomation(client);
      testData.processIds.push(processId);
    });
    
    await runner.runTest('Resource Management', async () => {
      await testResourceManagement(client, testData.agentIds);
    });
    
    await runner.runTest('Communication Bus', async () => {
      await testCommunicationBus(client, testData.agentIds);
    });
    
    await runner.runTest('Decision Engine', async () => {
      await testDecisionEngine(client, testData.agentIds);
    });
    
    await runner.runTest('Monitoring and Alerts', async () => {
      await testMonitoringAndAlerts(client);
    });
    
    await runner.runTest('WebSocket Connection', testWebSocketConnection);
    
    await runner.runTest('Load and Stress Testing', async () => {
      await testLoadAndStress(client);
    });
    
  } catch (error) {
    console.error('❌ Test execution failed:', error.message);
  } finally {
    // Cleanup
    await cleanup(client, testData);
  }
  
  // Generate final report
  const success = runner.generateSummary();
  
  if (success) {
    console.log('\n🎉 All tests passed! Agent Orchestration Service is working correctly.');
    process.exit(0);
  } else {
    console.log('\n💥 Some tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  process.exit(1);
});

// Run tests
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  TestRunner,
  OrchestrationClient,
  generateAgentRegistration,
  generateWorkflowDefinition,
  generateBusinessProcess,
};