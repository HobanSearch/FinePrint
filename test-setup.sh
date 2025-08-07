#!/bin/bash

# Fine Print AI - Test Setup Script
# This script tests the development environment setup

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Fine Print AI - Testing Development Environment${NC}"
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

# Function to test service connectivity
test_service() {
    local service_name="$1"
    local host="$2"
    local port="$3"
    local timeout="${4:-5}"
    
    print_info "Testing $service_name connectivity..."
    
    if timeout "$timeout" bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        print_status "$service_name is accessible at $host:$port"
        return 0
    else
        print_error "$service_name is not accessible at $host:$port"
        return 1
    fi
}

# Function to test HTTP service
test_http_service() {
    local service_name="$1"
    local url="$2"
    local expected_status="${3:-200}"
    
    print_info "Testing $service_name HTTP endpoint..."
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        print_status "$service_name HTTP endpoint is working at $url"
        return 0
    else
        print_error "$service_name HTTP endpoint failed at $url"
        return 1
    fi
}

# Test infrastructure services
print_info "Testing infrastructure services..."

test_service "PostgreSQL" "localhost" "5432"
test_service "Redis" "localhost" "6379"
test_service "Qdrant" "localhost" "6333"
test_service "Ollama" "localhost" "11434"
test_service "Elasticsearch" "localhost" "9200"
test_service "Prometheus" "localhost" "9090"
test_service "Grafana" "localhost" "3001"
test_service "Loki" "localhost" "3100"
test_service "Jaeger" "localhost" "16686"
test_service "MailHog" "localhost" "8025"
test_service "MinIO" "localhost" "9000"

# Test HTTP endpoints
print_info "Testing HTTP endpoints..."

test_http_service "Qdrant" "http://localhost:6333/dashboard" "200" || true
test_http_service "Prometheus" "http://localhost:9090" "200" || true
test_http_service "Grafana" "http://localhost:3001" "200" || true
test_http_service "Jaeger" "http://localhost:16686" "200" || true
test_http_service "MailHog" "http://localhost:8025" "200" || true
test_http_service "MinIO Console" "http://localhost:9001" "200" || true

# Check Docker containers
print_info "Checking Docker containers..."
echo
docker-compose -f infrastructure/docker/docker-compose.infrastructure.yml ps
echo

print_status "Environment testing completed!"

echo
echo -e "${GREEN}🎉 Development Environment Status${NC}"
echo "================================="
echo
echo -e "${GREEN}Infrastructure Services:${NC}"
echo "• PostgreSQL:        http://localhost:5432"
echo "• Redis:             http://localhost:6379"
echo "• Qdrant:            http://localhost:6333/dashboard"
echo "• Ollama:            http://localhost:11434"
echo "• Prometheus:        http://localhost:9090"
echo "• Grafana:           http://localhost:3001 (admin/admin)"
echo "• MinIO Console:     http://localhost:9001 (minioadmin/minioadmin)"
echo "• MailHog:           http://localhost:8025"
echo "• Jaeger:            http://localhost:16686"
echo
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Run: ./install-deps.sh to install application dependencies"
echo "2. Uncomment application services in docker-compose.yml"
echo "3. Start application services: docker-compose up -d"
echo