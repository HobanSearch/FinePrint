# Business Agents API Service

Unified API service for Fine Print AI's business agent models, providing marketing content generation, sales lead qualification, customer support responses, and business analytics.

## Features

- **Marketing Agent**: Generate marketing content (emails, blogs, social media, landing pages)
- **Sales Agent**: Qualify leads and score prospects with AI-driven insights
- **Support Agent**: Generate empathetic and helpful customer support responses
- **Analytics Agent**: Analyze business data and generate actionable insights
- **Real-time Updates**: WebSocket support for live agent updates
- **Performance Monitoring**: Comprehensive metrics and health checks
- **A/B Testing**: Built-in support for content variation testing
- **Digital Twin Testing**: Test agents in simulated environments
- **Caching**: Multi-tier caching with Redis and local cache
- **Rate Limiting**: Tier-based rate limiting for API protection

## Prerequisites

- Node.js 20+ LTS
- PostgreSQL 16+
- Redis 7.2+
- Ollama with business agent models installed

## Installation

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Build the service
npm run build
```

## Configuration

Key environment variables:

```env
# Service Configuration
PORT=3007
HOST=0.0.0.0
NODE_ENV=development

# Ollama Configuration
OLLAMA_HOST=http://localhost:11434
MARKETING_MODEL=fine-print-marketing:latest
SALES_MODEL=fine-print-sales:latest
SUPPORT_MODEL=fine-print-customer:latest
ANALYTICS_MODEL=fine-print-analytics:latest

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fineprint

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Security
JWT_SECRET=your-secret-key
CORS_ORIGINS=http://localhost:3000

# Digital Twin
DIGITAL_TWIN_URL=http://localhost:3008
```

## Running the Service

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run start

# Run tests
npm run test

# Run with Docker
docker-compose up
```

## API Endpoints

### Marketing Agent

```http
POST /api/agents/marketing/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "type": "email",
  "prompt": "Create a welcome email for new users",
  "targetAudience": "privacy-conscious businesses",
  "tone": "professional",
  "keywords": ["privacy", "security", "AI"],
  "variations": 3,
  "enableABTest": true
}
```

### Sales Agent

```http
POST /api/agents/sales/qualify
Content-Type: application/json
Authorization: Bearer <token>

{
  "lead": {
    "name": "John Doe",
    "email": "john@company.com",
    "company": "Acme Corp",
    "title": "CTO",
    "industry": "Technology",
    "companySize": "51-200",
    "source": "Website"
  },
  "criteria": {
    "budget": 50000,
    "timeline": "Q1 2024",
    "decisionMaker": true,
    "painPoints": ["manual review", "compliance"]
  }
}
```

### Support Agent

```http
POST /api/agents/support/respond
Content-Type: application/json
Authorization: Bearer <token>

{
  "ticket": {
    "subject": "Cannot access dashboard",
    "description": "I'm unable to log into my dashboard...",
    "priority": "high",
    "customer": {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "tier": "PROFESSIONAL"
    }
  },
  "responseType": "initial",
  "tone": "empathetic"
}
```

### Analytics Agent

```http
POST /api/agents/analytics/analyze
Content-Type: application/json
Authorization: Bearer <token>

{
  "dataType": "usage",
  "metrics": [
    {"name": "daily_active_users", "value": 1250, "date": "2024-01-01T00:00:00Z"},
    {"name": "documents_analyzed", "value": 5430, "date": "2024-01-01T00:00:00Z"}
  ],
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z",
    "granularity": "day"
  },
  "analysisDepth": "comprehensive"
}
```

### Performance Metrics

```http
GET /api/agents/performance?agent=marketing
Authorization: Bearer <token>
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3007/ws/agents');

ws.on('open', () => {
  // Subscribe to specific agents
  ws.send(JSON.stringify({
    type: 'subscribe',
    agents: ['marketing', 'sales']
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('Agent update:', message);
});
```

## Rate Limits

| Tier | Requests per Hour |
|------|------------------|
| FREE | 10 |
| STARTER | 100 |
| PROFESSIONAL | 1,000 |
| ENTERPRISE | 10,000 |

## Testing

```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage

# Load testing
npm run test:load
```

## Monitoring

- Health Check: `GET /health`
- Metrics Endpoint: `GET /api/agents/performance`
- WebSocket Stats: `GET /api/agents/websocket/stats`
- Swagger Documentation: `GET /documentation`

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend      │────▶│ Business     │────▶│   Ollama    │
│   Application   │     │ Agents API   │     │   Models    │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │  Redis Cache &   │
                    │  PostgreSQL DB   │
                    └──────────────────┘
```

## Performance Optimization

1. **Caching Strategy**
   - Local in-memory cache for hot data
   - Redis for distributed caching
   - TTL based on agent type and operation

2. **Connection Pooling**
   - PostgreSQL connection pooling
   - Redis connection pooling
   - HTTP keep-alive for Ollama

3. **Rate Limiting**
   - Sliding window algorithm
   - Tier-based limits
   - Per-endpoint overrides

## Security

- JWT authentication
- Rate limiting per tier
- Input validation with Zod
- SQL injection prevention with Prisma
- XSS protection with Helmet
- CORS configuration

## Troubleshooting

### Common Issues

1. **Ollama Connection Failed**
   - Ensure Ollama is running: `ollama serve`
   - Check model availability: `ollama list`
   - Verify OLLAMA_HOST configuration

2. **Rate Limit Exceeded**
   - Check user tier and limits
   - Monitor X-RateLimit headers
   - Consider upgrading tier

3. **WebSocket Connection Drops**
   - Check firewall/proxy settings
   - Verify WebSocket support
   - Monitor ping/pong messages

## License

Proprietary - Fine Print AI