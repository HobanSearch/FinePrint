#!/bin/bash

# Ollama Model Pull Script for Fine Print AI
# This script downloads the required AI models for document analysis

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_progress() {
    echo -e "${BLUE}[PROGRESS]${NC} $1"
}

# Models to download
MODELS=(
    "phi-2:2.7b"
    "mistral:7b"
    "llama2:13b"
)

# Optional models (can be added later)
OPTIONAL_MODELS=(
    "mixtral:8x7b"
    "codellama:7b"
)

print_status "========================================="
print_status "Ollama Model Download Script"
print_status "========================================="
echo ""

# Check if Ollama container is running
if ! docker ps | grep -q fineprintai-ollama; then
    print_error "Ollama container is not running!"
    print_status "Starting Ollama container..."
    docker-compose up -d ollama
    sleep 5
fi

# Wait for Ollama to be ready
print_status "Waiting for Ollama service to be ready..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker exec fineprintai-ollama ollama list &>/dev/null; then
        print_status "Ollama is ready!"
        break
    fi
    print_progress "Waiting for Ollama... (attempt $((attempt+1))/$max_attempts)"
    sleep 2
    attempt=$((attempt+1))
done

if [ $attempt -eq $max_attempts ]; then
    print_error "Ollama service failed to start after $max_attempts attempts"
    exit 1
fi

# List currently installed models
print_status "Currently installed models:"
docker exec fineprintai-ollama ollama list || print_warning "No models currently installed"
echo ""

# Function to pull a model
pull_model() {
    local model=$1
    print_status "Pulling model: $model"
    print_warning "This may take several minutes depending on model size and internet speed..."
    
    if docker exec fineprintai-ollama ollama pull $model; then
        print_status "✓ Successfully pulled $model"
        return 0
    else
        print_error "✗ Failed to pull $model"
        return 1
    fi
}

# Pull required models
print_status "Downloading required models..."
echo ""

failed_models=()
successful_models=()

for model in "${MODELS[@]}"; do
    # Check if model already exists
    if docker exec fineprintai-ollama ollama list | grep -q "$model"; then
        print_status "Model $model already exists, skipping..."
        successful_models+=("$model")
    else
        if pull_model "$model"; then
            successful_models+=("$model")
        else
            failed_models+=("$model")
        fi
    fi
    echo ""
done

# Ask about optional models
echo ""
print_status "Optional models are available for enhanced functionality:"
for model in "${OPTIONAL_MODELS[@]}"; do
    echo "  - $model"
done

read -p "Would you like to download optional models? (y/N): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    for model in "${OPTIONAL_MODELS[@]}"; do
        if pull_model "$model"; then
            successful_models+=("$model")
        else
            failed_models+=("$model")
        fi
        echo ""
    done
fi

# Test models
print_status "Testing models..."
echo ""

for model in "${successful_models[@]}"; do
    print_progress "Testing $model..."
    if docker exec fineprintai-ollama ollama run $model "Test prompt: Hello" &>/dev/null; then
        print_status "✓ $model is working correctly"
    else
        print_warning "⚠ $model may have issues, please check manually"
    fi
done

# Final summary
echo ""
print_status "========================================="
print_status "Model Download Summary"
print_status "========================================="

if [ ${#successful_models[@]} -gt 0 ]; then
    print_status "Successfully downloaded/verified models:"
    for model in "${successful_models[@]}"; do
        echo "  ✓ $model"
    done
fi

if [ ${#failed_models[@]} -gt 0 ]; then
    echo ""
    print_error "Failed to download models:"
    for model in "${failed_models[@]}"; do
        echo "  ✗ $model"
    done
    echo ""
    print_warning "You can retry failed downloads by running this script again"
fi

echo ""
print_status "Current model list:"
docker exec fineprintai-ollama ollama list

echo ""
print_status "Model setup complete!"

# Show disk usage
echo ""
print_status "Disk usage for models:"
docker exec fineprintai-ollama du -sh /root/.ollama/models 2>/dev/null || print_warning "Could not determine disk usage"

# Exit with error if any required models failed
if [ ${#failed_models[@]} -gt 0 ]; then
    for failed in "${failed_models[@]}"; do
        for required in "${MODELS[@]}"; do
            if [ "$failed" == "$required" ]; then
                print_error "Required model $failed failed to download. Please retry."
                exit 1
            fi
        done
    done
fi

print_status "All required models are ready!"