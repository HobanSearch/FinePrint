# Fine Print AI - Knowledge Graph Service

Advanced knowledge graph management with Neo4j integration, curriculum learning, and semantic reasoning for legal document analysis.

## Overview

The Knowledge Graph Service is a comprehensive microservice that provides:

- **Neo4j Knowledge Graph**: Structured legal knowledge representation with optimized Cypher queries
- **Curriculum Learning Engine**: Progressive difficulty-based training algorithms for AI models
- **Legal Knowledge Ontology**: Comprehensive schema for legal concepts, clauses, and relationships
- **Graph-Enhanced Inference**: AI reasoning enhanced with knowledge graph context
- **Semantic Search & Reasoning**: Intelligent search using graph relationships and embeddings
- **Knowledge Extraction Pipeline**: Automated extraction from legal documents
- **Performance Analytics**: Comprehensive monitoring and optimization insights

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Knowledge Graph Service                       │
├─────────────────────────────────────────────────────────────────┤
│  REST API & GraphQL  │  Curriculum Learning  │  Analytics      │
├─────────────────────────────────────────────────────────────────┤
│  Semantic Search     │  Knowledge Extraction │  Graph Inference │
├─────────────────────────────────────────────────────────────────┤
│  Legal Ontology Service  │  Graph Embeddings  │  Performance    │
├─────────────────────────────────────────────────────────────────┤
│                    Neo4j Service (Core)                         │
└─────────────────────────────────────────────────────────────────┘
            │                    │                    │
        ┌───▼───┐            ┌───▼───┐            ┌───▼───┐
        │ Neo4j │            │Qdrant │            │ Redis │
        │Database│           │Vector │            │ Cache │
        └───────┘            │  DB   │            └───────┘
                            └───────┘
```

## Features

### 🧠 Knowledge Graph Management
- **Structured Legal Ontology**: Concepts, clauses, patterns, and relationships
- **Neo4j Integration**: High-performance graph database with query optimization
- **Real-time Updates**: Dynamic knowledge base maintenance
- **Relationship Inference**: Automatic discovery of concept relationships

### 📚 Curriculum Learning
- **Adaptive Difficulty**: Progressive learning algorithms based on performance
- **Multiple Strategies**: Difficulty-based, prerequisite-based, performance-adaptive
- **Learner Profiles**: Individual learning progression tracking
- **Learning Sessions**: Structured training with performance metrics

### 🔍 Semantic Search & Reasoning
- **Graph-Enhanced Search**: Context-aware search using relationships
- **Semantic Similarity**: Vector embeddings with Qdrant integration
- **Multi-hop Reasoning**: Complex query resolution through graph traversal
- **Natural Language Understanding**: NLP-powered concept extraction

### ⚡ AI-Enhanced Inference
- **DSPy Integration**: Graph context enhancement for reasoning modules
- **Curriculum-Aware Responses**: Adaptive complexity based on learner level
- **Multi-perspective Analysis**: Alternative viewpoints and reasoning paths
- **Evidence-Based Conclusions**: Supporting evidence from knowledge graph

### 📊 Analytics & Monitoring
- **Graph Health Metrics**: Connectivity, quality, and completeness scores
- **Learning Analytics**: Curriculum effectiveness and optimization
- **Performance Trends**: Pattern accuracy and concept mastery rates
- **Knowledge Evolution**: Growth tracking and gap analysis

## Quick Start

### Prerequisites

- Node.js 20.x LTS
- Neo4j 5.x
- Qdrant 1.7+
- Redis 7.2+
- Docker & Docker Compose

### Installation

```bash
# Clone repository
git clone <repository-url>
cd backend/services/knowledge-graph

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Start dependencies with Docker
docker-compose up -d neo4j qdrant redis

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

### Environment Variables

```env
# Database Configuration
NEO4J_URL=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# Vector Database
QDRANT_URL=http://localhost:6333

# Cache
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# External Services
DSPY_SERVICE_URL=http://localhost:3004

# Service Configuration
PORT=3007
NODE_ENV=development
LOG_LEVEL=info
```

## API Documentation

### REST API

The service provides comprehensive REST endpoints:

- **Knowledge Graph**: `/api/knowledge-graph/*`
- **Curriculum Learning**: `/api/curriculum/*`
- **Semantic Search**: `/api/search/*`
- **Analytics**: `/api/analytics/*`
- **Knowledge Extraction**: `/api/extraction/*`
- **Graph Inference**: `/api/inference/*`

### GraphQL API

GraphQL endpoint available at `/graphql` with GraphiQL interface in development.

### OpenAPI Documentation

Interactive API documentation available at `/docs` when running the service.

## Usage Examples

### Query Knowledge Graph

```bash
curl -X POST http://localhost:3007/api/knowledge-graph/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "data privacy GDPR",
    "type": "CONCEPT",
    "filters": {
      "category": "DATA_PRIVACY",
      "difficulty_range": [1, 5]
    },
    "limit": 10
  }'
```

### Create Learner Profile

```bash
curl -X POST http://localhost:3007/api/curriculum/learners \
  -H "Content-Type: application/json" \
  -d '{
    "learner_type": "AI_MODEL",
    "current_level": 3,
    "learning_preferences": {
      "preferred_difficulty_progression": "ADAPTIVE",
      "focus_areas": ["DATA_PRIVACY", "LIABILITY"]
    }
  }'
```

### Extract Knowledge from Document

```bash
curl -X POST http://localhost:3007/api/extraction/extract \
  -H "Content-Type: application/json" \
  -d '{
    "document_content": "This privacy policy describes how we collect...",
    "document_type": "PRIVACY_POLICY",
    "extraction_depth": "DETAILED",
    "enable_pattern_matching": true,
    "enable_concept_extraction": true
  }'
```

### Graph-Enhanced Inference

```bash
curl -X POST http://localhost:3007/api/inference/enhanced \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the privacy implications of this clause?",
    "context_type": "LEGAL_REASONING",
    "use_graph_context": true,
    "inference_parameters": {
      "temperature": 0.1,
      "max_tokens": 1024
    }
  }'
```

## Development

### Project Structure

```
src/
├── services/           # Core business logic
│   ├── neo4j-service.ts
│   ├── knowledge-graph-service.ts
│   ├── curriculum-learning-service.ts
│   ├── legal-ontology-service.ts
│   ├── semantic-search-service.ts
│   ├── graph-embeddings-service.ts
│   ├── graph-analytics-service.ts
│   ├── knowledge-extraction-service.ts
│   └── graph-enhanced-inference-service.ts
├── routes/             # API endpoints
│   ├── knowledge-graph.ts
│   ├── curriculum-learning.ts
│   ├── semantic-search.ts
│   ├── analytics.ts
│   ├── knowledge-extraction.ts
│   └── graph-inference.ts
├── graphql/            # GraphQL schema
│   └── schema.ts
├── plugins.ts          # Fastify plugins
└── index.ts           # Application entry point
```

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### Development Commands

```bash
# Development with hot reload
npm run dev

# Build for production
npm run build

# Type checking
npm run type-check

# Linting
npm run lint

# Docker build
npm run docker:build
```

## Deployment

### Docker Deployment

```bash
# Build image
docker build -t fineprintai/knowledge-graph .

# Run with Docker Compose
docker-compose up -d
```

### Kubernetes Deployment

```bash
# Apply manifests
kubectl apply -f k8s/

# Check status
kubectl get pods -n fineprintai
```

### Environment-Specific Configurations

- **Development**: Full logging, GraphiQL enabled, debug features
- **Staging**: Production-like settings with test data
- **Production**: Optimized performance, security hardened, monitoring enabled

## Monitoring & Observability

### Health Checks

- **Basic**: `/health` - Service status
- **Detailed**: `/health/detailed` - Dependencies and performance
- **Readiness**: `/ready` - Kubernetes readiness probe
- **Liveness**: `/live` - Kubernetes liveness probe

### Metrics & Logging

- **Structured Logging**: JSON format with correlation IDs
- **Performance Metrics**: Response times, throughput, error rates
- **Business Metrics**: Knowledge growth, learning effectiveness
- **Graph Analytics**: Node/relationship counts, query performance

### Alerts & Monitoring

Key monitoring points:
- Neo4j connectivity and performance
- Qdrant vector database health
- Memory usage and query performance
- Curriculum learning effectiveness
- Knowledge extraction accuracy

## Configuration

### Neo4j Configuration

```yaml
# Neo4j settings
NEO4J_URL: bolt://neo4j:7687
NEO4J_MAX_CONNECTION_POOL_SIZE: 50
NEO4J_CONNECTION_ACQUISITION_TIMEOUT: 60000
NEO4J_MAX_TRANSACTION_RETRY_TIME: 30000
```

### Performance Tuning

- **Connection Pooling**: Optimized for concurrent requests
- **Query Caching**: Redis-based result caching
- **Batch Processing**: Efficient bulk operations
- **Index Optimization**: Strategic database indexing

## Security

- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Security Headers**: CSRF, XSS, and other protections
- **Authentication**: JWT-based API authentication
- **Data Encryption**: At-rest and in-transit encryption

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- Comprehensive JSDoc documentation
- Test coverage > 80%

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: Available in `/docs` directory
- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Email**: support@fineprintai.com

---

**Fine Print AI Knowledge Graph Service** - Empowering legal document analysis with advanced AI and knowledge representation.