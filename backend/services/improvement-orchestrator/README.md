# Improvement Orchestrator Service

A comprehensive orchestration service that automatically manages the full lifecycle of AI model improvements using Temporal workflows. This service detects failures in A/B tests, analyzes root causes, retrains models, and safely deploys improvements.

## Features

### 🔄 Automated Improvement Workflow
- **Failure Detection**: Automatically detects underperforming models from A/B test results
- **Root Cause Analysis**: Identifies why models failed using pattern recognition and statistical analysis
- **Improvement Planning**: Generates actionable improvement plans based on analysis
- **Model Retraining**: Executes retraining with enhanced datasets and optimized hyperparameters
- **Validation**: Comprehensive model validation before deployment
- **Safe Deployment**: Blue-green, canary, and rolling deployment strategies
- **Monitoring**: Real-time performance monitoring with automatic rollback

### 🧠 Intelligent Analysis
- **Pattern Detection**: Identifies recurring failure patterns across models
- **Hypothesis Generation**: Creates data-driven improvement hypotheses
- **Impact Assessment**: Calculates business impact of failures and improvements
- **Risk Evaluation**: Assesses risks and provides mitigation strategies

### 🚀 Deployment Strategies
- **Blue-Green**: Zero-downtime deployment with instant rollback
- **Canary**: Gradual rollout with automatic promotion
- **Rolling**: Progressive update of instances
- **Immediate**: Fast deployment for critical fixes

### 📊 Monitoring & Alerting
- **Real-time Metrics**: Track workflow progress and model performance
- **WebSocket Updates**: Live workflow status updates
- **Multi-channel Notifications**: Email, Slack, and webhook notifications
- **Performance Dashboards**: Comprehensive monitoring dashboards

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Improvement Orchestrator                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Temporal   │  │   Workflows  │  │  Activities  │      │
│  │    Server    │◄─┤              │◄─┤              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────────────────────────────────────────┐       │
│  │              Main Improvement Workflow            │       │
│  │  1. Detect Failure → 2. Analyze → 3. Plan        │       │
│  │  4. Execute → 5. Retrain → 6. Validate           │       │
│  │  7. Deploy → 8. Monitor → 9. Report              │       │
│  └──────────────────────────────────────────────────┘       │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Retraining  │  │  Deployment  │  │  Monitoring  │      │
│  │   Workflow   │  │   Workflow   │  │   System     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites
- Node.js 20+ LTS
- Docker and Docker Compose
- Redis (for caching)
- PostgreSQL (for Temporal)

### Setup

1. **Install dependencies**:
```bash
npm install
```

2. **Start Temporal server**:
```bash
npm run temporal:dev
```

3. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start the worker**:
```bash
npm run worker
```

5. **Start the service**:
```bash
npm run dev
```

## API Documentation

### Trigger Improvement Workflow
```http
POST /api/workflows/improve-model
Content-Type: application/json

{
  "modelType": "marketing",
  "failureId": "fail_123",
  "priority": "high",
  "autoApprove": false,
  "maxRetries": 3,
  "notificationChannels": ["email", "slack"]
}
```

### Trigger Retraining Workflow
```http
POST /api/workflows/retrain-model
Content-Type: application/json

{
  "modelType": "sales",
  "baseModelId": "model_456",
  "improvements": [...],
  "hyperparameterSearch": true,
  "validationStrategy": "cross_validation"
}
```

### Deploy Model
```http
POST /api/workflows/deploy-model
Content-Type: application/json

{
  "modelId": "model_789",
  "modelType": "support",
  "strategy": "canary",
  "environment": "production",
  "autoPromote": true,
  "rollbackOnFailure": true
}
```

### Get Workflow Status
```http
GET /api/workflows/{workflowId}/status
```

### Approve Workflow
```http
POST /api/workflows/{workflowId}/approve
```

### Trigger Rollback
```http
POST /api/workflows/{workflowId}/rollback
```

### Get Improvement History
```http
GET /api/improvements/history?modelType=marketing&limit=50
```

### Get Metrics
```http
GET /api/metrics/improvement-rate
```

### WebSocket Connection
```javascript
const ws = new WebSocket('ws://localhost:3010/ws');

ws.send(JSON.stringify({
  type: 'subscribe',
  workflowId: 'improvement_marketing_123456'
}));

ws.onmessage = (event) => {
  const update = JSON.parse(event.data);
  console.log('Workflow update:', update);
};
```

## Workflow Types

### 1. Model Improvement Workflow
Main workflow that orchestrates the entire improvement process:
- Detects and analyzes failures
- Generates improvement plans
- Coordinates retraining and deployment
- Handles approvals and rollbacks

### 2. Retraining Workflow
Specialized workflow for model retraining:
- Prepares and enhances datasets
- Optimizes hyperparameters
- Manages training epochs with early stopping
- Saves checkpoints and validates models

### 3. Deployment Workflow
Handles safe model deployment:
- Implements various deployment strategies
- Runs health checks and validation
- Manages traffic splitting
- Handles automatic rollback

## Configuration

### Environment Variables
```env
# Service Configuration
PORT=3010
HOST=0.0.0.0
LOG_LEVEL=info

# Temporal Configuration
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default
TEMPORAL_TASK_QUEUE=improvement-orchestrator

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Service URLs
DIGITAL_TWIN_URL=http://localhost:3007
OLLAMA_URL=http://localhost:11434
MODEL_REGISTRY_URL=http://localhost:3017
DEPLOYMENT_SERVICE_URL=http://localhost:3018
MONITORING_SERVICE_URL=http://localhost:3019

# Notification Configuration
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
STAKEHOLDER_EMAILS=admin@example.com,team@example.com

# CORS Configuration
CORS_ORIGIN=http://localhost:3000,http://localhost:3001
```

## Monitoring

### Health Check
```http
GET /health
```

Returns service health status including Temporal and Redis connectivity.

### Metrics
The service exposes various metrics:
- Improvement success rate
- Average improvement time
- Deployment success rate
- Model performance improvements
- Resource utilization

### Logging
Structured logging with Pino:
- Request/response logging
- Workflow execution tracking
- Error tracking with stack traces
- Performance metrics

## Development

### Running Tests
```bash
npm test
npm run test:coverage
```

### Linting
```bash
npm run lint
```

### Building
```bash
npm run build
```

### Docker Build
```bash
docker build -t improvement-orchestrator .
docker run -p 3010:3010 improvement-orchestrator
```

## Deployment

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: improvement-orchestrator
spec:
  replicas: 3
  selector:
    matchLabels:
      app: improvement-orchestrator
  template:
    metadata:
      labels:
        app: improvement-orchestrator
    spec:
      containers:
      - name: orchestrator
        image: improvement-orchestrator:latest
        ports:
        - containerPort: 3010
        env:
        - name: TEMPORAL_ADDRESS
          value: temporal-server:7233
        - name: REDIS_HOST
          value: redis-service
```

### Scaling Considerations
- **Horizontal Scaling**: Add more worker instances for parallel workflow execution
- **Temporal Workers**: Scale based on workflow load
- **Redis**: Use Redis Cluster for high availability
- **Database**: Use read replicas for query distribution

## Troubleshooting

### Common Issues

1. **Workflow Stuck**:
   - Check Temporal UI at http://localhost:8080
   - Review workflow history for errors
   - Check worker logs for activity failures

2. **Deployment Rollback**:
   - Automatic rollback triggers on validation failure
   - Manual rollback via API endpoint
   - Check rollback conditions in deployment config

3. **Performance Issues**:
   - Monitor worker resource usage
   - Adjust concurrent execution limits
   - Optimize activity implementations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with tests
4. Submit pull request

## License

MIT