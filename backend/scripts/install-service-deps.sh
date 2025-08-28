#!/bin/bash

# Install dependencies for all services needed for Top 50 analysis

set -e

echo "📦 Installing dependencies for Fine Print AI services..."
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to install deps for a service
install_service_deps() {
    local service_name=$1
    local service_path=$2
    
    if [ -d "$service_path" ]; then
        echo -e "\n${BLUE}Installing dependencies for $service_name...${NC}"
        cd "$service_path"
        if [ -f "package.json" ]; then
            npm install --no-workspaces || {
                echo -e "${RED}Failed to install dependencies for $service_name${NC}"
                return 1
            }
            echo -e "${GREEN}✓ $service_name dependencies installed${NC}"
        else
            echo -e "${RED}No package.json found for $service_name${NC}"
        fi
        cd - > /dev/null
    else
        echo -e "${RED}Service directory not found: $service_path${NC}"
    fi
}

# Get the backend directory
BACKEND_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
cd "$BACKEND_DIR"

# Install dependencies for core services
install_service_deps "Config Service" "shared/config"
install_service_deps "Memory Service" "shared/memory"
install_service_deps "Logger Service" "shared/logger"
install_service_deps "Auth Service" "shared/auth"

# Install dependencies for analysis services
install_service_deps "Analysis Service" "services/analysis"
install_service_deps "LoRA Service" "services/lora"
install_service_deps "Knowledge Graph Service" "services/knowledge-graph"
install_service_deps "Privacy Scoring Service" "services/privacy-scoring"

echo -e "\n${GREEN}✅ All service dependencies installed!${NC}"