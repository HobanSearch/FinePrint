# Fine Print AI WebSocket Service

Enterprise-grade WebSocket service for Fine Print AI with Socket.io, Redis clustering, and comprehensive message queuing.

## Features

- **Socket.io v4** with modern WebSocket support
- **Redis clustering** for horizontal scaling
- **JWT authentication** with role-based access control
- **Message queuing** for offline users with Bull queues
- **Rate limiting** with configurable rules
- **Real-time metrics** and monitoring
- **Graceful shutdown** and error handling
- **Comprehensive logging** and observability
- **Health checks** for Kubernetes deployment
- **Production-ready** security measures

## Architecture

### Core Components

1. **WebSocket Service** - Main Socket.io server with Redis adapter
2. **Connection Manager** - Tracks user connections and rooms
3. **Message Queue Service** - Handles offline message delivery
4. **Authentication Service** - JWT validation and authorization
5. **Rate Limiter** - Prevents abuse with configurable limits
6. **Metrics Service** - Collects and exposes metrics

### Message Types

- `analysis_progress` - Real-time analysis updates
- `analysis_complete` - Analysis completion notifications
- `document_change` - Document modification alerts
- `notification` - General user notifications
- `system_alert` - System-wide announcements
- `user_presence` - User online/offline status
- `queue_stats` - Queue statistics for admins

## Getting Started

### Prerequisites

- Node.js 20+
- Redis 7.2+
- Docker & Docker Compose (optional)

### Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start development server
npm run dev

# Or using Docker Compose
docker-compose up
```

### Configuration

Environment variables:

```bash
NODE_ENV=production
PORT=8080
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=https://app.fineprintai.com
MAX_CONNECTIONS=10000
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=60
```

## API Endpoints

### Health Checks

- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health status
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe

### Metrics

- `GET /metrics/prometheus` - Prometheus format metrics
- `GET /metrics/snapshot` - JSON metrics snapshot
- `GET /metrics/counter/:name` - Specific counter value
- `GET /metrics/gauge/:name` - Specific gauge value
- `GET /metrics/histogram/:name` - Histogram statistics

### Admin Endpoints

- `GET /admin/connections` - Connection statistics
- `GET /admin/queues` - Message queue status
- `POST /admin/alert` - Send system alerts
- `DELETE /admin/queues/user/:userId` - Clear user queue

### WebSocket Management

- `POST /ws/send/:userId` - Send message to user
- `POST /ws/send/bulk` - Send bulk messages
- `POST /ws/broadcast` - Broadcast to all users
- `GET /ws/status/:userId` - User connection status
- `GET /ws/queue/:userId` - User message queue

## WebSocket Events

### Client → Server

- `ping` - Heartbeat ping
- `subscribe` - Subscribe to channels
- `unsubscribe` - Unsubscribe from channels
- `request_analysis_status` - Get analysis status
- `request_queue_stats` - Get queue statistics

### Server → Client

- `connected` - Connection acknowledgment
- `pong` - Heartbeat response
- `analysis_progress` - Analysis progress updates
- `analysis_complete` - Analysis completion
- `document_change` - Document modifications
- `notification` - User notifications
- `system_alert` - System alerts
- `error` - Error messages

## Usage Examples

### Connecting to WebSocket

```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:8080', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket']
});

socket.on('connected', (data) => {
  console.log('Connected:', data);
});

socket.on('notification', (notification) => {
  console.log('New notification:', notification);
});
```

### Subscribing to Channels

```javascript
// Subscribe to analysis updates
socket.emit('subscribe', {
  channels: ['analysis:123', 'document:456']
});

// Listen for analysis progress
socket.on('analysis_progress', (progress) => {
  console.log(`Analysis ${progress.payload.analysisId}: ${progress.payload.percentage}%`);
});
```

### Sending Messages via API

```bash
# Send notification to user
curl -X POST http://localhost:8080/ws/send/user123 \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "notification",
    "payload": {
      "title": "Analysis Complete",
      "message": "Your document analysis is ready"
    },
    "priority": "high"
  }'

# Broadcast system alert
curl -X POST http://localhost:8080/ws/broadcast \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "maintenance",
    "payload": {
      "title": "Scheduled Maintenance",
      "message": "System will be down for 30 minutes"
    }
  }'
```

## Scaling & Deployment

### Horizontal Scaling

The service supports horizontal scaling through Redis clustering:

```yaml
# docker-compose.yml for scaling
services:
  websocket-service:
    image: fineprintai/websocket-service
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis-cluster:6379
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: websocket-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: websocket-service
  template:
    metadata:
      labels:
        app: websocket-service
    spec:
      containers:
      - name: websocket-service
        image: fineprintai/websocket-service:latest
        ports:
        - containerPort: 8080
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: websocket-secrets
              key: jwt-secret
        livenessProbe:
          httpGet:
            path: /health/live
            port: 8080
          initialDelaySeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 8080
          initialDelaySeconds: 5
```

### Load Balancing

Configure load balancer for sticky sessions or use Redis adapter for session sharing:

```nginx
upstream websocket_backend {
    ip_hash;  # Enable sticky sessions
    server websocket-service-1:8080;
    server websocket-service-2:8080;
    server websocket-service-3:8080;
}

server {
    location / {
        proxy_pass http://websocket_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Monitoring & Observability

### Metrics

The service exports metrics in Prometheus format:

- Connection metrics (active connections, connection events)
- Message metrics (sent, received, queued, failed)
- Queue metrics (waiting, active, completed, failed jobs)
- System metrics (memory, CPU, uptime)
- Rate limiting metrics (allowed, blocked requests)

### Logging

Structured logging with correlation IDs:

```json
{
  "level": "info",
  "message": "User connected via WebSocket",
  "userId": "user123",
  "socketId": "abc123",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "req-123"
}
```

### Health Checks

Multiple health check endpoints for different use cases:

- `/health` - Basic health check
- `/health/detailed` - Full dependency health
- `/health/ready` - Kubernetes readiness
- `/health/live` - Kubernetes liveness

## Security

### Authentication

JWT-based authentication with support for:

- User ID and email verification
- Role-based access control
- Team-based permissions
- Token revocation/blacklisting

### Rate Limiting

Configurable rate limiting rules:

- Per-user message limits
- Per-IP connection limits
- Event-specific limits
- Premium user tiers

### Security Headers

Comprehensive security headers:

- CORS with configurable origins
- Content Security Policy
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy

## Testing

### Unit Tests

```bash
npm test
```

### Load Testing

```bash
# Using Artillery
npm run test:load

# Or with Docker
docker-compose run artillery artillery run /tests/websocket-load-test.yml
```

### WebSocket Testing

Test WebSocket functionality:

```bash
curl -X POST http://localhost:8080/ws/test \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"testType": "ping"}'
```

## Development

### Project Structure

```
src/
├── index.ts                 # Main server entry point
├── plugins.ts              # Fastify plugins setup
├── routes/                 # HTTP API routes
│   ├── health.ts
│   ├── metrics.ts
│   ├── admin.ts
│   └── websocket.ts
└── services/               # Core services
    ├── websocketService.ts # Main WebSocket service
    ├── connectionManager.ts # Connection tracking
    ├── messageQueueService.ts # Message queuing
    ├── authService.ts      # Authentication
    ├── rateLimiter.ts     # Rate limiting
    └── metricsService.ts  # Metrics collection
```

### Development Commands

```bash
npm run dev          # Start development server
npm run dev:debug    # Start with debugging
npm run build        # Build for production
npm run start        # Start production server
npm run test         # Run tests
npm run test:watch   # Watch mode testing
npm run lint         # Lint code
npm run type-check   # Type checking
```

## Troubleshooting

### Common Issues

1. **Connection refused**
   - Check Redis connectivity
   - Verify JWT secret configuration
   - Ensure port is not blocked

2. **High memory usage**
   - Monitor message queue size
   - Check for connection leaks
   - Review metrics retention

3. **Authentication failures**
   - Verify JWT secret matches
   - Check token expiration
   - Validate user permissions

### Debug Mode

Enable debug logging:

```bash
DEBUG=websocket* npm run dev
```

### Performance Tuning

- Adjust Redis connection pool size
- Configure message queue concurrency
- Tune rate limiting thresholds
- Optimize metric collection intervals

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run linting and tests
6. Submit a pull request

## License

MIT License - see LICENSE file for details.