# Fine Print AI DSPy Service

Production-ready DSPy framework integration for systematic prompt optimization and business intelligence.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   TypeScript API    │───▶│   Python DSPy Core  │───▶│   Ollama LLM        │
│   (Fastify/Node.js) │    │   (FastAPI/DSPy)    │    │   (Local Models)    │
│                     │    │                     │    │                     │
│ • Route handling    │    │ • Real DSPy modules │    │ • Mistral 7B        │
│ • Authentication    │    │ • Optimization      │    │ • Phi-2 2.7B        │
│ • WebSocket         │    │ • Training data     │    │ • Custom models     │
│ • Memory service    │    │ • Evaluation        │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
          │                         │                         │
          └─────────────────────────┼─────────────────────────┘
                                    │
                        ┌─────────────────────┐
                        │   Shared Services   │
                        │                     │
                        │ • Redis (Cache)     │
                        │ • PostgreSQL (Data) │
                        │ • Memory Service    │
                        │ • Config Service    │
                        └─────────────────────┘
```

## Features

### Real DSPy Framework Integration
- **Authentic DSPy Implementation**: Uses actual `dspy-ai` library for optimization
- **Production Optimizers**: BootstrapFewShot, COPRO, MIPROv2 with real algorithms
- **Business-Specific Modules**: Legal analysis, marketing content, sales, support optimization
- **Signature-Based Design**: Proper DSPy signatures for all business operations

### Business Intelligence
- **Legal Document Analysis**: Risk assessment with 50+ pattern detection
- **Marketing Content Optimization**: Conversion-focused content generation
- **Sales Communication Enhancement**: Personalization and conversion triggers
- **Customer Support Optimization**: Satisfaction and resolution optimization

### Advanced Features
- **Real-time Progress Tracking**: WebSocket connections for optimization progress
- **Template Management**: Version-controlled optimized prompt templates
- **A/B Testing Infrastructure**: Compare prompt variants in production
- **Training Data Collection**: Automated dataset creation from historical data
- **Performance Analytics**: Business impact measurement and trend analysis

## Quick Start

### 1. Environment Setup

```bash
# Clone and navigate to the DSPy service
cd backend/services/dspy

# Install dependencies
npm install
cd python && pip install -r requirements.txt
```

### 2. Start with Docker Compose

```bash
# Start all services
docker-compose up -d

# Check service health
curl http://localhost:8006/health  # TypeScript service
curl http://localhost:8007/health  # Python DSPy service
```

### 3. Development Mode

```bash
# Terminal 1: Start Python DSPy service
npm run dev:python

# Terminal 2: Start TypeScript service
npm run dev

# Or start both together
npm run dev:full
```

## API Endpoints

### Legal Document Analysis
```bash
POST /api/dspy/analyze
{
  "document_content": "Terms of Service text...",
  "document_type": "terms_of_service",
  "analysis_depth": "detailed"
}
```

### Marketing Content Optimization
```bash
POST /api/dspy/optimize/marketing
{
  "content_type": "email",
  "target_audience": "small_business_owners",
  "content_draft": "Your marketing message...",
  "optimization_goals": ["engagement", "conversion"]
}
```

### Sales Communication Enhancement
```bash
POST /api/dspy/optimize/sales
{
  "communication_type": "email",
  "prospect_profile": {"industry": "legal", "role": "partner"},
  "message_draft": "Your sales message...",
  "conversion_goals": ["meeting_booking"]
}
```

### DSPy Module Optimization
```bash
POST /api/optimization/start
{
  "module_name": "legal_analysis",
  "config": {
    "optimizer_type": "bootstrap_few_shot",
    "max_labeled_demos": 16,
    "max_rounds": 3
  },
  "dataset": [...]
}
```

### Real-time Progress Tracking
```javascript
const ws = new WebSocket('ws://localhost:8006/ws/optimization/{jobId}');
ws.onmessage = (event) => {
  const progress = JSON.parse(event.data);
  console.log(`Progress: ${progress.progress}% - ${progress.message}`);
};
```

## Business Modules

### Legal Analysis Module
- **Risk Scoring**: 0-100 risk assessment
- **Pattern Detection**: 50+ problematic clause patterns
- **Compliance Checking**: GDPR, CCPA, industry-specific regulations
- **Recommendation Engine**: Actionable user guidance

### Marketing Content Optimizer
- **Audience Targeting**: Demographic and psychographic optimization
- **Conversion Optimization**: A/B test variant generation
- **Brand Voice Consistency**: Tone and messaging alignment
- **Performance Prediction**: Expected engagement metrics

### Sales Communication Enhancer
- **Personalization Engine**: Profile-based message customization
- **Conversion Triggers**: Psychological persuasion techniques
- **Follow-up Strategy**: Timing and sequence optimization
- **Pipeline Integration**: CRM workflow automation

### Support Response Optimizer
- **Empathy Integration**: Emotional intelligence in responses
- **Resolution Efficiency**: Faster problem-solving paths
- **Satisfaction Prediction**: Customer sentiment analysis
- **Escalation Intelligence**: When and how to escalate issues

## DSPy Optimization Strategies

### BootstrapFewShot
- **Use Case**: Limited training data scenarios
- **Best For**: Legal analysis, specialized domains
- **Configuration**: 4-16 demonstrations, 1-3 rounds

### COPRO (Collaborative Prompt Optimization)
- **Use Case**: Multi-stakeholder optimization
- **Best For**: Marketing content, team collaboration
- **Configuration**: Collaborative scoring, diverse feedback

### MIPROv2 (Multi-Iteration Prompt Refinement Optimization)
- **Use Case**: Complex multi-objective optimization
- **Best For**: Sales communication, support responses
- **Configuration**: Multi-threaded optimization, advanced metrics

## Evaluation Metrics

### Business-Specific Evaluators
- **Legal Accuracy**: Risk assessment precision, finding completeness
- **Marketing Effectiveness**: Engagement prediction, conversion potential
- **Sales Conversion**: Personalization quality, trigger effectiveness
- **Support Satisfaction**: Empathy scoring, resolution likelihood

### Performance Tracking
- **Response Time**: API latency optimization
- **Token Usage**: Cost efficiency measurement
- **Confidence Scores**: Prediction reliability
- **Improvement Percentage**: Optimization effectiveness

## Training Data Management

### Automated Collection
```bash
POST /api/training-data/collect
{
  "module_name": "legal_analysis",
  "source_filters": {
    "document_types": ["terms_of_service", "privacy_policy"],
    "date_range": {"start": "2024-01-01", "end": "2024-12-31"},
    "min_quality_score": 0.8
  },
  "max_entries": 1000
}
```

### Dataset Validation
- **Quality Metrics**: Expert verification percentage, consistency scoring
- **Diversity Analysis**: Document type distribution, complexity levels
- **Optimization Suitability**: Compatibility with different optimizers

## Template Management

### Optimized Prompt Templates
- **Version Control**: Template evolution tracking
- **Performance Metrics**: Success rate, improvement history
- **Business Categories**: Legal, marketing, sales, support templates
- **A/B Testing**: Template variant comparison

### Template Analytics
```bash
GET /api/templates/analytics
{
  "top_performing_templates": [...],
  "optimization_trends": {...},
  "business_impact": {...}
}
```

## Monitoring and Analytics

### Real-time Dashboards
- **Optimization Progress**: Live optimization job tracking
- **Performance Metrics**: Success rates, improvement trends
- **Business Impact**: ROI measurement, conversion attribution
- **System Health**: Service status, resource utilization

### Business Intelligence
- **Trend Analysis**: Historical optimization performance
- **Impact Prediction**: Expected improvement forecasting
- **Cost Optimization**: Token usage and efficiency analysis
- **Quality Assurance**: Consistency and reliability metrics

## Production Deployment

### Infrastructure Requirements
- **CPU**: 4+ cores for TypeScript service
- **RAM**: 8GB+ for optimal performance
- **GPU**: NVIDIA GPU for Ollama LLM inference
- **Storage**: 50GB+ for models and data

### Scaling Configuration
```yaml
# docker-compose.override.yml
services:
  dspy-python:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 4G
  
  dspy-typescript:
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1'
          memory: 2G
```

### Environment Variables
```bash
# Production settings
NODE_ENV=production
DSPY_PYTHON_HOST=dspy-python
DSPY_PYTHON_PORT=8007
OLLAMA_URL=http://ollama:11434
DEFAULT_MODEL=mistral:7b
REDIS_URL=redis://redis:6379
POSTGRES_URL=postgresql://user:pass@postgres:5432/db
```

## Security and Compliance

### Data Protection
- **Local Processing**: All LLM inference happens locally
- **No Data Retention**: Documents not stored permanently
- **Encryption**: Data encrypted in transit and at rest
- **Access Control**: Role-based API access

### Privacy Features
- **GDPR Compliance**: Right to deletion, data portability
- **Audit Logging**: Complete optimization history tracking
- **Anonymization**: PII removal from training data
- **Consent Management**: User permission tracking

## Development

### Adding New Business Modules
1. Create DSPy signature in `python/modules.py`
2. Implement module class with evaluation metrics
3. Add route handlers in TypeScript layer
4. Create training data collection method
5. Add business-specific evaluators

### Custom Optimization Strategies
1. Extend base optimizer class in `python/optimizers.py`
2. Implement optimization algorithm
3. Add configuration schema
4. Create evaluation pipeline
5. Test with business data

### Integration Testing
```bash
# Run full test suite
npm run test

# Test Python DSPy core
cd python && pytest

# Test optimization pipeline
npm run test:optimization

# Performance benchmarks
npm run test:performance
```

## Troubleshooting

### Common Issues
1. **Ollama Connection**: Check model availability and GPU access
2. **Memory Usage**: Monitor token usage and batch sizes
3. **Optimization Failures**: Validate training data quality
4. **WebSocket Disconnections**: Check network stability

### Debugging
```bash
# Check service logs
docker-compose logs dspy-python
docker-compose logs dspy-typescript

# Monitor optimization progress
curl http://localhost:8007/optimization/jobs

# Health status
curl http://localhost:8006/health
```

## Support

For technical support, business optimization consulting, or feature requests:
- **Documentation**: `/docs` endpoint for API documentation
- **Monitoring**: Grafana dashboards for system metrics
- **Alerts**: Prometheus alerting for system issues

## License

MIT License - See LICENSE file for details.

---

**Fine Print AI DSPy Service** - Production-ready prompt optimization for autonomous business operations.