#!/bin/bash

# DevOps Agent Health Check Script
# This script performs a health check for the DevOps Agent service

set -e

# Configuration
HOST=${HOST:-localhost}
PORT=${PORT:-3017}
TIMEOUT=${TIMEOUT:-5}
HEALTH_ENDPOINT="http://${HOST}:${PORT}/health"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Health check function
check_health() {
    local url="$1"
    local timeout="$2"
    
    if response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$timeout" "$url" 2>/dev/null); then
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ DevOps Agent is healthy${NC}"
            return 0
        else
            echo -e "${RED}❌ DevOps Agent returned HTTP $response${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ DevOps Agent is unreachable${NC}"
        return 1
    fi
}

# Detailed health check function
check_detailed_health() {
    local url="$1/detailed"
    local timeout="$2"
    
    if response=$(curl -s --max-time "$timeout" "$url" 2>/dev/null); then
        if echo "$response" | grep -q '"status":"healthy"'; then
            echo -e "${GREEN}✅ Detailed health check passed${NC}"
            # Extract key metrics if jq is available
            if command -v jq >/dev/null 2>&1; then
                echo "$response" | jq -r '.memory | "Memory: \(.heapUsed)MB/\(.heapTotal)MB heap, \(.rss)MB RSS"'
                echo "$response" | jq -r '"Uptime: \(.uptime | floor)s"'
            fi
            return 0
        else
            echo -e "${YELLOW}⚠️ Service degraded - some components unhealthy${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Detailed health check failed${NC}"
        return 1
    fi
}

# Readiness check function
check_readiness() {
    local url="$1/ready"
    local timeout="$2"
    
    if response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$timeout" "$url" 2>/dev/null); then
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ Service is ready${NC}"
            return 0
        else
            echo -e "${YELLOW}⚠️ Service not ready (HTTP $response)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Readiness check failed${NC}"
        return 1
    fi
}

# Liveness check function
check_liveness() {
    local url="$1/live"
    local timeout="$2"
    
    if response=$(curl -s -w "%{http_code}" -o /dev/null --max-time "$timeout" "$url" 2>/dev/null); then
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ Service is alive${NC}"
            return 0
        else
            echo -e "${RED}❌ Service not alive (HTTP $response)${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ Liveness check failed${NC}"
        return 1
    fi
}

# Main health check execution
echo "🏥 DevOps Agent Health Check"
echo "Checking: $HEALTH_ENDPOINT"
echo "Timeout: ${TIMEOUT}s"
echo "----------------------------------------"

# Perform health checks
health_check_passed=true

# Basic health check
echo -n "Basic Health: "
if ! check_health "$HEALTH_ENDPOINT" "$TIMEOUT"; then
    health_check_passed=false
fi

# Liveness check
echo -n "Liveness: "
if ! check_liveness "$HEALTH_ENDPOINT" "$TIMEOUT"; then
    health_check_passed=false
fi

# Readiness check
echo -n "Readiness: "
if ! check_readiness "$HEALTH_ENDPOINT" "$TIMEOUT"; then
    health_check_passed=false
fi

# Detailed health check (optional - don't fail container if this fails)
echo -n "Detailed Check: "
check_detailed_health "$HEALTH_ENDPOINT" "$TIMEOUT" || true

echo "----------------------------------------"

# Exit with appropriate code
if [ "$health_check_passed" = true ]; then
    echo -e "${GREEN}🎉 All health checks passed!${NC}"
    exit 0
else
    echo -e "${RED}💥 Health check failed!${NC}"
    exit 1
fi