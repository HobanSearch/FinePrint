/**
 * Performance Benchmarks and Load Tests
 * Tests system performance under various load conditions
 */

import { check } from 'k6';
import { Options } from 'k6/options';
import http from 'k6/http';
import { Rate, Trend } from 'k6/metrics';
import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// Custom metrics
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');
const promptOptimizationTime = new Trend('prompt_optimization_time');
const loraInferenceTime = new Trend('lora_inference_time');
const graphQueryTime = new Trend('graph_query_time');
const workflowCompletionTime = new Trend('workflow_completion_time');

// Test configuration
export const options: Options = {
  scenarios: {
    // Smoke test - minimal load
    smoke: {
      executor: 'constant-vus',
      vus: 2,
      duration: '2m',
      tags: { test_type: 'smoke' },
      exec: 'runAllTests',
    },
    // Load test - normal expected load
    load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 50 },   // Ramp up
        { duration: '10m', target: 50 },  // Stay at peak
        { duration: '5m', target: 0 },    // Ramp down
      ],
      tags: { test_type: 'load' },
      exec: 'runAllTests',
    },
    // Stress test - beyond normal load
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },
        { duration: '5m', target: 100 },
        { duration: '2m', target: 200 },
        { duration: '5m', target: 200 },
        { duration: '2m', target: 300 },
        { duration: '5m', target: 300 },
        { duration: '10m', target: 0 },
      ],
      tags: { test_type: 'stress' },
      exec: 'runAllTests',
    },
    // Spike test - sudden load increase
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '30s', target: 200 },  // Spike!
        { duration: '3m', target: 200 },   // Stay at spike
        { duration: '30s', target: 5 },    // Scale down
        { duration: '2m', target: 5 },
      ],
      tags: { test_type: 'spike' },
      exec: 'runAllTests',
    },
    // Soak test - extended duration
    soak: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2h',
      tags: { test_type: 'soak' },
      exec: 'runAllTests',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'], // 95% of requests under 5s
    errors: ['rate<0.05'], // Error rate under 5%
    api_latency: ['p(95)<3000'],
    prompt_optimization_time: ['p(95)<30000'], // 30s for optimization
    lora_inference_time: ['p(95)<2000'], // 2s for inference
    graph_query_time: ['p(95)<1000'], // 1s for graph queries
    workflow_completion_time: ['p(95)<60000'], // 1 minute for workflows
  },
};

// Test data
const testData = {
  domains: ['marketing', 'sales', 'support', 'legal'],
  baseModels: ['phi-2', 'mistral-7b', 'llama2-13b', 'mixtral-8x7b'],
  customerIds: Array.from({ length: 1000 }, (_, i) => `cust_${i}`),
  products: ['starter', 'professional', 'enterprise'],
};

// Base URLs for services
const services = {
  config: 'http://localhost:8001',
  memory: 'http://localhost:8002',
  logger: 'http://localhost:8003',
  auth: 'http://localhost:8004',
  dspy: 'http://localhost:8005',
  lora: 'http://localhost:8006',
  knowledgeGraph: 'http://localhost:8007',
  agentCoordination: 'http://localhost:8008',
  memoryPersistence: 'http://localhost:8009',
  externalIntegrations: 'http://localhost:8010',
};

// Main test runner
export function runAllTests() {
  const testFunctions = [
    testConfigService,
    testMemoryService,
    testDSPyOptimization,
    testLoRAInference,
    testKnowledgeGraphQueries,
    testAgentCoordination,
    testExternalIntegrations,
    testCompleteWorkflow,
  ];

  // Run random test
  const test = randomItem(testFunctions);
  test();
}

// Individual service tests
export function testConfigService() {
  const start = Date.now();
  
  // Test configuration get/set
  const configKey = `test.key.${__VU}.${__ITER}`;
  const configValue = `value_${Date.now()}`;
  
  // Set configuration
  const setResponse = http.post(
    `${services.config}/api/config`,
    JSON.stringify({ key: configKey, value: configValue }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(setResponse, {
    'config set status is 200': (r) => r.status === 200,
  });
  
  // Get configuration
  const getResponse = http.get(`${services.config}/api/config/${configKey}`);
  
  check(getResponse, {
    'config get status is 200': (r) => r.status === 200,
    'config value matches': (r) => JSON.parse(r.body as string).value === configValue,
  });
  
  // Test feature flag
  const featureFlag = `feature_${__VU}_${__ITER}`;
  const flagResponse = http.get(`${services.config}/api/features/${featureFlag}`);
  
  check(flagResponse, {
    'feature flag check successful': (r) => r.status === 200,
  });
  
  apiLatency.add(Date.now() - start);
  errorRate.add(setResponse.status !== 200 || getResponse.status !== 200);
}

export function testMemoryService() {
  const start = Date.now();
  const agentId = `agent_${__VU}`;
  
  // Store memory
  const memory = {
    id: `mem_${__VU}_${__ITER}`,
    agentId,
    type: 'SHORT_TERM',
    content: `Test memory content ${Date.now()}`,
    metadata: {
      domain: randomItem(testData.domains),
      importance: Math.random(),
    },
  };
  
  const storeResponse = http.post(
    `${services.memory}/api/memory`,
    JSON.stringify(memory),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(storeResponse, {
    'memory store successful': (r) => r.status === 201,
  });
  
  // Search memories
  const searchResponse = http.get(
    `${services.memory}/api/memory/search?agentId=${agentId}&limit=10`
  );
  
  check(searchResponse, {
    'memory search successful': (r) => r.status === 200,
    'memories returned': (r) => {
      const body = JSON.parse(r.body as string);
      return Array.isArray(body.memories) && body.memories.length > 0;
    },
  });
  
  apiLatency.add(Date.now() - start);
  errorRate.add(storeResponse.status !== 201 || searchResponse.status !== 200);
}

export function testDSPyOptimization() {
  const start = Date.now();
  const domain = randomItem(testData.domains);
  
  const optimizationRequest = {
    taskId: `opt_${__VU}_${__ITER}`,
    domain,
    examples: [
      {
        input: { topic: 'AI features', audience: 'developers' },
        output: 'Discover our powerful AI capabilities...',
        metadata: { engagement: 0.15 + Math.random() * 0.1 },
      },
      {
        input: { topic: 'Security features', audience: 'CTOs' },
        output: 'Enterprise-grade security for your data...',
        metadata: { engagement: 0.18 + Math.random() * 0.1 },
      },
    ],
    initialPrompt: 'Write about {topic} for {audience}',
    optimizationConfig: {
      iterations: 5,
      temperature: 0.7,
    },
  };
  
  const response = http.post(
    `${services.dspy}/api/dspy/optimize`,
    JSON.stringify(optimizationRequest),
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: '60s',
    }
  );
  
  check(response, {
    'DSPy optimization successful': (r) => r.status === 200,
    'optimization improved prompt': (r) => {
      const body = JSON.parse(r.body as string);
      return body.improvement > 0;
    },
  });
  
  const duration = Date.now() - start;
  promptOptimizationTime.add(duration);
  apiLatency.add(duration);
  errorRate.add(response.status !== 200);
}

export function testLoRAInference() {
  const start = Date.now();
  const domain = randomItem(testData.domains);
  
  const inferenceRequest = {
    domain,
    input: generateTestInput(domain),
    config: {
      temperature: 0.7,
      maxTokens: 150,
      topP: 0.9,
    },
  };
  
  const response = http.post(
    `${services.lora}/api/lora/inference`,
    JSON.stringify(inferenceRequest),
    { 
      headers: { 'Content-Type': 'application/json' },
      timeout: '30s',
    }
  );
  
  check(response, {
    'LoRA inference successful': (r) => r.status === 200,
    'output generated': (r) => {
      const body = JSON.parse(r.body as string);
      return body.output && body.output.length > 0;
    },
  });
  
  const duration = Date.now() - start;
  loraInferenceTime.add(duration);
  apiLatency.add(duration);
  errorRate.add(response.status !== 200);
}

export function testKnowledgeGraphQueries() {
  const start = Date.now();
  
  // Create entity
  const entity = {
    type: 'Customer',
    properties: {
      id: `cust_test_${__VU}_${__ITER}`,
      name: `Test Customer ${__VU}`,
      plan: randomItem(testData.products),
      mrr: randomIntBetween(29, 499),
    },
  };
  
  const createResponse = http.post(
    `${services.knowledgeGraph}/api/graph/entities`,
    JSON.stringify(entity),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(createResponse, {
    'entity creation successful': (r) => r.status === 201,
  });
  
  // Query graph
  const query = {
    query: 'MATCH (c:Customer) WHERE c.mrr > $minMrr RETURN c LIMIT 10',
    parameters: { minMrr: 50 },
  };
  
  const queryResponse = http.post(
    `${services.knowledgeGraph}/api/graph/query`,
    JSON.stringify(query),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(queryResponse, {
    'graph query successful': (r) => r.status === 200,
    'results returned': (r) => {
      const body = JSON.parse(r.body as string);
      return body.records && body.records.length > 0;
    },
  });
  
  const duration = Date.now() - start;
  graphQueryTime.add(duration);
  apiLatency.add(duration);
  errorRate.add(createResponse.status !== 201 || queryResponse.status !== 200);
}

export function testAgentCoordination() {
  const start = Date.now();
  
  const coordinationRequest = {
    action: 'assignTask',
    payload: {
      taskType: randomItem(['marketing_content', 'sales_outreach', 'support_ticket']),
      priority: randomItem(['low', 'medium', 'high']),
      context: {
        customerId: randomItem(testData.customerIds),
        domain: randomItem(testData.domains),
      },
    },
  };
  
  const response = http.post(
    `${services.agentCoordination}/api/coordination/tasks`,
    JSON.stringify(coordinationRequest),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(response, {
    'task assignment successful': (r) => r.status === 200,
    'agent assigned': (r) => {
      const body = JSON.parse(r.body as string);
      return body.assignedAgent && body.taskId;
    },
  });
  
  apiLatency.add(Date.now() - start);
  errorRate.add(response.status !== 200);
}

export function testExternalIntegrations() {
  const start = Date.now();
  
  // Test email sending (mock)
  const emailRequest = {
    to: { email: `test${__VU}@example.com`, name: `Test User ${__VU}` },
    templateId: 'welcome',
    variables: {
      userName: `User ${__VU}`,
      planName: randomItem(testData.products),
    },
  };
  
  const response = http.post(
    `${services.externalIntegrations}/api/email/send`,
    JSON.stringify(emailRequest),
    { headers: { 'Content-Type': 'application/json' } }
  );
  
  check(response, {
    'email send successful': (r) => r.status === 200,
    'email ID returned': (r) => {
      const body = JSON.parse(r.body as string);
      return body.emailId;
    },
  });
  
  apiLatency.add(Date.now() - start);
  errorRate.add(response.status !== 200);
}

export function testCompleteWorkflow() {
  const start = Date.now();
  const workflowId = `workflow_${__VU}_${__ITER}`;
  
  // Simulate a complete marketing campaign workflow
  const steps = [
    // Step 1: Create campaign
    () => {
      return http.post(
        `${services.knowledgeGraph}/api/graph/entities`,
        JSON.stringify({
          type: 'MarketingCampaign',
          properties: {
            id: workflowId,
            name: `Load Test Campaign ${__VU}`,
            budget: 1000,
          },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
    // Step 2: Optimize content
    () => {
      return http.post(
        `${services.dspy}/api/dspy/optimize`,
        JSON.stringify({
          taskId: `${workflowId}_content`,
          domain: 'marketing',
          examples: [
            {
              input: { product: 'AI Platform' },
              output: 'Transform your business with AI',
              metadata: { engagement: 0.2 },
            },
          ],
          initialPrompt: 'Write about {product}',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
    // Step 3: Generate content
    () => {
      return http.post(
        `${services.lora}/api/lora/inference`,
        JSON.stringify({
          domain: 'marketing',
          input: 'Generate campaign content for AI Platform',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
    // Step 4: Store execution
    () => {
      return http.post(
        `${services.memoryPersistence}/api/memory/store`,
        JSON.stringify({
          type: 'campaign_execution',
          agentId: 'marketing_agent',
          content: { campaignId: workflowId },
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    },
  ];
  
  let allSuccessful = true;
  
  for (const step of steps) {
    const response = step();
    if (response.status !== 200 && response.status !== 201) {
      allSuccessful = false;
      break;
    }
  }
  
  check({ allSuccessful }, {
    'complete workflow successful': (data) => data.allSuccessful,
  });
  
  const duration = Date.now() - start;
  workflowCompletionTime.add(duration);
  errorRate.add(!allSuccessful);
}

// Helper functions
function generateTestInput(domain: string): string {
  const inputs: Record<string, string[]> = {
    marketing: [
      'Write a compelling email subject line',
      'Create social media content for product launch',
      'Generate blog post about AI benefits',
    ],
    sales: [
      'Respond to pricing objection',
      'Follow up on demo request',
      'Create proposal for enterprise client',
    ],
    support: [
      'Help customer with login issue',
      'Explain feature functionality',
      'Troubleshoot integration problem',
    ],
    legal: [
      'Analyze terms of service',
      'Review privacy policy',
      'Check compliance requirements',
    ],
  };
  
  return randomItem(inputs[domain] || inputs.marketing);
}

// Lifecycle hooks
export function setup() {
  // Verify all services are healthy
  for (const [name, url] of Object.entries(services)) {
    const response = http.get(`${url}/health`);
    if (response.status !== 200) {
      throw new Error(`Service ${name} is not healthy`);
    }
  }
  
  // Create test data
  return { startTime: Date.now() };
}

export function teardown(data: any) {
  // Calculate total test duration
  const duration = Date.now() - data.startTime;
  console.log(`Total test duration: ${duration}ms`);
}

// Custom scenarios for specific tests
export function marketingCampaignLoadTest() {
  // Focused test on marketing campaign creation
  const campaignData = {
    name: `Campaign ${__VU}_${__ITER}`,
    targetAudience: randomItem(['B2B', 'B2C', 'Enterprise']),
    budget: randomIntBetween(1000, 10000),
    channels: ['email', 'social', 'content'],
  };
  
  const responses = [];
  
  // Create campaign
  responses.push(http.post(
    `${services.knowledgeGraph}/api/graph/entities`,
    JSON.stringify({
      type: 'MarketingCampaign',
      properties: campaignData,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  ));
  
  // Generate content for each channel
  for (const channel of campaignData.channels) {
    responses.push(http.post(
      `${services.lora}/api/lora/inference`,
      JSON.stringify({
        domain: 'marketing',
        input: `Create ${channel} content for ${campaignData.name}`,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    ));
  }
  
  const allSuccessful = responses.every(r => 
    r.status === 200 || r.status === 201
  );
  
  check({ allSuccessful }, {
    'marketing campaign creation successful': (data) => data.allSuccessful,
  });
}

export function concurrentUserSimulation() {
  // Simulate realistic user behavior
  const userActions = [
    () => testConfigService(),
    () => testMemoryService(),
    () => testDSPyOptimization(),
    () => testLoRAInference(),
    () => testKnowledgeGraphQueries(),
    () => testAgentCoordination(),
    () => testExternalIntegrations(),
  ];
  
  // Simulate think time between actions
  const thinkTime = randomIntBetween(1000, 5000);
  
  // Execute random action
  const action = randomItem(userActions);
  action();
  
  // Think time
  if (thinkTime > 0) {
    http.get(`https://httpbin.test.k6.io/delay/${Math.floor(thinkTime / 1000)}`);
  }
}