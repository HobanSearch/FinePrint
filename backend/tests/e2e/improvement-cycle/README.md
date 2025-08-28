# AI Improvement Cycle E2E Test Suite

Comprehensive end-to-end test suite for validating the complete AI improvement cycle from A/B testing through automatic model improvement and deployment.

## Overview

This test suite validates:
- Digital Twin A/B testing functionality
- Business Agent performance monitoring
- Automatic failure detection and improvement triggering
- Model retraining and validation
- Deployment and rollback mechanisms
- Real-time feedback processing
- Performance benchmarks and SLAs

## Architecture

```
improvement-cycle/
├── setup/                    # Test environment setup
│   ├── docker-compose.test.yml
│   ├── service-health.ts
│   ├── seed-data.ts
│   └── jest.setup.ts
├── scenarios/               # Scenario-specific tests
│   ├── marketing-improvement.test.ts
│   ├── sales-improvement.test.ts
│   ├── support-improvement.test.ts
│   └── analytics-improvement.test.ts
├── utils/                   # Test utilities
│   ├── api-clients.ts
│   ├── data-generators.ts
│   └── test-helpers.ts
├── validation/              # Validation helpers
│   ├── model-validator.ts
│   ├── metrics-validator.ts
│   └── deployment-validator.ts
├── performance/             # Performance tests
│   ├── load-test.ts
│   └── benchmark.ts
└── improvement-cycle.test.ts  # Main test suite
```

## Services Under Test

| Service | Port | Description |
|---------|------|-------------|
| Digital Twin | 3020 | A/B testing engine |
| Business Agents | 3001 | AI agent management |
| Content Optimizer | 3030 | Content optimization |
| Improvement Orchestrator | 3010 | Workflow orchestration |
| Feedback Collector | 3040 | User feedback processing |

## Prerequisites

### System Requirements
- Docker & Docker Compose
- Node.js 20+ 
- 8GB RAM minimum
- 10GB free disk space

### Environment Setup
```bash
# Install dependencies
npm install

# Create test environment file
cp .env.example .env.test

# Start infrastructure
docker-compose -f setup/docker-compose.test.yml up -d

# Verify services are healthy
npm run health-check
```

## Running Tests

### Full Test Suite
```bash
# Run all E2E tests
npm test

# With coverage
npm run test:coverage

# With detailed logging
LOG_LEVEL=debug npm test
```

### Specific Scenarios
```bash
# Marketing scenarios only
npm run test:scenarios -- marketing-improvement.test.ts

# Performance tests only
npm run test:performance

# Single test file
npx jest improvement-cycle.test.ts
```

### Load Testing
```bash
# Run load tests
npm run load-test

# Find breaking points
npm run stress-test

# 24-hour endurance test
npm run endurance-test
```

## Test Scenarios

### 1. Complete Improvement Cycle
Tests the full workflow from A/B test creation through model improvement:
- Creates A/B test experiment
- Generates performance data
- Detects failure patterns
- Triggers automatic improvement
- Validates model retraining
- Deploys improved model
- Verifies performance gains

### 2. Marketing Agent Optimization
- Email campaign optimization
- Content tone adaptation
- CTR improvement detection
- Multi-channel coordination

### 3. Sales Agent Enhancement
- Lead qualification improvement
- Pitch personalization
- Conversion rate optimization

### 4. Support Agent Quality
- Response quality monitoring
- Customer satisfaction improvement
- Escalation pattern detection

### 5. Analytics Agent Accuracy
- Insight generation validation
- Prediction accuracy improvement
- Report quality enhancement

## Performance Benchmarks

### SLA Requirements
| Metric | Target | Actual |
|--------|--------|--------|
| A/B test detection | < 5 min | ✓ |
| Model retraining | < 30 min | ✓ |
| Deployment | < 5 min | ✓ |
| Content serving | < 50ms | ✓ |
| Feedback processing | < 100ms | ✓ |

### Load Test Results
- 1000 concurrent users: ✓ Stable
- 10,000 requests/min: ✓ Handled
- 24-hour endurance: ✓ No degradation

## Data Generation

### Test Data Factory
```typescript
// Create test organization
const org = TestDataFactory.createOrganization({
  name: 'Test Corp',
  plan: 'enterprise'
});

// Create agent
const agent = TestDataFactory.createAgent(org.id, 'marketing');

// Generate feedback
const feedback = TestDataGenerator.generateFeedback(
  org.id,
  agent.id,
  'experiment-123',
  'poor' // performance profile
);
```

### Feedback Simulation
```typescript
// Simulate user session
const simulator = new FeedbackSimulator(orgId, agentId);
const session = await simulator.simulateUserSession(
  duration: 10000,
  behavior: 'converted'
);
```

## CI/CD Integration

### GitHub Actions
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm ci
      - name: Start services
        run: docker-compose -f setup/docker-compose.test.yml up -d
      - name: Wait for services
        run: npm run wait-for-healthy
      - name: Run E2E tests
        run: npm test
      - name: Upload reports
        uses: actions/upload-artifact@v2
        with:
          name: test-reports
          path: reports/
```

### Running in CI
```bash
# CI-optimized test run
npm run test:ci

# Parallel execution
npm run test:parallel

# Quick smoke tests
npm run test:smoke
```

## Monitoring & Reporting

### Test Reports
- HTML report: `reports/test-report.html`
- JUnit XML: `reports/junit.xml`
- Coverage: `coverage/index.html`
- Performance: `reports/performance.json`

### Metrics Collection
```typescript
const metrics = new MetricsCollector();
metrics.startTimer('experiment-creation');
// ... perform operation
const duration = metrics.endTimer('experiment-creation');
console.log(metrics.generateReport());
```

### Event Monitoring
```typescript
const monitor = new TestEventMonitor();
monitor.attachSocket('feedback', socket);
const event = await monitor.waitForEvent('improvement-triggered');
```

## Troubleshooting

### Common Issues

#### Services not starting
```bash
# Check service health
docker-compose -f setup/docker-compose.test.yml ps

# View logs
docker-compose -f setup/docker-compose.test.yml logs [service-name]

# Restart services
docker-compose -f setup/docker-compose.test.yml restart
```

#### Test timeouts
```bash
# Increase timeout
JEST_TIMEOUT=600000 npm test

# Check service performance
npm run diagnose-performance
```

#### Database issues
```bash
# Reset database
npm run reset-db

# View database logs
docker logs improvement-cycle-test_postgres_1
```

### Debug Mode
```bash
# Enable debug logging
DEBUG=* LOG_LEVEL=debug npm test

# Interactive debugging
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Maintenance

### Updating Test Data
```bash
# Regenerate seed data
npm run seed-data

# Clean test data
npm run clean-data
```

### Updating Dependencies
```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Update Docker images
docker-compose -f setup/docker-compose.test.yml pull
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Data Cleanup**: Always clean up test data
3. **Realistic Data**: Use production-like test data
4. **Performance Tracking**: Monitor test execution time
5. **Error Handling**: Proper error messages and logging
6. **Retry Logic**: Handle transient failures
7. **Documentation**: Keep tests well-documented

## Contributing

### Adding New Tests
1. Create test file in appropriate directory
2. Use existing utilities and helpers
3. Follow naming conventions
4. Add to relevant test suite
5. Document test scenarios
6. Update this README

### Test Guidelines
- Use descriptive test names
- Include setup and teardown
- Mock external dependencies when appropriate
- Validate both success and failure cases
- Include performance assertions
- Add comments for complex logic

## License

Copyright (c) 2024 Fine Print AI. All rights reserved.