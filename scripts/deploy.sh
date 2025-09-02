#!/bin/bash

# Fine Print AI Deployment Script
# This script deploys the application using Docker Compose

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root (recommended for Docker)
if [[ $EUID -ne 0 ]]; then
   print_warning "This script is recommended to run as root for Docker operations"
fi

# Check prerequisites
print_status "Checking prerequisites..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if environment file exists
if [ ! -f "$ENV_FILE" ]; then
    print_error "Environment file $ENV_FILE not found!"
    print_status "Creating from template..."
    cp .env.production.template .env.production 2>/dev/null || {
        print_error "No template found. Please create $ENV_FILE with required variables."
        exit 1
    }
    print_warning "Please edit $ENV_FILE with your configuration values before continuing."
    exit 1
fi

# Load environment variables
export $(cat $ENV_FILE | grep -v '^#' | xargs)

# Validate required environment variables
required_vars=(
    "DOMAIN"
    "DB_NAME"
    "DB_USER"
    "DB_PASSWORD"
    "JWT_SECRET"
    "JWT_REFRESH_SECRET"
)

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "Required environment variable $var is not set in $ENV_FILE"
        exit 1
    fi
done

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p nginx/ssl
mkdir -p $BACKUP_DIR
mkdir -p data/{postgres,redis,qdrant,ollama}

# Stop existing containers if running
print_status "Stopping existing containers..."
docker-compose down 2>/dev/null || true

# Pull latest images
print_status "Pulling latest Docker images..."
docker-compose pull

# Build custom images
print_status "Building application images..."
docker-compose build --no-cache

# Start infrastructure services first
print_status "Starting infrastructure services..."
docker-compose up -d postgres redis qdrant ollama

# Wait for PostgreSQL to be ready
print_status "Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U $DB_USER -d $DB_NAME; do
    print_status "PostgreSQL is unavailable - sleeping"
    sleep 2
done
print_status "PostgreSQL is ready!"

# Run database migrations
print_status "Running database migrations..."
docker-compose run --rm api npm run db:migrate || {
    print_warning "Migration failed. This might be expected on first run."
}

# Pull Ollama models if not already present
print_status "Checking Ollama models..."
./scripts/pull-models.sh || {
    print_warning "Model pulling can be done later with ./scripts/pull-models.sh"
}

# Start all services
print_status "Starting all services..."
docker-compose up -d

# Wait for services to be healthy
print_status "Waiting for services to be healthy..."
sleep 10

# Check service health
print_status "Checking service health..."
services=("web" "api" "websocket" "worker")
all_healthy=true

for service in "${services[@]}"; do
    if docker-compose ps | grep $service | grep -q "Up"; then
        print_status "✓ $service is running"
    else
        print_error "✗ $service is not running"
        all_healthy=false
    fi
done

# Setup SSL if certificates don't exist
if [ ! -f "nginx/ssl/fullchain.pem" ]; then
    print_status "SSL certificates not found. Running SSL setup..."
    ./scripts/ssl-setup.sh || {
        print_warning "SSL setup failed. You can run it manually later with ./scripts/ssl-setup.sh"
    }
fi

# Show deployment summary
echo ""
print_status "========================================="
print_status "Deployment Summary"
print_status "========================================="

if [ "$all_healthy" = true ]; then
    print_status "✓ All services are running successfully!"
    echo ""
    print_status "Application URLs:"
    print_status "  Main App: https://$DOMAIN"
    print_status "  API: https://$DOMAIN/api"
    print_status "  WebSocket: wss://$DOMAIN/ws"
    echo ""
    print_status "Useful commands:"
    print_status "  View logs: docker-compose logs -f [service]"
    print_status "  Stop services: docker-compose down"
    print_status "  Restart service: docker-compose restart [service]"
    print_status "  View status: docker-compose ps"
    echo ""
    print_status "Next steps:"
    print_status "  1. Configure your domain DNS to point to this server"
    print_status "  2. Setup SSL certificates with: ./scripts/ssl-setup.sh"
    print_status "  3. Configure Stripe webhooks in the Stripe Dashboard"
    print_status "  4. Test the application at https://$DOMAIN"
else
    print_error "Some services failed to start. Check logs with:"
    print_error "  docker-compose logs [service-name]"
    exit 1
fi

print_status "Deployment complete!"