#!/bin/bash

# Fine Print AI - LoRA Model Deployment Script
# Deploys fine-tuned models to the LoRA service

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 Fine Print AI - LoRA Model Deployment"
echo "========================================"

# Configuration
LORA_SERVICE_URL="${LORA_SERVICE_URL:-http://localhost:8006}"
MODEL_DIR="${MODEL_DIR:-models/lora}"
DEPLOY_ENV="${DEPLOY_ENV:-development}"

# Function to check if service is healthy
check_service_health() {
    echo -n "Checking LoRA service health..."
    if curl -s "$LORA_SERVICE_URL/health" > /dev/null 2>&1; then
        echo -e " ${GREEN}✓${NC}"
        return 0
    else
        echo -e " ${RED}✗${NC}"
        echo -e "${RED}Error: LoRA service is not responding at $LORA_SERVICE_URL${NC}"
        exit 1
    fi
}

# Function to register a model
register_model() {
    local model_path=$1
    local model_name=$2
    local base_model=$3
    local domain=$4
    local adapter_id=$5
    
    echo -e "\n${BLUE}Registering model: $model_name${NC}"
    
    # Check if model directory exists
    if [ ! -d "$model_path" ]; then
        echo -e "${RED}Error: Model directory not found: $model_path${NC}"
        return 1
    fi
    
    # Copy model to service directory
    echo "Copying model files..."
    cp -r "$model_path" "services/lora/models/$adapter_id"
    
    # Register with API
    echo "Registering with LoRA service..."
    response=$(curl -s -X POST "$LORA_SERVICE_URL/api/models/register" \
        -H "Content-Type: application/json" \
        -d "{
            \"adapterId\": \"$adapter_id\",
            \"modelName\": \"$model_name\",
            \"baseModel\": \"$base_model\",
            \"domain\": \"$domain\",
            \"path\": \"models/$adapter_id\",
            \"metadata\": {
                \"deployedAt\": \"$(date -u +"%Y-%m-%dT%H:%M:%SZ")\",
                \"environment\": \"$DEPLOY_ENV\"
            }
        }")
    
    # Check if registration was successful
    if echo "$response" | grep -q "error"; then
        echo -e "${RED}Failed to register model: $response${NC}"
        return 1
    else
        echo -e "${GREEN}✓ Model registered successfully${NC}"
        return 0
    fi
}

# Function to set default model for domain
set_default_model() {
    local domain=$1
    local adapter_id=$2
    
    echo -e "\n${BLUE}Setting $adapter_id as default for $domain domain${NC}"
    
    response=$(curl -s -X PUT "$LORA_SERVICE_URL/api/models/domains/$domain/default" \
        -H "Content-Type: application/json" \
        -d "{\"adapterId\": \"$adapter_id\"}")
    
    if echo "$response" | grep -q "error"; then
        echo -e "${RED}Failed to set default model: $response${NC}"
        return 1
    else
        echo -e "${GREEN}✓ Default model updated${NC}"
        return 0
    fi
}

# Function to test deployed model
test_deployed_model() {
    local adapter_id=$1
    local test_text="Analyze this privacy policy: We collect all your data and share it with third parties."
    
    echo -e "\n${BLUE}Testing model: $adapter_id${NC}"
    
    response=$(curl -s -X POST "$LORA_SERVICE_URL/api/lora/generate" \
        -H "Content-Type: application/json" \
        -d "{
            \"adapterId\": \"$adapter_id\",
            \"prompt\": \"$test_text\",
            \"maxTokens\": 200
        }")
    
    if echo "$response" | grep -q "error"; then
        echo -e "${RED}Model test failed: $response${NC}"
        return 1
    else
        echo -e "${GREEN}✓ Model responding correctly${NC}"
        echo -e "Sample output: $(echo "$response" | jq -r '.text' | head -n 3)"
        return 0
    fi
}

# Main deployment process
main() {
    # Check service health
    check_service_health
    
    # Get list of available models
    echo -e "\n${BLUE}Available models in $MODEL_DIR:${NC}"
    if [ ! -d "$MODEL_DIR" ]; then
        echo -e "${RED}Model directory not found: $MODEL_DIR${NC}"
        echo "Please train models first using: npm run train:lora"
        exit 1
    fi
    
    models=($(ls -d $MODEL_DIR/*/ 2>/dev/null | xargs -n 1 basename))
    if [ ${#models[@]} -eq 0 ]; then
        echo -e "${RED}No models found in $MODEL_DIR${NC}"
        exit 1
    fi
    
    for i in "${!models[@]}"; do
        echo "$((i+1)). ${models[$i]}"
    done
    
    # Select model to deploy
    echo -e "\n${YELLOW}Which model would you like to deploy? (Enter number or 'all' for all models)${NC}"
    read -p "> " selection
    
    if [ "$selection" = "all" ]; then
        deploy_models=("${models[@]}")
    else
        if [ "$selection" -gt 0 ] && [ "$selection" -le "${#models[@]}" ]; then
            deploy_models=("${models[$((selection-1))]}")
        else
            echo -e "${RED}Invalid selection${NC}"
            exit 1
        fi
    fi
    
    # Deploy selected models
    for model in "${deploy_models[@]}"; do
        echo -e "\n${BLUE}========================================${NC}"
        echo -e "${BLUE}Deploying: $model${NC}"
        echo -e "${BLUE}========================================${NC}"
        
        model_path="$MODEL_DIR/$model"
        
        # Read model metadata if available
        if [ -f "$model_path/training_metadata.json" ]; then
            base_model=$(jq -r '.base_model // "phi-2"' "$model_path/training_metadata.json")
            dataset_type=$(jq -r '.dataset_type // "general"' "$model_path/training_metadata.json")
        else
            base_model="phi-2"
            dataset_type="general"
        fi
        
        # Determine domain based on model name or dataset type
        case "$model" in
            *privacy*)
                domain="privacy_analysis"
                ;;
            *terms*)
                domain="terms_analysis"
                ;;
            *social*)
                domain="social_media"
                ;;
            *ecommerce*)
                domain="ecommerce"
                ;;
            *financial*)
                domain="financial"
                ;;
            *)
                domain="$dataset_type"
                ;;
        esac
        
        # Register model
        if register_model "$model_path" "$model" "$base_model" "$domain" "$model"; then
            # Test model
            if test_deployed_model "$model"; then
                echo -e "${GREEN}✓ Model deployed and tested successfully${NC}"
                
                # Ask if should set as default
                echo -e "\n${YELLOW}Set as default model for $domain domain? (y/n)${NC}"
                read -p "> " set_default
                if [ "$set_default" = "y" ]; then
                    set_default_model "$domain" "$model"
                fi
            fi
        fi
    done
    
    # Show deployment summary
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}Deployment Summary${NC}"
    echo -e "${BLUE}========================================${NC}"
    
    # List all registered models
    echo -e "\n${BLUE}Registered models:${NC}"
    curl -s "$LORA_SERVICE_URL/api/models" | jq -r '.models[] | "- \(.adapterId) (\(.domain))"'
    
    # Show active models by domain
    echo -e "\n${BLUE}Active models by domain:${NC}"
    curl -s "$LORA_SERVICE_URL/api/models/domains" | jq -r 'to_entries[] | "- \(.key): \(.value.activeAdapter)"'
    
    echo -e "\n${GREEN}✅ Deployment complete!${NC}"
    echo -e "\n${BLUE}Next steps:${NC}"
    echo "1. Monitor model performance: curl $LORA_SERVICE_URL/api/metrics"
    echo "2. View logs: tail -f services/lora/logs/*.log"
    echo "3. Run A/B tests: npm run test:ab-models"
}

# Run main function
main