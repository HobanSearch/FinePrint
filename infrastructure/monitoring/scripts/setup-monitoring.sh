#!/bin/bash

# Fine Print AI Monitoring Stack Setup Script
# Production-ready monitoring infrastructure deployment

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITORING_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_NAME="fineprintai"
NAMESPACE="fineprintai-monitoring"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if running as root
    if [[ $EUID -eq 0 ]]; then
        log_error "This script should not be run as root"
        exit 1
    fi
    
    # Check required tools
    local required_tools=("docker" "docker-compose" "kubectl" "helm")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            log_error "$tool is required but not installed"
            exit 1
        fi
    done
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check Kubernetes connection
    if ! kubectl cluster-info &> /dev/null; then
        log_warning "Kubernetes cluster not accessible, will use Docker Compose mode"
        USE_KUBERNETES=false
    else
        USE_KUBERNETES=true
    fi
    
    log_success "Prerequisites check completed"
}

# Setup directories and permissions
setup_directories() {
    log_info "Setting up directories and permissions..."
    
    local dirs=(
        "$MONITORING_DIR/data/prometheus"
        "$MONITORING_DIR/data/grafana"
        "$MONITORING_DIR/data/loki"
        "$MONITORING_DIR/data/jaeger"
        "$MONITORING_DIR/data/alertmanager"
        "$MONITORING_DIR/data/elasticsearch"
        "$MONITORING_DIR/logs"
        "$MONITORING_DIR/ssl"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        chmod 755 "$dir"
    done
    
    # Set specific ownership for service data directories
    sudo chown -R 65534:65534 "$MONITORING_DIR/data/prometheus" 2>/dev/null || true
    sudo chown -R 472:472 "$MONITORING_DIR/data/grafana" 2>/dev/null || true
    sudo chown -R 10001:10001 "$MONITORING_DIR/data/loki" 2>/dev/null || true
    sudo chown -R 65534:65534 "$MONITORING_DIR/data/alertmanager" 2>/dev/null || true
    
    log_success "Directories setup completed"
}

# Generate SSL certificates
generate_ssl_certificates() {
    log_info "Generating SSL certificates..."
    
    if [[ ! -f "$MONITORING_DIR/ssl/monitoring.crt" ]]; then
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "$MONITORING_DIR/ssl/monitoring.key" \
            -out "$MONITORING_DIR/ssl/monitoring.crt" \
            -subj "/C=US/ST=CA/L=San Francisco/O=Fine Print AI/CN=monitoring.fineprintai.com"
        
        log_success "SSL certificates generated"
    else
        log_info "SSL certificates already exist"
    fi
}

# Create environment file
create_environment_file() {
    log_info "Creating environment configuration..."
    
    local env_file="$MONITORING_DIR/.env"
    
    if [[ ! -f "$env_file" ]]; then
        cat > "$env_file" <<EOF
# Fine Print AI Monitoring Environment Configuration
COMPOSE_PROJECT_NAME=${PROJECT_NAME}-monitoring
ENVIRONMENT=${ENVIRONMENT}

# Grafana Configuration
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 32)
GRAFANA_SECRET_KEY=$(openssl rand -base64 32)
GRAFANA_DB_PASSWORD=$(openssl rand -base64 32)

# Database Configuration
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# External Service API Keys (Update these with real values)
SLACK_API_URL=https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
SENDGRID_API_KEY=your_sendgrid_api_key_here
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_key_here
PAGERDUTY_SECURITY_KEY=your_pagerduty_security_key_here

# Google OAuth (Update with real values)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# Sentry Configuration
SENTRY_SECRET_KEY=$(openssl rand -base64 32)
SENTRY_DB_PASSWORD=$(openssl rand -base64 32)

# Monitoring Configuration
METRICS_PASSWORD=$(openssl rand -base64 16)
POSTGRES_GRAFANA_PASSWORD=$(openssl rand -base64 16)
EOF
        
        chmod 600 "$env_file"
        log_success "Environment file created at $env_file"
        log_warning "Please update the external service API keys in $env_file"
    else
        log_info "Environment file already exists"
    fi
}

# Setup Docker Compose monitoring
setup_docker_compose() {
    log_info "Setting up Docker Compose monitoring stack..."
    
    cd "$MONITORING_DIR"
    
    # Pull latest images
    log_info "Pulling Docker images..."
    docker-compose pull
    
    # Start services
    log_info "Starting monitoring services..."
    docker-compose up -d
    
    # Wait for services to be ready
    log_info "Waiting for services to be ready..."
    sleep 30
    
    # Run health checks
    if python3 "$MONITORING_DIR/healthchecks/monitoring-healthcheck.py" --quiet; then
        log_success "Docker Compose monitoring stack is healthy"
    else
        log_warning "Some monitoring services may not be fully ready yet"
    fi
    
    log_info "Monitoring services are available at:"
    log_info "  - Grafana: http://localhost:3000"
    log_info "  - Prometheus: http://localhost:9090"
    log_info "  - AlertManager: http://localhost:9093"
    log_info "  - Jaeger: http://localhost:16686"
}

# Setup Kubernetes monitoring
setup_kubernetes() {
    log_info "Setting up Kubernetes monitoring stack..."
    
    # Create namespace
    kubectl apply -f "$MONITORING_DIR/k8s/namespace.yaml"
    
    # Create RBAC
    kubectl apply -f "$MONITORING_DIR/k8s/rbac.yaml"
    
    # Create secrets
    create_kubernetes_secrets
    
    # Create ConfigMaps
    create_kubernetes_configmaps
    
    # Deploy monitoring services
    kubectl apply -f "$MONITORING_DIR/k8s/prometheus-deployment.yaml"
    kubectl apply -f "$MONITORING_DIR/k8s/grafana-deployment.yaml"
    kubectl apply -f "$MONITORING_DIR/k8s/loki-deployment.yaml" 2>/dev/null || log_warning "Loki deployment not found"
    kubectl apply -f "$MONITORING_DIR/k8s/jaeger-deployment.yaml" 2>/dev/null || log_warning "Jaeger deployment not found"
    kubectl apply -f "$MONITORING_DIR/k8s/alertmanager-deployment.yaml" 2>/dev/null || log_warning "AlertManager deployment not found"
    
    # Wait for deployments
    log_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=300s deployment/prometheus -n $NAMESPACE
    kubectl wait --for=condition=available --timeout=300s deployment/grafana -n $NAMESPACE
    
    log_success "Kubernetes monitoring stack deployed"
    
    # Get service URLs
    log_info "Monitoring services are available at:"
    if kubectl get ingress grafana -n $NAMESPACE &>/dev/null; then
        GRAFANA_URL=$(kubectl get ingress grafana -n $NAMESPACE -o jsonpath='{.spec.rules[0].host}')
        log_info "  - Grafana: https://$GRAFANA_URL"
    else
        log_info "  - Grafana: kubectl port-forward svc/grafana 3000:3000 -n $NAMESPACE"
    fi
    log_info "  - Prometheus: kubectl port-forward svc/prometheus 9090:9090 -n $NAMESPACE"
}

# Create Kubernetes secrets
create_kubernetes_secrets() {
    log_info "Creating Kubernetes secrets..."
    
    # Load environment variables
    if [[ -f "$MONITORING_DIR/.env" ]]; then
        set -a
        source "$MONITORING_DIR/.env"
        set +a
    fi
    
    # Create Grafana secrets
    kubectl create secret generic grafana-secrets \
        --from-literal=admin-password="${GRAFANA_ADMIN_PASSWORD:-admin}" \
        --from-literal=secret-key="${GRAFANA_SECRET_KEY:-secret}" \
        --from-literal=db-password="${GRAFANA_DB_PASSWORD:-grafana}" \
        --from-literal=google-client-id="${GOOGLE_CLIENT_ID:-}" \
        --from-literal=google-client-secret="${GOOGLE_CLIENT_SECRET:-}" \
        --from-literal=sendgrid-api-key="${SENDGRID_API_KEY:-}" \
        --namespace $NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create AlertManager secrets
    kubectl create secret generic alertmanager-secrets \
        --from-literal=slack-api-url="${SLACK_API_URL:-}" \
        --from-literal=sendgrid-api-key="${SENDGRID_API_KEY:-}" \
        --from-literal=pagerduty-integration-key="${PAGERDUTY_INTEGRATION_KEY:-}" \
        --from-literal=pagerduty-security-key="${PAGERDUTY_SECURITY_KEY:-}" \
        --namespace $NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Kubernetes secrets created"
}

# Create Kubernetes ConfigMaps
create_kubernetes_configmaps() {
    log_info "Creating Kubernetes ConfigMaps..."
    
    # Create Prometheus rules ConfigMap
    kubectl create configmap prometheus-rules \
        --from-file="$MONITORING_DIR/prometheus/rules/" \
        --namespace $NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create Grafana dashboards ConfigMap
    kubectl create configmap grafana-dashboards-fineprintai \
        --from-file="$MONITORING_DIR/grafana/dashboards/" \
        --namespace $NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Kubernetes ConfigMaps created"
}

# Setup monitoring targets
setup_monitoring_targets() {
    log_info "Setting up monitoring targets for Fine Print AI services..."
    
    # Add Prometheus annotations to Fine Print AI services
    local services=("analysis-service" "analytics-service" "billing-service" 
                   "gateway-service" "monitoring-service" "notification-service" 
                   "websocket-service")
    
    for service in "${services[@]}"; do
        if kubectl get deployment "$service" -n fineprintai &>/dev/null; then
            kubectl patch deployment "$service" -n fineprintai -p '{
                "spec": {
                    "template": {
                        "metadata": {
                            "annotations": {
                                "prometheus.io/scrape": "true",
                                "prometheus.io/port": "8080",
                                "prometheus.io/path": "/metrics"
                            }
                        }
                    }
                }
            }'
            log_info "Added monitoring annotations to $service"
        fi
    done
    
    log_success "Monitoring targets configured"
}

# Setup log collection
setup_log_collection() {
    log_info "Setting up log collection..."
    
    if [[ "$USE_KUBERNETES" == "true" ]]; then
        # Deploy Promtail as DaemonSet
        kubectl apply -f "$MONITORING_DIR/k8s/promtail-daemonset.yaml" 2>/dev/null || log_warning "Promtail DaemonSet not found"
    else
        # Promtail is already included in docker-compose
        log_info "Promtail configured in Docker Compose"
    fi
    
    log_success "Log collection configured"
}

# Create monitoring cron jobs
setup_cron_jobs() {
    log_info "Setting up monitoring cron jobs..."
    
    # Create cron job for health checks
    local cron_job="*/5 * * * * $MONITORING_DIR/healthchecks/monitoring-healthcheck.py --quiet >> $MONITORING_DIR/logs/healthcheck.log 2>&1"
    
    # Add to user's crontab if not already present
    if ! crontab -l 2>/dev/null | grep -q "monitoring-healthcheck.py"; then
        (crontab -l 2>/dev/null; echo "$cron_job") | crontab -
        log_success "Health check cron job added"
    else
        log_info "Health check cron job already exists"
    fi
    
    # Make health check script executable
    chmod +x "$MONITORING_DIR/healthchecks/monitoring-healthcheck.py"
}

# Create monitoring documentation
create_documentation() {
    log_info "Creating monitoring documentation..."
    
    cat > "$MONITORING_DIR/README.md" <<EOF
# Fine Print AI Production Monitoring Stack

This directory contains the complete production monitoring infrastructure for Fine Print AI.

## Services

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Dashboards and visualization
- **Loki**: Log aggregation
- **Promtail**: Log shipping
- **Jaeger**: Distributed tracing
- **AlertManager**: Alert routing and notifications
- **Elasticsearch**: Jaeger trace storage
- **Sentry**: Error tracking

## Quick Start

### Docker Compose
\`\`\`bash
cd $(basename "$MONITORING_DIR")
docker-compose up -d
\`\`\`

### Kubernetes
\`\`\`bash
kubectl apply -f k8s/
\`\`\`

## URLs

- Grafana: http://localhost:3000 (admin/\${GRAFANA_ADMIN_PASSWORD})
- Prometheus: http://localhost:9090
- AlertManager: http://localhost:9093
- Jaeger: http://localhost:16686

## Health Checks

Run comprehensive health checks:
\`\`\`bash
python3 healthchecks/monitoring-healthcheck.py
\`\`\`

## Configuration

1. Update \`.env\` file with your API keys
2. Customize alerting rules in \`prometheus/alerts/\`
3. Add custom dashboards to \`grafana/dashboards/\`

## Troubleshooting

Check the runbooks in \`runbooks/\` for common issues and solutions.

For support: platform-team@fineprintai.com
EOF
    
    log_success "Documentation created"
}

# Main execution
main() {
    log_info "Starting Fine Print AI Monitoring Stack Setup"
    
    check_prerequisites
    setup_directories
    generate_ssl_certificates
    create_environment_file
    
    if [[ "${USE_KUBERNETES:-true}" == "true" ]]; then
        setup_kubernetes
        setup_monitoring_targets
    else
        setup_docker_compose
    fi
    
    setup_log_collection
    setup_cron_jobs
    create_documentation
    
    log_success "Fine Print AI Monitoring Stack setup completed!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Update .env file with your API keys"
    log_info "2. Access Grafana and import dashboards"
    log_info "3. Configure alert notification channels"
    log_info "4. Run health checks to verify setup"
    log_info ""
    log_info "For help: python3 $MONITORING_DIR/healthchecks/monitoring-healthcheck.py --help"
}

# Handle script arguments
case "${1:-setup}" in
    "setup")
        main
        ;;
    "health-check")
        python3 "$MONITORING_DIR/healthchecks/monitoring-healthcheck.py"
        ;;
    "start")
        cd "$MONITORING_DIR"
        docker-compose up -d
        ;;
    "stop")
        cd "$MONITORING_DIR"
        docker-compose down
        ;;
    "logs")
        cd "$MONITORING_DIR"
        docker-compose logs -f "${2:-}"
        ;;
    "cleanup")
        log_warning "This will remove all monitoring data. Are you sure? (y/N)"
        read -r response
        if [[ "$response" =~ ^[Yy]$ ]]; then
            cd "$MONITORING_DIR"
            docker-compose down -v
            kubectl delete namespace $NAMESPACE 2>/dev/null || true
            rm -rf data/
            log_success "Cleanup completed"
        fi
        ;;
    *)
        echo "Usage: $0 {setup|health-check|start|stop|logs|cleanup}"
        echo ""
        echo "Commands:"
        echo "  setup       - Full monitoring stack setup"
        echo "  health-check - Run health checks"
        echo "  start       - Start monitoring services"
        echo "  stop        - Stop monitoring services"
        echo "  logs        - Show service logs"
        echo "  cleanup     - Remove all monitoring data"
        exit 1
        ;;
esac