# Fine Print AI - Top 50 Website Analysis & Model Training Guide

This guide walks through analyzing the Top 50 websites' privacy policies and using the results to fine-tune our AI models.

## 📋 Prerequisites

- Docker Desktop running
- Node.js 20+ and Python 3.11+ installed
- At least 16GB RAM (for AI model training)
- 50GB free disk space
- Ollama installed (`brew install ollama`)

## 🚀 Quick Start

```bash
# From the backend directory
cd backend/

# 1. Run the complete Top 50 analysis
npm run analyze:top50

# 2. Export training data (after analysis completes)
npm run export:training-data

# 3. Prepare data for LoRA training
npm run prepare:lora-data

# 4. Train LoRA model
npm run train:lora -- --model-name privacy-analyzer-v1 \
  --data-dir data/lora-training/alpaca/general \
  --num-epochs 3 --use-fp16
```

## 📊 Step-by-Step Process

### Step 1: Start Services & Run Analysis

```bash
# Start all backend services and run Top 50 analysis
./scripts/run-top50-analysis.sh
```

This script will:
1. Start Docker containers (PostgreSQL, Redis, Neo4j)
2. Launch all microservices
3. Pull required AI models (phi-2, mistral)
4. Trigger analysis of all 50 websites
5. Monitor progress (takes ~1-2 hours)

**Monitor Progress:**
- API Status: http://localhost:3011/api/scores/status
- Individual scores: http://localhost:3011/api/scores
- Neo4j Browser: http://localhost:7474 (user: neo4j, pass: fineprintai_neo4j_2024)

### Step 2: Export Training Data

After analysis completes:

```bash
# Export analyzed documents as training data
npm run export:training-data
```

This creates:
- `data/training/train.jsonl` - Training samples (80%)
- `data/training/validation.jsonl` - Validation samples (20%)
- `data/training/train.json` - Human-readable format
- `data/training/prompt_templates.json` - Example prompts

### Step 3: Prepare for LoRA Training

```bash
# Convert to LoRA training format
npm run prepare:lora-data -- \
  --input-dir data/training \
  --output-dir data/lora-training \
  --format both
```

This creates specialized datasets:
- `general/` - All websites
- `social_media/` - Facebook, Twitter, Instagram, etc.
- `ecommerce/` - Amazon, eBay, Shopify, etc.
- `financial/` - PayPal, Venmo, Coinbase, etc.
- `streaming/` - Netflix, Spotify, YouTube, etc.

Each dataset has both:
- Alpaca format (instruction-based)
- Conversational format (chat-based)

### Step 4: Train LoRA Adapters

**Basic Training:**
```bash
npm run train:lora -- \
  --model-name privacy-analyzer-v1 \
  --data-dir data/lora-training/alpaca/general \
  --num-epochs 3 \
  --use-fp16
```

**Advanced Training with Monitoring:**
```bash
npm run train:lora -- \
  --model-name privacy-social-v1 \
  --data-dir data/lora-training/conversation/social_media \
  --dataset-type social_media \
  --num-epochs 5 \
  --batch-size 4 \
  --lora-rank 32 \
  --learning-rate 1e-4 \
  --use-fp16 \
  --use-wandb
```

**Training Parameters:**
- `--lora-rank`: Higher = more parameters (8-64)
- `--num-epochs`: More epochs = better fit (3-10)
- `--batch-size`: Larger = faster but more memory (2-8)
- `--use-4bit`: Enable for low memory systems
- `--use-wandb`: Enable experiment tracking

### Step 5: Test Fine-tuned Models

```bash
# Test the model
npm run test:lora -- \
  --model-path models/lora/privacy-analyzer-v1 \
  --test-type all

# Compare with baseline
npm run test:lora -- \
  --model-path models/lora/privacy-analyzer-v1 \
  --compare \
  --save-results
```

### Step 6: Deploy Models

```bash
# Copy to LoRA service
cp -r models/lora/privacy-analyzer-v1 services/lora/models/

# Update model registry
curl -X POST http://localhost:8006/api/models/register \
  -H "Content-Type: application/json" \
  -d '{
    "adapterId": "privacy-analyzer-v1",
    "modelName": "Privacy Analyzer v1",
    "baseModel": "phi-2",
    "domain": "privacy_analysis",
    "path": "models/privacy-analyzer-v1"
  }'
```

### Step 7: Re-run Analysis with Fine-tuned Models

```bash
# Configure to use new model
curl -X PUT http://localhost:8006/api/models/domains/privacy_analysis/default \
  -H "Content-Type: application/json" \
  -d '{"adapterId": "privacy-analyzer-v1"}'

# Re-run Top 50 analysis
curl -X POST http://localhost:3011/api/scores/analyze-all \
  -d '{"forceRefresh": true}'
```

## 📈 Expected Results

### Before Fine-tuning:
- Generic pattern detection
- ~70% accuracy on known patterns
- Basic risk scoring
- Limited domain understanding

### After Fine-tuning:
- Specialized pattern detection
- ~90%+ accuracy on trained patterns
- Nuanced risk scoring
- Domain-specific insights
- Better explanation quality

## 🔍 Monitoring & Metrics

### Training Metrics:
```bash
# View training logs
tail -f /tmp/lora-training.log

# Check model performance
python3 scripts/evaluate-lora.py \
  --model-path models/lora/privacy-analyzer-v1 \
  --test-set data/training/validation.json
```

### Analysis Quality Metrics:
- Pattern detection rate
- False positive rate
- Risk score accuracy
- User feedback scores

## 🛠️ Troubleshooting

### Common Issues:

1. **Out of Memory during training:**
   ```bash
   # Use smaller batch size
   --batch-size 2 --gradient-accumulation-steps 8
   
   # Or use 4-bit quantization
   --use-4bit
   ```

2. **Services not starting:**
   ```bash
   # Check logs
   tail -f /tmp/*.log
   
   # Restart specific service
   cd services/privacy-scoring && npm run dev
   ```

3. **Slow analysis:**
   ```bash
   # Check Ollama is using GPU
   ollama ps
   
   # Use smaller model
   export DEFAULT_MODEL=phi-2
   ```

## 📊 Using the Training Data

The exported training data can be used for:

1. **LoRA Fine-tuning** (this guide)
2. **Full Model Fine-tuning** (requires more resources)
3. **Evaluation Datasets** for model comparison
4. **Synthetic Data Generation** for augmentation
5. **Pattern Analysis** for improving detection rules

## 🎯 Next Steps

1. **Create specialized models** for each category
2. **A/B test** different model versions
3. **Continuous learning** from user feedback
4. **Benchmark** against commercial solutions
5. **Publish** results and model cards

## 📚 Additional Resources

- [Unsloth Documentation](https://github.com/unslothai/unsloth)
- [LoRA Paper](https://arxiv.org/abs/2106.09685)
- [Fine-tuning Best Practices](https://huggingface.co/docs/transformers/training)
- [Privacy Pattern Database](docs/privacy-patterns.md)

---

**Remember**: The quality of analysis improves significantly with fine-tuned models. The Top 50 dataset provides excellent training data for privacy-focused AI models.