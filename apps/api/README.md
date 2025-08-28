# Fine Print AI - API Gateway

A production-ready Node.js/Fastify microservices API gateway for the Fine Print AI document analysis platform.

## Architecture Overview

This API gateway implements a comprehensive microservices architecture with:

### Core Services
- **Analysis Service**: Document processing and AI-powered analysis
- **User Service**: Authentication, user management, and preferences
- **Monitoring Service**: Real-time change detection and alerting
- **Notification Service**: Multi-channel notification delivery
- **Action Service**: Template management and action tracking

### Technology Stack
- **Framework**: Fastify with TypeScript
- **Databases**: PostgreSQL + Redis + Qdrant (vector database)
- **AI Integration**: Ollama LLM for document analysis
- **Authentication**: JWT with refresh tokens
- **Real-time**: WebSocket support
- **Documentation**: Swagger/OpenAPI 3.0
- **Monitoring**: Prometheus metrics + health checks
- **Security**: Helmet.js, rate limiting, CORS protection

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL, Redis, Qdrant, and Ollama services running

### Development Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env.dev
   # Edit .env.dev with your configuration
   ```

3. **Start development server**:
   ```bash
   npm run dev
   ```

4. **Access services**:
   - API: http://localhost:8000
   - Documentation: http://localhost:8000/docs
   - Health: http://localhost:8000/health
   - Metrics: http://localhost:8000/metrics
   - WebSocket: ws://localhost:8000/ws

### Docker Setup

1. **Build image**:
   ```bash
   docker build -t fineprintai-api .
   ```

2. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User authentication
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/logout` - User logout

### User Management
- `GET /api/user/profile` - Get user profile

### Document Analysis
- `GET /api/analysis` - List analyses (with pagination)
- `GET /api/analysis/:id` - Get specific analysis
- `POST /api/analysis` - Start new analysis
- `POST /api/documents/upload` - Upload document

### AI Integration
- `GET /api/ollama/models` - List available LLM models
- `POST /api/ollama/generate` - Generate text using Ollama

### Monitoring
- `GET /health` - Basic health check
- `GET /ready` - Comprehensive readiness check
- `GET /api/monitoring/stats` - System statistics
- `GET /metrics` - Prometheus metrics

### Real-time
- `WebSocket /ws` - Real-time updates and notifications

## Configuration

### Environment Variables

```bash
# Server Configuration
NODE_ENV=development
API_PORT=8000
API_HOST=0.0.0.0
LOG_LEVEL=debug

# Database Configuration
DATABASE_URL=postgresql://postgres:password@postgres:5432/fineprintai
REDIS_URL=redis://redis:6379
QDRANT_URL=http://qdrant:6333

# AI Configuration
OLLAMA_URL=http://ollama:11434

# Security
JWT_SECRET=your-jwt-secret
JWT_REFRESH_SECRET=your-refresh-secret
ENCRYPTION_KEY=your-32-char-encryption-key

# Features
ENABLE_DOCUMENT_PROCESSING=true
ENABLE_AI_ANALYSIS=true
ENABLE_REAL_TIME_MONITORING=true
ENABLE_METRICS=true

# Rate Limiting
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_WINDOW=3600

# CORS
CORS_ORIGINS=http://localhost:3003,http://localhost:3001
```

## Database Connections

The API automatically establishes connections to:

1. **PostgreSQL**: Primary database for structured data
2. **Redis**: Caching and session storage
3. **Qdrant**: Vector database for AI embeddings
4. **Ollama**: LLM service for document analysis

All connections include:
- Connection pooling
- Automatic reconnection
- Health monitoring
- Graceful shutdown

## Security Features

### Authentication & Authorization
- JWT tokens with expiration
- Refresh token rotation
- Role-based access control
- Token blacklisting support

### Security Middleware
- Helmet.js for security headers
- Rate limiting by IP/user
- CORS protection
- Input validation and sanitization
- Request/response logging

### Monitoring & Observability
- Structured logging with Pino
- Prometheus metrics collection
- Request tracing with correlation IDs
- Error tracking and alerting
- Performance monitoring

## WebSocket Support

Real-time features include:
- Analysis progress updates
- Document change notifications
- System alerts and warnings
- Live collaboration features

### WebSocket Message Types
```json
// Subscribe to analysis updates
{
  "type": "subscribe",
  "analysisId": "analysis_123"
}

// Ping/Pong for connection health
{
  "type": "ping"
}
```

## Health Checks

### Basic Health Check (`/health`)
Returns server status, uptime, and basic metrics.

### Readiness Check (`/ready`)
Comprehensive check including:
- Database connectivity
- Redis connectivity
- Qdrant vector DB status
- Ollama LLM service status
- Service-specific health metrics

## Metrics & Monitoring

### Prometheus Metrics
- `fineprintai_requests_total` - Total requests
- `fineprintai_errors_total` - Total errors
- `fineprintai_request_duration_ms` - Request latency
- `fineprintai_connections_active` - Active WebSocket connections
- `fineprintai_db_queries_total` - Database queries
- `fineprintai_cache_hits_total` - Cache hits/misses
- `fineprintai_memory_usage_bytes` - Memory usage
- `fineprintai_uptime_seconds` - Process uptime

### System Statistics
Available at `/api/monitoring/stats`:
- Request metrics
- Error rates
- Average latency
- Active connections
- Database query counts
- Memory usage details

## Error Handling

Comprehensive error handling includes:
- Structured error responses
- Request correlation IDs
- Detailed logging
- Graceful degradation
- Circuit breaker patterns

### Error Response Format
```json
{
  "error": {
    "message": "Error description",
    "statusCode": 400,
    "reqId": "req_123456",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Development

### Scripts
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production bundle
- `npm start` - Start production server
- `npm run test` - Run test suite (when implemented)

### Project Structure
```
src/
├── server.ts           # Main server file
├── routes/            # API route handlers
├── services/          # Business logic services
├── middleware/        # Custom middleware
├── types/            # TypeScript type definitions
└── utils/            # Utility functions
```

## Production Deployment

### Docker
- Multi-stage build for optimization
- Non-root user for security
- Health checks configured
- Proper signal handling

### Performance
- Connection pooling
- Request/response compression
- Caching strategies
- Load balancing ready

### Monitoring
- Structured logging
- Metrics collection
- Health checks
- Graceful shutdown

## Contributing

1. Follow TypeScript best practices
2. Add comprehensive error handling
3. Include appropriate logging
4. Update documentation
5. Add tests for new features

## Support

For questions and support:
- Documentation: `/docs` endpoint
- Health Status: `/health` and `/ready` endpoints
- Logs: Check application logs for detailed error information