# Fine Print AI Gateway Service

Enterprise-grade API Gateway built on Kong with custom plugins, comprehensive monitoring, and production-ready infrastructure.

## Overview

The Gateway Service provides:

- **Kong API Gateway** with declarative configuration
- **JWT Authentication** with subscription tier enforcement
- **Advanced Rate Limiting** with Redis backend
- **Circuit Breaker** patterns for resilience
- **Health Monitoring** with real-time status tracking
- **Security Hardening** with CORS, headers, and bot protection
- **Auto-scaling** with Kubernetes HPA
- **Infrastructure as Code** with Terraform

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │  Kong Gateway   │    │ Backend Services │
│      (AWS NLB)  │───▶│   (3 replicas)  │───▶│    (Multiple)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │ Redis Cluster   │
                       │ (Rate Limiting) │
                       └─────────────────┘
```

## Features

### 🔐 Authentication & Authorization
- JWT token validation with tier-based access control
- Refresh token handling with automatic rotation
- Session management with Redis storage
- IP-based access control for admin endpoints

### 🚦 Rate Limiting
- Subscription tier-based rate limits:
  - **Free**: 10/min, 100/hour, 500/day
  - **Starter**: 50/min, 1K/hour, 10K/day
  - **Professional**: 200/min, 5K/hour, 50K/day
  - **Team**: 500/min, 10K/hour, 100K/day
  - **Enterprise**: 1K/min, 20K/hour, 200K/day

### 🛡️ Security
- CORS configuration with domain whitelisting
- Security headers (HSTS, CSP, X-Frame-Options)
- Bot detection and protection
- Request size limiting (50MB for document uploads)
- SSL/TLS termination with certificate management

### 📊 Monitoring & Observability
- Prometheus metrics collection
- Health checks with detailed service status
- Distributed tracing with Zipkin
- Centralized logging with Loki
- Real-time alerting

### 🔄 Resilience
- Circuit breaker patterns with Redis state management
- Automatic failover and recovery
- Graceful degradation
- Request retries and timeouts

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Kubernetes cluster (for production)
- Terraform (for infrastructure)
- Node.js 20+ (for development)

### Development Setup

1. **Start services with Docker Compose:**
   ```bash
   cd backend/services/gateway
   docker-compose up -d
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Test the gateway:**
   ```bash
   curl http://localhost:8000/health
   ```

### Production Deployment

1. **Build and push Docker images:**
   ```bash
   npm run docker:build
   docker push fineprintai/gateway:latest
   ```

2. **Deploy infrastructure with Terraform:**
   ```bash
   cd terraform
   terraform init
   terraform plan
   terraform apply
   ```

3. **Deploy to Kubernetes:**
   ```bash
   kubectl apply -f k8s/
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment (development/production) | development |
| `KONG_ADMIN_URL` | Kong Admin API URL | http://localhost:8001 |
| `REDIS_URL` | Redis connection URL | redis://localhost:6379 |
| `METRICS_PORT` | Prometheus metrics port | 9090 |
| `LOG_LEVEL` | Logging level | info |

### Kong Configuration

Kong is configured declaratively via `/kong/kong.yml`. Key configurations:

- **Services**: Backend microservice definitions
- **Routes**: API endpoint routing rules  
- **Consumers**: Subscription tier definitions
- **Plugins**: Security, rate limiting, monitoring plugins

### Custom Plugins

#### 1. Custom Auth Plugin (`custom-auth`)
- JWT validation with subscription tier enforcement
- Redis-backed session management
- Rate limiting by tier
- Audit logging

#### 2. Circuit Breaker Plugin (`custom-circuit-breaker`)
- Redis-backed state management
- Configurable failure thresholds
- Automatic recovery mechanisms
- Fallback response handling

## API Endpoints

### Health Check Service

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Basic health status |
| `/health/ready` | GET | Readiness probe (K8s) |
| `/health/live` | GET | Liveness probe (K8s) |
| `/health/detailed` | GET | Detailed component status |

### Kong Admin (Internal)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/services` | GET | List all services |
| `/admin/routes` | GET | List all routes |
| `/admin/consumers` | GET | List all consumers |
| `/admin/plugins` | GET | List all plugins |

### Metrics

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/metrics` | GET | Prometheus metrics |
| `/metrics/kong` | GET | Kong-specific metrics |

## Monitoring

### Key Metrics

- **Request Rate**: Requests per second by service/route
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: HTTP 4xx/5xx error percentages
- **Circuit Breaker**: State changes and failure rates
- **Rate Limiting**: Limit hits and rejections

### Alerts

- High error rate (>5% for 5 minutes)
- High response time (P95 >2s for 5 minutes)
- Circuit breaker opened
- Service unavailable
- Rate limit threshold exceeded

### Dashboards

Grafana dashboards available for:
- Gateway Overview
- Service Health
- Rate Limiting Analysis
- Security Events
- Performance Metrics

## Security

### Best Practices

1. **JWT Secrets**: Rotate regularly, use strong entropy
2. **Rate Limits**: Adjust based on traffic patterns
3. **IP Restrictions**: Limit admin access to trusted networks
4. **SSL/TLS**: Use valid certificates, enforce HTTPS
5. **Headers**: Configure CSP and security headers
6. **Monitoring**: Enable audit logging and alerting

### Compliance

- **GDPR**: Request logging with PII masking
- **SOC 2**: Audit trails and access controls
- **OWASP**: Top 10 security controls implemented

## Scaling

### Horizontal Scaling

Kong Gateway supports horizontal scaling:

```yaml
# Kubernetes HPA
spec:
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

### Performance Tuning

- **Worker Processes**: Set to CPU core count
- **Connection Limits**: Tune for expected load
- **Memory Cache**: Optimize for hit ratio
- **Upstream Timeouts**: Balance responsiveness vs reliability

## Troubleshooting

### Common Issues

1. **503 Service Unavailable**
   - Check upstream service health
   - Verify Kong configuration
   - Check circuit breaker status

2. **429 Too Many Requests**
   - Review rate limit configuration
   - Check Redis connectivity
   - Analyze traffic patterns

3. **JWT Authentication Errors**
   - Verify JWT secret configuration
   - Check token expiration
   - Validate consumer configuration

### Debugging Commands

```bash
# Check Kong status
kubectl exec -it kong-gateway-xxx -- kong health

# View Kong configuration
kubectl exec -it kong-gateway-xxx -- kong config parse /etc/kong/declarative/kong.yml

# Check Redis connectivity
kubectl exec -it kong-gateway-xxx -- redis-cli -h redis-gateway ping

# View health service logs
kubectl logs -f kong-gateway-xxx -c health-service

# Check circuit breaker status
curl http://localhost:8003/admin/circuit-breakers
```

### Log Analysis

Use structured logging for debugging:

```bash
# Filter by service
kubectl logs -f kong-gateway-xxx | jq 'select(.service=="analysis-service")'

# Filter by error level
kubectl logs -f kong-gateway-xxx | jq 'select(.level=="error")'

# Check rate limiting events
kubectl logs -f kong-gateway-xxx | jq 'select(.plugin=="rate-limiting")'
```

## Development

### Adding Custom Plugins

1. Create plugin directory:
   ```bash
   mkdir -p kong/plugins/my-plugin
   ```

2. Implement handler and schema:
   ```lua
   -- kong/plugins/my-plugin/handler.lua
   local MyPluginHandler = {}
   -- Implementation here
   return MyPluginHandler
   ```

3. Update Kong configuration:
   ```yaml
   plugins: bundled,my-plugin
   ```

### Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Load testing
npm run test:load

# Security testing
npm run test:security
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

Copyright (c) 2024 Fine Print AI. All rights reserved.

## Support

For support, please contact:
- Email: support@fineprintai.com
- Slack: #infrastructure
- Documentation: https://docs.fineprintai.com/gateway