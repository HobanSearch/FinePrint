# Model Management Kubernetes Deployment

This directory contains the Kubernetes deployment configuration for the Fine Print AI Model Management System, providing production-ready infrastructure for serving 7 AI models with auto-scaling and cost optimization.

## Architecture Overview

The deployment consists of:
- **Model Management Service**: API layer for model orchestration
- **Ollama Deployments**: Separate deployments for each model type
- **Auto-scaling**: HPA configurations for dynamic scaling
- **Cost Optimization**: Spot instance support and resource optimization

## Models Deployed

### GPU-Accelerated Models
1. **Llama 3 70B** - Primary large language model (40GB RAM, GPU required)
2. **Qwen 2.5 32B** - Secondary model (20GB RAM, GPU required)
3. **GPT-OSS 35B** - Open-source GPT variant (22GB RAM, GPU required)

### CPU-Optimized Business Models
4. **Legal Analysis** - Contract analysis (8GB RAM)
5. **Risk Assessment** - Risk evaluation (6GB RAM)
6. **Summary Generation** - Document summarization (4GB RAM)
7. **Recommendation Engine** - Actionable recommendations (6GB RAM)

## Resource Requirements

### Minimum Cluster Requirements
- **Nodes**: 5-10 nodes (mix of GPU and CPU optimized)
- **CPU**: 100 vCPUs total
- **Memory**: 200GB total RAM
- **GPU**: 4 NVIDIA GPUs (T4/V100/A100)
- **Storage**: 500GB SSD for model storage

### Per-Model Resource Allocation

| Model | CPU Request | Memory Request | GPU | Min Replicas | Max Replicas |
|-------|------------|---------------|-----|--------------|--------------|
| Llama 3 70B | 4 cores | 40GB | 1 | 1 | 4 |
| Qwen 2.5 32B | 2 cores | 20GB | 1 | 1 | 5 |
| GPT-OSS 35B | 2 cores | 22GB | 1 | 1 | 5 |
| Legal Analysis | 2 cores | 8GB | 0 | 2 | 8 |
| Risk Assessment | 2 cores | 6GB | 0 | 2 | 8 |
| Summary Gen | 1 core | 4GB | 0 | 2 | 10 |
| Recommendations | 2 cores | 6GB | 0 | 2 | 6 |

## Deployment Instructions

### Prerequisites

1. **Kubernetes Cluster**: Version 1.29+
2. **GPU Support**: NVIDIA device plugin installed
3. **Storage Classes**: `fast-ssd` and `standard` configured
4. **Ingress Controller**: NGINX ingress installed
5. **Cert Manager**: For TLS certificate management
6. **Monitoring**: Prometheus operator installed

### Step 1: Create Namespace and Resources

```bash
# Apply namespace and resource quotas
kubectl apply -f namespace.yaml

# Create persistent volume claims
kubectl apply -f pvc.yaml

# Apply configuration
kubectl apply -f configmap.yaml
```

### Step 2: Deploy Ollama Model Servers

```bash
# Deploy GPU-accelerated models
kubectl apply -f ollama-deployment.yaml

# Verify Ollama pods are running
kubectl get pods -n model-management -l app=ollama

# Check GPU allocation
kubectl describe nodes | grep -A 5 "Allocated resources"
```

### Step 3: Deploy Model Management Service

```bash
# Deploy the management service
kubectl apply -f deployment.yaml

# Create services
kubectl apply -f service.yaml

# Verify deployment
kubectl rollout status deployment/model-management -n model-management
```

### Step 4: Configure Auto-scaling

```bash
# Apply HPA configurations
kubectl apply -f hpa.yaml

# Monitor HPA status
kubectl get hpa -n model-management -w
```

### Step 5: Setup Ingress

```bash
# Apply ingress configuration
kubectl apply -f ingress.yaml

# Verify ingress
kubectl get ingress -n model-management
```

### Using Kustomize (Recommended)

```bash
# Deploy everything with Kustomize
kustomize build . | kubectl apply -f -

# For different environments
kustomize build overlays/staging | kubectl apply -f -
kustomize build overlays/production | kubectl apply -f -
```

## Cost Optimization Strategies

### 1. Spot Instance Usage
- Configured tolerations for spot instances
- Automatic fallback to on-demand if spot unavailable
- 60-80% cost reduction for non-critical workloads

### 2. Resource Packing
- High-density packing for CPU models
- Bin packing algorithm for optimal resource utilization
- Shared model cache to reduce storage costs

### 3. Auto-scaling Policies
- Scale down during low traffic (nights/weekends)
- Aggressive scale-up for peak loads
- Predictive scaling based on historical patterns

### 4. Model Unloading
- Automatic unloading of idle models after 10 minutes
- Priority-based model loading
- Shared GPU scheduling for multiple models

## Monitoring and Observability

### Prometheus Metrics

All deployments expose metrics on port 9090:

```bash
# Key metrics to monitor
- model_request_duration_seconds
- model_request_total
- model_memory_usage_bytes
- gpu_utilization_percent
- queue_depth
- active_model_count
```

### Grafana Dashboard

Import the provided dashboard for monitoring:
- Request rates and latencies
- Resource utilization
- Cost metrics
- Model performance

### Alerts

Key alerts configured:
- High memory usage (>85%)
- GPU utilization (>90%)
- Long queue times (>30s)
- Pod crashes and restarts
- Failed health checks

## Health Checks

### Endpoints

- `/health/live` - Liveness probe
- `/health/ready` - Readiness probe
- `/health/startup` - Startup probe
- `/metrics` - Prometheus metrics

### Testing Health

```bash
# Test model management service
curl http://models.fineprint.ai/health

# Test specific Ollama instance
kubectl exec -n model-management deployment/ollama-llama -- \
  curl http://localhost:11434/api/tags
```

## Troubleshooting

### Common Issues

#### 1. Models Not Loading
```bash
# Check model download status
kubectl logs -n model-management deployment/ollama-llama -c model-downloader

# Verify storage
kubectl exec -n model-management deployment/ollama-llama -- df -h
```

#### 2. High Memory Usage
```bash
# Check memory consumption
kubectl top pods -n model-management

# Force model unloading
kubectl exec -n model-management deployment/ollama-business -- \
  curl -X DELETE http://localhost:11434/api/delete -d '{"name":"model-name"}'
```

#### 3. GPU Not Available
```bash
# Check GPU nodes
kubectl get nodes -l nvidia.com/gpu=true

# Verify GPU plugin
kubectl get pods -n kube-system | grep nvidia

# Check GPU allocation
kubectl describe node <gpu-node-name> | grep nvidia.com/gpu
```

#### 4. Slow Response Times
```bash
# Check HPA status
kubectl get hpa -n model-management

# Review pod distribution
kubectl get pods -n model-management -o wide

# Check network policies
kubectl get networkpolicy -n model-management
```

### Debugging Commands

```bash
# Get all resources in namespace
kubectl get all -n model-management

# Describe problematic pod
kubectl describe pod <pod-name> -n model-management

# Check recent events
kubectl get events -n model-management --sort-by='.lastTimestamp'

# View logs
kubectl logs -n model-management deployment/model-management --tail=100

# Execute commands in pod
kubectl exec -it -n model-management deployment/model-management -- /bin/sh
```

## Security Considerations

1. **Network Policies**: Restricted ingress/egress
2. **RBAC**: Minimal permissions for service accounts
3. **Pod Security**: Non-root users, read-only filesystems
4. **Secrets Management**: External secrets operator integration
5. **Image Scanning**: Trivy scanning in CI/CD pipeline

## Backup and Recovery

### Model Backup
```bash
# Backup model storage
kubectl exec -n model-management deployment/ollama-llama -- \
  tar -czf /backup/models.tar.gz /root/.ollama
```

### Configuration Backup
```bash
# Export all configurations
kubectl get all,cm,secret,pvc,ingress -n model-management -o yaml > backup.yaml
```

## CI/CD Integration

The deployment is automated through GitHub Actions:

1. **Test Stage**: Unit and integration tests
2. **Security Scan**: Vulnerability scanning
3. **Build Stage**: Multi-arch Docker image build
4. **Deploy Staging**: Automatic deployment to staging
5. **Deploy Production**: Blue-green deployment to production

Trigger deployment:
```bash
git push origin main  # Auto-deploy to production
git push origin develop  # Auto-deploy to staging
```

## Performance Tuning

### JVM Options for Ollama
```yaml
JAVA_OPTS: "-Xmx30g -XX:+UseG1GC -XX:MaxGCPauseMillis=100"
```

### Kernel Parameters
```bash
# On GPU nodes
echo 'vm.max_map_count=262144' >> /etc/sysctl.conf
sysctl -p
```

### Network Optimization
```yaml
# In service spec
sessionAffinity: ClientIP
sessionAffinityConfig:
  clientIP:
    timeoutSeconds: 3600
```

## Cost Monitoring

Estimated monthly costs (AWS):

| Component | Instance Type | Count | Cost/Month |
|-----------|--------------|-------|------------|
| GPU Nodes | p3.2xlarge | 3 | $2,750 |
| CPU Nodes | c5.4xlarge | 5 | $600 |
| Storage | gp3 SSD | 1TB | $80 |
| Network | Load Balancer | 2 | $50 |
| **Total** | | | **$3,480** |

With spot instances: ~$1,400/month (60% savings)

## Support and Maintenance

For issues or questions:
1. Check the troubleshooting section
2. Review monitoring dashboards
3. Check GitHub issues
4. Contact the AI Platform team

## License

This deployment configuration is part of Fine Print AI and follows the project's licensing terms.