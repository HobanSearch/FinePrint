# Fine Print AI - Infrastructure

This directory contains all infrastructure-as-code (IaC) configurations for Fine Print AI, including Kubernetes manifests, CI/CD pipelines, monitoring, and security configurations.

## Directory Structure

```
infrastructure/
├── README.md                          # This file
├── docker/                           # Docker configurations
│   ├── docker-compose.yml           # Local development environment
│   ├── docker-compose.prod.yml      # Production-like testing
│   └── dockerfiles/                 # Service-specific Dockerfiles
├── kubernetes/                      # Kubernetes manifests
│   ├── base/                        # Base configurations
│   ├── environments/                # Environment-specific overlays
│   │   ├── dev/                    # Development
│   │   ├── staging/                # Staging
│   │   └── prod/                   # Production
│   └── monitoring/                 # Monitoring stack
├── terraform/                      # Infrastructure as Code
│   ├── modules/                    # Reusable modules
│   ├── environments/               # Environment-specific configs
│   └── providers/                  # Cloud provider configs
├── helm/                          # Helm charts
│   ├── fineprintai/              # Main application chart
│   └── monitoring/                # Monitoring stack chart
├── scripts/                       # Automation scripts
│   ├── setup/                     # Environment setup
│   ├── deploy/                    # Deployment scripts
│   └── maintenance/               # Maintenance scripts
├── .github/                       # GitHub Actions workflows
│   └── workflows/                 # CI/CD pipelines
└── docs/                         # Infrastructure documentation
    ├── runbooks/                 # Operational runbooks
    ├── architecture/             # Architecture diagrams
    └── security/                 # Security documentation
```

## Quick Start

### Prerequisites

- Docker Desktop with Kubernetes enabled
- kubectl configured
- Helm 3.x installed
- Terraform >= 1.0
- Node.js 20 LTS
- Git

### Local Development Setup

1. **Clone and navigate to infrastructure**:
   ```bash
   cd infrastructure
   ```

2. **Start local development environment**:
   ```bash
   ./scripts/setup/dev-setup.sh
   ```

3. **Access services**:
   - Web App: http://localhost:3000
   - API: http://localhost:8000
   - Grafana: http://localhost:3001
   - Prometheus: http://localhost:9090

### Deployment

#### Development Environment
```bash
kubectl apply -k kubernetes/environments/dev/
```

#### Staging Environment
```bash
kubectl apply -k kubernetes/environments/staging/
```

#### Production Environment
```bash
# Requires manual approval in GitHub Actions
# Deployed via ArgoCD GitOps
```

## Architecture Overview

Fine Print AI follows a microservices architecture deployed on Kubernetes with:

- **Frontend**: React SPA with TypeScript
- **API**: Fastify Node.js backend
- **AI Engine**: Ollama cluster for local LLM inference
- **Databases**: PostgreSQL, Redis, Qdrant vector DB
- **Monitoring**: Prometheus, Grafana, Loki, Jaeger
- **Security**: RBAC, Network Policies, Pod Security Standards

## Security Features

- Multi-layer security controls
- Network isolation with policies
- Pod security standards enforcement
- Secrets management with External Secrets Operator
- Regular vulnerability scanning
- RBAC with least privilege principles

## Monitoring & Observability

- **Metrics**: Prometheus + Grafana
- **Logs**: Loki + Grafana
- **Traces**: Jaeger + OpenTelemetry
- **Alerts**: AlertManager + Slack/PagerDuty
- **Uptime**: Custom health checks

## Cost Optimization

- Horizontal Pod Autoscaling (HPA)
- Vertical Pod Autoscaling (VPA)
- Cluster Autoscaling
- Spot instance utilization
- Resource quotas and limits

## Disaster Recovery

- **RTO**: 4 hours
- **RPO**: 1 hour
- **Backups**: Automated with Velero
- **Multi-region**: Active-passive setup
- **Failover**: Automated health-based switching

## Support

For infrastructure issues:
1. Check the runbooks in `docs/runbooks/`
2. Review monitoring dashboards
3. Check recent deployment logs
4. Contact the DevOps team

## Contributing

1. Follow GitOps principles
2. Test changes in dev environment first
3. Update documentation
4. Get peer review for production changes