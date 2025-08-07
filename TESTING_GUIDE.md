# Fine Print AI - Comprehensive Testing Guide

This guide provides complete documentation for the comprehensive testing framework implemented for Fine Print AI, designed to ensure 90%+ code coverage, reliability, and quality across all components.

## 📋 Table of Contents

- [Overview](#overview)
- [Testing Architecture](#testing-architecture)
- [Test Types](#test-types)
- [Getting Started](#getting-started)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [CI/CD Integration](#cicd-integration)
- [Coverage Requirements](#coverage-requirements)
- [Troubleshooting](#troubleshooting)

## 🔍 Overview

Our testing framework provides comprehensive coverage across all layers:

- **Unit Tests**: Jest (Backend) + Vitest (Frontend)
- **Integration Tests**: Supertest + Test Database
- **E2E Tests**: Playwright (Cross-browser)
- **Performance Tests**: k6 Load Testing
- **Security Tests**: OWASP ZAP + Trivy
- **AI Validation**: LLM Response Accuracy Testing
- **Visual Regression**: Playwright Screenshots
- **Code Coverage**: 90%+ threshold with quality gates

## 🏗️ Testing Architecture

```
tests/
├── backend/
│   ├── unit/           # Jest unit tests
│   ├── integration/    # API integration tests
│   ├── ai/            # LLM validation tests
│   ├── fixtures/      # Test data fixtures
│   ├── mocks/         # Service mocks
│   └── utils/         # Test utilities
├── frontend/
│   ├── components/    # Component tests
│   ├── hooks/         # Hook tests
│   ├── utils/         # Utility tests
│   └── __mocks__/     # MSW handlers
├── e2e/
│   ├── playwright-tests/  # E2E test suites
│   ├── fixtures/         # E2E test data
│   └── screenshots/      # Visual regression
├── performance/
│   ├── k6-tests/        # Load test scripts
│   └── results/         # Performance reports
└── security/
    ├── zap-tests/       # Security test configs
    └── reports/         # Security scan reports
```

## 🧪 Test Types

### 1. Unit Tests

#### Backend (Jest)
```bash
# Run all backend unit tests
cd backend && npm test

# Run with coverage
cd backend && npm run test:coverage

# Watch mode
cd backend && npm run test:watch

# Specific test file
cd backend && npm test analysis.service.test.ts
```

#### Frontend (Vitest)
```bash
# Run all frontend unit tests
cd frontend && npm test

# Run with coverage
cd frontend && npm run test:coverage

# Watch mode
cd frontend && npm run test:watch

# UI mode
cd frontend && npm run test:ui
```

### 2. Integration Tests

Tests API endpoints, database operations, and service interactions:

```bash
# Run integration tests
cd backend && npm run test:integration

# With specific database
DATABASE_URL=postgresql://test:test@localhost:5432/test_db npm run test:integration
```

### 3. End-to-End Tests

Cross-browser testing with Playwright:

```bash
# Run all E2E tests
npx playwright test

# Specific browser
npx playwright test --project=chromium

# Debug mode
npx playwright test --debug

# Generate report
npx playwright show-report
```

#### E2E Test Categories:
- **Authentication Flow**: Login, registration, logout
- **Document Management**: Upload, view, delete documents
- **Analysis Workflow**: Document analysis, results viewing
- **User Interface**: Navigation, responsive design
- **Error Handling**: Network errors, validation errors

### 4. Performance Tests

Load testing with k6:

```bash
# Load test
k6 run k6-tests/load-test.js

# Stress test
k6 run k6-tests/stress-test.js

# Spike test
k6 run k6-tests/spike-test.js

# With custom base URL
BASE_URL=https://staging.fineprintai.com k6 run k6-tests/load-test.js
```

#### Performance Thresholds:
- Response time P95 < 500ms (normal load)
- Response time P95 < 2000ms (stress test)
- Error rate < 5%
- System availability > 99%

### 5. Security Tests

Automated security scanning:

```bash
# Vulnerability scanning with Trivy
trivy fs --exit-code 1 --severity HIGH,CRITICAL .

# OWASP ZAP baseline scan
docker run -v $(pwd):/zap/wrk/:rw -t owasp/zap2docker-stable zap-baseline.py -t http://localhost:3001

# Dependency audit
npm audit --audit-level=moderate
```

### 6. AI Validation Tests

LLM response accuracy and validation:

```bash
# Run AI validation tests
cd backend && npm run test:ai

# Specific model validation
npm run test:ai -- --grep "mistral"

# Accuracy benchmarking
npm run test:ai:benchmark
```

#### AI Test Categories:
- **Response Structure**: JSON format validation
- **Content Accuracy**: Finding categories, risk scores
- **Model Consistency**: Reproducible results
- **Error Handling**: Timeout, network errors
- **Performance**: Response time benchmarks

### 7. Visual Regression Tests

UI consistency testing:

```bash
# Run visual tests
npx playwright test --grep "@visual"

# Update screenshots
npx playwright test --update-snapshots

# Compare specific components
npx playwright test visual/components.spec.ts
```

## 🚀 Getting Started

### Prerequisites

1. **Node.js 20+**
2. **PostgreSQL 16** (for database tests)
3. **Redis 7** (for cache tests)
4. **Docker** (optional, for containerized tests)

### Initial Setup

```bash
# Clone repository
git clone https://github.com/your-org/fineprintai
cd fineprintai

# Install dependencies
npm install
cd backend && npm install
cd ../frontend && npm install
cd ..

# Setup test databases
createdb fineprintai_test
createdb fineprintai_integration_test
createdb fineprintai_e2e_test

# Install Playwright browsers
npx playwright install

# Install k6 (optional)
# macOS
brew install k6
# Ubuntu
sudo apt update && sudo apt install k6
```

### Environment Configuration

Create test environment files:

```bash
# backend/.env.test
NODE_ENV=test
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fineprintai_test
REDIS_URL=redis://localhost:6379/1
JWT_SECRET=test-jwt-secret-key-for-testing-only
OLLAMA_BASE_URL=http://localhost:11434
LOG_LEVEL=error

# frontend/.env.test
VITE_API_BASE_URL=http://localhost:3001/api
VITE_WS_URL=ws://localhost:3001/ws
VITE_ENVIRONMENT=test
```

## 🏃‍♂️ Running Tests

### Quick Test Suite

```bash
# Run essential tests (unit + integration)
./test-automation/scripts/run-all-tests.sh --unit-only

# Run all tests except performance
./test-automation/scripts/run-all-tests.sh

# Run complete test suite (includes performance & security)
./test-automation/scripts/run-all-tests.sh --all
```

### Individual Test Commands

```bash
# Backend unit tests
cd backend && npm test

# Frontend unit tests  
cd frontend && npm test

# Integration tests
cd backend && npm run test:integration

# E2E tests
npx playwright test

# Performance tests
k6 run k6-tests/load-test.js

# AI validation
cd backend && npm run test:ai
```

### Test Filtering

```bash
# Run specific test suites
npm test -- --grep "AnalysisService"

# Run tests matching pattern
npx playwright test --grep "auth"

# Skip flaky tests
npm test -- --grep "flaky" --invert
```

## ✍️ Writing Tests

### Backend Unit Test Example

```typescript
// backend/services/analysis/src/__tests__/analysis.service.test.ts
import { describe, test, expect, beforeEach } from '@jest/globals';
import { AnalysisService } from '../services/analysis';
import { testHelpers } from '../../../../__tests__/utils/test-helpers';

describe('AnalysisService', () => {
  let service: AnalysisService;
  let mockUser: any;

  beforeEach(async () => {
    service = new AnalysisService();
    mockUser = await testHelpers.createTestUser();
  });

  test('should create analysis with valid data', async () => {
    const document = await testHelpers.createTestDocument(mockUser.id);
    
    const analysis = await service.createAnalysis({
      documentId: document.id,
      userId: mockUser.id,
      content: 'Test contract content',
      documentType: 'contract',
      language: 'en'
    });

    expect(analysis).toHaveValidAnalysisStructure();
    expect(analysis.status).toBe('pending');
  });
});
```

### Frontend Component Test Example

```typescript
// frontend/src/components/__tests__/DocumentUpload.test.tsx
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentUpload } from '../upload/DocumentUpload';

describe('DocumentUpload', () => {
  test('should handle file upload', async () => {
    const user = userEvent.setup();
    render(<DocumentUpload />);

    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/choose file/i);
    
    await user.upload(input, file);
    
    expect(screen.getByText('test.pdf')).toBeInTheDocument();
  });
});
```

### E2E Test Example

```typescript
// playwright-tests/e2e/document-workflow.spec.ts
import { test, expect } from '@playwright/test';

test('complete document analysis workflow', async ({ page }) => {
  await page.goto('/dashboard');
  
  await page.click('[data-testid="upload-document"]');
  await page.setInputFiles('input[type="file"]', 'fixtures/test-contract.pdf');
  await page.fill('[data-testid="document-title"]', 'Test Contract');
  await page.click('[data-testid="upload-submit"]');
  
  await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/);
  await expect(page.locator('[data-testid="analysis-results"]')).toBeVisible();
});
```

### Performance Test Example

```javascript
// k6-tests/api-load-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 10 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  const response = http.get('http://localhost:3001/api/documents');
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

## 🔧 CI/CD Integration

### GitHub Actions Workflow

Our CI/CD pipeline runs comprehensive tests on every push and PR:

```yaml
# .github/workflows/test.yml
name: Comprehensive Test Suite
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run unit tests
        run: |
          npm ci
          cd backend && npm test
          cd ../frontend && npm test

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      postgres: # PostgreSQL service
      redis: # Redis service
    steps:
      - name: Run integration tests
        run: cd backend && npm run test:integration

  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - name: Install Playwright
        run: npx playwright install
      - name: Run E2E tests
        run: npx playwright test
```

### Test Status Checks

Required status checks for PR merging:
- ✅ Backend unit tests (90%+ coverage)
- ✅ Frontend unit tests (90%+ coverage)
- ✅ Integration tests pass
- ✅ E2E tests pass
- ✅ AI validation tests pass
- ✅ Security scans pass
- ✅ Performance benchmarks met

## 📊 Coverage Requirements

### Coverage Thresholds

```javascript
// jest.config.js
module.exports = {
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    // Critical services require higher coverage
    './src/services/analysis/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  }
};
```

### Coverage Reports

```bash
# Generate coverage reports
npm run test:coverage

# View HTML report
open backend/coverage/lcov-report/index.html
open frontend/coverage/index.html

# Upload to Codecov (CI)
codecov -f backend/coverage/lcov.info -F backend
codecov -f frontend/coverage/lcov.info -F frontend
```

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Start PostgreSQL
brew services start postgresql
# or
sudo systemctl start postgresql

# Create test database
createdb fineprintai_test
```

#### Redis Connection Errors
```bash
# Start Redis
brew services start redis
# or
sudo systemctl start redis

# Test connection
redis-cli ping
```

#### Playwright Browser Issues
```bash
# Reinstall browsers
npx playwright install --force

# Install system dependencies
npx playwright install-deps
```

#### Test Timeouts
```bash
# Increase timeout for slow tests
npm test -- --testTimeout=30000

# Run tests serially
npm test -- --maxWorkers=1
```

### Debug Mode

```bash
# Backend tests with debugging
cd backend && npm test -- --detectOpenHandles --forceExit

# Frontend tests with debugging
cd frontend && npm test -- --reporter=verbose

# E2E tests with debugging
npx playwright test --debug --headed

# Performance tests with detailed output
k6 run --verbose k6-tests/load-test.js
```

### Test Data Cleanup

```bash
# Manual cleanup
psql fineprintai_test -c "TRUNCATE TABLE users, documents, analyses CASCADE;"
redis-cli -n 1 FLUSHDB

# Automated cleanup (runs after each test)
npm run test:cleanup
```

## 📈 Best Practices

### 1. Test Organization
- Group related tests in describe blocks
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### 2. Test Data Management
- Use factories for test data creation
- Clean up after each test
- Use isolated test databases

### 3. Mock Strategy
- Mock external services (Ollama, email, etc.)
- Use real implementations for internal services
- Provide deterministic mock responses

### 4. Performance Considerations
- Parallel test execution where possible
- Database transactions for faster cleanup
- Efficient fixture loading

### 5. Maintenance
- Regular dependency updates
- Monitor test flakiness
- Update snapshots when UI changes
- Review coverage reports

## 🔗 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [k6 Documentation](https://k6.io/docs/)
- [Testing Library Best Practices](https://testing-library.com/docs/guiding-principles)

---

**Note**: This testing framework ensures comprehensive coverage and quality for Fine Print AI. All tests should pass before deploying to production. For questions or issues, please refer to the troubleshooting section or contact the development team.