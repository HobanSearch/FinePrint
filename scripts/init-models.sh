#!/bin/bash

# Fine Print AI - Initialize Business Agent Models
# This script sets up the fine-tuned business agent models in Ollama

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🦙 Initializing Business Agent Models${NC}"
echo "======================================"

# Wait for Ollama to be ready
echo -e "${YELLOW}⏳ Waiting for Ollama to be ready...${NC}"
attempt=1
max_attempts=30
while [ $attempt -le $max_attempts ]; do
    if curl -s -f "http://localhost:11434/api/tags" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama is ready!${NC}"
        break
    fi
    echo -n "."
    sleep 2
    ((attempt++))
done

if [ $attempt -gt $max_attempts ]; then
    echo -e "\n${RED}❌ Ollama failed to start${NC}"
    exit 1
fi

# Function to create a model
create_model() {
    local model_name=$1
    local base_model=$2
    local description=$3
    
    echo -e "\n${YELLOW}📦 Creating $model_name from $base_model...${NC}"
    
    # Create Modelfile
    cat > /tmp/${model_name}.modelfile << EOF
FROM $base_model

# System prompt for $description
SYSTEM """
You are a specialized AI agent for $description.
You are part of the Fine Print AI system that analyzes legal documents.
Your responses should be professional, accurate, and focused on business outcomes.
Always consider legal implications and provide actionable insights.
"""

# Parameters for fine-tuning behavior
PARAMETER temperature 0.7
PARAMETER top_k 40
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_predict 2048
EOF

    # Create the model in Ollama
    ollama_container=$(docker ps --format "table {{.Names}}" | grep ollama | head -1)
    if [ -n "$ollama_container" ] && docker exec $ollama_container ollama create $model_name -f /tmp/${model_name}.modelfile 2>/dev/null; then
        echo -e "${GREEN}✅ Created $model_name${NC}"
    else
        echo -e "${YELLOW}⚠️  Model $model_name might already exist or failed to create${NC}"
    fi
}

# Pull base models first
echo -e "\n${BLUE}📥 Pulling base models...${NC}"

pull_model() {
    local model=$1
    echo -e "${YELLOW}Pulling $model...${NC}"
    ollama_container=$(docker ps --format "table {{.Names}}" | grep ollama | head -1)
    if [ -n "$ollama_container" ] && docker exec $ollama_container ollama pull $model 2>/dev/null; then
        echo -e "${GREEN}✅ Pulled $model${NC}"
    else
        echo -e "${YELLOW}⚠️  $model might already exist or failed to pull${NC}"
    fi
}

# Pull base models
pull_model "phi"
pull_model "mistral:7b"
pull_model "llama2:7b"
pull_model "codellama:7b"
pull_model "nomic-embed-text"

# Create business agent models
echo -e "\n${BLUE}🤖 Creating business agent models...${NC}"

create_model "fine-print-marketing" "mistral:7b" \
    "marketing content generation and optimization. Focus on conversion, engagement, and brand messaging"

create_model "fine-print-sales" "llama2:7b" \
    "sales qualification and closing. Focus on lead scoring, objection handling, and revenue optimization"

create_model "fine-print-customer" "phi" \
    "customer support and satisfaction. Focus on issue resolution, empathy, and customer retention"

create_model "fine-print-analytics" "mistral:7b" \
    "business analytics and insights. Focus on data analysis, pattern recognition, and actionable recommendations"

# Verify models are available
echo -e "\n${BLUE}🔍 Verifying models...${NC}"

if curl -s "http://localhost:11434/api/tags" | grep -q "fine-print"; then
    echo -e "${GREEN}✅ Business agent models are available!${NC}"
    
    # List all models
    echo -e "\n${CYAN}Available models:${NC}"
    curl -s "http://localhost:11434/api/tags" | \
        python3 -m json.tool | \
        grep '"name"' | \
        sed 's/.*"name": "\(.*\)".*/  • \1/' || true
else
    echo -e "${YELLOW}⚠️  Some models might not be fully initialized${NC}"
fi

echo -e "\n${GREEN}✅ Model initialization complete!${NC}"
echo -e "${YELLOW}💡 You can test the models with:${NC}"
echo -e "  curl http://localhost:11434/api/generate -d '{"
echo -e '    "model": "fine-print-marketing",'
echo -e '    "prompt": "Generate a compelling headline for our legal document analysis service"'
echo -e "  }'"