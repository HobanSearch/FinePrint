# Memory Persistence Service

Unified persistence layer for AI learning and memory across all Fine Print AI services. This service provides centralized storage, retrieval, and analytics for AI memory and learning events, enabling business intelligence and continuous improvement.

## Features

### Memory Persistence Engine
- **Multi-tier Storage**: Hot (Redis), Warm (PostgreSQL), Cold (S3) storage tiers
- **Memory Types**: Working, Episodic, Semantic, Procedural, Business memories
- **Vector Similarity Search**: Semantic memory retrieval using pgvector
- **Relationship Tracking**: Graph-like memory relationships
- **Automatic Archival**: Time-based archival to S3 for cost optimization

### Learning History Service  
- **Event Tracking**: Records training, feedback, corrections, and adaptations
- **Pattern Detection**: Identifies recurring patterns in AI behavior
- **Performance Metrics**: Tracks accuracy, confidence, and learning rates
- **Trend Analysis**: Analyzes learning trends over time
- **Recommendations**: Provides actionable insights for improvement

### Analytics Engine
- **Real-time Metrics**: Live performance monitoring
- **Business Intelligence**: Domain-specific business impact metrics
- **Custom Reports**: Performance, learning, business, and executive reports
- **Predictive Analytics**: Forecasts based on historical trends
- **Insight Generation**: Automatic anomaly detection and opportunities

### Cross-Service Synchronization
- **Real-time Sync**: WebSocket-based event propagation
- **Redis Pub/Sub**: Broadcast and direct messaging
- **Resilient Queuing**: Persistent sync queues with retry logic
- **Batch Processing**: Efficient bulk synchronization

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Memory Persistence Service                  │
├─────────────────────────────────────────────────────────────┤
│                         API Layer                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │   Memory    │  │  Learning   │  │   Analytics     │     │
│  │   Routes    │  │   Routes    │  │    Routes       │     │
│  └─────────────┘  └─────────────┘  └─────────────────┘     │
├─────────────────────────────────────────────────────────────┤
│                      Service Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐     │
│  │   Memory    │  │  Learning   │  │   Analytics     │     │
│  │Persistence  │  │  History    │  │    Engine       │     │
│  │   Engine    │  │  Service    │  │                 │     │
│  └─────────────┘  └─────────────┘  └─────────────────┘     │
│         │                │                  │                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           Cross-Service Synchronization              │    │
│  └─────────────────────────────────────────────────────┘    │
├─────────────────────────────────────────────────────────────┤
│                      Storage Layer                            │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐        │
│  │  Redis   │  │ PostgreSQL   │  │      S3        │        │
│  │  (Hot)   │  │   (Warm)     │  │    (Cold)      │        │
│  └──────────┘  └──────────────┘  └────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Memory Management
- `POST /api/memory` - Store new memory
- `GET /api/memory/:id` - Retrieve memory by ID
- `POST /api/memory/query` - Query memories
- `POST /api/memory/search/similarity` - Vector similarity search
- `GET /api/memory/aggregations` - Get memory statistics
- `POST /api/memory/relationships` - Create memory relationships
- `GET /api/memory/:id/related` - Get related memories

### Learning History
- `POST /api/learning/events` - Record learning event
- `POST /api/learning/history` - Query learning history
- `GET /api/learning/patterns/:domain` - Get learning patterns
- `GET /api/learning/metrics/:domain` - Get learning metrics
- `GET /api/learning/trends/:domain` - Analyze trends
- `GET /api/learning/recommendations/:domain` - Get recommendations
- `POST /api/learning/feedback` - Record feedback

### Analytics
- `POST /api/analytics/query` - Execute analytics query
- `GET /api/analytics/metrics/:domain` - Get business metrics
- `GET /api/analytics/dashboard` - Get dashboard data
- `GET /api/analytics/reports/:type/:domain` - Generate reports
- `POST /api/analytics/events` - Track custom events
- `GET /api/analytics/insights` - Get insights
- `GET /api/analytics/realtime` - Real-time metrics
- `GET /api/analytics/export` - Export data

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=8009
HOST=0.0.0.0
NODE_ENV=production

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=fineprintai
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-password

# S3 (for cold storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=fineprintai-memories

# Authentication
JWT_SECRET=your-jwt-secret

# CORS
CORS_ORIGINS=http://localhost:3000,https://app.fineprintai.com
```

## Usage Examples

### Storing Memory

```typescript
const memory = await fetch('/api/memory', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    serviceId: 'dspy-service',
    agentId: 'legal-analyzer',
    memoryType: 'semantic',
    domain: 'legal_analysis',
    content: {
      pattern: 'automatic_renewal_clause',
      risk_level: 'high',
      recommendation: 'Review cancellation terms'
    },
    metadata: {
      timestamp: new Date(),
      version: 1,
      tags: ['contract', 'subscription', 'risk'],
      importance: 8,
      accessCount: 0,
      lastAccessed: new Date()
    },
    embeddings: [0.1, 0.2, ...], // 1536-dimensional vector
    relationships: {
      relatedMemories: ['mem_123', 'mem_456']
    }
  })
});
```

### Recording Learning Event

```typescript
const event = await fetch('/api/learning/events', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    serviceId: 'lora-service',
    agentId: 'legal-model-v2',
    eventType: 'feedback',
    domain: 'legal_analysis',
    metadata: {
      timestamp: new Date(),
      sessionId: 'session_123',
      importance: 7
    },
    input: {
      data: { document_text: 'Terms of Service...' }
    },
    output: {
      prediction: { risk_score: 0.85 },
      confidence: 0.92
    },
    feedback: {
      rating: 4,
      correct: true
    },
    impact: {
      modelUpdated: true,
      performanceChange: 0.02,
      affectedModels: ['legal-model-v2']
    }
  })
});
```

### Getting Analytics Dashboard

```typescript
const dashboard = await fetch('/api/analytics/dashboard?domain=legal_analysis', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await dashboard.json();
// {
//   realtime: { activeAgents: 5, requestsPerSecond: 12.3, ... },
//   today: { aiPerformance: {...}, businessImpact: {...}, ... },
//   trends: [...],
//   insights: [...],
//   topPerformers: { agents: [...], domains: [...] }
// }
```

## Development

### Setup

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint

# Type checking
npm run typecheck
```

### Building

```bash
# Build for production
npm run build

# Start production server
npm run start
```

## Integration with Other Services

The Memory Persistence Service integrates with:

1. **DSPy Service**: Stores systematic prompt optimization results
2. **LoRA Service**: Tracks model training history and performance
3. **Knowledge Graph Service**: Synchronizes business entity relationships
4. **All AI Agents**: Provides unified memory and learning capabilities

### WebSocket Events

```javascript
// Connect to sync WebSocket
const ws = new WebSocket('ws://localhost:8009/ws');

// Identify service
ws.send(JSON.stringify({
  type: 'identify',
  serviceId: 'my-service',
  capabilities: ['memory', 'learning']
}));

// Listen for sync events
ws.on('message', (data) => {
  const event = JSON.parse(data);
  if (event.type === 'sync') {
    handleSyncEvent(event);
  }
});
```

## Performance Considerations

1. **Memory Tiering**: Automatically moves data between hot/warm/cold storage
2. **Batch Processing**: Sync operations are batched for efficiency
3. **Caching**: Frequently accessed data is cached in Redis
4. **Indexing**: Proper database indexes for query performance
5. **Connection Pooling**: Efficient database connection management

## Security

- JWT-based authentication
- Role-based access control
- Data encryption at rest and in transit
- Audit logging for all operations
- Input validation and sanitization

## Monitoring

The service exposes metrics for:
- Memory storage and retrieval performance
- Learning event processing rates
- Analytics query performance
- Sync queue sizes and latency
- Storage tier distribution

Use Prometheus/Grafana for monitoring these metrics.

## License

Copyright © 2024 Fine Print AI. All rights reserved.