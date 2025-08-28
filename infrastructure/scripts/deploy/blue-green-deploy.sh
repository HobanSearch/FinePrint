#!/bin/bash

# Blue-Green Deployment Script for Fine Print AI
# This script implements zero-downtime deployments using blue-green strategy

set -euo pipefail

# Default values
IMAGE=""
ENVIRONMENT=""
SERVICE=""
NAMESPACE=""
TIMEOUT=600
DRY_RUN=false
ROLLBACK=false
HEALTH_CHECK_PATH="/health"
HEALTH_CHECK_TIMEOUT=30
TRAFFIC_SPLIT_PERCENTAGE=10

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Usage function
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Blue-Green deployment script for Fine Print AI services.

OPTIONS:
    --image IMAGE               Container image to deploy (required)
    --environment ENV           Environment (dev, staging, production) (required)
    --service SERVICE           Service name to deploy (required)
    --namespace NAMESPACE       Kubernetes namespace (optional, derived from environment)
    --timeout TIMEOUT          Deployment timeout in seconds (default: 600)
    --dry-run                   Show what would be done without executing
    --rollback                  Rollback to previous version
    --health-check-path PATH    Health check endpoint path (default: /health)
    --health-check-timeout SEC  Health check timeout (default: 30)
    --traffic-split PERCENT     Initial traffic split percentage (default: 10)
    --help                      Show this help message

EXAMPLES:
    # Deploy API service to production
    $0 --image ghcr.io/fineprintai/api:v1.2.3 --environment production --service api

    # Deploy with custom traffic split
    $0 --image ghcr.io/fineprintai/api:v1.2.3 --environment staging --service api --traffic-split 25

    # Rollback production deployment
    $0 --environment production --service api --rollback

    # Dry run deployment
    $0 --image ghcr.io/fineprintai/api:v1.2.3 --environment staging --service api --dry-run

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --image)
            IMAGE="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --service)
            SERVICE="$2"
            shift 2
            ;;
        --namespace)
            NAMESPACE="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --rollback)
            ROLLBACK=true
            shift
            ;;
        --health-check-path)
            HEALTH_CHECK_PATH="$2"
            shift 2
            ;;
        --health-check-timeout)
            HEALTH_CHECK_TIMEOUT="$2"
            shift 2
            ;;
        --traffic-split)
            TRAFFIC_SPLIT_PERCENTAGE="$2"
            shift 2
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$ENVIRONMENT" ]]; then
    log_error "Environment is required"
    usage
    exit 1
fi

if [[ -z "$SERVICE" ]]; then
    log_error "Service name is required"
    usage
    exit 1
fi

if [[ "$ROLLBACK" == "false" && -z "$IMAGE" ]]; then
    log_error "Image is required for deployment (not rollback)"
    usage
    exit 1
fi

# Set namespace if not provided
if [[ -z "$NAMESPACE" ]]; then
    NAMESPACE="fineprintai-${ENVIRONMENT}"
fi

# Validate environment
case "$ENVIRONMENT" in
    dev|development)
        ENVIRONMENT="development"
        ;;
    staging)
        ENVIRONMENT="staging"
        ;;
    prod|production)
        ENVIRONMENT="production"
        ;;
    *)
        log_error "Invalid environment: $ENVIRONMENT. Must be one of: dev, staging, production"
        exit 1
        ;;
esac

# Set deployment names
BLUE_DEPLOYMENT="${SERVICE}-blue"
GREEN_DEPLOYMENT="${SERVICE}-green"
SERVICE_NAME="${SERVICE}"
INGRESS_NAME="${SERVICE}-ingress"

log_info "Starting blue-green deployment for $SERVICE in $ENVIRONMENT environment"
log_info "Namespace: $NAMESPACE"
log_info "Image: $IMAGE"
log_info "Timeout: ${TIMEOUT}s"
log_info "Dry run: $DRY_RUN"

# Function to execute kubectl commands
execute_kubectl() {
    local cmd="$1"
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would execute: kubectl $cmd"
    else
        log_info "Executing: kubectl $cmd"
        kubectl $cmd
    fi
}

# Function to get current active deployment
get_active_deployment() {
    local active_label
    active_label=$(kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" -o jsonpath='{.spec.selector.version}' 2>/dev/null || echo "")
    
    if [[ "$active_label" == "blue" ]]; then
        echo "blue"
    elif [[ "$active_label" == "green" ]]; then
        echo "green"
    else
        echo "none"
    fi
}

# Function to get inactive deployment
get_inactive_deployment() {
    local active="$1"
    if [[ "$active" == "blue" ]]; then
        echo "green"
    elif [[ "$active" == "green" ]]; then
        echo "blue"
    else
        echo "blue"  # Default to blue if no active deployment
    fi
}

# Function to check if deployment exists
deployment_exists() {
    local deployment="$1"
    kubectl get deployment "$deployment" -n "$NAMESPACE" >/dev/null 2>&1
}

# Function to wait for deployment rollout
wait_for_rollout() {
    local deployment="$1"
    local timeout="$2"
    
    log_info "Waiting for deployment $deployment to complete (timeout: ${timeout}s)"
    
    if [[ "$DRY_RUN" == "false" ]]; then
        if ! kubectl rollout status deployment/"$deployment" -n "$NAMESPACE" --timeout="${timeout}s"; then
            log_error "Deployment $deployment failed to complete within ${timeout}s"
            return 1
        fi
    else
        log_info "[DRY RUN] Would wait for deployment $deployment rollout"
    fi
    
    return 0
}

# Function to perform health check
health_check() {
    local deployment="$1"
    local retries=10
    local wait_time=5
    
    log_info "Performing health check for deployment $deployment"
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log_info "[DRY RUN] Would perform health check for $deployment"
        return 0
    fi
    
    # Get pod name
    local pod_name
    pod_name=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/name=fineprintai,app.kubernetes.io/component="$SERVICE",version="$deployment" -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "")
    
    if [[ -z "$pod_name" ]]; then
        log_error "No pods found for deployment $deployment"
        return 1
    fi
    
    # Perform health check
    for ((i=1; i<=retries; i++)); do
        log_info "Health check attempt $i/$retries for pod $pod_name"
        
        if kubectl exec -n "$NAMESPACE" "$pod_name" -- curl -f -s "http://localhost:8000${HEALTH_CHECK_PATH}" >/dev/null 2>&1; then
            log_success "Health check passed for deployment $deployment"
            return 0
        fi
        
        if [[ $i -lt $retries ]]; then
            log_warning "Health check failed, retrying in ${wait_time}s..."
            sleep $wait_time
        fi
    done
    
    log_error "Health check failed for deployment $deployment after $retries attempts"
    return 1
}

# Function to update service selector
update_service_selector() {
    local target_version="$1"
    local percentage="$2"
    
    log_info "Updating service selector to route ${percentage}% traffic to $target_version"
    
    if [[ "$percentage" == "100" ]]; then
        # Full traffic switch
        execute_kubectl "patch service $SERVICE_NAME -n $NAMESPACE -p '{\"spec\":{\"selector\":{\"version\":\"$target_version\"}}}'"
    else
        # Traffic splitting using Istio or similar (this is a simplified example)
        log_warning "Traffic splitting not implemented in this script. Switching 100% traffic."
        execute_kubectl "patch service $SERVICE_NAME -n $NAMESPACE -p '{\"spec\":{\"selector\":{\"version\":\"$target_version\"}}}'"
    fi
}

# Function to create or update deployment
deploy_to_slot() {
    local slot="$1"
    local image="$2"
    
    log_info "Deploying $image to $slot slot"
    
    # Create deployment manifest
    local deployment_name="${SERVICE}-${slot}"
    
    cat << EOF | execute_kubectl "apply -f -"
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $deployment_name
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: fineprintai
    app.kubernetes.io/component: $SERVICE
    app.kubernetes.io/version: $slot
    version: $slot
spec:
  replicas: 3
  selector:
    matchLabels:
      app.kubernetes.io/name: fineprintai
      app.kubernetes.io/component: $SERVICE
      version: $slot
  template:
    metadata:
      labels:
        app.kubernetes.io/name: fineprintai
        app.kubernetes.io/component: $SERVICE
        version: $slot
      annotations:
        deployment.kubernetes.io/revision: "$(date +%s)"
    spec:
      containers:
      - name: $SERVICE
        image: $image
        ports:
        - containerPort: 8000
        env:
        - name: NODE_ENV
          value: $ENVIRONMENT
        - name: VERSION
          value: $slot
        livenessProbe:
          httpGet:
            path: $HEALTH_CHECK_PATH
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: $HEALTH_CHECK_PATH
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
        resources:
          requests:
            cpu: 250m
            memory: 512Mi
          limits:
            cpu: 500m
            memory: 1Gi
EOF
}

# Function to cleanup old deployment
cleanup_old_deployment() {
    local deployment="$1"
    
    log_info "Cleaning up old deployment: $deployment"
    
    if deployment_exists "$deployment"; then
        execute_kubectl "delete deployment $deployment -n $NAMESPACE"
        log_success "Cleaned up deployment $deployment"
    else
        log_info "Deployment $deployment does not exist, nothing to clean up"
    fi
}

# Function to rollback deployment
rollback_deployment() {
    log_info "Starting rollback process for $SERVICE"
    
    local active_deployment
    active_deployment=$(get_active_deployment)
    
    if [[ "$active_deployment" == "none" ]]; then
        log_error "No active deployment found, cannot rollback"
        exit 1
    fi
    
    local inactive_deployment
    inactive_deployment=$(get_inactive_deployment "$active_deployment")
    
    if ! deployment_exists "${SERVICE}-${inactive_deployment}"; then
        log_error "Previous deployment ${SERVICE}-${inactive_deployment} not found, cannot rollback"
        exit 1
    fi
    
    log_info "Rolling back from $active_deployment to $inactive_deployment"
    
    # Update service to point to previous deployment
    update_service_selector "$inactive_deployment" "100"
    
    # Wait a moment for traffic to switch
    if [[ "$DRY_RUN" == "false" ]]; then
        sleep 10
    fi
    
    # Perform health check on rolled back deployment
    if ! health_check "$inactive_deployment"; then
        log_error "Health check failed after rollback"
        exit 1
    fi
    
    log_success "Rollback completed successfully"
    
    # Optional: Scale down the failed deployment
    execute_kubectl "scale deployment ${SERVICE}-${active_deployment} -n $NAMESPACE --replicas=0"
}

# Main deployment function
main_deployment() {
    log_info "Starting deployment of $IMAGE to $SERVICE"
    
    # Get current active deployment
    local active_deployment
    active_deployment=$(get_active_deployment)
    
    log_info "Current active deployment: $active_deployment"
    
    # Determine target deployment slot
    local target_deployment
    target_deployment=$(get_inactive_deployment "$active_deployment")
    
    log_info "Target deployment: $target_deployment"
    
    # Deploy to inactive slot
    deploy_to_slot "$target_deployment" "$IMAGE"
    
    # Wait for deployment to complete
    if ! wait_for_rollout "${SERVICE}-${target_deployment}" "$TIMEOUT"; then
        log_error "Deployment failed"
        cleanup_old_deployment "${SERVICE}-${target_deployment}"
        exit 1
    fi
    
    # Perform health check
    if ! health_check "$target_deployment"; then
        log_error "Health check failed"
        cleanup_old_deployment "${SERVICE}-${target_deployment}"
        exit 1
    fi
    
    # Gradual traffic shift (simplified to immediate switch)
    log_info "Switching traffic to new deployment"
    update_service_selector "$target_deployment" "100"
    
    # Wait for traffic to stabilize
    if [[ "$DRY_RUN" == "false" ]]; then
        sleep 30
    fi
    
    # Final health check
    if ! health_check "$target_deployment"; then
        log_error "Final health check failed, rolling back"
        update_service_selector "$active_deployment" "100"
        exit 1
    fi
    
    log_success "Deployment completed successfully"
    
    # Cleanup old deployment after successful deployment
    if [[ "$active_deployment" != "none" ]]; then
        cleanup_old_deployment "${SERVICE}-${active_deployment}"
    fi
    
    log_success "Blue-green deployment completed for $SERVICE"
    log_info "New active deployment: $target_deployment"
}

# Pre-flight checks
log_info "Performing pre-flight checks"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    log_error "Namespace $NAMESPACE does not exist"
    exit 1
fi

# Check if service exists
if ! kubectl get service "$SERVICE_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
    log_warning "Service $SERVICE_NAME does not exist in namespace $NAMESPACE"
    if [[ "$DRY_RUN" == "false" ]]; then
        log_info "Creating service $SERVICE_NAME"
        cat << EOF | kubectl apply -f -
apiVersion: v1
kind: Service
metadata:
  name: $SERVICE_NAME
  namespace: $NAMESPACE
  labels:
    app.kubernetes.io/name: fineprintai
    app.kubernetes.io/component: $SERVICE
spec:
  selector:
    app.kubernetes.io/name: fineprintai
    app.kubernetes.io/component: $SERVICE
  ports:
  - port: 80
    targetPort: 8000
    protocol: TCP
  type: ClusterIP
EOF
    fi
fi

# Execute main logic
if [[ "$ROLLBACK" == "true" ]]; then
    rollback_deployment
else
    main_deployment
fi

log_success "Script completed successfully"