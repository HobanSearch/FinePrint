#!/bin/bash

# Fine Print AI - Production Deployment Script
# This script deploys Fine Print AI to a VPS server

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOYMENT_DIR="/opt/fineprintai"
REPO_URL="https://github.com/HobanSearch/FinePrint.git"
BRANCH="main"
DOCKER_COMPOSE_FILE="deployment/vps/docker-compose.production.yml"
ENV_FILE=".env.production"
BACKUP_DIR="/var/backups/fineprintai"

# Functions
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

check_requirements() {
    log_info "Checking system requirements..."
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ]; then 
        log_error "Please run this script as root or with sudo"
        exit 1
    fi
    
    # Check required commands
    local required_commands=("git" "docker" "docker-compose" "curl" "systemctl")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "$cmd is not installed. Please install it first."
            exit 1
        fi
    done
    
    # Check Docker service
    if ! systemctl is-active --quiet docker; then
        log_warning "Docker service is not running. Starting Docker..."
        systemctl start docker
        systemctl enable docker
    fi
    
    # Check available disk space (minimum 20GB)
    local available_space=$(df / | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 20971520 ]; then
        log_error "Insufficient disk space. At least 20GB required."
        exit 1
    fi
    
    # Check available memory (minimum 8GB)
    local available_memory=$(free -m | awk 'NR==2 {print $2}')
    if [ "$available_memory" -lt 8000 ]; then
        log_warning "Less than 8GB RAM available. Performance may be affected."
    fi
    
    log_success "System requirements check passed"
}

setup_directories() {
    log_info "Setting up deployment directories..."
    
    # Create necessary directories
    mkdir -p "$DEPLOYMENT_DIR"
    mkdir -p "$BACKUP_DIR"
    mkdir -p "/var/log/fineprintai"
    
    # Set permissions
    chmod 755 "$DEPLOYMENT_DIR"
    chmod 755 "$BACKUP_DIR"
    chmod 755 "/var/log/fineprintai"
    
    log_success "Directories created successfully"
}

clone_or_update_repo() {
    log_info "Setting up repository..."
    
    cd "$DEPLOYMENT_DIR"
    
    if [ -d ".git" ]; then
        log_info "Repository exists. Pulling latest changes..."
        git fetch origin
        git checkout "$BRANCH"
        git pull origin "$BRANCH"
    else
        log_info "Cloning repository..."
        git clone "$REPO_URL" .
        git checkout "$BRANCH"
    fi
    
    log_success "Repository updated to latest version"
}

setup_environment() {
    log_info "Setting up environment configuration..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Check if production env file exists
    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "deployment/vps/.env.production.example" ]; then
            cp "deployment/vps/.env.production.example" "$ENV_FILE"
            log_warning "Created $ENV_FILE from template. Please edit it with your actual values."
            log_warning "Press Enter after you've updated the configuration file..."
            read
        else
            log_error "Environment configuration file not found!"
            exit 1
        fi
    fi
    
    # Validate essential environment variables
    source "$ENV_FILE"
    
    if [ -z "$DOMAIN_NAME" ] || [ "$DOMAIN_NAME" == "fineprintai.com" ]; then
        log_error "Please set DOMAIN_NAME in $ENV_FILE"
        exit 1
    fi
    
    if [ "$DB_PASSWORD" == "CHANGE_THIS_SECURE_PASSWORD_1234567890" ]; then
        log_error "Please change default passwords in $ENV_FILE"
        exit 1
    fi
    
    log_success "Environment configuration validated"
}

pull_docker_images() {
    log_info "Pulling Docker images..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Pull all images defined in docker-compose
    docker-compose -f "$DOCKER_COMPOSE_FILE" pull
    
    log_success "Docker images pulled successfully"
}

build_services() {
    log_info "Building application services..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Build custom images
    docker-compose -f "$DOCKER_COMPOSE_FILE" build --parallel
    
    log_success "Services built successfully"
}

initialize_database() {
    log_info "Initializing database..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Start only database service
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U "$DB_USER" -d "$DB_NAME" &>/dev/null; then
            log_success "Database is ready"
            break
        fi
        attempt=$((attempt + 1))
        sleep 2
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_error "Database failed to start"
        exit 1
    fi
    
    # Run migrations if needed
    # docker-compose -f "$DOCKER_COMPOSE_FILE" run --rm api npm run migrate
    
    log_success "Database initialized successfully"
}

start_services() {
    log_info "Starting all services..."
    
    cd "$DEPLOYMENT_DIR"
    
    # Start all services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d
    
    # Wait for services to be healthy
    log_info "Waiting for services to be healthy..."
    sleep 30
    
    log_success "All services started successfully"
}

verify_deployment() {
    log_info "Verifying deployment..."
    
    local services=("nginx" "api" "web" "postgres" "redis")
    local all_healthy=true
    
    for service in "${services[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}" | grep -q "fineprintai-$service.*healthy\|Up"; then
            log_success "$service is running"
        else
            log_error "$service is not healthy"
            all_healthy=false
        fi
    done
    
    if [ "$all_healthy" = true ]; then
        log_success "All services are healthy"
        
        # Test API endpoint
        if curl -s -o /dev/null -w "%{http_code}" "http://localhost/api/health" | grep -q "200"; then
            log_success "API is responding"
        else
            log_warning "API health check failed"
        fi
    else
        log_error "Some services are not healthy. Check logs with: docker-compose -f $DOCKER_COMPOSE_FILE logs"
        exit 1
    fi
}

setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    # Check if SSL setup script exists
    if [ -f "$DEPLOYMENT_DIR/deployment/vps/scripts/setup-ssl.sh" ]; then
        bash "$DEPLOYMENT_DIR/deployment/vps/scripts/setup-ssl.sh"
    else
        log_warning "SSL setup script not found. Please set up SSL manually."
    fi
}

setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Start monitoring stack
    if [ -f "$DEPLOYMENT_DIR/deployment/vps/monitoring/docker-compose.monitoring.yml" ]; then
        docker-compose -f "$DEPLOYMENT_DIR/deployment/vps/monitoring/docker-compose.monitoring.yml" up -d
        log_success "Monitoring stack deployed"
    else
        log_warning "Monitoring configuration not found"
    fi
}

setup_backups() {
    log_info "Setting up automated backups..."
    
    # Create backup script symlink
    if [ -f "$DEPLOYMENT_DIR/deployment/vps/scripts/backup.sh" ]; then
        ln -sf "$DEPLOYMENT_DIR/deployment/vps/scripts/backup.sh" /etc/cron.daily/fineprintai-backup
        chmod +x /etc/cron.daily/fineprintai-backup
        log_success "Automated daily backups configured"
    else
        log_warning "Backup script not found"
    fi
}

print_summary() {
    echo ""
    echo "=========================================="
    echo -e "${GREEN}Fine Print AI Deployment Complete!${NC}"
    echo "=========================================="
    echo ""
    echo "Access Points:"
    echo "  Web Application: https://$DOMAIN_NAME"
    echo "  API: https://$DOMAIN_NAME/api"
    echo "  WebSocket: wss://$DOMAIN_NAME/ws"
    echo ""
    echo "Management Commands:"
    echo "  View logs: docker-compose -f $DOCKER_COMPOSE_FILE logs -f [service]"
    echo "  Restart services: docker-compose -f $DOCKER_COMPOSE_FILE restart"
    echo "  Stop services: docker-compose -f $DOCKER_COMPOSE_FILE down"
    echo "  Backup database: $DEPLOYMENT_DIR/deployment/vps/scripts/backup.sh"
    echo ""
    echo "Next Steps:"
    echo "  1. Configure SSL certificates (if not done)"
    echo "  2. Set up DNS records for $DOMAIN_NAME"
    echo "  3. Configure firewall rules"
    echo "  4. Set up monitoring alerts"
    echo "  5. Test all functionality"
    echo ""
}

# Main execution
main() {
    echo "=========================================="
    echo "Fine Print AI - Production Deployment"
    echo "=========================================="
    echo ""
    
    check_requirements
    setup_directories
    clone_or_update_repo
    setup_environment
    pull_docker_images
    build_services
    initialize_database
    start_services
    verify_deployment
    setup_ssl
    setup_monitoring
    setup_backups
    print_summary
}

# Run main function
main "$@"