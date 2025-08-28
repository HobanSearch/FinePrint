# Fine Print AI Notification Service

A comprehensive, production-ready notification service that provides multi-channel delivery, user preference management, A/B testing, and real-time tracking capabilities.

## Features

### Core Functionality
- **Multi-channel notifications**: Email, Push, Webhook, In-app
- **SendGrid/SES integration** with template management
- **User preference management** with GDPR compliance
- **Notification batching** and priority queues
- **A/B testing** for notification optimization
- **Delivery tracking** and retry mechanisms
- **Real-time WebSocket** updates
- **Comprehensive analytics** and metrics

### Email Features
- MJML template support with Handlebars
- SendGrid and AWS SES provider support
- Email deliverability tracking
- Unsubscribe handling
- Bounce and complaint management
- Template A/B testing
- CSS inlining for better email client support

### User Management
- GDPR-compliant consent management
- Granular notification preferences
- Quiet hours support with timezone handling
- Batch notification preferences
- Data export and deletion (right to be forgotten)
- Unsubscribe tracking and management

### Scalability & Performance
- BullMQ-based queue system with Redis
- Priority-based notification processing
- Automatic retry with exponential backoff
- Rate limiting and throttling
- Horizontal scaling support
- Circuit breaker patterns

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│ Notification API │───▶│   Queue System  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebSocket     │    │   Preferences    │    │    Workers      │
│    Service      │    │     Service      │    │   (BullMQ)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │  Email Service   │    │ Delivery Tracker│
│   Database      │    │ (SendGrid/SES)   │    │   & Analytics   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Getting Started

### Prerequisites
- Node.js 20 LTS
- PostgreSQL 16
- Redis 7.2
- SendGrid API key or AWS SES credentials

### Installation

1. **Install dependencies**:
```bash
npm install
```

2. **Set up environment variables**:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Set up database**:
```bash
npx prisma generate
npx prisma db push
```

4. **Start development server**:
```bash
npm run dev
```

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/notifications"

# Redis
REDIS_URL="redis://localhost:6379"

# Email Configuration
EMAIL_PROVIDER="sendgrid" # or "ses"
SENDGRID_API_KEY="your_sendgrid_key"
AWS_ACCESS_KEY_ID="your_aws_key"
AWS_SECRET_ACCESS_KEY="your_aws_secret"
AWS_REGION="us-east-1"

# VAPID Keys for Push Notifications
VAPID_PUBLIC_KEY="your_vapid_public_key"
VAPID_PRIVATE_KEY="your_vapid_private_key"

# JWT Configuration
JWT_SECRET="your_jwt_secret"

# Service Configuration
PORT=3007
NODE_ENV="development"
```

## API Documentation

### Authentication
All endpoints except health checks require JWT authentication via the `Authorization: Bearer <token>` header.

### Core Endpoints

#### Notifications
- `POST /api/v1/notifications` - Create single notification
- `POST /api/v1/notifications/bulk` - Create bulk notifications
- `GET /api/v1/notifications` - Get user notifications
- `PUT /api/v1/notifications/:id/read` - Mark as read
- `GET /api/v1/notifications/stats` - Get notification statistics

#### Preferences
- `GET /api/v1/preferences` - Get user preferences
- `PUT /api/v1/preferences` - Update preferences
- `POST /api/v1/preferences/consent` - Update consent
- `POST /api/v1/preferences/unsubscribe` - Unsubscribe
- `GET /api/v1/preferences/export` - Export user data (GDPR)
- `DELETE /api/v1/preferences/data` - Delete user data (GDPR)

#### Templates
- `GET /api/v1/templates` - List templates
- `POST /api/v1/templates` - Create template
- `PUT /api/v1/templates/:id` - Update template
- `DELETE /api/v1/templates/:id` - Delete template

#### A/B Testing
- `GET /api/v1/ab-tests` - List A/B tests
- `POST /api/v1/ab-tests` - Create A/B test
- `PUT /api/v1/ab-tests/:id` - Update A/B test
- `POST /api/v1/ab-tests/:id/start` - Start test
- `POST /api/v1/ab-tests/:id/complete` - Complete test

#### Health & Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed service health
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/metrics` - Prometheus metrics

### WebSocket Events

Connect to `/ws` with JWT authentication:

```javascript
const socket = io('ws://localhost:3007', {
  auth: { token: 'your_jwt_token' }
});

// Listen for events
socket.on('notification:new', (notification) => {
  console.log('New notification:', notification);
});

socket.on('notification:update', (update) => {
  console.log('Notification update:', update);
});

// Send events
socket.emit('notification:read', { notificationId: 'abc123' });
```

## Usage Examples

### Creating a Notification

```javascript
const response = await fetch('/api/v1/notifications', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: 'user123',
    type: 'analysis_complete',
    title: 'Document Analysis Complete',
    message: 'Your document analysis has finished processing.',
    data: {
      documentId: 'doc456',
      riskScore: 85
    },
    actionUrl: 'https://app.fineprintai.com/documents/doc456',
    channels: [
      { type: 'email', config: {} },
      { type: 'push', config: {} },
      { type: 'in_app', config: {} }
    ]
  })
});
```

### Bulk Notifications

```javascript
const response = await fetch('/api/v1/notifications/bulk', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userIds: ['user1', 'user2', 'user3'],
    type: 'system_alert', 
    title: 'Scheduled Maintenance',
    message: 'The system will be under maintenance tonight.',
    channels: [{ type: 'email', config: {} }],
    batchSize: 50
  })
});
```

### Updating User Preferences

```javascript
const response = await fetch('/api/v1/preferences', {
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    emailEnabled: true,
    pushEnabled: false,
    analysisComplete: true,
    marketingEmails: false,
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    timezone: 'America/New_York'
  })
});
```

## Template System

### MJML Email Templates

Create responsive email templates using MJML:

```mjml
<mjml>
  <mj-body>
    <mj-section>
      <mj-column>
        <mj-text>
          <h1>{{title}}</h1>
          <p>Hello {{user.firstName}},</p>
          <p>{{message}}</p>
          {{#if actionUrl}}
          <mj-button href="{{actionUrl}}">View Details</mj-button>
          {{/if}}
        </mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

### Handlebars Helpers

Built-in helpers for template rendering:

- `{{formatDate date "MM/DD/YYYY"}}` - Date formatting
- `{{formatCurrency amount "USD"}}` - Currency formatting
- `{{truncate text 100}}` - Text truncation
- `{{ifEquals arg1 arg2}}` - Conditional rendering
- `{{encodeUrl url}}` - URL encoding

## A/B Testing

### Creating A/B Tests

```javascript
const abTest = {
  name: 'Subject Line Test',
  testType: 'subject',
  variants: [
    {
      id: 'variant_a',
      name: 'Control',
      weight: 50,
      config: {
        subject: 'Your document analysis is ready'
      }
    },
    {
      id: 'variant_b', 
      name: 'Variant',
      weight: 50,
      config: {
        subject: '🚨 Important: Your document analysis results'
      }
    }
  ],
  primaryMetric: 'open_rate',
  trafficSplit: { variant_a: 50, variant_b: 50 }
};
```

## Monitoring & Analytics

### Metrics Available

- **Delivery Metrics**: Sent, delivered, bounced, failed rates
- **Engagement Metrics**: Open rates, click rates, conversion rates
- **Performance Metrics**: Processing times, queue depths, error rates
- **User Metrics**: Active users, preference distributions, engagement patterns

### Prometheus Integration

The service exposes metrics at `/health/metrics` in Prometheus format:

```
notification_total{status="sent"} 1500
notification_total{status="failed"} 25
delivery_rate 94.5
open_rate 23.8
click_rate 4.2
```

## Security Features

- **JWT Authentication** for all API endpoints
- **Rate limiting** to prevent abuse
- **Input validation** with Zod schemas
- **SQL injection protection** via Prisma ORM
- **CORS configuration** for web clients
- **Security headers** via Helmet.js
- **Webhook signature verification**
- **GDPR compliance** features

## Deployment

### Docker

```bash
# Build image
docker build -t notification-service .

# Run container
docker run -p 3007:3007 \
  -e DATABASE_URL="postgresql://..." \
  -e REDIS_URL="redis://..." \
  -e SENDGRID_API_KEY="..." \
  notification-service
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: notification-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: notification-service
  template:
    metadata:
      labels:
        app: notification-service
    spec:
      containers:
      - name: notification-service
        image: notification-service:latest
        ports:
        - containerPort: 3007
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: notification-secrets
              key: database-url
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3007
        readinessProbe:
          httpGet:
            path: /health/ready 
            port: 3007
```

## Development

### Project Structure

```
src/
├── index.ts              # Main server entry point
├── plugins.ts            # Fastify plugins setup
├── routes/               # API route handlers
│   ├── index.ts
│   ├── notifications.ts
│   ├── preferences.ts
│   ├── templates.ts
│   ├── delivery.ts
│   ├── abTests.ts
│   ├── webhooks.ts
│   └── health.ts
├── services/             # Core business logic
│   ├── notificationService.ts
│   ├── emailService.ts
│   ├── webhookService.ts
│   ├── pushService.ts
│   ├── preferenceService.ts
│   ├── templateService.ts
│   ├── deliveryTracker.ts
│   ├── abTestService.ts
│   └── websocketService.ts
├── workers/              # Background job processors
│   └── index.ts
└── __tests__/            # Test files
```

### Running Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Test coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Build
npm run build
```

## Contributing

1. Follow the existing code style and patterns
2. Add tests for new features
3. Update documentation as needed
4. Ensure all tests pass
5. Follow semantic versioning for releases

## License

This notification service is part of the Fine Print AI platform and is proprietary software.

## Support

For technical support or questions:
- Create an issue in the project repository
- Contact the development team
- Check the documentation at `/docs` when running the service