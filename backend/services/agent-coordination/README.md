# Agent Coordination Service - Enhanced with Team Management & Workflow Orchestration

A comprehensive cross-agent coordination and information sharing system for Fine Print AI's autonomous business operations, now enhanced with team-based workflow orchestration and real-time monitoring capabilities.

## Overview

The Agent Coordination Service provides intelligent coordination between AI agents, enabling complex business workflows through automated task assignment, information sharing, and collaborative decision-making. The enhanced version includes:

- **Agent Team Management**: Pre-configured teams for different business operations
- **Workflow Orchestration**: Parallel and sequential execution of complex workflows  
- **Real-time Monitoring**: Comprehensive dashboards and metrics
- **Dynamic Scaling**: Automatic agent assignment and load balancing
- **Business Goal Execution**: High-level API for executing business objectives

## Features

### 🤖 Agent Management
- **Dynamic Registration**: Agents can register and update their capabilities in real-time
- **Health Monitoring**: Continuous health checks with automated status tracking
- **Load Balancing**: Intelligent task assignment based on agent capacity and performance
- **Capability Matching**: Automatic matching of tasks to agents based on required capabilities

### 🔄 Message Coordination
- **Priority Queuing**: Message processing with configurable priority levels
- **Reliable Delivery**: Guaranteed message delivery with retry mechanisms
- **Broadcast Support**: Information sharing across multiple agents
- **Correlation Tracking**: Request-response correlation for complex workflows

### 🧠 Information Sharing
- **Contextual Sharing**: Share information with relevant agents based on business context
- **TTL Management**: Time-to-live for information with automatic cleanup
- **Category-based Routing**: Route information based on categories and tags
- **Business Context Awareness**: Share information based on customer, process, and outcome context

### 🎯 Task Coordination
- **Intelligent Assignment**: Optimal agent selection based on multiple criteria
- **Preference Support**: Honor agent preferences and exclusions
- **Deadline Management**: Task scheduling with deadline awareness
- **Fallback Strategies**: Configurable fallback behavior for task failures

### 📊 Analytics & Monitoring
- **Performance Metrics**: Track agent performance and collaboration effectiveness
- **Collaboration Analysis**: Identify successful collaboration patterns
- **Bottleneck Detection**: Automatic identification of system bottlenecks
- **Business Impact Tracking**: Measure business outcomes from agent coordination
- **Real-time Dashboard**: Live monitoring of all teams and agents
- **Workflow Timeline**: Visual execution timeline with bottleneck identification

### 👥 Team Management (NEW)
- **Pre-configured Teams**: 8 specialized teams for different business operations
- **Dynamic Assignment**: Automatic agent assignment based on availability
- **Load Balancing**: Intelligent workload distribution across team members
- **Team Health Monitoring**: Real-time team status and performance tracking

### 🔄 Workflow Orchestration (NEW)
- **Complex Workflows**: Support for parallel, sequential, and hybrid execution
- **Business Goal API**: High-level API for executing business objectives
- **Multi-team Operations**: Coordinate multiple teams for complex operations
- **Execution Monitoring**: Real-time workflow progress tracking

## Business Use Cases

### Marketing Campaign Coordination
```typescript
// Coordinate multiple agents for campaign analysis
await coordinationHub.coordinateAgents({
  coordinationType: 'collaborative-analysis',
  participants: ['marketing-context-1', 'business-intelligence-1', 'dspy-optimizer-1'],
  objective: 'Analyze and optimize Q4 product launch campaign',
  deadline: new Date(Date.now() + 3600000) // 1 hour
}, 'campaign-manager');
```

### Customer Onboarding Workflow
```typescript
// Share customer information with relevant agents
await coordinationHub.shareInformation({
  category: 'customer-onboarding',
  data: {
    customerId: 'cust-123',
    plan: 'enterprise',
    industry: 'fintech',
    riskProfile: 'medium'
  },
  relevantAgents: ['legal-analysis', 'sales-agent', 'support-agent'],
  businessContext: {
    process: 'onboarding',
    customerId: 'cust-123'
  }
}, 'onboarding-coordinator');
```

### Document Analysis Pipeline
```typescript
// Request document analysis with specific requirements
await coordinationHub.requestTask({
  taskType: 'document-analysis',
  requiredCapabilities: ['legal-analysis', 'risk-scoring', 'pattern-detection'],
  input: {
    documentId: 'doc-456',
    documentType: 'terms-of-service',
    priority: 'high'
  },
  context: {
    businessProcess: 'customer-onboarding',
    customerId: 'cust-123',
    priority: 'high',
    tags: ['legal', 'compliance', 'risk-assessment']
  }
}, 'document-processor');
```

## API Endpoints

### Agent Management
- `POST /api/agents/register` - Register a new agent
- `POST /api/agents/:agentId/heartbeat` - Agent heartbeat
- `GET /api/agents` - Get all registered agents

### Task Coordination
- `POST /api/tasks/request` - Request task execution
- `POST /api/information/share` - Share information between agents
- `POST /api/coordination/request` - Coordinate multi-agent collaboration

### Business Events
- `POST /api/events/broadcast` - Broadcast business events

### Analytics
- `GET /api/analytics` - Get coordination analytics and metrics

### Team Management (NEW)
- `GET /api/teams` - Get all available teams
- `GET /api/teams/:teamId` - Get team details with monitoring
- `POST /api/teams/:teamId/assign` - Assign agents to team
- `POST /api/teams/execute-goal` - Execute business goal with optimal team
- `POST /api/teams/execute-operation` - Execute predefined multi-team operation
- `GET /api/teams/status` - Get all teams status overview
- `POST /api/teams/rebalance` - Rebalance team assignments

### Dashboard & Monitoring (NEW)
- `GET /api/dashboard` - Get complete dashboard metrics
- `GET /api/dashboard/teams/:teamId` - Get team-specific dashboard
- `GET /api/dashboard/workflows/:executionId/timeline` - Get workflow execution timeline
- `GET /api/dashboard/agents/comparison` - Compare agent performance
- `GET /api/dashboard/overview` - Get system overview
- `GET /api/dashboard/performance` - Get performance metrics
- `GET /api/dashboard/alerts` - Get system alerts
- `GET /api/dashboard/export` - Export dashboard data (JSON/CSV)

### Real-time Communication
- `WebSocket /ws/:agentId` - Real-time agent communication
- `WebSocket /ws/teams/:teamId` - Real-time team updates (NEW)
- `WebSocket /ws/dashboard` - Real-time dashboard updates (NEW)

## Configuration

### Environment Variables
```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# Service Configuration
PORT=3014
HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Agent Integration

### Registering an Agent
```typescript
import axios from 'axios';

const agentInfo = {
  id: 'my-agent-1',
  name: 'My Business Agent',
  type: 'custom-agent',
  capabilities: ['data-analysis', 'report-generation'],
  currentLoad: 0,
  maxCapacity: 100,
  status: 'healthy',
  lastHeartbeat: new Date(),
  version: '1.0.0',
  endpoint: 'http://my-agent:3000',
  metadata: {
    specialization: 'financial-analysis',
    cost_per_task: 0.05
  }
};

await axios.post('http://coordination-service:3014/api/agents/register', agentInfo);
```

### WebSocket Connection
```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://coordination-service:3014/ws/my-agent-1');

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received message:', message);
  
  // Handle different message types
  switch (message.type) {
    case 'task-request':
      handleTaskRequest(message);
      break;
    case 'information-share':
      handleInformationShare(message);
      break;
    case 'coordination-request':
      handleCoordinationRequest(message);
      break;
  }
});

// Send heartbeat
setInterval(() => {
  ws.send(JSON.stringify({
    type: 'heartbeat',
    status: {
      currentLoad: getCurrentLoad(),
      status: 'healthy'
    }
  }));
}, 30000);
```

## Coordination Patterns

The service supports predefined coordination patterns for common business workflows:

### Marketing Campaign Analysis
- **Participants**: Marketing Context, Business Intelligence, DSPy Optimizer
- **Workflow**: Data collection → Performance analysis → Optimization recommendations
- **Success Criteria**: Engagement rate, conversion rate, ROI improvements

### Customer Onboarding
- **Participants**: Legal Analysis, Risk Assessment, Account Setup, Notification
- **Workflow**: Document analysis → Risk scoring → Account creation → Welcome communication
- **Success Criteria**: Compliance check, account activation, customer satisfaction

### Sales Lead Processing
- **Participants**: Lead Scoring, Qualification, Assignment, Nurturing
- **Workflow**: Score leads → Qualify prospects → Assign to reps → Automated nurturing
- **Success Criteria**: Conversion rates, sales velocity, pipeline quality

## Performance Metrics

The service tracks comprehensive metrics:

- **Message Volume**: Total messages processed by type and priority
- **Response Times**: Average latency for message processing and task completion
- **Success Rates**: Task completion success rates and error patterns
- **Agent Performance**: Individual agent metrics including load, quality, and availability
- **Business Impact**: Revenue attribution, customer satisfaction, and cost savings

## Deployment

### Docker Compose
```yaml
agent-coordination:
  build:
    context: ./backend/services/agent-coordination
    dockerfile: Dockerfile
  ports:
    - "3014:3014"
  environment:
    - NODE_ENV=production
    - REDIS_HOST=redis
    - REDIS_PORT=6379
    - PORT=3014
  depends_on:
    - redis
  restart: unless-stopped
```

### Health Checks
The service provides comprehensive health checks at `/health` endpoint, monitoring:
- Redis connectivity
- Message queue status
- Active agent count
- System resource usage

## Development

### Demo Mode
In development mode, the service provides demo endpoints:
- `POST /api/demo/register-agents` - Register sample agents
- `POST /api/demo/simulate-events` - Generate sample business events

### Testing
```bash
npm test              # Run unit tests
npm run test:coverage # Run tests with coverage
npm run lint          # Code linting
npm run type-check    # TypeScript type checking
```

## Security

- **Rate Limiting**: 1000 requests per minute per IP
- **CORS Protection**: Configurable origin whitelist
- **Helmet Security**: Security headers and CSP
- **Message Validation**: All messages validated against schemas
- **WebSocket Authentication**: Connection-based agent authentication

## Integration with Fine Print AI Services

The Agent Coordination Service integrates with all Fine Print AI services:

- **DSPy Service**: Coordinate prompt optimization tasks
- **Knowledge Graph**: Share business intelligence and insights
- **Memory Service**: Store coordination patterns and agent context
- **Business Intelligence**: Track coordination impact on business metrics
- **Logger Service**: Comprehensive audit trails and analytics

## Agent Teams

The service includes 8 pre-configured teams:

### 1. Design Team
- **Members**: UI/UX Designer, Frontend Architect, Accessibility Specialist
- **Capabilities**: UI design, frontend development, user experience, accessibility
- **Coordination**: Parallel execution for rapid prototyping

### 2. Marketing Team  
- **Members**: Content Manager, Analytics Engineer, Email Engineer, Marketing Context
- **Capabilities**: Content marketing, analytics, email campaigns, SEO
- **Coordination**: Hybrid execution for integrated campaigns

### 3. Development Team
- **Members**: Backend Architect, Database Architect, Performance Engineer, DevOps
- **Capabilities**: Backend development, API development, database management, DevOps
- **Coordination**: Sequential execution for stable deployments

### 4. Security Team
- **Members**: Security Engineer, Auth Security, Security Operations
- **Capabilities**: Security assessment, authentication, threat monitoring, compliance
- **Coordination**: Consensus-based for security decisions

### 5. Mobile Team
- **Members**: Mobile Developer, Mobile Debug Specialist, QA Automation
- **Capabilities**: Mobile development, cross-platform, mobile testing, app deployment
- **Coordination**: Sequential for quality assurance

### 6. Business Operations Team
- **Members**: Business Intelligence, Payment Integration, Integration Platform, Knowledge Graph
- **Capabilities**: Business analytics, payment processing, integrations, reporting
- **Coordination**: Pipeline execution for data flow

### 7. Legal Compliance Team
- **Members**: Legal Analysis, Legal Compliance, Document Processing
- **Capabilities**: Legal analysis, compliance, document processing, risk assessment
- **Coordination**: Sequential for thorough review

### 8. Data Pipeline Team
- **Members**: Data Pipeline, Database Architect, Analytics Implementation
- **Capabilities**: Data processing, ETL, analytics, real-time processing
- **Coordination**: Pipeline execution for data transformation

## Enhanced Workflow Examples

### Execute Business Goal
```javascript
POST /api/teams/execute-goal
{
  "businessGoal": "Launch comprehensive marketing campaign for Q4 product release",
  "requirements": {
    "capabilities": ["content-creation", "analytics", "email-marketing", "seo"],
    "priority": "high",
    "deadline": "2024-12-01T00:00:00Z",
    "budget": 50000
  }
}
```

### Multi-Team Product Launch
```javascript
POST /api/teams/execute-operation
{
  "operationType": "PRODUCT_LAUNCH",
  "context": {
    "productName": "Fine Print Pro",
    "features": ["AI Analysis", "Real-time Monitoring", "Compliance Tracking"],
    "targetMarket": "Enterprise B2B",
    "launchDate": "2024-11-15"
  }
}
```

### Team-Specific Execution
```javascript
POST /api/teams/development-team/execute
{
  "businessGoal": "Implement new API endpoints for document analysis",
  "context": {
    "apiVersion": "v2",
    "requirements": ["REST", "GraphQL", "WebSocket"],
    "performanceTargets": {
      "responseTime": "< 200ms",
      "throughput": "> 1000 req/s"
    }
  }
}
```

## Monitoring Dashboard

The enhanced service includes a comprehensive monitoring dashboard providing:

### System Overview
- Total teams and active teams
- Agent utilization across all teams
- System health status
- Active workflows and executions

### Team Metrics
- Real-time execution status
- Success rates and performance trends
- Agent utilization per team
- Queue depths and bottlenecks

### Workflow Analytics
- Execution timelines with step durations
- Critical path analysis
- Bottleneck identification
- Optimization recommendations

### Performance Metrics
- Throughput (current, average, peak)
- Latency percentiles (p50, p95, p99)
- Error rates and patterns
- Resource utilization

## WebSocket Real-time Updates

### Team Updates
```javascript
// Connect to team WebSocket
const ws = new WebSocket('ws://localhost:3014/ws/teams/development-team');

ws.on('message', (data) => {
  const update = JSON.parse(data);
  // Handle team-assigned, workflow-started, step-completed, metrics-updated
});
```

### Dashboard Updates
```javascript
// Connect to dashboard WebSocket
const ws = new WebSocket('ws://localhost:3014/ws/dashboard');

// Subscribe to specific team
ws.send(JSON.stringify({
  type: 'subscribe-team',
  teamId: 'marketing-team'
}));

// Subscribe to workflow
ws.send(JSON.stringify({
  type: 'subscribe-workflow',
  executionId: 'workflow-123'
}));
```

## Advanced Features

### Dynamic Team Creation
Create custom teams for specific business needs:
```javascript
const customTeam = {
  id: 'custom-analysis-team',
  name: 'Custom Analysis Team',
  members: [
    { agentType: 'legal-analysis', role: 'leader' },
    { agentType: 'business-intelligence', role: 'coordinator' },
    { agentType: 'knowledge-graph', role: 'specialist' }
  ],
  coordinationType: 'collaborative'
};
```

### Workflow Templates
Use predefined workflow templates:
- **PRODUCT_LAUNCH**: Coordinates design, development, marketing, and security teams
- **SECURITY_AUDIT**: Sequential security review across all systems
- **MARKETING_CAMPAIGN**: Hybrid content creation and distribution
- **FEATURE_DEVELOPMENT**: End-to-end feature implementation
- **COMPLIANCE_REVIEW**: Thorough compliance verification

### Cost Optimization
- Automatic agent scaling based on workload
- Resource pooling across teams
- Idle agent detection and reassignment
- Cost-per-task tracking and optimization

This enhanced service acts as the central nervous system for Fine Print AI's autonomous business operations, enabling intelligent coordination and collaboration between all AI agents through team-based workflows and comprehensive monitoring.