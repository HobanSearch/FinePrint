# Model Management Service

AI Model Management Service for Fine Print AI - Intelligent routing, cost optimization, and queue management for multiple LLM models.

## Features

- **Intelligent Model Routing**: Cost-aware routing based on request priority, complexity, and user tier
- **Model Registry**: Track model status, performance metrics, and availability
- **Queue Management**: BullMQ-based request queuing with priority handling
- **Cost Optimization**: Track costs, generate reports, and provide optimization recommendations
- **Redis Caching**: 24-hour cache for analysis results to reduce costs
- **Health Monitoring**: Automatic health checks and status updates for all models
- **Metrics Collection**: Comprehensive metrics for response times, success rates, and costs

## Models Configuration

Based on test results:

| Model | Avg Response Time | Success Rate | Cost/Request | Use Case |
|-------|------------------|--------------|--------------|----------|
| fine-print-llama | 81.54s | 100% | $0.001 | PRIMARY - Fast, simple queries |
| fine-print-qwen-v2 | 936.76s | 100% | $0.005 | COMPLEX - Detailed analysis |
| fine-print-gpt-oss | 465.21s | 100% | $0.01 | BACKUP - Fallback option |
| Business Models | ~50s | 100% | $0.002 | SPECIALIZED - Marketing, Sales, etc. |

## Routing Logic

1. **Urgent + Simple** → Llama (fastest)
2. **Complex + Time Available** → Qwen or GPT-OSS (most accurate)
3. **Business Queries** → Specialized models
4. **Free Tier** → Cost-optimized routing
5. **Premium/Enterprise** → Performance-optimized routing
6. **Cache Hits** → No model needed (instant response)

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Run development
npm run dev

# Build for production
npm run build

# Start production
npm start
```

## Docker Deployment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f model-management

# Stop services
docker-compose down
```

## API Endpoints

### Health & Status
- `GET /health` - Service health check
- `GET /api/v1/models` - List all models
- `GET /api/v1/models/:modelId` - Get model details
- `PATCH /api/v1/models/:modelId/status` - Update model status

### Request Routing
- `POST /api/v1/route` - Route request to optimal model
- `POST /api/v1/process` - Process request directly

### Job Management
- `GET /api/v1/jobs/:jobId` - Get job status
- `DELETE /api/v1/jobs/:jobId` - Cancel job
- `GET /api/v1/queues/stats` - Queue statistics

### Cost Management
- `GET /api/v1/costs/report` - Generate cost report
- `GET /api/v1/costs/recommendations` - Get optimization recommendations
- `GET /api/v1/costs/users/:userId` - User cost summary
- `GET /api/v1/costs/export?month=YYYY-MM` - Export cost data

### Maintenance
- `POST /api/v1/maintenance/clean-jobs` - Clean old jobs
- `POST /api/v1/maintenance/reset-alerts` - Reset monthly alerts

## Example Request

```javascript
// Route request to optimal model
const response = await fetch('http://localhost:3010/api/v1/route', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user-123',
    userTier: 'PREMIUM',
    requestType: 'DOCUMENT_ANALYSIS',
    priority: 'HIGH',
    complexity: 'MODERATE',
    capabilities: ['DOCUMENT_ANALYSIS', 'PATTERN_DETECTION'],
    payload: {
      document: 'Terms of Service text...',
      options: { detailed: true }
    }
  })
});

const result = await response.json();
console.log('Job ID:', result.jobId);
console.log('Selected Model:', result.decision.selectedModel.name);
console.log('Estimated Time:', result.estimatedResponseTime);
console.log('Estimated Cost:', result.estimatedCost);
```

## Environment Variables

```env
# Server
HOST=0.0.0.0
PORT=3010
NODE_ENV=production

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=1

# Ollama
OLLAMA_HOST=http://localhost:11434

# Cost Thresholds (USD/month)
COST_THRESHOLD_FREE=1.0
COST_THRESHOLD_PREMIUM=50.0
COST_THRESHOLD_ENTERPRISE=500.0

# Cache
CACHE_TTL=86400
CACHE_ENABLED=true
```

## Monitoring

Access metrics at `http://localhost:3010/metrics` for Prometheus integration.

API documentation available at `http://localhost:3010/documentation`

## Cost Optimization Tips

1. **Improve Cache Hit Rate**: Current target is 30%+ cache hits
2. **Use Primary Model**: Route 60%+ requests to Llama for cost efficiency
3. **Batch Non-Urgent Requests**: Reduce costs by 10%
4. **Monitor Budget Alerts**: Automatic alerts at 50%, 75%, and 90% usage

## Performance Targets

- API Response Time: <200ms (routing decision)
- Cache Hit Rate: >30%
- Model Availability: >99.9%
- Queue Processing: <2min for urgent requests

## License

Proprietary - Fine Print AI