# Fine Print AI - Data Aggregation Service

The Data Aggregation Service is a critical microservice that crawls popular websites for legal documents (Terms of Service, Privacy Policies), processes them through AI analysis, monitors compliance with regulations, and provides trend analysis across industries.

## Features

- **Website Crawling**: Automated crawling of 50+ popular websites
- **Document Processing**: AI-powered analysis of legal documents
- **Compliance Monitoring**: Real-time monitoring for GDPR, CCPA, COPPA violations
- **Trend Analysis**: Industry pattern detection and trending analysis
- **Public API**: RESTful endpoints for accessing aggregated data
- **Rate Limiting**: Respectful crawling with configurable delays
- **Queue Management**: Bull queue system for processing workloads
- **Real-time Alerts**: Compliance violation notifications

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Web Crawler    │───▶│  Document Queue  │───▶│  AI Processor   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Rate Limiter   │    │  Redis Queue     │    │  Ollama Models  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Compliance     │◀───│  PostgreSQL DB   │───▶│  Trend Analysis │
│  Monitor        │    │                  │    │  Engine         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env

# Start development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

### Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f data-aggregation-service

# Stop services
docker-compose down
```

## API Endpoints

### Crawling
- `POST /api/crawl/start` - Start crawling all websites
- `POST /api/crawl/website/:id` - Crawl specific website
- `GET /api/crawl/status` - Get crawling status
- `GET /api/crawl/stats` - Get crawling statistics

### Processing
- `GET /api/processing/queue-status` - Get queue status
- `POST /api/processing/retry-failed` - Retry failed jobs
- `GET /api/processing/stats` - Get processing statistics

### Compliance
- `GET /api/compliance/alerts` - Get compliance alerts
- `GET /api/compliance/scores` - Get compliance scores
- `GET /api/compliance/changes` - Get regulatory changes
- `POST /api/compliance/resolve/:alertId` - Resolve alert

### Trends
- `GET /api/trends/patterns` - Get trending patterns
- `GET /api/trends/industries` - Get industry trends
- `GET /api/trends/timeline` - Get trend timeline

### Health & Monitoring
- `GET /health` - Health check endpoint
- `GET /metrics` - Prometheus metrics

## Configuration

Key environment variables:

```bash
# Server
PORT=3005
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Crawling
RATE_LIMIT_DELAY=2000
MAX_RETRIES=3
CONCURRENT_REQUESTS=2

# AI Processing
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=llama2

# Features
ENABLE_TREND_ANALYSIS=true
ENABLE_COMPLIANCE_MONITORING=true
```

## Supported Websites

The service monitors 50+ popular websites including:

**Social Media**: Facebook, Twitter, Instagram, LinkedIn, TikTok, Snapchat, Discord
**Tech Companies**: Google, Microsoft, Apple, Amazon, Netflix, Spotify
**E-commerce**: eBay, Etsy, Shopify, Stripe, PayPal
**Communication**: Zoom, Slack, WhatsApp, Telegram
**Cloud Services**: AWS, Dropbox, GitHub, Adobe

## Compliance Monitoring

The service monitors compliance with major regulations:

- **GDPR** (EU): Data protection, consent, right to erasure
- **CCPA** (California): Consumer privacy rights, data selling
- **COPPA** (US): Children's online privacy protection
- **PIPEDA** (Canada): Personal information protection
- **LGPD** (Brazil): General data protection law
- **PDPA** (Singapore): Personal data protection act

## Performance & Scaling

- **Crawling**: 2 concurrent requests with 2-second delays
- **Processing**: 3 concurrent AI analysis jobs
- **Queue**: Bull queue with Redis backing
- **Database**: PostgreSQL with connection pooling
- **Caching**: Redis-based caching for frequently accessed data
- **Monitoring**: Prometheus metrics and health checks

## Development Guidelines

1. **Rate Limiting**: Always respect website rate limits
2. **Error Handling**: Comprehensive error handling and retry logic
3. **Logging**: Structured logging with appropriate levels
4. **Testing**: Unit and integration tests for all components
5. **Security**: Secure handling of credentials and API tokens
6. **Documentation**: Keep API documentation up to date

## Troubleshooting

### Common Issues

1. **Queue not processing**: Check Redis connection
2. **Crawling failures**: Verify website accessibility and rate limits
3. **AI processing errors**: Check Ollama service status
4. **Database errors**: Verify PostgreSQL connection and permissions

### Logs

Service logs are structured JSON format:

```json
{
  "level": "info",
  "message": "Crawl Operation",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "data-aggregation-service",
  "metadata": {
    "website": "facebook.com",
    "status": "success",
    "duration": 2500
  }
}
```

## Contributing

1. Follow TypeScript strict mode guidelines
2. Write comprehensive tests
3. Use ESLint configuration
4. Document new API endpoints
5. Update this README for new features

## License

Proprietary - Fine Print AI Team