#!/bin/bash

# Fine Print AI - Local Development Quick Start
# This script starts the entire system locally

set -e

echo "🚀 Starting Fine Print AI - Autonomous Business Operations Platform"
echo "=================================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to check if port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${YELLOW}⚠️  Port $1 is already in use${NC}"
        return 1
    fi
    return 0
}

# Check if setup has been run
if [ ! -f ".env/local.env" ]; then
    echo -e "${YELLOW}First time setup detected. Running setup script...${NC}"
    ./scripts/setup-local-env.sh
fi

# Load environment variables
export $(cat .env/local.env | grep -v '^#' | xargs)

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${YELLOW}Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

# Start Docker services
echo -e "\n${BLUE}Starting Docker services...${NC}"
docker-compose -f docker-compose.local.yml up -d

# Wait for databases to be ready
echo -e "\n${BLUE}Waiting for databases to be ready...${NC}"
sleep 10

# Check database health
echo -e "\n${BLUE}Checking database health...${NC}"
docker exec fineprintai-postgres pg_isready -U fineprintai || {
    echo "PostgreSQL is not ready"
    exit 1
}
echo "✅ PostgreSQL is ready"

docker exec fineprintai-redis redis-cli -a fineprintai_redis_2024 ping || {
    echo "Redis is not ready"
    exit 1
}
echo "✅ Redis is ready"

docker exec fineprintai-neo4j cypher-shell -u neo4j -p fineprintai_neo4j_2024 "RETURN 1" || {
    echo "Neo4j is not ready"
    exit 1
}
echo "✅ Neo4j is ready"

# Check if Ollama models are available
echo -e "\n${BLUE}Checking AI models...${NC}"
if ! docker exec fineprintai-ollama ollama list | grep -q "phi"; then
    echo "Pulling phi model..."
    docker exec fineprintai-ollama ollama pull phi
fi
echo "✅ AI models ready"

# Initialize databases if needed
if ! docker exec fineprintai-postgres psql -U fineprintai -d fineprintai -c "SELECT 1 FROM config.configurations LIMIT 1" > /dev/null 2>&1; then
    echo -e "\n${BLUE}Initializing databases...${NC}"
    npm run db:init
fi

# Check required ports
echo -e "\n${BLUE}Checking service ports...${NC}"
PORTS=(8001 8002 8003 8004 8005 8006 8007 8008 8009 8010)
ALL_CLEAR=true

for PORT in "${PORTS[@]}"; do
    if ! check_port $PORT; then
        ALL_CLEAR=false
    fi
done

if [ "$ALL_CLEAR" = false ]; then
    echo -e "${YELLOW}Some ports are in use. Stop conflicting services or change ports in .env/local.env${NC}"
    exit 1
fi

# Create a tmux session for services
echo -e "\n${BLUE}Starting all services...${NC}"

# Check if tmux session exists
tmux has-session -t fineprintai 2>/dev/null && {
    echo "Killing existing tmux session..."
    tmux kill-session -t fineprintai
}

# Create new tmux session
tmux new-session -d -s fineprintai -n services

# Split window into panes for each service
tmux split-window -h -t fineprintai:services
tmux split-window -v -t fineprintai:services.0
tmux split-window -v -t fineprintai:services.1
tmux split-window -h -t fineprintai:services.2
tmux split-window -h -t fineprintai:services.3
tmux split-window -v -t fineprintai:services.4
tmux split-window -v -t fineprintai:services.5
tmux split-window -h -t fineprintai:services.6
tmux split-window -h -t fineprintai:services.7

# Start services in each pane
tmux send-keys -t fineprintai:services.0 'cd shared/config && npm run dev' C-m
tmux send-keys -t fineprintai:services.1 'cd shared/memory && npm run dev' C-m
tmux send-keys -t fineprintai:services.2 'cd shared/logger && npm run dev' C-m
tmux send-keys -t fineprintai:services.3 'cd shared/auth && npm run dev' C-m
tmux send-keys -t fineprintai:services.4 'cd services/dspy && npm run dev' C-m
tmux send-keys -t fineprintai:services.5 'cd services/lora && npm run dev' C-m
tmux send-keys -t fineprintai:services.6 'cd services/knowledge-graph && npm run dev' C-m
tmux send-keys -t fineprintai:services.7 'cd services/agent-coordination && npm run dev' C-m
tmux send-keys -t fineprintai:services.8 'cd services/memory-persistence && npm run dev' C-m
tmux send-keys -t fineprintai:services.9 'cd services/external-integrations && npm run dev' C-m

# Create monitoring window
tmux new-window -t fineprintai -n monitoring
tmux send-keys -t fineprintai:monitoring 'docker-compose -f docker-compose.local.yml logs -f' C-m

# Wait for services to start
echo -e "\n${BLUE}Waiting for services to start...${NC}"
sleep 15

# Run health check
echo -e "\n${BLUE}Running health check...${NC}"
./scripts/health-check.sh || {
    echo -e "${YELLOW}Some services may still be starting. Wait a moment and run: npm run health:check${NC}"
}

# Display access information
echo -e "\n${GREEN}✅ Fine Print AI is running!${NC}"
echo ""
echo "📡 Service Endpoints:"
echo "  - Config Service:          http://localhost:8001"
echo "  - Memory Service:          http://localhost:8002"
echo "  - Logger Service:          http://localhost:8003"
echo "  - Auth Service:            http://localhost:8004"
echo "  - DSPy Service:            http://localhost:8005"
echo "  - LoRA Service:            http://localhost:8006"
echo "  - Knowledge Graph:         http://localhost:8007"
echo "  - Agent Coordination:      http://localhost:8008"
echo "  - Memory Persistence:      http://localhost:8009"
echo "  - External Integrations:   http://localhost:8010"
echo ""
echo "🔧 Development Tools:"
echo "  - Neo4j Browser:    http://localhost:7474 (neo4j/fineprintai_neo4j_2024)"
echo "  - Grafana:          http://localhost:3001 (admin/admin)"
echo "  - Prometheus:       http://localhost:9090"
echo ""
echo "💻 Useful Commands:"
echo "  - View service logs:       tmux attach -t fineprintai"
echo "  - Run all tests:           ./scripts/run-all-tests.sh"
echo "  - Run smoke tests:         npm test -- tests/smoke/smoke-test.ts"
echo "  - Check health:            npm run health:check"
echo "  - Stop everything:         ./stop-local.sh"
echo ""
echo "📚 Documentation:"
echo "  - System Guide:     backend/docs/AUTONOMOUS_AI_SYSTEM_INTEGRATION.md"
echo "  - Quick Start:      backend/docs/DEVELOPER_QUICK_START.md"
echo ""
echo -e "${GREEN}Happy coding! 🎉${NC}"