# Feedback Collector Service

A comprehensive feedback collection system that gathers implicit and explicit user signals to drive AI model improvements. This service provides real-time event streaming, advanced analytics, and GDPR-compliant data collection.

## Features

### Implicit Feedback Collection
- **Behavioral Tracking**: Automatically tracks user interactions including clicks, scrolls, hover events, copy actions, downloads, and page exits
- **Engagement Metrics**: Calculates real-time engagement scores, scroll depth, time on page, and conversion tracking
- **Session Reconstruction**: Maintains user journey data with click paths and page sequences
- **A/B Test Integration**: Tracks content variants and model versions for experiment analysis

### Explicit Feedback Collection
- **Multiple Feedback Types**: Ratings (1-5 stars), thumbs up/down, text comments, issue reports, feature requests, and bug reports
- **Sentiment Analysis**: Real-time NLP-based sentiment scoring on text feedback
- **Issue Detection**: Automatic categorization of issues (accuracy, relevance, quality, offensive content)
- **NPS Surveys**: Net Promoter Score collection and tracking

### Event Streaming Pipeline
- **Kafka Integration**: High-throughput event ingestion with automatic retry and dead letter queues
- **Redis Streams**: Real-time event processing with backpressure handling
- **WebSocket Support**: Live feedback streaming to connected clients
- **Batch Processing**: Efficient batch operations for analytics workloads

### Analytics Engine
- **Real-time Aggregations**: Sliding window aggregations (1m, 5m, 15m, 1h, 24h)
- **Pattern Detection**: Automatic detection of rage clicks, quick bounces, and conversion funnel drop-offs
- **Anomaly Detection**: Statistical anomaly detection with configurable thresholds
- **Trend Analysis**: Linear regression-based trend detection with confidence scoring

### Privacy & Compliance
- **GDPR Compliance**: Full support for consent management, data export, and right to deletion
- **Data Anonymization**: Automatic PII scrubbing and pseudonymization
- **Retention Policies**: Configurable data retention with automatic cleanup
- **Audit Logging**: Complete audit trail of all privacy-related operations

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │────▶│   API Gateway   │────▶│  Feedback API   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                                ┌─────────────────────────┼─────────────────────────┐
                                │                         │                         │
                        ┌───────▼────────┐      ┌────────▼────────┐      ┌─────────▼────────┐
                        │   Implicit     │      │    Explicit     │      │     Privacy      │
                        │   Collector    │      │   Collector     │      │     Manager      │
                        └────────┬───────┘      └────────┬────────┘      └──────────────────┘
                                 │                        │
                        ┌────────▼────────────────────────▼────────┐
                        │            Kafka Topics                  │
                        │  (implicit-events, explicit-events)      │
                        └────────┬─────────────────────────────────┘
                                 │
                        ┌────────▼────────┐
                        │  Stream         │
                        │  Processor      │
                        └────────┬────────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
        ┌───────▼────────┐ ┌────▼─────┐ ┌───────▼────────┐
        │   Aggregator   │ │  Batch   │ │   ClickHouse   │
        │                │ │Processor │ │   Analytics    │
        └────────────────┘ └──────────┘ └────────────────┘
```

## Installation

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Initialize database
npm run db:migrate

# Start services (Redis, Kafka, ClickHouse)
docker-compose up -d

# Start the service
npm run dev
```

## Configuration

### Environment Variables

```env
# Service Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Kafka Configuration
KAFKA_BROKERS=localhost:9092

# ClickHouse Configuration
CLICKHOUSE_URL=http://localhost:8123
CLICKHOUSE_DB=feedback
CLICKHOUSE_USER=
CLICKHOUSE_PASSWORD=

# Privacy & Security
ENCRYPTION_KEY=your-32-character-encryption-key
SALT=your-salt-for-hashing

# Monitoring
SENTRY_DSN=your-sentry-dsn

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## API Documentation

### Implicit Feedback

#### Track Event
```http
POST /feedback/implicit/event
Content-Type: application/json

{
  "eventType": "click",
  "elementId": "ai-headline",
  "modelType": "marketing",
  "modelVersion": "v3.2",
  "contentVariant": {
    "variantId": "variant-a",
    "variantName": "Variant A",
    "testId": "test-123",
    "testName": "Headlines Test",
    "controlGroup": false,
    "allocation": 0.5
  },
  "metadata": {
    "page": "/dashboard",
    "referrer": "/home",
    "device": {
      "type": "desktop",
      "os": "macOS",
      "browser": "Chrome"
    },
    "timeOnPage": 15000,
    "scrollDepth": 75
  },
  "businessMetrics": {
    "conversionValue": 99.99,
    "leadScore": 85
  }
}
```

#### Batch Events
```http
POST /feedback/implicit/batch
Content-Type: application/json

[
  { /* event 1 */ },
  { /* event 2 */ },
  { /* event 3 */ }
]
```

### Explicit Feedback

#### Submit Rating
```http
POST /feedback/explicit/rating
Content-Type: application/json

{
  "contentId": "content_123",
  "rating": 4,
  "modelType": "marketing",
  "userId": "user_456",
  "comment": "Good but could be more specific"
}
```

#### Submit Thumbs
```http
POST /feedback/explicit/thumbs
Content-Type: application/json

{
  "contentId": "content_123",
  "thumbsUp": true,
  "modelType": "sales",
  "userId": "user_456"
}
```

#### Report Issue
```http
POST /feedback/explicit/report
Content-Type: application/json

{
  "contentId": "content_123",
  "issueType": "accuracy",
  "description": "The pricing information is incorrect",
  "modelType": "support",
  "userId": "user_456",
  "priority": "high"
}
```

### Analytics

#### Get Metrics
```http
GET /analytics/metrics?modelType=marketing&period.start=2024-01-01&period.end=2024-01-31&granularity=1h
```

#### Get Sentiment Analysis
```http
GET /analytics/sentiment?modelType=marketing&period=7d
```

#### Get Patterns
```http
GET /analytics/patterns?eventType=conversion&limit=10
```

#### Get Anomalies
```http
GET /analytics/anomalies?threshold=2.5
```

### Privacy

#### Record Consent
```http
POST /privacy/consent
Content-Type: application/json

{
  "userId": "user_123",
  "consentLevels": ["essential", "functional", "analytics"],
  "ipAddress": "192.168.1.1",
  "userAgent": "Mozilla/5.0..."
}
```

#### Export User Data
```http
GET /privacy/export/user_123
```

#### Delete User Data
```http
DELETE /privacy/data/user_123
```

### WebSocket

#### Connect to Real-time Stream
```javascript
const ws = new WebSocket('ws://localhost:3000/ws/feedback-stream');

ws.on('message', (data) => {
  const event = JSON.parse(data);
  console.log('Received event:', event);
});

// Subscribe to specific channel
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'marketing'
}));
```

## Client SDKs

### JavaScript/TypeScript SDK

```typescript
import { FeedbackCollector } from '@fineprint/feedback-sdk';

const collector = new FeedbackCollector({
  apiUrl: 'https://api.fineprint.ai',
  apiKey: 'your-api-key'
});

// Track implicit events
collector.trackClick('button-id', {
  modelType: 'marketing',
  modelVersion: 'v3'
});

// Submit explicit feedback
collector.submitRating('content-123', 5, {
  comment: 'Excellent!',
  modelType: 'sales'
});

// Subscribe to real-time updates
collector.onFeedback((event) => {
  console.log('Real-time feedback:', event);
});
```

## Monitoring

### Metrics
- Events per second
- Processing latency (p50, p95, p99)
- Error rates by type
- Queue sizes
- Active WebSocket connections

### Health Check
```http
GET /health

{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "services": {
    "database": true,
    "redis": true,
    "kafka": true,
    "analytics": true
  },
  "metrics": {
    "eventsPerSecond": 150,
    "activeConnections": 25,
    "queueSize": 0,
    "errorRate": 0.01
  }
}
```

## Performance

### Benchmarks
- **Event Ingestion**: 10,000+ events/second
- **Real-time Processing**: <100ms p95 latency
- **Batch Processing**: 1M events in <60 seconds
- **WebSocket Broadcast**: <10ms to 1000 clients

### Scaling
- Horizontal scaling via Kubernetes
- Auto-scaling based on queue depth
- Read replicas for analytics queries
- CDN for static assets

## Security

### Authentication
- API key authentication for service-to-service
- JWT tokens for user authentication
- Rate limiting per API key

### Data Protection
- AES-256 encryption at rest
- TLS 1.3 for data in transit
- PII anonymization
- Secure key management

## Development

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage
```

### Debugging
```bash
# Run with debug logging
LOG_LEVEL=debug npm run dev

# Inspect Kafka topics
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092

# View Redis keys
redis-cli --scan --pattern "feedback:*"
```

## Deployment

### Docker
```bash
# Build image
docker build -t feedback-collector .

# Run container
docker run -p 3000:3000 feedback-collector
```

### Kubernetes
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: feedback-collector
spec:
  replicas: 3
  selector:
    matchLabels:
      app: feedback-collector
  template:
    metadata:
      labels:
        app: feedback-collector
    spec:
      containers:
      - name: feedback-collector
        image: feedback-collector:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

## License

Proprietary - Fine Print AI

## Support

For support, email support@fineprint.ai or create an issue in the repository.