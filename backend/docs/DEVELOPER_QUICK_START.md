# Fine Print AI - Developer Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ 
- Python 3.11+
- Neo4j 5.0+
- Redis 7.0+
- PostgreSQL 16+

### Quick Setup

```bash
# Clone and setup
git clone https://github.com/fineprintai/platform
cd platform
npm install
npm run setup:all

# Start all services
docker-compose up -d
npm run dev:services

# Verify health
npm run health:check
```

## 🏗️ Service Architecture

```
Port  | Service               | Purpose
------|----------------------|----------------------------------
8001  | Config Service       | Dynamic configuration & features
8002  | Memory Service       | Multi-tier agent memory
8003  | Logger Service       | Structured logging
8004  | Auth Service         | Authentication & authorization  
8005  | DSPy Service         | Prompt optimization
8006  | LoRA Service         | Model fine-tuning & inference
8007  | Knowledge Graph      | Neo4j business intelligence
8008  | Agent Coordination   | Multi-agent orchestration
8009  | Memory Persistence   | Long-term memory & analytics
8010  | External Integrations| Stripe, SendGrid, Social Media
```

## 💻 Common Development Tasks

### 1. Creating a New AI Agent

```typescript
// 1. Define agent in agent-coordination service
const marketingAgent = {
  id: 'marketing_specialist_v1',
  domain: 'marketing',
  capabilities: ['content_creation', 'campaign_planning', 'analytics'],
  model: 'mistral-7b',
  loraAdapter: 'marketing_v2.1'
};

// 2. Register with coordinator
await agentCoordinator.registerAgent(marketingAgent);

// 3. Create agent workflow
const workflow = await agentCoordinator.createWorkflow({
  name: 'content_campaign',
  agents: ['marketing_specialist_v1', 'social_media_manager_v1'],
  steps: [
    { agent: 'marketing_specialist_v1', action: 'create_content' },
    { agent: 'social_media_manager_v1', action: 'schedule_posts' }
  ]
});
```

### 2. Optimizing Prompts with DSPy

```typescript
// Define optimization task
const optimization = await dspyService.optimize({
  taskId: 'email_subject_optimizer',
  domain: 'marketing',
  examples: [
    {
      input: { product: 'AI Legal Tool', audience: 'lawyers' },
      output: 'Cut Contract Review Time by 80% with AI',
      metadata: { openRate: 0.32 }
    }
  ],
  initialPrompt: 'Write email subject for {product} targeting {audience}',
  optimizationConfig: {
    metric: 'openRate',
    iterations: 10
  }
});

// Use optimized prompt
const result = await dspyService.generate({
  taskId: 'email_subject_optimizer',
  input: { product: 'New Feature', audience: 'CTOs' }
});
```

### 3. Training LoRA Adapters

```typescript
// Prepare training data
const trainingJob = await loraService.train({
  domain: 'sales',
  baseModel: 'llama2-13b',
  trainingData: salesInteractions.map(interaction => ({
    input: interaction.customerQuery,
    output: interaction.successfulResponse,
    metadata: {
      conversionRate: interaction.converted ? 1 : 0,
      dealSize: interaction.dealValue
    }
  })),
  config: {
    rank: 16,
    epochs: 3,
    learningRate: 2e-4
  }
});

// Monitor training
const status = await loraService.getJobStatus(trainingJob.id);
console.log(`Training progress: ${status.progress}%`);
```

### 4. Knowledge Graph Queries

```cypher
// Find high-value expansion opportunities
MATCH (c:Customer)-[:SUBSCRIBED_TO]->(p:Product)
WHERE c.usage > 0.8 AND p.tier < 'enterprise'
OPTIONAL MATCH (c)-[:HAD_INTERACTION]->(i:Interaction)
WHERE i.type = 'support' AND i.timestamp > datetime() - duration('P30D')
WITH c, p, count(i) as recentSupport
WHERE recentSupport < 2  // Low support burden
RETURN c.name, c.mrr, p.tier, c.mrr * 3 as expansionPotential
ORDER BY expansionPotential DESC
LIMIT 20
```

### 5. Memory Management

```typescript
// Store agent memory
await memoryService.store({
  agentId: 'sales_agent_001',
  type: MemoryType.EPISODIC,
  content: {
    interaction: 'Customer concerned about pricing',
    response: 'Highlighted ROI and offered pilot program',
    outcome: 'Moved to negotiation stage'
  },
  metadata: {
    customerId: 'cust_123',
    dealId: 'deal_456',
    timestamp: new Date(),
    importance: 0.9
  }
});

// Retrieve relevant memories
const memories = await memoryService.search({
  agentId: 'sales_agent_001',
  query: 'pricing objections',
  type: MemoryType.EPISODIC,
  limit: 5
});
```

## 🧪 Testing

### Unit Tests
```bash
# Run all unit tests
npm test

# Test specific service
npm test -- config-service.test.ts

# Watch mode
npm test -- --watch
```

### Integration Tests
```bash
# Run integration tests
npm run test:integration

# Test specific workflow
npm run test:e2e -- marketing-workflow
```

### Load Testing
```bash
# Run load tests with k6
k6 run tests/performance/load-tests.ts

# Stress test
k6 run --env TEST_TYPE=stress tests/performance/load-tests.ts
```

## 🔧 Debugging

### Enable Debug Logging
```typescript
// Set debug level for specific service
process.env.LOG_LEVEL = 'debug';
process.env.DEBUG = 'fineprintai:*';

// Or for specific module
process.env.DEBUG = 'fineprintai:lora:training';
```

### Trace Requests
```typescript
// Add correlation ID to track across services
const correlationId = generateCorrelationId();
const headers = {
  'X-Correlation-ID': correlationId,
  'X-Debug': 'true'
};

// Check logs
docker-compose logs -f | grep $correlationId
```

### Performance Profiling
```bash
# CPU profiling
node --inspect=0.0.0.0:9229 dist/index.js

# Memory profiling
node --heap-prof dist/index.js

# Analyze with Chrome DevTools
chrome://inspect
```

## 📊 Monitoring

### Metrics Endpoints
- Prometheus metrics: `http://localhost:{port}/metrics`
- Health check: `http://localhost:{port}/health`
- Readiness: `http://localhost:{port}/ready`

### Grafana Dashboards
- Business Metrics: http://localhost:3000/d/business
- AI Performance: http://localhost:3000/d/ai-perf
- System Health: http://localhost:3000/d/system

### Key Metrics to Watch
```typescript
// Business metrics
- customer_conversion_rate
- average_deal_size
- support_ticket_resolution_time
- ai_accuracy_by_domain

// Performance metrics
- http_request_duration_seconds
- ai_inference_latency_seconds
- memory_usage_bytes
- active_workflows_count
```

## 🚨 Common Issues

### Issue: LoRA inference timeout
```typescript
// Solution: Increase timeout and check GPU allocation
const inference = await loraService.infer({
  // ... other config
  timeout: 30000, // 30 seconds
  config: {
    maxTokens: 150, // Reduce if needed
    gpuLayers: 35   // Adjust based on GPU memory
  }
});
```

### Issue: Neo4j connection errors
```bash
# Check Neo4j status
docker-compose logs neo4j

# Verify connection
cypher-shell -u neo4j -p password "MATCH (n) RETURN count(n)"

# Increase connection pool
NEO4J_CONNECTION_POOL_SIZE=50
```

### Issue: Memory service OOM
```typescript
// Enable memory tiering
const memoryConfig = {
  hotTierMaxSize: '1GB',
  autoPromoteToWarm: true,
  warmTierTTL: 7 * 24 * 60 * 60, // 7 days
  compressionEnabled: true
};
```

## 🔐 Security Best Practices

1. **API Keys**: Always use service-specific API keys
```typescript
const apiKey = process.env[`${SERVICE_NAME}_API_KEY`];
```

2. **Secrets Management**: Use Kubernetes secrets
```yaml
kubectl create secret generic api-keys \
  --from-literal=stripe-key=$STRIPE_KEY \
  --from-literal=sendgrid-key=$SENDGRID_KEY
```

3. **Rate Limiting**: Configure per-service limits
```typescript
const rateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // requests
  keyGenerator: (req) => req.user?.id || req.ip
});
```

## 📚 Additional Resources

- [Full Documentation](./AUTONOMOUS_AI_SYSTEM_INTEGRATION.md)
- [API Reference](./API_REFERENCE.md)
- [Architecture Decisions](./ARCHITECTURE_DECISIONS.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 💬 Getting Help

- Slack: #fineprintai-dev
- Issues: https://github.com/fineprintai/platform/issues
- Wiki: https://wiki.fineprintai.internal

---

**Pro Tips:**
- Use the test data generators in `/scripts/generate-test-data.ts`
- Enable request recording for debugging with `RECORD_REQUESTS=true`
- Check service dependencies with `npm run deps:check`
- Use the CLI tool for quick operations: `npx fineprintai-cli`