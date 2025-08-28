# Learning Pipeline Service

Comprehensive continuous learning pipeline for Fine Print AI's model management system.

## Features

### 1. Feedback Collection System
- **User Feedback**: Thumbs up/down, corrections, ratings (handles 10,000+ events/min)
- **Implicit Feedback**: Dwell time, click-through, task completion tracking
- **Model Confidence**: Real-time confidence tracking and alerting
- **Error Pattern Detection**: Automatic detection of recurring error patterns
- **Privacy-Preserving**: PII removal and data sanitization

### 2. Training Data Pipeline
- **Data Validation**: Automatic cleaning and validation
- **Privacy Methods**: Differential privacy, k-anonymity, l-diversity support
- **Active Learning**: Intelligent sample selection for labeling
- **Synthetic Data**: Generation for edge cases and data augmentation
- **Data Versioning**: DVC integration for reproducibility

### 3. Model Retraining Pipeline
- **Incremental Learning**: Prevents catastrophic forgetting
- **LoRA Fine-tuning**: Efficient adapter-based training for Ollama models
- **Hyperparameter Optimization**: Optuna integration
- **MLX Support**: Native Apple Silicon optimization
- **Distributed Training**: Multi-GPU support with resource optimization
- **Model Versioning**: Complete version control and rollback

### 4. Evaluation & Validation
- **Comprehensive Metrics**: Accuracy, precision, recall, F1, AUC
- **Performance Testing**: Latency percentiles (P50, P95, P99), throughput
- **A/B Testing**: Integrated with AB testing framework
- **Drift Detection**: Data, concept, prediction, and performance drift
- **Fairness Testing**: Demographic parity, equal opportunity, bias detection
- **Regression Testing**: Automated performance regression detection

### 5. Deployment Automation
- **Canary Deployments**: Gradual rollout with monitoring
- **Blue-Green Deployments**: Zero-downtime updates
- **Auto-Rollback**: Automatic rollback on performance degradation
- **Model Registry**: Centralized model management
- **Traffic Management**: Dynamic traffic splitting and routing

### 6. Learning Analytics
- **Learning Curves**: Visualization of model improvement over time
- **Feature Importance**: SHAP/LIME-based feature analysis
- **Performance Segmentation**: Analysis by user segments
- **ROI Analysis**: Cost-benefit analysis for retraining
- **Model Comparison**: Side-by-side performance comparison

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Feedback Collection                      │
├──────────────┬────────────────┬──────────────┬─────────────┤
│ User Feedback│ Implicit Events│ Confidence   │ Pattern      │
│   Collector  │    Tracker     │   Monitor    │  Detector    │
└──────────────┴────────────────┴──────────────┴─────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Pipeline                           │
├──────────────┬────────────────┬──────────────┬─────────────┤
│   Privacy    │  Active        │  Synthetic   │    Data      │
│ Preservation │  Learning      │  Generation  │  Versioning  │
└──────────────┴────────────────┴──────────────┴─────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   Training Orchestrator                      │
├──────────────┬────────────────┬──────────────┬─────────────┤
│    LoRA      │      MLX       │   Standard   │  Resource    │
│   Trainer    │    Trainer     │   Training   │  Manager     │
└──────────────┴────────────────┴──────────────┴─────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       Evaluation                             │
├──────────────┬────────────────┬──────────────┬─────────────┤
│   Accuracy   │    Fairness    │    Drift     │ Performance  │
│   Testing    │    Analyzer    │   Detector   │   Profiler   │
└──────────────┴────────────────┴──────────────┴─────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Deployment                              │
├──────────────┬────────────────┬──────────────┬─────────────┤
│    Canary    │   Blue-Green   │   Rollback   │   Registry   │
│   Manager    │    Manager     │   Controller │   Manager    │
└──────────────┴────────────────┴──────────────┴─────────────┘
```

## Performance Specifications

- **Feedback Processing**: 10,000+ events/minute
- **Training Time**: <2 hours for retraining
- **Evaluation Latency**: <5 seconds for cached responses
- **Deployment**: 99.9% uptime during updates
- **Memory Efficiency**: 40-60% cost reduction through optimization
- **GPU Utilization**: >80% during training
- **Data Privacy**: GDPR compliant with right to be forgotten

## API Endpoints

### Feedback Collection
- `POST /feedback/user` - Submit user feedback
- `POST /feedback/implicit` - Submit implicit feedback
- `GET /feedback/metrics` - Get feedback metrics

### Training Pipeline
- `POST /training/start` - Start new training run
- `GET /training/status/:runId` - Get training status
- `POST /training/pause/:runId` - Pause training
- `POST /training/resume/:runId` - Resume training
- `POST /training/cancel/:runId` - Cancel training

### Evaluation
- `POST /evaluation/run` - Run model evaluation
- `GET /evaluation/results/:evalId` - Get evaluation results

### Dataset Management
- `POST /dataset/create` - Create new dataset
- `GET /dataset/:id` - Get dataset details
- `POST /dataset/validate` - Validate dataset

### Model Registry
- `GET /models` - List available models
- `GET /models/:id` - Get model details
- `POST /models/deploy` - Deploy model

### Monitoring
- `POST /drift/monitor` - Start drift monitoring
- `GET /drift/report/:modelId` - Get drift report
- `POST /alerts/configure` - Configure alerts

### Active Learning
- `POST /active-learning/select` - Select samples for labeling
- `POST /active-learning/label` - Label selected sample
- `GET /active-learning/stats` - Get active learning statistics

### Analytics
- `GET /analytics/learning-curve/:modelId` - Get learning curve
- `GET /analytics/feature-importance/:modelId` - Get feature importance
- `GET /analytics/roi/:modelId` - Get ROI analysis
- `GET /analytics/comparison` - Compare models

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/learning_pipeline

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Ollama
OLLAMA_ENDPOINT=http://localhost:11434

# MLX (Apple Silicon)
MLX_PATH=/opt/mlx

# Training
MAX_CONCURRENT_RUNS=3
CHECKPOINT_INTERVAL=300000
RESOURCE_CHECK_INTERVAL=30000

# Monitoring
WANDB_API_KEY=
WANDB_MODE=offline

# Security
CORS_ORIGIN=http://localhost:3000
JWT_SECRET=

# Logging
LOG_LEVEL=info
NODE_ENV=development
```

## Installation

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run generate

# Run database migrations
npm run migrate

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Docker Deployment

```bash
# Build image
docker build -t fineprint-learning-pipeline .

# Run container
docker run -d \
  --name learning-pipeline \
  -p 3010:3010 \
  -e DATABASE_URL=$DATABASE_URL \
  -e REDIS_HOST=$REDIS_HOST \
  --network fineprint-network \
  fineprint-learning-pipeline
```

## Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test -- feedback

# Run performance tests
npm run test:performance
```

## Monitoring & Debugging

### Key Metrics
- Feedback processing rate
- Training queue depth
- Model accuracy trends
- Drift detection alerts
- Resource utilization
- Error rates

### Debugging Tools
- Request tracing with correlation IDs
- Detailed error logging with context
- Performance profiling
- Memory leak detection
- GPU utilization monitoring

### Health Checks
- `/health` - Overall service health
- `/health/detailed` - Detailed component health
- `/metrics` - Prometheus metrics endpoint

## Integration with Fine Print AI

The Learning Pipeline integrates with:
- **Model Management Service**: Load balancing and cost optimization
- **A/B Testing Framework**: Experiment management
- **Ollama Cluster**: Model serving infrastructure
- **Analytics Service**: Business metrics tracking
- **Notification Service**: Alert delivery

## Security Features

- Input validation and sanitization
- Rate limiting per endpoint
- JWT authentication
- Differential privacy for sensitive data
- Audit logging for compliance
- Encrypted data at rest and in transit

## Performance Optimization

- Batch processing for efficiency
- GPU memory management
- Gradient accumulation for large models
- Model quantization support
- Caching strategies
- Connection pooling

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   - Reduce batch size
   - Enable gradient accumulation
   - Clear model cache

2. **Training Failures**
   - Check GPU availability
   - Verify dataset format
   - Review error logs

3. **Drift False Positives**
   - Adjust detection thresholds
   - Increase window size
   - Review baseline statistics

4. **Deployment Rollbacks**
   - Check evaluation metrics
   - Review canary results
   - Verify model compatibility

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## License

Proprietary - Fine Print AI