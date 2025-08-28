# Agent Orchestration System

The Agent Orchestration System is the central coordination hub for Fine Print AI's multi-agent architecture. It provides comprehensive workflow management, intelligent decision-making, resource allocation, and real-time monitoring capabilities.

## 🚀 Features

### Core Capabilities
- **Multi-Agent Coordination**: Seamlessly coordinate 10+ specialized AI agents
- **Workflow Orchestration**: Visual workflow builder with complex conditional logic
- **Event-Driven Communication**: High-performance message bus with guaranteed delivery
- **Intelligent Decision Making**: Multi-criteria decision engine with conflict resolution
- **Resource Management**: Intelligent allocation and auto-scaling of compute resources
- **Real-Time Monitoring**: Comprehensive observability and alerting system
- **Business Process Automation**: End-to-end process templates and optimization

### Advanced Features
- **Visual Workflow Builder**: Drag-and-drop interface for complex workflows
- **Conflict Resolution**: Automated handling of resource and priority conflicts
- **Escalation Policies**: Human-in-the-loop for critical decisions
- **Cost Optimization**: Intelligent resource allocation for cost efficiency
- **Performance Analytics**: Detailed metrics and trend analysis
- **Audit Trail**: Complete decision and action logging for compliance

## 🎯 Supported Agents

The orchestration system coordinates the following Fine Print AI agents:

### Core Development Agents
- **Full-Stack Development Agent**: Code generation and architecture decisions
- **AI/ML Engineering Agent**: Model lifecycle and deployment automation
- **UI/UX Design Agent**: Design system and component generation
- **DevOps Agent**: Infrastructure and deployment automation

### AI Framework Agents
- **DSPy Framework**: Prompt optimization and systematic reasoning
- **Gated LoRA System**: Efficient model fine-tuning
- **Knowledge Graph System**: Structured knowledge management
- **Enhanced Ollama Service**: Advanced AI inference with integrations

### Business Operation Agents
- **Sales Agent**: Lead generation and pipeline automation
- **Customer Success Agent**: Onboarding and retention workflows
- **Content Marketing Agent**: Content creation and distribution
- **Legal Compliance Agent**: Regulatory compliance automation

## 📋 Prerequisites

- Node.js 20+ LTS
- Redis 7.2+
- PostgreSQL 16+
- Docker (optional)

## 🛠 Installation

### 1. Clone and Install Dependencies

```bash
cd backend/services/agent-orchestration
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 3. Database Setup

```bash
# Run database migrations
npm run db:migrate

# Seed initial data
npm run db:seed
```

### 4. Redis Setup

```bash
# Start Redis (if not using Docker)
redis-server

# Or with Docker
docker run -d --name redis -p 6379:6379 redis:7.2-alpine
```

### 5. Start the Service

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

## 🐳 Docker Deployment

### Build Image

```bash
docker build -t fineprintai/agent-orchestration .
```

### Run Container

```bash
docker run -d \
  --name agent-orchestration \
  -p 3010:3010 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/orchestration \
  -e REDIS_HOST=redis \
  fineprintai/agent-orchestration
```

### Docker Compose

```yaml
version: '3.8'
services:
  orchestration:
    build: .
    ports:
      - "3010:3010"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/orchestration
      - REDIS_HOST=redis
    depends_on:
      - db
      - redis

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: orchestration
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7.2-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 🔧 Configuration

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `3010` |
| `NODE_ENV` | Environment | `development` |
| `JWT_SECRET` | JWT signing secret | Required |

### Agent Communication

| Variable | Description | Default |
|----------|-------------|---------|
| `COMM_MAX_MESSAGE_SIZE` | Max message size (bytes) | `5242880` |
| `COMM_ENCRYPTION` | Enable message encryption | `true` |
| `COMM_COMPRESSION` | Enable message compression | `true` |

### Workflow Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `WORKFLOW_MAX_CONCURRENT` | Max concurrent executions | `100` |
| `WORKFLOW_DEFAULT_TIMEOUT` | Default timeout (ms) | `3600000` |
| `WORKFLOW_VISUAL_BUILDER` | Enable visual builder | `true` |

### Decision Engine

| Variable | Description | Default |
|----------|-------------|---------|
| `DECISION_DEFAULT_STRATEGY` | Default decision strategy | `capability_based` |
| `DECISION_ESCALATION` | Enable escalation | `true` |
| `DECISION_AUDIT` | Enable audit logging | `true` |

## 📖 API Documentation

### Authentication

All API endpoints require JWT authentication:

```bash
curl -H "Authorization: Bearer <jwt-token>" \
  http://localhost:3010/api/v1/agents
```

### Key Endpoints

#### Agents
- `GET /api/v1/agents` - List all registered agents
- `POST /api/v1/agents` - Register a new agent
- `GET /api/v1/agents/:id` - Get agent details
- `DELETE /api/v1/agents/:id` - Unregister agent
- `POST /api/v1/agents/search` - Find agents by criteria

#### Workflows
- `GET /api/v1/workflows` - List all workflows
- `POST /api/v1/workflows` - Create new workflow
- `POST /api/v1/workflows/:id/execute` - Execute workflow
- `GET /api/v1/workflows/:id/executions` - Get execution history
- `POST /api/v1/workflows/executions/:id/cancel` - Cancel execution

#### Communication
- `GET /api/v1/communication/stats` - Message bus statistics
- `POST /api/v1/communication/send` - Send test message
- `GET /api/v1/communication/metrics` - Message metrics

#### Decisions
- `GET /api/v1/decisions/metrics` - Decision engine metrics
- `POST /api/v1/decisions/make` - Make a decision
- `GET /api/v1/decisions/policies` - List decision policies

### Interactive Documentation

Access Swagger UI at: `http://localhost:3010/docs`

## 🔍 Monitoring

### Health Checks

```bash
# Basic health
curl http://localhost:3010/health

# Detailed health with component status
curl http://localhost:3010/health/detailed

# Kubernetes liveness probe
curl http://localhost:3010/health/live

# Kubernetes readiness probe
curl http://localhost:3010/health/ready
```

### Metrics

Prometheus metrics available at: `http://localhost:3010/metrics`

Key metrics:
- `orchestration_agents_total` - Total registered agents
- `orchestration_workflows_executed_total` - Workflow executions
- `orchestration_messages_processed_total` - Messages processed
- `orchestration_decisions_made_total` - Decisions made
- `orchestration_response_time_seconds` - Response time histogram

### Logging

Structured JSON logging with contextual information:

```json
{
  "level": "info",
  "time": "2025-01-31T12:00:00.000Z",
  "component": "workflow-engine",
  "message": "Workflow execution started",
  "executionId": "uuid",
  "workflowId": "uuid",
  "triggeredBy": "api"
}
```

## 🔐 Security

### Authentication & Authorization
- JWT-based authentication
- Role-based access control (RBAC)
- Agent authority matrix
- API rate limiting

### Data Protection
- Message encryption (AES-256-GCM)
- Encryption at rest
- Audit logging
- Secure configuration management

### Network Security
- HTTPS/TLS support
- CORS configuration
- Request validation
- Input sanitization

## 🚀 Usage Examples

### Register an Agent

```javascript
const response = await fetch('/api/v1/agents', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'fullstack-agent',
    name: 'Development Agent',
    capabilities: ['code_generation', 'architecture_decisions'],
    endpoint: 'http://localhost:3001',
    priority: 8
  })
});
```

### Create and Execute Workflow

```javascript
// Create workflow
const workflow = await fetch('/api/v1/workflows', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Document Analysis Pipeline',
    trigger: { type: 'api', config: {} },
    tasks: [
      {
        id: 'analyze-document',
        name: 'Analyze Document',
        agentType: 'analysis-agent',
        requiredCapabilities: ['document_analysis'],
        dependencies: []
      },
      {
        id: 'generate-report',
        name: 'Generate Report',
        agentType: 'report-agent',
        requiredCapabilities: ['report_generation'],
        dependencies: ['analyze-document']
      }
    ]
  })
});

// Execute workflow
const execution = await fetch(`/api/v1/workflows/${workflowId}/execute`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    input: { documentUrl: 'https://example.com/document.pdf' },
    priority: 8
  })
});
```

### Make a Decision

```javascript
const decision = await fetch('/api/v1/decisions/make', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    type: 'agent_selection',
    strategy: 'capability_based',
    options: [
      { id: 'agent-1', attributes: { load: 20, performance: 95 } },
      { id: 'agent-2', attributes: { load: 50, performance: 88 } }
    ],
    criteria: [
      { name: 'load', weight: 0.6, type: 'numeric', direction: 'minimize' },
      { name: 'performance', weight: 0.4, type: 'numeric', direction: 'maximize' }
    ]
  })
});
```

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### Test Categories

1. **Unit Tests**: Individual component testing
2. **Integration Tests**: Service interaction testing
3. **API Tests**: REST endpoint testing
4. **Performance Tests**: Load and stress testing
5. **Security Tests**: Authentication and authorization testing

## 📈 Performance

### Benchmarks

- **Agent Registration**: < 10ms
- **Workflow Execution**: < 100ms startup
- **Message Processing**: 10,000+ msgs/sec
- **Decision Making**: < 50ms average
- **Resource Allocation**: < 25ms

### Optimization

- Connection pooling for database and Redis
- Message compression and batching
- Intelligent caching strategies
- Auto-scaling based on load
- Resource usage monitoring

## 🔧 Development

### Project Structure

```
src/
├── config/          # Configuration management
├── services/        # Core orchestration services
│   ├── agent-registry.ts
│   ├── workflow-engine.ts
│   ├── communication-bus.ts
│   ├── decision-engine.ts
│   └── resource-manager.ts
├── routes/          # API route handlers
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Main application entry
```

### Development Workflow

1. **Feature Development**
   ```bash
   git checkout -b feature/new-feature
   npm run dev
   # Make changes and test
   npm test
   ```

2. **Code Quality**
   ```bash
   npm run lint
   npm run type-check
   npm run test:coverage
   ```

3. **Documentation**
   ```bash
   npm run docs:generate
   npm run docs:serve
   ```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Update documentation
6. Submit a pull request

### Code Standards

- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Conventional commits
- 90%+ test coverage

## 📝 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Agent Registration Fails**
```bash
# Check agent endpoint accessibility
curl http://agent-endpoint/health

# Verify agent capabilities match requirements
```

**Workflow Execution Hangs**
```bash
# Check agent availability
curl /api/v1/agents/stats

# Review workflow dependencies
curl /api/v1/workflows/:id
```

**High Memory Usage**
```bash
# Check message queue sizes
curl /api/v1/communication/stats

# Review workflow retention settings
```

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run dev

# Or with specific component debugging
export DEBUG=orchestration:workflow-engine
npm run dev
```

### Support

- 📧 Email: support@fineprintai.com
- 📖 Documentation: https://docs.fineprintai.com
- 🐛 Issues: https://github.com/fineprintai/issues
- 💬 Discord: https://discord.gg/fineprintai

---

**Built with ❤️ by the Fine Print AI Team**