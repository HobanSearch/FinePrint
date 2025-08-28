#!/bin/bash

# Fine Print AI - Health Check Dashboard
# Shows the health status of all services in the system

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Clear screen and show header
clear
echo -e "${BLUE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                     🏥 FINE PRINT AI - SYSTEM HEALTH DASHBOARD                  "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Function to check service health
check_health() {
    local service_name=$1
    local health_url=$2
    local display_name=${3:-$service_name}
    
    printf "%-30s" "$display_name"
    
    if curl -s -f --connect-timeout 2 "$health_url" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ HEALTHY${NC}"
        return 0
    else
        echo -e "${RED}❌ UNHEALTHY${NC}"
        return 1
    fi
}

# Function to check Docker container status
check_container() {
    local container_name=$1
    local display_name=${2:-$container_name}
    
    printf "%-30s" "$display_name"
    
    if docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
        echo -e "${GREEN}✅ RUNNING${NC}"
        return 0
    else
        echo -e "${RED}❌ NOT RUNNING${NC}"
        return 1
    fi
}

# Function to check port availability
check_port() {
    local port=$1
    local service_name=$2
    
    printf "%-30s" "$service_name (port $port)"
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✅ LISTENING${NC}"
        return 0
    else
        echo -e "${RED}❌ NOT LISTENING${NC}"
        return 1
    fi
}

# Application Services
echo -e "${GREEN}📱 Application Services${NC}"
echo "─────────────────────────────────────────────────"
check_health "Web App" "http://localhost:3003" "Web Application"
check_health "API Server" "http://localhost:8000/health" "API Server"
check_health "WebSocket Server" "http://localhost:8002/health" "WebSocket Server"
echo ""

# AI Improvement Services
echo -e "${PURPLE}🤖 AI Improvement Services${NC}"
echo "─────────────────────────────────────────────────"
check_health "Digital Twin" "http://localhost:3020/health" "Digital Twin Service"
check_health "Business Agents" "http://localhost:3001/health" "Business Agents API"
check_health "Content Optimizer" "http://localhost:3030/health" "Content Optimizer"
check_health "Feedback Collector" "http://localhost:3040/health" "Feedback Collector"
check_health "Improvement Orchestrator" "http://localhost:3010/api/health" "Improvement Orchestrator"
echo ""

# Infrastructure Services
echo -e "${YELLOW}🔧 Infrastructure Services${NC}"
echo "─────────────────────────────────────────────────"
check_port 5432 "PostgreSQL"
check_port 6379 "Redis"
check_port 6333 "Qdrant Vector DB"
check_port 11434 "Ollama AI"
check_port 7474 "Neo4j Browser"
check_port 7687 "Neo4j Bolt"
check_port 9092 "Kafka"
check_port 8123 "ClickHouse"
check_port 7233 "Temporal"
echo ""

# Monitoring Services
echo -e "${CYAN}📊 Monitoring Services${NC}"
echo "─────────────────────────────────────────────────"
check_health "Grafana" "http://localhost:3001" "Grafana Dashboard"
check_health "Prometheus" "http://localhost:9090" "Prometheus Metrics"
check_health "Jaeger" "http://localhost:16686" "Jaeger Tracing"
check_health "Temporal UI" "http://localhost:8088" "Temporal Workflow UI"
echo ""

# Model Availability
echo -e "${BLUE}🦙 AI Models${NC}"
echo "─────────────────────────────────────────────────"
if curl -s "http://localhost:11434/api/tags" 2>/dev/null | grep -q "fine-print-marketing"; then
    echo -e "Marketing Model:              ${GREEN}✅ AVAILABLE${NC}"
else
    echo -e "Marketing Model:              ${YELLOW}⏳ NOT LOADED${NC}"
fi

if curl -s "http://localhost:11434/api/tags" 2>/dev/null | grep -q "fine-print-sales"; then
    echo -e "Sales Model:                  ${GREEN}✅ AVAILABLE${NC}"
else
    echo -e "Sales Model:                  ${YELLOW}⏳ NOT LOADED${NC}"
fi

if curl -s "http://localhost:11434/api/tags" 2>/dev/null | grep -q "fine-print-customer"; then
    echo -e "Customer Model:               ${GREEN}✅ AVAILABLE${NC}"
else
    echo -e "Customer Model:               ${YELLOW}⏳ NOT LOADED${NC}"
fi

if curl -s "http://localhost:11434/api/tags" 2>/dev/null | grep -q "fine-print-analytics"; then
    echo -e "Analytics Model:              ${GREEN}✅ AVAILABLE${NC}"
else
    echo -e "Analytics Model:              ${YELLOW}⏳ NOT LOADED${NC}"
fi
echo ""

# System Metrics
echo -e "${PURPLE}📈 System Metrics${NC}"
echo "─────────────────────────────────────────────────"

# Docker stats
if command -v docker &> /dev/null; then
    containers_running=$(docker ps -q | wc -l | tr -d ' ')
    containers_total=$(docker ps -aq | wc -l | tr -d ' ')
    echo "Docker Containers:            $containers_running running / $containers_total total"
fi

# Memory usage
if command -v free &> /dev/null; then
    mem_usage=$(free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2 }')
    echo "Memory Usage:                 $mem_usage"
fi

# Disk usage
disk_usage=$(df -h / | awk 'NR==2{print $5}')
echo "Disk Usage:                   $disk_usage"

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Summary
healthy_count=0
total_count=0

# Count healthy services (simplified)
for port in 3003 8000 8002 3020 3001 3030 3040 3010 5432 6379 6333 11434; do
    if nc -z localhost $port 2>/dev/null; then
        ((healthy_count++))
    fi
    ((total_count++))
done

if [ $healthy_count -eq $total_count ]; then
    echo -e "${GREEN}✅ System Status: ALL SERVICES HEALTHY ($healthy_count/$total_count)${NC}"
elif [ $healthy_count -gt $((total_count / 2)) ]; then
    echo -e "${YELLOW}⚠️  System Status: PARTIALLY HEALTHY ($healthy_count/$total_count)${NC}"
else
    echo -e "${RED}❌ System Status: CRITICAL ($healthy_count/$total_count)${NC}"
fi

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "💡 Tips:"
echo "  • View logs: docker-compose logs -f [service-name]"
echo "  • Restart service: docker-compose restart [service-name]"
echo "  • Check details: curl http://localhost:[port]/health"
echo ""