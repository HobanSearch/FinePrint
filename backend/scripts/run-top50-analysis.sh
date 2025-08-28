#!/bin/bash

# Fine Print AI - Top 50 Website Analysis Script
# This script analyzes privacy policies and terms of service for the top 50 websites
# and generates training data for LoRA fine-tuning

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(dirname "$SCRIPT_DIR")"
PROJECT_ROOT="$(dirname "$BACKEND_DIR")"

echo -e "${BLUE}Fine Print AI - Top 50 Website Analysis${NC}"
echo -e "${BLUE}===========================================${NC}"
echo ""

# Check if running from correct directory
if [ ! -f "$BACKEND_DIR/package.json" ]; then
    echo -e "${RED}Error: Must run from the backend directory${NC}"
    exit 1
fi

# Function to check if service is running
check_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=0
    
    echo -e "${YELLOW}Waiting for $service to be ready...${NC}"
    
    while [ $attempt -lt $max_attempts ]; do
        if nc -z localhost $port 2>/dev/null; then
            echo -e "${GREEN}$service is ready${NC}"
            return 0
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo -e "${RED}$service failed to start${NC}"
    return 1
}

# Function to start Docker services
start_docker_services() {
    echo -e "${BLUE}Starting Docker services...${NC}"
    
    cd "$BACKEND_DIR"
    
    # Check if docker-compose is running
    if docker-compose ps | grep -q "Up"; then
        echo -e "${YELLOW}Docker services already running${NC}"
    else
        echo -e "${YELLOW}Starting Docker services...${NC}"
        docker-compose up -d
        
        # Wait for services to be ready
        check_service "PostgreSQL" 5432
        check_service "Redis" 6379
        check_service "Neo4j" 7474
        check_service "Ollama" 11434
        check_service "Qdrant" 6333
        
        echo -e "${GREEN}All Docker services are ready${NC}"
    fi
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing dependencies...${NC}"
    
    # Install root dependencies
    cd "$BACKEND_DIR"
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing backend dependencies...${NC}"
        npm install
    fi
    
    # Install privacy-scoring service dependencies
    cd "$BACKEND_DIR/services/privacy-scoring"
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing privacy-scoring dependencies...${NC}"
        npm install
    fi
    
    echo -e "${GREEN}Dependencies installed${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${BLUE}Running database migrations...${NC}"
    
    cd "$BACKEND_DIR/services/privacy-scoring"
    
    # Generate Prisma client
    npx prisma generate
    
    # Run migrations
    npx prisma migrate deploy
    
    echo -e "${GREEN}Migrations completed${NC}"
}

# Function to download Ollama models
download_ollama_models() {
    echo -e "${BLUE}Downloading AI models...${NC}"
    
    local models=("phi:2.7b" "mistral:7b" "llama2:13b" "mixtral:8x7b")
    
    for model in "${models[@]}"; do
        echo -e "${YELLOW}Downloading $model...${NC}"
        docker exec fineprintai-ollama ollama pull $model || true
    done
    
    echo -e "${GREEN}AI models ready${NC}"
}

# Function to run the analysis
run_analysis() {
    echo -e "${BLUE}Running Top 50 website analysis...${NC}"
    
    cd "$BACKEND_DIR"
    
    # Create output directory
    mkdir -p "$BACKEND_DIR/analysis-results"
    
    # Run the enhanced analysis script
    echo -e "${YELLOW}Starting analysis process...${NC}"
    
    # Check if enhanced script exists, otherwise use simple version
    if [ -f "$BACKEND_DIR/services/privacy-scoring/src/scripts/analyze-top50.ts" ]; then
        cd "$BACKEND_DIR/services/privacy-scoring"
        npm run analyze:top50
    else
        cd "$BACKEND_DIR"
        node analyze-top50-simple.js
    fi
    
    # Move results to analysis-results directory
    if [ -f "top50-analysis-results.json" ]; then
        mv top50-analysis-results.json "$BACKEND_DIR/analysis-results/"
        echo -e "${GREEN}Analysis complete! Results saved to: analysis-results/top50-analysis-results.json${NC}"
    fi
}

# Function to export training data
export_training_data() {
    echo -e "${BLUE}Exporting training data for LoRA...${NC}"
    
    cd "$BACKEND_DIR"
    
    if [ -f "$BACKEND_DIR/scripts/export-training-data.ts" ]; then
        tsx "$BACKEND_DIR/scripts/export-training-data.ts"
        echo -e "${GREEN}Training data exported${NC}"
    else
        echo -e "${YELLOW}Export script not found, using analysis results directly${NC}"
    fi
}

# Function to prepare LoRA training
prepare_lora_training() {
    echo -e "${BLUE}Preparing LoRA training data...${NC}"
    
    cd "$BACKEND_DIR"
    
    if [ -f "$BACKEND_DIR/scripts/prepare-lora-training.py" ]; then
        python3 "$BACKEND_DIR/scripts/prepare-lora-training.py"
        echo -e "${GREEN}LoRA training data prepared${NC}"
    else
        echo -e "${YELLOW}LoRA preparation script not found${NC}"
    fi
}

# Main execution flow
main() {
    echo -e "${BLUE}Starting Fine Print AI Top 50 Analysis Pipeline${NC}"
    echo -e "${BLUE}=============================================${NC}"
    echo ""
    
    # Step 1: Start Docker services
    start_docker_services
    
    # Step 2: Install dependencies
    install_dependencies
    
    # Step 3: Run database migrations
    run_migrations
    
    # Step 4: Download AI models
    download_ollama_models
    
    # Step 5: Run the analysis
    run_analysis
    
    # Step 6: Export training data
    export_training_data
    
    # Step 7: Prepare LoRA training
    prepare_lora_training
    
    echo ""
    echo -e "${GREEN}Analysis pipeline completed successfully!${NC}"
    echo -e "${BLUE}=============================================${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo -e "1. Review analysis results in: ${BLUE}analysis-results/top50-analysis-results.json${NC}"
    echo -e "2. Run LoRA training: ${BLUE}npm run train:lora${NC}"
    echo -e "3. Deploy fine-tuned models: ${BLUE}npm run deploy:lora${NC}"
    echo ""
}

# Run main function
main