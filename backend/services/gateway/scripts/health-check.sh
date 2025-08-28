#!/bin/bash
set -e

# Health check script for Docker container
# This script is called by Docker's HEALTHCHECK instruction

# Configuration
KONG_ADMIN_URL="${KONG_ADMIN_URL:-http://localhost:8001}"
KONG_PROXY_URL="${KONG_PROXY_URL:-http://localhost:8000}"
HEALTH_SERVICE_URL="${HEALTH_SERVICE_URL:-http://localhost:8003}"
TIMEOUT=10
MAX_RETRIES=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Check if a service is responding
check_service() {
    local url=$1
    local service_name=$2
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -f -s --max-time $TIMEOUT "$url" > /dev/null 2>&1; then
            log "${GREEN}✓${NC} $service_name is healthy"
            return 0
        fi
        
        retries=$((retries + 1))
        if [ $retries -lt $MAX_RETRIES ]; then
            log "${YELLOW}⚠${NC} $service_name check failed, retrying ($retries/$MAX_RETRIES)..."
            sleep 1
        fi
    done
    
    log "${RED}✗${NC} $service_name is unhealthy"
    return 1
}

# Check Kong Admin API
check_kong_admin() {
    local status_url="$KONG_ADMIN_URL/status"
    
    if ! check_service "$status_url" "Kong Admin API"; then
        return 1
    fi
    
    # Get additional Kong status information
    local status_json=$(curl -s --max-time $TIMEOUT "$status_url" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$status_json" ]; then
        local server_status=$(echo "$status_json" | jq -r '.server_status // "unknown"' 2>/dev/null || echo "unknown")
        log "Kong server status: $server_status"
    fi
    
    return 0
}

# Check Kong Proxy
check_kong_proxy() {
    local health_url="$KONG_PROXY_URL/health"
    
    # Try the health endpoint first
    if curl -f -s --max-time $TIMEOUT "$health_url" > /dev/null 2>&1; then
        log "${GREEN}✓${NC} Kong Proxy is healthy"
        return 0
    fi
    
    # Fallback to basic connectivity check
    if curl -f -s --max-time $TIMEOUT "$KONG_PROXY_URL" > /dev/null 2>&1; then
        log "${GREEN}✓${NC} Kong Proxy is responding"
        return 0
    fi
    
    log "${RED}✗${NC} Kong Proxy is unhealthy"
    return 1
}

# Check Health Service
check_health_service() {
    local health_url="$HEALTH_SERVICE_URL/health"
    
    if ! check_service "$health_url" "Health Service"; then
        return 1
    fi
    
    # Get detailed health information
    local health_json=$(curl -s --max-time $TIMEOUT "$health_url" 2>/dev/null)
    if [ $? -eq 0 ] && [ -n "$health_json" ]; then
        local uptime=$(echo "$health_json" | jq -r '.uptime // "unknown"' 2>/dev/null || echo "unknown")
        log "Health service uptime: $uptime seconds"
    fi
    
    return 0
}

# Check Redis connectivity (if configured)
check_redis() {
    if [ -n "$REDIS_HOST" ] && [ -n "$REDIS_PORT" ]; then
        local redis_host="${REDIS_HOST}"
        local redis_port="${REDIS_PORT:-6379}"
        
        if command -v redis-cli &> /dev/null; then
            if redis-cli -h "$redis_host" -p "$redis_port" ping > /dev/null 2>&1; then
                log "${GREEN}✓${NC} Redis is healthy"
                return 0
            else
                log "${RED}✗${NC} Redis is unhealthy"
                return 1
            fi
        else
            # Fallback to netcat
            if nc -z "$redis_host" "$redis_port" 2>/dev/null; then
                log "${GREEN}✓${NC} Redis port is open"
                return 0
            else
                log "${RED}✗${NC} Redis port is closed"
                return 1
            fi
        fi
    fi
    
    return 0  # Redis not configured, skip check
}

# Check system resources
check_system_resources() {
    # Check memory usage
    local memory_usage=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100.0}')
    if [ "$memory_usage" -gt 90 ]; then
        log "${RED}⚠${NC} High memory usage: ${memory_usage}%"
        return 1
    elif [ "$memory_usage" -gt 80 ]; then
        log "${YELLOW}⚠${NC} Memory usage: ${memory_usage}%"
    else
        log "${GREEN}✓${NC} Memory usage: ${memory_usage}%"
    fi
    
    # Check disk space
    local disk_usage=$(df /tmp | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ "$disk_usage" -gt 90 ]; then
        log "${RED}⚠${NC} High disk usage: ${disk_usage}%"
        return 1
    elif [ "$disk_usage" -gt 80 ]; then
        log "${YELLOW}⚠${NC} Disk usage: ${disk_usage}%"
    else
        log "${GREEN}✓${NC} Disk usage: ${disk_usage}%"
    fi
    
    return 0
}

# Check process health
check_processes() {
    # Check if Kong processes are running
    if ! pgrep -f "kong" > /dev/null; then
        log "${RED}✗${NC} Kong process not found"
        return 1
    fi
    
    local kong_processes=$(pgrep -f "kong" | wc -l)
    log "${GREEN}✓${NC} Kong processes running: $kong_processes"
    
    # Check if PM2 processes are running (health service)
    if command -v pm2 &> /dev/null; then
        local pm2_status=$(pm2 jlist 2>/dev/null | jq -r '.[] | select(.name=="gateway-health") | .pm2_env.status' 2>/dev/null || echo "unknown")
        if [ "$pm2_status" = "online" ]; then
            log "${GREEN}✓${NC} Health service process is online"
        elif [ "$pm2_status" = "unknown" ]; then
            log "${YELLOW}⚠${NC} Health service status unknown"
        else
            log "${RED}✗${NC} Health service process is $pm2_status"
            return 1
        fi
    fi
    
    return 0
}

# Main health check function
main() {
    log "Starting health check..."
    
    local checks_passed=0
    local total_checks=0
    
    # Core service checks
    if check_kong_admin; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    if check_kong_proxy; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    if check_health_service; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    # Optional checks
    if check_redis; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    if check_system_resources; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    if check_processes; then
        checks_passed=$((checks_passed + 1))
    fi
    total_checks=$((total_checks + 1))
    
    # Summary
    log "Health check completed: $checks_passed/$total_checks checks passed"
    
    if [ $checks_passed -eq $total_checks ]; then
        log "${GREEN}✓${NC} All health checks passed"
        exit 0
    elif [ $checks_passed -gt $((total_checks / 2)) ]; then
        log "${YELLOW}⚠${NC} Some health checks failed"
        exit 1
    else
        log "${RED}✗${NC} Most health checks failed"
        exit 1
    fi
}

# Handle command line arguments
case "${1:-check}" in
    "check"|"")
        main
        ;;
    "kong-only")
        if check_kong_admin && check_kong_proxy; then
            log "${GREEN}✓${NC} Kong health check passed"
            exit 0
        else
            log "${RED}✗${NC} Kong health check failed"
            exit 1
        fi
        ;;
    "health-only")
        if check_health_service; then
            log "${GREEN}✓${NC} Health service check passed"
            exit 0
        else
            log "${RED}✗${NC} Health service check failed"
            exit 1
        fi
        ;;
    "resources-only")
        if check_system_resources; then
            log "${GREEN}✓${NC} System resources check passed"
            exit 0
        else
            log "${RED}✗${NC} System resources check failed"
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 [check|kong-only|health-only|resources-only]"
        exit 1
        ;;
esac