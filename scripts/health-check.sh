#!/bin/bash

# Fine Print AI - System Health Check Script
# This script verifies all services are running and healthy

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
echo "                      🏥 FINE PRINT AI - HEALTH CHECK                        "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

# Health check function
check_service() {
    local name=$1
    local url=$2
    local expected_status=${3:-200}
    
    echo -n -e "${YELLOW}🔍 Checking $name...${NC}"
    
    if response=$(curl -s -w "%{http_code}" -o /dev/null "$url" 2>/dev/null); then
        if [ "$response" = "$expected_status" ]; then
            echo -e " ${GREEN}✅ Healthy${NC}"
            return 0
        else
            echo -e " ${RED}❌ Unhealthy (HTTP $response)${NC}"
            return 1
        fi
    else
        echo -e " ${RED}❌ Unreachable${NC}"
        return 1
    fi
}

# Database connection check
check_database() {
    local name=$1
    local connection_string=$2
    
    echo -n -e "${YELLOW}🔍 Checking $name...${NC}"
    
    if docker exec $(docker-compose -f infrastructure/docker/docker-compose.yml ps -q postgres) pg_isready -h localhost -p 5432 > /dev/null 2>&1; then
        echo -e " ${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e " ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Redis check
check_redis() {
    echo -n -e "${YELLOW}🔍 Checking Redis...${NC}"
    
    if docker exec $(docker-compose -f infrastructure/docker/docker-compose.yml ps -q redis) redis-cli ping | grep -q "PONG"; then
        echo -e " ${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e " ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Neo4j check
check_neo4j() {
    echo -n -e "${YELLOW}🔍 Checking Neo4j...${NC}"
    
    if curl -s -u neo4j:password "http://localhost:7474/db/data/" > /dev/null 2>&1; then
        echo -e " ${GREEN}✅ Connected${NC}"
        return 0
    else
        echo -e " ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Ollama models check
check_ollama_models() {
    echo -n -e "${YELLOW}🔍 Checking Ollama models...${NC}"
    
    if models=$(curl -s "http://localhost:11434/api/tags" 2>/dev/null | jq -r '.models[].name' 2>/dev/null); then
        model_count=$(echo "$models" | wc -l)
        if [ "$model_count" -gt 0 ]; then
            echo -e " ${GREEN}✅ $model_count models available${NC}"
            return 0
        else
            echo -e " ${YELLOW}⚠️ No models available${NC}"
            return 1
        fi
    else
        echo -e " ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Change to project root
cd "$PROJECT_ROOT"

total_checks=0
passed_checks=0

echo -e "${CYAN}🏗️ Infrastructure Services:${NC}"

# Infrastructure checks
services=(
    "PostgreSQL Database:check_database:postgres:postgresql://postgres:password@localhost:5432/fineprintai"
    "Redis Cache:check_redis"
    "Neo4j Graph DB:check_neo4j"
    "Qdrant Vector DB:check_service:http://localhost:6333"
    "Ollama AI Service:check_service:http://localhost:11434"
    "Ollama Models:check_ollama_models"
)

for service_info in "${services[@]}"; do
    IFS=':' read -r name check_type url <<< "$service_info"
    ((total_checks++))
    
    case $check_type in
        "check_service")
            if check_service "$name" "$url"; then
                ((passed_checks++))
            fi
            ;;
        "check_database")
            if check_database "$name" "$url"; then
                ((passed_checks++))
            fi
            ;;
        "check_redis")
            if check_redis; then
                ((passed_checks++))
            fi
            ;;
        "check_neo4j")
            if check_neo4j; then
                ((passed_checks++))
            fi
            ;;
        "check_ollama_models")
            if check_ollama_models; then
                ((passed_checks++))
            fi
            ;;
    esac
done

echo ""
echo -e "${PURPLE}🤖 Autonomous Agent Services:${NC}"

# Agent services
agent_services=(
    "Agent Orchestration:http://localhost:3010/health"
    "DSPy Framework:http://localhost:3011/health"
    "LoRA Service:http://localhost:3012/health"
    "Knowledge Graph:http://localhost:3013/health"
    "Full-Stack Agent:http://localhost:3014/health"
    "AI/ML Engineering:http://localhost:3015/health"
    "Design System:http://localhost:3016/health"
    "DevOps Agent:http://localhost:3017/health"
    "Sales Agent:http://localhost:3018/health"
    "Marketing Agent:http://localhost:3019/health"
)

for service_info in "${agent_services[@]}"; do
    IFS=':' read -r name url <<< "$service_info"
    ((total_checks++))
    
    if check_service "$name" "$url"; then
        ((passed_checks++))
    fi
done

echo ""
echo -e "${GREEN}🌐 Application Services:${NC}"

# Application services
app_services=(
    "Web Application:http://localhost:3003"
    "API Server:http://localhost:8000/health"
    "WebSocket Server:http://localhost:8002"
)

for service_info in "${app_services[@]}"; do
    IFS=':' read -r name url <<< "$service_info"
    ((total_checks++))
    
    if check_service "$name" "$url"; then
        ((passed_checks++))
    fi
done

echo ""
echo -e "${CYAN}📊 Monitoring Services:${NC}"

# Monitoring services
monitoring_services=(
    "Prometheus:http://localhost:9090/-/healthy"
    "Grafana:http://localhost:3001/api/health"
    "Jaeger:http://localhost:16686"
    "MailHog:http://localhost:8025"
)

for service_info in "${monitoring_services[@]}"; do
    IFS=':' read -r name url <<< "$service_info"
    ((total_checks++))
    
    if check_service "$name" "$url"; then
        ((passed_checks++))
    fi
done

# Summary
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}                              📊 HEALTH SUMMARY                               ${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

health_percentage=$((passed_checks * 100 / total_checks))

if [ $health_percentage -eq 100 ]; then
    echo -e "${GREEN}🎉 All systems operational! ($passed_checks/$total_checks services healthy)${NC}"
    echo -e "${GREEN}✅ Fine Print AI is ready for testing!${NC}"
elif [ $health_percentage -ge 80 ]; then
    echo -e "${YELLOW}⚠️ Most systems operational ($passed_checks/$total_checks services healthy - $health_percentage%)${NC}"
    echo -e "${YELLOW}🔧 Some services may need attention${NC}"
else
    echo -e "${RED}❌ System unhealthy ($passed_checks/$total_checks services healthy - $health_percentage%)${NC}"
    echo -e "${RED}🚨 Multiple services require attention${NC}"
fi

echo ""
echo -e "${CYAN}💡 Quick Actions:${NC}"
echo -e "  • View logs: ${BLUE}npm run logs${NC}"
echo -e "  • Restart services: ${BLUE}npm run restart${NC}"
echo -e "  • Check status: ${BLUE}npm run status${NC}"
echo -e "  • Access web app: ${BLUE}http://localhost:3003${NC}"
echo ""

if [ $health_percentage -lt 100 ]; then
    exit 1
else
    exit 0
fi