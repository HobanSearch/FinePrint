# AI/ML Engineering Agent

A comprehensive AI/ML lifecycle management and optimization platform for Fine Print AI, providing automated training, hyperparameter optimization, performance monitoring, and MLOps capabilities.

## Features

### Core Capabilities
- **Model Lifecycle Management**: Automated training, validation, and deployment of PyTorch and HuggingFace models
- **Hyperparameter Optimization**: Advanced optimization using Optuna with TPE, Random Search, and CMA-ES samplers
- **Model Registry**: Centralized model versioning, storage, and metadata management
- **Performance Monitoring**: Real-time performance tracking with data drift detection
- **AutoML Pipeline**: Automated feature engineering and model selection
- **A/B Testing Framework**: Model comparison and statistical testing
- **Resource Optimization**: Intelligent GPU/CPU utilization and cost optimization
- **MLOps Orchestration**: End-to-end pipeline automation and deployment strategies

### Integration Support
- **DSPy Integration**: Optimize DSPy modules with hyperparameter search
- **LoRA Integration**: Create and optimize LoRA adapters for fine-tuning
- **Knowledge Graph Integration**: Optimize graph embeddings and inference
- **Ollama Integration**: Monitor and optimize local LLM performance

## Architecture

### Microservice Components
```
├── Model Lifecycle Manager    # Training job orchestration
├── Hyperparameter Optimizer   # Optuna-based optimization
├── Model Registry            # Model versioning and storage
├── Performance Monitor       # Metrics and drift detection
├── AutoML Pipeline          # Automated ML workflows
├── A/B Testing Framework    # Model comparison
├── Resource Optimizer       # Resource management
└── MLOps Orchestrator      # End-to-end automation
```

### API Endpoints
```
GET  /                       # Service overview
GET  /health                 # Health checks
GET  /docs                   # API documentation
WS   /ws/*                   # Real-time updates

# Training
POST /api/v1/training/start             # Start training job
POST /api/v1/training/stop/:jobId       # Stop training
GET  /api/v1/training/jobs              # List jobs
GET  /api/v1/training/jobs/:jobId/logs  # Get logs

# Optimization
POST /api/v1/optimization/start         # Start optimization study
GET  /api/v1/optimization/studies       # List studies
GET  /api/v1/optimization/studies/:id   # Get study details

# Registry
POST /api/v1/registry/models            # Register model
GET  /api/v1/registry/models            # List models
GET  /api/v1/registry/models/:id        # Get model

# Monitoring
GET  /api/v1/monitoring/dashboard/:id   # Performance dashboard
POST /api/v1/monitoring/drift-detection # Configure drift detection

# Integrations
POST /api/v1/integrations/dspy/optimize     # Optimize DSPy modules
POST /api/v1/integrations/lora/create       # Create LoRA adapters
POST /api/v1/integrations/knowledge-graph   # Optimize embeddings
```

## Quick Start

### Development
```bash
cd backend/services/aiml-engineering

# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Deployment
```bash
# Build Docker image
docker build -t fineprintai/aiml-engineering:latest .

# Deploy to Kubernetes
kubectl apply -f ../../infrastructure/kubernetes/aiml-engineering-deployment.yaml
```

### Environment Variables
```bash
NODE_ENV=production
PORT=3006
LOG_LEVEL=info
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgresql://localhost:5432/fineprintai
OLLAMA_URL=http://localhost:11434
MLFLOW_TRACKING_URI=http://localhost:5000
GPU_ENABLED=true
CUDA_VISIBLE_DEVICES=0,1
```

## Usage Examples

### Start Model Training
```javascript
const response = await fetch('/api/v1/training/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model_name: 'legal-classifier-v2',
    model_type: 'huggingface',
    base_model: 'microsoft/DialoGPT-medium',
    dataset_path: '/data/legal-documents.json',
    output_dir: '/models/legal-classifier-v2',
    training_args: {
      num_epochs: 10,
      batch_size: 16,
      learning_rate: 2e-5,
      warmup_steps: 500
    }
  })
});

const { job_id } = await response.json();
```

### Hyperparameter Optimization
```javascript
const optimization = await fetch('/api/v1/optimization/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    study_name: 'legal-model-optimization',
    model_name: 'legal-classifier',
    model_type: 'huggingface',
    base_model: 'bert-base-uncased',
    dataset_path: '/data/training.json',
    search_space: {
      learning_rate: { type: 'float', min: 1e-5, max: 1e-2, log: true },
      batch_size: { type: 'categorical', values: [8, 16, 32] },
      num_epochs: { type: 'int', min: 3, max: 20 }
    },
    optimization_settings: {
      sampler: 'tpe',
      n_trials: 50,
      direction: 'maximize'
    },
    objective_metric: 'f1_score'
  })
});
```

### Real-time Updates
```javascript
const ws = new WebSocket('ws://localhost:3006/ws/training/job-123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'training_progress') {
    console.log('Training progress:', data.data.metrics);
  }
};

ws.send(JSON.stringify({ type: 'subscribe' }));
```

## Integration Examples

### DSPy Optimization
```javascript
const dspyOptimization = await fetch('/api/v1/integrations/dspy/optimize', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    module_name: 'legal-analysis-chain',
    optimization_target: 'accuracy',
    training_data: '/data/dspy-training.json',
    hyperparameter_search: true
  })
});
```

### LoRA Adapter Creation
```javascript
const loraAdapter = await fetch('/api/v1/integrations/lora/create-adapter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    base_model: 'microsoft/DialoGPT-medium',
    adapter_name: 'legal-terms-adapter',
    task_type: 'legal_analysis',
    training_data: '/data/legal-terms.json',
    optimization_level: 'advanced'
  })
});
```

## Monitoring and Metrics

### Performance Dashboard
Access comprehensive performance dashboards at:
- Service metrics: `/metrics`
- Model performance: `/api/v1/monitoring/dashboard/:modelId`
- Real-time alerts: WebSocket `/ws/alerts`

### Prometheus Metrics
The service exports Prometheus-compatible metrics:
```
aiml_training_jobs_total
aiml_training_jobs_active
aiml_optimization_studies_total
aiml_models_registered_total
aiml_active_alerts
aiml_service_uptime_seconds
```

## Development

### Project Structure
```
src/
├── services/              # Core service implementations
│   ├── model-lifecycle-manager.ts
│   ├── hyperparameter-optimizer.ts
│   ├── model-registry.ts
│   ├── performance-monitor.ts
│   └── ...
├── routes/               # API route handlers
│   ├── model-lifecycle.ts
│   ├── hyperparameter-optimization.ts
│   └── ...
├── scripts/              # Python training scripts
│   ├── huggingface_trainer.py
│   ├── pytorch_trainer.py
│   └── optuna_optimizer.py
├── plugins.ts            # Fastify plugins
└── index.ts             # Service entry point
```

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run load tests
npm run test:load
```

### Contributing
1. Follow TypeScript best practices
2. Add comprehensive tests for new features
3. Update API documentation
4. Ensure GPU compatibility for training components
5. Validate Kubernetes deployments

## Performance Considerations

### Resource Requirements
- **CPU**: 4+ cores recommended
- **Memory**: 8GB+ RAM
- **GPU**: NVIDIA GPU with 8GB+ VRAM for training
- **Storage**: SSD with 1TB+ for models and experiments

### Scaling
- Horizontal scaling supported via Kubernetes HPA
- GPU node affinity for training workloads
- Separate resource pools for training vs. inference

### Optimization Tips
- Use GPU acceleration for training and hyperparameter optimization
- Enable model checkpointing for long-running jobs
- Configure appropriate resource limits and requests
- Monitor memory usage during large model training

## Security

### Authentication
- API key authentication for external access
- JWT token support for internal services
- Role-based access control (RBAC)

### Data Protection
- Model encryption at rest
- Secure model artifact storage
- Network policies for service isolation
- Audit logging for all operations

## Support

For issues and questions:
- GitHub Issues: [fineprintai/issues](https://github.com/fineprintai/issues)
- Documentation: `/docs` endpoint
- Health checks: `/health` endpoint