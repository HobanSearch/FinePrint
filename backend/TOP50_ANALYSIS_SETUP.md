# Fine Print AI - Top 50 Analysis Setup Guide

## Overview

This guide will help you set up and run the Fine Print AI Top 50 website analysis to generate training data for LoRA fine-tuning.

## Prerequisites

- Docker Desktop installed and running
- Node.js 18+ and npm
- Python 3.8+ (for LoRA training)
- At least 16GB RAM (recommended 32GB)
- 50GB+ free disk space

## Quick Start

1. **Start all services:**
   ```bash
   ./start-analysis.sh
   ```

2. **Run the simple analysis (for testing):**
   ```bash
   npm run top50:analyze
   ```

3. **Run the comprehensive analysis:**
   ```bash
   ./scripts/run-top50-analysis.sh
   ```

## Detailed Setup

### 1. Environment Configuration

The `.env.local` file has been created with all necessary configurations. Key settings:

- **Database**: PostgreSQL on port 5432
- **Cache**: Redis on port 6379
- **Graph DB**: Neo4j on ports 7474/7687
- **AI Models**: Ollama on port 11434
- **Vector DB**: Qdrant on port 6333

### 2. Docker Services

Start all services with:
```bash
docker-compose up -d
```

Services included:
- PostgreSQL 16 (Database)
- Redis 7.2 (Caching)
- Neo4j 5.15 (Knowledge Graph)
- Ollama (Local LLMs)
- Qdrant 1.7 (Vector Database)
- Elasticsearch 8.11 (Search)
- MinIO (Document Storage)
- PgBouncer (Connection Pooling)

### 3. AI Model Setup

The system will automatically download these models:
- **Phi 2.7B**: Fast, efficient for quick analysis
- **Mistral 7B**: Balanced performance
- **Llama2 13B**: High accuracy
- **Mixtral 8x7B**: Best quality (requires more resources)

### 4. Running the Analysis

#### Option A: Simple Analysis (Quick Test)
```bash
node analyze-top50-simple.js
```
- Uses pattern matching only
- Generates mock results
- Good for testing the pipeline

#### Option B: Full Analysis
```bash
./scripts/run-top50-analysis.sh
```
- Fetches real documents
- Uses AI models for analysis
- Saves to database
- Generates comprehensive reports

### 5. Analysis Output

Results are saved to:
- `analysis-results/top50-analysis-results.json` - Detailed analysis
- `analysis-results/analysis-summary-report.json` - Summary statistics

### 6. LoRA Training Data

After analysis completes:

1. **Export training data:**
   ```bash
   tsx scripts/export-training-data.ts
   ```

2. **Prepare for LoRA:**
   ```bash
   python3 scripts/prepare-lora-training.py
   ```

3. **Train LoRA model:**
   ```bash
   python3 scripts/train-lora.py
   ```

## Monitoring

- **View logs:** `docker-compose logs -f`
- **Check service status:** `docker-compose ps`
- **Database UI:** Neo4j Browser at http://localhost:7474
- **MinIO Console:** http://localhost:9001

## Troubleshooting

### Services won't start
```bash
# Reset everything
docker-compose down -v
docker-compose up -d
```

### Out of memory
- Reduce Ollama model size in docker-compose.yml
- Use only Phi model for analysis
- Increase Docker memory allocation

### Analysis fails
- Check logs: `docker-compose logs ollama`
- Verify models downloaded: `docker exec fineprintai-ollama ollama list`
- Try simple analysis first

### Database errors
```bash
# Reset database
docker-compose down postgres
docker volume rm backend_postgres_data
docker-compose up -d postgres
```

## Performance Tips

1. **For faster analysis:**
   - Use only Phi model
   - Reduce batch size to 3
   - Enable Redis caching

2. **For better accuracy:**
   - Use Mixtral model
   - Increase analysis timeout
   - Run in smaller batches

## Next Steps

After successful analysis:

1. Review the results in `analysis-results/`
2. Fine-tune the models with LoRA
3. Deploy the enhanced models
4. Run production analysis on user documents

## Support

For issues or questions:
- Check logs first: `docker-compose logs`
- Verify all services running: `./start-analysis.sh`
- Review this guide for common solutions