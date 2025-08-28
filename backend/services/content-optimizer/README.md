# Content Optimizer Service

Dynamic content delivery system that serves optimized content to users based on A/B test winners, while keeping the optimization process completely invisible to end users.

## Overview

The Content Optimizer Service automatically selects and delivers the best-performing content variants to users based on real-time performance data from A/B tests. It uses advanced algorithms like Thompson Sampling and multi-armed bandits to balance exploration and exploitation, ensuring optimal content delivery while continuously learning.

## Key Features

### 1. **Intelligent Content Selection**
- Multi-armed bandit algorithm (Thompson Sampling)
- Automatic winner detection with statistical significance
- Gradual rollout for winning variants
- Real-time performance tracking

### 2. **Advanced Personalization**
- User segment detection (Enterprise, SMB, Startup, Individual)
- Industry-specific content customization
- Geographic and behavioral personalization
- Context-aware content delivery

### 3. **High-Performance Caching**
- Multi-layer caching (Memory → Redis → Database)
- <50ms response times for cached content
- Automatic cache warming and invalidation
- CDN-ready content structure

### 4. **Seamless Integration**
- Real-time WebSocket updates from Digital Twin service
- Automatic winner promotion
- Performance metrics reporting
- RESTful API with OpenAPI documentation

## API Endpoints

### Content Delivery

#### Get Marketing Content
```http
GET /content/marketing/{page}?segment=enterprise&personalize=true
```

Response:
```json
{
  "content": {
    "headline": "Enterprise-Grade Legal Document Analysis",
    "subheadline": "AI-powered insights at scale",
    "cta": "Request Enterprise Demo",
    "features": ["SSO Integration", "API Access", "Custom Models"]
  }
}
```

#### Get Sales Messaging
```http
GET /content/sales/messaging?segment=smb&industry=tech
```

Response:
```json
{
  "messages": {
    "value_prop": "Reduce contract review time by 90%",
    "pain_point": "Stop losing deals to slow legal reviews",
    "social_proof": "Join 1000+ tech companies saving time"
  }
}
```

#### Get Support Responses
```http
GET /content/support/responses
```

#### Get SEO Metadata
```http
GET /content/seo/metadata
```

### Conversion Tracking

```http
POST /track/conversion
{
  "variantId": "marketing:homepage:variant_a",
  "success": true,
  "userId": "user_123",
  "sessionId": "session_456"
}
```

### Administration

```http
GET /admin/stats              # Get optimization statistics
POST /admin/promote-winner    # Manually promote variant
POST /admin/cache/clear       # Clear cache
```

## Architecture

### Multi-Armed Bandit Algorithm

The service uses Thompson Sampling for optimal content selection:

1. **Exploration Phase**: Tests new variants with insufficient data
2. **Exploitation Phase**: Favors high-performing variants
3. **Dynamic Adjustment**: Balances exploration/exploitation based on confidence

### Statistical Winner Detection

- **Minimum Sample Size**: 100 impressions per variant
- **Confidence Level**: 95% (p < 0.05)
- **Effect Size Threshold**: 5% minimum improvement
- **Early Stopping**: Futility detection to save resources

### Personalization Engine

```
User Request → Segment Detection → Context Analysis → Content Selection → Personalization → Response
```

## Configuration

### Environment Variables

```env
# Service Configuration
PORT=3006
NODE_ENV=production
LOG_LEVEL=info

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=secret
REDIS_DB=2

# Database
DATABASE_URL=postgresql://user:pass@localhost/fineprint

# Optimization Settings
MIN_SAMPLE_SIZE=100
CONFIDENCE_THRESHOLD=0.95
EXPLORATION_RATE=0.1
UPDATE_INTERVAL=60000
WINNER_DELAY=3600000

# Integration
DIGITAL_TWIN_URL=http://localhost:3005
WEBSOCKET_URL=ws://localhost:3005/ws
INTEGRATION_API_KEY=secret

# CORS
CORS_ORIGIN=http://localhost:3000
```

## Performance Characteristics

### Response Times
- **L1 Cache (Memory)**: <10ms
- **L2 Cache (Redis)**: <50ms
- **L3 Cache (Database)**: <200ms
- **Personalization overhead**: +5-10ms

### Throughput
- **Requests/second**: 10,000+ (cached)
- **Concurrent connections**: 10,000
- **WebSocket subscriptions**: 1,000

### Resource Usage
- **Memory**: 256MB typical, 512MB max
- **CPU**: 0.5 cores typical, 2 cores peak
- **Redis Storage**: 100MB typical
- **Network**: 10Mbps typical

## Development

### Setup
```bash
npm install
npm run dev
```

### Testing
```bash
npm test                # Run all tests
npm run test:coverage   # With coverage report
```

### Building
```bash
npm run build          # Compile TypeScript
docker build -t content-optimizer .
```

### Running with Docker
```bash
docker-compose up
```

## Deployment

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: content-optimizer
spec:
  replicas: 3
  selector:
    matchLabels:
      app: content-optimizer
  template:
    metadata:
      labels:
        app: content-optimizer
    spec:
      containers:
      - name: content-optimizer
        image: content-optimizer:latest
        ports:
        - containerPort: 3006
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
```

### Health Checks

The service provides a comprehensive health endpoint:

```http
GET /health
```

Response:
```json
{
  "healthy": true,
  "version": "1.0.0",
  "uptime": 3600,
  "connections": {
    "redis": true,
    "database": true,
    "digitalTwin": true
  },
  "metrics": {
    "requestsPerMinute": 1500,
    "averageResponseTime": 45,
    "cacheHitRate": 0.92
  }
}
```

## Monitoring

### Key Metrics

1. **Content Performance**
   - Conversion rates by variant
   - Confidence scores
   - Winner detection rate

2. **System Performance**
   - Response times (p50, p95, p99)
   - Cache hit rates
   - Error rates

3. **User Segmentation**
   - Segment distribution
   - Personalization effectiveness
   - Behavioral patterns

### Logging

Structured logging with Pino:
```json
{
  "level": "info",
  "time": "2024-01-15T10:30:00.000Z",
  "component": "content-optimizer",
  "msg": "Content selected",
  "category": "marketing",
  "variant": "variant_a",
  "confidence": 0.95,
  "latency": 25
}
```

## Silent Optimization

The service ensures optimization remains invisible to users:

1. **No A/B Test Indicators**: Response contains only content, no test metadata
2. **Consistent Sessions**: Same variant served throughout user session
3. **Smooth Transitions**: Gradual rollout when winners change
4. **Fallback Content**: Always returns valid content, even on errors

## API Documentation

Interactive API documentation available at:
```
http://localhost:3006/docs
```

## License

Copyright © 2024 Fine Print AI. All rights reserved.