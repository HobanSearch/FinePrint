# Fine Print AI - Comprehensive Test Suite Documentation

This document provides complete documentation for the Fine Print AI backend testing infrastructure, including setup, execution, and best practices.

## 📋 Table of Contents

- [Overview](#overview)
- [Test Architecture](#test-architecture)
- [Test Types](#test-types)
- [Setup and Configuration](#setup-and-configuration)
- [Running Tests](#running-tests)
- [Test Coverage](#test-coverage)
- [Performance Testing](#performance-testing)
- [Security Testing](#security-testing)
- [AI/LLM Testing](#aillm-testing)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## 🎯 Overview

The Fine Print AI test suite provides comprehensive testing coverage across all backend services, ensuring reliability, performance, and security. The testing infrastructure includes:

- **90%+ Code Coverage** across all services
- **Multi-layer Testing** (Unit, Integration, E2E)
- **Security Testing** (SAST, DAST, Vulnerability Scanning)
- **Performance Testing** (Load, Stress, Spike, Volume)
- **AI/LLM Validation** (Accuracy, Quality, Performance)
- **Contract Testing** (API Contract Validation)
- **Chaos Engineering** (Resilience Testing)
- **Automated CI/CD Pipeline** (GitHub Actions)

## 🏗️ Test Architecture

```mermaid
graph TB
    A[Test Suite] --> B[Unit Tests]
    A --> C[Integration Tests]
    A --> D[Security Tests]
    A --> E[Performance Tests]
    A --> F[AI/LLM Tests]
    A --> G[Contract Tests]
    A --> H[Chaos Tests]
    
    B --> B1[Service Tests]
    B --> B2[Utility Tests]
    B --> B3[Mock Tests]
    
    C --> C1[Service Communication]
    C --> C2[Database Integration]
    C --> C3[External APIs]
    
    D --> D1[Static Analysis]
    D --> D2[Dynamic Analysis]
    D --> D3[Vulnerability Scanning]
    
    E --> E1[Load Testing]
    E --> E2[Stress Testing]
    E --> E3[Performance Regression]
    
    F --> F1[Analysis Accuracy]
    F --> F2[Model Performance]
    F --> F3[Quality Metrics]
```

## 🧪 Test Types

### Unit Tests
- **Location**: `__tests__/unit/`
- **Framework**: Jest with TypeScript
- **Coverage**: 90%+ requirement
- **Purpose**: Test individual functions and classes in isolation

```bash
# Run all unit tests
npm run test:unit

# Run unit tests for specific service
npm run test:unit -- --testPathPattern=analysis

# Run with coverage
npm run test:unit -- --coverage
```

### Integration Tests
- **Location**: `__tests__/integration/`
- **Framework**: Jest + Supertest
- **Purpose**: Test service-to-service communication and data flow

```bash
# Run integration tests
npm run test:integration

# Run with specific services
npm run test:integration -- --testNamePattern="Analysis Service"
```

### Security Tests
- **Location**: `__tests__/security/`
- **Tools**: Jest, Snyk, SonarCloud, Custom scanners
- **Purpose**: Validate security measures and detect vulnerabilities

```bash
# Run security tests
npm run test:security

# Run SAST scan
npm run security:sast

# Run dependency vulnerability scan
npm run security:deps
```

### Performance Tests
- **Location**: `__tests__/performance/`
- **Tool**: k6
- **Purpose**: Validate performance under load

```bash
# Run load tests
npm run test:load

# Run stress tests
npm run test:stress

# Run spike tests
npm run test:spike
```

### AI/LLM Tests
- **Location**: `__tests__/ai/`
- **Purpose**: Validate AI analysis accuracy and quality

```bash
# Run AI validation tests
npm run test:ai-validation

# Generate AI quality report
npm run test:ai-quality-report
```

## ⚙️ Setup and Configuration

### Prerequisites
- Node.js 20.x or higher
- Docker and Docker Compose
- k6 (for performance testing)
- Python 3.11+ (for analysis scripts)

### Environment Setup

1. **Install Dependencies**
```bash
cd backend
npm install
```

2. **Setup Test Environment**
```bash
# Copy test environment template
cp .env.test.example .env.test

# Setup test database
docker-compose -f docker-compose.test.yml up -d

# Run database migrations
npm run db:migrate:test

# Seed test data
npm run db:seed:test
```

3. **Configure Test Services**
```bash
# Start Ollama for AI testing
docker run -d -p 11434:11434 ollama/ollama

# Pull required models
ollama pull phi:2.7b
ollama pull mistral:7b
```

### Configuration Files

#### Jest Configuration (`jest.config.enhanced.js`)
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/__tests__/unit/**/*.test.ts'],
      maxWorkers: '50%'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/__tests__/integration/**/*.test.ts'],
      maxWorkers: 1,
      testTimeout: 60000
    }
  ],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  }
};
```

#### Test Environment Variables
```bash
# Database
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/fineprintai_test
TEST_REDIS_URL=redis://localhost:6379/1

# API Configuration
TEST_API_URL=http://localhost:3001
TEST_JWT_SECRET=test-jwt-secret-key

# AI/LLM Configuration
TEST_OLLAMA_URL=http://localhost:11434
TEST_MODEL=phi:2.7b

# Performance Thresholds
API_RESPONSE_THRESHOLD=500
ANALYSIS_PROCESSING_THRESHOLD=10000
```

## 🚀 Running Tests

### Local Development

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:security
npm run test:performance

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for specific service
npm test -- --testPathPattern=analysis
```

### Docker Environment

```bash
# Run tests in Docker
docker-compose -f docker-compose.test.yml run --rm test

# Run specific test type
docker-compose -f docker-compose.test.yml run --rm test npm run test:unit
```

### CI/CD Pipeline

The GitHub Actions pipeline automatically runs tests on:
- Push to main/develop branches
- Pull requests
- Scheduled nightly runs
- Manual workflow dispatch

```yaml
# Trigger manual test run
gh workflow run "Test Pipeline" \
  --field test_type=all \
  --field environment=staging
```

## 📊 Test Coverage

### Coverage Requirements
- **Global**: 90% minimum
- **Critical Services**: 95% minimum
- **Security Components**: 98% minimum

### Coverage Reports
- **HTML Report**: `coverage/lcov-report/index.html`
- **JSON Report**: `coverage/coverage-final.json`
- **LCOV Report**: `coverage/lcov.info`

### Viewing Coverage
```bash
# Generate and open coverage report
npm run test:coverage
open coverage/lcov-report/index.html
```

## ⚡ Performance Testing

### k6 Test Scenarios

#### Load Testing
Tests normal expected load:
```bash
k6 run __tests__/performance/comprehensive-load-test.js \
  --env TEST_TYPE=load \
  --env BASE_URL=http://localhost:3001
```

#### Stress Testing
Tests system limits:
```bash
k6 run __tests__/performance/comprehensive-load-test.js \
  --env TEST_TYPE=stress \
  --env BASE_URL=http://localhost:3001
```

#### Spike Testing
Tests sudden traffic spikes:
```bash
k6 run __tests__/performance/comprehensive-load-test.js \
  --env TEST_TYPE=spike \
  --env BASE_URL=http://localhost:3001
```

### Performance Thresholds
- **API Response Time**: p95 < 500ms
- **Document Analysis**: p95 < 10s
- **Error Rate**: < 5%
- **Throughput**: > 100 RPS

### Performance Monitoring
```javascript
// Custom metrics tracked
const documentUploadTime = new Trend('document_upload_duration');
const analysisProcessingTime = new Trend('analysis_processing_duration');
const apiResponseTime = new Trend('api_response_time');
const errorCounter = new Counter('errors_total');
```

## 🔒 Security Testing

### Static Application Security Testing (SAST)
- **Tool**: SonarCloud
- **Scans**: Code vulnerabilities, security hotspots
- **Threshold**: 80+ security score

```bash
# Run SAST scan
npm run security:sast
```

### Dynamic Application Security Testing (DAST)
- **Tools**: Custom security tests, OWASP ZAP
- **Tests**: Runtime vulnerabilities, injection attacks
- **Coverage**: All API endpoints

```bash
# Run DAST scan
npm run security:dast
```

### Dependency Scanning
- **Tools**: npm audit, Snyk, GitHub Dependabot
- **Purpose**: Identify vulnerable dependencies

```bash
# Check dependencies
npm audit --audit-level high
snyk test --severity-threshold=high
```

### Security Test Categories
1. **Authentication & Authorization**
2. **Input Validation & Injection Prevention**
3. **Security Headers**
4. **Rate Limiting**
5. **Data Protection**
6. **API Security**

## 🤖 AI/LLM Testing

### Test Categories

#### Analysis Accuracy
- **Minimum Accuracy**: 80% for ToS, 75% for Privacy Policies
- **Metrics**: Precision, Recall, F1-Score
- **Test Documents**: Known problematic clauses

#### Model Performance
- **Response Time**: < 10s for standard documents
- **Throughput**: Concurrent analysis support
- **Resource Usage**: Memory and CPU monitoring

#### Quality Validation
- **Finding Structure**: Proper categorization and severity
- **Confidence Scores**: Reasonable confidence ranges
- **Recommendations**: Actionable suggestions
- **Legal References**: Relevant citations

### Running AI Tests
```bash
# Full AI validation suite
npm run test:ai-validation

# Model comparison tests
npm run test:ai-models

# Quality metrics generation
npm run test:ai-quality-report
```

### AI Test Configuration
```typescript
const expectedFindings = {
  termsOfService: [
    {
      category: 'data-usage',
      severity: 'critical',
      keywords: ['personal data', 'any purpose', 'third parties']
    }
  ]
};
```

## 🔄 CI/CD Integration

### GitHub Actions Pipeline

The automated pipeline includes:

1. **Pre-flight Checks**
   - Code change detection
   - Environment validation

2. **Parallel Test Execution**
   - Unit tests (multiple Node.js versions)
   - Integration tests (with services)
   - Security scans
   - AI validation

3. **Performance Testing**
   - Load, stress, and spike tests
   - Performance regression detection

4. **Quality Gate**
   - Coverage thresholds
   - Security score requirements
   - Performance benchmarks

5. **Reporting**
   - Comprehensive test reports
   - Coverage analysis
   - Performance metrics

### Pipeline Triggers
- **Push**: main, develop, feature branches
- **Pull Request**: Against main/develop
- **Schedule**: Nightly full test suite
- **Manual**: On-demand with parameters

### Quality Gates
```yaml
gates:
  coverage: 90%
  security_score: 80/100
  ai_accuracy: 75%
  performance_p95: 500ms
```

## 🔧 Troubleshooting

### Common Issues

#### Test Database Connection
```bash
# Reset test database
docker-compose -f docker-compose.test.yml down -v
docker-compose -f docker-compose.test.yml up -d postgres
npm run db:migrate:test
```

#### Ollama Service Issues
```bash
# Restart Ollama
docker restart ollama-container

# Check model availability
curl http://localhost:11434/api/tags
```

#### Memory Issues in CI
```bash
# Reduce Jest workers
npm test -- --maxWorkers=2

# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

#### Performance Test Failures
```bash
# Check service health
curl http://localhost:3001/api/health

# Verify k6 installation
k6 version

# Run with lower load
k6 run test.js --vus 5 --duration 30s
```

### Debug Commands

```bash
# Run tests with debug output
DEBUG=* npm test

# Jest debug mode
node --inspect-brk node_modules/.bin/jest --runInBand

# View test logs
npm test -- --verbose

# Run single test file
npm test -- __tests__/unit/services/analysis.service.test.ts
```

## 📝 Best Practices

### Test Writing Guidelines

1. **Test Structure**
   ```typescript
   describe('Service Name', () => {
     beforeEach(() => {
       // Setup
     });
     
     describe('method name', () => {
       test('should handle success case', () => {
         // Test implementation
       });
       
       test('should handle error case', () => {
         // Error testing
       });
     });
   });
   ```

2. **Mock Usage**
   ```typescript
   import { mockAnalysisService } from '@test/mocks';
   
   beforeEach(() => {
     resetAllMocks();
   });
   ```

3. **Assertion Patterns**
   ```typescript
   // Use custom matchers
   expect(response.body).toHaveValidAnalysisStructure();
   expect(duration).toBeWithinPerformanceThreshold(500);
   expect(headers).toHaveValidSecurityHeaders();
   ```

### Performance Testing Best Practices

1. **Start Small**: Begin with smoke tests, then scale up
2. **Monitor Resources**: Track CPU, memory, database connections
3. **Realistic Data**: Use production-like test data volumes
4. **Environment Consistency**: Same infrastructure as production
5. **Baseline Metrics**: Establish performance baselines

### Security Testing Best Practices

1. **Defense in Depth**: Test multiple security layers
2. **Attack Simulation**: Use realistic attack vectors
3. **Regular Updates**: Keep security tools current
4. **False Positive Management**: Review and classify findings
5. **Compliance Mapping**: Map tests to security requirements

### AI Testing Best Practices

1. **Diverse Test Cases**: Cover various document types and complexities
2. **Ground Truth**: Maintain validated expected results
3. **Model Versioning**: Test across different model versions
4. **Quality Metrics**: Track accuracy trends over time
5. **Edge Cases**: Test with malformed and edge case inputs

### CI/CD Best Practices

1. **Fast Feedback**: Prioritize quick-running tests
2. **Parallel Execution**: Run independent tests concurrently
3. **Fail Fast**: Stop on critical failures
4. **Comprehensive Reporting**: Provide detailed test results
5. **Environment Parity**: Match production environment closely

## 📚 Additional Resources

### Documentation
- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [k6 Documentation](https://k6.io/docs/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [SonarCloud Documentation](https://sonarcloud.io/documentation/)

### Tools and Libraries
- **Testing**: Jest, Supertest, k6, Pact
- **Mocking**: Jest mocks, MSW, Nock
- **Security**: Snyk, SonarCloud, OWASP ZAP
- **Reporting**: Jest HTML Reporter, k6 HTML Reporter

### Internal Links
- [API Documentation](../docs/api.md)
- [Architecture Overview](../docs/architecture.md)
- [Security Guidelines](../docs/security.md)
- [Performance Requirements](../docs/performance.md)

---

## 🎯 Quick Reference

### Test Commands
```bash
# Essential commands
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests
npm run test:security      # Security tests
npm run test:performance   # Performance tests
npm run test:coverage      # Coverage report

# Development commands
npm run test:watch         # Watch mode
npm run test:debug         # Debug mode
npm run test:lint          # Lint tests
npm run test:clean         # Clean test artifacts
```

### Environment Variables
```bash
NODE_ENV=test
CI=true
TEST_DATABASE_URL=postgresql://test:test@localhost:5432/fineprintai_test
TEST_REDIS_URL=redis://localhost:6379/1
TEST_OLLAMA_URL=http://localhost:11434
```

### Coverage Thresholds
- Global: 90%
- Critical Services: 95%
- Security: 98%

### Performance Targets
- API Response: p95 < 500ms
- Analysis Processing: p95 < 10s
- Error Rate: < 5%

This comprehensive test suite ensures Fine Print AI maintains the highest standards of quality, security, and performance across all backend services.