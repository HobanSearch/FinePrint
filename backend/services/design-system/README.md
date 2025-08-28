# Fine Print AI - Design System Service

An autonomous, AI-powered design system and component generation platform that manages the entire design lifecycle from user research to component implementation.

## 🎯 Overview

The Design System Service is a comprehensive microservice that provides:

- **Design System Management**: Centralized token, theme, and component management
- **Autonomous Component Generation**: AI-powered component creation for React, Vue, Angular, and React Native
- **UX Analytics Engine**: Advanced user behavior analysis and optimization
- **Accessibility Assistant**: WCAG 2.1 AA compliance automation
- **Figma Integration**: Seamless design-to-code pipeline
- **A/B Testing Framework**: Automated UI variant testing and optimization

## 🚀 Quick Start

### Prerequisites

- Node.js 20+ LTS
- PostgreSQL 16+
- Redis 7.2+
- Docker (optional)

### Development Setup

```bash
# Clone and install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Start development server
npm run dev

# The service will be available at http://localhost:3005
# API documentation at http://localhost:3005/docs
```

### Docker Setup

```bash
# Development
docker build --target dev -t design-system-service:dev .
docker run -p 3005:3005 design-system-service:dev

# Production
docker build --target production -t design-system-service:prod .
docker run -p 3005:3005 design-system-service:prod
```

## 📚 API Documentation

The service provides a comprehensive REST API with the following endpoints:

### Design System Management
- `POST /api/v1/design-system/tokens` - Create design tokens
- `GET /api/v1/design-system/tokens/:id` - Get design token
- `PUT /api/v1/design-system/tokens/:id` - Update design token
- `GET /api/v1/design-system/tokens/search` - Search tokens
- `POST /api/v1/design-system/themes` - Create themes
- `POST /api/v1/design-system/components` - Create components
- `POST /api/v1/design-system/systems/:id/export` - Export design system

### Component Generation
- `POST /api/v1/generate/component` - Generate single component
- `POST /api/v1/generate/batch` - Generate multiple components
- `POST /api/v1/generate/variant` - Generate component variant
- `GET /api/v1/generate/templates` - List available templates
- `POST /api/v1/generate/preview` - Preview component
- `POST /api/v1/generate/validate` - Validate component spec

### UX Analytics
- `POST /api/v1/analytics/events` - Track user events
- `POST /api/v1/analytics/performance` - Track performance metrics
- `GET /api/v1/analytics/heatmap` - Generate heatmaps
- `GET /api/v1/analytics/funnel` - Analyze conversion funnels
- `GET /api/v1/analytics/journey/:sessionId` - Map user journeys
- `GET /api/v1/analytics/insights` - Get UX insights

### Accessibility
- `POST /api/v1/accessibility/audit` - Comprehensive accessibility audit
- `POST /api/v1/accessibility/contrast` - Color contrast analysis
- `POST /api/v1/accessibility/keyboard` - Keyboard navigation analysis
- `POST /api/v1/accessibility/screen-reader` - Screen reader optimization
- `POST /api/v1/accessibility/fix` - Apply automated fixes

### Figma Integration
- `POST /api/v1/figma/extract` - Extract from Figma file
- `POST /api/v1/figma/sync` - Sync design system
- `POST /api/v1/figma/webhooks` - Handle Figma webhooks
- `GET /api/v1/figma/assets/:fileKey` - Download assets

### A/B Testing
- `POST /api/v1/ab-testing/tests` - Create A/B tests
- `POST /api/v1/ab-testing/tests/:id/start` - Start test
- `POST /api/v1/ab-testing/tests/:id/stop` - Stop test
- `POST /api/v1/ab-testing/assign` - Assign user to variant
- `POST /api/v1/ab-testing/track` - Track conversion events
- `GET /api/v1/ab-testing/results/:id` - Analyze test results

## 🏗️ Architecture

### Core Components

1. **Design System Engine** (`src/engines/design-system-engine.ts`)
   - Manages design tokens, themes, and components
   - Provides caching and real-time updates
   - Handles cross-platform token distribution

2. **Component Generator** (`src/generators/component-generator.ts`)
   - AI-powered component generation
   - Multi-framework support (React, Vue, Angular, React Native)
   - Automatic accessibility enhancements
   - Template-based generation

3. **UX Analytics Engine** (`src/analytics/ux-analytics-engine.ts`)
   - Real-time event tracking and processing
   - Heatmap and user journey analysis
   - Performance metrics collection
   - Automated insight generation

4. **Accessibility Assistant** (`src/accessibility/accessibility-assistant.ts`)
   - WCAG 2.1 AA compliance checking
   - Automated accessibility fixes
   - Color contrast analysis
   - Keyboard navigation testing

5. **Figma Integration** (`src/integrations/figma-integration.ts`)
   - Design asset extraction
   - Token synchronization
   - Webhook handling for real-time updates
   - Component mapping between Figma and code

6. **A/B Testing Framework** (`src/analytics/ab-testing-framework.ts`)
   - Statistical significance testing
   - Automated winner selection
   - Multi-variant support
   - Real-time performance tracking

### Database Schema

The service uses PostgreSQL with the following main tables:

```sql
-- Design tokens
CREATE TABLE design_tokens (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  value JSONB NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- UX events
CREATE TABLE ux_events (
  id VARCHAR(255) PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255),
  event_type VARCHAR(50) NOT NULL,
  element JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL
);

-- A/B tests
CREATE TABLE ab_tests (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  variants JSONB NOT NULL,
  metrics JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 🔧 Configuration

Environment variables:

```env
# Server
DESIGN_SYSTEM_PORT=3005
DESIGN_SYSTEM_HOST=0.0.0.0
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/fineprint_design

# Redis
REDIS_URL=redis://localhost:6379
REDIS_KEY_PREFIX=fineprint:design:

# Figma Integration
FIGMA_ACCESS_TOKEN=your_figma_token
FIGMA_WEBHOOK_SECRET=your_webhook_secret

# AI/ML
OLLAMA_URL=http://localhost:11434
OLLAMA_DEFAULT_MODEL=mistral:7b

# Security
API_KEYS=key1,key2,key3
ENABLE_API_KEY_AUTH=true
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:accessibility

# Run performance tests
npm run test:performance
```

## 📊 Monitoring & Observability

The service includes comprehensive monitoring:

- **Health Checks**: `/health` endpoint with service status
- **Metrics**: Prometheus-compatible metrics at `/metrics`
- **Logging**: Structured JSON logging with correlation IDs
- **Tracing**: Distributed tracing support
- **WebSocket**: Real-time updates and monitoring

### Key Metrics

- Component generation success rate
- Design token usage statistics
- Accessibility compliance scores  
- A/B test performance metrics
- API response times and error rates

## 🔒 Security

- API key authentication
- JWT token support
- Rate limiting (1000 requests/minute by default)
- CORS configuration
- Input validation with Zod schemas
- SQL injection prevention
- XSS protection headers

## 🚀 Deployment

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: design-system-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: design-system-service
  template:
    metadata:
      labels:
        app: design-system-service
    spec:
      containers:
      - name: design-system-service
        image: fineprint/design-system-service:latest
        ports:
        - containerPort: 3005
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: url
```

### Docker Compose

```yaml
version: '3.8'
services:
  design-system-service:
    build: .
    ports:
      - "3005:3005"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/fineprint
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and add tests
4. Ensure all tests pass: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Guidelines

- Follow TypeScript best practices
- Maintain 80%+ test coverage
- Use conventional commit messages
- Ensure accessibility compliance
- Document new features and APIs

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🔗 Links

- [Design System Documentation](https://docs.fineprint.ai/design-system)
- [API Reference](https://api.fineprint.ai/design-system/docs)
- [Fine Print AI Platform](https://app.fineprint.ai)
- [Contributing Guide](CONTRIBUTING.md)

---

**Fine Print AI Design System Service v1.0.0**  
Built with TypeScript, Fastify, and AI-powered automation for accessible, cross-platform design systems.