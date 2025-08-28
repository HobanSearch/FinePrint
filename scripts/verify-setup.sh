#!/bin/bash

# Fine Print AI - Setup Verification Script
# Checks that all required files and configurations are in place

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                     🔍 FINE PRINT AI - SETUP VERIFICATION                      "
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

errors=0
warnings=0

# Function to check file exists
check_file() {
    local file=$1
    local description=$2
    
    printf "%-60s" "$description"
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ Found${NC}"
        return 0
    else
        echo -e "${RED}❌ Missing${NC}"
        ((errors++))
        return 1
    fi
}

# Function to check directory exists
check_dir() {
    local dir=$1
    local description=$2
    
    printf "%-60s" "$description"
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ Found${NC}"
        return 0
    else
        echo -e "${RED}❌ Missing${NC}"
        ((errors++))
        return 1
    fi
}

# Function to check command exists
check_command() {
    local cmd=$1
    local description=$2
    
    printf "%-60s" "$description"
    if command -v $cmd >/dev/null 2>&1; then
        echo -e "${GREEN}✅ Installed${NC}"
        return 0
    else
        echo -e "${RED}❌ Not installed${NC}"
        ((errors++))
        return 1
    fi
}

echo -e "${YELLOW}📋 Checking Prerequisites${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_command docker "Docker"
check_command docker-compose "Docker Compose"
check_command node "Node.js"
check_command npm "NPM"
check_command curl "cURL"
echo ""

echo -e "${YELLOW}📁 Checking Project Structure${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_dir "infrastructure/docker" "Docker configuration directory"
check_dir "backend/services/digital-twin" "Digital Twin service"
check_dir "backend/services/business-agents" "Business Agents service"
check_dir "backend/services/content-optimizer" "Content Optimizer service"
check_dir "backend/services/feedback-collector" "Feedback Collector service"
check_dir "backend/services/improvement-orchestrator" "Improvement Orchestrator service"
check_dir "frontend/src/components/admin" "Admin dashboard components"
echo ""

echo -e "${YELLOW}🐳 Checking Docker Files${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_file "infrastructure/docker/docker-compose.yml" "Main Docker Compose file"
check_file "backend/services/digital-twin/Dockerfile" "Digital Twin Dockerfile"
check_file "backend/services/business-agents/Dockerfile" "Business Agents Dockerfile"
check_file "backend/services/content-optimizer/Dockerfile" "Content Optimizer Dockerfile"
check_file "backend/services/feedback-collector/Dockerfile" "Feedback Collector Dockerfile"
check_file "backend/services/improvement-orchestrator/Dockerfile" "Orchestrator Dockerfile"
echo ""

echo -e "${YELLOW}🔧 Checking Configuration Files${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_file ".env.dev" "Development environment file"
check_file "package.json" "Root package.json"
echo ""

echo -e "${YELLOW}📜 Checking Scripts${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_file "scripts/start-fineprint.sh" "Main startup script"
check_file "scripts/init-models.sh" "Model initialization script"
check_file "scripts/health-dashboard.sh" "Health check dashboard"
check_file "docs/LOCAL_TESTING.md" "Local testing documentation"
echo ""

echo -e "${YELLOW}📦 Checking Service Package Files${NC}"
echo "─────────────────────────────────────────────────────────────────────"
check_file "backend/services/digital-twin/package.json" "Digital Twin package.json"
check_file "backend/services/business-agents/package.json" "Business Agents package.json"
check_file "backend/services/content-optimizer/package.json" "Content Optimizer package.json"
check_file "backend/services/feedback-collector/package.json" "Feedback Collector package.json"
check_file "backend/services/improvement-orchestrator/package.json" "Orchestrator package.json"
echo ""

echo -e "${YELLOW}🔍 Checking Docker Status${NC}"
echo "─────────────────────────────────────────────────────────────────────"
printf "%-60s" "Docker daemon"
if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Running${NC}"
else
    echo -e "${RED}❌ Not running${NC}"
    ((errors++))
fi

printf "%-60s" "Docker Compose version"
if docker-compose version >/dev/null 2>&1; then
    version=$(docker-compose version --short)
    echo -e "${GREEN}✅ $version${NC}"
else
    echo -e "${RED}❌ Error${NC}"
    ((warnings++))
fi
echo ""

# Summary
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
if [ $errors -eq 0 ] && [ $warnings -eq 0 ]; then
    echo -e "${GREEN}✅ VERIFICATION PASSED${NC}"
    echo -e "All required files and dependencies are in place!"
    echo ""
    echo -e "${GREEN}Ready to start the system with:${NC}"
    echo -e "  npm run start:all"
elif [ $errors -eq 0 ]; then
    echo -e "${YELLOW}⚠️  VERIFICATION PASSED WITH WARNINGS${NC}"
    echo -e "System can run but some optional components may not work."
    echo ""
    echo -e "${YELLOW}You can start the system with:${NC}"
    echo -e "  npm run start:all"
else
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo -e "Found $errors errors and $warnings warnings"
    echo ""
    echo -e "${RED}Please fix the issues above before starting the system.${NC}"
    exit 1
fi
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"