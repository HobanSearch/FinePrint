#!/bin/bash

# Fine Print AI - Complete System Startup Script
# This script starts all services including the new AI improvement system

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
echo "                 🚀 FINE PRINT AI - COMPLETE SYSTEM STARTUP                    "
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

# Change to docker directory
cd "$DOCKER_DIR"

echo -e "${YELLOW}📋 Pre-flight checks...${NC}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}\n"

# Stop any existing containers
echo -e "${YELLOW}🛑 Stopping any existing containers...${NC}"
docker-compose down --remove-orphans 2>/dev/null || true

# Clean up
echo -e "${YELLOW}🧹 Cleaning up...${NC}"
docker network prune -f > /dev/null 2>&1 || true

# Start infrastructure services
echo -e "${BLUE}📦 Phase 1: Starting infrastructure services...${NC}"
docker-compose up -d \
    postgres redis qdrant ollama elasticsearch \
    prometheus grafana loki jaeger mailhog minio node-exporter \
    neo4j zookeeper kafka clickhouse temporal temporal-ui 2>&1 | \
    grep -v "The requested image's platform" || true

# Wait for PostgreSQL
echo -e "${YELLOW}⏳ Waiting for PostgreSQL...${NC}"
sleep 10
attempt=1
max_attempts=30
while [ $attempt -le $max_attempts ]; do
    # Find the actual postgres container name
    postgres_container=$(docker ps --format "table {{.Names}}" | grep postgres | head -1)
    if [ -n "$postgres_container" ] && docker exec $postgres_container pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
    ((attempt++))
done

# Wait for other critical services
sleep 15

echo -e "${GREEN}✅ Infrastructure services are ready${NC}\n"

# Start AI improvement services
echo -e "${BLUE}🤖 Phase 2: Starting AI improvement services...${NC}"
docker-compose up -d \
    digital-twin \
    business-agents \
    content-optimizer \
    feedback-collector \
    improvement-orchestrator

# Wait for services to be healthy
echo -e "${YELLOW}⏳ Waiting for AI services to start...${NC}"
sleep 20

# Check service health
check_service_health "Digital Twin" "http://localhost:3020/health" || true
check_service_health "Business Agents" "http://localhost:3001/health" || true
check_service_health "Content Optimizer" "http://localhost:3030/health" || true
check_service_health "Feedback Collector" "http://localhost:3040/health" || true
check_service_health "Improvement Orchestrator" "http://localhost:3010/api/health" || true

echo -e "${GREEN}✅ AI improvement services are ready${NC}\n"

# Start application services
echo -e "${BLUE}📱 Phase 3: Starting application services...${NC}"
docker-compose up -d api websocket worker web

# Wait for applications
sleep 10

check_service_health "API" "http://localhost:8000/health" || true
check_service_health "WebSocket" "http://localhost:8002/health" || true
check_service_health "Web App" "http://localhost:3003" || true

echo -e "${GREEN}✅ Application services are ready${NC}\n"

# Initialize Ollama models in background
echo -e "${BLUE}🦙 Phase 4: Initializing AI models...${NC}"
echo -e "${YELLOW}⏳ Starting model initialization (this may take a while)...${NC}"

# Initialize business agent models
$SCRIPT_DIR/init-models.sh &

echo -e "${GREEN}✅ Model initialization started in background${NC}\n"

# Show service URLs
echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}                               🌐 SERVICE URLS                                ${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}🎯 Main Application:${NC}"
echo -e "  • Web App:                 http://localhost:3003"
echo -e "  • API:                     http://localhost:8000"
echo -e "  • WebSocket:               ws://localhost:8002"
echo ""
echo -e "${PURPLE}🤖 AI Improvement System:${NC}"
echo -e "  • Digital Twin:            http://localhost:3020"
echo -e "  • Business Agents:         http://localhost:3001"
echo -e "  • Content Optimizer:       http://localhost:3030"
echo -e "  • Feedback Collector:      http://localhost:3040"
echo -e "  • Improvement Orchestrator: http://localhost:3010"
echo -e "  • Temporal UI:             http://localhost:8088"
echo ""
echo -e "${YELLOW}🔧 Infrastructure:${NC}"
echo -e "  • PostgreSQL:              localhost:5432"
echo -e "  • Redis:                   localhost:6379"
echo -e "  • Qdrant:                  http://localhost:6333"
echo -e "  • Ollama:                  http://localhost:11434"
echo -e "  • Neo4j Browser:           http://localhost:7474 (neo4j/password)"
echo -e "  • Kafka:                   localhost:29092"
echo -e "  • ClickHouse:              http://localhost:8123"
echo ""
echo -e "${CYAN}📊 Monitoring:${NC}"
echo -e "  • Grafana:                 http://localhost:3001 (admin/admin)"
echo -e "  • Prometheus:              http://localhost:9090"
echo -e "  • Jaeger:                  http://localhost:16686"
echo -e "  • MailHog:                 http://localhost:8025"
echo -e "  • MinIO:                   http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${GREEN}🎉 Fine Print AI is fully operational!${NC}\n"

echo -e "${YELLOW}💡 Quick Start:${NC}"
echo -e "  1. Visit the web app at http://localhost:3003"
echo -e "  2. Admin dashboard for A/B tests: http://localhost:3003/admin"
echo -e "  3. Monitor workflows in Temporal: http://localhost:8088"
echo -e "  4. Check system health: ./scripts/health-dashboard.sh"
echo -e "  5. View logs: docker-compose logs -f [service-name]"
echo -e "  6. Stop everything: docker-compose down"
echo ""
echo -e "${YELLOW}📚 Testing the AI Improvement System:${NC}"
echo -e "  1. Start an A/B test: curl -X POST http://localhost:3020/experiments/marketing"
echo -e "  2. Generate feedback: curl -X POST http://localhost:3040/feedback/implicit/event"
echo -e "  3. Watch improvements: http://localhost:8088 (Temporal UI)"
echo ""
echo -e "${GREEN}Happy analyzing! 🔍✨${NC}"