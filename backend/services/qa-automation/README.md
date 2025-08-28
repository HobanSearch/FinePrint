# QA Automation Framework

Comprehensive testing framework for Fine Print AI's platform, ensuring quality across all components including model management, A/B testing, and continuous learning pipeline.

## Overview

This QA automation framework provides:
- **90%+ test coverage** across all services
- **<5 minute feedback loop** for unit tests
- **Parallel test execution** for optimal performance
- **Comprehensive test types**: Unit, Integration, E2E, Performance, Security, Model, Contract, Chaos
- **Multi-format reporting**: JSON, HTML, JUnit, TAP, Markdown
- **CI/CD integration** with GitHub Actions
- **Real-time metrics collection** and monitoring

## Architecture

```
qa-automation/
├── src/
│   ├── core/                 # Core testing infrastructure
│   │   ├── test-orchestrator.ts
│   │   ├── test-runner.ts
│   │   ├── test-reporter.ts
│   │   ├── test-validator.ts
│   │   ├── metrics-collector.ts
│   │   └── types.ts
│   ├── frameworks/           # Specialized testing frameworks
│   │   ├── model-testing.ts
│   │   ├── performance-testing.ts
│   │   ├── security-testing.ts
│   │   ├── contract-testing.ts
│   │   └── chaos-testing.ts
│   ├── runners/              # Test execution runners
│   ├── reporters/            # Custom report generators
│   ├── validators/           # Data and response validators
│   └── generators/           # Test data generators
├── tests/
│   ├── unit/                # Unit tests
│   ├── integration/         # Integration tests
│   ├── e2e/                 # End-to-end tests
│   ├── performance/         # Performance tests
│   ├── security/            # Security tests
│   ├── contract/            # Contract tests
│   └── chaos/               # Chaos engineering tests
├── scripts/
│   ├── performance/         # K6 load test scripts
│   ├── security/            # Security scan scripts
│   └── setup/               # Environment setup scripts
├── fixtures/                # Test data fixtures
├── config/                  # Test configurations
└── reports/                 # Generated test reports
```

## Installation

```bash
# Install dependencies
pnpm install

# Install Playwright browsers
pnpm exec playwright install

# Setup test databases
pnpm run db:setup:test

# Install K6 for performance testing
curl https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz -L | tar xvz
```

## Configuration

### Environment Variables

```bash
# Test Environment
TEST_ENV=local|ci|staging|production
NODE_ENV=test

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/fineprint_test
REDIS_URL=redis://localhost:6379

# Services
MODEL_MANAGEMENT_URL=http://localhost:4001
AB_TESTING_URL=http://localhost:4002
LEARNING_PIPELINE_URL=http://localhost:4003

# Model Testing
ENABLE_MODEL_TESTING=true
MODEL_ENDPOINT=http://localhost:11434
MODEL_ID=phi-2
MODEL_API_KEY=your-api-key

# Reporting
REPORT_FORMAT=json,html,junit
COVERAGE_THRESHOLD=90

# CI/CD
CI=true
BUILD_ID=123
COMMIT_SHA=abc123
BRANCH=main
```

## Usage

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test suite
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:performance
pnpm test:security
pnpm test:models

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run specific test file
pnpm test tests/unit/model-management.test.ts

# Run tests matching pattern
pnpm test --grep "should validate model accuracy"
```

### Performance Testing

```bash
# Run load test
k6 run scripts/performance/load-test.js

# Run stress test
k6 run --scenario=stress scripts/performance/load-test.js

# Run spike test
k6 run --scenario=spike scripts/performance/load-test.js

# Run soak test (2 hours)
k6 run --scenario=soak scripts/performance/load-test.js

# Run with custom parameters
k6 run -u 100 -d 10m scripts/performance/load-test.js
```

### Security Testing

```bash
# Run security scan
pnpm run security:scan

# Run dependency check
pnpm run security:deps

# Run OWASP ZAP scan
pnpm run security:zap

# Run penetration tests
pnpm run security:pentest
```

### Model Testing

```bash
# Run model validation tests
pnpm run test:models

# Run adversarial tests
pnpm run test:adversarial

# Run regression tests
pnpm run test:regression

# Run benchmark tests
pnpm run test:benchmark
```

## Test Types

### Unit Tests
- **Coverage**: >90% code coverage requirement
- **Isolation**: Complete mocking of external dependencies
- **Speed**: <5 seconds per test suite
- **Tools**: Vitest, React Testing Library

### Integration Tests
- **Scope**: Service interactions, API contracts, database operations
- **Environment**: Docker-based test environment
- **Validation**: Schema validation, data integrity
- **Tools**: Vitest, Supertest, Prisma

### E2E Tests
- **Browsers**: Chrome, Firefox, Safari, Edge
- **Devices**: Desktop, mobile viewports
- **Scenarios**: Complete user workflows
- **Tools**: Playwright, Axe (accessibility)

### Performance Tests
- **Load Testing**: 1000+ concurrent users
- **Stress Testing**: Find breaking points
- **Spike Testing**: Sudden traffic increases
- **Soak Testing**: Extended duration tests
- **Tools**: K6, Artillery, Autocannon

### Security Tests
- **Vulnerability Scanning**: OWASP Top 10
- **Dependency Checking**: Known CVEs
- **Penetration Testing**: Attack simulations
- **Compliance**: GDPR, CCPA validation
- **Tools**: Snyk, OWASP ZAP, Dependency Check

### Model Tests
- **Accuracy Validation**: Baseline comparisons
- **Latency Testing**: Response time validation
- **Adversarial Testing**: Robustness checks
- **Bias Detection**: Fairness validation
- **Drift Detection**: Model performance monitoring

## Metrics & Reporting

### Collected Metrics
- Test execution time
- Pass/fail rates
- Code coverage
- Performance metrics (latency, throughput)
- Resource utilization (CPU, memory)
- Error rates and types
- Model accuracy scores

### Report Formats
- **JSON**: Machine-readable results
- **HTML**: Interactive web reports
- **JUnit**: CI/CD integration
- **TAP**: Test Anything Protocol
- **Markdown**: Documentation-friendly
- **Slack**: Real-time notifications
- **Grafana**: Metrics dashboards

### Example Reports

```bash
# Generate HTML report
pnpm run report:html

# Generate consolidated report
pnpm run report:consolidate

# View coverage report
open coverage/index.html

# Export metrics to Grafana
pnpm run metrics:export
```

## CI/CD Integration

### GitHub Actions

The framework includes comprehensive GitHub Actions workflows:

```yaml
# Manual trigger
workflow_dispatch:
  inputs:
    test_suite: [all, unit, integration, e2e, performance, security, model]
    environment: [local, staging, production]

# Automatic triggers
- Push to main/develop
- Pull requests
- Nightly regression tests
- Release deployments
```

### Quality Gates

- Code coverage >90%
- Test pass rate >95%
- P95 latency <500ms
- Zero critical vulnerabilities
- No high-severity bugs

## Best Practices

### Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Keep tests independent and idempotent

### Data Management
- Use factories for test data generation
- Implement proper cleanup in afterEach/afterAll
- Use database transactions for isolation
- Maintain test data versioning

### Performance Optimization
- Run tests in parallel when possible
- Use test.concurrent for independent tests
- Implement smart test selection
- Cache dependencies and build artifacts

### Debugging

```bash
# Run tests with debugging
pnpm test:debug

# Run specific test with verbose output
pnpm test --verbose tests/unit/specific.test.ts

# Generate detailed logs
LOG_LEVEL=debug pnpm test

# Use Playwright inspector
pnpm test:e2e --debug
```

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   ```bash
   # Increase timeout for specific test
   test('long running test', { timeout: 60000 }, async () => {
     // test code
   });
   ```

2. **Flaky Tests**
   ```bash
   # Mark test as flaky
   test.flaky('potentially flaky test', async () => {
     // test code
   });
   ```

3. **Database Connection Issues**
   ```bash
   # Reset test database
   pnpm run db:reset:test
   ```

4. **Port Conflicts**
   ```bash
   # Kill processes on test ports
   lsof -ti:3000,4000,5432,6379 | xargs kill -9
   ```

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow naming convention: `*.test.ts` or `*.spec.ts`
3. Include proper test metadata
4. Update test documentation

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Feature Name', () => {
  beforeEach(async () => {
    // Setup
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should perform expected behavior', async () => {
    // Arrange
    const input = prepareTestData();
    
    // Act
    const result = await performAction(input);
    
    // Assert
    expect(result).toMatchExpectation();
  });
});
```

## Support

For issues or questions:
- Check [documentation](./docs/)
- Review [examples](./examples/)
- Contact QA team: qa@fineprintai.com

## License

MIT License - See LICENSE file for details