# Agent Orchestration System - Deployment Guide

This guide provides comprehensive instructions for deploying the Agent Orchestration System in various environments.

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ LTS
- Docker & Docker Compose
- Kubernetes cluster (for production)
- Redis 7.2+
- PostgreSQL 16+

### Environment Setup

1. **Clone Repository**
   ```bash
   git clone https://github.com/fineprintai/agent-orchestration
   cd agent-orchestration
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run Database Migrations**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start Services**
   ```bash
   # Development
   npm run dev
   
   # Production
   npm run build
   npm start
   ```

## 🐳 Docker Deployment

### Single Container

```bash
# Build image
docker build -t fineprintai/agent-orchestration:latest .

# Run container
docker run -d \
  --name agent-orchestration \
  -p 3010:3010 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e REDIS_HOST=redis-host \
  -e JWT_SECRET=your-secure-secret \
  fineprintai/agent-orchestration:latest
```

### Docker Compose (Recommended)

```yaml
# docker-compose.yml
version: '3.8'

services:
  orchestration:
    build: .
    ports:
      - "3010:3010"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/orchestration
      - REDIS_HOST=redis
      - JWT_SECRET=${JWT_SECRET}
      - MONITORING_ENABLED=true
    depends_on:
      - db
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3010/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: orchestration
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7.2-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  # Optional: Monitoring stack
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring/datasources:/etc/grafana/provisioning/datasources

volumes:
  postgres_data:
  redis_data:
  prometheus_data:
  grafana_data:

networks:
  default:
    name: fineprintai-network
```

```bash
# Deploy with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f orchestration

# Scale service
docker-compose up -d --scale orchestration=3

# Stop services
docker-compose down
```

## ☸️ Kubernetes Deployment

### Namespace

```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: fineprintai-orchestration
  labels:
    name: fineprintai-orchestration
```

### ConfigMap

```yaml
# k8s/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: orchestration-config
  namespace: fineprintai-orchestration
data:
  NODE_ENV: "production"
  HOST: "0.0.0.0"
  PORT: "3010"
  REDIS_HOST: "redis-service"
  REDIS_PORT: "6379"
  MONITORING_ENABLED: "true"
  DOCS_ENABLED: "true"
  WORKFLOW_MAX_CONCURRENT: "100"
  DECISION_DEFAULT_STRATEGY: "capability_based"
  RESOURCE_ALLOCATION_STRATEGY: "balanced"
```

### Secrets

```yaml
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: orchestration-secrets
  namespace: fineprintai-orchestration
type: Opaque
data:
  JWT_SECRET: <base64-encoded-secret>
  DATABASE_URL: <base64-encoded-database-url>
  REDIS_PASSWORD: <base64-encoded-redis-password>
```

### Deployment

```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agent-orchestration
  namespace: fineprintai-orchestration
  labels:
    app: agent-orchestration
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agent-orchestration
  template:
    metadata:
      labels:
        app: agent-orchestration
    spec:
      containers:
      - name: orchestration
        image: fineprintai/agent-orchestration:latest
        ports:
        - containerPort: 3010
          name: http
        envFrom:
        - configMapRef:
            name: orchestration-config
        - secretRef:
            name: orchestration-secrets
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3010
          initialDelaySeconds: 30
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 3
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3010
          initialDelaySeconds: 5
          periodSeconds: 5
          timeoutSeconds: 3
          failureThreshold: 3
        securityContext:
          runAsNonRoot: true
          runAsUser: 1001
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
              - ALL
        volumeMounts:
        - name: tmp
          mountPath: /tmp
      volumes:
      - name: tmp
        emptyDir: {}
      securityContext:
        fsGroup: 1001
```

### Service

```yaml
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: orchestration-service
  namespace: fineprintai-orchestration
  labels:
    app: agent-orchestration
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3010
    name: http
  selector:
    app: agent-orchestration
```

### Ingress

```yaml
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: orchestration-ingress
  namespace: fineprintai-orchestration
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - orchestration.fineprintai.com
    secretName: orchestration-tls
  rules:
  - host: orchestration.fineprintai.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: orchestration-service
            port:
              number: 80
```

### HorizontalPodAutoscaler

```yaml
# k8s/hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orchestration-hpa
  namespace: fineprintai-orchestration
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: agent-orchestration
  minReplicas: 3
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
      - type: Percent
        value: 10
        periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
      - type: Percent
        value: 100
        periodSeconds: 15
      - type: Pods
        value: 4
        periodSeconds: 15
      selectPolicy: Max
```

### Deploy to Kubernetes

```bash
# Apply all configurations
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n fineprintai-orchestration

# View logs
kubectl logs -f deployment/agent-orchestration -n fineprintai-orchestration

# Port forward for local access
kubectl port-forward service/orchestration-service 3010:80 -n fineprintai-orchestration
```

## 🌍 Production Environment Setup

### Environment Variables

```bash
# Production .env
NODE_ENV=production
HOST=0.0.0.0
PORT=3010

# Security
JWT_SECRET=your-production-jwt-secret-minimum-32-characters
SECURITY_RBAC=true
SECURITY_AUDIT_LOGGING=true
SECURITY_ENCRYPTION_AT_REST=true

# Database (Production PostgreSQL)
DATABASE_URL=postgresql://user:password@prod-db:5432/orchestration
DB_MAX_CONNECTIONS=50
DB_CONNECTION_TIMEOUT=10000

# Redis (Production Redis Cluster)
REDIS_HOST=redis-cluster-endpoint
REDIS_PORT=6379
REDIS_PASSWORD=redis-production-password
REDIS_MAX_RETRIES=5

# Monitoring
MONITORING_ENABLED=true
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
ALERTING_ENABLED=true

# Performance
WORKFLOW_MAX_CONCURRENT=500
QUEUE_CONCURRENCY=50
PERF_CACHE=true
PERF_CONNECTION_POOLING=true

# Integrations
DATADOG_ENABLED=true
DATADOG_API_KEY=your-datadog-api-key
SLACK_ENABLED=true
SLACK_WEBHOOK_URL=your-slack-webhook-url
```

### Load Balancer Configuration

```nginx
# nginx.conf
upstream orchestration_backend {
    least_conn;
    server orchestration-1:3010 max_fails=3 fail_timeout=30s;
    server orchestration-2:3010 max_fails=3 fail_timeout=30s;
    server orchestration-3:3010 max_fails=3 fail_timeout=30s;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name orchestration.fineprintai.com;

    # SSL configuration
    ssl_certificate /etc/ssl/certs/orchestration.crt;
    ssl_certificate_key /etc/ssl/private/orchestration.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload";

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://orchestration_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    location /health {
        proxy_pass http://orchestration_backend/health;
        access_log off;
    }

    location /metrics {
        deny all;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        proxy_pass http://orchestration_backend/metrics;
    }
}
```

## 📊 Monitoring Setup

### Prometheus Configuration

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'orchestration'
    static_configs:
      - targets: ['orchestration-service:80']
    metrics_path: '/metrics'
    scrape_interval: 10s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
```

### Alert Rules

```yaml
# monitoring/alert_rules.yml
groups:
  - name: orchestration_alerts
    rules:
    - alert: OrchestrationServiceDown
      expr: up{job="orchestration"} == 0
      for: 1m
      labels:
        severity: critical
      annotations:
        summary: "Orchestration service is down"
        description: "Orchestration service has been down for more than 1 minute"

    - alert: HighWorkflowFailureRate
      expr: rate(orchestration_workflows_failed_total[5m]) > 0.1
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "High workflow failure rate"
        description: "Workflow failure rate is {{ $value }} failures per second"

    - alert: HighMemoryUsage
      expr: process_resident_memory_bytes{job="orchestration"} > 1e9
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High memory usage"
        description: "Memory usage is above 1GB"

    - alert: DatabaseConnectionsHigh
      expr: pg_stat_database_numbackends > 40
      for: 2m
      labels:
        severity: warning
      annotations:
        summary: "High database connection count"
        description: "Database has {{ $value }} active connections"
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Agent Orchestration System",
    "panels": [
      {
        "title": "Active Agents",
        "type": "stat",
        "targets": [
          {
            "expr": "orchestration_agents_total{status=\"healthy\"}"
          }
        ]
      },
      {
        "title": "Workflow Executions",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(orchestration_workflows_executed_total[5m])"
          }
        ]
      },
      {
        "title": "Decision Making Performance",
        "type": "heatmap",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(orchestration_decision_duration_seconds_bucket[5m]))"
          }
        ]
      }
    ]
  }
}
```

## 🔒 Security Hardening

### Network Security

```yaml
# k8s/network-policy.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: orchestration-network-policy
  namespace: fineprintai-orchestration
spec:
  podSelector:
    matchLabels:
      app: agent-orchestration
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: fineprintai-agents
    ports:
    - protocol: TCP
      port: 3010
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: fineprintai-database
    ports:
    - protocol: TCP
      port: 5432
  - to:
    - namespaceSelector:
        matchLabels:
          name: fineprintai-cache
    ports:
    - protocol: TCP
      port: 6379
```

### Pod Security Policy

```yaml
# k8s/pod-security-policy.yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: orchestration-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  requiredDropCapabilities:
    - ALL
  volumes:
    - 'configMap'
    - 'emptyDir'
    - 'projected'
    - 'secret'
    - 'downwardAPI'
    - 'persistentVolumeClaim'
  runAsUser:
    rule: 'MustRunAsNonRoot'
  seLinux:
    rule: 'RunAsAny'
  fsGroup:
    rule: 'RunAsAny'
```

## 🚀 Deployment Automation

### GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy Agent Orchestration

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '20'
        cache: 'npm'
    - run: npm ci
    - run: npm test
    - run: npm run build

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: docker/setup-buildx-action@v2
    - uses: docker/login-action@v2
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    - uses: docker/build-push-action@v4
      with:
        context: .
        push: true
        tags: |
          ghcr.io/fineprintai/agent-orchestration:latest
          ghcr.io/fineprintai/agent-orchestration:${{ github.sha }}

  deploy-staging:
    needs: build
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging
    steps:
    - uses: actions/checkout@v3
    - uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG_STAGING }}
    - run: |
        kubectl set image deployment/agent-orchestration \
          orchestration=ghcr.io/fineprintai/agent-orchestration:${{ github.sha }} \
          -n fineprintai-orchestration-staging
        kubectl rollout status deployment/agent-orchestration \
          -n fineprintai-orchestration-staging

  deploy-production:
    needs: build
    runs-on: ubuntu-latest
    if: startsWith(github.ref, 'refs/tags/v')
    environment: production
    steps:
    - uses: actions/checkout@v3
    - uses: azure/k8s-set-context@v3
      with:
        method: kubeconfig
        kubeconfig: ${{ secrets.KUBE_CONFIG_PROD }}
    - run: |
        kubectl set image deployment/agent-orchestration \
          orchestration=ghcr.io/fineprintai/agent-orchestration:${{ github.sha }} \
          -n fineprintai-orchestration
        kubectl rollout status deployment/agent-orchestration \
          -n fineprintai-orchestration
```

### Terraform Infrastructure

```hcl
# terraform/main.tf
provider "kubernetes" {
  config_path = "~/.kube/config"
}

resource "kubernetes_namespace" "orchestration" {
  metadata {
    name = "fineprintai-orchestration"
    labels = {
      name = "fineprintai-orchestration"
    }
  }
}

resource "kubernetes_deployment" "orchestration" {
  metadata {
    name      = "agent-orchestration"
    namespace = kubernetes_namespace.orchestration.metadata[0].name
    labels = {
      app = "agent-orchestration"
    }
  }

  spec {
    replicas = var.replica_count

    selector {
      match_labels = {
        app = "agent-orchestration"
      }
    }

    template {
      metadata {
        labels = {
          app = "agent-orchestration"
        }
      }

      spec {
        container {
          image = var.image_tag
          name  = "orchestration"

          port {
            container_port = 3010
          }

          env_from {
            config_map_ref {
              name = kubernetes_config_map.orchestration.metadata[0].name
            }
          }

          env_from {
            secret_ref {
              name = kubernetes_secret.orchestration.metadata[0].name
            }
          }

          resources {
            limits = {
              cpu    = var.cpu_limit
              memory = var.memory_limit
            }
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
          }

          liveness_probe {
            http_get {
              path = "/health/live"
              port = 3010
            }
            initial_delay_seconds = 30
            period_seconds        = 10
          }

          readiness_probe {
            http_get {
              path = "/health/ready"
              port = 3010
            }
            initial_delay_seconds = 5
            period_seconds        = 5
          }
        }
      }
    }
  }
}

variable "replica_count" {
  description = "Number of replicas"
  type        = number
  default     = 3
}

variable "image_tag" {
  description = "Docker image tag"
  type        = string
}

variable "cpu_limit" {
  description = "CPU limit"
  type        = string
  default     = "1000m"
}

variable "memory_limit" {
  description = "Memory limit"
  type        = string
  default     = "1Gi"
}
```

## 🔧 Troubleshooting

### Common Issues

1. **Service Won't Start**
   ```bash
   # Check logs
   kubectl logs deployment/agent-orchestration -n fineprintai-orchestration
   
   # Check configuration
   kubectl describe configmap orchestration-config
   kubectl describe secret orchestration-secrets
   ```

2. **Database Connection Issues**
   ```bash
   # Test database connectivity
   kubectl run postgres-client --rm -it --image=postgres:16 -- psql $DATABASE_URL
   
   # Check database pods
   kubectl get pods -l app=postgres
   ```

3. **Redis Connection Issues**
   ```bash
   # Test Redis connectivity
   kubectl run redis-client --rm -it --image=redis:7.2 -- redis-cli -h redis-service ping
   ```

4. **High Memory Usage**
   ```bash
   # Check memory usage
   kubectl top pods -n fineprintai-orchestration
   
   # Increase memory limits if needed
   kubectl patch deployment agent-orchestration -p '{"spec":{"template":{"spec":{"containers":[{"name":"orchestration","resources":{"limits":{"memory":"2Gi"}}}]}}}}'
   ```

### Performance Tuning

```yaml
# Increase resources for high load
resources:
  requests:
    memory: "1Gi"
    cpu: "1000m"
  limits:
    memory: "2Gi"
    cpu: "2000m"

# Tune autoscaling
spec:
  minReplicas: 5
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 60
```

### Recovery Procedures

```bash
# Rollback deployment
kubectl rollout undo deployment/agent-orchestration -n fineprintai-orchestration

# Scale down/up for restart
kubectl scale deployment agent-orchestration --replicas=0 -n fineprintai-orchestration
kubectl scale deployment agent-orchestration --replicas=3 -n fineprintai-orchestration

# Force pod recreation
kubectl delete pods -l app=agent-orchestration -n fineprintai-orchestration
```

---

For additional support, please refer to the main README.md or contact the development team.