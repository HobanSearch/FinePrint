# Fine Print AI - Kubernetes Infrastructure

This directory contains comprehensive Kubernetes infrastructure configurations for the Fine Print AI platform, supporting multi-environment deployments with enterprise-grade security, monitoring, and scalability.

## Architecture Overview

The infrastructure is designed with the following principles:
- **Multi-environment support**: Production, Staging, and Development environments
- **Security-first approach**: Pod Security Standards, Network Policies, RBAC
- **High availability**: Auto-scaling, load balancing, health checks
- **Comprehensive monitoring**: Prometheus, Grafana, Loki, Jaeger
- **GitOps ready**: Kustomize overlays for environment-specific configurations

## Directory Structure

```
kubernetes/
├── base/                           # Base Kubernetes manifests
│   ├── namespace.yaml             # Multi-environment namespaces
│   ├── configmap.yaml             # Application configuration
│   ├── secrets.yaml               # Secret templates (use external secrets in prod)
│   ├── rbac.yaml                  # Service accounts and RBAC
│   ├── storage.yaml               # Storage classes and PVCs
│   ├── pod-security.yaml          # Pod Security Standards and quotas
│   ├── network-policies.yaml      # Network segmentation policies
│   ├── deployments.yaml           # Application deployments
│   ├── statefulsets.yaml          # Database and persistent services
│   ├── services.yaml              # Service definitions
│   ├── ingress.yaml               # Ingress with SSL/TLS termination
│   ├── autoscaling.yaml           # HPA, VPA, and PDB configurations
│   └── monitoring-stack.yaml      # Complete monitoring infrastructure
├── environments/                   # Environment-specific overlays
│   ├── production/
│   │   ├── kustomization.yaml     # Production customizations
│   │   └── patches/               # Production-specific patches
│   ├── staging/
│   │   ├── kustomization.yaml     # Staging customizations
│   │   └── patches/               # Staging-specific patches
│   └── development/
│       ├── kustomization.yaml     # Development customizations
│       └── patches/               # Development-specific patches
├── argocd/                        # ArgoCD application configurations
└── monitoring/                    # Additional monitoring configurations
```

## Services Architecture

### Application Services
- **Analysis Service**: Core document analysis and AI processing
- **WebSocket Service**: Real-time communication and updates
- **Gateway Service**: API gateway with rate limiting and routing
- **Notification Service**: Email, push, and webhook notifications
- **Monitoring Service**: Application-level monitoring and alerting

### Infrastructure Services
- **PostgreSQL**: Primary database with replication support
- **Redis**: Caching and session storage
- **Qdrant**: Vector database for embeddings and semantic search
- **Ollama**: Local LLM inference with GPU support

### Monitoring Stack
- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **AlertManager**: Alert routing and management
- **Loki**: Log aggregation and search
- **Promtail**: Log collection agent
- **Jaeger**: Distributed tracing

## Deployment Instructions

### Prerequisites

1. **Kubernetes Cluster**: v1.24+ with the following components:
   - NGINX Ingress Controller
   - cert-manager for SSL/TLS certificates
   - Metrics Server for HPA
   - GPU support (for Ollama AI service)

2. **Required Tools**:
   ```bash
   # Install kubectl
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   
   # Install kustomize
   curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
   
   # Install helm (for additional components)
   curl https://get.helm.sh/helm-v3.13.0-linux-amd64.tar.gz | tar xz
   ```

3. **Cluster Setup**:
   ```bash
   # Install NGINX Ingress Controller
   kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/cloud/deploy.yaml
   
   # Install cert-manager
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
   
   # Install Metrics Server
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
   ```

### Environment Deployment

#### Production Deployment

1. **Prepare Secrets**:
   ```bash
   # Create production secrets (use external secret management)
   kubectl create secret generic fineprintai-secrets \\
     --from-literal=DATABASE_URL="postgresql://..." \\
     --from-literal=REDIS_URL="redis://..." \\
     --from-literal=JWT_SECRET="..." \\
     --namespace=fineprintai-prod
   ```

2. **Deploy Infrastructure**:
   ```bash
   # Deploy production environment
   kubectl apply -k environments/production/
   
   # Verify deployment
   kubectl get pods -n fineprintai-prod
   kubectl get ingress -n fineprintai-prod
   ```

3. **Configure DNS**:
   ```bash
   # Get external IP of load balancer
   kubectl get svc -n ingress-nginx ingress-nginx-controller
   
   # Point your domains to this IP:
   # app.fineprintai.com -> EXTERNAL-IP
   # api.fineprintai.com -> EXTERNAL-IP
   # ws.fineprintai.com -> EXTERNAL-IP
   ```

#### Staging Deployment

```bash
# Deploy staging environment
kubectl apply -k environments/staging/

# Verify deployment
kubectl get pods -n fineprintai-staging
```

#### Development Deployment

```bash
# Deploy development environment
kubectl apply -k environments/development/

# Port forward for local access
kubectl port-forward -n fineprintai-dev svc/analysis-service 8000:8000
kubectl port-forward -n fineprintai-dev svc/websocket-service 8001:8001
```

## Security Configuration

### Pod Security Standards
- **Production**: Restricted security profile enforced
- **Staging**: Restricted security profile enforced
- **Development**: Baseline security profile enforced
- **Monitoring**: Baseline security profile enforced

### Network Policies
- Default deny-all ingress and egress
- Explicit allow rules for required communication
- Namespace isolation between environments
- Monitoring namespace has broader access for metrics collection

### RBAC Configuration
- Principle of least privilege
- Service-specific service accounts
- Role-based access control for each component
- Separate permissions for monitoring components

### Secrets Management
- External Secrets Operator integration
- Sealed Secrets support
- Environment-specific secret isolation
- Rotation policies and audit trails

## Resource Management

### Compute Resources

| Environment | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-------------|-------------|-----------|----------------|--------------|
| Production  | 50 cores    | 100 cores | 100 GiB        | 200 GiB      |
| Staging     | 20 cores    | 40 cores  | 40 GiB         | 80 GiB       |
| Development | 10 cores    | 20 cores  | 20 GiB         | 40 GiB       |

### Storage Resources

| Service     | Production | Staging | Development |
|-------------|------------|---------|-------------|
| PostgreSQL  | 500 GiB    | 100 GiB | 20 GiB      |
| Redis       | 100 GiB    | 20 GiB  | 5 GiB       |
| Qdrant      | 200 GiB    | 50 GiB  | 10 GiB      |
| Ollama      | 1 TiB      | 200 GiB | 50 GiB      |
| Monitoring  | 500 GiB    | 100 GiB | 20 GiB      |

### Auto-scaling Configuration

#### Horizontal Pod Autoscaler (HPA)
- **Analysis Service**: 3-50 replicas (production), 1-5 replicas (staging)
- **WebSocket Service**: 2-20 replicas (production), 1-3 replicas (staging)
- **Gateway Service**: 3-15 replicas (production), 2-5 replicas (staging)

#### Vertical Pod Autoscaler (VPA)
- Enabled for StatefulSets (PostgreSQL, Redis, Qdrant)
- Automatic resource recommendation and adjustment
- Production workloads have higher resource limits

## Monitoring and Observability

### Metrics Collection
- **Prometheus**: Collects metrics from all services
- **Custom Metrics**: Application-specific business metrics
- **Infrastructure Metrics**: Node, pod, and cluster metrics
- **Alert Rules**: Comprehensive alerting for all critical conditions

### Log Aggregation
- **Loki**: Centralized log storage and querying
- **Promtail**: Log collection from all pods
- **Log Retention**: 30 days for production, 7 days for staging/dev
- **Log Parsing**: Structured logging with JSON format

### Distributed Tracing
- **Jaeger**: End-to-end request tracing
- **OpenTelemetry**: Standardized observability instrumentation
- **Performance Monitoring**: Response time and error tracking

### Dashboards and Alerting
- **Grafana**: Custom dashboards for each service
- **AlertManager**: Multi-channel alert routing
- **Runbooks**: Automated response procedures
- **SLA Monitoring**: Uptime and performance tracking

## High Availability and Disaster Recovery

### High Availability Features
- **Multi-zone deployment**: Services spread across availability zones
- **Pod Disruption Budgets**: Minimum replicas during updates
- **Health Checks**: Comprehensive liveness and readiness probes
- **Load Balancing**: Multiple replicas with intelligent routing

### Backup and Recovery
- **Database Backups**: Automated daily backups with 30-day retention
- **Configuration Backups**: GitOps approach with version control
- **Disaster Recovery**: Multi-region deployment capability
- **Recovery Testing**: Regular disaster recovery drills

## Troubleshooting Guide

### Common Issues

1. **Pod Startup Issues**:
   ```bash
   # Check pod status and logs
   kubectl get pods -n fineprintai-prod
   kubectl describe pod <pod-name> -n fineprintai-prod
   kubectl logs <pod-name> -n fineprintai-prod
   ```

2. **Service Discovery Issues**:
   ```bash
   # Check service endpoints
   kubectl get endpoints -n fineprintai-prod
   kubectl get svc -n fineprintai-prod
   ```

3. **Storage Issues**:
   ```bash
   # Check PVC status
   kubectl get pvc -n fineprintai-prod
   kubectl describe pvc <pvc-name> -n fineprintai-prod
   ```

4. **Networking Issues**:
   ```bash
   # Check network policies
   kubectl get networkpolicies -n fineprintai-prod
   kubectl describe networkpolicy <policy-name> -n fineprintai-prod
   ```

### Performance Monitoring

```bash
# Check resource usage
kubectl top pods -n fineprintai-prod
kubectl top nodes

# Check HPA status
kubectl get hpa -n fineprintai-prod
kubectl describe hpa <hpa-name> -n fineprintai-prod
```

### Log Analysis

```bash
# Query logs through Loki (if port-forwarded)
curl -G -s 'http://localhost:3100/loki/api/v1/query_range' \\
  --data-urlencode 'query={namespace="fineprintai-prod"}' \\
  --data-urlencode 'start=2024-01-01T00:00:00Z' \\
  --data-urlencode 'end=2024-01-01T23:59:59Z'
```

## Security Hardening Checklist

- [ ] Enable Pod Security Standards
- [ ] Configure Network Policies
- [ ] Implement RBAC with least privilege
- [ ] Use external secret management
- [ ] Enable audit logging
- [ ] Configure resource quotas and limits
- [ ] Implement vulnerability scanning
- [ ] Enable network encryption (TLS)
- [ ] Configure security contexts
- [ ] Regular security updates

## Maintenance Procedures

### Regular Maintenance Tasks

1. **Weekly**:
   - Review monitoring alerts and dashboards
   - Check resource utilization and scaling
   - Update security patches for base images

2. **Monthly**:
   - Review and rotate secrets
   - Update Kubernetes components
   - Backup and disaster recovery testing
   - Security vulnerability assessments

3. **Quarterly**:
   - Infrastructure capacity planning
   - Security audit and penetration testing
   - Performance optimization review
   - Documentation updates

### Update Procedures

```bash
# Update application images
kubectl set image deployment/analysis-service \\
  analysis=fineprintai/analysis-service:v1.2.4 \\
  -n fineprintai-prod

# Rolling restart for configuration changes
kubectl rollout restart deployment/analysis-service -n fineprintai-prod

# Check rollout status
kubectl rollout status deployment/analysis-service -n fineprintai-prod
```

## Cost Optimization

### Resource Optimization Strategies
- **Vertical Pod Autoscaling**: Automatic resource right-sizing
- **Cluster Autoscaling**: Node scaling based on demand
- **Spot Instances**: Use for development and staging workloads
- **Resource Quotas**: Prevent resource overconsumption
- **Efficient Storage**: Use appropriate storage classes

### Monitoring Cost Metrics
- Track resource utilization vs. requests
- Monitor unused PVCs and services
- Analyze scaling patterns for optimization
- Regular cost reporting and budgeting

## Support and Contact

For questions or issues with the Kubernetes infrastructure:
- **Documentation**: This README and inline comments
- **Monitoring**: Grafana dashboards and Prometheus alerts
- **Logs**: Centralized logging through Loki
- **Troubleshooting**: Follow the procedures in this guide

---

**Note**: This infrastructure is designed for production workloads with high availability, security, and scalability requirements. Regular maintenance and monitoring are essential for optimal performance.