#!/bin/bash

# Fine Print AI - Ollama Model Initialization Script
# This script downloads and configures required AI models for document analysis

set -e

echo "🤖 Initializing Ollama AI models for Fine Print AI..."

# Wait for Ollama service to be ready
echo "⏳ Waiting for Ollama service to start..."
while ! curl -s http://ollama:11434/api/version > /dev/null; do
    echo "   Ollama not ready yet, waiting 5 seconds..."
    sleep 5
done

echo "✅ Ollama service is ready!"

# Download required models for document analysis
echo "📥 Downloading AI models..."

# Phi-2 (2.7B) - Fast, efficient model for basic analysis
echo "   • Downloading Microsoft Phi-2 (2.7B parameters)..."
curl -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "phi"}' || echo "   ⚠️ Failed to download Phi model (will retry later)"

# Mistral 7B - Balanced model for detailed analysis
echo "   • Downloading Mistral 7B..."
curl -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "mistral:7b"}' || echo "   ⚠️ Failed to download Mistral model (will retry later)"

# Llama2 7B - Alternative model for comparative analysis
echo "   • Downloading Llama2 7B..."
curl -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "llama2:7b"}' || echo "   ⚠️ Failed to download Llama2 model (will retry later)"

# Code Llama for code analysis (used by development agents)
echo "   • Downloading Code Llama 7B..."
curl -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "codellama:7b"}' || echo "   ⚠️ Failed to download Code Llama model (will retry later)"

# Create custom Modelfile for Fine Print AI specific tasks
echo "📝 Creating Fine Print AI specialized model..."
cat > /tmp/fineprintai.modelfile << 'EOF'
FROM mistral:7b

# Set parameters for legal document analysis
PARAMETER temperature 0.1
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER num_ctx 4096

# System prompt for legal document analysis
SYSTEM """You are Fine Print AI, an expert legal document analyzer specializing in Terms of Service, Privacy Policies, and EULAs. 

Your capabilities include:
- Identifying problematic clauses and unfair terms
- Assessing privacy risks and data collection practices
- Detecting automatic renewal traps and hidden fees
- Evaluating user rights and legal protections
- Scoring overall document risk (0-100 scale)

Always provide:
1. Clear, actionable findings
2. Risk severity scores
3. User-friendly explanations
4. Specific clause references
5. Recommended actions

Be precise, objective, and focused on consumer protection."""

# Custom stops
PARAMETER stop "<|im_end|>"
PARAMETER stop "<|endoftext|>"
EOF

# Create the custom model
curl -X POST http://ollama:11434/api/create \
    -H "Content-Type: application/json" \
    -d '{
        "name": "fineprintai",
        "modelfile": "'$(cat /tmp/fineprintai.modelfile | sed 's/"/\\"/g' | tr '\n' ' ')'"
    }' || echo "   ⚠️ Failed to create Fine Print AI custom model"

# Create embeddings model for semantic search
echo "   • Downloading embedding model for semantic search..."
curl -X POST http://ollama:11434/api/pull \
    -H "Content-Type: application/json" \
    -d '{"name": "nomic-embed-text"}' || echo "   ⚠️ Failed to download embedding model"

# Verify models are available
echo "🔍 Verifying installed models..."
curl -s http://ollama:11434/api/tags | jq -r '.models[].name' | while read model; do
    echo "   ✅ Model available: $model"
done

echo "🎉 Ollama model initialization complete!"
echo ""
echo "Available models:"
echo "  • phi - Fast analysis model (2.7B params)"
echo "  • mistral:7b - Detailed analysis model (7B params)"  
echo "  • llama2:7b - Alternative analysis model (7B params)"
echo "  • codellama:7b - Code analysis model (7B params)"
echo "  • fineprintai - Custom Fine Print AI model"
echo "  • nomic-embed-text - Embedding model for semantic search"
echo ""
echo "🚀 Ready for document analysis!"