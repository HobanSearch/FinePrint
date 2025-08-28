#!/bin/bash

# Fine Print AI - Development Environment Setup Script
# This script sets up the complete local development environment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
INFRA_DIR="$PROJECT_ROOT/infrastructure"

echo -e "${BLUE}🚀 Fine Print AI - Development Environment Setup${NC}"
echo "=================================================="

# Function to print status messages
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check Docker and Docker Compose
check_docker() {
    print_info "Checking Docker installation..."
    
    if ! command_exists docker; then
        print_error "Docker is not installed. Please install Docker Desktop first."
        echo "Visit: https://www.docker.com/products/docker-desktop"
        exit 1
    fi
    
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
    
    if ! command_exists docker-compose; then
        print_error "Docker Compose is not installed. Please install Docker Compose."
        exit 1
    fi
    
    print_status "Docker and Docker Compose are available"
}

# Function to check Node.js
check_nodejs() {
    print_info "Checking Node.js installation..."
    
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 20 LTS."
        echo "Visit: https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        print_error "Node.js version $NODE_VERSION is too old. Please install Node.js 18 or later."
        exit 1
    fi
    
    print_status "Node.js $(node --version) is available"
}

# Function to check kubectl
check_kubectl() {
    print_info "Checking kubectl installation..."
    
    if ! command_exists kubectl; then
        print_warning "kubectl is not installed. Installing via curl..."
        
        # Detect OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/amd64/kubectl"
            chmod +x kubectl
            sudo mv kubectl /usr/local/bin/
        else
            # Linux
            curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
            chmod +x kubectl
            sudo mv kubectl /usr/local/bin/
        fi
    fi
    
    print_status "kubectl $(kubectl version --client --short 2>/dev/null | cut -d' ' -f3) is available"
}

# Function to check Helm
check_helm() {
    print_info "Checking Helm installation..."
    
    if ! command_exists helm; then
        print_warning "Helm is not installed. Installing via script..."
        curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    fi
    
    print_status "Helm $(helm version --short 2>/dev/null | cut -d' ' -f1) is available"
}

# Function to create necessary directories
create_directories() {
    print_info "Creating necessary directories..."
    
    mkdir -p "$PROJECT_ROOT/apps/web"
    mkdir -p "$PROJECT_ROOT/apps/api"
    mkdir -p "$PROJECT_ROOT/apps/websocket"
    mkdir -p "$PROJECT_ROOT/apps/worker"
    mkdir -p "$INFRA_DIR/docker/data/postgres"
    mkdir -p "$INFRA_DIR/docker/data/redis"
    mkdir -p "$INFRA_DIR/docker/data/qdrant"
    mkdir -p "$INFRA_DIR/docker/data/ollama"
    mkdir -p "$INFRA_DIR/docker/data/minio"
    mkdir -p "$INFRA_DIR/docker/logs"
    
    print_status "Directories created"
}

# Function to generate environment files
generate_env_files() {
    print_info "Generating environment files..."
    
    # Generate .env file for development
    cat > "$PROJECT_ROOT/.env.dev" << EOF
# Fine Print AI - Development Environment Configuration
NODE_ENV=development
LOG_LEVEL=debug

# API Configuration
API_PORT=8000
API_HOST=0.0.0.0

# WebSocket Configuration
WS_PORT=8001
WS_HOST=0.0.0.0

# Database Configuration
DATABASE_URL=postgresql://postgres:password@postgres:5432/fineprintai
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=fineprintai
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Redis Configuration
REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379

# Vector Database Configuration
QDRANT_URL=http://qdrant:6333
QDRANT_HOST=qdrant
QDRANT_PORT=6333

# AI Configuration
OLLAMA_URL=http://ollama:11434
OLLAMA_HOST=ollama
OLLAMA_PORT=11434

# Security Configuration
JWT_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-change-in-production
ENCRYPTION_KEY=dev-encryption-key-32-chars-long

# External Services (Development)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=

# MinIO S3-compatible storage
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=fineprintai-dev

# Rate Limiting
RATE_LIMIT_REQUESTS=1000
RATE_LIMIT_WINDOW=3600

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Feature Flags
ENABLE_DOCUMENT_PROCESSING=true
ENABLE_AI_ANALYSIS=true
ENABLE_REAL_TIME_MONITORING=true
ENABLE_METRICS=true
EOF

    # Generate Kubernetes environment files
    mkdir -p "$INFRA_DIR/kubernetes/environments/dev"
    cat > "$INFRA_DIR/kubernetes/environments/dev/.env" << EOF
ENVIRONMENT=dev
NAMESPACE=fineprintai-dev
IMAGE_TAG=dev-latest
REPLICAS=1
RESOURCES_REQUESTS_CPU=100m
RESOURCES_REQUESTS_MEMORY=128Mi
RESOURCES_LIMITS_CPU=500m
RESOURCES_LIMITS_MEMORY=512Mi
EOF

    print_status "Environment files generated"
}

# Function to initialize Ollama models
initialize_ollama() {
    print_info "Initializing Ollama models..."
    
    # Wait for Ollama to be ready
    echo "Waiting for Ollama to start..."
    sleep 30
    
    # Pull required models
    docker-compose -f "$INFRA_DIR/docker/docker-compose.yml" exec -T ollama ollama pull phi:2.7b || print_warning "Failed to pull phi:2.7b model"
    docker-compose -f "$INFRA_DIR/docker/docker-compose.yml" exec -T ollama ollama pull mistral:7b || print_warning "Failed to pull mistral:7b model"
    
    print_status "Ollama models initialized"
}

# Function to run database migrations
run_migrations() {
    print_info "Running database migrations..."
    
    # Wait for PostgreSQL to be ready
    echo "Waiting for PostgreSQL to start..."
    sleep 20
    
    # Check if API directory exists and has migration files
    if [ -d "$PROJECT_ROOT/apps/api" ] && [ -f "$PROJECT_ROOT/apps/api/package.json" ]; then
        cd "$PROJECT_ROOT/apps/api"
        
        # Install dependencies if needed
        if [ ! -d "node_modules" ]; then
            npm install
        fi
        
        # Run migrations
        npm run db:migrate || print_warning "Failed to run database migrations - this is expected on first setup"
        
        cd "$PROJECT_ROOT"
    else
        print_warning "API application not found - skipping migrations"
    fi
    
    print_status "Database setup completed"
}

# Function to start services
start_services() {
    print_info "Starting development services..."
    
    cd "$INFRA_DIR/docker"
    
    # Pull latest images
    docker-compose pull
    
    # Start services
    docker-compose up -d
    
    print_status "Services started"
}

# Function to check service health
check_services_health() {
    print_info "Checking service health..."
    
    services=(
        "postgres:5432"
        "redis:6379" 
        "qdrant:6333"
        "ollama:11434"
        "prometheus:9090"
        "grafana:3000"
        "minio:9000"
    )
    
    for service in "${services[@]}"; do
        IFS=':' read -r host port <<< "$service"
        
        if docker-compose -f "$INFRA_DIR/docker/docker-compose.yml" exec -T "$host" timeout 5 bash -c "echo > /dev/tcp/localhost/$port" 2>/dev/null; then
            print_status "$host is healthy"
        else
            print_warning "$host is not responding"
        fi
    done
}

# Function to display access information
display_access_info() {
    echo
    echo -e "${BLUE}🎉 Development Environment Ready!${NC}"
    echo "=================================="
    echo
    echo -e "${GREEN}Service Access URLs:${NC}"
    echo "• Web Application:      http://localhost:3000"
    echo "• API Server:          http://localhost:8000"
    echo "• WebSocket:           ws://localhost:8001"
    echo "• Grafana:             http://localhost:3001 (admin/admin)"
    echo "• Prometheus:          http://localhost:9090"
    echo "• MinIO Console:       http://localhost:9001 (minioadmin/minioadmin)"
    echo "• MailHog:             http://localhost:8025"
    echo "• Qdrant Dashboard:    http://localhost:6333/dashboard"
    echo
    echo -e "${GREEN}Database Connections:${NC}"
    echo "• PostgreSQL:          localhost:5432 (postgres/password)"
    echo "• Redis:               localhost:6379"
    echo
    echo -e "${GREEN}Useful Commands:${NC}"
    echo "• View logs:           docker-compose -f infrastructure/docker/docker-compose.yml logs -f"
    echo "• Stop services:       docker-compose -f infrastructure/docker/docker-compose.yml down"
    echo "• Restart service:     docker-compose -f infrastructure/docker/docker-compose.yml restart <service>"
    echo "• Enter container:     docker-compose -f infrastructure/docker/docker-compose.yml exec <service> bash"
    echo
    echo -e "${YELLOW}Next Steps:${NC}"
    echo "1. Start developing your application in the apps/ directory"
    echo "2. Use the provided Docker Compose setup for local testing"
    echo "3. Check the infrastructure/docs/ directory for detailed documentation"
    echo
}

# Main execution
main() {
    echo "Starting development environment setup..."
    
    # Check prerequisites
    check_docker
    check_nodejs
    check_kubectl
    check_helm
    
    # Setup environment
    create_directories
    generate_env_files
    
    # Start services
    start_services
    
    # Post-setup tasks
    sleep 10  # Give services time to start
    initialize_ollama
    run_migrations
    
    # Health checks
    sleep 20
    check_services_health
    
    # Display information
    display_access_info
    
    print_status "Development environment setup completed!"
}

# Handle interruption
trap 'echo -e "\n${YELLOW}Setup interrupted. Cleaning up...${NC}"; docker-compose -f "$INFRA_DIR/docker/docker-compose.yml" down; exit 1' INT

# Check if script is run with --help
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    echo "Fine Print AI - Development Environment Setup"
    echo
    echo "Usage: $0 [options]"
    echo
    echo "Options:"
    echo "  --help, -h     Show this help message"
    echo "  --clean        Clean up existing containers and volumes before setup"
    echo "  --no-models    Skip downloading Ollama models"
    echo
    exit 0
fi

# Check if script is run with --clean
if [[ "$1" == "--clean" ]]; then
    print_info "Cleaning up existing environment..."
    docker-compose -f "$INFRA_DIR/docker/docker-compose.yml" down -v
    docker system prune -f
    print_status "Cleanup completed"
fi

# Run main function
main

exit 0