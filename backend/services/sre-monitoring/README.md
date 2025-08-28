# Fine Print AI - SRE Monitoring Service

Comprehensive Site Reliability Engineering monitoring and incident response system ensuring 99.9% uptime for Fine Print AI platform.

## Features

### 🎯 Core Capabilities
- **99.9% Uptime Target** with automated incident response
- **<1 minute detection time** for critical issues
- **80% auto-remediation rate** for common problems
- **Full observability stack** with metrics, logs, and traces
- **Proactive chaos engineering** for resilience testing

### 📊 Observability Stack
- **Prometheus**: Metrics collection and aggregation
- **Grafana**: Dashboard visualization and analytics
- **Jaeger**: Distributed tracing for request flows
- **Loki**: Centralized log aggregation
- **Custom Fine Print AI metrics** for ML model performance

### 🚨 Incident Management
- **PagerDuty integration** for alerting
- **Automated runbooks** for common issues
- **Blameless post-mortems** with action tracking
- **On-call rotation** management
- **MTTR tracking** and optimization

### 🔬 Chaos Engineering
- **Litmus chaos experiments** for controlled failures
- **Network failure simulations**
- **Resource starvation tests**
- **Dependency failure scenarios**
- **Game day planning** and execution

### 📈 Capacity Planning
- **7-day resource forecasting** with ML predictions
- **Auto-scaling recommendations**
- **Cost optimization insights**
- **GPU resource management**
- **Capacity breach predictions**

### 🎯 SLO Management
- **Service Level Indicators** (availability, latency, error rate)
- **Error budget tracking** and burn rate alerts
- **Multi-window burn rate** detection
- **SLA compliance reporting**
- **Automated SLO violation alerts**

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     SRE Monitoring Service                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Metrics    │  │   Tracing    │  │   Logging    │      │
│  │  Collector   │  │   (Jaeger)   │  │    (Loki)    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           │                                  │
│  ┌──────────────────────────────────────────────────┐       │
│  │              Observability Pipeline               │       │
│  └──────────────────────────────────────────────────┘       │
│                           │                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     SLO      │  │   Incident   │  │   Alerting   │      │
│  │   Manager    │  │   Manager    │  │    Engine    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    Health    │  │    Chaos     │  │   Capacity   │      │
│  │   Checker    │  │   Engineer   │  │    Planner   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 20 LTS
- Docker & Docker Compose
- Kubernetes cluster (for production)
- PostgreSQL 16
- Redis 7.2

### Installation

```bash
# Clone the repository
cd backend/services/sre-monitoring

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Start development environment
docker-compose up -d

# Run the service
npm run dev
```

### Production Deployment

```bash
# Build Docker image
docker build -t fineprint/sre-monitoring:latest .

# Deploy to Kubernetes
kubectl apply -f k8s/

# Verify deployment
kubectl get pods -n fineprint -l app=sre-monitoring
```

## API Endpoints

### Health & Metrics
- `GET /health` - Basic health check
- `GET /health/live` - Liveness probe
- `GET /health/ready` - Readiness probe
- `GET /metrics` - Prometheus metrics

### SLO Management
- `GET /api/slo/status` - Current SLO compliance
- `GET /api/slo/report/:service` - Service SLO report

### Incident Management
- `GET /api/incidents` - List incidents
- `POST /api/incidents` - Create incident
- `POST /api/incidents/:id/acknowledge` - Acknowledge incident
- `POST /api/incidents/:id/resolve` - Resolve incident

### Alerting
- `GET /api/alerts` - List active alerts
- `POST /api/alerts` - Create manual alert
- `POST /api/alerts/silence` - Create silence

### Chaos Engineering
- `GET /api/chaos/experiments` - List experiments
- `POST /api/chaos/experiments/:id/run` - Run experiment
- `POST /api/chaos/gamedays` - Schedule game day

### Capacity Planning
- `GET /api/capacity/services` - Service capacity status
- `GET /api/capacity/forecasts` - Resource forecasts
- `GET /api/capacity/recommendations` - Scaling recommendations

### Dashboard
- `GET /api/dashboard` - Consolidated dashboard data
- `WS /ws/events` - Real-time event stream

## Configuration

### Service Configuration
```yaml
# config/sre.yaml
slo:
  uptimeTarget: 0.999          # 99.9%
  latencyP95Target: 100         # 100ms
  errorRateTarget: 0.001        # 0.1%
  errorBudgetWindow: 2592000000 # 30 days

alerting:
  channels:
    - pagerduty
    - slack
    - email
  deduplicationWindow: 300000   # 5 minutes
  
chaos:
  enabled: true
  dryRun: false
  interval: 86400000            # Daily
  maxConcurrentExperiments: 2
```

### Monitoring Services
```yaml
monitoring:
  services:
    - name: model-management
      criticality: critical
      slo:
        availability: 0.999
        latencyP95: 100
        errorRate: 0.001
```

## Runbooks

### High Error Rate
1. Check error logs for patterns
2. Verify recent deployments
3. Check service dependencies
4. Rollback if necessary
5. Verify resolution

### Model Inference Failure
1. Check model health status
2. Verify GPU resources
3. Check model memory usage
4. Restart model server
5. Fallback to backup model

### Database Connection Pool Exhaustion
1. Check connection pool status
2. Identify long-running queries
3. Kill idle connections
4. Increase pool size temporarily
5. Restart affected services

## Metrics

### Key Performance Indicators
- **Uptime**: Target 99.9%
- **MTTR**: Target <30 minutes
- **MTBF**: Target >7 days
- **Error Budget Remaining**: Track monthly
- **Auto-remediation Rate**: Target 80%

### Custom Metrics
- `model_inference_latency_seconds` - Model inference time
- `document_processing_rate` - Documents per second
- `error_budget_burn_rate` - Budget consumption rate
- `slo_compliance_percentage` - SLO achievement

## Development

### Running Tests
```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage report
npm run test:coverage
```

### Adding New Experiments
```typescript
// src/chaos/experiments/new-experiment.ts
export const newExperiment: ChaosExperiment = {
  name: 'new-failure-mode',
  type: 'custom',
  hypothesis: 'System handles X gracefully',
  // ... configuration
};
```

### Creating Dashboards
```typescript
// src/dashboards/custom.ts
export const customDashboard: GrafanaDashboard = {
  title: 'Custom Metrics',
  panels: [
    // ... panel definitions
  ],
};
```

## Troubleshooting

### Common Issues

**Metrics not appearing**
- Check Prometheus targets: http://localhost:9091/targets
- Verify service discovery configuration
- Check network connectivity

**Alerts not firing**
- Verify alert rules in Prometheus
- Check Alertmanager configuration
- Review silence rules

**Chaos experiments failing**
- Ensure proper RBAC permissions
- Check target service selectors
- Verify rollback mechanisms

## Contributing

1. Follow the established patterns
2. Add comprehensive tests
3. Update runbooks for new failure modes
4. Document new metrics and alerts
5. Test chaos experiments in staging

## License

Proprietary - Fine Print AI

## Support

- Internal Wiki: https://wiki.fineprint.ai/sre
- On-Call: #sre-oncall in Slack
- Issues: https://github.com/fineprint/sre-monitoring/issues