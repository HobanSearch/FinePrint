# Fine Print AI - Deployment Guide

This guide covers deployment procedures for all environments: development, staging, and production.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Staging Deployment](#staging-deployment)
- [Production Deployment](#production-deployment)
- [Rollback Procedures](#rollback-procedures)
- [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

## Prerequisites

### Required Tools

- Docker Desktop with Kubernetes enabled
- kubectl v1.29+
- Helm v3.12+
- Terraform v1.5+
- Node.js 20 LTS
- Git

### Access Requirements

- GitHub repository access
- Kubernetes cluster access
- Container registry permissions (GHCR)
- Cloud provider credentials (AWS/GCP/Azure)

## Local Development

### Quick Start

1. **Clone the repository**:
   ```bash
   git clone https://github.com/fineprintai/fineprintai.git
   cd fineprintai
   ```

2. **Run setup script**:
   ```bash
   chmod +x infrastructure/scripts/setup/dev-setup.sh
   ./infrastructure/scripts/setup/dev-setup.sh
   ```

3. **Verify services**:
   ```bash
   docker-compose -f infrastructure/docker/docker-compose.yml ps
   ```

### Manual Setup

If you prefer manual setup or need to troubleshoot:

1. **Start services**:
   ```bash
   cd infrastructure/docker
   docker-compose up -d
   ```

2. **Initialize Ollama models**:
   ```bash
   docker-compose exec ollama ollama pull phi:2.7b
   docker-compose exec ollama ollama pull mistral:7b
   ```

3. **Run database migrations**:
   ```bash
   cd apps/api
   npm install
   npm run db:migrate
   ```

### Development URLs

- Web Application: http://localhost:3000
- API Server: http://localhost:8000
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090
- MinIO Console: http://localhost:9001

## Staging Deployment

### Infrastructure Setup

1. **Deploy cloud infrastructure**:
   ```bash
   cd infrastructure/terraform/environments/staging
   terraform init
   terraform plan
   terraform apply
   ```

2. **Configure kubectl**:
   ```bash
   aws eks update-kubeconfig --name fineprintai-staging-cluster --region us-west-2
   ```

3. **Install ArgoCD**:
   ```bash
   kubectl create namespace argocd
   helm repo add argo https://argoproj.github.io/argo-helm
   helm install argocd argo/argo-cd -n argocd --values infrastructure/helm/argocd/values-staging.yaml
   ```

### Application Deployment

1. **Deploy via Kubernetes manifests**:
   ```bash
   kubectl apply -k infrastructure/kubernetes/environments/staging/
   ```

2. **Or deploy via Helm**:
   ```bash
   helm install fineprintai infrastructure/helm/fineprintai \
     --namespace fineprintai-staging \
     --create-namespace \
     --values infrastructure/helm/fineprintai/values-staging.yaml
   ```

### Verification

1. **Check deployment status**:
   ```bash
   kubectl get deployments -n fineprintai-staging
   kubectl get pods -n fineprintai-staging
   ```

2. **Run smoke tests**:
   ```bash
   curl -f https://staging.fineprintai.com/health
   curl -f https://staging.fineprintai.com/api/health
   ```

## Production Deployment

### Pre-deployment Checklist

- [ ] Staging deployment successful
- [ ] All tests passing
- [ ] Security scan completed
- [ ] Database backup created
- [ ] Maintenance window scheduled
- [ ] Team notified
- [ ] Rollback plan ready

### Blue-Green Deployment Process

1. **Prepare green environment**:
   ```bash
   # Create new deployment with different labels
   kubectl apply -f infrastructure/kubernetes/environments/prod/blue-green/green/
   ```

2. **Verify green environment**:
   ```bash
   # Run health checks on green environment
   kubectl port-forward svc/api-service-green 8080:8000 -n fineprintai
   curl -f http://localhost:8080/health
   ```

3. **Switch traffic to green**:
   ```bash
   # Update service selector to point to green deployment
   kubectl patch service api-service -n fineprintai -p '{"spec":{"selector":{"version":"green"}}}'
   ```

4. **Monitor and validate**:
   ```bash
   # Monitor metrics and logs
   kubectl logs -f deployment/api-deployment-green -n fineprintai
   ```

5. **Clean up blue environment**:
   ```bash
   # After successful validation, remove blue deployment
   kubectl delete -f infrastructure/kubernetes/environments/prod/blue-green/blue/
   ```

### GitOps Deployment (Recommended)

1. **Update image tags in Git**:
   ```bash
   # CI/CD pipeline automatically updates these
   cd infrastructure/kubernetes/environments/prod
   kustomize edit set image fineprintai/api:v1.2.3
   git add . && git commit -m "Deploy v1.2.3 to production"
   git push
   ```

2. **ArgoCD automatically syncs**:
   ```bash
   # Monitor ArgoCD for sync status
   kubectl get applications -n argocd
   argocd app sync fineprintai-app
   ```

## Rollback Procedures

### Immediate Rollback (Emergency)

1. **Rollback deployment**:
   ```bash
   kubectl rollout undo deployment/api-deployment -n fineprintai
   kubectl rollout undo deployment/websocket-deployment -n fineprintai
   kubectl rollout undo deployment/worker-deployment -n fineprintai
   ```

2. **Verify rollback**:
   ```bash
   kubectl rollout status deployment/api-deployment -n fineprintai
   ```

### ArgoCD Rollback

1. **Sync to previous version**:
   ```bash
   argocd app rollback fineprintai-app --revision <previous-revision>
   ```

2. **Or revert Git commit**:
   ```bash
   git revert <commit-hash>
   git push
   # ArgoCD will automatically sync
   ```

### Database Rollback (If Required)

1. **Stop application**:
   ```bash
   kubectl scale deployment/api-deployment --replicas=0 -n fineprintai
   ```

2. **Restore database**:
   ```bash
   # Restore from backup (example for AWS RDS)
   aws rds restore-db-instance-from-db-snapshot \
     --db-instance-identifier fineprintai-restored \
     --db-snapshot-identifier fineprintai-backup-$(date +%Y%m%d)
   ```

3. **Update connection strings and restart**:
   ```bash
   kubectl set env deployment/api-deployment DATABASE_URL="new-connection-string" -n fineprintai
   kubectl scale deployment/api-deployment --replicas=3 -n fineprintai
   ```

## Monitoring and Troubleshooting

### Health Checks

1. **Application health**:
   ```bash
   # Check all services
   kubectl get pods -n fineprintai
   kubectl get services -n fineprintai
   kubectl get ingress -n fineprintai
   ```

2. **Service-specific health**:
   ```bash
   # API health
   kubectl exec -it deployment/api-deployment -n fineprintai -- curl http://localhost:8000/health
   
   # Database connectivity
   kubectl exec -it deployment/api-deployment -n fineprintai -- npm run db:check
   
   # Redis connectivity
   kubectl exec -it deployment/redis -n fineprintai -- redis-cli ping
   ```

### Log Analysis

1. **Application logs**:
   ```bash
   # API logs
   kubectl logs -f deployment/api-deployment -n fineprintai
   
   # Worker logs
   kubectl logs -f deployment/worker-deployment -n fineprintai
   
   # All application logs
   kubectl logs -f -l app.kubernetes.io/name=fineprintai -n fineprintai
   ```

2. **Infrastructure logs**:
   ```bash
   # Ingress controller logs
   kubectl logs -f -n ingress-nginx deployment/ingress-nginx-controller
   
   # ArgoCD logs
   kubectl logs -f -n argocd deployment/argocd-server
   ```

### Performance Monitoring

1. **Resource usage**:
   ```bash
   kubectl top pods -n fineprintai
   kubectl top nodes
   ```

2. **Grafana dashboards**:
   - Application Overview: https://grafana.fineprintai.com/d/app-overview
   - Infrastructure: https://grafana.fineprintai.com/d/infrastructure
   - Business Metrics: https://grafana.fineprintai.com/d/business

3. **Prometheus queries**:
   ```promql
   # API response time
   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{job="fineprintai-api"}[5m]))
   
   # Error rate
   rate(http_requests_total{job="fineprintai-api",status=~"5.."}[5m]) / rate(http_requests_total{job="fineprintai-api"}[5m])
   
   # CPU usage
   rate(container_cpu_usage_seconds_total{pod=~".*fineprintai.*"}[5m])
   ```

### Common Issues

#### Database Connection Issues

```bash
# Check database pod status
kubectl get pods -l app.kubernetes.io/component=database -n fineprintai

# Check database logs
kubectl logs -f statefulset/postgres-statefulset -n fineprintai

# Test connection from API pod
kubectl exec -it deployment/api-deployment -n fineprintai -- psql $DATABASE_URL -c "SELECT 1;"
```

#### High Memory Usage

```bash
# Check memory usage
kubectl top pods -n fineprintai

# Scale up resources
kubectl patch deployment api-deployment -n fineprintai -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","resources":{"limits":{"memory":"1Gi"}}}]}}}}'

# Or scale horizontally
kubectl scale deployment api-deployment --replicas=5 -n fineprintai
```

#### SSL Certificate Issues

```bash
# Check certificate status
kubectl get certificates -n fineprintai
kubectl describe certificate fineprintai-tls -n fineprintai

# Check cert-manager logs
kubectl logs -f deployment/cert-manager -n cert-manager

# Force certificate renewal
kubectl delete secret fineprintai-tls -n fineprintai
```

## Security Considerations

### Pre-deployment Security Checks

1. **Image vulnerability scanning**:
   ```bash
   trivy image ghcr.io/fineprintai/api:latest
   ```

2. **Kubernetes security audit**:
   ```bash
   kube-bench run --targets node,policies,managedservices
   ```

3. **Network policy validation**:
   ```bash
   # Test network connectivity
   kubectl exec -it test-pod -- nc -zv api-service 8000
   ```

### Post-deployment Security Validation

1. **Access control verification**:
   ```bash
   # Test RBAC
   kubectl auth can-i create pods --as=system:serviceaccount:fineprintai:api-service-account
   ```

2. **Secret encryption**:
   ```bash
   # Verify secrets are encrypted at rest
   kubectl get secrets -o yaml | grep -E '(password|key|token)'
   ```

## Emergency Contacts

- **On-call Engineer**: +1-555-0199
- **DevOps Team**: devops@fineprintai.com
- **Security Team**: security@fineprintai.com
- **Business Owner**: product@fineprintai.com

## Useful Commands Reference

```bash
# Quick deployment status
kubectl get all -n fineprintai

# Resource usage overview
kubectl top pods -n fineprintai --sort-by=memory

# Event troubleshooting
kubectl get events -n fineprintai --sort-by='.lastTimestamp'

# Port forwarding for debugging
kubectl port-forward svc/api-service 8000:8000 -n fineprintai

# Execute commands in containers
kubectl exec -it deployment/api-deployment -n fineprintai -- bash

# Copy files from/to containers
kubectl cp fineprintai/api-pod:/app/logs/app.log ./app.log

# Update image without downtime
kubectl set image deployment/api-deployment api=ghcr.io/fineprintai/api:v1.2.3 -n fineprintai
```