# A/B Testing Service

## Overview

The A/B Testing Service is a comprehensive experimentation platform for Fine Print AI that enables data-driven decision making through controlled experiments, statistical analysis, and automated optimization. It supports multiple testing methodologies including traditional A/B tests, multi-armed bandits, and Bayesian optimization.

## Features

### Core Capabilities

- **Experiment Management**: Create, manage, and monitor experiments with multiple variants
- **Traffic Allocation**: Intelligent user assignment with sticky sessions and targeting rules
- **Statistical Analysis**: Frequentist and Bayesian testing with sequential analysis
- **Real-time Metrics**: Sub-second metric collection and aggregation
- **Automated Decisions**: Rule-based early stopping and traffic reallocation
- **Model Integration**: Seamless integration with Model Management Service
- **Comprehensive Reporting**: Executive summaries and technical analysis

### Statistical Methods

- **Frequentist Testing**: Traditional hypothesis testing with p-values
- **Bayesian Analysis**: Posterior probability calculations with credible intervals
- **Sequential Testing**: Early stopping with always-valid inference
- **Multi-Armed Bandits**: Thompson Sampling, Epsilon-Greedy, UCB algorithms
- **Power Analysis**: Sample size calculations and statistical power estimation

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway                             │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│                   A/B Testing Service                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Experiment Manager                       │  │
│  │  • Create/Update Experiments                         │  │
│  │  • Lifecycle Management                              │  │
│  │  • Scheduling & Automation                           │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Traffic Allocator                        │  │
│  │  • User Assignment                                   │  │
│  │  • Targeting Rules                                   │  │
│  │  • Sticky Sessions                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Statistical Engine                          │  │
│  │  • Hypothesis Testing                                │  │
│  │  • Bayesian Analysis                                 │  │
│  │  • Power Calculations                                │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Metrics Collector                          │  │
│  │  • Real-time Collection                              │  │
│  │  • Batch Processing                                  │  │
│  │  • Aggregation                                       │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │            Decision Engine                            │  │
│  │  • Automated Decisions                               │  │
│  │  • Traffic Optimization                              │  │
│  │  • Early Stopping                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │PostgreSQL│        │  Redis   │        │  Model   │
   │          │        │          │        │ Service  │
   └──────────┘        └──────────┘        └──────────┘
```

## Installation

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7.2+
- Docker (optional)

### Local Development

```bash
# Clone the repository
git clone https://github.com/fineprint/backend.git
cd backend/services/ab-testing

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Start the service
npm run dev
```

### Docker Deployment

```bash
# Build the image
docker build -t fineprint/ab-testing:latest .

# Run with docker-compose
docker-compose up -d
```

### Kubernetes Deployment

```bash
# Apply Kubernetes manifests
kubectl apply -f infrastructure/kubernetes/ab-testing/

# Check deployment status
kubectl get pods -n fineprint -l app=ab-testing
```

## API Documentation

### Experiment Management

#### Create Experiment
```http
POST /api/v1/experiments
Content-Type: application/json

{
  "name": "Model Performance Test",
  "hypothesis": "GPT-4 model will increase conversion by 10%",
  "type": "AB_TEST",
  "variants": [
    {
      "name": "control",
      "isControl": true,
      "allocation": 0.5,
      "modelId": "gpt-3.5-turbo"
    },
    {
      "name": "treatment",
      "isControl": false,
      "allocation": 0.5,
      "modelId": "gpt-4"
    }
  ],
  "metrics": {
    "primaryMetric": {
      "name": "conversion_rate",
      "type": "CONVERSION",
      "minimumDetectableEffect": 0.05
    }
  },
  "statisticalConfig": {
    "method": "BAYESIAN",
    "confidenceLevel": 0.95,
    "power": 0.8
  }
}
```

#### Start Experiment
```http
POST /api/v1/experiments/{experimentId}/start
```

#### Get Experiment Results
```http
GET /api/v1/experiments/{experimentId}/results
```

### User Assignment

#### Get Variant Assignment
```http
POST /api/v1/assignments
Content-Type: application/json

{
  "experimentId": "exp_123",
  "userId": "user_456",
  "attributes": {
    "plan": "premium",
    "country": "US"
  }
}
```

### Metrics Collection

#### Track Metric Event
```http
POST /api/v1/metrics/track
Content-Type: application/json

{
  "experimentId": "exp_123",
  "userId": "user_456",
  "metricName": "conversion",
  "value": 1,
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### Statistical Analysis

#### Run Analysis
```http
POST /api/v1/analysis/run
Content-Type: application/json

{
  "experimentId": "exp_123",
  "metricName": "conversion_rate",
  "analysisType": "BAYESIAN"
}
```

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/ab_testing

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret

# Model Service
MODEL_SERVICE_URL=http://model-management:3004

# Server
PORT=3005
HOST=0.0.0.0
LOG_LEVEL=info

# CORS
CORS_ORIGIN=https://app.fineprintai.com
```

### Experiment Configuration

```json
{
  "defaultConfidence": 0.95,
  "defaultPower": 0.8,
  "minimumSampleSize": 100,
  "maximumExperimentDuration": 90,
  "automationRules": [
    {
      "name": "early_stop_success",
      "condition": "pValue < 0.05 AND effectSize > 0.1",
      "action": "stop_success",
      "enabled": true
    }
  ]
}
```

## Performance Metrics

- **Latency**: <100ms for assignment decisions
- **Throughput**: 10,000+ assignments/second
- **Metric Ingestion**: 50,000+ events/second
- **Analysis**: <5s for complex statistical calculations
- **Cache Hit Rate**: >90% for user assignments

## Monitoring

### Prometheus Metrics

- `ab_experiments_total`: Total number of experiments
- `ab_assignments_total`: Total user assignments
- `ab_metrics_processed_total`: Metrics processed
- `ab_analysis_duration_seconds`: Analysis computation time
- `ab_decision_accuracy`: Decision accuracy rate

### Health Checks

```http
GET /health
```

Returns:
```json
{
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

## Testing

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration

# Run performance tests
npm run test:performance

# Coverage report
npm run test:coverage
```

## Best Practices

### Experiment Design

1. **Clear Hypothesis**: Define measurable success criteria
2. **Adequate Sample Size**: Use power analysis for sizing
3. **Randomization**: Ensure proper random assignment
4. **Control Variables**: Minimize confounding factors
5. **Duration**: Run experiments for full business cycles

### Statistical Rigor

1. **Multiple Testing Correction**: Apply Bonferroni or FDR
2. **Sample Ratio Mismatch**: Monitor for assignment issues
3. **Novelty Effects**: Account for initial user behavior
4. **Practical Significance**: Consider business impact
5. **Sequential Testing**: Use appropriate stopping rules

### Performance Optimization

1. **Batch Metrics**: Process events in batches
2. **Cache Assignments**: Use Redis for fast lookups
3. **Async Analysis**: Run heavy computations async
4. **Connection Pooling**: Optimize database connections
5. **Horizontal Scaling**: Use Kubernetes HPA

## Troubleshooting

### Common Issues

1. **Assignment Drift**: Check targeting rules and cache
2. **Slow Analysis**: Verify sample size and computation resources
3. **Metric Delays**: Check batch processing queue
4. **Memory Issues**: Monitor Redis memory usage
5. **Network Timeouts**: Adjust client timeout settings

## Security

- **Authentication**: JWT-based service authentication
- **Authorization**: Role-based access control (RBAC)
- **Encryption**: TLS for data in transit
- **Audit Logging**: Complete audit trail of decisions
- **Data Privacy**: GDPR-compliant data handling

## Contributing

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for development guidelines.

## License

Copyright © 2024 Fine Print AI. All rights reserved.