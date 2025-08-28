# Privacy Scoring Service

An automated privacy scoring pipeline that analyzes the Top 50 websites' privacy policies and terms of service, generating A-F grades based on comprehensive pattern detection and privacy practices evaluation.

## Features

- **Automated Analysis**: Weekly automated runs for all Top 50 websites
- **Real-time Updates**: Daily change detection for document updates
- **Comprehensive Scoring**: Multi-factor scoring algorithm (0-100 scale, A-F grades)
- **Pattern Detection**: Integration with document analysis engine for 50+ problematic patterns
- **Knowledge Graph**: Neo4j storage for relationships and trending analysis
- **Shareable Score Cards**: Image generation for social media sharing
- **Webhook Notifications**: Real-time alerts for score changes
- **Performance Optimized**: Process all 50 sites within 1 hour

## Architecture

### Components

1. **Document Fetcher**: Retrieves and caches privacy policies and terms of service
2. **Scoring Algorithm**: Calculates privacy scores based on:
   - Pattern Detection (50%)
   - Data Collection Practices (20%)
   - User Rights & Controls (20%)
   - Transparency & Clarity (10%)
3. **Job Scheduler**: Manages automated runs using BullMQ
4. **Score Card Generator**: Creates shareable visual score cards
5. **Neo4j Service**: Stores relationships and enables trending analysis
6. **Webhook Service**: Sends notifications for significant changes

### Data Flow

```
Website URLs → Document Fetcher → Document Analysis Service → Scoring Algorithm → Database Storage
                     ↓                                             ↓
                   Cache                                    Neo4j Knowledge Graph
                                                                   ↓
                                                           Score Card Generator
                                                                   ↓
                                                           API Endpoints → Clients
```

## API Endpoints

### Scores
- `GET /scores/:websiteId` - Get current score for a website
- `GET /scores` - List all scores with filtering and pagination
- `POST /scores/compare` - Compare multiple websites
- `GET /scores/trending/:trend` - Get trending websites (improving/declining)
- `GET /scores/category/:category` - Get category rankings
- `GET /scores/:websiteId/history` - Get scoring history

### Score Cards
- `POST /score-cards/:websiteId` - Generate a new score card
- `GET /score-cards/:shareableUrl` - Get score card by shareable URL

### Other
- `GET /patterns/stats` - Get pattern detection statistics
- `POST /trigger/:websiteId` - Manually trigger scoring for a website
- `GET /queue/stats` - Get job queue statistics
- `GET /health` - Health check endpoint

## Setup

### Prerequisites
- Node.js 20 LTS
- PostgreSQL 16
- Redis 7.2
- Neo4j 5.x
- Document Analysis Service running

### Installation

```bash
# Install dependencies
npm install

# Setup database
npx prisma migrate dev

# Start development server
npm run dev

# Start worker process
npm run worker:dev
```

### Environment Variables

```env
# Server
PORT=3007
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fineprint

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=7

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password

# Document Analysis
DOCUMENT_ANALYSIS_URL=http://document-analysis:3003

# Scheduling (cron expressions)
WEEKLY_CRON=0 0 * * 0
DAILY_CRON=0 2 * * *

# Worker
WORKER_CONCURRENCY=5
```

## Scoring Algorithm Details

### Pattern Detection (50%)
- Analyzes detected patterns from document analysis
- Weighted by severity (critical, high, medium, low)
- Higher impact patterns reduce score more significantly

### Data Collection (20%)
- Evaluates data minimization practices
- Checks for third-party sharing
- Analyzes tracking and advertising policies

### User Rights (20%)
- Right to delete data
- Data portability
- Opt-out mechanisms
- GDPR/CCPA compliance

### Transparency (10%)
- Document readability
- Clear section headers
- Contact information availability
- Update date visibility

## Performance

- Concurrent processing of 5 websites
- 5-minute timeout per website
- Document caching reduces redundant fetches
- Redis caching for API responses
- Optimized for <5 second response times

## Monitoring

The service provides comprehensive monitoring through:
- Prometheus metrics
- Structured logging with Pino
- Job queue statistics
- Health check endpoints

## Development

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
```

### Docker
```bash
docker build -t privacy-scoring .
docker run -p 3007:3007 privacy-scoring
```

## License

Proprietary - Fine Print AI