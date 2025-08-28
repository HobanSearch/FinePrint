#!/bin/bash

# Fine Print AI - Quick Start Analysis Script
# This script starts the analysis pipeline with proper error handling

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}Fine Print AI - Starting Analysis Pipeline${NC}"
echo -e "${BLUE}=========================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: docker-compose is not installed.${NC}"
    exit 1
fi

# Load environment variables
if [ -f "$SCRIPT_DIR/.env.local" ]; then
    echo -e "${GREEN}Loading environment variables...${NC}"
    export $(cat "$SCRIPT_DIR/.env.local" | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: .env.local not found. Using default values.${NC}"
fi

# Start Docker services
echo -e "${BLUE}Starting Docker services...${NC}"
cd "$SCRIPT_DIR"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to initialize...${NC}"
sleep 10

# Check service health
echo -e "${BLUE}Checking service health...${NC}"
services=("postgres:5432" "redis:6379" "neo4j:7474" "ollama:11434" "qdrant:6333")

for service in "${services[@]}"; do
    IFS=':' read -r name port <<< "$service"
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✓ $name is running on port $port${NC}"
    else
        echo -e "${RED}✗ $name is not responding on port $port${NC}"
    fi
done

echo ""
echo -e "${GREEN}Services are ready!${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Run the Top 50 analysis: ${BLUE}./scripts/run-top50-analysis.sh${NC}"
echo -e "2. Check the simple analysis: ${BLUE}npm run top50:analyze${NC}"
echo -e "3. View logs: ${BLUE}docker-compose logs -f${NC}"
echo -e "4. Stop services: ${BLUE}docker-compose down${NC}"
echo ""
echo -e "${YELLOW}Quick test:${NC}"
echo -e "Run: ${BLUE}node analyze-top50-simple.js${NC}"
echo ""