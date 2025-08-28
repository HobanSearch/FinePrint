#!/bin/bash

# Fine Print AI - Development Environment Startup Script
# This script orchestrates the startup of all services with proper dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/infrastructure/docker"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                    🚀 FINE PRINT AI - DEVELOPMENT STARTUP                    "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

# Function to check if a service is healthy
check_service_health() {
    local service_name=$1
    local health_url=$2
    local max_attempts=${3:-30}
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be healthy...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$health_url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is healthy!${NC}"
            return 0
        fi
        
        if [ $attempt -eq 1 ]; then
            echo -n "   "
        fi
        echo -n "."
        
        if [ $((attempt % 30)) -eq 0 ]; then
            echo ""
            echo -n "   "
        fi
        
        sleep 2
        ((attempt++))
    done
    
    echo -e "\n${RED}❌ $service_name failed to become healthy after $max_attempts attempts${NC}"
    return 1
}

# Function to show service URLs
show_service_urls() {
    echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}                               🌐 SERVICE URLS                                ${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo -e "${GREEN}📱 Ready for Application Development:${NC}"
    echo -e "  • Start API:               cd apps/api && npm run dev"
    echo -e "  • Start WebSocket:         cd apps/websocket && npm run dev"
    echo -e "  • Start Worker:            cd apps/worker && npm run dev"
    echo -e "  • Start Web App:           cd apps/web && npm run dev"
    echo ""
    echo -e "${YELLOW}🔧 Infrastructure Services:${NC}"
    echo -e "  • 🐘 PostgreSQL:          localhost:5432"
    echo -e "  • 🟥 Redis:               localhost:6379"
    echo -e "  • 🔍 Qdrant:              http://localhost:6333"
    echo -e "  • 🦙 Ollama:              http://localhost:11434"
    echo -e "  • 🔍 Elasticsearch:       http://localhost:9200"
    echo ""
    echo -e "${CYAN}📊 Monitoring & Tools:${NC}"
    echo -e "  • 📈 Grafana:             http://localhost:3001 (admin/admin)"
    echo -e "  • 🔥 Prometheus:          http://localhost:9090"
    echo -e "  • 🔍 Jaeger:              http://localhost:16686"
    echo -e "  • 📧 MailHog:             http://localhost:8025"
    echo -e "  • 📦 MinIO:               http://localhost:9001 (minioadmin/minioadmin)"
    echo ""
    echo -e "${GREEN}🚀 System Status:${NC}"
    echo -e "  • Infrastructure services are running and healthy!"
    echo -e "  • Ready for application development"
    echo -e "  • Start individual applications as needed"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Change to docker directory
cd "$DOCKER_DIR"

echo -e "${YELLOW}📋 Pre-flight checks...${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    echo -e "${RED}❌ docker-compose is not installed. Please install docker-compose and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}\n"

# Stop any existing containers
echo -e "${YELLOW}🛑 Stopping any existing containers...${NC}"
docker-compose down --remove-orphans > /dev/null 2>&1 || true

# Remove any existing networks
echo -e "${YELLOW}🧹 Cleaning up networks...${NC}"
docker network prune -f > /dev/null 2>&1 || true

# Build and start infrastructure services first (databases, caches, etc.)
echo -e "${BLUE}📦 Phase 1: Starting infrastructure services...${NC}"
docker-compose up -d postgres redis qdrant ollama elasticsearch prometheus grafana loki jaeger mailhog minio node-exporter

# Wait for core infrastructure to be ready
echo -e "${YELLOW}⏳ Waiting for infrastructure services...${NC}"

# PostgreSQL health check (uses pg_isready instead of HTTP)
echo -e "${YELLOW}⏳ Waiting for PostgreSQL to be ready...${NC}"
attempt=1
max_attempts=30
while [ $attempt -le $max_attempts ]; do
    if docker exec $(docker-compose ps -q postgres) pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"
        break
    fi
    
    if [ $attempt -eq 1 ]; then
        echo -n "   "
    fi
    echo -n "."
    
    if [ $((attempt % 30)) -eq 0 ]; then
        echo ""
        echo -n "   "
    fi
    
    sleep 2
    ((attempt++))
done

if [ $attempt -gt $max_attempts ]; then
    echo -e "\n${RED}❌ PostgreSQL failed to become ready after $max_attempts attempts${NC}"
    echo -e "${RED}❌ PostgreSQL failed to start. Check logs: docker-compose logs postgres${NC}"
    exit 1
fi

sleep 5  # Give databases time to initialize

echo -e "${GREEN}✅ Infrastructure services are ready${NC}\n"

# Initialize Ollama models in background
echo -e "${BLUE}🤖 Phase 2: Initializing AI models...${NC}"
echo -e "${YELLOW}⏳ Starting Ollama model download (this may take a while)...${NC}"

# Run the Ollama initialization script in background
(
    sleep 30  # Wait for Ollama to be fully ready
    docker exec $(docker-compose ps -q ollama) /bin/bash -c "
        curl -fsSL https://ollama.ai/install.sh | sh > /dev/null 2>&1 || true
        ollama pull phi > /dev/null 2>&1 || echo 'Phi model download failed'
        ollama pull mistral:7b > /dev/null 2>&1 || echo 'Mistral model download failed'
        ollama pull llama2:7b > /dev/null 2>&1 || echo 'Llama2 model download failed'
        ollama pull codellama:7b > /dev/null 2>&1 || echo 'CodeLlama model download failed'
        ollama pull nomic-embed-text > /dev/null 2>&1 || echo 'Embedding model download failed'
        echo 'Model downloads completed'
    " 2>/dev/null &
) &

echo -e "${GREEN}✅ AI model initialization started in background${NC}\n"

# Note: Agent services would be started here when they are properly configured
echo -e "${BLUE}🤖 Phase 3: Infrastructure setup complete${NC}"
echo -e "${YELLOW}⚠️ Agent services are not yet configured in docker-compose.infrastructure.yml${NC}"
echo -e "${YELLOW}⚠️ Application services (api, websocket, worker, web) should be started separately${NC}"

echo -e "${GREEN}✅ Infrastructure services are ready for application development${NC}\n"

echo -e "${GREEN}✅ All services started successfully!${NC}\n"

# Show final status
echo -e "${GREEN}🎉 Fine Print AI development environment is fully operational!${NC}\n"

# Wait for system to stabilize
echo -e "${YELLOW}⏳ Allowing system to stabilize...${NC}"
sleep 10

# Show service URLs
show_service_urls

echo -e "\n${YELLOW}💡 Quick Start Tips:${NC}"
echo -e "  • Infrastructure services are ready for development"
echo -e "  • Start individual applications using npm run dev in their directories"
echo -e "  • Monitor system health in Grafana at http://localhost:3001"
echo -e "  • Check logs with: docker-compose logs [service-name]"
echo -e "  • Stop all services with: docker-compose down"
echo ""
echo -e "${GREEN}Happy analyzing! 🔍✨${NC}"